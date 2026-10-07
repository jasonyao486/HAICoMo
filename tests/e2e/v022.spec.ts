import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { dictionaries } from "../../src/ui/i18n";
const current = (page: Page) => page.locator(".tab-frame:not([hidden])");
const screenDir = path.resolve(process.env.HAICOMO_EVIDENCE_DIR ?? "validation/0.2.2/screens");
async function prefs(page: Page, next: any) { await page.evaluate(async (next) => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, ...next } }); }, next); }
async function launch(root: string) { return electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile") } }); }

test("0.2.2 home, compact profile and offline terms in all locales/themes; external links stay global and allowlisted", async () => {
  test.setTimeout(120000);
  fs.mkdirSync(screenDir, { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-terms-"));
  const app = await launch(root); const page = await app.firstWindow();
  const failures: string[] = []; page.on("pageerror", (e) => failures.push(String(e)));
  try {
    await expect(current(page).locator(".orbit")).toHaveCount(3);
    await expect(current(page).locator(".orbit-member")).toHaveCount(3);
    await expect(current(page).locator(".hero-orbit img")).toHaveCount(0);
    await page.screenshot({ path: path.join(screenDir, "home.png") });
    await current(page).getByRole("button", { name: "设置", exact: true }).click();
    const panel = current(page).locator(".settings-panel").first();
    await panel.getByLabel("用户名", { exact: true }).fill("John Ronald Reuel");
    await panel.locator("button.primary").click();
    await expect(current(page).locator(".topbar .user-avatar")).toHaveText("JRR");
    await panel.locator(".initials-trigger").click();
    await panel.getByRole("textbox", { name: "头像缩写", exact: true }).fill("ABCD");
    await panel.locator("button.primary").click();
    await expect(current(page).locator(".topbar .user-avatar")).toHaveClass(/initials-four/);
    await expect(panel.locator(".initials-trigger")).toHaveAttribute("aria-expanded", "false");
    await app.evaluate(({ shell }) => { (globalThis as any).__legalOpened = []; shell.openExternal = async (url: string) => { (globalThis as any).__legalOpened.push(url); }; });
    const originalURL = page.url();
    await page.context().setOffline(true);
    for (const locale of ["zh-CN", "zh-TW", "en-US", "en-GB"] as const) {
      for (const theme of ["light", "dark"]) {
        await prefs(page, { locale, theme });
        const legal = current(page).locator(".legal-panel");
        await expect(legal.getByRole("heading", { level: 2 })).toHaveText(dictionaries[locale].legalTitle);
        await expect(legal).toContainText("ZipZipPipe"); await expect(legal).toContainText("上善无形");
        await expect(legal.getByRole("link")).toHaveCount(9);
        await expect(legal).not.toContainText("等待回复");
        expect(await legal.locator('a[href="https://b23.tv/3dNz55h"]').count()).toBe(1);
        expect(await legal.locator("button, input, select").count()).toBe(0);
        expect(await legal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (await page.locator(".toast button").count()) await page.locator(".toast button").first().click();
        await legal.locator("h2").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenDir, `terms-${locale}-${theme}-top.png`) });
        await legal.locator("section").last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenDir, `terms-${locale}-${theme}-bottom.png`) });
        const savedBefore = fs.readFileSync(path.join(root, "profile", "settings.json"), "utf8");
        await legal.locator('a[href="https://space.bilibili.com/4168597"]').focus(); await page.keyboard.press("Enter");
        expect(page.url()).toBe(originalURL);
        expect(fs.readFileSync(path.join(root, "profile", "settings.json"), "utf8")).toBe(savedBefore);
      }
    }
    const calls = await app.evaluate(() => (globalThis as any).__legalOpened);
    expect(calls).toHaveLength(8); expect(new Set(calls)).toEqual(new Set(["https://space.bilibili.com/4168597"]));
    const invalid = await page.evaluate(async () => {
      const errors = [];
      for (const payload of [{ linkId: "unknown" }, { linkId: "creator", url: "https://example.org" }]) try { await window.haicomo.request("legal.openExternal", payload); } catch (e: any) { errors.push(e.code ?? e.message.replace(/^(Error:\s*)+/, "")); }
      return errors;
    });
    expect(invalid).toEqual(["LEGAL_LINK_NOT_ALLOWED", "LEGAL_LINK_NOT_ALLOWED"]);
    await app.evaluate(({ shell }) => { shell.openExternal = async () => { throw new Error("Injected browser failure"); }; });
    for (const locale of ["zh-CN", "zh-TW", "en-US", "en-GB"] as const) {
      await prefs(page, { locale });
      await current(page).locator(".legal-panel").getByRole("link").first().click();
      await expect(current(page).locator(".toast.error")).toContainText(dictionaries[locale].legalOpenFailed);
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800));
    if (await page.locator(".toast button").count()) await page.locator(".toast button").first().click();
    await current(page).locator(".legal-panel h2").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(screenDir, "terms-narrow.png") });
    await current(page).locator(".legal-panel section").last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screenDir, "terms-narrow-bottom.png") });
    expect(await current(page).locator(".settings-page").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(failures).toEqual([]);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("0.2.2 model-only statistics, audit context, filled mode control and recent-file actions", async () => {
  fs.mkdirSync(screenDir, { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-history-")), directory = path.join(root, "中文 Project"); fs.mkdirSync(directory);
  const store = new ProjectStore(directory, "Studio project");
  const create = (id: string, title: string, parentId: string | null) => store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title, parentId, assignees: ["human", "claude", "client:cursor"] } } }, "Ada Lovelace");
  create("root", "A long top-level project task with meaningful words — 一个很长的任务名称", null); create("child", "Nested milestone 子任务", "root");
  const updatedAt = store.state().updatedAt; store.close();
  const app = await launch(root), page = await app.firstWindow();
  try {
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(directory, "HAICoMo.haicomo"));
    await current(page).getByRole("button", { name: "活动记录", exact: true }).click();
    const history = current(page).locator(".history-panel");
    await expect(history).toContainText("Ada Lovelace"); await expect(history).toContainText("Nested milestone 子任务");
    await history.screenshot({ path: path.join(screenDir, "activity.png") });
    await current(page).getByRole("button", { name: "协作统计", exact: true }).click();
    await expect(current(page).locator(".model-card")).toHaveCount(14);
    await expect(current(page).locator(".analytics-grid")).not.toContainText("Cursor");
    await expect(current(page).locator(".attribution-summary")).toContainText("人类参与任务: 2");
    await current(page).getByRole("button", { name: "协作办公室", exact: true }).click();
    await prefs(page, { enhanced: true });
    await expect(current(page).locator('.page-heading button[aria-pressed="true"] svg')).toHaveAttribute("fill", "currentColor");
    await current(page).getByRole("button", { name: "设置", exact: true }).click();
    await expect(current(page).locator(".legal-panel")).toBeAttached();
    await current(page).locator(".settings-panel").first().screenshot({ path: path.join(screenDir, "interface.png") });
    await current(page).getByRole("button", { name: "切换项目标签" }).click();
    await current(page).getByRole("menuitem", { name: "新建标签页", exact: true }).click();
    const recent = current(page).locator(".recent-item").filter({ hasText: "Studio project" });
    await expect(recent.locator("time")).toHaveAttribute("datetime", updatedAt);
    await expect(recent.locator(".recent-action")).toHaveCount(2);
    await recent.screenshot({ path: path.join(screenDir, "recent-row.png") });
    await recent.getByRole("button", { name: /移出最近项目/ }).click();
    await expect(recent).toHaveCount(0); expect(fs.existsSync(path.join(directory, "HAICoMo.haicomo"))).toBe(true);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
