import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { closeTestApp } from "./cleanup";

// Invoked twice around a real replacement: old installed app seeds the project
// and profile; the new installed app opens exactly those same files.
test("previous installed release preserves settings, project identity and rules through upgrade", async () => {
  const stage = process.env.HAICOMO_UPGRADE_STAGE;
  test.skip(!stage, "Requires a previous-release installation and an explicit upgrade stage");
  const root = process.env.HAICOMO_UPGRADE_ROOT!;
  expect(path.isAbsolute(root)).toBe(true);
  expect(["seed", "check"]).toContain(stage);
  const project = path.join(root, "project"), profile = path.join(root, "profile"), evidence = path.join(root, "seed.json");
  if (stage === "seed") {
    expect(fs.existsSync(evidence)).toBe(false);
    fs.mkdirSync(project, { recursive: true });
  }
  const app = await electron.launch({ executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE!, args: [], env: {
    ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: profile, HAICOMO_TEST_DIRECTORY: project,
  } });
  const page = await app.firstWindow();
  const rules = "# Synthetic upgrade rules\r\nPreserve these exact bytes.\r\n";
  try {
    await expect(page.locator(".workspace-frame:not([hidden])")).toBeVisible();
    if (stage === "seed") {
      const seeded = await page.evaluate(async () => {
        const b = await window.haicomo.request("bootstrap");
        await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, userName: "Synthetic upgrade reviewer", locale: "en-GB", theme: "dark" } });
        const w = await window.haicomo.request("project.create", { title: "Upgrade sample" });
        const after = await window.haicomo.request("project.command", { binding: w.binding, id: crypto.randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: "upgrade-task", expectedRevision: null, values: { title: "Retained upgrade task", description: "Synthetic retained description", artifacts: [{ id: "retained-file", label: "Retained file", path: "retained.txt" }] } } });
        return { id: after.state.id, epoch: after.state.epoch, tasks: after.state.tasks, entry: w.entryPath.split(/[\\/]/).pop(), version: b.version };
      });
      expect(seeded.version).toBe(process.platform === "darwin" ? "0.3.3" : "0.3.4");
      fs.writeFileSync(path.join(project, "retained.txt"), "Synthetic delivery survives upgrade and uninstall.\n");
      fs.writeFileSync(evidence, JSON.stringify(seeded));
    } else {
      const seeded = JSON.parse(fs.readFileSync(evidence, "utf8"));
      const opened = await page.evaluate(async (entry) => {
        const b = await window.haicomo.request("bootstrap");
        const w = await window.haicomo.request("project.open", { entryPath: entry });
        return { settings: b.settings, version: b.version, state: w.state, guideError: w.agentGuideError };
      }, path.join(project, seeded.entry));
      expect(opened.settings).toMatchObject({ userName: "Synthetic upgrade reviewer", locale: "en-GB", theme: "dark" });
      expect(opened.state.id).toBe(seeded.id); expect(opened.state.epoch).toBe(seeded.epoch);
      expect(opened.state.tasks).toEqual(seeded.tasks);
      expect(opened.guideError).toBeUndefined();
      for (const file of ["AGENTS.md", ".haicomo/AGENTS.md"]) expect(fs.readFileSync(path.join(project, file), "utf8")).toBe(rules);
      expect(fs.readFileSync(path.join(project, "retained.txt"), "utf8")).toContain("survives upgrade");
      fs.writeFileSync(path.join(root, "result.json"), JSON.stringify({ fromVersion: seeded.version, toVersion: opened.version, project: true, settings: true, rules: true, launch: true }, null, 2));
    }
  } finally { await closeTestApp(app); }
  // Older builds rewrite their generated AGENTS on open; customise only after
  // their process closes, then prove the new release preserves the custom file.
  if (stage === "seed") for (const file of ["AGENTS.md", ".haicomo/AGENTS.md"]) fs.writeFileSync(path.join(project, file), rules);
});
