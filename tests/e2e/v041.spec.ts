import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDemo } from "../../scripts/create-demo";
import { defaultSettings } from "../../src/shared/settings";
import { dictionaries } from "../../src/ui/i18n";
import { closeTestApp, removeTestDirectory } from "./cleanup";

const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

/** The window itself never scrolls: each page scrolls inside its own workspace frame. */
async function windowLayout(page: Page) {
  return page.evaluate(() => {
    const escaped = [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).position === "absolute" && !el.closest("[hidden]") && (el as HTMLElement).offsetParent === document.body).length;
    return { document: document.documentElement.scrollHeight, viewport: innerHeight, scrollY, escaped };
  });
}

test("0.4.1 settings end with their last section: no blank window scrolling on any page", async () => {
  test.setTimeout(180000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-v041-scroll-")), directory = path.join(root, "Demo");
  const entry = createDemo(directory);
  fs.mkdirSync(path.join(root, "profile"));
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, locale: "en-GB", userName: "Demo user", reducedMotion: true }));
  const screenshots = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? `validation/${version}/screens`);
  fs.mkdirSync(screenshots, { recursive: true });
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: directory } });
  const page = await app.firstWindow(), frame = page.locator(".workspace-frame:not([hidden])");
  const words = dictionaries["en-GB"];
  const change = (next: Record<string, unknown>) => page.evaluate(async (next) => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, ...next } }); }, next);
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800));
    // Home settings (no project), then every page of an open project.
    await frame.getByRole("button", { name: words.settings, exact: true }).click();
    await expect(frame.locator(".legal-panel")).toBeVisible();
    expect(await windowLayout(page)).toMatchObject({ scrollY: 0, escaped: 0 });
    expect((await windowLayout(page)).document).toBeLessThanOrEqual((await windowLayout(page)).viewport);
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), entry);
    // A cold packaged start on a Windows runner can take more than 5 s to open the project.
    await expect(frame.locator(".workspace-switch")).toContainText("HAICoMo Demo", { timeout: 30000 });
    await frame.locator(".sidebar nav").getByTitle(words.overview, { exact: true }).click();
    await expect(frame.getByRole("heading", { name: "HAICoMo Demo", exact: true })).toBeVisible();
    for (const key of ["overview", "taskList", "proposals", "relay", "timeline", "dependencies", "mindmap", "office", "notes", "history", "analytics", "archive", "settings"] as const) {
      const button = key === "settings" ? frame.getByRole("button", { name: words.settings, exact: true }) : frame.locator(".sidebar nav").getByTitle(words[key], { exact: true });
      await button.click();
      await page.waitForTimeout(300);
      const layout = await windowLayout(page);
      expect(layout.escaped, `${key}: elements positioned against the window`).toBe(0);
      expect(layout.document, `${key}: window height`).toBeLessThanOrEqual(layout.viewport);
    }
    // Settings with a project: scroll the page to its end, keep wheeling, then focus the last licence link.
    const legal = frame.locator(".legal-panel");
    await expect(legal).toBeVisible();
    await frame.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.mouse.move(700, 400);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(400);
    expect((await windowLayout(page)).scrollY).toBe(0);
    const gap = await frame.evaluate((el) => { const last = el.querySelector(".legal-panel")!.getBoundingClientRect(), box = el.getBoundingClientRect(); return { below: el.scrollHeight - (last.bottom - box.top + el.scrollTop), atEnd: Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2 }; });
    expect(gap.atEnd).toBe(true);
    expect(gap.below).toBeLessThan(100);
    await page.screenshot({ path: path.join(screenshots, "v041-settings-end-light.png") });
    await legal.locator("a").last().focus();
    expect((await windowLayout(page)).scrollY).toBe(0);
    // Scrolling back up keeps the frame aligned with the window.
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -1200);
    await page.waitForTimeout(400);
    const top = await frame.evaluate((el) => ({ scrollTop: el.scrollTop, top: el.getBoundingClientRect().top }));
    expect(top).toEqual({ scrollTop: 0, top: 0 });
    await change({ theme: "dark" });
    await frame.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(300);
    expect((await windowLayout(page)).scrollY).toBe(0);
    await page.screenshot({ path: path.join(screenshots, "v041-settings-end-dark.png") });
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});
