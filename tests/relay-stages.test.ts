import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ProjectStore, CURRENT_SCHEMA } from "../src/core/store";
import { RelayScheduler, type RelayStartRequest } from "../src/electron/relay";
import {
  composeRelayStepPrompt,
  relayDecisionReport,
  relayProgress,
  relayValuesSchema,
  upgradeRelayV5,
  validateRelay,
  type Relay,
  type RelayValues,
} from "../src/shared/relay";
import { assertTaskRunnable, type RunEvent } from "../src/shared/domain";
import { autoDecide, humanBlocker, isDestructiveCommand, needsHuman, selfReportedDecisions } from "../src/shared/autonomy";

function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-stages 接力 "));
  const store = new ProjectStore(dir, "Stages");
  t.after(async () => {
    try { store.close(); } catch {}
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const task = (title: string, extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title, ...extra } } });
    return id;
  };
  const command = (type: string, payload: unknown) => store.command({ id: randomUUID(), type, payload });
  return { dir, store, task, command };
}
const step = (taskId: string, extra: Record<string, unknown> = {}) => ({ provider: "codex", model: "", effort: "", mode: "", threadId: "", continueThread: false, taskId, referenceTaskId: null, prompt: `Work on ${taskId.slice(0, 4)}`, ...extra });
const relayValues = (stages: string[][], extra: Partial<RelayValues> = {}): RelayValues =>
  relayValuesSchema.parse({ title: "Pipeline", afterSessionId: null, trigger: { kind: "delay", ms: 1000 }, stages: stages.map((ids) => ({ steps: ids.map((id) => step(id)) })), ...extra });

/** A scheduler over a real store with a fake starter; runs end only when the test says so. */
function harness(t: any, opts: { fail?: (taskId: string) => boolean } = {}) {
  const env = setup(t);
  let clock = Date.now();
  const starts: RelayStartRequest[] = [];
  const attention: Relay[] = [];
  const active = new Set<string>();
  const scheduler = new RelayScheduler({
    directories: () => [env.dir],
    view: async () => env.store.view(),
    command: async (_d, type, payload) => env.store.command({ id: randomUUID(), type, payload }),
    start: async (_d, request) => {
      starts.push(request);
      if (opts.fail?.(request.step.taskId)) throw new Error("BACKGROUND_UNSUPPORTED");
      const runId = randomUUID();
      active.add(runId);
      env.store.recordEvent({ id: randomUUID(), sessionId: runId, family: null, provider: request.step.provider as any, model: "fixture", taskIds: [request.step.taskId], status: "running", source: "runner", at: new Date(clock).toISOString(), message: "", lifecycle: "current", instanceId: "test" } as RunEvent);
      return { runId, to: "client:codex" };
    },
    activeRunIds: () => [...active],
    attention: (_d, relay) => attention.push(relay),
    now: () => clock,
  });
  const end = (taskId: string, endReason: RunEvent["endReason"] = "completed", message = `${taskId.slice(0, 4)} delivered`) => {
    const request = [...starts].reverse().find((s) => s.step.taskId === taskId)!;
    const relay = env.store.state().relays.find((r) => r.id === request.relay.id)!;
    const runId = relay.stages.flatMap((s) => s.steps).find((s) => s.id === request.step.id)!.runId!;
    active.delete(runId);
    env.store.recordEvent({ id: randomUUID(), sessionId: runId, family: null, provider: "codex", model: "fixture", taskIds: [taskId], status: endReason === "completed" ? "idle" : "error", source: "runner", at: new Date(clock).toISOString(), endedAt: new Date(clock).toISOString(), message, lifecycle: "history", endReason, instanceId: "test" } as RunEvent);
  };
  const relay = (id: string) => env.store.state().relays.find((r) => r.id === id)!;
  // Relays are armed at the real time of their creation; slow storage (Windows runners)
  // can put that after the simulated clock, so advancing never starts behind real time.
  return { ...env, scheduler, starts, attention, end, relay, advance: (ms: number) => (clock = Math.max(clock, Date.now()) + ms) };
}

