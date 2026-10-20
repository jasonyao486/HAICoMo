import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fixtureAgent } from "./fixture-agent";
import { LocalRunners, detect, type PermissionRequest, type RunOptions } from "../src/providers/local";
import { acpCommand, acpFlag, adapterFor } from "../src/providers/adapters";
import { BACKGROUND_EVIDENCE, CLIENTS, CLIENTS_BY_NAME, clientIcon } from "../src/shared/clients";
import { autoDecide, humanBlocker, structuredHandoff } from "../src/shared/autonomy";
import { composeAgentPrompt } from "../src/shared/agent-prompt";
import { composeRelayStepPrompt, relayNext, relayValuesSchema, RELAY_RECORD_EXCERPT_CHARS, type Relay, type RelayValues } from "../src/shared/relay";
import { ProjectStore } from "../src/core/store";
import { RelayScheduler, type RelayStartRequest } from "../src/electron/relay";
import { assertReady, mergeWorktree, prepareWorktree, WorktreeError } from "../src/core/worktree";
import type { RunEvent } from "../src/shared/domain";

const until = async (check: () => boolean, ms = 8000) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
};
const temp = (t: any, prefix: string) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(async () => fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
};
function runner(t: any, dialect: string) {
  const directory = temp(t, `haicomo 0.6.0 ${dialect} `);
  const executable = fixtureAgent(directory, dialect);
  const events: RunEvent[] = [];
  const permissions: PermissionRequest[] = [];
  const runners = new LocalRunners((_d, e) => events.push(e), (p) => permissions.push(p));
  t.after(() => runners.dispose());
  const requests = () =>
    fs.existsSync(path.join(directory, "requests.jsonl"))
      ? fs.readFileSync(path.join(directory, "requests.jsonl"), "utf8").trim().split(/\r?\n/).map((l) => JSON.parse(l))
      : [];
  const ended = () => events.find((e) => e.lifecycle === "history");
  return { directory, executable, events, permissions, runners, requests, ended };
}

