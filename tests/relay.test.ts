import { fixtureAgent } from "./fixture-agent";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../src/core/store";
import { LocalRunners } from "../src/providers/local";
import { RelayScheduler } from "../src/electron/relay";
import {
  composeRelayPrompt,
  relayDecision,
  relayPredecessorCandidates,
  validateRelay,
  type Relay,
  type RelayValues,
} from "../src/shared/relay";
import type { RunEvent } from "../src/shared/domain";

function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-relay 测试 "));
  const store = new ProjectStore(dir, "Relay project");
  t.after(async () => {
    try { store.close(); } catch {}
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const task = (title: string, extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title, assignees: ["claude"], ...extra } } });
    return id;
  };
  const command = (type: string, payload: unknown) => store.command({ id: randomUUID(), type, payload });
  const event = (input: Partial<RunEvent> & { sessionId: string; taskIds: string[] }) =>
    store.recordEvent({ id: randomUUID(), family: "claude", provider: "claude", model: "claude-opus-5-5", status: "running", source: "runner", at: new Date().toISOString(), message: "", lifecycle: "current", instanceId: "test", ...input } as RunEvent);
  return { dir, store, task, command, event };
}
const values = (taskId: string, extra: Partial<RelayValues> = {}): RelayValues => ({
  title: "", afterSessionId: null, trigger: { kind: "delay", ms: 1000 }, handoff: { provider: "codex", model: "", effort: "", mode: "", threadId: "", continueThread: false }, taskId, referenceTaskId: null, prompt: "Continue the work", ...extra,
});
const until = async (check: () => boolean, ms = 6000) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
};

test("relay decisions: timers, predecessor delivery, missed windows and blocking outcomes", (t) => {
  const { store, task, command, event } = setup(t);
  const taskId = task("Build", { artifacts: [{ id: "readme", label: "README", path: "README.md" }], handoff: "Keep the API stable" });
  const base = Date.now();
  let view = command("relay.create", { values: values(taskId), enabled: true });
  const timer = view.state.relays[0];
  assert.equal(timer.status, "scheduled");
  assert.ok(timer.dueAt);
  assert.equal(relayDecision(timer, view.state, base).action, "wait");
  assert.equal(relayDecision(timer, view.state, base + 2000).action, "fire");
  // Due time long before the scheduler came alive: missed, never auto-fired.
  assert.equal(relayDecision(timer, view.state, base + 20 * 60000, base + 20 * 60000).action, "missed");
  assert.equal(relayDecision(timer, view.state, base + 2000, base + 1500).action, "fire");
  event({ sessionId: "run-a", taskIds: [taskId], status: "running" });
  view = command("relay.create", { values: values(taskId, { afterSessionId: "run-a", trigger: { kind: "delay", ms: 60000 } }), enabled: true });
  const chained = view.state.relays.find((r) => r.afterSessionId === "run-a")!;
  assert.equal(relayDecision(chained, view.state, base).action, "wait");
  assert.equal(relayDecision(chained, view.state, base).reason, "PREDECESSOR_RUNNING");
  event({ sessionId: "run-a", taskIds: [taskId], status: "idle", lifecycle: "history", endReason: "completed", endedAt: new Date(base + 1000).toISOString(), at: new Date(base + 1000).toISOString() });
  const delivered = store.state();
  const fresh = delivered.relays.find((r) => r.id === chained.id)!;
  assert.equal(relayDecision(fresh, delivered, base + 30000).action, "wait");
  const fired = relayDecision(fresh, delivered, base + 62000);
  assert.equal(fired.action, "fire");
  assert.equal(fired.dueAt, new Date(base + 61000).toISOString());
  event({ sessionId: "run-b", taskIds: [taskId], status: "waiting", lifecycle: "history", endReason: "permission" });
  view = command("relay.create", { values: values(taskId, { afterSessionId: "run-b" }), enabled: true });
  const blocked = view.state.relays.find((r) => r.afterSessionId === "run-b")!;
  assert.deepEqual(relayDecision(blocked, view.state, base + 90000).action, "blocked");
  assert.equal(relayDecision(blocked, view.state, base + 90000).reason, "PREDECESSOR_PERMISSION");
  // Chained relays are refused: a relay result cannot be a predecessor.
  const withResult: Relay[] = [{ ...fresh, resultRunId: "run-a" }];
  assert.throws(() => validateRelay(values(taskId, { afterSessionId: "run-a" }), view.state, withResult), /RELAY_CHAIN_FORBIDDEN/);
  assert.throws(() => validateRelay(values(taskId, { trigger: { kind: "at", iso: new Date(base - 3600000).toISOString() } }), view.state, [], null, base), /RELAY_TIME_PAST/);
  assert.throws(() => validateRelay(values("missing"), view.state, []), /TASK_NOT_FOUND/);
  assert.throws(() => validateRelay(values(taskId, { handoff: { ...values(taskId).handoff, provider: "codex", continueThread: true }, afterSessionId: "run-a" }), view.state, []), /RELAY_THREAD_PROVIDER_MISMATCH/);
  validateRelay(values(taskId, { handoff: { ...values(taskId).handoff, provider: "claude", continueThread: true }, afterSessionId: "run-a" }), view.state, []);
  assert.ok(relayPredecessorCandidates(view.state, withResult).every((s) => s.sessionId !== "run-a"));
  const prompt = composeRelayPrompt({ prompt: "Go", referenceTaskId: null, afterSessionId: "run-a", taskId }, view.state);
  assert.match(composeRelayPrompt({ prompt: "Solo", referenceTaskId: null, afterSessionId: null, taskId }, view.state), /README\.md/);
  assert.match(prompt, /README\.md/);
  assert.match(prompt, /Keep the API stable/);
  assert.match(prompt, /Previous run: claude/);
});