test("validation: limits, duplicate tasks per stage, stage order, continue-thread, providers and consent", (t) => {
  const { store, task } = setup(t);
  const a = task("A"), b = task("B"), c = task("C", { dependencies: [] });
  const state = store.state();
  assert.throws(() => relayValuesSchema.parse({ trigger: { kind: "delay", ms: 1000 }, stages: [[a], [a], [a], [a]].map((ids) => ({ steps: ids.map((id) => step(id)) })) }));
  assert.throws(() => relayValuesSchema.parse({ trigger: { kind: "delay", ms: 1000 }, stages: [{ steps: [a, b, c, a].map((id) => step(id)) }] }));
  assert.throws(() => validateRelay(relayValues([[a, a]]), state, []), /RELAY_DUPLICATE_STAGE_TASK/);
  validateRelay(relayValues([[a], [a]]), state, []); // the same task may be built and then reviewed
  const v = relayValues([[a], [b]]);
  v.stages[1].steps[0].continueThread = true;
  assert.throws(() => validateRelay(v, state, []), /RELAY_CONTINUE_STAGE_A_ONLY/);
  const w = relayValues([[a, b]]);
  w.stages[0].steps[0].threadId = "t-1";
  w.stages[0].steps[1].threadId = "t-1";
  assert.throws(() => validateRelay(w, state, []), /RELAY_DUPLICATE_THREAD/);
  const manual = relayValues([[a]]);
  (manual.stages[0].steps[0] as any).provider = "workbuddy";
  assert.throws(() => validateRelay(manual, state, []), /RELAY_PROVIDER_UNSUPPORTED/);
  assert.throws(() => validateRelay(relayValues([[a]], { autonomy: { enabled: true, consentedAt: null } }), state, []), /RELAY_AUTONOMY_CONSENT_REQUIRED/);
  // A depends on B, but B runs in the same or a later stage: guaranteed deadlock.
  const dep = task("Dependent", { dependencies: [b] });
  const withDep = store.state();
  assert.throws(() => validateRelay(relayValues([[dep, b]]), withDep, []), /RELAY_STAGE_ORDER/);
  assert.throws(() => validateRelay(relayValues([[dep], [b]]), withDep, []), /RELAY_STAGE_ORDER/);
  validateRelay(relayValues([[b], [dep]]), withDep, []);
});

test("three stages hand over without review: B starts only after every A run delivered, with A's results in its prompt", async (t) => {
  const h = harness(t);
  const a1 = h.task("Draft API"), a2 = h.task("Draft UI"), b1 = h.task("Integrate", { dependencies: [a1] }), c1 = h.task("Review");
  const created = h.command("relay.create", { values: relayValues([[a1, a2], [b1], [c1]]), enabled: true }).state.relays[0];
  let p = relayProgress(created, h.store.state());
  assert.equal(p.desk.length, 0);
  assert.deepEqual(p.sofa.map((s) => s.length), [2, 1, 1]);
  await h.scheduler.tick();
  assert.equal(h.starts.length, 0);
  h.advance(1500);
  await h.scheduler.tick();
  assert.equal(h.starts.length, 2);
  let r = h.relay(created.id);
  assert.equal(r.status, "running");
  p = relayProgress(r, h.store.state());
  assert.deepEqual(p.desk.map((x) => x.label), ["A1", "A2"]);
  assert.deepEqual(p.sofa.map((s) => s.map((x) => x.label)), [["B1"], ["C1"]]);
  // The store itself refuses to skip ahead.
  assert.throws(() => h.command("relay.claim", { relayId: r.id, expectedRevision: r.revision, stage: 1 }), /RELAY_STAGE_INCOMPLETE/);
  h.end(a1, "completed", "API drafted in api.md");
  await h.scheduler.tick();
  assert.equal(h.starts.length, 2);
  h.end(a2, "completed", "UI drafted in ui.md");
  await h.scheduler.tick();
  assert.equal(h.starts.length, 3);
  const b = h.starts[2];
  assert.equal(b.stageIndex, 1);
  assert.match(b.prompt, /\[A1\]/);
  assert.match(b.prompt, /API drafted in api\.md/);
  assert.match(b.prompt, /\[A2\]/);
  assert.match(b.prompt, /not reviewed or accepted by a human/);
  // B1 depends on A1, which is delivered but not accepted: the relay may start it, acceptance is untouched.
  const state = h.store.state();
  assert.equal(state.tasks.find((x) => x.id === a1)!.acceptedAt, null);
  assert.throws(() => assertTaskRunnable(state.tasks.find((x) => x.id === b1)!, state.tasks), /TASK_BLOCKED/);
  h.end(b1);
  await h.scheduler.tick();
  assert.equal(h.starts.length, 4);
  assert.equal(h.starts[3].stageIndex, 2);
  h.end(c1);
  await h.scheduler.tick();
  r = h.relay(created.id);
  assert.equal(r.status, "completed");
  assert.ok(r.completedAt);
  assert.equal(h.attention.at(-1)?.status, "completed");
  const handoffs = h.store.state().handoffs.filter((x) => x.relayId === r.id);
  assert.deepEqual(handoffs.map((x) => x.relayStage), [0, 0, 1, 2]);
  assert.deepEqual(handoffs.find((x) => x.relayStage === 1)!.from, ["client:codex"]);
  await h.scheduler.tick();
  assert.equal(h.starts.length, 4);
});