test("clients: Hermes is listed, every list a person reads is A–Z, and its icon ships", () => {
  const hermes = CLIENTS.find((c) => c.id === "hermes");
  assert.ok(hermes);
  assert.equal(BACKGROUND_EVIDENCE.hermes, "documented");
  const names = CLIENTS_BY_NAME.map((c) => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  assert.equal(names[0], "Claude Code");
  assert.equal(names.at(-1), "WorkBuddy");
  assert.equal(clientIcon("hermes"), "/local-assets/hermes-app.svg");
  assert.ok(fs.existsSync(path.join("assets/runtime", "local-assets/hermes-app.svg")));
  // The internal order (and so stored data) is unchanged: Codex stays first.
  assert.equal(CLIENTS[0].id, "codex");
});

test("ACP launches are read from the installed CLI's help", () => {
  assert.deepEqual(acpFlag("  --acp   Start ACP"), ["--acp"]);
  assert.deepEqual(acpFlag("  --experimental-acp  Start ACP"), ["--experimental-acp"]);
  assert.equal(acpFlag("--acpx"), null);
  assert.deepEqual(acpCommand("Commands:\n  acp [options]   Run as an ACP server"), ["acp"]);
  assert.equal(acpCommand("--acp-like flag only"), null);
  for (const id of ["kimi-code", "gemini-cli", "qwen-code", "opencode", "github-copilot", "hermes"]) assert.ok(adapterFor(id)?.acp, id);
  for (const id of ["claude", "codex", "cursor", "deepseek-harness"]) assert.equal(adapterFor(id)?.acp, undefined, id);
});

test("detection: Kimi with `acp` uses the ACP channel and keeps its CLI as fallback; Hermes without it uses the CLI", async (t) => {
  const k = runner(t, "kimiacp");
  const cap = await detect("kimi-code", k.executable);
  assert.equal(cap.channel, "acp");
  assert.deepEqual(cap.acpArgs, ["acp"]);
  assert.equal(cap.cliReady, true);
  assert.equal(cap.background, true);
  const h = runner(t, "hermes");
  const hc = await detect("hermes", h.executable);
  assert.equal(hc.channel, "acp");
  assert.equal(hc.cliReady, true);
  const hcli = runner(t, "hermescli");
  const hcap = await detect("hermes", hcli.executable);
  assert.equal(hcap.channel, "cli");
  assert.equal(hcap.background, true);
  await hcli.runners.start({ provider: "hermes", executable: hcli.executable, directory: hcli.directory, taskId: "t", prompt: "hello", channel: "cli" });
  await until(() => Boolean(hcli.ended()));
  assert.equal(hcli.ended()!.endReason, "completed");
  assert.match(hcli.ended()!.message, /Hermes fixture output/);
  assert.deepEqual(hcli.requests().find((r) => r.args)?.args.slice(0, 2), ["chat", "--quiet"]);
});

const acpOptions = (r: ReturnType<typeof runner>, extra: Partial<RunOptions> = {}): RunOptions => ({
  provider: "kimi-code",
  executable: r.executable,
  directory: r.directory,
  taskId: "task",
  prompt: "do it",
  channel: "acp",
  acpArgs: ["acp"],
  cliReady: true,
  ...extra,
});

test("ACP: handshake, streamed answer and end_turn certify a completed run; unsupported client requests are refused", async (t) => {
  const r = runner(t, "kimiacp");
  const started = await r.runners.start(acpOptions(r, { prompt: "line\nhandoff-record" }));
  assert.equal(started.threadId, "acp-session");
  await until(() => Boolean(r.ended()));
  const end = r.ended()!;
  assert.equal(end.endReason, "completed");
  assert.match(end.message, /ACP fixture output/);
  const record = structuredHandoff(end.message);
  assert.deepEqual(record?.artifacts, ["notes.md", "missing.md"]);
  assert.equal(record?.open, "无");
  const init = r.requests().find((m) => m.method === "initialize");
  assert.equal(init.jsonrpc, "2.0");
  assert.equal(init.params.protocolVersion, 1);
  assert.deepEqual(init.params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false });
  // No session events before the prompt was actually sent.
  assert.equal(r.events[0].status, "unknown");

  // An end_turn with no reply and no tool call (an exhausted plan, seen with Kimi 2.2.0) is not a delivery.
  const empty = runner(t, "kimiacp");
  await empty.runners.start(acpOptions(empty, { prompt: "acp-empty" }));
  await until(() => Boolean(empty.ended()));
  assert.equal(empty.ended()!.endReason, "failed");
  assert.match(empty.ended()!.message, /ACP_EMPTY_TURN/);
  assert.ok(humanBlocker(empty.ended()!.message), "a relay asks the human instead of retrying blindly");

  const fsRun = runner(t, "kimiacp");
  await fsRun.runners.start(acpOptions(fsRun, { prompt: "acp-fs" }));
  await until(() => Boolean(fsRun.ended()));
  assert.match(fsRun.ended()!.message, /fs:error -32601/);
});

test("ACP: permission prompts are answered in HAICoMo, once, never 'always'; cancel ends with stopReason cancelled", async (t) => {
  const r = runner(t, "kimiacp");
  const { runId } = await r.runners.start(acpOptions(r, { prompt: "acp-permission" }));
  await until(() => r.permissions.length === 1);
  const p = r.permissions[0];
  assert.equal(p.method, "acp/request_permission");
  assert.equal(r.events.at(-1)!.status, "waiting");
  r.runners.respond(runId, p.id, p.method, true);
  await until(() => Boolean(r.ended()));
  assert.match(r.ended()!.message, /permission:ok/);

  const d = runner(t, "kimiacp");
  const second = await d.runners.start(acpOptions(d, { prompt: "acp-permission" }));
  await until(() => d.permissions.length === 1);
  d.runners.respond(second.runId, d.permissions[0].id, d.permissions[0].method, false);
  await until(() => Boolean(d.ended()));
  assert.match(d.ended()!.message, /permission:no/);

  const c = runner(t, "kimiacp");
  const held = await c.runners.start(acpOptions(c, { prompt: "acp-hold" }));
  await c.runners.cancel(held.runId);
  await until(() => Boolean(c.ended()));
  assert.equal(c.ended()!.endReason, "cancelled");
  assert.ok(c.requests().some((m) => m.method === "session/cancel" && m.params.sessionId === "acp-session"));
});

