import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore, restoreZip } from "../src/core/store";
import {
  publishProposal,
  exampleProposal,
  readSnapshot,
  hash,
} from "../src/core/files";
import {
  aggregateFamily,
  taskStatus,
  assertTaskRunnable,
} from "../src/shared/domain";

function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-测试 "));
  const store = new ProjectStore(dir, "Test project");
  t.after(() => {
    try {
      store.close();
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store };
}
function change(
  store: ProjectStore,
  values: any,
  id = randomUUID(),
  revision: number | null = null,
) {
  store.command({
    id: randomUUID(),
    type: "change",
    payload: {
      entity: "task",
      operation: revision === null ? "create" : "update",
      id,
      expectedRevision: revision,
      values,
    },
  });
  return id;
}
function action(store: ProjectStore, type: string, id: string) {
  return store.command({
    id: randomUUID(),
    type,
    payload: {
      taskId: id,
      expectedRevision: store.state().tasks.find((t) => t.id === id)!.revision,
    },
  });
}
test("background execution is gated by human acceptance and archive state", (t) => {
  const { store } = setup(t);
  const a = change(store, { title: "Upstream", status: "delivered" }),
    b = change(store, { title: "Next", dependencies: [a] });
  assert.throws(
    () => assertTaskRunnable(store.state().tasks[1], store.state().tasks),
    /TASK_BLOCKED/,
  );
  action(store, "task.accept", a);
  assert.doesNotThrow(() =>
    assertTaskRunnable(store.state().tasks[1], store.state().tasks),
  );
  action(store, "task.archive", b);
  assert.throws(
    () => assertTaskRunnable(store.state().tasks[1], store.state().tasks),
    /TASK_ARCHIVED/,
  );
});
test("visual table preferences do not revoke human acceptance", (t) => {
  const { store } = setup(t);
  const id = change(store, { title: "Accepted", status: "delivered" });
  action(store, "task.accept", id);
  const acceptedAt = store.state().tasks[0].acceptedAt;
  change(store, { tableVisible: false }, id, 2);
  assert.equal(store.state().tasks[0].acceptedAt, acceptedAt);
});
test("inherited prerequisites cannot make descendants depend on themselves", (t) => {
  const { store } = setup(t);
  const parent = change(store, { title: "Parent" }),
    child = change(store, { title: "Child", parentId: parent });
  assert.throws(
    () => change(store, { dependencies: [child] }, parent, 1),
    /CYCLE/,
  );
  assert.deepEqual(store.state().tasks[0].dependencies, []);
});
test("project metadata uses its own revision and rejects competing editors", (t) => {
  const { store } = setup(t);
  const state = store.state();
  change(store, { title: "Independent task" });
  const edit = {
    entity: "project",
    operation: "update",
    id: state.id,
    expectedRevision: state.metadataRevision,
    values: { title: "First editor" },
  };
  store.command({ id: randomUUID(), type: "change", payload: edit });
  assert.throws(
    () =>
      store.command({
        id: randomUUID(),
        type: "change",
        payload: { ...edit, values: { title: "Stale editor" } },
      }),
    /REVISION_CONFLICT/,
  );
  assert.equal(store.state().title, "First editor");
});
test("human acceptance is distinct from delivery and releases dependencies", (t) => {
  const { store } = setup(t);
  const upstream = change(store, {
    title: "Build",
    status: "delivered",
    artifacts: [],
  });
  const downstream = change(store, {
    title: "Review",
    dependencies: [upstream],
  });
  assert.equal(
    taskStatus(store.state().tasks[1], store.state().tasks),
    "blocked",
  );
  action(store, "task.accept", upstream);
  assert.equal(taskStatus(store.state().tasks[1], store.state().tasks), "todo");
  assert.equal(
    store.state().tasks.find((t) => t.id === downstream)!.acceptedAt,
    null,
  );
});
test("partial updates preserve fields and stale revisions never overwrite", (t) => {
  const { store } = setup(t);
  const id = change(store, {
    title: "Keep",
    description: "Important",
    assignees: ["claude"],
    progress: 30,
  });
  change(store, { progress: 40 }, id, 1);
  assert.equal(store.state().tasks[0].description, "Important");
  assert.deepEqual(store.state().tasks[0].assignees, ["claude"]);
  assert.throws(
    () => change(store, { title: "Stale" }, id, 1),
    /REVISION_CONFLICT/,
  );
  assert.equal(store.state().tasks[0].title, "Keep");
});
test("combined hierarchy and prerequisite cycles rollback the entire operation", (t) => {
  const { store } = setup(t);
  const parent = change(store, { title: "Parent" });
  const child = change(store, { title: "Child", parentId: parent });
  assert.throws(
    () => change(store, { dependencies: [parent] }, child, 1),
    /CYCLE/,
  );
  assert.deepEqual(store.state().tasks[1].dependencies, []);
  assert.throws(() => change(store, { parentId: child }, parent, 1), /CYCLE/);
});
test("parent acceptance waits for children; edits invalidate acceptance", (t) => {
  const { store } = setup(t);
  const p = change(store, { title: "Parent", status: "delivered" });
  const c = change(store, { title: "Child", status: "delivered", parentId: p });
  assert.throws(() => action(store, "task.accept", p), /UNFINISHED/);
  action(store, "task.accept", c);
  action(store, "task.accept", p);
  change(store, { description: "New evidence" }, c, 2);
  assert.equal(store.state().tasks[0].acceptedAt, null);
  assert.equal(store.state().tasks[1].acceptedAt, null);
});
test("offline parallel proposals survive reopening and duplicate retries are idempotent", (t) => {
  const { dir, store } = setup(t);
  const state = store.state();
  store.close();
  const a = exampleProposal(state),
    b = exampleProposal(state);
  publishProposal(dir, a);
  publishProposal(dir, b);
  publishProposal(dir, a);
  const opened = new ProjectStore(dir);
  try {
    assert.equal(opened.proposals().length, 2);
    for (const p of [a, b])
      opened.command({
        id: randomUUID(),
        type: "proposal.review",
        payload: { proposalId: p.proposalId, decision: "approve" },
      });
    assert.equal(opened.state().tasks.length, 2);
    assert.equal(readSnapshot(dir).tasks.length, 2);
  } finally {
    opened.close();
  }
});
test("proposal hash mismatch is isolated; valid proposals still arrive", (t) => {
  const { dir, store } = setup(t);
  const p = exampleProposal(store.state());
  publishProposal(dir, p);
  fs.writeFileSync(
    path.join(dir, ".haicomo", "inbox", p.proposalId + ".ready"),
    "bad",
  );
  const good = exampleProposal(store.state());
  publishProposal(dir, good);
  store.ingest();
  assert.equal(store.proposals().length, 1);
  assert.match(store.warnings[0], /HASH_MISMATCH/);
  assert.throws(
    () => publishProposal(dir, { ...good, title: "Changed" }),
    /ID_REUSED/,
  );
});
test("multi-change proposal rolls back without a partial application", (t) => {
  const { dir, store } = setup(t);
  const id = change(store, { title: "A" });
  const p = exampleProposal(store.state());
  p.changes.push({
    entity: "task",
    operation: "update",
    id,
    expectedRevision: 0,
    values: { title: "Wrong" },
  });
  publishProposal(dir, p);
  store.ingest();
  assert.throws(
    () =>
      store.command({
        id: randomUUID(),
        type: "proposal.review",
        payload: { proposalId: p.proposalId, decision: "approve" },
      }),
    /REVISION_CONFLICT/,
  );
  assert.equal(store.state().tasks.length, 1);
  assert.equal(store.proposals()[0].status, "pending");
});
test("agents cannot accept or archive tasks through values", (t) => {
  const { dir, store } = setup(t);
  const p = exampleProposal(store.state());
  p.changes[0].values.acceptedAt = new Date().toISOString();
  publishProposal(dir, p);
  store.ingest();
  assert.throws(() =>
    store.command({
      id: randomUUID(),
      type: "proposal.review",
      payload: { proposalId: p.proposalId, decision: "approve" },
    }),
  );
  assert.equal(store.state().tasks.length, 0);
});
test("a committed command can be safely retried", (t) => {
  const { store } = setup(t);
  const op = {
    id: randomUUID(),
    type: "change",
    payload: {
      entity: "task",
      operation: "create",
      id: randomUUID(),
      expectedRevision: null,
      values: { title: "Once" },
    },
  };
  store.command(op);
  store.command(op);
  assert.equal(store.state().tasks.length, 1);
  assert.throws(() => store.command({ ...op, type: "different" }), /ID_REUSED/);
});
test("backup restore includes records, proposals and regenerates missing receipts", (t) => {
  const { dir, store } = setup(t);
  change(store, { title: "Portable" });
  const file = path.join(dir, "backup.zip");
  store.exportZip(file);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "restore-"));
  try {
    restoreZip(file, target);
    const restored = new ProjectStore(target);
    assert.equal(restored.state().tasks[0].title, "Portable");
    assert.equal(restored.state().id, store.state().id);
    restored.close();
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
test("fork identity is independent and does not transfer agent sessions", (t) => {
  const { store } = setup(t);
  change(store, { title: "Original" });
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "fork-"));
  try {
    store.fork(target);
    const copy = new ProjectStore(target);
    assert.notEqual(copy.state().id, store.state().id);
    assert.notEqual(copy.state().epoch, store.state().epoch);
    change(copy, { title: "Copy task" });
    assert.equal(store.state().tasks.length, 1);
    copy.close();
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
test("single writer lock prevents concurrent store ownership", (t) => {
  const { dir } = setup(t);
  assert.throws(() => new ProjectStore(dir), /PROJECT_LOCKED/);
});
test("family aggregation preserves mixed running and waiting states and expires stale heartbeats", (t) => {
  const { store } = setup(t);
  const taskId = change(store, { title: "Work", assignees: ["chatgpt"] });
  const at = new Date().toISOString();
  for (const status of ["running", "waiting"] as const)
    store.recordEvent({
      id: randomUUID(),
      sessionId: status,
      family: "chatgpt",
      provider: "codex",
      model: "actual-version",
      taskIds: [taskId],
      status,
      source: "runner",
      at,
      message: "",
    });
  const a = aggregateFamily("chatgpt", store.state());
  assert.equal(a.status, "running");
  assert.equal(a.counts.waiting, 1);
  assert.equal(
    aggregateFamily("chatgpt", store.state(), Date.now() + 61000).status,
    "unknown",
  );
});
test("proposal dependencies require application and rejected prerequisites block", (t) => {
  const { store, dir } = setup(t);
  const a = exampleProposal(store.state()),
    b = exampleProposal(store.state());
  b.dependsOn = [a.proposalId];
  publishProposal(dir, a);
  publishProposal(dir, b);
  store.ingest();
  store.command({
    id: randomUUID(),
    type: "proposal.review",
    payload: { proposalId: a.proposalId, decision: "reject" },
  });
  assert.throws(
    () =>
      store.command({
        id: randomUUID(),
        type: "proposal.review",
        payload: { proposalId: b.proposalId, decision: "approve" },
      }),
    /DEPENDENCY_UNRESOLVED/,
  );
});
