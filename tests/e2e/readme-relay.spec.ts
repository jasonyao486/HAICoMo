import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDemo } from "../../scripts/create-demo";
import { defaultSettings } from "../../src/shared/settings";
import { fixtureAgent } from "../fixture-agent";
import { dictionaries } from "../../src/ui/i18n";

test("README synthetic relay: Claude working, ChatGPT seated and waiting", async () => {
  test.setTimeout(90000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-readme-relay-"));
  const directory = path.join(root, "Demo"), profile = path.join(root, "profile");
  const entry = createDemo(directory), fake = fixtureAgent(root);
  fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ ...defaultSettings,
    locale: "en-GB", userName: "Demo user", theme: "light", enhanced: true, reducedMotion: true,
    clientPaths: { codex: fake, claude: fake },
  }));
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: profile, HAICOMO_TEST_DIRECTORY: directory } });
  try {
    const page = await app.firstWindow(), frame = page.locator(".workspace-frame:not([hidden])"), errors: string[] = [];
    page.on("pageerror", e => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), entry);
    await expect(frame.getByRole("heading", { name: "HAICoMo Demo", exact: true })).toBeVisible();
    const runId = await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const w = await window.haicomo.request("project.view", { binding });
      for (const r of w.state.relays) await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.delete", payload: { relayId: r.id, expectedRevision: r.revision } });
      const run = await window.haicomo.request("providers.start", { binding, provider: "claude", taskId: "demo-task-3-1", model: "claude-sonnet-4-6", prompt: "readme-relay-hold" });
      await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.create", payload: { enabled: false, values: {
        title: "Synthetic demo: Claude working, ChatGPT waiting", taskId: "demo-task-3-1", referenceTaskId: "demo-task-2", afterSessionId: run.runId,
        trigger: { kind: "delay", ms: 60000 }, handoff: { provider: "codex", model: "gpt-6-astra", effort: "", mode: "", threadId: "", continueThread: false },
        prompt: "Synthetic demonstration only. This paused relay never starts a model account.",
      } } });
      return run.runId;
    });
    await frame.locator(".sidebar nav").getByTitle(dictionaries["en-GB"].relay, { exact: true }).click();
    // The table exposes the observed runner state before switching to the scene.
    await expect(frame.locator(".relay-table")).toContainText(dictionaries["en-GB"].running);
    await frame.getByRole("button", { name: dictionaries["en-GB"].relayVisualView, exact: true }).click();
    await expect(frame.locator(".relay-row.visual")).toHaveAttribute("data-status", "paused");
    await expect(frame.locator(".relay-row.visual")).toHaveAttribute("data-pose", "sit");
    const worker = frame.locator(".workstation.enhanced .relay-actor"), waiting = frame.locator(".sofa.enhanced .relay-actor.seated");
    await expect(worker).toHaveAttribute("title", "Claude");
    await expect(waiting).toHaveAttribute("title", "ChatGPT");
    await expect(worker.locator(".figure-atlas img")).toHaveAttribute("src", /claude-atlas.png$/);
    await expect(waiting.locator(".figure-atlas img")).toHaveAttribute("src", /chatgpt-atlas.png$/);
    await expect.poll(() => page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).length)).toBe(0);
    for (const [actor, scene] of [[worker, frame.locator(".workstation")], [waiting, frame.locator(".sofa")]] as const) {
      const a = (await actor.boundingBox())!, s = (await scene.boundingBox())!;
      expect(a.x).toBeGreaterThanOrEqual(s.x); expect(a.x + a.width).toBeLessThanOrEqual(s.x + s.width);
    }
    const screenshots = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? "validation/0.3.3/screens");
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, "relay-claude-chatgpt.png") });
    await page.evaluate(async runId => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      await window.haicomo.request("providers.cancel", { binding, runId });
    }, runId);
    expect(errors).toEqual([]);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