test("a stopped task blocks its stage; retry restarts only that task and the relay continues", async (t) => {
  const h = harness(t);
  const a1 = h.task("One"), a2 = h.task("Two"), b1 = h.task("Next");
  const created = h.command("relay.create", { values: relayValues([[a1, a2], [b1]]), enabled: true }).state.relays[0];
  h.advance(1500);
  await h.scheduler.tick();
  h.end(a1);
  h.end(a2, "cancelled");
  await h.scheduler.tick();
  let r = h.relay(created.id);
  assert.equal(r.status, "blocked");
  assert.equal(r.statusReason, "STEP_CANCELLED");
  assert.equal(h.starts.length, 2);
  assert.equal(h.attention.at(-1)?.status, "blocked");
  assert.throws(() => h.command("relay.resume", { relayId: r.id, expectedRevision: r.revision }), /RELAY_RETRY_REQUIRED/);
  assert.throws(() => h.command("relay.retry", { relayId: r.id, expectedRevision: r.revision, stepIds: [r.stages[0].steps[0].id] }), /RELAY_NOTHING_TO_RETRY/);
  r = h.command("relay.retry", { relayId: r.id, expectedRevision: r.revision }).state.relays[0];
  assert.equal(r.status, "running");
  await h.scheduler.tick();
  assert.equal(h.starts.length, 3);
  assert.equal(h.starts[2].step.taskId, a2);
  assert.equal(h.relay(created.id).stages[0].steps[1].attempt, 2);
  h.end(a2);
  await h.scheduler.tick();
  assert.equal(h.starts.length, 4);
  assert.equal(h.starts[3].step.taskId, b1);
});

test("a start failure is recorded per task, siblings still start, and nothing retries by itself", async (t) => {
  let blocked = "";
  const h = harness(t, { fail: (taskId) => taskId === blocked });
  const a1 = h.task("Works"), a2 = h.task("Fails");
  blocked = a2;
  const created = h.command("relay.create", { values: relayValues([[a1, a2]]), enabled: true }).state.relays[0];
  h.advance(1500);
  await h.scheduler.tick();
  await h.scheduler.tick();
  const r = h.relay(created.id);
  assert.equal(h.starts.length, 2);
  assert.equal(r.status, "failed");
  assert.equal(r.statusReason, "START_FAILED");
  assert.match(r.stages[0].steps[1].error, /BACKGROUND_UNSUPPORTED/);
  assert.ok(r.stages[0].steps[0].runId);
  blocked = "";
  h.command("relay.retry", { relayId: r.id, expectedRevision: r.revision });
  await h.scheduler.tick();
  assert.equal(h.starts.length, 3);
  assert.equal(h.starts[2].step.taskId, a2);
});

test("outside prerequisites still need acceptance; an interrupted claim is never re-sent", async (t) => {
  const h = harness(t);
  const outside = h.task("Outside");
  const a1 = h.task("Needs outside", { dependencies: [outside] });
  const created = h.command("relay.create", { values: relayValues([[a1]]), enabled: true }).state.relays[0];
  h.advance(1500);
  await h.scheduler.tick();
  let r = h.relay(created.id);
  assert.equal(h.starts.length, 0);
  assert.equal(r.status, "failed");
  assert.match(r.stages[0].steps[0].error, /TASK_BLOCKED/);
  // A claim left behind by a crashed process becomes INTERRUPTED; no run is started for it.
  const b = h.task("Plain");
  const second = h.command("relay.create", { values: relayValues([[b]]), enabled: true }).state.relays.find((x) => x.stages[0].steps[0].taskId === b)!;
  h.command("relay.claim", { relayId: second.id, expectedRevision: second.revision, stage: 0 });
  await h.scheduler.tick();
  r = h.relay(second.id);
  assert.equal(r.status, "failed");
  assert.equal(r.statusReason, "INTERRUPTED");
  assert.equal(h.starts.length, 0);
});

