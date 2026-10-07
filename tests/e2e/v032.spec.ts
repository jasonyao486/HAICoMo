import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { readSnapshot, exampleProposal, publishProposal } from "../../src/core/files";
import { dictionaries } from "../../src/ui/i18n";
import { closeTestApp, removeTestDirectory } from "./cleanup";
const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const current = (page: Page) => page.locator(".workspace-frame:not([hidden])");
const shortcut = process.platform === "darwin" ? "Meta" : "Control";
const screenshotDir = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? `validation/${version}/screens`);
async function launch(root: string) {
  return electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile") } });
}
function project(root: string, name: string) {
  const directory = path.join(root, name); fs.mkdirSync(directory);
  const store = new ProjectStore(directory, name);
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: "task", expectedRevision: null, values: { title: "Example task", assignees: ["claude"] } } }, "Synthetic reviewer with a long name");
  const proposal = exampleProposal(store.state());
  proposal.actor = { name: "Claude response captured by test operator with a long description", family: "claude", model: "claude-synthetic-full-version", harnessId: "claude" };
  proposal.changes = [{ entity: "task", operation: "update", id: "task", expectedRevision: store.state().tasks[0].revision, values: { description: "Synthetic proposal" } }];
  publishProposal(directory, proposal); store.ingest(true);
  store.command({ id: randomUUID(), type: "proposal.review", payload: { proposalId: proposal.proposalId, decision: "approve" } }, "Synthetic reviewer with a long name");
  const before = store.view().audit; store.close();
  return { directory, entry: path.join(directory, "HAICoMo.haicomo"), before };
}

test("home is independent of tabs: 20 logo clicks, retained task/settings drafts, shortcuts and close guard", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-home-"));
  const a = project(root, "Alpha"), b = project(root, "Beta");
  const app = await launch(root), page = await app.firstWindow();
  try {
    for (const p of [b, a]) {
      await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), p.entry);
      await expect(current(page).getByRole("heading", { name: path.basename(p.directory), exact: true })).toBeVisible();
    }
    await current(page).locator(".sidebar nav").getByTitle("任务清单", { exact: true }).click();
    await current(page).getByRole("button", { name: "Example task", exact: true }).click();
    await current(page).getByLabel("标题", { exact: true }).fill("Retained draft");
    const count = await page.locator(".tab-frame").count();
    for (let i = 0; i < 20; i++) await current(page).locator(".brand").click();
    await expect(page.locator(".tab-frame")).toHaveCount(count);
    await expect(page.locator(".home-frame .home")).toBeVisible();
    await page.keyboard.press(`${shortcut}+w`);
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue("Retained draft");
    await current(page).locator(".brand").click();
    await current(page).locator(".recent-row").filter({ hasText: "Alpha" }).click();
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue("Retained draft");
    await current(page).locator(".brand").click();
    await current(page).getByRole("button", { name: "切换项目标签" }).click();
    await current(page).getByRole("menuitem").filter({ has: page.locator("span", { hasText: "Beta" }) }).click();
    await expect(current(page).getByRole("heading", { name: "Beta", exact: true })).toBeVisible();
    await current(page).locator(".brand").click();
    await page.keyboard.press(`${shortcut}+Tab`);
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue("Retained draft");
    await current(page).locator("dialog.modal").getByRole("button", { name: "保存修改", exact: true }).click();
    await current(page).locator(".brand").click();
    await current(page).locator(".sidebar-bottom button").click();
    await current(page).getByLabel("用户名", { exact: true }).fill("Home settings draft");
    await current(page).locator(".brand").click();
    await expect(current(page).locator(".home")).toBeVisible();
    await page.keyboard.press(`${shortcut}+w`);
    await expect(current(page).locator(".task-list")).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    await current(page).locator(".brand").click();
    await current(page).locator(".sidebar-bottom button").click();
    await expect(current(page).getByLabel("用户名", { exact: true })).toHaveValue("Home settings draft");
    await current(page).locator(".settings-panel").first().locator("button.primary").click();
    expect((await page.evaluate(() => window.haicomo.request("bootstrap"))).settings.userName).toBe("Home settings draft");
    expect(readSnapshot(a.directory).tasks[0].title).toBe("Retained draft");
    await current(page).locator(".brand").click();
    await current(page).getByRole("button", { name: "新建项目", exact: true }).click();
    await current(page).getByLabel("项目名称", { exact: true }).fill("Unsaved new project");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    await expect(current(page).getByLabel("项目名称", { exact: true })).toHaveValue("Unsaved new project");
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});

