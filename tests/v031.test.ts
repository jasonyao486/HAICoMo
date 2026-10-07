import { temporaryDirectory, beforeRemove } from "./temp-directory";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ProjectStore, restoreZip } from "../src/core/store";
import { taskValuesSchema, type Task } from "../src/shared/domain";
import { graphLayout, NODE_WIDTH, NODE_HEIGHT } from "../src/shared/graph-layout";
import { assignedCompanies } from "../src/shared/brands";
import { portableArtifactPath, externalArtifactPath, artifactPromptPath } from "../src/shared/artifact-path";
import { resolveArtifactPath } from "../src/core/artifact-path";
import { dictionaries } from "../src/ui/i18n";

function setup(t: any) {
  return temporaryDirectory(t, "haicomo-v031-");
}
test("permanent audit deletion preserves entities and historical return statistics across reopen, backup and fork", t => {
  const dir = setup(t); let store = new ProjectStore(dir, "Audit example");
  beforeRemove(t, () => { try { store.close(); } catch {} });
  const command = (type: string, payload: unknown) => store.command({ id: randomUUID(), type, payload });
  const taskId = randomUUID();
  command("change", { entity: "task", operation: "create", id: taskId, expectedRevision: null, values: { title: "Delivery" } });
  command("task.return", { taskId, expectedRevision: 1 });
  const row = store.queryAudit().items.find(a => a.action === "task.return")!;
  const entities = structuredClone({ tasks: store.state().tasks, proposals: store.proposals(), sessions: store.state().sessions });
  const oldBackup = path.join(dir, "before.zip"); store.exportZip(oldBackup);
  const oldBytes = fs.readFileSync(oldBackup);
  const op = { id: randomUUID(), type: "audit.delete", payload: { auditId: row.id } };
  const beforeRevision = store.state().revision;
  store.command(op); store.command(op);
  assert.equal(store.state().revision, beforeRevision + 1);
  assert.equal(store.view().metrics.acceptanceReturns, 1);
  assert.deepEqual({ tasks: store.state().tasks, proposals: store.proposals(), sessions: store.state().sessions }, entities);
  assert.ok(!store.queryAudit().items.some(a => a.id === row.id));
  assert.throws(() => command("audit.delete", { auditId: row.id }), /AUDIT_NOT_FOUND/);
  assert.throws(() => command("audit.delete", { auditId: "all" }), /Invalid/);
  assert.throws(() => command("audit.delete", { auditId: randomUUID(), all: true }));
  const nextBackup = path.join(dir, "after.zip"); store.exportZip(nextBackup);
  assert.deepEqual(fs.readFileSync(oldBackup), oldBytes);
  store.close(); store = new ProjectStore(dir);
  assert.equal(store.view().metrics.acceptanceReturns, 1);
  assert.ok(!store.queryAudit().items.some(a => a.id === row.id));
  for (const [file, shouldExist] of [[oldBackup, true], [nextBackup, false]] as const) {
    const target = path.join(dir, shouldExist ? "before" : "after"); fs.mkdirSync(target);
    restoreZip(file, target); const restored = new ProjectStore(target);
    assert.equal(restored.queryAudit().items.some(a => a.id === row.id), shouldExist);
    assert.equal(restored.view().metrics.acceptanceReturns, 1); restored.close();
  }
  const fork = path.join(dir, "fork"); fs.mkdirSync(fork); store.fork(fork);
  const independent = new ProjectStore(fork); assert.equal(independent.view().metrics.acceptanceReturns, 0); independent.close();
  const other = path.join(dir, "other"); fs.mkdirSync(other); const sibling = new ProjectStore(other, "Other");
  assert.throws(() => sibling.command({ id: randomUUID(), type: "audit.delete", payload: { auditId: store.queryAudit().items[0].id } }), /AUDIT_NOT_FOUND/); sibling.close();
});