test("an agent that needs a human blocks the relay; marking it handled lets the next stage start", async (t) => {
  const h = harness(t);
  const a1 = h.task("Sign in"), b1 = h.task("After");
  const created = h.command("relay.create", { values: relayValues([[a1], [b1]]), enabled: true }).state.relays[0];
  h.advance(1500);
  await h.scheduler.tick();
  h.end(a1, "completed", "Could not continue.\nHAICOMO-NEEDS-HUMAN: sign in to the package registry");
  await h.scheduler.tick();
  let r = h.relay(created.id);
  assert.equal(r.status, "blocked");
  assert.equal(r.statusReason, "NEEDS_HUMAN");
  const p = relayProgress(r, h.store.state());
  assert.equal(p.steps[0][0].state, "needs-human");
  assert.equal(p.steps[0][0].humanReason, "sign in to the package registry");
  r = h.command("relay.overrideStep", { relayId: r.id, expectedRevision: r.revision, stepId: r.stages[0].steps[0].id }).state.relays[0];
  assert.equal(r.status, "running");
  await h.scheduler.tick();
  assert.equal(h.starts.length, 2);
  assert.equal(h.starts[1].step.taskId, b1);
  const audit = h.store.queryAudit(0, 200).items.find((x) => x.action === "relay.overrideStep");
  assert.equal(audit?.context?.actor.kind, "human");
});

test("prompts: stage results in four languages, placeholders in the editor, unattended instructions only with consent", (t) => {
  const { store, task, command } = setup(t);
  const a1 = task("Spec", { artifacts: [{ id: "spec", label: "Spec", path: "docs/spec.md" }] }), b1 = task("Build");
  const relay = command("relay.create", { values: relayValues([[a1], [b1]]), enabled: false }).state.relays[0];
  const state = store.state();
  const placeholder = composeRelayStepPrompt(relay, 1, relay.stages[1].steps[0], state, store.directory, "zh-CN", { placeholder: true });
  assert.match(placeholder, /接力前序阶段的结果/);
  assert.match(placeholder, /docs\/spec\.md/);
  assert.match(placeholder, /该阶段开始时填入实际结果/);
  assert.doesNotMatch(placeholder, /HAICOMO-NEEDS-HUMAN/);
  const unattended = composeRelayStepPrompt({ ...relay, autonomy: { enabled: true, consentedAt: new Date().toISOString() } }, 0, relay.stages[0].steps[0], state, store.directory, "zh-TW");
  assert.match(unattended, /無人值守接力執行/);
  assert.match(unattended, /HAICOMO-DECISIONS-BEGIN/);
  for (const locale of ["en-GB", "en-US"] as const) assert.match(composeRelayStepPrompt(relay, 1, relay.stages[1].steps[0], state, store.directory, locale, { placeholder: true }), /Results from earlier relay stages/);
});

test("autonomy: recommended answers, destructive commands declined, free text left to the human, decisions parsed", () => {
  const answer = autoDecide("item/tool/requestUserInput", { questions: [{ id: "q1", header: "Plan", question: "Which?", options: [{ label: "Fast" }, { label: "Safe (Recommended)" }] }, { id: "q2", question: "Name?", options: [{ label: "alpha" }, { label: "beta" }] }] }, "/work/p");
  assert.equal(answer.kind, "answer");
  if (answer.kind === "answer") {
    assert.deepEqual(answer.answers, { q1: { answers: ["Safe (Recommended)"] }, q2: { answers: ["alpha"] } });
    assert.deepEqual(answer.decisions.map((d) => d.reason), ["recommended", "first-option"]);
  }
  assert.equal(autoDecide("item/tool/requestUserInput", { questions: [{ id: "code", question: "Enter the SMS code", options: [] }] }, "/work/p").kind, "human");
  const ok = autoDecide("item/commandExecution/requestApproval", { command: "npm test" }, "/work/p");
  assert.deepEqual(ok.kind === "answer" && ok.result, { decision: "accept" });
  for (const cmd of ["sudo rm -rf /", "rm -rf ~/Documents", "rm -rf /etc", "git push --force origin main", "git reset --hard HEAD~3", "diskutil eraseDisk APFS X disk2", "dd if=/dev/zero of=/dev/disk2", "rm -rf ../other"])
    assert.ok(isDestructiveCommand(cmd, "/work/p"), cmd);
  for (const cmd of ["rm -rf /work/p/dist", "rm -rf node_modules", "git push origin main", "npm run build"]) assert.ok(!isDestructiveCommand(cmd, "/work/p"), cmd);
  const declined = autoDecide("item/commandExecution/requestApproval", { command: ["git", "push", "-f"] }, "/work/p");
  assert.deepEqual(declined.kind === "answer" && declined.result, { decision: "decline" });
  assert.equal(autoDecide("item/permissions/requestApproval", {}, "/work/p").kind, "human");
  const message = "Done.\nHAICOMO-DECISIONS-BEGIN\n- Which DB? | sqlite / postgres | sqlite | already used\n- Port | 3000 | 3000 |\nHAICOMO-DECISIONS-END";
  assert.deepEqual(selfReportedDecisions(message).map((d) => d.choice), ["sqlite", "3000"]);
  assert.equal(needsHuman(message), null);
  assert.equal(needsHuman("x\nHAICOMO-NEEDS-HUMAN: enter the 2FA code\n"), "enter the 2FA code");
});

