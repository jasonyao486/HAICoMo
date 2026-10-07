import { temporaryDirectory, beforeRemove } from "./temp-directory";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ProjectStore, restoreZip } from "../src/core/store";
import {
  exampleProposal,
  publishProposal,
  collaborationStatus,
  hash,
} from "../src/core/files";
import {
  aggregateFamily,
  inferFamily,
  normalizeEvent,
  taskValuesSchema,
} from "../src/shared/domain";
import { shiftSchedule } from "../src/shared/schedule";
import { legacyPreview } from "../src/core/legacy";

function setup(t: any) {
  return temporaryDirectory(t, "haicomo-v2-");
}
function legacyProject(dir: string) {
  const store = new ProjectStore(dir, "Migration");
  const state = store.state();
  store.close();
  const db = new DatabaseSync(path.join(dir, ".haicomo/project.sqlite"));
  db.prepare("UPDATE project SET json=?").run(
    JSON.stringify({ ...state, schemaVersion: 1 }),
  );
  db.close();
  fs.writeFileSync(
    path.join(dir, ".haicomo/manifest.json"),
    JSON.stringify({
      format: "haicomo",
      schemaVersion: 1,
      id: state.id,
      epoch: state.epoch,
    }),
  );
  return state;
}
test("v1 migration backs up and keeps project identity, revisions and immutable offline bytes", (t) => {
  const dir = setup(t),
    original = legacyProject(dir);
  const p = { ...exampleProposal(original), protocolVersion: 1 as const };
  publishProposal(dir, p);
  const input = fs.readFileSync(
    path.join(dir, ".haicomo/inbox", `${p.proposalId}.json`),
  );
  const store = new ProjectStore(dir);
  beforeRemove(t, () => store.close());
  assert.equal(store.state().schemaVersion, 5);
  assert.equal(store.state().id, original.id);
  assert.equal(store.state().revision, original.revision);
  const record = store.proposals()[0];
  assert.equal(record.raw, input.toString());
  assert.equal(record.hash, hash(input));
  assert.deepEqual(
    fs.readFileSync(path.join(dir, ".haicomo/inbox", `${p.proposalId}.json`)),
    input,
  );
  const restored = path.join(dir, "restored");
  fs.mkdirSync(restored);
  restoreZip(path.join(dir, ".haicomo/backups/pre-v2.haicomo.zip"), restored);
  const db = new DatabaseSync(path.join(restored, ".haicomo/project.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    JSON.parse((db.prepare("SELECT json FROM project").get() as any).json)
      .schemaVersion,
    1,
  );
  db.close();
});
test("failed backup leaves v1 intact; interrupted manifest publication resumes committed migration", (t) => {
  const dir = setup(t);
  legacyProject(dir);
  fs.writeFileSync(path.join(dir, ".haicomo/backups"), "blocked");
  assert.throws(() => new ProjectStore(dir));
  const db = new DatabaseSync(path.join(dir, ".haicomo/project.sqlite"));
  assert.equal(
    JSON.parse((db.prepare("SELECT json FROM project").get() as any).json)
      .schemaVersion,
    1,
  );
  db.close();
  fs.unlinkSync(path.join(dir, ".haicomo/backups"));
  const rename = fs.renameSync;
  try {
    fs.renameSync = ((a: any, b: any) => {
      if (String(b).endsWith("manifest.json"))
        throw new Error("injected manifest failure");
      return rename(a, b);
    }) as any;
    assert.throws(() => new ProjectStore(dir), /injected/);
  } finally {
    fs.renameSync = rename;
  }
  const store = new ProjectStore(dir);
  beforeRemove(t, () => store.close());
  assert.equal(store.state().schemaVersion, 5);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(dir, ".haicomo/manifest.json"), "utf8"),
    ).schemaVersion,
    5,
  );
  assert.equal(
    store.queryAudit().items.filter((a) => a.action === "schema.migrate")
      .length,
    4,
  );
});
test("client assignment, unknown model aggregation and model discovery preserve separate identities", (t) => {
  const dir = setup(t),
    store = new ProjectStore(dir, "Clients");
  beforeRemove(t, () => store.close());
  assert.equal(inferFamily("unannounced-provider-model"), null);
  assert.equal(inferFamily("claude-sonnet-4-6"), "claude");
  const p = exampleProposal(store.state());
  p.actor = { name: "Pi", harnessId: "pi", family: null };
  p.changes[0].values.assignees = ["client:pi"];
  publishProposal(dir, p);
  store.ingest();
  store.command({
    id: randomUUID(),
    type: "proposal.review",
    payload: { proposalId: p.proposalId, decision: "approve" },
  });
  const event = {
    id: randomUUID(),
    sessionId: "pi-trial",
    family: null,
    provider: "pi" as const,
    harnessId: "pi" as const,
    model: "unannounced-provider-model",
    taskIds: [p.changes[0].id],
    source: "self-report" as const,
    status: "running" as const,
    at: new Date().toISOString(),
    message: "",
  };
  store.recordEvent(event);
  assert.equal(aggregateFamily("client:pi", store.state()).counts.running, 1);
  assert.equal(aggregateFamily("claude", store.state()).counts.running, 0);
  store.recordEvent({
    ...event,
    id: randomUUID(),
    family: "claude",
    model: "claude-sonnet-4-6",
  });
  assert.equal(aggregateFamily("claude", store.state()).counts.running, 1);
  assert.equal(store.state().sessions[0].harnessId, "pi");
  assert.equal(store.state().sessions[0].avatarId, "claude");
  assert.equal(store.state().sessions[0].measuredMs, 0);
});
test("incremental scans do not reread unchanged payloads and detect tampering; counts use receipts", (t) => {
  const dir = setup(t),
    store = new ProjectStore(dir, "Inbox");
  beforeRemove(t, () => store.close());
  const p = exampleProposal(store.state());
  publishProposal(dir, p);
  assert.equal(collaborationStatus(dir).awaitingReceipt, 1);
  store.ingest();
  assert.equal(collaborationStatus(dir).pendingReview, 1);
  store.command({
    id: randomUUID(),
    type: "proposal.review",
    payload: { proposalId: p.proposalId, decision: "reject" },
  });
  assert.equal(collaborationStatus(dir).pendingFiles, 0);
  assert.equal(collaborationStatus(dir).processed, 1);
  let reads = 0;
  const read = fs.readFileSync;
  try {
    fs.readFileSync = ((f: any, ...args: any[]) => {
      if (String(f).split(path.sep).includes("inbox")) reads++;
      return (read as any)(f, ...args);
    }) as any;
    store.ingest();
    assert.equal(reads, 0);
  } finally {
    fs.readFileSync = read;
  }
  fs.appendFileSync(
    path.join(dir, ".haicomo/inbox", `${p.proposalId}.json`),
    " ",
  );
  store.ingest();
  assert.match(store.warnings.join(" "), /HASH_MISMATCH/);
});
test("proposal filters paginate all history and metrics are independent of the current page", (t) => {
  const dir = setup(t),
    store = new ProjectStore(dir, "Pages");
  beforeRemove(t, () => store.close());
  for (let i = 0; i < 65; i++) {
    const p = exampleProposal(store.state());
    p.actor = { name: "Pi reviewer", harnessId: "pi" };
    p.title = `Review ${i}`;
    p.changes[0].id = "same-task";
    publishProposal(dir, p);
  }
  store.ingest();
  const q = store.queryProposals({
    harnessId: "pi",
    taskId: "same-task",
    author: "reviewer",
    pageSize: 30,
    page: 2,
  });
  assert.equal(q.total, 65);
  assert.equal(q.items.length, 5);
  assert.equal(store.view().proposals.length, 50);
  assert.equal(store.view().metrics.totalProposals, 65);
  assert.equal(
    store.view().metrics.proposalActors["client:pi"].taskMentions,
    65,
  );
  assert.equal(store.queryProposals({ search: "Review 64" }).total, 1);
});
test("schedule edits preserve acceptance and still guard revision; dates work beyond two years", (t) => {
  const dir = setup(t),
    store = new ProjectStore(dir, "Schedule");
  beforeRemove(t, () => store.close());
  store.command({
    id: randomUUID(),
    type: "change",
    payload: {
      entity: "task",
      operation: "create",
      id: "t",
      expectedRevision: null,
      values: {
        title: "Long",
        status: "delivered",
        startDate: "2026-01-01",
        endDate: "2030-01-01",
      },
    },
  });
  store.command({
    id: randomUUID(),
    type: "task.accept",
    payload: { taskId: "t", expectedRevision: 1 },
  });
  const task = store.state().tasks[0],
    dates = shiftSchedule(task, 7);
  store.command({
    id: randomUUID(),
    type: "change",
    payload: {
      entity: "task",
      operation: "update",
      id: "t",
      expectedRevision: 2,
      values: dates,
    },
  });
  assert.equal(store.state().tasks[0].acceptedAt, task.acceptedAt);
  assert.equal(store.state().tasks[0].endDate, "2030-01-08");
  assert.throws(
    () =>
      store.command({
        id: randomUUID(),
        type: "change",
        payload: {
          entity: "task",
          operation: "update",
          id: "t",
          expectedRevision: 2,
          values: dates,
        },
      }),
    /REVISION_CONFLICT/,
  );
});
test("merged legacy projects preserve cross-project dependencies and their source mapping", (t) => {
  const dir = setup(t),
    store = new ProjectStore(dir, "Import");
  beforeRemove(t, () => store.close());
  const file = path.join(dir, "legacy.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 4,
      projects: [
        { id: "a", name: "Alpha" },
        { id: "b", name: "Beta" },
      ],
      tasks: [
        { id: "x", projectId: "a", title: "First" },
        {
          id: "y",
          projectId: "b",
          title: "Second",
          prerequisiteTaskIds: ["x"],
        },
      ],
      notes: [],
    }),
  );
  const preview = legacyPreview(file);
  assert.equal(preview.crossProjectDependencies.length, 1);
  store.importLegacy(file, ["a", "b"], preview.hash);
  const tasks = store.state().tasks;
  assert.deepEqual(tasks[1].dependencies, [tasks[0].id]);
  assert.match(tasks[1].description, /Beta/);
  assert.equal(
    (store.queryAudit().items[0].after as any).idMapping.x,
    tasks[0].id,
  );
});
