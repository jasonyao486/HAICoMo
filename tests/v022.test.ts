import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultSettings, settingsSchema, mergeSettings, initials, settingsEdits, applySettingsEdits } from "../src/shared/settings";
import { LEGAL_LINKS, openLegalLink } from "../src/shared/legal";
import { dictionaries, translator } from "../src/ui/i18n";
import { en022, tw022 } from "../src/ui/messages022";
import { ProjectStore } from "../src/core/store";
import { publishProposal, exampleProposal, readSnapshot } from "../src/core/files";
import { auditContext } from "../src/shared/audit";
import { modelMetrics } from "../src/shared/analytics";
import { InstallGate } from "../src/core/install";
import { releaseOptions, releaseArtifacts } from "../src/core/release";

test("release preparation rejects missing feeds, development signing and incomplete update artifacts", () => {
  assert.throws(() => releaseOptions("darwin", "", ""), /SOURCE_REQUIRED/);
  assert.throws(() => releaseOptions("darwin", "http://example.org", "Developer ID Application: Test"), /HTTPS/);
  assert.throws(() => releaseOptions("darwin", "https://example.org", "Apple Development: Test"), /SIGNATURE/);
  assert.equal(releaseOptions("darwin", "https://example.org/updates", "Developer ID Application: Test").provider, "generic");
  assert.throws(() => releaseArtifacts("darwin", ["App.dmg"]), /ARTIFACTS_MISSING/);
  assert.throws(() => releaseArtifacts("darwin", ["App.dmg", "App.zip", "latest-mac.yml", "upgrade-fixture.json"]), /FIXTURE/);
  assert.doesNotThrow(() => releaseArtifacts("darwin", ["App.dmg", "App.zip", "latest-mac.yml"]));
});

test("settings edits merge across tabs and individual paths without losing newer fields", () => {
  const base = structuredClone(defaultSettings);
  const one = mergeSettings(base, base, { ...base, userName: "Alice", clientPaths: { codex: "/codex" } });
  const two = mergeSettings(one, base, { ...base, locale: "en-GB", clientPaths: { claude: "/claude" } });
  assert.equal(two.userName, "Alice"); assert.equal(two.codexPath, "/codex"); assert.equal(two.claudePath, "/claude");
  const edits = settingsEdits(base, { ...base, userName: "Alice" });
  assert.deepEqual(edits, [{ kind: "preference", key: "userName", before: "", after: "Alice" }]);
  assert.equal(applySettingsEdits({ ...base, updateFeed: "https://example.org" }, edits).updateFeed, "https://example.org");
  assert.throws(() => applySettingsEdits({ ...base, userName: "Bob" }, edits), /SETTINGS_CONFLICT/);
  assert.throws(() => mergeSettings(two, base, { ...base, userName: "Bob" }), /SETTINGS_CONFLICT/);
  assert.throws(() => mergeSettings(two, base, { ...base, clientPaths: { codex: "/old" } }), /SETTINGS_CONFLICT/);
  assert.equal(settingsSchema.parse({ ...defaultSettings, userName: undefined }).userName, "");
  assert.deepEqual(initials("John Ronald Reuel Tolkien"), ["J", "R", "R", "T"]);
  assert.deepEqual(initials("张小明"), ["张", "小", "明"]);
  assert.deepEqual(initials("", "ÁBC"), ["Á", "B", "C"]);
  assert.equal(initials("One Two Three Four Five").length, 4);
  assert.equal(settingsSchema.safeParse({ ...base, avatarInitials: "ABCDE" }).success, false);
});

test("legal links are exactly allowlisted; malformed or arbitrary URLs never reach the OS", async () => {
  const opened: string[] = [];
  const open = async (url: string) => { opened.push(url); };
  for (const linkId of Object.keys(LEGAL_LINKS)) await openLegalLink({ linkId }, open);
  assert.equal(opened.length, Object.keys(LEGAL_LINKS).length);
  assert.equal(LEGAL_LINKS.whaleOriginal, "https://b23.tv/3dNz55h");
  for (const input of [{ linkId: "toString" }, { linkId: "missing" }, { linkId: "creator", url: "https://example.org" }, { url: "file:///tmp" }, {}, null]) await assert.rejects(openLegalLink(input, open), /LEGAL_LINK_NOT_ALLOWED/);
  assert.equal(opened.length, Object.keys(LEGAL_LINKS).length);
  await assert.rejects(openLegalLink({ linkId: "creator" }, async () => { throw new Error("OS unavailable"); }), /LEGAL_LINK_OPEN_FAILED/);
});

test("all four locale resources carry complete terms, regional English and unchanged attribution", () => {
  for (const locale of Object.keys(dictionaries) as (keyof typeof dictionaries)[]) {
    const t = translator(locale);
    for (const key of Object.keys(en022) as (keyof typeof en022)[]) assert.ok(t(key)?.trim(), `${locale}:${key}`);
    assert.match(t("legalWhale"), /\{creator\}/); assert.match(t("legalWhale"), /\{original\}/); assert.match(t("legalWhale"), /\{license\}/);
    assert.doesNotMatch(t("legalPermission"), /pending|等待回复|等待回覆/i);
  }
  for (const key of Object.keys(tw022) as (keyof typeof tw022)[]) assert.equal(translator("zh-TW")(key), tw022[key], `Traditional Chinese override: ${key}`);
  assert.equal(translator("en-GB")("legalTitle"), "Terms & Licences");
  assert.equal(translator("en-US")("legalTitle"), "Terms & Licenses");
  assert.match(translator("en-GB")("legalWhale"), /licensed under/);
  assert.match(translator("en-GB")("legalWhale"), /licence information/);
  assert.match(translator("zh-CN")("legalApp"), /不限制其许可已授予的权利/);
  assert.match(translator("zh-CN")("legalScope"), /不适用于其他角色、品牌图标或整个 App/);
});