test("four-language home and collapsed icons fit both themes at minimum size; activity summaries keep detail", async () => {
  test.setTimeout(120000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-ui-")), p = project(root, "Interface sample");
  const app = await launch(root), page = await app.firstWindow();
  fs.mkdirSync(screenshotDir, { recursive: true });
  const prefs = async (next: unknown) => page.evaluate(async next => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, ...(next as object) } }); }, next);
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 720));
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), p.entry);
    await current(page).getByRole("button", { name: "活动记录", exact: true }).click();
    const rows = current(page).locator(".history-panel details");
    await expect(rows.first().locator(".activity-who")).toHaveText("Claude → 人类");
    await expect(rows.locator("summary")).not.toContainText(["test operator", "Synthetic reviewer", "full-version"]);
    await rows.first().locator("summary").click();
    await expect(rows.first().locator(".audit-people")).toContainText("Claude response captured by test operator");
    await expect(rows.first().locator(".audit-people")).toContainText("claude-synthetic-full-version");
    await page.screenshot({ path: path.join(screenshotDir, "activity-roles.png") });
    const audit = await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); return window.haicomo.request("project.audit", { binding: b.projects[0].binding }); });
    expect(audit.items).toEqual(p.before);
    await current(page).getByRole("button", { name: dictionaries["zh-CN"].toggleSidebar }).click();
    await current(page).locator(".brand").click();
    for (const locale of ["en-GB", "en-US", "zh-CN", "zh-TW"] as const) for (const theme of ["light", "dark"]) {
      await prefs({ locale, theme });
      await expect(current(page).locator(".home-description")).toHaveText(dictionaries[locale].localFirst);
      await expect(current(page).locator(".home-hero h1")).toHaveText(dictionaries[locale].welcome);
      await expect(current(page).locator(".home-hero p")).toHaveCount(0);
      for (const selector of [".workspace-switch", ".background-entry"]) {
        const button = current(page).locator(selector);
        await expect(button.locator("svg")).toHaveCount(1); await expect(button).toHaveText("");
        const bounds = await button.locator("svg").boundingBox(); expect(bounds?.width).toBe(19); expect(bounds?.height).toBe(19);
        const box = await button.boundingBox(); expect(Math.abs(bounds!.x + 9.5 - box!.x - box!.width / 2)).toBeLessThan(1);
        await expect(button).toHaveAttribute("title", /.+/); await expect(button).toHaveAttribute("aria-label", /.+/);
      }
      await current(page).locator(".workspace-switch").focus(); await page.keyboard.press("Enter");
      await expect(current(page).getByRole("menu")).toBeVisible(); await page.keyboard.press("Escape");
      await current(page).locator(".background-entry").click(); await expect(page.locator(".shell-dialog")).toBeVisible();
      await page.locator(".shell-dialog").getByRole("button", { name: dictionaries[locale].close, exact: true }).click();
      for (const collapsed of [true, false]) {
        if (!collapsed) await current(page).getByRole("button", { name: dictionaries[locale].toggleSidebar }).click();
        const overlap = await current(page).locator(".home-description").evaluate(el => { const text = el.getBoundingClientRect(), orbit = el.parentElement!.querySelector(".hero-orbit")!.getBoundingClientRect(); return { font: getComputedStyle(el).fontSize, fits: text.right <= orbit.left, overflow: document.documentElement.scrollWidth > innerWidth }; });
        expect(overlap).toEqual({ font: "13px", fits: true, overflow: false });
        await page.screenshot({ path: path.join(screenshotDir, `home-${locale}-${theme}-${collapsed ? "collapsed" : "expanded"}.png`) });
      }
      await current(page).getByRole("button", { name: dictionaries[locale].toggleSidebar }).click();
    }
    await page.keyboard.press(`${shortcut}+w`);
    await expect(current(page).locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});

test("upgrade restoration can return to home without losing a real tab or its page", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-home-resume-")), p = project(root, "Restored");
  const state = readSnapshot(p.directory), profile = path.join(root, "profile"); fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, "pending-update.json"), JSON.stringify({ from: "0.3.1", target: version, at: new Date().toISOString(), windows: [{ home: true, tabs: [{ entryPath: p.entry, id: state.id, epoch: state.epoch, page: "history", active: true }] }] }));
  const app = await launch(root), page = await app.firstWindow();
  try {
    await expect(page.locator(".home-frame .home")).toBeVisible();
    await expect(page.locator(".tab-frame")).toHaveCount(1);
    await page.keyboard.press(`${shortcut}+w`);
    await expect(current(page).locator(".history-panel")).toBeVisible();
    expect((await page.evaluate(() => window.haicomo.request("bootstrap"))).projects).toHaveLength(1);
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});
