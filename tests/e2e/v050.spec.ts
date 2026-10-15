import { fixtureAgent } from "../fixture-agent";
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { readSnapshot } from "../../src/core/files";
import { defaultSettings } from "../../src/shared/settings";
import { dictionaries } from "../../src/ui/i18n";

const zh = dictionaries["zh-CN"];
const screens = path.resolve(process.env.HAICOMO_EVIDENCE_DIR ?? "validation/0.5.0/screens");
const current = (page: Page) => page.locator(".workspace-frame:not([hidden])");
const turnStarts = (root: string) => (fs.readFileSync(path.join(root, "requests.jsonl"), "utf8").match(/"method":"turn\/start"/g) ?? []).length;

test("0.5.0 relay: three stages × three tasks, unattended answers recorded, desk and sofas follow the stages", async () => {
  test.setTimeout(240000);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-v050-")));
  const dir = path.join(root, "多阶段接力");
  fs.mkdirSync(dir);
  const store = new ProjectStore(dir, "多阶段接力");
  const task = (title: string, extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title, ...extra } } });
    return id;
  };
  const api = task("Draft API", { artifacts: [{ id: "api", label: "API", path: "api.md" }] });
  task("Draft UI");
  task("Integrate", { dependencies: [api] });
  const nine = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"].map((label) => [label, task(`Pipeline ${label}`)] as const);
  store.close();
  const fake = fixtureAgent(root);
  fs.mkdirSync(path.join(root, "profile"), { recursive: true });
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, locale: "zh-CN", codexPath: fake, clientPaths: { codex: fake } }));
  fs.mkdirSync(screens, { recursive: true });
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }),
    env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: dir },
  });
  const page = await app.firstWindow(), frame = current(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(dir, "HAICoMo.haicomo"));
    await expect(frame.getByRole("heading", { name: "多阶段接力", exact: true })).toBeVisible();
    await frame.locator(".sidebar nav").getByRole("button", { name: zh.relay, exact: true }).click();

    // Build A1 + A2 → B1 in the editor, unattended with explicit consent.
    await frame.getByRole("button", { name: zh.relayNew, exact: true }).first().click();
    const dialog = frame.locator("dialog.modal");
    await expect(dialog.getByRole("button", { name: zh.relaySaveEnable })).toBeEnabled({ timeout: 20000 });
    await dialog.locator(".relay-hms input").nth(2).fill("1");
    await dialog.getByLabel(zh.relayTargetTask).selectOption({ label: "Draft API" });
    await dialog.locator(".relay-step-editor textarea").fill("recommend");
    await dialog.getByRole("button", { name: zh.relayAddStep }).first().click();
    await dialog.getByLabel(zh.relayTargetTask).selectOption({ label: "Draft UI" });
    await dialog.getByRole("button", { name: zh.relayAddStage }).click();
    await dialog.getByLabel(zh.relayTargetTask).selectOption({ label: "Integrate" });
    await expect(dialog.locator(".relay-flow-edit .relay-flow-node")).toHaveCount(3);
    await expect(dialog.locator(".relay-flow-edit [data-step-label=B1]")).toHaveClass(/selected/);
    await dialog.getByRole("checkbox", { name: zh.relayAutonomy, exact: true }).check();
    await expect(dialog.getByRole("button", { name: zh.relaySaveEnable })).toBeDisabled();
    await expect(dialog.locator(".relay-autonomy-flags li")).toHaveCount(3);
    await dialog.getByRole("checkbox", { name: zh.relayAutonomyConsent }).check();
    await dialog.locator(".relay-flow-edit").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screens, "relay-editor-flow.png") });
    await dialog.locator(".relay-autonomy").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screens, "relay-editor-autonomy.png") });
    await dialog.getByRole("button", { name: zh.relaySaveEnable }).click();
    const card = frame.locator(".relay-card[data-relay-id]");
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-status", "completed", { timeout: 60000 });
    expect(turnStarts(root)).toBe(3);
    const snap = readSnapshot(dir);
    const relay = snap.relays[0];
    expect(relay.autonomy.enabled).toBe(true);
    expect(relay.decisions.map((d: any) => [d.kind, d.choice])).toEqual([["auto-answer", "Safe (Recommended)"]]);
    expect(snap.handoffs.map((h: any) => h.relayStage)).toEqual([0, 0, 1]);
    const b = snap.handoffs.find((h: any) => h.relayStage === 1);
    expect(b.prompt).toContain("[A1]");
    expect(b.prompt).toContain("无人值守接力运行");
    expect(b.prompt).toContain("api.md");
    const requests = fs.readFileSync(path.join(root, "requests.jsonl"), "utf8");
    expect(requests).toContain('"approvalPolicy":"on-request"');
    expect(requests).toContain('"answers":["Safe (Recommended)"]');
    const reports = fs.readdirSync(path.join(dir, ".haicomo", "relay-decisions"));
    expect(reports).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, ".haicomo", "relay-decisions", reports[0]), "utf8")).toContain("Safe (Recommended)");
    await expect(card.locator(".relay-flow-node[data-step-state=completed]")).toHaveCount(3);
    await page.screenshot({ path: path.join(screens, "relay-flow-completed.png") });
    await card.getByRole("button", { name: zh.relayDecisions }).click();
    await expect(frame.locator(".relay-report")).toContainText("Safe (Recommended)");
    await page.screenshot({ path: path.join(screens, "relay-decision-record.png") });
    await frame.locator("dialog.modal").getByRole("button").first().click();

    // Full capacity: 3 stages × 3 tasks. Stage A holds its runs; B and C wait on two sofas.
    await page.evaluate(async (steps) => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const stages = [0, 1, 2].map((s) => ({ steps: steps.slice(s * 3, s * 3 + 3).map(([label, taskId]: readonly string[]) => ({ provider: "codex", taskId, prompt: label.startsWith("A") ? "cancel" : label })) }));
      await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.create", payload: { enabled: true, values: { title: "Full capacity", trigger: { kind: "delay", ms: 1000 }, stages } } });
    }, nine);
    const full = frame.locator(".relay-card[data-relay-id]").first();
    await expect(full).toHaveAttribute("data-status", "running", { timeout: 30000 });
    await expect.poll(() => turnStarts(root), { timeout: 20000 }).toBe(6);
    await expect(full.locator(".relay-flow-stage[data-stage-state=current] .relay-flow-node[data-step-state=running]")).toHaveCount(3);
    await page.screenshot({ path: path.join(screens, "relay-flow-3x3.png") });
    await frame.getByRole("button", { name: zh.relayVisualView, exact: true }).click();
    const row = frame.locator(".relay-row.visual").first();
    await expect(row.locator(".relay-scene.workstation .relay-actor")).toHaveCount(3);
    await expect(row.locator(".relay-scene.sofa")).toHaveCount(2);
    await expect(row.locator(".relay-scene.sofa[data-stage=B] .relay-actor.seated")).toHaveCount(3);
    await expect(row.locator(".relay-scene.sofa[data-stage=C] .relay-actor.seated")).toHaveCount(3);
    for (const scene of [row.locator(".relay-scene.workstation"), row.locator(".relay-scene.sofa").first()]) {
      const s = (await scene.boundingBox())!;
      for (const actor of await scene.locator(".relay-actor").all()) {
        const a = (await actor.boundingBox())!;
        expect(a.x).toBeGreaterThanOrEqual(s.x - 1);
        expect(a.x + a.width).toBeLessThanOrEqual(s.x + s.width + 1);
      }
    }
    // Desk and sofa paintings show the same visible width.
    const widths = await row.evaluate((el) => [...el.querySelectorAll(".furniture")].map((f) => Math.round(f.getBoundingClientRect().width)));
    expect(widths.length).toBe(3);
    await page.screenshot({ path: path.join(screens, "relay-visual-3x3-default.png") });
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, enhanced: true } }); });
    await expect(row.locator("img.furniture-sofa")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).length)).toBe(0);
    await page.screenshot({ path: path.join(screens, "relay-visual-3x3-enhanced.png") });

    // Cancelling one stage-A run blocks the relay at stage A; retry is offered and B never starts.
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const runs = await window.haicomo.request("providers.active", { binding });
      await window.haicomo.request("providers.cancel", { binding, runId: runs[0].runId });
    });
    await expect(row).toHaveAttribute("data-status", "blocked", { timeout: 20000 });
    await expect(row.getByRole("button", { name: zh.relayRetry })).toBeVisible();
    await page.screenshot({ path: path.join(screens, "relay-visual-blocked-enhanced.png") });
    expect(turnStarts(root)).toBe(6);
    // Leave no held fixture runs behind: quitting with active agents asks for confirmation.
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      for (const run of await window.haicomo.request("providers.active", { binding })) await window.haicomo.request("providers.cancel", { binding, runId: run.runId });
    });
    await expect.poll(() => page.evaluate(async () => (await window.haicomo.request("providers.background")).runs.length), { timeout: 15000 }).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