test("ACP: a model the session offers is set; one it lacks falls back to the CLI before anything is sent", async (t) => {
  const r = runner(t, "kimiacp");
  await r.runners.start(acpOptions(r, { model: "fixture-b" }));
  await until(() => Boolean(r.ended()));
  assert.ok(r.requests().some((m) => m.method === "session/set_config_option" && m.params.configId === "model" && m.params.value === "fixture-b"));
  const f = runner(t, "kimiacp");
  await f.runners.start(acpOptions(f, { model: "not-offered" }));
  await until(() => Boolean(f.ended()));
  assert.match(f.ended()!.message, /Kimi fixture output/);
  assert.ok(!f.requests().some((m) => m.method === "session/prompt"));
  assert.ok(f.requests().some((m) => Array.isArray(m.args) && m.args.includes("--prompt")));
  // Resuming loads the session and does not replay its history as new output.
  const l = runner(t, "kimiacp");
  await l.runners.start(acpOptions(l, { threadId: "acp-session" }));
  await until(() => Boolean(l.ended()));
  assert.ok(l.requests().some((m) => m.method === "session/load"));
  assert.doesNotMatch(l.ended()!.message, /OLD HISTORY/);
  // A sign-in the ACP server needs is reported, not silently routed elsewhere.
  const a = runner(t, "kimiacpauth");
  await assert.rejects(a.runners.start(acpOptions(a, { executable: a.executable })), /ACP_AUTH_REQUIRED/);
  assert.equal(a.events.length, 0);
});

test("unattended answers: ACP picks allow_once, declines destructive commands, and leaves 'always'-only prompts to the human", () => {
  const options = [
    { optionId: "ok", name: "Allow once", kind: "allow_once" },
    { optionId: "always", name: "Always", kind: "allow_always" },
    { optionId: "no", name: "Reject", kind: "reject_once" },
  ];
  const dir = "/work/project";
  const allow = autoDecide("acp/request_permission", { toolCall: { kind: "edit", title: "Edit", locations: [{ path: "/work/project/a.md" }] }, options }, dir);
  assert.equal(allow.kind, "answer");
  assert.deepEqual(allow.kind === "answer" && allow.answers, { optionId: "ok" });
  const destructive = autoDecide("acp/request_permission", { toolCall: { kind: "execute", rawInput: { command: "git reset --hard" } }, options }, dir);
  assert.equal(destructive.kind === "answer" && destructive.allow, false);
  assert.deepEqual(destructive.kind === "answer" && destructive.answers, { optionId: "no" });
  const deletion = autoDecide("acp/request_permission", { toolCall: { kind: "delete", locations: [{ path: "/etc/hosts" }] }, options }, dir);
  assert.equal(deletion.kind === "answer" && deletion.allow, false);
  assert.equal(autoDecide("acp/request_permission", { toolCall: { kind: "edit" }, options: [options[1]] }, dir).kind, "human");
  // Claude host channel: Bash is checked, writes outside the project are declined, user-forced asks stay human.
  assert.equal((autoDecide("claude/can_use_tool", { tool_name: "Bash", input: { command: "npm test" } }, dir) as any).allow, true);
  assert.equal((autoDecide("claude/can_use_tool", { tool_name: "Bash", input: { command: "sudo rm -rf /" } }, dir) as any).allow, false);
  assert.equal((autoDecide("claude/can_use_tool", { tool_name: "Write", input: { file_path: "/work/project/notes.md" } }, dir) as any).allow, true);
  assert.equal((autoDecide("claude/can_use_tool", { tool_name: "Write", input: { file_path: "/etc/zshrc" } }, dir) as any).allow, false);
  assert.equal(autoDecide("claude/can_use_tool", { tool_name: "Write", input: {}, matched_ask_rule: { source: "user", tool_name: "Write" } }, dir).kind, "human");
});

