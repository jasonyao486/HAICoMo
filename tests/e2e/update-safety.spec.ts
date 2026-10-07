import { closeTestApp, removeTestDirectory } from "./cleanup";
import { fixtureAgent } from "../fixture-agent";
const currentVersion: string = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const nextVersion = currentVersion.replace(/(\d+)$/, (patch) => String(Number(patch) + 1));
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { readSnapshot } from "../../src/core/files";
const current = (page: Page) => page.locator(".tab-frame:not([hidden])");
async function launch(root: string) { return electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_UPDATE_PREFLIGHT_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile") } }); }
function project(root: string, title: string) {
  const dir = path.join(root, title); fs.mkdirSync(dir);
  const s = new ProjectStore(dir, title);
  s.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: "task", expectedRevision: null, values: { title: `${title} task`, assignees: ["human"], status: "todo" } } }); s.close(); return dir;
}
test("install preflight coordinates two dirty windows, cancels globally and freezes only acknowledged windows", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-preflight-"));
  const dirs = [project(root, "Alpha"), project(root, "Beta")];
  const bytes = Buffer.from("preflight never reaches the native installer"), sha = createHash("sha512").update(bytes).digest("base64");
  const server = http.createServer((req, res) => { if (req.url?.split("?")[0].endsWith(".zip")) res.end(bytes); else res.end(JSON.stringify({ version: nextVersion, files: [{ url: "update.zip", sha512: sha, size: bytes.length }], path: "update.zip", sha512: sha })); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const feed = `http://127.0.0.1:${(server.address() as any).port}/`;
  const app = await launch(root), page = await app.firstWindow();
  try {
    for (const dir of dirs) { await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(dir, "HAICoMo.haicomo")); await expect(current(page).getByRole("heading", { name: path.basename(dir), exact: true })).toBeVisible(); }
    await expect(current(page).getByRole("heading", { name: "Beta", exact: true })).toBeVisible();
    const b = await page.evaluate(() => window.haicomo.request("bootstrap"));
    await page.evaluate(async (feed) => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, updateFeed: feed } }); await window.haicomo.request("updates.check"); await window.haicomo.request("updates.download"); }, feed);
    const fake = fixtureAgent(root);
    const betaBinding = b.projects.find((p: any) => p.entryPath.includes("Beta")).binding;
    const running = await page.evaluate(async ({ fake, binding }) => {
      const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, clientPaths: { codex: fake } } });
      return window.haicomo.request("providers.start", { binding, provider: "codex", taskId: "task", prompt: "cancel" });
    }, { fake, binding: betaBinding });
    expect(await page.evaluate(() => window.haicomo.request("updates.install").then(() => "bad", String))).toContain("STOP_AGENTS_BEFORE_UPDATE");
    await page.evaluate(({ binding, runId }) => window.haicomo.request("providers.cancel", { binding, runId }), { binding: betaBinding, runId: running.runId });
    await expect.poll(async () => (await page.evaluate(() => window.haicomo.request("providers.background"))).runs.length).toBe(0);
    const created = app.waitForEvent("window");
    await page.evaluate((binding) => window.haicomo.request("project.window", { binding }), b.projects.find((p: any) => p.entryPath.includes("Alpha")).binding);
    const other = await created;
    await expect(current(other).getByRole("button", { name: "Alpha task", exact: true })).toBeVisible();
    for (const [p, title] of [[page, "Beta"], [other, "Alpha"]] as const) { await current(p).getByRole("button", { name: `${title} task`, exact: true }).click(); await current(p).getByLabel("标题", { exact: true }).fill(`${title} saved before install`); }
    await page.evaluate(() => window.haicomo.request("updates.install"));
    for (const p of [page, other]) await expect(p.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    for (const p of [page, other]) await expect(p.getByRole("alertdialog")).toHaveCount(0);
    expect((await page.evaluate(() => window.haicomo.request("updates.state"))).status).toBe("downloaded");
    await page.evaluate(() => { (window as any).__verified = false; window.haicomo.subscribe((e: any) => { if (e.event === "updates.cancelled" && e.verified) (window as any).__verified = true; }); });
    await page.evaluate(() => window.haicomo.request("updates.install"));
    await other.getByRole("alertdialog").getByRole("button", { name: "保存修改", exact: true }).click();
    await expect.poll(() => readSnapshot(dirs[0]).tasks[0].title).toBe("Alpha saved before install");
    const frozen = await other.evaluate(() => window.haicomo.request("project.create", { title: "Forbidden while preparing" }).then(() => "bad", String));
    expect(frozen).toContain("UPDATE_IN_PROGRESS");
    expect((await page.evaluate(() => window.haicomo.request("updates.state"))).status).toBe("preparing");
    await page.getByRole("alertdialog").getByRole("button", { name: "保存修改", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__verified)).toBe(true);
    expect(readSnapshot(dirs[1]).tasks[0].title).toBe("Beta saved before install");
    await expect(other.locator("[inert]")).toHaveCount(0);
    expect(fs.existsSync(path.join(root, "profile/pending-update.json"))).toBe(false);
  } finally { await closeTestApp(app); await new Promise<void>((r) => server.close(() => r())); await removeTestDirectory(root); }
});

test("update-only restoration checks file identity, keeps missing entry deleted, then ordinary startup stays blank", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-update-resume-"));
  const directory = project(root, "Restored"), missing = project(root, "Deleted");
  const profile = path.join(root, "profile"); fs.mkdirSync(profile);
  const tabs = [directory, missing].map((dir) => ({ entryPath: path.join(dir, "HAICoMo.haicomo"), id: readSnapshot(dir).id, epoch: readSnapshot(dir).epoch, page: "history", active: dir === directory }));
  fs.unlinkSync(tabs[1].entryPath);
  fs.writeFileSync(path.join(profile, "pending-update.json"), JSON.stringify({ from: "0.2.1", target: currentVersion, at: new Date().toISOString(), windows: [{ tabs }] }));
  let app = await launch(root), page = await app.firstWindow();
  try {
    await expect(current(page).locator(".history-panel")).toBeVisible();
    await expect(page.locator(".update-banner")).toContainText("恢复未完成");
    expect(fs.existsSync(tabs[1].entryPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(profile, "last-update.json"), "utf8")).restoredVersion).toBe(currentVersion);
    expect((await page.evaluate(() => window.haicomo.request("bootstrap"))).projects).toHaveLength(1);
    await app.close(); app = await launch(root); page = await app.firstWindow();
    await expect(current(page).getByRole("button", { name: "新建项目", exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.haicomo.request("bootstrap"))).projects).toHaveLength(0);
    expect(fs.existsSync(tabs[1].entryPath)).toBe(false);
  } finally { await app.close().catch(() => {}); await removeTestDirectory(root); }
});
