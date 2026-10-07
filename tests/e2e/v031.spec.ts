import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDemo } from "../../scripts/create-demo";
import { defaultSettings } from "../../src/shared/settings";
import { readSnapshot } from "../../src/core/files";
import { ProjectStore } from "../../src/core/store";
import { dictionaries } from "../../src/ui/i18n";

const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

test("Public demo: 60 tasks, graphs, assets, audit deletion and four locales", async () => {
  test.setTimeout(180000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-public-demo-")), directory = path.join(root, "Demo");
  const entry = createDemo(directory);
  fs.mkdirSync(path.join(root, "profile"));
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, locale: "en-GB", userName: "Demo user", theme: "light", reducedMotion: true }));
  const screenshots = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? `validation/${version}/screens`);
  fs.mkdirSync(screenshots, { recursive: true });
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: directory } });
  const page = await app.firstWindow(), frame = page.locator(".workspace-frame:not([hidden])"), errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  const change = async (next: Record<string, unknown>) => page.evaluate(async next => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, ...next } }); }, next);
  const nav = async (key: keyof typeof dictionaries["en-GB"]) => { await frame.locator(".sidebar nav").getByTitle(dictionaries["en-GB"][key], { exact: true }).click(); };
  const shot = async (name: string) => { await page.screenshot({ path: path.join(screenshots, name + ".png") }); };
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {}, }, entry), entry);
    await expect(frame.locator(".sidebar-version")).toContainText(`version ${version}`);
    await expect(frame.locator(".sidebar")).not.toContainText("Personal preview");
    await expect(frame.getByRole("heading", { name: "HAICoMo Demo", exact: true })).toBeVisible();
    await nav("taskList"); await expect(frame.locator(".task-row")).toHaveCount(60); await shot("tasks");
    await nav("proposals"); await expect(frame.locator(".proposal-card")).toHaveCount(3); await shot("proposals");
    await nav("timeline"); await shot("timeline");
    for (const key of ["dependencies", "mindmap"] as const) {
      await nav(key); await expect(frame.locator(".graph-node")).toHaveCount(60);
      await expect(frame.locator(".company-mark image").first()).toBeAttached();
      await frame.getByRole("button", { name: "Fit to view", exact: true }).click(); await shot(key);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800));
      await frame.getByRole("button", { name: "Fit to view", exact: true }).click();
      await expect(frame.locator(".graph-node").last()).toBeInViewport();
      await frame.locator(".graph-node").first().focus(); await page.keyboard.press("Enter");
      await expect(frame.locator("dialog.modal")).toBeVisible(); await page.keyboard.press("Escape");
      await expect(frame.locator("dialog.modal")).toHaveCount(0);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    }
    for (const enhanced of [false, true]) {
      await change({ enhanced });
      await nav("office"); await expect(frame.locator(".office-canvas canvas")).toBeVisible();
      await expect.poll(() => frame.locator(".office-canvas").getAttribute("data-office-metrics").then(v => v && JSON.parse(v).enhanced === enhanced ? JSON.parse(v).frames : 0), { timeout: 30000 }).toBeGreaterThan(2);
      await expect.poll(() => page.evaluate(() => [...document.images].filter(i => i.getAttribute("src")?.includes("local-assets") && (!i.complete || !i.naturalWidth)).length)).toBe(0);
      await shot(enhanced ? "studio-enhanced" : "studio-default");
      await nav("analytics"); await shot(enhanced ? "analytics-enhanced" : "analytics-default");
    }
    await nav("relay"); await frame.getByRole("button", { name: dictionaries["en-GB"].relayVisualView, exact: true }).click();
    await expect(frame.locator("img.furniture-desk")).toHaveAttribute("src", /studio-desk.png$/);
    await expect(frame.locator("img.furniture-sofa")).toHaveAttribute("src", /studio-sofa.png$/);
    await expect.poll(() => frame.locator("img.furniture-sofa").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await shot("relay-enhanced"); await change({ theme: "dark" }); await shot("relay-dark"); await change({ theme: "light" });
    // Empty preview is presentation-only: no agents, relay records or scheduler work.
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const w = await window.haicomo.request("project.view", { binding });
      for (const r of w.state.relays) await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.delete", payload: { relayId: r.id, expectedRevision: r.revision } });
    });
    await expect(frame.locator(".background-entry")).toHaveText("Background tasks · 0");
    for (const enhanced of [false, true]) {
      await change({ enhanced });
      await expect(frame.locator(".relay-empty-preview .relay-scene")).toHaveCount(2);
      await expect(frame.locator(".relay-actor")).toHaveCount(0);
      await expect(frame.locator(".relay-empty-preview")).toContainText(dictionaries["en-GB"].relayEmptyHint);
      if (enhanced) await expect.poll(() => frame.locator("img.furniture-sofa").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      await shot(enhanced ? "relay-preview-enhanced" : "relay-preview-default");
    }
    await frame.getByRole("button", { name: dictionaries["en-GB"].relayTextView, exact: true }).click();
    await expect(frame.locator(".relay-scene")).toHaveCount(0);
    await expect(frame.locator(".empty")).toContainText(dictionaries["en-GB"].relayEmpty);
    expect(readSnapshot(directory).relays).toHaveLength(0);
    await nav("history"); const before = readSnapshot(directory);
    const rows = frame.locator(".history-panel details"); await expect(rows).toHaveCount(30); const beforeRows = await rows.count();
    await rows.first().getByRole("button", { name: "Delete activity record" }).click();
    await expect(frame.locator("dialog.modal")).toContainText("does not undo");
    await frame.locator("dialog.modal").getByRole("button", { name: "Cancel", exact: true }).click(); await expect(rows).toHaveCount(beforeRows);
    await rows.first().getByRole("button", { name: "Delete activity record" }).click();
    await frame.locator("dialog.modal").getByRole("button", { name: "Delete activity record", exact: true }).click();
    await expect(frame.locator("dialog.modal")).toHaveCount(0);
    await expect.poll(() => readSnapshot(directory).revision).toBe(before.revision + 1);
    expect(readSnapshot(directory).tasks).toEqual(before.tasks); expect(readSnapshot(directory).historyStats).toEqual(before.historyStats);
    await shot("activity-delete");
    // Exercise deleting the only item on a final page, then deleting to empty.
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const audit = await window.haicomo.request("project.audit", { binding, page: 0, pageSize: 200 });
      for (const a of audit.items.slice(31)) await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "audit.delete", payload: { auditId: a.id } });
    });
    await expect(frame.locator(".pagination span")).toContainText("1 / 2 · 31");
    await frame.getByRole("button", { name: dictionaries["en-GB"].nextPage, exact: true }).click();
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole("button", { name: "Delete activity record" }).click();
    await frame.locator("dialog.modal").getByRole("button", { name: "Delete activity record", exact: true }).click();
    await expect(frame.locator(".pagination span")).toHaveText("1 / 1 · 30");
    await expect(rows).toHaveCount(30);
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const audit = await window.haicomo.request("project.audit", { binding, page: 0, pageSize: 200 });
      for (const a of audit.items) await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "audit.delete", payload: { auditId: a.id } });
    });
    await expect(frame.locator(".pagination span")).toHaveText("1 / 1 · 0");
    await expect(rows).toHaveCount(0);
    expect(readSnapshot(directory).historyStats).toEqual(before.historyStats);
    for (const locale of ["en-US", "en-GB", "zh-CN", "zh-TW"] as const) {
      await change({ locale });
      await frame.locator(".sidebar-bottom").getByRole("button", { name: dictionaries[locale].settings, exact: true }).click();
      await expect(frame.getByRole("button", { name: dictionaries[locale].githubFeedback })).toBeVisible();
      await expect(frame.locator(".legal-panel")).toContainText("MIT");
    }
    expect(errors).toEqual([]);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