test("Claude host channel: detected from help, prompts answered in HAICoMo, interrupt certifies cancellation", async (t) => {
  const r = runner(t, "claudehost");
  const cap = await detect("claude", r.executable);
  assert.equal(cap.channel, "host");
  assert.equal(cap.autonomousMode, "default");
  const base = { provider: "claude" as const, executable: r.executable, directory: r.directory, taskId: "task", channel: "host" as const };
  const { runId } = await r.runners.start({ ...base, prompt: "host-permission" });
  await until(() => r.permissions.length === 1);
  const p = r.permissions[0];
  assert.equal(p.method, "claude/can_use_tool");
  r.runners.respond(runId, p.id, p.method, true);
  await until(() => Boolean(r.ended()));
  assert.equal(r.ended()!.endReason, "completed");
  assert.match(r.ended()!.message, /decision:allow/);
  const answer = r.requests().find((m) => m.type === "control_response");
  assert.deepEqual(answer.response.response, { behavior: "allow", updatedInput: { file_path: "notes.md", content: "x" } });
  const args = r.requests().find((m) => m.args)?.args as string[];
  assert.ok(args.includes("--permission-prompts") && args[args.indexOf("--permission-prompts") + 1] === "host");
  assert.ok(args.includes("--input-format"));

  const d = runner(t, "claudehost");
  const denied = await d.runners.start({ ...base, executable: d.executable, directory: d.directory, prompt: "host-permission" });
  await until(() => d.permissions.length === 1);
  d.runners.respond(denied.runId, d.permissions[0].id, d.permissions[0].method, false);
  await until(() => Boolean(d.ended()));
  // A denial made in HAICoMo is a decision, not an unanswered prompt.
  assert.equal(d.ended()!.endReason, "completed");

  const c = runner(t, "claudehost");
  const held = await c.runners.start({ ...base, executable: c.executable, directory: c.directory, prompt: "host-hold" });
  await new Promise((res) => setTimeout(res, 200));
  await c.runners.cancel(held.runId);
  await until(() => Boolean(c.ended()));
  assert.equal(c.ended()!.endReason, "cancelled");
  assert.ok(c.requests().some((m) => m.type === "control_request" && m.request?.subtype === "interrupt"));
});

