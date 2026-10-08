import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { temporaryDirectory, beforeRemove } from "./temp-directory";
import { projectFilename } from "../src/shared/project-filename";
import { ProjectStore } from "../src/core/store";
import { AGENT_GUIDE, ensureAgentGuide } from "../src/core/agent-guide";
import { createFreshProject } from "../src/core/lifecycle";
import { exampleProposal, publishProposal } from "../src/core/files";
import { assertAgentConnection, composeAgentPrompt } from "../src/shared/agent-prompt";
import { composeRelayPrompt } from "../src/shared/relay";

test("portable new-project filenames preserve Unicode and bound complete UTF-8 characters", () => {
  for (const [name, expected] of [
    ["rpi5", "rpi5.haicomo"], ["中文 项目", "中文 项目.haicomo"], ["hello world", "hello world.haicomo"],
    ["bad<>:\"/\\|?*\x00\x1f", "bad___________.haicomo"], ["rpi5.HAICOMO.haicomo... ", "rpi5.haicomo"],
    ["CON", "_CON.haicomo"], ["NUL.txt", "_NUL.txt.haicomo"], ["COM¹", "_COM¹.haicomo"], ["lpt9", "_lpt9.haicomo"],
    ["COM10", "COM10.haicomo"], ["x\u0085y", "x_y.haicomo"], ["x\ud800y", "x_y.haicomo"], ["... ", "HAICoMo.haicomo"], [".haicomo", "HAICoMo.haicomo"],
  ]) assert.equal(projectFilename(name), expected, name);
  const stem = projectFilename("界😀".repeat(100)).slice(0, -8);
  assert.ok(Buffer.byteLength(stem) <= 180);
  assert.ok(!stem.includes("�"));
  assert.equal(Buffer.byteLength(projectFilename("x".repeat(300)).slice(0, -8)), 180);
});

test("new named entry survives reopen and title edits; a second entry is rejected", (t) => {
  const dir = temporaryDirectory(t, "haicomo-named-"), file = path.join(dir, projectFilename("rpi5"));
  createFreshProject(file, "rpi5");
  const store = new ProjectStore(file);
  const identity = [store.state().id, store.state().epoch];
  store.command({ id: randomUUID(), type: "change", payload: { entity: "project", operation: "update", id: store.state().id, expectedRevision: store.state().revision, values: { title: "Changed display title" } } });
  assert.equal(store.state().title, "Changed display title");
  assert.ok(fs.existsSync(file));
  store.close();
  assert.throws(() => createFreshProject(path.join(dir, "Other.haicomo"), "Other"), /ENTRY_ALREADY_EXISTS/);
  const reopened = new ProjectStore(dir);
  assert.deepEqual([reopened.state().id, reopened.state().epoch], identity);
  assert.equal(reopened.entryPath, file);
  reopened.close();
});

test("old project onboarding preserves rule bytes, identity and immutable pending proposals", (t) => {
  const dir = temporaryDirectory(t, "haicomo-guide-upgrade-");
  const store = new ProjectStore(dir, "Existing");
  const initial = store.state(), proposal = exampleProposal(initial);
  publishProposal(dir, proposal);
  store.close();
  const root = path.join(dir, ".haicomo");
  fs.unlinkSync(path.join(root, "agent-guide.md"));
  const rules = "# Custom rules\r\nKeep exact bytes.\r\n";
  for (const file of [path.join(dir, "AGENTS.md"), path.join(root, "AGENTS.md")]) fs.writeFileSync(file, rules);
  const bytes = fs.readFileSync(path.join(root, "inbox", proposal.proposalId + ".json"));
  const next = new ProjectStore(dir);
  assert.equal(next.view().agentGuideError, undefined);
  assert.equal(next.state().id, initial.id);
  assert.equal(next.state().epoch, initial.epoch);
  assert.equal(next.state().schemaVersion, 5);
  assert.deepEqual(fs.readFileSync(path.join(root, "inbox", proposal.proposalId + ".json")), bytes);
  for (const file of [path.join(dir, "AGENTS.md"), path.join(root, "AGENTS.md")]) assert.equal(fs.readFileSync(file, "utf8"), rules);
  assert.equal(fs.readFileSync(path.join(root, "agent-guide.md"), "utf8"), AGENT_GUIDE);
  next.close();
});

test("custom guides and symlinks are preserved; unavailable guides block connection", (t) => {
  const dir = temporaryDirectory(t, "haicomo-guide-conflict-");
  const store = new ProjectStore(dir, "Conflict"), file = path.join(store.root, "agent-guide.md");
  fs.writeFileSync(file, "Human guide\n");
  assert.equal(ensureAgentGuide(store.root), "AGENT_GUIDE_CONFLICT");
  assert.equal(fs.readFileSync(file, "utf8"), "Human guide\n");
  assert.throws(() => assertAgentConnection(store.view()), /AGENT_GUIDE_CONFLICT/);
  fs.unlinkSync(file);
  assert.throws(() => assertAgentConnection(store.view()), /AGENT_GUIDE_UNAVAILABLE/);
  fs.mkdirSync(file);
  assert.equal(ensureAgentGuide(store.root), "AGENT_GUIDE_CONFLICT");
  assert.equal(ensureAgentGuide(path.join(dir, "absent")), "AGENT_GUIDE_UNAVAILABLE");
  store.close();
});

test("four-language connection and relay prompts share instructions without persisting generated text", (t) => {
  const dir = temporaryDirectory(t, "haicomo-prompts-"), store = new ProjectStore(dir, "Prompts");
  const taskId = randomUUID(), custom = "Keep this custom instruction exactly.\n";
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: taskId, expectedRevision: null, values: { title: "Synthetic task", description: "Task context", handoff: custom, artifacts: [{ id: randomUUID(), label: "Output", path: "out/result.txt" }] } } });
  beforeRemove(t, () => store.close());
  const state = store.state();
  for (const locale of ["en-US", "en-GB", "zh-CN", "zh-TW"] as const) {
    const prompt = composeAgentPrompt(dir, state, locale, taskId, custom);
    assert.equal(composeRelayPrompt({ taskId, prompt: custom, afterSessionId: null, referenceTaskId: null }, state, dir, locale), prompt);
    assert.ok(prompt.includes(custom));
    for (const text of [dir, taskId, "Synthetic task", "Task context", "out/result.txt", "agent-guide.md", "manifest.json", "snapshot.json", "protocol.schema.json", "proposal-example.json", "SHA-256", ".ready"]) assert.ok(prompt.includes(text));
    assert.equal(prompt.split(custom).length, 2);
    assert.ok(!composeAgentPrompt(dir, state, locale).includes(taskId));
    assert.ok(!composeAgentPrompt("other-project", state, locale).includes(dir));
  }
  assert.equal(store.state().tasks[0].handoff, custom);
  assert.throws(() => composeAgentPrompt(dir, state, "en-GB", "removed"), /TASK_NOT_FOUND/);
  store.close();
});