function oldProject(dir: string) {
  const store = new ProjectStore(dir, "Migration");
  const id = randomUUID();
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title: "Returned" } } });
  store.command({ id: randomUUID(), type: "task.return", payload: { taskId: id, expectedRevision: 1 } });
  const state: any = store.state(); store.close(); state.schemaVersion = 4; delete state.historyStats;
  const db = new DatabaseSync(path.join(dir, ".haicomo/project.sqlite")); db.prepare("UPDATE project SET json=?").run(JSON.stringify(state)); db.close();
  const manifest = path.join(dir, ".haicomo/manifest.json"); fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, "utf8")), schemaVersion: 4 }));
}
test("v4 migration backs up once and initializes independent counts without recounting deleted history", t => {
  const dir = setup(t); oldProject(dir);
  let store = new ProjectStore(dir);
  assert.equal(store.state().schemaVersion, 5); assert.equal(store.state().historyStats.acceptanceReturns, 1);
  const backup = path.join(dir, ".haicomo/backups/pre-v5.haicomo.zip"); assert.ok(fs.existsSync(backup));
  const bytes = fs.readFileSync(backup), row = store.queryAudit().items.find(a => a.action === "task.return")!;
  store.command({ id: randomUUID(), type: "audit.delete", payload: { auditId: row.id } }); store.close();
  store = new ProjectStore(dir); assert.equal(store.view().metrics.acceptanceReturns, 1); store.close();
  assert.deepEqual(fs.readFileSync(backup), bytes);
});
test("a failed v5 backup leaves the previous database unchanged", t => {
  const dir = setup(t); oldProject(dir);
  fs.writeFileSync(path.join(dir, ".haicomo/backups"), "not a directory");
  assert.throws(() => new ProjectStore(dir));
  const db = new DatabaseSync(path.join(dir, ".haicomo/project.sqlite"));
  assert.equal(JSON.parse((db.prepare("SELECT json FROM project").get() as any).json).schemaVersion, 4); db.close();
});
test("a failure inside the v5 migration transaction rolls back state and retries from its preserved backup", t => {
  const dir = setup(t); oldProject(dir);
  const file = path.join(dir, ".haicomo/project.sqlite");
  let db = new DatabaseSync(file);
  db.exec("CREATE TRIGGER reject_migration BEFORE INSERT ON audit WHEN json_extract(NEW.json,'$.action')='schema.migrate' BEGIN SELECT RAISE(ABORT,'injected migration failure'); END");
  db.close();
  assert.throws(() => new ProjectStore(dir), /injected migration failure/);
  db = new DatabaseSync(file);
  const state = JSON.parse((db.prepare("SELECT json FROM project").get() as any).json);
  assert.equal(state.schemaVersion, 4); assert.equal(state.historyStats, undefined);
  db.exec("DROP TRIGGER reject_migration"); db.close();
  assert.ok(fs.existsSync(path.join(dir, ".haicomo/backups/pre-v5.haicomo.zip")));
  const reopened = new ProjectStore(dir);
  assert.equal(reopened.state().schemaVersion, 5);
  assert.equal(reopened.view().metrics.acceptanceReturns, 1); reopened.close();
});

const task = (id: string, parentId: string | null = null, dependencies: string[] = []): Task => ({ ...taskValuesSchema.parse({ title: `A long task 中文 ${id}`, parentId, dependencies }), id, revision: 1, archived: false, acceptedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
test("60-node forests and dependency graphs have stable non-overlapping reachable nodes", () => {
  const forest = Array.from({ length: 10 }, (_, i) => [task(`p${i}`), ...Array.from({ length: 5 }, (_, j) => task(`s${i}-${j}`, `p${i}`))]).flat();
  const joined = forest.map((t, i) => ({ ...t, dependencies: i > 1 ? [forest[i - 1].id, forest[Math.floor(i / 2)].id] : [] }));
  for (const [tasks, mindmap] of [[forest, true], [forest, false], [joined, false], [forest.filter(t => t.id !== "p0"), true]] as const) {
    const layout = graphLayout(tasks, mindmap); assert.equal(layout.points.size, tasks.length);
    assert.deepEqual([...layout.points], [...graphLayout(tasks, mindmap).points]);
    const points = [...layout.points.values()];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]; assert.ok(a.x >= 0 && a.y >= 0 && a.x + NODE_WIDTH <= layout.width && a.y + NODE_HEIGHT <= layout.height);
      for (const b of points.slice(i + 1)) assert.ok(a.x + NODE_WIDTH <= b.x || b.x + NODE_WIDTH <= a.x || a.y + NODE_HEIGHT <= b.y || b.y + NODE_HEIGHT <= a.y, "nodes overlap");
    }
  }
});
test("company logos require explicit model families, never client or historical inference", () => {
  assert.deepEqual(assignedCompanies(["human", "client:codex", "client:cursor"]), []);
  assert.deepEqual(assignedCompanies(["claude", "claude", "gemini"]).map(c => c.name), ["Anthropic", "Google"]);
});
test("artifact paths remain portable with Unicode and reject foreign absolute references", () => {
  const value = "deliverables\\中文 notes\\report.md";
  assert.equal(portableArtifactPath(value), "deliverables/中文 notes/report.md");
  assert.equal(resolveArtifactPath("/project", value, "darwin"), "/project/deliverables/中文 notes/report.md");
  assert.equal(resolveArtifactPath("C:\\project", portableArtifactPath(value), "win32"), "C:\\project\\deliverables\\中文 notes\\report.md");
  assert.throws(() => resolveArtifactPath("/project", "C:\\data\\a.md", "darwin"), /FOREIGN/);
  assert.throws(() => resolveArtifactPath("C:\\project", "/Users/example/a.md", "win32"), /FOREIGN/);
  assert.equal(externalArtifactPath("../a.md"), true); assert.match(artifactPromptPath("../a.md"), /external/);
});
test("all four release locale key sets remain aligned", () => {
  const keys = Object.keys(dictionaries["en-US"]).sort();
  for (const [name, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), keys, name);
    assert.ok(Object.values(dictionary).every(v => typeof v === "string" && v.length > 0));
  }
});