test("delivery records: parsed in either language and passed on to the next stage instead of a long excerpt", (t) => {
  const record = structuredHandoff("work…\nHAICOMO-HANDOFF-BEGIN\n- goal: Ship the API\n- artifacts: src/api.ts; docs/api.md\n- evidence: npm test passed\n  and the e2e run\n- next: review\n- open: none\nHAICOMO-HANDOFF-END\n");
  assert.deepEqual(record, { goal: "Ship the API", artifacts: ["src/api.ts", "docs/api.md"], evidence: "npm test passed\nand the e2e run", next: "review", open: "none" });
  assert.equal(structuredHandoff("no block here"), null);
  // "None" in any language is not a path.
  assert.deepEqual(structuredHandoff("HAICOMO-HANDOFF-BEGIN\n产物: 无\nHAICOMO-HANDOFF-END")?.artifacts, []);

  const dir = temp(t, "haicomo record ");
  const store = new ProjectStore(dir, "Records");
  t.after(() => store.close());
  const mk = (title: string) => {
    const id = randomUUID();
    store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title } } });
    return id;
  };
  const a = mk("A"), b = mk("B");
  const runId = randomUUID();
  const long = `${"x".repeat(5000)}\nHAICOMO-HANDOFF-BEGIN\n目标: 完成 A\n产物: a.md\n证据: 测试通过\n下一步: B 接手\n未决问题: 无\nHAICOMO-HANDOFF-END`;
  store.recordEvent({ id: randomUUID(), sessionId: runId, family: null, provider: "codex", model: "m", taskIds: [a], status: "idle", source: "runner", at: new Date().toISOString(), endedAt: new Date().toISOString(), message: long.slice(-12000), lifecycle: "history", endReason: "completed", instanceId: "test" } as RunEvent);
  const values = relayValuesSchema.parse({ trigger: { kind: "delay", ms: 1000 }, stages: [{ steps: [{ provider: "codex", taskId: a, prompt: "A" }] }, { steps: [{ provider: "codex", taskId: b, prompt: "B" }] }] });
  const relay = { ...values, stages: values.stages.map((s, i) => ({ steps: s.steps.map((st) => ({ ...st, runId: i === 0 ? runId : null })) })) } as any;
  const prompt = composeRelayStepPrompt(relay, 1, values.stages[1].steps[0], store.state(), dir, "zh-CN");
  assert.match(prompt, /交付记录\n智能体自述，HAICoMo 未核实。\n目标: 完成 A\n产物: a\.md/);
  const excerpt = prompt.slice(prompt.indexOf("<<<"), prompt.indexOf(">>>"));
  assert.ok(excerpt.length < RELAY_RECORD_EXCERPT_CHARS + 200);
  // The structured block is not repeated inside the excerpt.
  assert.doesNotMatch(excerpt, /HAICOMO-HANDOFF/);
  // Every task prompt asks for the record; a project-only connection does not.
  assert.match(prompt, /HAICOMO-HANDOFF-BEGIN 与 HAICOMO-HANDOFF-END/);
  assert.doesNotMatch(composeAgentPrompt(dir, store.state(), "en-GB"), /HAICOMO-HANDOFF-BEGIN/);
});

test("return with comments: the prompt carries the review and the last record; the return is audited and counted", (t) => {
  const dir = temp(t, "haicomo return ");
  const store = new ProjectStore(dir, "Return");
  t.after(() => store.close());
  const id = randomUUID();
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title: "Write docs", status: "delivered" } } });
  const prompt = composeAgentPrompt(dir, store.state(), "en-GB", id, "", undefined, undefined, { review: { comment: "Add the Windows steps.", previous: { goal: "Docs", artifacts: ["docs/a.md"], evidence: "", next: "", open: "" } } });
  assert.match(prompt, /Returned at acceptance review\n.*\nReviewer's comments:\n<<<\nAdd the Windows steps\.\n>>>/);
  assert.match(prompt, /Previous delivery record\nSelf-reported by the agent; not verified by HAICoMo\.\nGoal: Docs\nArtifacts: docs\/a\.md/);
  const task = store.state().tasks.find((x) => x.id === id)!;
  store.command({ id: randomUUID(), type: "task.return", payload: { taskId: id, expectedRevision: task.revision, reason: "Add the Windows steps." } });
  assert.equal(store.state().tasks.find((x) => x.id === id)!.status, "doing");
  assert.equal(store.state().historyStats.acceptanceReturns, 1);
});

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
function repo(t: any) {
  const root = temp(t, "haicomo wt ");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "HAICoMo Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(root, "app.txt"), "one\ntwo\nthree\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { root, git };
}

