import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "../src/core/store";
import { legacyPreview, readLegacy } from "../src/core/legacy";

test("legacy JSON and HTML are inert; imported Done tasks still need acceptance", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-import-")),
    file = path.join(dir, "old.html");
  const snapshot = {
    schemaVersion: 4,
    projects: [{ id: "p", name: "Old project", highLevelInfo: "Decisions" }],
    tasks: [
      {
        id: "a",
        projectId: "p",
        title: "Delivered",
        owner: "Claude",
        status: "Done",
        deadline: "2026-10-05",
        outputDirectories: ["outputs/report.txt"],
      },
      {
        id: "b",
        projectId: "p",
        title: "Next",
        ownerType: "human",
        prerequisiteTaskIds: ["a"],
      },
    ],
    notes: [
      {
        id: "n",
        projectId: "p",
        title: "Meeting",
        kind: "meeting",
        summary: "Decision",
        decisions: "Keep local",
      },
    ],
  };
  fs.writeFileSync(
    file,
    `<html><script>throw new Error('Do not execute');</script><script id="workPlannerData" type="application/json">${JSON.stringify(snapshot)}</script></html>`,
  );
  const bytes = fs.readFileSync(file),
    preview = legacyPreview(file),
    store = new ProjectStore(dir, "Empty");
  try {
    assert.equal(preview.projects[0].tasks, 2);
    store.importLegacy(file, "p", preview.hash);
    assert.equal(store.state().tasks[0].acceptedAt, null);
    assert.equal(store.state().tasks[0].status, "delivered");
    assert.deepEqual(store.state().tasks[1].dependencies, [
      store.state().tasks[0].id,
    ]);
    assert.equal(store.state().title, "Old project");
    assert.match(store.state().notes[0].body, /Keep local/);
    assert.equal(store.view().audit[0].action, "legacy.import");
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.throws(
      () => store.importLegacy(file, "p", preview.hash),
      /EMPTY_PROJECT/,
    );
    fs.writeFileSync(
      file,
      `<script id='workPlannerEmbeddedSnapshot'>${Buffer.from(JSON.stringify({ snapshot })).toString("base64")}</script>`,
    );
    assert.equal(readLegacy(file).snapshot.projects[0].name, "Old project");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("legacy cross-project prerequisites or changed source abort without partial data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-import-")),
    file = path.join(dir, "old.json"),
    store = new ProjectStore(dir, "Empty");
  try {
    const raw = {
      schemaVersion: 1,
      projects: [
        { id: "p", name: "First" },
        { id: "q", name: "Second" },
      ],
      tasks: [
        { id: "a", projectId: "p", title: "A", prerequisiteTaskIds: ["b"] },
        { id: "b", projectId: "q", title: "B" },
      ],
      meetingNotes: [],
    };
    fs.writeFileSync(file, JSON.stringify(raw));
    const preview = legacyPreview(file);
    assert.throws(
      () => store.importLegacy(file, "p", preview.hash),
      /CROSS_PROJECT/,
    );
    assert.equal(store.state().tasks.length, 0);
    fs.appendFileSync(file, " ");
    assert.throws(
      () => store.importLegacy(file, "p", preview.hash),
      /FILE_CHANGED/,
    );
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
