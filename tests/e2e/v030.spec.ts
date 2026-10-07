import { fixtureAgent } from "../fixture-agent";
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { readSnapshot } from "../../src/core/files";
import { defaultSettings } from "../../src/shared/settings";
const screens = path.resolve(process.env.HAICOMO_EVIDENCE_DIR ?? "validation/0.3.0/screens");
const current = (page: Page) => page.locator(".workspace-frame:not([hidden])");
function fixture(root: string) {
  const fake = fixtureAgent(root);
  fs.mkdirSync(path.join(root, "profile"), { recursive: true });
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, codexPath: fake, clientPaths: { codex: fake } }));
  return fake;
}
async function launch(root: string, directory: string) {
  return electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }),
    env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: directory },
  });
}
const emitOpen = (app: any, file: string) => app.evaluate(({ app }: any, file: string) => app.emit("open-file", { preventDefault() {} }, file), file);

test("0.3.0 relay: form creates a timer relay, the scheduler starts the fixture agent once, rows animate in both styles", async () => {
  test.setTimeout(150000);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-relay-e2e-")));
  const dir = path.join(root, "接力 Project");
  fs.mkdirSync(dir);
  const store = new ProjectStore(dir, "接力示例");
  const taskId = randomUUID();
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: taskId, expectedRevision: null, values: { title: "Relay me", assignees: ["chatgpt"], artifacts: [{ id: "spec", label: "Spec", path: "spec.md" }] } } });
  store.close();
  fixture(root);
  fs.mkdirSync(screens, { recursive: true });
  const app = await launch(root, dir), page = await app.firstWindow(), frame = current(page);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await emitOpen(app, path.join(dir, "HAICoMo.haicomo"));
    await expect(frame.getByRole("heading", { name: "接力示例", exact: true })).toBeVisible();
    await expect(frame.locator(".sidebar nav button")).toHaveCount(12);
    await frame.locator(".sidebar nav").getByRole("button", { name: "接力任务（实验）", exact: true }).click();
    await expect(frame.locator(".page-heading h1")).toHaveText("接力任务（实验）");
    await expect(frame.locator(".page-footer")).toHaveCount(0);
    await page.screenshot({ path: path.join(screens, "relay-empty.png") });
    await frame.getByRole("button", { name: "新建接力", exact: true }).first().click();
    const dialog = frame.locator("dialog.modal");
    await expect(dialog.getByRole("heading", { name: "新建接力" })).toBeVisible();
    await expect(dialog.getByLabel("本地客户端")).toHaveValue("codex");
    await expect(dialog.getByRole("button", { name: "保存并启用" })).toBeEnabled({ timeout: 20000 });
    await dialog.locator(".relay-hms input").nth(2).fill("3");
    await dialog.getByLabel("模式").selectOption("never");
    await dialog.getByLabel("推理强度").selectOption("high");
    await page.screenshot({ path: path.join(screens, "relay-form.png") });
    await dialog.getByRole("button", { name: "保存并启用" }).click();
    const row = frame.locator("tr[data-relay-id]");
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute("data-status", "scheduled");
    await expect(frame.locator(".badge-relay-scheduled")).toBeVisible();
    await page.screenshot({ path: path.join(screens, "relay-table.png") });
    await expect(row).toHaveAttribute("data-status", "fired", { timeout: 30000 });
    await expect.poll(() => readSnapshot(dir).handoffs.length, { timeout: 15000 }).toBe(1);
    const snapshot = readSnapshot(dir);
    expect(snapshot.relays[0].status).toBe("fired");
    expect(snapshot.relays[0].handoff.mode).toBe("never");
    expect(snapshot.relays[0].handoff.effort).toBe("high");
    expect(snapshot.handoffs[0].mode).toBe("relay");
    expect(snapshot.handoffs[0].prompt).toContain("spec.md");
    expect(snapshot.handoffs[0].sessionId).toBe(snapshot.relays[0].resultRunId);
    await expect.poll(() => readSnapshot(dir).sessions.filter((s: any) => s.sessionId === snapshot.relays[0].resultRunId && s.lifecycle === "history").length, { timeout: 15000 }).toBe(1);
    const requests = fs.readFileSync(path.join(root, "requests.jsonl"), "utf8");
    expect(requests).toContain('"approvalPolicy":"never"');
    expect(requests).toContain('"effort":"high"');
    expect((requests.match(/"method":"turn\/start"/g) ?? []).length).toBe(1);
    // A second relay after the fixture run is refused as a chain; a fresh manual run is accepted.
    await frame.getByRole("button", { name: "新建接力", exact: true }).first().click();
    const second = frame.locator("dialog.modal");
    await expect(second.getByLabel("前置运行").locator("option")).toHaveCount(1);
    await second.getByRole("radio", { name: "指定日期时间" }).check();
    await second.getByLabel("模型").fill("gpt-6-astra");
    await second.getByRole("button", { name: "保存为暂停" }).click();
    await expect(frame.locator("tr[data-relay-id]")).toHaveCount(2);
    await expect(frame.locator("tr[data-status=paused]")).toHaveCount(1);
    // Visual view in default and enhanced style.
    await frame.getByRole("button", { name: "可视化", exact: true }).click();
    await expect(frame.locator(".relay-row.visual")).toHaveCount(2);
    await expect(frame.locator(".relay-row.visual").first()).toHaveAttribute("data-pose", /run|sit|sleep|hobby/);
    await expect(frame.locator(".relay-row.visual .figure-stick").first()).toBeVisible();
    await page.screenshot({ path: path.join(screens, "relay-visual-default.png") });
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, enhanced: true } }); });
    // The fired relay used the client default model (no family → client icon); the paused one names a GPT model → atlas character.
    await expect(frame.locator(".relay-row.visual .figure-atlas")).toHaveCount(1);
    await expect(frame.locator(".relay-row.visual .figure-stick")).toHaveCount(1);
    await expect(frame.locator(".relay-scene.enhanced").first()).toBeVisible();
    await page.screenshot({ path: path.join(screens, "relay-visual-enhanced.png") });
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, enhanced: false, locale: "en-US" } }); });
    await expect(frame.locator(".page-heading h1")).toHaveText("Relay tasks (experimental)");
    await frame.getByRole("button", { name: "Table", exact: true }).click();
    await expect(frame.locator("tr[data-relay-id]")).toHaveCount(2);
    await page.screenshot({ path: path.join(screens, "relay-table-en.png") });
    // One shortcut, one new tab.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+t" : "Control+t");
    await expect(page.locator(".tab-frame")).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("0.3.0 lock left by another computer is explained and can be taken over after confirmation", async () => {
  test.setTimeout(90000);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-lock-e2e-")));
  const dir = path.join(root, "Locked");
  fs.mkdirSync(dir);
  new ProjectStore(dir, "Locked project").close();
  fs.mkdirSync(path.join(root, "profile"), { recursive: true });
  fs.writeFileSync(path.join(root, "profile/recents.json"), JSON.stringify([{ ...(() => { const s = readSnapshot(dir); return { id: s.id, epoch: s.epoch }; })(), entryPath: path.join(dir, "HAICoMo.haicomo"), directory: dir, title: "Locked project", openedAt: new Date().toISOString() }]));
  fs.writeFileSync(path.join(dir, ".haicomo/writer.lock"), JSON.stringify({ pid: 4242, hostname: "other-laptop", token: "x", at: "2026-10-05T08:00:00.000Z", app: "HAICoMo" }));
  const app = await launch(root, dir), page = await app.firstWindow(), frame = current(page);
  try {
    await frame.getByRole("button", { name: /Locked project/ }).first().click();
    const dialog = frame.locator("dialog.modal");
    await expect(dialog.getByRole("heading", { name: "项目被另一台电脑锁定" })).toBeVisible();
    await expect(dialog).toContainText("other-laptop");
    await expect(dialog).toContainText("4242");
    await page.screenshot({ path: path.join(screens, "lock-takeover.png") });
    await dialog.getByRole("button", { name: "接管锁", exact: true }).click();
    await expect(frame.getByRole("heading", { name: "Locked project", exact: true })).toBeVisible();
    const audit = await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); return window.haicomo.request("project.audit", { binding: b.projects[0].binding, page: 0, pageSize: 30 }); });
    expect(audit.items.some((a: any) => a.action === "project.lock.takeover" && a.before.hostname === "other-laptop")).toBe(true);
    const lock = JSON.parse(fs.readFileSync(path.join(dir, ".haicomo/writer.lock"), "utf8"));
    expect(lock.hostname).not.toBe("other-laptop");
    expect(fs.existsSync(path.join(dir, ".haicomo/.gitignore"))).toBe(true);
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