test("worktrees: one branch per step, HAICoMo's own files ignored, merged with --no-ff, conflicts aborted and kept", { skip: !gitAvailable }, async (t) => {
  const { root, git } = repo(t);
  // HAICoMo's own data never makes the tree dirty.
  fs.mkdirSync(path.join(root, ".haicomo"), { recursive: true });
  fs.writeFileSync(path.join(root, ".haicomo", "project.sqlite"), "db");
  await assertReady(root, root);
  const a = await prepareWorktree(root, "relay-1234567890", "A1");
  const b = await prepareWorktree(root, "relay-1234567890", "A2");
  assert.equal(a.branch, "haicomo/relay-12/a1");
  assert.ok(a.path.startsWith(path.join(root, ".haicomo", "worktrees")));
  assert.match(fs.readFileSync(path.join(root, ".haicomo", ".gitignore"), "utf8"), /^worktrees\/$/m);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  // Retrying a step continues in the same copy.
  assert.deepEqual(await prepareWorktree(root, "relay-1234567890", "A1"), a);
  fs.writeFileSync(path.join(a.cwd, "app.txt"), "one\nTWO-A\nthree\n");
  fs.writeFileSync(path.join(a.cwd, "new-a.txt"), "a\n");
  fs.writeFileSync(path.join(b.cwd, "app.txt"), "one\nTWO-B\nthree\n");
  const first = await mergeWorktree(root, a, "HAICoMo relay A1: first");
  assert.equal(first.removed, true);
  assert.equal(fs.readFileSync(path.join(root, "app.txt"), "utf8"), "one\nTWO-A\nthree\n");
  assert.ok(fs.existsSync(path.join(root, "new-a.txt")));
  assert.equal(git("rev-list", "--parents", "-n", "1", "HEAD").split(" ").length, 3, "a merge commit");
  assert.equal(git("branch", "--list", a.branch), "");
  await assert.rejects(mergeWorktree(root, b, "HAICoMo relay A2: second"), (e: any) => e instanceof WorktreeError && e.code === "WORKTREE_MERGE_CONFLICT");
  // The conflicting merge was aborted: nothing half-merged, the branch and copy remain.
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  assert.notEqual(git("branch", "--list", b.branch), "");
  assert.ok(fs.existsSync(b.path));
  // A human resolves it by merging the branch; HAICoMo's retry then finds nothing left to do.
  try { git("merge", "--no-ff", "-m", "manual", b.branch); } catch {}
  fs.writeFileSync(path.join(root, "app.txt"), "one\nTWO-A+B\nthree\n");
  git("add", "app.txt");
  git("commit", "-q", "-m", "resolved");
  const again = await mergeWorktree(root, b, "HAICoMo relay A2: second");
  assert.equal(again.removed, true);
  // A dirty tree or missing identity is reported, never worked around.
  fs.writeFileSync(path.join(root, "app.txt"), "dirty\n");
  await assert.rejects(assertReady(root, root), (e: any) => e.code === "WORKTREE_DIRTY");
  git("checkout", "--", "app.txt");
  const c = await prepareWorktree(root, "relay-1234567890", "B1");
  fs.writeFileSync(path.join(c.cwd, "c.txt"), "c\n");
  git("config", "user.name", "");
  await assert.rejects(mergeWorktree(root, c, "msg"), (e: any) => e.code === "WORKTREE_IDENTITY");
});

