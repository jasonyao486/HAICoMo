import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "../../src/core/store";
import { readSnapshot } from "../../src/core/files";
import { dictionaries } from "../../src/ui/i18n";
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const screens = path.resolve("validation/0.2.4/screens");
const keys = ["overview", "taskList", "proposals", "relay", "timeline", "dependencies", "mindmap", "office", "notes", "history", "analytics", "archive"] as const;
async function launch(root: string) {
  return electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: ["--force-device-scale-factor=2"] } : { args: [".", "--force-device-scale-factor=2"] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile") } });
}
test("0.2.4 sidebar order, reserved pages and retained tabs in four locales and two themes", async () => {
  test.setTimeout(120000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-nav-"));
  const dir = path.join(root, "审查示例 Project"); fs.mkdirSync(dir); new ProjectStore(dir, "审查示例").close();
  const before = readSnapshot(dir);
  fs.mkdirSync(screens, { recursive: true });
  const app = await launch(root), page = await app.firstWindow(), current = page.locator(".workspace-frame:not([hidden])");
  const errors: string[] = []; page.on("pageerror", e => errors.push(String(e)));
  try {
    await expect(current.locator(".sidebar nav button")).toHaveCount(12);
    for (const button of await current.locator(".sidebar nav button").all()) await expect(button).toBeDisabled();
    await page.screenshot({ path: path.join(screens, "home.png") });
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(dir, "HAICoMo.haicomo"));
    await expect(current.getByRole("heading", { name: "审查示例", exact: true })).toBeVisible();
    for (const locale of ["zh-CN", "zh-TW", "en-US", "en-GB"] as const) for (const theme of ["light", "dark"] as const) {
      const d = dictionaries[locale];
      await page.evaluate(async next => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, ...next } }); }, { locale, theme });
      await expect(current.locator(".sidebar nav button span")).toHaveText(keys.map(k => d[k]));
      expect(await current.locator(".sidebar nav button").evaluateAll(bs => bs.map(b => b.getAttribute("title")))).toEqual(keys.map(k => d[k]));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700));
      for (const key of ["relay"] as const) {
        await current.locator(".sidebar nav").getByRole("button", { name: d[key], exact: true }).click();
        await expect(current.locator(".page-heading h1")).toHaveText(d[key]);
        await expect(current.locator(".page-footer")).toHaveCount(0);
        await expect(current.locator(".page-heading button")).toHaveCount(1);
        await expect(current.locator(".task-panel, .timeline, .office-canvas, .records-panel")).toHaveCount(0);
      }
      await page.screenshot({ path: path.join(screens, `sidebar-${locale}-${theme}-2x.png`) });
      await current.locator(".sidebar nav").getByRole("button", { name: d.archive, exact: true }).click();
      await expect(current.locator(".sidebar-bottom").getByRole("button", { name: d.settings, exact: true })).toBeInViewport();
      await current.locator(".sidebar nav").getByRole("button", { name: d.taskList, exact: true }).click();
      await expect(current.locator(".page-heading h1")).toHaveText(d.taskList);
      await expect(current.locator(".breadcrumb")).toContainText(d.taskList);
      await current.locator(".sidebar-version button").click();
      await expect(current.locator(".sidebar nav button span")).toHaveCount(0);
      await expect(current.locator(".sidebar nav button").nth(3)).toHaveAttribute("title", d.relay);
      await current.locator(".sidebar-version button").click();
    }
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, locale: "zh-CN", theme: "light" } }); });
    await current.getByRole("button", { name: "接力任务（实验）", exact: true }).click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+t" : "Control+t");
    await expect(page.locator(".tab-frame")).toHaveCount(2);
    await expect(current.getByRole("button", { name: "新建项目", exact: true })).toBeVisible();
    await page.keyboard.press("Control+Shift+Tab");
    await expect(current.locator(".page-heading h1")).toHaveText("接力任务（实验）");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 950));
    for (const [key, label] of [["tasks", "任务清单"], ["overview", "项目总览"], ["settings", "设置"]]) {
      await current.getByRole("button", { name: label, exact: true }).click();
      await page.screenshot({ path: path.join(screens, `${key}.png`) });
    }
    expect(readSnapshot(dir)).toEqual(before);
    expect(errors).toEqual([]);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("update journal restores reserved scheduled pages onto the relay page without creating work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-reserved-restore-"));
  fs.mkdirSync(path.join(root, "profile"));
  const tabs = ["scheduled", "relay"].map(page => {
    const dir = path.join(root, page); fs.mkdirSync(dir); new ProjectStore(dir, page).close();
    const { id, epoch } = readSnapshot(dir);
    return { entryPath: path.join(dir, "HAICoMo.haicomo"), id, epoch, page, active: page === "scheduled" };
  });
  fs.writeFileSync(path.join(root, "profile/pending-update.json"), JSON.stringify({ from: "0.2.3", target: version, at: new Date().toISOString(), windows: [{ tabs }] }));
  const app = await launch(root), page = await app.firstWindow(), current = page.locator(".workspace-frame:not([hidden])");
  try {
    // Keep the pre-restoration keyboard callback so the render/effect race is
    // reproducible without timing sleeps or dependence on machine speed.
    await page.addInitScript(() => {
      const register = window.addEventListener.bind(window);
      window.addEventListener = ((...args: any[]) => {
        if (args[0] === "keydown" && !(window as any).__initialTabKey) (window as any).__initialTabKey = args[1];
        (register as any)(...args);
      }) as typeof window.addEventListener;
    });
    await page.reload();
    await expect(current.locator(".page-heading h1")).toHaveText("接力任务（实验）");
    await page.keyboard.press("Control+Tab");
    await expect(current.locator(".page-heading h1")).toHaveText("接力任务（实验）");
    await expect(current.locator(".workspace-switch span")).toHaveText("relay");
    await expect(current).toHaveCount(1);
    await page.evaluate(() => (window as any).__initialTabKey(new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true })));
    await expect(current.locator(".page-heading h1")).toHaveText("接力任务（实验）");
    await expect(current.locator(".workspace-switch span")).toHaveText("scheduled");
    await page.keyboard.press("Control+Shift+Tab");
    await expect(current.locator(".workspace-switch span")).toHaveText("relay");
    await expect(current).toHaveCount(1);
    expect((await page.evaluate(() => window.haicomo.request("bootstrap"))).projects).toHaveLength(2);
    for (const tab of tabs) expect(readSnapshot(path.dirname(tab.entryPath)).tasks).toEqual([]);
    expect(fs.existsSync(path.join(root, "profile/pending-update.json"))).toBe(false);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
