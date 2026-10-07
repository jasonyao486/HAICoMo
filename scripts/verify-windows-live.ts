/** Opt-in real-account smoke test. Never part of npm test or CI. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { _electron as electron, expect } from "@playwright/test";
import { ProjectStore } from "../src/core/store";
import { defaultSettings } from "../src/shared/settings";
import { closeTestApp } from "../tests/e2e/cleanup";

const provider = process.argv[process.argv.indexOf("--live") + 1];
if (!process.argv.includes("--live") || !["codex", "claude"].includes(provider)) throw new Error("Explicit --live codex|claude required; this uses the signed-in account.");
const executable = process.env.HAICOMO_PACKAGED_EXECUTABLE;
if (!executable || !path.isAbsolute(executable)) throw new Error("Set HAICOMO_PACKAGED_EXECUTABLE to the build being verified.");
const label = process.env.HAICOMO_VERIFICATION_LABEL || "local";
const mode = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : undefined;
if (mode && (provider !== "claude" || mode !== "acceptEdits")) throw new Error("Only explicit Claude --mode acceptEdits is supported by this smoke test");
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid verification label");
const evidence = path.resolve("validation/windows-functional", label, provider);
fs.mkdirSync(evidence, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-live-"));
const directory = path.join(root, "测试 Project with spaces");
fs.mkdirSync(directory);
fs.writeFileSync(path.join(directory, "input.txt"), "HAICOMO_WINDOWS_TEST\n2 + 3 = 5\n");
const store = new ProjectStore(directory, "Windows live verification");
store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: "live-task", expectedRevision: null, values: { title: "Synthetic local file verification", assignees: [provider === "codex" ? "chatgpt" : "claude"], status: "todo" } } });
store.close();
const profile = path.join(root, "profile");
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ ...defaultSettings, locale: "en-GB", reducedMotion: true }));
const report: any = { provider, label, mode: mode ?? "default", executable, directory, startedAt: new Date().toISOString(), stages: [], permissions: [] };
const app = await electron.launch({ executablePath: executable, args: [], env: { ...process.env, HAICOMO_TEST: "0", HAICOMO_USER_DATA: profile } });
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), path.join(directory, "HAICoMo.haicomo"));
  await page.getByRole("heading", { name: "Windows live verification", exact: true }).waitFor();
  const binding = await page.evaluate(async () => (await (window as any).haicomo.request("bootstrap")).projects[0].binding);
  const request = (type: string, payload: any = {}) => page.evaluate(({ type, payload }) => (window as any).haicomo.request(type, payload), { type, payload: { binding, ...payload } });
  const cap = (await request("providers.detect")).find((c: any) => c.provider === provider);
  report.capability = { version: cap.version, executable: cap.executable, appPath: cap.appPath, background: cap.background, reason: cap.reason };
  assert.equal(cap.background, true, "Client must support background handoff");
  const confinement = "Use only local file tools in this working directory. No network, connectors, account operations, or other directories. Do not modify .haicomo files. Do not ask another agent to work. ";
  const waitForEnd = async (runId: string) => {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const bg = await request("providers.background");
      for (const p of bg.permissions.filter((p: any) => p.runId === runId)) {
        report.permissions.push({ method: p.method, outcome: "left-for-human-or-cancelled" });
        throw new Error("LIVE_PERMISSION_REQUIRED: kept pending; no automatic permission grant");
      }
      const view = await request("project.view");
      const session = view.state.sessions.find((s: any) => s.sessionId === runId);
      if (session && !bg.runs.some((r: any) => r.runId === runId)) return session;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    throw new Error("LIVE_TASK_TIMEOUT");
  };
  await page.getByRole("button", { name: "Synthetic local file verification", exact: true }).click();
  await page.getByRole("button", { name: "Handoff", exact: true }).click();
  await page.getByLabel("Local client", { exact: true }).selectOption(provider);
  if (mode) await page.getByLabel("Mode", { exact: true }).selectOption(mode);
  await page.getByLabel("Handoff prompt", { exact: true }).fill(confinement + "Read input.txt. Use the file write/edit tool to write result.txt containing exactly HAICOMO_WINDOWS_TEST_OK on one line. Finish with the word DONE.");
  await page.getByRole("button", { name: "Send in background", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const handoff = (await request("project.view")).state.handoffs.find((h: any) => h.provider === provider && h.mode === "background");
  assert.ok(handoff?.sessionId, "UI handoff must persist its actual run identity");
  report.handoff = { provider: handoff.provider, mode: handoff.mode, taskId: handoff.taskId, sessionId: handoff.sessionId };
  const first = { runId: handoff.sessionId };
  const firstSession = await waitForEnd(first.runId);
  report.stages.push({ name: "file-task", endReason: firstSession.endReason, status: firstSession.status, lifecycle: firstSession.lifecycle, lastMessage: firstSession.lastMessage });
  assert.equal(firstSession.endReason, "completed");
  assert.equal(fs.readFileSync(path.join(directory, "result.txt"), "utf8").trim(), "HAICOMO_WINDOWS_TEST_OK");
  const state = (await request("project.view")).state;
  assert.equal(Boolean(state.tasks[0].acceptedAt), false, "Agent completion must not accept a task");
  const threadId = firstSession.threadId;
  assert.ok(threadId, "A resumable session identity is required");
  const resumed = await request("providers.start", { provider, mode, taskId: "live-task", threadId, prompt: confinement + "Read result.txt and use the file write/edit tool to create resumed.txt containing exactly HAICOMO_RESUME_OK. Finish with DONE." });
  const resumedSession = await waitForEnd(resumed.runId);
  report.stages.push({ name: "resume", endReason: resumedSession.endReason, status: resumedSession.status });
  assert.equal(resumedSession.endReason, "completed");
  assert.equal(fs.readFileSync(path.join(directory, "resumed.txt"), "utf8").trim(), "HAICOMO_RESUME_OK");
  const cancelled = await request("providers.start", { provider, mode, taskId: "live-task", prompt: confinement + "Think about counting from one to one hundred, then reply DONE. Do not create files or run commands." });
  if (provider === "claude") {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const active = (await request("providers.background")).runs.find((r: any) => r.runId === cancelled.runId);
      if (active?.status === "running") { report.cancelObservedRunning = true; break; }
      if (!active) throw new Error("Cancellation target ended before an active run was observed");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(report.cancelObservedRunning, true);
  }
  await request("providers.cancel", { runId: cancelled.runId });
  const cancelledSession = await waitForEnd(cancelled.runId);
  report.stages.push({ name: "cancel", endReason: cancelledSession.endReason, status: cancelledSession.status });
  await page.bringToFront();
  await expect(page.getByRole("button", { name: "Background tasks", exact: true })).toHaveText("Background tasks · 0");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("Recorded handoff", { exact: true }).first()).toBeVisible();
  report.ui = { backgroundRuns: 0, handoffVisibleInActivity: true };
  assert.equal(cancelledSession.endReason, "cancelled", "Cancellation needs a confirmed terminal event, not only a stopped process");
  await page.screenshot({ path: path.join(evidence, "live.png") });
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.error = String(error);
  const page = app.windows()[0];
  if (page) {
    await page.screenshot({ path: path.join(evidence, "failure.png") }).catch(() => {});
    report.visibleErrors = await page.locator(".error-box").allTextContents().catch(() => []);
  }
  process.exitCode = 1;
} finally {
  await closeTestApp(app);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidence, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