test("relays with worktrees: each parallel step gets a working copy in its prompt; the stage merges before the next starts", async (t) => {
  const dir = temp(t, "haicomo wt relay ");
  const store = new ProjectStore(dir, "WT");
  t.after(() => store.close());
  const mk = (title: string) => {
    const id = randomUUID();
    store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title } } });
    return id;
  };
  const a1 = mk("A1"), a2 = mk("A2"), b1 = mk("B1");
  const values: RelayValues = relayValuesSchema.parse({ worktrees: true, trigger: { kind: "delay", ms: 1000 }, stages: [{ steps: [a1, a2].map((taskId) => ({ provider: "codex", taskId, prompt: "x" })) }, { steps: [{ provider: "codex", taskId: b1, prompt: "y" }] }] });
  const relay = store.command({ id: randomUUID(), type: "relay.create", payload: { values, enabled: true } }).state.relays[0];
  let clock = Date.now() + 5000;
  const starts: RelayStartRequest[] = [];
  const merges: string[] = [];
  const active = new Set<string>();
  let conflict = true;
  const scheduler = new RelayScheduler({
    directories: () => [dir],
    view: async () => store.view(),
    command: async (_d, type, payload) => store.command({ id: randomUUID(), type, payload }),
    worktree: async (directory, r, _k, _s, label) => {
      const where = path.join(directory, ".haicomo", "worktrees", r.id.slice(0, 8), label.toLowerCase());
      fs.mkdirSync(where, { recursive: true });
      return { path: where, branch: `haicomo/${r.id.slice(0, 8)}/${label.toLowerCase()}`, cwd: where };
    },
    merge: async (_d, _r, step, label) => {
      if (label === "A2" && conflict) {
        conflict = false;
        throw new WorktreeError("WORKTREE_MERGE_CONFLICT", step.worktree!.branch);
      }
      merges.push(label);
      return { commit: "abc", removed: true };
    },
    start: async (_d, request) => {
      starts.push(request);
      const runId = randomUUID();
      active.add(runId);
      store.recordEvent({ id: randomUUID(), sessionId: runId, family: null, provider: "codex", model: "m", taskIds: [request.step.taskId], status: "running", source: "runner", at: new Date(clock).toISOString(), message: "", lifecycle: "current", instanceId: "test" } as RunEvent);
      return { runId, to: "client:codex" };
    },
    activeRunIds: () => [...active],
    now: () => clock,
  });
  await scheduler.tick();
  assert.equal(starts.length, 2);
  assert.ok(starts.every((s) => s.workCopy && s.prompt.includes(JSON.stringify(s.workCopy.cwd))));
  let r = store.state().relays.find((x) => x.id === relay.id)!;
  assert.ok(r.stages[0].steps.every((s) => s.worktree && s.worktree.mergedAt === null));
  for (const s of r.stages[0].steps) {
    active.delete(s.runId!);
    store.recordEvent({ id: randomUUID(), sessionId: s.runId!, family: null, provider: "codex", model: "m", taskIds: [s.taskId], status: "idle", source: "runner", at: new Date(clock).toISOString(), endedAt: new Date(clock).toISOString(), message: "done", lifecycle: "history", endReason: "completed", instanceId: "test" } as RunEvent);
  }
  assert.deepEqual(relayNext(store.state().relays[0], store.state(), { now: clock, aliveSince: null, inFlight: false }), { action: "merge", stage: 0, stepId: r.stages[0].steps[0].id });
  await scheduler.tick();
  r = store.state().relays.find((x) => x.id === relay.id)!;
  assert.equal(r.status, "blocked");
  assert.equal(r.statusReason, "WORKTREE_MERGE_CONFLICT");
  assert.match(r.lastError, /haicomo\//);
  assert.deepEqual(merges, ["A1"]);
  assert.equal(starts.length, 2, "stage B waits for the merge");
  // The human merged it; "continue" resumes and the merge is retried.
  store.command({ id: randomUUID(), type: "relay.resume", payload: { relayId: r.id, expectedRevision: r.revision } });
  await scheduler.tick();
  await scheduler.tick();
  r = store.state().relays.find((x) => x.id === relay.id)!;
  assert.deepEqual(merges, ["A1", "A2"]);
  assert.ok(r.stages[0].steps.every((s) => s.worktree?.mergedAt));
  assert.equal(starts.length, 3);
  // Stage B has one step: it works in the project folder itself.
  assert.equal(starts[2].workCopy, null);
  // Reported paths outside .haicomo/worktrees are refused by the store.
  const outside = store.state().relays[0];
  assert.throws(() => store.command({ id: randomUUID(), type: "relay.stepMerged", payload: { relayId: outside.id, expectedRevision: outside.revision, stepId: "nope" } }));
});
