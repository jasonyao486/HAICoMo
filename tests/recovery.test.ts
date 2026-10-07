import { restoreEntry } from "../src/core/lifecycle";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { ProjectStore, restoreZip } from "../src/core/store";
import {
  exampleProposal,
  publishProposal,
  readJson,
  readSnapshot,
} from "../src/core/files";
import { aggregateFamily } from "../src/shared/domain";

function setup(t: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-recovery-")),
    store = new ProjectStore(dir, "Recovery");
  t.after(() => {
    try {
      store.close();
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store };
}
test("a process killed inside a transaction leaves no partial project or audit", async (t) => {
  const { dir, store } = setup(t);
  store.close();
  const script = `import {ProjectStore} from ${JSON.stringify(pathToFileURL(path.resolve("src/core/store.ts")).href)};const s=new ProjectStore(${JSON.stringify(dir)});s.db.exec('BEGIN IMMEDIATE');const state=s.state();state.title='Uncommitted';s.db.prepare('UPDATE project SET json=? WHERE id=1').run(JSON.stringify(state));s.db.prepare('INSERT INTO audit(json) VALUES(?)').run('{}');process.stdout.write('inside-transaction\\n');setInterval(()=>{},1000);`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("child timeout")), 5000).unref(),
      ),
    ]);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    const recovered = new ProjectStore(dir);
    try {
      assert.equal(recovered.state().title, "Recovery");
      assert.equal(recovered.view().audit.length, 0);
      assert.equal(
        (recovered.db.prepare("PRAGMA integrity_check").get() as any)
          .integrity_check,
        "ok",
      );
    } finally {
      recovered.close();
    }
  } finally {
    child.kill("SIGKILL");
  }
});
test("commit survives receipt publication failure and reconstructs on reopen", (t) => {
  const { dir, store } = setup(t),
    p = exampleProposal(store.state());
  publishProposal(dir, p);
  store.ingest();
  const receipt = path.join(
    dir,
    ".haicomo",
    "receipts",
    p.proposalId + ".json",
  );
  fs.rmSync(receipt);
  fs.mkdirSync(receipt);
  const op = {
    id: randomUUID(),
    type: "proposal.review",
    payload: { proposalId: p.proposalId, decision: "approve" },
  };
  const committed = store.command(op);
  assert.equal(committed.proposals[0].status, "applied");
  assert.match(committed.warnings.join(), /database committed/);
  store.command(op);
  assert.equal(store.state().tasks.length, 1);
  store.close();
  fs.rmdirSync(receipt);
  const recovered = new ProjectStore(dir);
  try {
    assert.equal(readJson(receipt).status, "applied");
    assert.equal(readJson(receipt).persisted, true);
    assert.equal(recovered.state().tasks.length, 1);
  } finally {
    recovered.close();
  }
});
test("incomplete input is ignored and readonly database failure cannot mutate state", (t) => {
  const { dir, store } = setup(t),
    p = exampleProposal(store.state());
  fs.writeFileSync(
    path.join(dir, ".haicomo", "inbox", p.proposalId + ".json"),
    "{",
  );
  store.ingest();
  assert.equal(store.proposals().length, 0);
  store.db.exec("PRAGMA query_only=ON");
  assert.throws(
    () =>
      store.command({
        id: randomUUID(),
        type: "change",
        payload: p.changes[0],
      }),
    /readonly/,
  );
  assert.equal(store.state().tasks.length, 0);
  store.db.exec("PRAGMA query_only=OFF");
});
test("invalid restoration or future schema leaves the target and source intact", (t) => {
  const { dir, store } = setup(t),
    target = path.join(dir, "target");
  fs.mkdirSync(target);
  const file = path.join(dir, "invalid.zip");
  const manifest = fs.readFileSync(path.join(dir, ".haicomo", "manifest.json"));
  fs.writeFileSync(
    file,
    zipSync({
      "manifest.json": manifest,
      "project.sqlite": Buffer.from("corrupt"),
    }),
  );
  assert.throws(() => restoreZip(file, target));
  assert.deepEqual(fs.readdirSync(target), []);
  store.close();
  const manifestPath = path.join(dir, ".haicomo", "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ ...JSON.parse(manifest.toString()), schemaVersion: 99 }),
  );
  const before = fs.readFileSync(path.join(dir, ".haicomo", "project.sqlite"));
  assert.throws(() => new ProjectStore(dir), /UNSUPPORTED_SCHEMA/);
  assert.deepEqual(
    fs.readFileSync(path.join(dir, ".haicomo", "project.sqlite")),
    before,
  );
});
test("entry deletion stays missing until explicit recovery; directory moves preserve identity", (t) => {
  const { dir, store } = setup(t),
    id = store.state().id;
  store.close();
  fs.unlinkSync(path.join(dir, "HAICoMo.haicomo"));
  assert.throws(() => new ProjectStore(dir), /ENTRY_NOT_FOUND/);
  assert.equal(fs.existsSync(path.join(dir, "HAICoMo.haicomo")), false);
  restoreEntry(dir);
  const reopened = new ProjectStore(dir);
  reopened.close();
  assert.ok(fs.existsSync(path.join(dir, "HAICoMo.haicomo")));
  const moved = dir + " 改名";
  fs.renameSync(dir, moved);
  try {
    const s = new ProjectStore(moved);
    assert.equal(s.state().id, id);
    s.close();
  } finally {
    fs.renameSync(moved, dir);
  }
});
test("runtime accounts for confirmed adjacent intervals and excludes lost time", (t) => {
  const { store } = setup(t),
    p = exampleProposal(store.state());
  store.command({ id: randomUUID(), type: "change", payload: p.changes[0] });
  const taskId = p.changes[0].id;
  const base = Date.now() - 300000;
  for (const [seconds, status] of [
    [0, "running"],
    [15, "running"],
    [150, "running"],
    [160, "idle"],
  ] as const)
    store.recordEvent({
      id: randomUUID(),
      sessionId: "one",
      family: "claude",
      provider: "claude",
      model: "local",
      taskIds: [taskId],
      status,
      source: "runner",
      at: new Date(base + seconds * 1000).toISOString(),
      message: "",
    });
  assert.equal(store.state().sessions[0].measuredMs, 25000);
  assert.equal(readSnapshot(store.directory).sessions[0].measuredMs, 25000);
  const state = store.state();
  state.tasks[0].assignees = ["chatgpt"];
  assert.equal(aggregateFamily("chatgpt", state).status, "unknown");
});
