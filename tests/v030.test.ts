import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../src/core/store";
import { readSnapshot } from "../src/core/files";
import { helpChoices, parseCmdShim, resolveLaunch, CLAUDE_FALLBACK_MODES, FORBIDDEN_MODES } from "../src/providers/local";
import { capabilityEfforts, modeArguments } from "../src/shared/capabilities";
import { errorData } from "../src/shared/errors";
import { formatDuration, dictionaries } from "../src/ui/i18n";

function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-030 "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("projects get Git hygiene files once and a lock left by another computer needs explicit takeover", (t) => {
  const dir = setup(t);
  let store = new ProjectStore(dir, "Git project");
  const ignore = path.join(dir, ".haicomo/.gitignore"), attributes = path.join(dir, ".haicomo/.gitattributes");
  assert.match(fs.readFileSync(ignore, "utf8"), /writer\.lock/);
  assert.match(fs.readFileSync(attributes, "utf8"), /-text/);
  fs.writeFileSync(ignore, "# mine\n");
  store.close();
  store = new ProjectStore(dir);
  assert.equal(fs.readFileSync(ignore, "utf8"), "# mine\n");
  store.close();
  const lockFile = path.join(dir, ".haicomo/writer.lock");
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 1, hostname: "other-computer", token: "t", at: "2026-10-01T00:00:00.000Z", app: "HAICoMo" }));
  let failure: unknown;
  try { new ProjectStore(dir); } catch (e) { failure = e; }
  const data = errorData(failure);
  assert.equal(data.code, "PROJECT_LOCKED_OTHER_HOST");
  assert.equal(JSON.parse(data.details!).hostname, "other-computer");
  assert.ok(fs.existsSync(lockFile));
  assert.throws(() => ProjectStore.takeoverForeignLock(path.join(dir, "..")), /ENOENT|LOCK_NOT_FOREIGN/);
  const lock = ProjectStore.takeoverForeignLock(dir);
  assert.equal(lock.hostname, "other-computer");
  store = new ProjectStore(dir);
  t.after(() => { try { store.close(); } catch {} });
  store.auditLockTakeover(lock, "Jason");
  const audit = store.queryAudit().items.find((a) => a.action === "project.lock.takeover")!;
  assert.equal((audit.before as any).hostname, "other-computer");
  assert.equal(audit.context?.actor.name, "Jason");
  assert.throws(() => ProjectStore.takeoverForeignLock(dir), /LOCK_NOT_FOREIGN/);
  const current = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  assert.equal(current.pid, process.pid);
  assert.ok(current.at);
});
test("in-flight runner telemetry defers the snapshot write; commands, history and close flush immediately", async (t) => {
  const dir = setup(t);
  const store = new ProjectStore(dir, "Telemetry");
  t.after(() => { try { store.close(); } catch {} });
  const taskId = randomUUID();
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: taskId, expectedRevision: null, values: { title: "Run", assignees: ["claude"] } } });
  const base = store.state().revision;
  assert.equal(readSnapshot(dir).revision, base);
  const event = (extra: Record<string, unknown>) => store.recordEvent({ id: randomUUID(), sessionId: "s", family: "claude", provider: "claude", model: "m", taskIds: [taskId], status: "running", source: "runner", at: new Date().toISOString(), message: "", lifecycle: "current", ...extra } as any);
  event({});
  event({});
  assert.equal(store.state().revision, base + 2);
  assert.equal(readSnapshot(dir).revision, base, "telemetry does not rewrite the snapshot synchronously");
  assert.equal(store.flushPublish(), true);
  assert.equal(readSnapshot(dir).revision, base + 2);
  event({});
  event({ status: "idle", lifecycle: "history", endReason: "completed", endedAt: new Date().toISOString() });
  assert.equal(readSnapshot(dir).revision, base + 4, "a lifecycle event publishes immediately");
  event({ sessionId: "later" });
  assert.equal(readSnapshot(dir).revision, base + 4);
  store.close();
  assert.equal(readSnapshot(dir).revision, base + 5, "close flushes deferred telemetry");
});
test("Windows npm shims resolve to a Node launch and help text yields modes and efforts", () => {
  const shim = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n`;
  const target = parseCmdShim(shim, "C:\\Users\\me\\AppData\\Roaming\\npm");
  assert.ok(target?.endsWith(path.join("node_modules", "@openai", "codex", "bin", "codex.js")));
  assert.equal(parseCmdShim("@echo off\r\nnothing here", "x"), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-shim-"));
  try {
    const script = path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "console.log('cli')");
    const cmd = path.join(dir, "claude.cmd");
    fs.writeFileSync(cmd, `"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*`);
    const launch = resolveLaunch(cmd, "win32");
    assert.equal(launch.prefix.at(-1), script);
    assert.ok(launch.command.length > 0);
    assert.deepEqual(resolveLaunch(cmd, "darwin"), { command: cmd, prefix: [] });
    assert.deepEqual(resolveLaunch("/usr/local/bin/claude", "win32"), { command: "/usr/local/bin/claude", prefix: [] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const help = `Options:\n  --effort <level>                      Effort level for the current session\n                                        (low, medium, high, xhigh, max)\n  --model <model>                       Model for the current session.\n  --permission-mode <mode>              Permission mode to use for the session\n                                        (choices: "acceptEdits", "auto",\n                                        "bypassPermissions", "manual",\n                                        "dontAsk", "plan")\n  --permission-prompts <target>         Who answers permission prompts\n`;
  assert.deepEqual(helpChoices(help, "--permission-mode"), ["acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"]);
  assert.deepEqual(helpChoices(help, "--effort"), ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(helpChoices("--listen --resume --model stream-json", "--permission-mode"), []);
  assert.ok(CLAUDE_FALLBACK_MODES.every((m) => !FORBIDDEN_MODES.includes(m)));
  const claude: any = { provider: "claude", efforts: ["low", "high"], modes: ["plan"] };
  const codex: any = { provider: "codex", models: [{ id: "a", efforts: ["x"], isDefault: true }, { id: "b", efforts: [], isDefault: false }], modes: [] };
  assert.deepEqual(capabilityEfforts(claude, "any"), ["low", "high"]);
  assert.deepEqual(capabilityEfforts(codex), ["x"]);
  assert.deepEqual(capabilityEfforts(codex, "b"), []);
  assert.deepEqual(modeArguments("claude", "plan", "high"), ["--permission-mode", "plan", "--effort", "high"]);
  assert.deepEqual(modeArguments("codex", "never", ""), ["-a", "never"]);
  const t = (key: any) => (dictionaries["en-US"] as any)[key];
  assert.equal(formatDuration(16553, t), "17 s");
  assert.equal(formatDuration(3 * 60000 + 4000, t), "3 min 4 s");
  assert.equal(formatDuration(3600000 * 2 + 60000, t), "2 h 1 min");
  assert.equal(formatDuration(0, t), "—");
  for (const locale of Object.keys(dictionaries) as (keyof typeof dictionaries)[])
    for (const key of ["relay", "relayFireNow", "errRevisionConflict", "lockTakeoverConfirm", "modePlan"])
      assert.ok((dictionaries[locale] as any)[key], `${locale} ${key}`);
});
