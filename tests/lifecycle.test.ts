import { temporaryDirectory, beforeRemove } from "./temp-directory";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  createFreshProject,
  restoreEntry,
  restoreHistory,
  recoverCreation,
} from "../src/core/lifecycle";
import {
  resolveEntry,
  readJson,
  readSnapshot,
  publishProposal,
  exampleProposal,
  writeEntry,
} from "../src/core/files";
import { ProjectStore } from "../src/core/store";
import { aggregateFamily } from "../src/shared/domain";
function setup(t: any) {
  return temporaryDirectory(t, "haicomo-lifecycle-");
}
test("deleted entry cannot open/read/submit or mutate a cached store; fresh creation retains recoverable data", (t) => {
  const dir = setup(t),
    file = path.join(dir, "我的 项目.haicomo");
  createFreshProject(file, "Original");
  const store = new ProjectStore(file),
    old = store.state();
  const proposal = exampleProposal(old);
  store.command({
    id: randomUUID(),
    type: "change",
    payload: proposal.changes[0],
  });
  fs.unlinkSync(file);
  assert.throws(() => resolveEntry(file), /ENTRY_NOT_FOUND/);
  assert.throws(() => readSnapshot(dir), /ENTRY_NOT_FOUND/);
  assert.throws(() => publishProposal(dir, proposal), /ENTRY_NOT_FOUND/);
  assert.throws(
    () =>
      store.command({
        id: randomUUID(),
        type: "change",
        payload: proposal.changes[0],
      }),
    /ENTRY_NOT_FOUND/,
  );
  store.close();
  assert.throws(() => new ProjectStore(dir), /ENTRY_NOT_FOUND/);
  assert.equal(fs.existsSync(file), false);
  createFreshProject(file, "New");
  const next = new ProjectStore(file);
  assert.notEqual(next.state().id, old.id);
  assert.notEqual(next.state().epoch, old.epoch);
  assert.equal(next.state().tasks.length, 0);
  next.close();
  const history = path.join(
    dir,
    ".haicomo-history",
    fs.readdirSync(path.join(dir, ".haicomo-history"))[0],
  );
  const target = path.join(dir, "恢复 空目录");
  fs.mkdirSync(target);
  restoreHistory(history, target);
  const recovered = new ProjectStore(target);
  assert.equal(recovered.state().id, old.id);
  assert.equal(recovered.state().tasks.length, 1);
  recovered.close();
});
test("renamed entries and moved directories preserve identity; malformed and duplicate entries are rejected", (t) => {
  const dir = setup(t),
    file = path.join(dir, "HAICoMo.haicomo");
  createFreshProject(file, "Rename");
  const id = resolveEntry(file).id;
  const renamed = path.join(dir, "新名字.haicomo");
  fs.renameSync(file, renamed);
  assert.throws(() => resolveEntry(file), /ENTRY_NOT_FOUND/);
  assert.equal(resolveEntry(dir).id, id);
  fs.copyFileSync(renamed, file);
  assert.throws(() => resolveEntry(renamed), /MULTIPLE_ENTRIES/);
  fs.unlinkSync(file);
  const content = fs.readFileSync(renamed);
  fs.writeFileSync(renamed, "broken");
  assert.throws(() => resolveEntry(renamed), /INVALID_ENTRY/);
  fs.writeFileSync(renamed, content);
  const entry = readJson(renamed);
  fs.writeFileSync(
    renamed,
    JSON.stringify({ ...entry, projectId: randomUUID() }),
  );
  assert.throws(() => resolveEntry(renamed), /ENTRY_IDENTITY_MISMATCH/);
  fs.writeFileSync(renamed, content);
  const moved = dir + " moved";
  fs.renameSync(dir, moved);
  try {
    assert.equal(resolveEntry(moved).id, id);
  } finally {
    fs.renameSync(moved, dir);
  }
});
test("explicit entry recovery keeps identity and old entry bytes are never rewritten by open", (t) => {
  const dir = setup(t),
    s = new ProjectStore(dir, "Old entry");
  const id = s.state().id;
  s.close();
  const file = path.join(dir, "HAICoMo.haicomo");
  const bytes = '{ "format":"haicomo", "version":1, "data":".haicomo" }\n';
  fs.writeFileSync(file, bytes);
  new ProjectStore(dir).close();
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  fs.unlinkSync(file);
  restoreEntry(dir);
  assert.equal(resolveEntry(file).id, id);
  assert.equal(readJson(file).version, 2);
});
test("closing a moved database releases only its own lock, and reopening preserves records", (t) => {
  const root = setup(t),
    directory = path.join(root, "before"),
    moved = path.join(root, "after 中文");
  fs.mkdirSync(directory);
  const store = new ProjectStore(directory, "Moved while open"),
    id = store.state().id;
  beforeRemove(t, () => { try { store.close(); } catch {} });
  if (process.platform === "win32") {
    // Windows refuses to move an open SQLite directory. Verify both the refusal
    // and the supported workflow: close first, then move the complete project.
    assert.throws(() => fs.renameSync(directory, moved), /EPERM|EBUSY|EACCES/);
    assert.equal(store.state().id, id);
    store.close();
    fs.renameSync(directory, moved);
  } else {
    fs.renameSync(directory, moved);
    assert.throws(() => new ProjectStore(moved), /PROJECT_LOCKED/);
    store.close();
  }
  const reopened = new ProjectStore(moved);
  assert.equal(reopened.state().id, id);
  assert.throws(() => new ProjectStore(moved), /PROJECT_LOCKED/);
  reopened.close();
  assert.equal(fs.existsSync(path.join(moved, ".haicomo/writer.lock")), false);
});
test("failed replacement rolls back the original package without recreating its deleted entry", (t) => {
  const dir = setup(t),
    s = new ProjectStore(dir, "Keep me");
  const id = s.state().id;
  s.close();
  const file = path.join(dir, "HAICoMo.haicomo");
  fs.unlinkSync(file);
  const rename = fs.renameSync;
  try {
    fs.renameSync = ((a: any, b: any) => {
      if (
        String(a).includes(".haicomo-stage-") &&
        String(b) === path.join(dir, ".haicomo")
      )
        throw Error("injected disk failure");
      return rename(a, b);
    }) as any;
    assert.throws(() => createFreshProject(file, "Fail"), /injected/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(readJson(path.join(dir, ".haicomo/manifest.json")).id, id);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.join(dir, ".haicomo-create.json")), false);
});
test("interrupted creation journal rolls back only its own staged identity", (t) => {
  const dir = setup(t),
    oldDir = path.join(dir, "old");
  fs.mkdirSync(oldDir);
  const old = new ProjectStore(oldDir, "Old");
  const oldId = old.state().id;
  old.close();
  const newDir = path.join(dir, ".haicomo-stage-fixture");
  fs.mkdirSync(newDir);
  const fresh = new ProjectStore(newDir, "New");
  const newId = fresh.state().id;
  fresh.close();
  fs.mkdirSync(path.join(dir, ".haicomo-history/fixture"), { recursive: true });
  fs.renameSync(
    path.join(oldDir, ".haicomo"),
    path.join(dir, ".haicomo-history/fixture/.haicomo"),
  );
  fs.renameSync(path.join(newDir, ".haicomo"), path.join(dir, ".haicomo"));
  fs.writeFileSync(
    path.join(dir, ".haicomo-create.json"),
    JSON.stringify({
      stage: ".haicomo-stage-fixture",
      archive: "fixture",
      entry: "HAICoMo.haicomo",
      id: newId,
    }),
  );
  recoverCreation(dir);
  assert.equal(readJson(path.join(dir, ".haicomo/manifest.json")).id, oldId);
  assert.equal(fs.existsSync(path.join(dir, "HAICoMo.haicomo")), false);
});
test("v3 migration preserves legacy unknown outcomes, while future lost runs stay current", (t) => {
  const dir = setup(t),
    store = new ProjectStore(dir, "Runs"),
    proposal = exampleProposal(store.state());
  proposal.changes[0].values = { title: "Task", assignees: ["claude"] };
  store.command({
    id: randomUUID(),
    type: "change",
    payload: proposal.changes[0],
  });
  store.recordEvent({
    id: randomUUID(),
    sessionId: "legacy",
    taskIds: [proposal.changes[0].id],
    family: "claude",
    provider: "claude",
    model: "opus",
    source: "runner",
    status: "waiting",
    at: new Date().toISOString(),
    message: "permission denied",
  });
  const old = store.state();
  store.close();
  const db = new DatabaseSync(path.join(dir, ".haicomo/project.sqlite"));
  db.prepare("UPDATE project SET json=?").run(
    JSON.stringify({ ...old, schemaVersion: 2 }),
  );
  db.close();
  const manifest = readJson(path.join(dir, ".haicomo/manifest.json"));
  fs.writeFileSync(
    path.join(dir, ".haicomo/manifest.json"),
    JSON.stringify({ ...manifest, schemaVersion: 2 }),
  );
  const next = new ProjectStore(dir);
  beforeRemove(t, () => {
    try {
      next.close();
    } catch {}
  });
  assert.equal(next.state().schemaVersion, 5);
  const legacy = next.state().sessions[0];
  assert.equal(legacy.status, "waiting");
  assert.equal(legacy.lifecycle, "history");
  assert.equal(legacy.endReason, "legacy");
  assert.equal(legacy.measuredMs, old.sessions[0].measuredMs);
  assert.equal(aggregateFamily("claude", next.state()).counts.unknown, 0);
  assert.equal(aggregateFamily("claude", next.state()).history.length, 1);
  assert.ok(
    fs.existsSync(path.join(dir, ".haicomo/backups/pre-v3.haicomo.zip")),
  );
  const { startedAt, measuredMs, lastMessage, ...event } = legacy;
  next.recordEvent({
    ...event,
    id: randomUUID(),
    sessionId: "new",
    lifecycle: "current",
    endReason: undefined,
    instanceId: "previous-instance",
    status: "running",
    at: new Date().toISOString(),
  });
  next.markDisconnected("new-instance", []);
  let run = next.state().sessions.find((s) => s.sessionId === "new")!;
  assert.equal(run.lifecycle, "current");
  assert.equal(run.status, "unknown");
  next.command({
    id: randomUUID(),
    type: "session.untrack",
    payload: { sessionId: "new" },
  });
  run = next.state().sessions.find((s) => s.sessionId === "new")!;
  assert.equal(run.lifecycle, "history");
  assert.equal(run.status, "unknown");
  assert.ok(
    next.queryAudit().items.some((a) => a.action === "session.untrack"),
  );
  next.close();
});