function fixture(t: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-022-"));
  const store = new ProjectStore(directory, "History");
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const change = (id: string, values: any, human = "Alice") => store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: store.state().tasks.some((x) => x.id === id) ? "update" : "create", id, expectedRevision: store.state().tasks.find((x) => x.id === id)?.revision ?? null, values } }, human);
  return { store, directory, change };
}
test("audit preserves actor, reviewer and nested titles through rename, deletion and legacy reads", (t) => {
  const { store, directory, change } = fixture(t);
  change("parent", { title: "Original parent" });
  change("child", { title: "Original child", parentId: "parent" });
  const created = store.view().audit.find((a) => a.entityId === "child")!;
  assert.equal(created.context?.actor.name, "Alice");
  assert.deepEqual(created.context?.tasks[0].path.map((p) => p.title), ["Original parent", "Original child"]);
  change("parent", { title: "Renamed parent" }, "Bob");
  assert.deepEqual(store.view().audit.find((a) => a.id === created.id)?.context, created.context);
  const proposal = exampleProposal(readSnapshot(directory));
  proposal.actor = { name: "Claude reviewer", family: "claude", harnessId: "claude", model: "claude-test" };
  proposal.changes = [{ entity: "task", operation: "update", id: "child", expectedRevision: store.state().tasks.find((v) => v.id === "child")!.revision, values: { title: "Agent title" } }];
  publishProposal(directory, proposal); store.ingest(true);
  const changes = structuredClone(proposal.changes); changes[0].values.title = "Human edited title";
  store.command({ id: randomUUID(), type: "proposal.review", payload: { proposalId: proposal.proposalId, decision: "approve", changes } }, "Carol");
  const applied = store.view().audit.find((a) => a.context?.reviewer)!;
  assert.equal(applied.context?.actor.family, "claude"); assert.equal(applied.context?.reviewer?.name, "Carol"); assert.equal(applied.context?.modified, true);
  for (const type of ["task.archive", "task.delete"]) store.command({ id: randomUUID(), type, payload: { taskId: "child", expectedRevision: store.state().tasks.find((v) => v.id === "child")!.revision } }, "Carol");
  assert.deepEqual(store.view().audit.find((a) => a.id === applied.id)?.context, applied.context);
  const legacy = { ...created, context: undefined, actor: "human" };
  assert.equal(auditContext(legacy, store.state()).actor.name, "");
  assert.equal(store.proposals()[0].proposal.changes[0].values.title, "Agent title");
});

test("model attribution deduplicates tasks and sessions across clients while preserving unknown evidence", (t) => {
  const { store, change } = fixture(t);
  change("one", { title: "One", assignees: ["human", "chatgpt", "client:codex"] });
  change("two", { title: "Two", assignees: ["client:cursor"] });
  const state = store.state();
  const session: any = { sessionId: "s1", taskIds: ["one"], family: "chatgpt", harnessId: "codex", source: "runner", measuredMs: 2500 };
  state.sessions = [session, session, { ...session, sessionId: "s2", harnessId: "cursor", measuredMs: 3500 }, { ...session, sessionId: "s3", family: null, taskIds: ["two"], source: "self-report", measuredMs: 990000 }];
  const data = modelMetrics(state, []);
  assert.deepEqual(data.families.chatgpt.taskIds, ["one"]); assert.equal(data.families.chatgpt.measuredMs, 6000);
  assert.equal(data.humanTasks, 1); assert.equal(data.unknownTasks, 1); assert.equal(data.unknownMeasuredMs, 0);
  assert.equal(Object.keys(data.families).some((k) => k.startsWith("client:")), false);
});

test("update gate waits for every window, freezes acknowledged windows and commits exactly once", async () => {
  const requested: any[] = [], committed: any[] = []; let failures = 0;
  const gate = new InstallGate({ busy: () => false, begin() {}, prepare: (id, ticket) => requested.push([id, ticket]), commit: async (windows) => { committed.push(windows); }, cancel() {}, failed() { failures++; } });
  const ticket = gate.start([1, 2]); assert.equal(gate.start([1, 2]), ticket);
  const tabs: any[] = [{ page: "settings", active: true }];
  gate.ready(1, ticket, tabs); assert.equal(gate.frozen(1), true); assert.equal(gate.frozen(2), false); assert.equal(committed.length, 0);
  assert.throws(() => gate.ready(3, ticket, tabs), /PREPARATION/);
  gate.ready(2, ticket, tabs); gate.ready(2, ticket, tabs);
  await new Promise((r) => setImmediate(r));
  assert.equal(committed.length, 1); assert.equal(failures, 0); assert.equal(gate.active, false);
});
test("update cancellation and a newly started agent prevent installation and release locks", async () => {
  let busy = false, commits = 0, cancelled = 0; const failures: unknown[] = [];
  const gate = new InstallGate({ busy: () => busy, begin() {}, prepare() {}, commit: async () => { commits++; }, cancel() { cancelled++; }, failed: (e) => failures.push(e) });
  let ticket = gate.start([1, 2]); gate.ready(1, ticket, []); gate.cancel(ticket);
  assert.equal(gate.frozen(1), false); assert.equal(cancelled, 1);
  ticket = gate.start([1]); busy = true; gate.ready(1, ticket, []);
  await new Promise((r) => setImmediate(r));
  assert.match(String(failures[0]), /STOP_AGENTS/); assert.equal(commits, 0); assert.equal(gate.active, false);
});
