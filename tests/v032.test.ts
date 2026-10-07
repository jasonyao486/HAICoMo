import test from "node:test";
import assert from "node:assert/strict";
import type { Audit, ProjectState } from "../src/shared/domain";
import { activityContext, activityRoles } from "../src/ui/activity-model";
import { translator } from "../src/ui/i18n";
import { InstallGate } from "../src/core/install";

test("activity roles use explicit identity, preserve legacy snapshots and never infer clients or names", () => {
  const state = { tasks: [] } as unknown as ProjectState;
  const base: Audit = { id: "audit", at: new Date().toISOString(), actor: "Claude response captured by test operator", action: "task.create", entityId: "task", before: null, after: null, reason: "" };
  const records: [Audit, string][] = [
    [base, "模型未知"],
    [{ ...base, actor: "human" }, "人类"],
    [{ ...base, actor: "system" }, "系统"],
    [{ ...base, context: { actor: { kind: "human", name: "A very long reviewer name" }, tasks: [] } }, "人类"],
    [{ ...base, context: { actor: { kind: "model", name: base.actor, family: "claude", model: "claude-full-model-version", harnessId: "claude" }, reviewer: { kind: "human", name: "Test operator" }, tasks: [] } }, "Claude → 人类"],
    [{ ...base, context: { actor: { kind: "model", name: "Claude", harnessId: "claude" }, tasks: [] } }, "模型未知"],
    [{ ...base, actor: "human", action: "proposal.review", after: { status: "applied", proposal: { actor: { name: base.actor, family: "claude", model: "claude-full-model-version" } } } }, "Claude → 人类"],
    [{ ...base, actor: "human", action: "proposal.review", context: { actor: { kind: "human", name: "Reviewer" }, decision: "reject", tasks: [] }, after: { status: "rejected", proposal: { actor: { name: "Claude", harnessId: "claude" } } } }, "模型未知 → 人类"],
  ];
  for (const [entry, expected] of records) {
    const original = JSON.stringify(entry);
    assert.equal(activityRoles(entry, state, translator("zh-CN")), expected);
    assert.equal(JSON.stringify(entry), original);
  }
  assert.equal(activityContext(records[6][0], state).actor.model, "claude-full-model-version");
  for (const locale of ["en-US", "en-GB", "zh-CN", "zh-TW"] as const)
    assert.equal(activityRoles(records[4][0], state, translator(locale)), `Claude → ${translator(locale)("actorHuman")}`);
});

test("update gate preserves optional window home navigation while retaining real tab pages", async () => {
  let restored: unknown;
  const gate = new InstallGate({ busy: () => false, begin() {}, prepare() {}, cancel() {}, failed(error) { throw error; }, commit: async windows => { restored = windows; } });
  const ticket = gate.start([1, 2]);
  const tabs = [{ page: "history" as const, active: true }];
  gate.ready(1, ticket, tabs, true);
  gate.ready(2, ticket, tabs);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(restored, [{ tabs, home: true }, { tabs }]);
});