test("decision record lists automatic, self-reported and human items from the database", async (t) => {
  const h = harness(t);
  const a1 = h.task("Choose");
  const created = h.command("relay.create", { values: relayValues([[a1]], { autonomy: { enabled: true, consentedAt: new Date().toISOString() } }), enabled: true }).state.relays[0];
  h.advance(1500);
  await h.scheduler.tick();
  let r = h.relay(created.id);
  h.store.command({ id: randomUUID(), type: "relay.decision", payload: { relayId: r.id, entry: { stepId: r.stages[0].steps[0].id, kind: "auto-answer", method: "item/tool/requestUserInput", question: "Which framework?", options: ["React", "Vue"], choice: "React", reason: "recommended" } } });
  assert.equal(h.relay(created.id).revision, r.revision); // decisions are a log, not an edit
  h.end(a1, "completed", "ok\nHAICOMO-DECISIONS-BEGIN\n- Indent | 2 / 4 | 2 | project style\nHAICOMO-DECISIONS-END");
  await h.scheduler.tick();
  r = h.relay(created.id);
  assert.equal(r.status, "completed");
  const report = relayDecisionReport(r, h.store.state(), "zh-CN");
  assert.match(report, /接力决策记录/);
  assert.match(report, /Which framework\? \| React \/ Vue \| React \| recommended/);
  assert.match(report, /Indent \| 2 \/ 4 \| 2 \| project style/);
  assert.match(report, /无人值守模式: 开启/);
  assert.throws(() => h.command("relay.decision", { relayId: r.id, entry: {} }));
});

function v5Project(dir: string, relays: unknown[], sessions: unknown[] = []) {
  const store = new ProjectStore(dir, "Old relays");
  const state: any = store.state();
  store.close();
  state.schemaVersion = 5;
  state.relays = relays;
  state.sessions = sessions;
  const db = new DatabaseSync(path.join(dir, ".haicomo/project.sqlite"));
  db.prepare("UPDATE project SET json=?").run(JSON.stringify(state));
  db.close();
  const manifest = path.join(dir, ".haicomo/manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, "utf8")), schemaVersion: 5 }));
}
const oldRelay = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, revision: 3, enabled: true, status, statusReason: "", armedAt: "2026-10-01T00:00:00.000Z", dueAt: null, firedAt: null, resultRunId: null, lastError: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z",
  title: id, afterSessionId: null, trigger: { kind: "delay", ms: 60000 }, handoff: { provider: "claude", model: "claude-sonnet-4-6", effort: "", mode: "acceptEdits", threadId: "", continueThread: false }, taskId: "task-1", referenceTaskId: null, prompt: "Old prompt", ...extra,
});
const session = (sessionId: string, endReason?: string) => ({ sessionId, family: "claude", provider: "claude", harnessId: "claude", model: "claude-sonnet-4-6", taskIds: ["task-1"], status: endReason ? "idle" : "running", source: "runner", at: "2026-10-02T00:00:00.000Z", message: "", lifecycle: endReason ? "history" : "current", ...(endReason ? { endReason, endedAt: "2026-10-02T00:00:00.000Z" } : {}), startedAt: null, measuredMs: 0, lastMessage: "" });

