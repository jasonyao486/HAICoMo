import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fixtureAgent } from "./fixture-agent";
import { detect, findExecutable, LocalRunners } from "../src/providers/local";
import { ADAPTERS, newJsonlState, readJsonlEvent, jsonlMessage, WINDOWS_ARGV_PROMPT_LIMIT } from "../src/providers/adapters";
import { BACKGROUND_EVIDENCE, BACKGROUND_HARNESS_IDS, CLIENTS, HARNESS_IDS, clientIcon, isBackgroundHarness } from "../src/shared/clients";
import type { RunEvent } from "../src/shared/domain";

function workspace(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-adapters 测试 "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const requests = (dir: string) => fs.readFileSync(path.join(dir, "requests.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
async function run(t: any, dialect: string, provider: any, prompt: string, extra: Record<string, unknown> = {}) {
  const dir = workspace(t);
  const executable = fixtureAgent(dir, dialect);
  const events: RunEvent[] = [];
  const runners = new LocalRunners((_d, e) => events.push(e), () => {});
  t.after(() => runners.dispose());
  await runners.start({ provider, executable, directory: dir, taskId: "task-1", prompt, ...extra });
  const deadline = Date.now() + 8000;
  while (!events.some((e) => e.lifecycle === "history")) {
    if (Date.now() > deadline) throw new Error(`no final event: ${JSON.stringify(events.slice(-2))}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  return { dir, events, final: events.find((e) => e.lifecycle === "history")! };
}

test("client table: new clients are distinct from model families and background ids have adapters", () => {
  for (const id of ["kimi-code", "grok-bot", "deepseek-harness", "gemini-cli", "qwen-code"]) {
    assert.ok(CLIENTS.some((c) => c.id === id), id);
    assert.ok((HARNESS_IDS as readonly string[]).includes(id), id);
  }
  assert.deepEqual(CLIENTS.map((c) => c.id), HARNESS_IDS.filter((id) => id !== "external"));
  assert.equal(clientIcon("kimi-code"), "/local-assets/kimi-logo.svg");
  assert.equal(clientIcon("grok-bot"), "/local-assets/grok-logo.svg");
  assert.equal(clientIcon("deepseek-harness"), "/local-assets/deepseek-logo.svg");
  for (const id of BACKGROUND_HARNESS_IDS) assert.equal(ADAPTERS[id].id, id);
  // Grok Bot, WorkBuddy and TRAE have no headless interface: manual handoff only.
  for (const id of ["grok-bot", "workbuddy", "trae"]) assert.equal(isBackgroundHarness(id), false);
  assert.equal(BACKGROUND_EVIDENCE.cursor, "verified");
  assert.equal(BACKGROUND_EVIDENCE["deepseek-harness"], "verified");
});

test("detection enables a client only when its own help names the headless flags", async (t) => {
  const dir = workspace(t);
  const kimi = await detect("kimi-code", fixtureAgent(dir, "kimi"));
  assert.equal(kimi.background, true);
  assert.deepEqual(kimi.modes, ["default", "plan", "ask-when-needed"]);
  assert.equal(kimi.autonomousMode, "never-ask");
  assert.equal(kimi.resume, true);
  dshHome(t);
  const dsh = await detect("deepseek-harness", fixtureAgent(dir, "dsh"));
  assert.equal(dsh.background, true);
  assert.equal(dsh.model, true);
  assert.equal(dsh.models, undefined);
  assert.deepEqual(dsh.modes, ["workspace-write", "read-only"]);
  const gemini = await detect("gemini-cli", fixtureAgent(dir, "gemini"));
  assert.equal(gemini.background, true);
  assert.equal(gemini.autonomousMode, "yolo");
  assert.ok(!gemini.modes.includes("yolo"));
  // A CLI whose help lacks the flags stays manual.
  const wrong = await detect("kimi-code", fixtureAgent(dir, "agent"));
  assert.equal(wrong.background, false);
  assert.equal(wrong.reason, "HEADLESS_FLAGS_NOT_FOUND");
  // Not an adapter at all.
  assert.equal((await detect("grok-bot", "")).reason, "MANUAL_HANDOFF_ONLY");
});

test("Kimi: prompt as an argument, role lines parsed, exit code decides delivery", async (t) => {
  const ok = await run(t, "kimi", "kimi-code", "Summarise the notes", { model: "kimi-k3", mode: "ask-when-needed" });
  assert.equal(ok.final.endReason, "completed");
  assert.equal(ok.final.message, "Kimi fixture output");
  assert.equal(ok.final.threadId, "kimi-session");
  assert.equal(ok.final.family, "kimi");
  const call = requests(ok.dir).find((r) => r.args);
  assert.deepEqual(call.args, ["--prompt", "Summarise the notes", "--output-format", "stream-json", "--yolo", "--model", "kimi-k3"]);
  const bad = await run(t, "kimi", "kimi-code", "fail");
  assert.equal(bad.final.endReason, "failed");
  assert.match(bad.final.message, /quota/);
});

/** DeepSeek tests use their own DSH_HOME so the developer's real ~/.dsh never leaks in. */
function dshHome(t: any, desktopPatch?: string) {
  const home = workspace(t);
  if (desktopPatch !== undefined) {
    fs.mkdirSync(path.join(home, "profiles", "desktop"), { recursive: true });
    fs.writeFileSync(path.join(home, "profiles", "desktop", "cordis.patch.yml"), desktopPatch);
  }
  const saved = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  t.after(() => { if (saved === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = saved; });
}
const DESKTOP_PATCH = `# user layer\n- id: locale\n  name: "@deepseek-ai/dsh-client-locale"\n  config:\n    preference: zh\n- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: deepseek-account\n    model: deepseek-v4-pro\n    reasoningEffort: high\n- id: ui-chat\n  config: {}\n`;

test("DeepSeek Harness: prompt on stdin, permission preset by environment, final/turn_end events", async (t) => {
  dshHome(t);
  const ok = await run(t, "dsh", "deepseek-harness", "Review the plan");
  assert.equal(ok.final.endReason, "completed");
  assert.equal(ok.final.message, "DeepSeek fixture output");
  assert.equal(ok.final.threadId, "session-dsh-fixture");
  const log = requests(ok.dir);
  assert.deepEqual(log[0].args, ["--profile", "headless", "--json", "-"]);
  assert.equal(log[0].env.DSH_PERMISSION_MODE, "workspace-write");
  assert.ok(log.some((r) => r.prompt === "Review the plan" && r.patch === null));
  const bad = await run(t, "dsh", "deepseek-harness", "fail", { mode: "read-only" });
  assert.equal(bad.final.endReason, "failed");
  assert.match(bad.final.message, /MISSING_CREDENTIAL/);
  assert.doesNotMatch(bad.final.message, /Starting local agent/);
  assert.equal(requests(bad.dir)[0].env.DSH_PERMISSION_MODE, "read-only");
});

test("DeepSeek Harness: account route via a private per-run patch; typed model, desktop default, safe ids only", async (t) => {
  dshHome(t, DESKTOP_PATCH);
  // A typed model wins and keeps the desktop app's provider (the account login).
  const typed = await run(t, "dsh", "deepseek-harness", "Typed", { model: "deepseek-flash" });
  const call = requests(typed.dir).find((r) => r.args), patched = requests(typed.dir).find((r) => r.patch);
  const patchArg = call.args[call.args.indexOf("--patch") + 1];
  assert.deepEqual(call.args.filter((a: string) => a !== patchArg), ["--profile", "headless", "--patch", "--json", "-"]);
  assert.match(patched.patch, /id: agent-default-model/);
  assert.match(patched.patch, /provider: "deepseek-account"/);
  assert.match(patched.patch, /model: "deepseek-flash"/);
  assert.equal(typed.final.model, "deepseek-flash");
  assert.equal(typed.final.family, "deepseek");
  assert.equal(fs.existsSync(patchArg), false, "the overlay is removed when the run ends");
  // An empty model follows the desktop app's current default.
  const followed = await run(t, "dsh", "deepseek-harness", "Default");
  assert.match(requests(followed.dir).find((r) => r.patch).patch, /model: "deepseek-v4-pro"/);
  assert.equal(followed.final.model, "deepseek-v4-pro");
  const cap = await detect("deepseek-harness", fixtureAgent(workspace(t), "dsh"));
  assert.equal(cap.model, true);
  assert.deepEqual(cap.models?.map((m) => [m.id, m.isDefault]), [["deepseek-v4-pro", true]]);
  // Ids that could escape the YAML overlay are refused before anything starts.
  const runners = new LocalRunners(() => {}, () => {});
  t.after(() => runners.dispose());
  const dir = workspace(t);
  await assert.rejects(runners.start({ provider: "deepseek-harness", executable: fixtureAgent(dir, "dsh"), directory: dir, taskId: "t", prompt: "x", model: 'flash"\n- id: evil' }), /MODEL_UNSUPPORTED/);
});

test("Gemini-style deltas and plain-text clients produce the final message", async (t) => {
  const gemini = await run(t, "gemini", "gemini-cli", "Hello");
  assert.equal(gemini.final.message, "Gemini fixture output");
  assert.equal(gemini.final.threadId, "gemini-session");
  const copilot = await run(t, "copilot", "github-copilot", "Hello");
  assert.equal(copilot.final.endReason, "completed");
  assert.match(copilot.final.message, /Copilot fixture output\nsecond line/);
});

test("unattended modes need relay consent; bypass modes are never passed; long argv prompts are refused on Windows", async (t) => {
  const dir = workspace(t);
  const runners = new LocalRunners(() => {}, () => {});
  t.after(() => runners.dispose());
  const kimi = fixtureAgent(dir, "kimi");
  await assert.rejects(runners.start({ provider: "kimi-code", executable: kimi, directory: dir, taskId: "t", prompt: "x", mode: "never-ask" }), /AUTONOMY_CONSENT_REQUIRED/);
  await assert.rejects(runners.start({ provider: "pi", executable: kimi, directory: dir, taskId: "t", prompt: "x" }), /AUTONOMY_CONSENT_REQUIRED/);
  await assert.rejects(runners.start({ provider: "claude", executable: kimi, directory: dir, taskId: "t", prompt: "x", mode: "bypassPermissions", autonomous: true }), /MODE_UNSUPPORTED/);
  await assert.rejects(runners.start({ provider: "kimi-code", executable: kimi, directory: dir, taskId: "t", prompt: "x", mode: "unknown-mode" }), /MODE_UNSUPPORTED/);
  const ok = await run(t, "kimi", "kimi-code", "go", { mode: "never-ask", autonomous: true });
  assert.ok(requests(ok.dir).find((r) => r.args).args.includes("--auto"));
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    await assert.rejects(runners.start({ provider: "kimi-code", executable: kimi, directory: dir, taskId: "t", prompt: "x".repeat(WINDOWS_ARGV_PROMPT_LIMIT + 1) }), /PROMPT_TOO_LONG_FOR_ARGV/);
  } finally {
    Object.defineProperty(process, "platform", platform);
  }
});

test("executables are found in client-specific install folders even when PATH lacks them", (t) => {
  const home = workspace(t);
  const bin = path.join(home, ".kimi-code", "bin");
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, process.platform === "win32" ? "kimi.exe" : "kimi");
  fs.writeFileSync(file, "#!/bin/sh\n");
  fs.chmodSync(file, 0o755);
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PATH: process.env.PATH };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PATH = "";
  try {
    assert.equal(findExecutable("kimi-code"), file);
  } finally {
    Object.assign(process.env, saved);
  }
});

test("jsonl reader tolerates each vendor's vocabulary", () => {
  const s = newJsonlState();
  readJsonlEvent(s, { type: "session", sessionId: "s-1" });
  readJsonlEvent(s, { type: "status", phase: "turn_end", reason: { kind: "error", error: { message: "MISSING_CREDENTIAL" } } });
  assert.equal(s.threadId, "s-1");
  assert.equal(s.error, "MISSING_CREDENTIAL");
  const o = newJsonlState();
  readJsonlEvent(o, { type: "text", part: { text: "OpenCode says hi", sessionID: "ses_1" } });
  assert.equal(jsonlMessage(o), "OpenCode says hi");
  assert.equal(o.threadId, "ses_1");
  const c = newJsonlState();
  readJsonlEvent(c, { type: "assistant", message: { content: [{ type: "text", text: "partial" }] }, session_id: "c-1" });
  readJsonlEvent(c, { type: "result", result: "Final answer", session_id: "c-1" });
  assert.equal(jsonlMessage(c), "Final answer");
});

test("a client that vanished after detection is refused with a clear code before anything starts", async (t) => {
  const dir = workspace(t);
  const executable = fixtureAgent(dir, "kimi");
  const runners = new LocalRunners(() => {}, () => {});
  t.after(() => runners.dispose());
  fs.rmSync(executable);
  await assert.rejects(runners.start({ provider: "kimi-code", executable, directory: dir, taskId: "t", prompt: "x" }), /EXECUTABLE_MISSING/);
  // A configured path that no longer exists says so; a found file that will not run is reported as such.
  assert.equal((await detect("kimi-code", executable)).reason, "CONFIGURED_PATH_NOT_FOUND");
  const broken = path.join(dir, "broken-kimi");
  fs.writeFileSync(broken, "#!/nonexistent/interpreter\n");
  fs.chmodSync(broken, 0o755);
  if (process.platform !== "win32") {
    const cap = await detect("kimi-code", broken);
    assert.equal(cap.installed, true);
    assert.equal(cap.background, false);
    assert.match(cap.reason, /^EXECUTABLE_FAILED: /);
  }
});