test("relay commands are revision guarded, audited and human/system separated; task deletion respects relays", (t) => {
  const { store, task, command } = setup(t);
  const taskId = task("Write");
  let view = command("relay.create", { values: values(taskId), enabled: false });
  let relay = view.state.relays[0];
  assert.equal(relay.status, "paused");
  assert.throws(() => command("relay.update", { relayId: relay.id, expectedRevision: relay.revision + 5, values: values(taskId) }), /REVISION_CONFLICT/);
  view = command("relay.resume", { relayId: relay.id, expectedRevision: relay.revision });
  relay = view.state.relays[0];
  assert.equal(relay.status, "scheduled");
  assert.throws(() => command("relay.fired", { relayId: relay.id, runId: "x" }), /RELAY_NOT_FIRING/);
  view = command("relay.claim", { relayId: relay.id, expectedRevision: relay.revision, dueAt: new Date().toISOString() });
  relay = view.state.relays[0];
  assert.equal(relay.status, "firing");
  assert.throws(() => command("relay.delete", { relayId: relay.id, expectedRevision: relay.revision }), /RELAY_BUSY/);
  assert.throws(() => command("relay.update", { relayId: relay.id, expectedRevision: relay.revision, values: values(taskId) }), /RELAY_NOT_EDITABLE/);
  view = command("relay.fired", { relayId: relay.id, expectedRevision: relay.revision, runId: "run-1" });
  relay = view.state.relays[0];
  assert.equal(relay.status, "fired");
  assert.equal(relay.resultRunId, "run-1");
  assert.ok(relay.firedAt);
  const audits = store.queryAudit(0, 100).items.filter((a) => a.action.startsWith("relay."));
  assert.equal(audits.find((a) => a.action === "relay.create")?.context?.actor.kind, "human");
  assert.equal(audits.find((a) => a.action === "relay.claim")?.context?.actor.kind, "system");
  assert.deepEqual(audits.find((a) => a.action === "relay.fired")?.context?.tasks.map((x) => x.id), [taskId]);
  // A pending relay keeps its task from deletion; a fired one does not.
  const second = task("Second");
  view = command("relay.create", { values: values(second), enabled: true });
  const pending = view.state.relays.find((r) => r.taskId === second)!;
  const archived = command("task.archive", { taskId: second, expectedRevision: view.state.tasks.find((x) => x.id === second)!.revision });
  assert.throws(() => command("task.delete", { taskId: second, expectedRevision: archived.state.tasks.find((x) => x.id === second)!.revision }), /TASK_REFERENCED/);
  view = command("relay.cancel", { relayId: pending.id, expectedRevision: pending.revision });
  assert.equal(view.state.relays.find((r) => r.id === pending.id)!.status, "cancelled");
  const retryId = randomUUID();
  const first = store.command({ id: retryId, type: "relay.delete", payload: { relayId: pending.id, expectedRevision: pending.revision + 1 } });
  const again = store.command({ id: retryId, type: "relay.delete", payload: { relayId: pending.id, expectedRevision: pending.revision + 1 } });
  assert.equal(first.state.revision, again.state.revision);
  assert.ok(!again.state.relays.some((r) => r.id === pending.id));
  assert.ok(JSON.parse(fs.readFileSync(path.join(store.root, "snapshot.json"), "utf8")).relays);
});