test("v5 → v6 migration wraps every relay into one stage, maps statuses honestly, backs up once and rolls back on failure", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-v6-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  v5Project(
    dir,
    [
      oldRelay("scheduled", "scheduled"),
      oldRelay("firing", "firing", { statusReason: "manual" }),
      oldRelay("failed", "failed", { lastError: "BACKGROUND_UNSUPPORTED" }),
      oldRelay("done", "fired", { resultRunId: "run-done", firedAt: "2026-10-02T00:00:00.000Z" }),
      oldRelay("perm", "fired", { resultRunId: "run-perm" }),
      oldRelay("live", "fired", { resultRunId: "run-live" }),
      oldRelay("gone", "fired", { resultRunId: "run-gone" }),
    ],
    [session("run-done", "completed"), session("run-perm", "permission"), session("run-live")],
  );
  // A failure inside the migration transaction leaves version 5 intact.
  const file = path.join(dir, ".haicomo/project.sqlite");
  let db = new DatabaseSync(file);
  db.exec("CREATE TRIGGER reject_migration BEFORE INSERT ON audit WHEN json_extract(NEW.json,'$.action')='schema.migrate' BEGIN SELECT RAISE(ABORT,'injected'); END");
  db.close();
  assert.throws(() => new ProjectStore(dir), /injected/);
  db = new DatabaseSync(file);
  assert.equal(JSON.parse((db.prepare("SELECT json FROM project").get() as any).json).schemaVersion, 5);
  db.exec("DROP TRIGGER reject_migration");
  db.close();
  const backup = path.join(dir, ".haicomo/backups/pre-v6.haicomo.zip");
  assert.ok(fs.existsSync(backup));
  const bytes = fs.readFileSync(backup);
  const store = new ProjectStore(dir);
  const state = store.state();
  assert.equal(state.schemaVersion, CURRENT_SCHEMA);
  const by = (id: string) => state.relays.find((r) => r.id === id)!;
  assert.deepEqual(by("scheduled").stages.map((s) => s.steps.map((x) => [x.taskId, x.provider, x.mode, x.prompt])), [[["task-1", "claude", "acceptEdits", "Old prompt"]]]);
  assert.equal(by("scheduled").status, "scheduled");
  assert.equal(by("scheduled").claimedAt, null);
  assert.deepEqual([by("firing").status, by("firing").statusReason], ["failed", "INTERRUPTED"]);
  assert.deepEqual([by("failed").status, by("failed").stages[0].steps[0].error], ["failed", "BACKGROUND_UNSUPPORTED"]);
  assert.equal(by("done").status, "completed");
  assert.deepEqual([by("perm").status, by("perm").statusReason], ["blocked", "STEP_PERMISSION"]);
  assert.equal(by("live").status, "running");
  assert.deepEqual([by("gone").status, by("gone").statusReason], ["blocked", "STEP_LOST"]);
  assert.equal(store.queryAudit(0, 50).items.filter((a) => a.action === "schema.migrate").length, 1);
  store.close();
  assert.deepEqual(fs.readFileSync(backup), bytes);
  const again = new ProjectStore(dir);
  assert.equal(again.state().relays.length, 7);
  again.close();
  assert.deepEqual(fs.readFileSync(backup), bytes);
  assert.equal(upgradeRelayV5(oldRelay("x", "paused") as any, []).status, "paused");
});

test("a failed sign-in or exhausted quota pauses the relay for the human instead of a plain stop", async (t) => {
  const h = harness(t);
  const a1 = h.task("Needs login"), a2 = h.task("Plain failure"), b1 = h.task("Later");
  const created = h.command("relay.create", { values: relayValues([[a1, a2], [b1]]), enabled: true }).state.relays[0];
  h.advance(1500);
  await h.scheduler.tick();
  h.end(a1, "failed", "Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY.");
  h.end(a2, "failed", "TypeError: cannot read properties of undefined");
  await h.scheduler.tick();
  const r = h.relay(created.id);
  const p = relayProgress(r, h.store.state());
  assert.equal(p.steps[0][0].state, "needs-human");
  assert.match(p.steps[0][0].humanReason!, /Authentication required/);
  assert.equal(p.steps[0][1].state, "stopped");
  assert.equal(r.status, "blocked");
  assert.equal(r.statusReason, "NEEDS_HUMAN");
  assert.equal(h.starts.length, 2);
  for (const message of ["provider.auth_error: 403 You've reached your monthly usage limit for this billing cycle", "dsh: MISSING_CREDENTIAL: no API key for provider route", "Error: not logged in", "HTTP 401 Unauthorized", "Your session has expired, please sign in again"])
    assert.ok(humanBlocker(message), message);
  for (const message of ["All 41 tests passed", "Fixed the 401 page layout", "Refactored the quota calculator", undefined]) assert.equal(humanBlocker(message), null, String(message));
});