test("scheduler claims first, fires once after delivery, records the handoff and marks failures and missed windows", async (t) => {
  const { dir, store, task, event } = setup(t);
  const taskId = task("Agent task");
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-relay-fixture-"));
  const executable = fixtureAgent(fixtureDir);
  const events: RunEvent[] = [];
  const runners = new LocalRunners((_d, e) => { events.push(e); try { store.recordEvent(e); } catch {} }, () => {});
  t.after(async () => {
    runners.dispose();
    await fs.promises.rm(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  let clock = Date.now();
  let starts = 0, failNext = false;
  const hooks = {
    directories: () => [dir],
    view: async () => store.view(),
    command: async (_d: string, type: string, payload: unknown) => store.command({ id: randomUUID(), type, payload }),
    start: async (_d: string, relay: Relay, _s: unknown, prompt: string) => {
      starts++;
      if (failNext) throw new Error("BACKGROUND_UNSUPPORTED");
      const result = await runners.start({ provider: "codex", executable, directory: dir, taskId: relay.taskId, prompt });
      return { runId: result.runId, threadId: result.threadId, to: "chatgpt" };
    },
    now: () => clock,
  };
  const scheduler = new RelayScheduler(hooks);
  const create = (extra: Partial<RelayValues>) => store.command({ id: randomUUID(), type: "relay.create", payload: { values: values(taskId, extra), enabled: true } }).state.relays.at(-1)!;
  const timer = create({ trigger: { kind: "delay", ms: 1000 } });
  await scheduler.tick();
  assert.equal(starts, 0);
  clock += 1500;
  await scheduler.tick();
  assert.equal(starts, 1);
  let current = store.state().relays.find((r) => r.id === timer.id)!;
  assert.equal(current.status, "fired");
  assert.ok(current.resultRunId);
  const handoff = store.state().handoffs.find((h) => h.relayId === timer.id)!;
  assert.equal(handoff.mode, "relay");
  assert.equal(handoff.sessionId, current.resultRunId);
  assert.match(handoff.prompt, /Agent task/);
  await scheduler.tick();
  assert.equal(starts, 1);
  await until(() => events.some((e) => e.sessionId === current.resultRunId && e.lifecycle === "history"));
  // A relay after that run delivers; the run's own relay result cannot be chained again.
  assert.throws(() => create({ afterSessionId: current.resultRunId! }), /RELAY_CHAIN_FORBIDDEN/);
  event({ sessionId: "manual-run", taskIds: [taskId], status: "running", at: new Date(clock).toISOString() });
  const follow = create({ afterSessionId: "manual-run", trigger: { kind: "delay", ms: 2000 } });
  await scheduler.tick();
  assert.equal(store.state().relays.find((r) => r.id === follow.id)!.status, "scheduled");
  event({ sessionId: "manual-run", taskIds: [taskId], status: "idle", lifecycle: "history", endReason: "completed", endedAt: new Date(clock).toISOString(), at: new Date(clock).toISOString() });
  await scheduler.tick();
  assert.equal(starts, 1);
  clock += 2500;
  await scheduler.tick();
  assert.equal(starts, 2);
  current = store.state().relays.find((r) => r.id === follow.id)!;
  assert.equal(current.status, "fired");
  assert.deepEqual(store.state().handoffs.find((h) => h.relayId === follow.id)!.from, ["claude"]);
  // Failures are recorded once and never retried automatically.
  failNext = true;
  const failing = create({ trigger: { kind: "delay", ms: 1000 } });
  clock += 1500;
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(starts, 3);
  current = store.state().relays.find((r) => r.id === failing.id)!;
  assert.equal(current.status, "failed");
  assert.match(current.lastError, /BACKGROUND_UNSUPPORTED/);
  failNext = false;
  // A due time that passed before the scheduler was alive is missed, not fired.
  const late = create({ trigger: { kind: "delay", ms: 1000 } });
  clock += 30 * 60000;
  const restarted = new RelayScheduler(hooks);
  await restarted.tick();
  assert.equal(starts, 3);
  current = store.state().relays.find((r) => r.id === late.id)!;
  assert.equal(current.status, "missed");
  // Manual confirmation runs it.
  store.command({ id: randomUUID(), type: "relay.fireNow", payload: { relayId: late.id, expectedRevision: current.revision } });
  await restarted.tick();
  assert.equal(starts, 4);
  assert.equal(store.state().relays.find((r) => r.id === late.id)!.status, "fired");
  assert.ok(restarted.summary().every((r) => r.directory === dir));
  await until(() => runners.active().length === 0);
});
