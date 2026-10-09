import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { temporaryDirectory, beforeRemove } from "./temp-directory";
import { compareVersions, parseVersion } from "../src/shared/version";
import { createReleaseResolver, isOfficialTagFeed, OFFICIAL_RELEASES, releaseTarget, selectRelease, type HttpGet } from "../src/core/release-feed";
import { UpdateController, updateErrorCode } from "../src/core/updates";
import { macPreflight, windowsPreflight } from "../src/core/update-preflight";
import { applySettingsEdits, defaultSettings, settingsEdits, settingsSchema } from "../src/shared/settings";
import { HARNESS_IDS, clientIcon } from "../src/shared/clients";
import { searchTerms } from "../src/shared/search";
import { excerpt, highlight, revisionHits, searchLocal } from "../src/ui/search-model";
import { ProjectStore } from "../src/core/store";
import { exampleProposal, publishProposal } from "../src/core/files";
// @ts-expect-error JavaScript release script without type declarations.
import { parseUpdateMetadata, renderUpdateMetadata, verifyUpdateMetadata, writeUpdateMetadata } from "../scripts/update-metadata.mjs";
import type { Note, ProjectState, Task } from "../src/shared/domain";

const mac = { platform: "darwin", arch: "arm64" } as const, win = { platform: "win32", arch: "x64" } as const;
const assets = (version: string, names: string[] = ["latest-mac.yml", `HAICoMo-${version}-arm64-mac.zip`, "latest.yml", `HAICoMo-${version}-windows-x64-setup.exe`]) => names.map((name) => ({ name, state: "uploaded", browser_download_url: "https://evil.example/x" }));

test("versions compare numerically and reject pre-release suffixes", () => {
  assert.deepEqual(parseVersion("0.10.2"), [0, 10, 2]);
  assert.equal(parseVersion("0.4.0-beta.1"), null);
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.equal(compareVersions("0.4.0", "0.4.0"), 0);
  assert.throws(() => compareVersions("v1", "0.1.0"), /INVALID_VERSION/);
  assert.deepEqual(releaseTarget("darwin", "arm64"), mac);
  assert.equal(releaseTarget("darwin", "x64"), null);
  assert.equal(releaseTarget("linux", "x64"), null);
});

test("release selection skips drafts, malformed tags, older versions and releases without this platform's package", () => {
  const list = [
    { tag_name: "v0.9.0", draft: true, assets: assets("0.9.0") },
    { tag_name: "v0.6.0-beta.1", prerelease: true, assets: assets("0.6.0-beta.1") },
    { tag_name: "v0.5.1", prerelease: true, body: "Windows first", assets: assets("0.5.1", ["latest.yml", "HAICoMo-0.5.1-windows-x64-setup.exe"]) },
    { tag_name: "v0.5.0", prerelease: true, body: "Notes ".repeat(3000), assets: [...assets("0.5.0").slice(0, 3), { name: "HAICoMo-0.5.0-windows-x64-setup.exe", state: "open" }] },
    { tag_name: "v0.4.1", prerelease: true, assets: assets("0.4.1") },
    { tag_name: "v0.4.0", assets: assets("0.4.0") },
    { tag_name: "v0.3.5", assets: assets("0.3.5") },
  ];
  const onMac = selectRelease(list, "0.4.0", mac, OFFICIAL_RELEASES);
  assert.equal(onMac.kind, "update");
  if (onMac.kind !== "update") return;
  assert.equal(onMac.version, "0.5.0");
  assert.equal(onMac.feed, "https://github.com/jasonyao486/HAICoMo/releases/download/v0.5.0/");
  assert.equal(onMac.page, "https://github.com/jasonyao486/HAICoMo/releases/tag/v0.5.0");
  assert.ok(onMac.notes.length <= 8000);
  // The Windows installer of 0.5.0 is still uploading; 0.5.1 lacks a Mac package.
  const onWindows = selectRelease(list, "0.4.0", win, OFFICIAL_RELEASES);
  assert.equal(onWindows.kind === "update" && onWindows.version, "0.5.1");
  const latest = selectRelease(list, "0.5.0", mac, OFFICIAL_RELEASES);
  assert.deepEqual(latest, { kind: "none", newerWithoutPackage: "0.5.1", page: "https://github.com/jasonyao486/HAICoMo/releases/tag/v0.5.1" });
  assert.deepEqual(selectRelease(list, "0.9.9", win, OFFICIAL_RELEASES), { kind: "none" });
  assert.throws(() => selectRelease({ message: "Not Found" }, "0.4.0", mac, OFFICIAL_RELEASES), /UPDATE_RELEASE_LIST_INVALID/);
  assert.equal(isOfficialTagFeed("https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0"), true);
  assert.equal(isOfficialTagFeed("https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0/"), true);
  assert.equal(isOfficialTagFeed("https://example.org/releases/download/v0.4.0/"), false);
});

test("resolver caches with ETag, falls back to the Atom feed when rate limited and names every failure", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let mode = "ok";
  const get: HttpGet = async (url, headers) => {
    calls.push({ url, headers });
    const response = (status: number, text = "", extra: Record<string, string> = {}) => ({ status, text, header: (n: string) => extra[n.toLowerCase()] ?? null });
    if (mode === "offline") throw new TypeError("fetch failed");
    if (url.endsWith("/releases?per_page=20")) {
      if (mode === "limited") return response(403, "{}", { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1900000000" });
      if (mode === "server") return response(502);
      if (mode === "garbage") return response(200, "<html>");
      if (headers["If-None-Match"] === '"v1"') return response(304);
      return response(200, JSON.stringify([{ tag_name: "v0.4.1", body: "Fixes", assets: assets("0.4.1") }]), { etag: '"v1"' });
    }
    if (url.endsWith("/releases.atom")) return mode === "limited" ? response(200, '<link rel="alternate" href="https://github.com/jasonyao486/HAICoMo/releases/tag/v0.4.2"/><link href="https://github.com/jasonyao486/HAICoMo/releases/tag/v0.4.1"/>') : response(503);
    if (url.includes("/download/v0.4.2/")) return response(404);
    if (url.includes("/download/v0.4.1/latest-mac.yml")) return response(200, "version: 0.4.1");
    return response(404);
  };
  const resolve = createReleaseResolver(get, OFFICIAL_RELEASES, "HAICoMo/0.4.0");
  const first = await resolve("0.4.0", mac);
  assert.equal(first.kind === "update" && first.notes, "Fixes");
  assert.equal(calls[0].headers["User-Agent"], "HAICoMo/0.4.0");
  assert.equal(calls[0].url, "https://api.github.com/repos/jasonyao486/HAICoMo/releases?per_page=20");
  const cached = await resolve("0.4.0", mac);
  assert.equal(calls.at(-1)!.headers["If-None-Match"], '"v1"');
  assert.equal(cached.kind === "update" && cached.version, "0.4.1");
  mode = "limited";
  const fallback = await resolve("0.4.0", mac);
  assert.deepEqual(fallback.kind === "update" && [fallback.version, fallback.feed], ["0.4.1", "https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/"]);
  const limited = createReleaseResolver(async (url, headers) => url.endsWith(".atom") ? { status: 503, text: "", header: () => null } : get(url, headers), OFFICIAL_RELEASES, "HAICoMo/0.4.0");
  await assert.rejects(limited("0.4.0", mac), /UPDATE_RATE_LIMITED: 2030-/);
  mode = "server"; await assert.rejects(createReleaseResolver(get, OFFICIAL_RELEASES, "x")("0.4.0", mac), /UPDATE_SOURCE_UNAVAILABLE/);
  mode = "garbage"; await assert.rejects(createReleaseResolver(get, OFFICIAL_RELEASES, "x")("0.4.0", mac), /UPDATE_RELEASE_LIST_INVALID/);
  mode = "offline"; await assert.rejects(createReleaseResolver(get, OFFICIAL_RELEASES, "x")("0.4.0", mac), /UPDATE_NETWORK/);
});

class Backend extends EventEmitter {
  autoDownload = true; autoInstallOnAppQuit = true; allowDowngrade = true; autoRunAppAfterInstall = false;
  feeds: any[] = []; checks = 0; version = "0.4.1"; result: any = undefined; checkError?: Error;
  installArgs: unknown[] = [];
  download?: (token: any) => Promise<void>;
  setFeedURL(v: any) { this.feeds.push(v); }
  async checkForUpdates() {
    this.checks++;
    await new Promise((r) => setTimeout(r, 5));
    if (this.checkError) throw this.checkError;
    if (this.result === null) return null;
    this.emit("update-available", { version: this.version, releaseNotes: "<p>yml notes</p>" });
    return { isUpdateAvailable: true, updateInfo: { version: this.version } };
  }
  async downloadUpdate(token: any) { return this.download?.(token); }
  quitAndInstall(...args: unknown[]) { this.installArgs = args; }
}
class Token { cancelled = false; cancel() { this.cancelled = true; } }
function controller(backend: Backend, deps: Partial<ConstructorParameters<typeof UpdateController>[4]> = {}) {
  let created = 0;
  const c = new UpdateController("0.4.0", () => { created++; return backend; }, () => {}, false, {
    resolve: async () => ({ kind: "update", version: "0.4.1", tag: "v0.4.1", feed: "https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/", notes: "GitHub notes", page: "https://github.com/jasonyao486/HAICoMo/releases/tag/v0.4.1" }),
    token: () => new Token(), ...deps,
  });
  return { c, created: () => created };
}

test("official updates: release notes, progress figures, cancellation and an explicit two-step install", async () => {
  const backend = new Backend();
  const { c, created } = controller(backend);
  c.setSource({ kind: "official" });
  assert.equal(c.state.status, "idle");
  const checked = await c.check();
  assert.equal(checked.status, "available");
  assert.equal(checked.releaseNotes, "GitHub notes");
  assert.deepEqual(backend.feeds.at(-1), { provider: "generic", url: "https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/", useMultipleRangeRequest: false });
  assert.equal(backend.autoRunAppAfterInstall, true);
  assert.equal(checked.lastChecked?.ok, true);
  // Cancelled download: back to "available", no error shown.
  let release!: () => void;
  backend.download = (token) => new Promise<void>((resolve, reject) => {
    backend.emit("download-progress", { percent: 40, transferred: 40, total: 100, bytesPerSecond: 20 });
    release = () => token.cancelled ? reject(new Error("cancelled")) : resolve();
  });
  const downloading = c.download();
  assert.equal(c.state.bytesPerSecond, 20);
  assert.equal(c.state.verifying, false);
  const cancelling = c.cancelDownload();
  release();
  await cancelling; await downloading;
  assert.equal(c.state.status, "available");
  assert.equal(c.state.error, undefined);
  backend.download = async () => {
    backend.emit("download-progress", { percent: 100, transferred: 100, total: 100, bytesPerSecond: 50 });
    assert.equal(c.state.verifying, true);
    backend.emit("update-downloaded", { version: "0.4.1" });
  };
  assert.equal((await c.download()).status, "downloaded");
  assert.equal(c.state.verifying, false);
  // Changing the source after download keeps the downloaded update.
  c.setSource({ kind: "custom", url: "https://example.org/feed/" });
  assert.equal(c.state.status, "downloaded");
  c.install();
  assert.deepEqual(backend.installArgs, [false, true]);
  assert.equal(created(), 1);
});

test("metadata mismatch, blocked installs, development runs and quiet automatic failures", async () => {
  const mismatch = new Backend(); mismatch.version = "0.4.2";
  const a = controller(mismatch).c; a.setSource({ kind: "official" });
  const state = await a.check();
  assert.equal(state.status, "error");
  assert.equal(state.errorCode, "UPDATE_METADATA_MISMATCH");

  const blocked = controller(new Backend(), { preflight: async () => "UPDATE_APP_TRANSLOCATED" }).c;
  blocked.setSource({ kind: "official" });
  assert.equal((await blocked.check()).blocked, "UPDATE_APP_TRANSLOCATED");
  await assert.rejects(blocked.download(), /UPDATE_APP_TRANSLOCATED/);

  const dev = new Backend(); dev.result = null;
  const d = controller(dev).c; d.setSource({ kind: "official" });
  const devState = await d.check();
  assert.deepEqual([devState.status, devState.sourceReason], ["not-configured", "development"]);

  const failing = controller(new Backend(), { resolve: async () => { throw new Error("UPDATE_NETWORK: offline"); } }).c;
  failing.setSource({ kind: "official" });
  const quiet = await failing.check({ automatic: true });
  assert.equal(quiet.status, "idle");
  assert.deepEqual([quiet.lastChecked?.ok, quiet.lastChecked?.code], [false, "UPDATE_NETWORK"]);
  const loud = await failing.check();
  assert.deepEqual([loud.status, loud.errorCode, loud.errorStage], ["error", "UPDATE_NETWORK", "check"]);

  const none = controller(new Backend(), { resolve: async () => ({ kind: "none", newerWithoutPackage: "0.5.0", page: "https://github.com/jasonyao486/HAICoMo/releases/tag/v0.5.0" }) }).c;
  none.setSource({ kind: "official" });
  const upToDate = await none.check();
  assert.deepEqual([upToDate.status, upToDate.newerWithoutPackage], ["up-to-date", "0.5.0"]);
  assert.equal(updateErrorCode(Object.assign(new Error("sha512 checksum mismatch"), { code: "ERR_CHECKSUM_MISMATCH" })), "ERR_CHECKSUM_MISMATCH");
});

test("changing the source during a check never throws and discards the stale result", async () => {
  const backend = new Backend();
  let resolveFirst!: () => void;
  let calls = 0;
  const { c } = controller(backend, { resolve: async () => {
    calls++;
    if (calls === 1) await new Promise<void>((r) => { resolveFirst = r; });
    return { kind: "none" };
  } });
  c.setSource({ kind: "official" });
  const first = c.check({ automatic: true });
  await new Promise((r) => setTimeout(r, 1));
  assert.doesNotThrow(() => c.setSource({ kind: "custom", url: "https://example.org/feed/" }));
  assert.equal(c.state.status, "idle");
  resolveFirst();
  await first;
  assert.equal(c.state.status, "idle");
  assert.equal((await c.check()).status, "available");
  assert.equal(backend.feeds.at(-1).url, "https://example.org/feed/");
  assert.throws(() => c.setSource({ kind: "custom", url: "http://example.org/" }), /UPDATE_HTTPS_REQUIRED/);
});

test("install preflight explains locations and builds that cannot update themselves", () => {
  const signed = "Identifier=app.haicomo.desktop\nTeamIdentifier=CXWHS9FG9S\n";
  assert.equal(macPreflight({ bundle: "/Applications/HAICoMo.app", parentWritable: true, codesign: signed }), undefined);
  assert.equal(macPreflight({ bundle: "/Applications/HAICoMo.app", parentWritable: false, codesign: signed }), undefined);
  assert.equal(macPreflight({ bundle: "/private/var/folders/x/AppTranslocation/1/d/HAICoMo.app", parentWritable: false, codesign: signed }), "UPDATE_APP_TRANSLOCATED");
  assert.equal(macPreflight({ bundle: "/Volumes/HAICoMo 0.4.0/HAICoMo.app", parentWritable: false, codesign: signed }), "UPDATE_RUNNING_FROM_DISK_IMAGE");
  assert.equal(macPreflight({ bundle: "/Applications/HAICoMo.app", parentWritable: true, codesign: "Signature=adhoc\nTeamIdentifier=not set" }), "UPDATE_UNSIGNED_BUILD");
  assert.equal(macPreflight({ bundle: "/opt/dev/Electron", parentWritable: true, codesign: signed }), "UPDATE_UNSUPPORTED_LOCATION");
  const local = "D:\\Profiles\\example\\AppData\\Local";
  assert.equal(windowsPreflight({ exe: `${local}\\Programs\\HAICoMo\\HAICoMo.exe`, localAppData: local, uninstallerExists: true }), undefined);
  assert.equal(windowsPreflight({ exe: "C:\\Program Files\\HAICoMo\\HAICoMo.exe", localAppData: local, uninstallerExists: true }), "UPDATE_UNMANAGED_INSTALL");
  assert.equal(windowsPreflight({ exe: `${local}\\Temp\\win-unpacked\\HAICoMo.exe`, localAppData: local, uninstallerExists: false }), "UPDATE_UNMANAGED_INSTALL");
});

test("automatic update checks default on, survive older settings files and save as their own edit", () => {
  assert.equal(defaultSettings.autoCheckUpdates, true);
  const old = settingsSchema.parse({ locale: "zh-CN", theme: "light", enhanced: false, reducedMotion: false, accent: "#347965", codexPath: "", claudePath: "", updateFeed: "" });
  assert.equal(old.autoCheckUpdates, true);
  const next = { ...old, autoCheckUpdates: false, userName: "Reviewer", clientPaths: Object.fromEntries(HARNESS_IDS.map((id) => [id, `/bin/${id}`])) };
  const edits = settingsEdits(old, { ...next, locale: "en-GB", theme: "dark", enhanced: true, reducedMotion: true, accent: "#000000", avatarInitials: "AB", updateFeed: "https://example.org/" });
  assert.equal(edits.length, 20);
  const saved = applySettingsEdits(old, edits);
  assert.equal(saved.autoCheckUpdates, false);
  assert.equal(applySettingsEdits(old, [{ kind: "preference", key: "autoCheckUpdates", before: true, after: false }]).autoCheckUpdates, false);
});

test("update metadata matches the exact payload and detects tampering", async (t) => {
  const dir = temporaryDirectory(t, "haicomo-update-metadata-");
  fs.writeFileSync(path.join(dir, "HAICoMo-0.4.0-arm64-mac.zip"), "zip payload");
  await writeUpdateMetadata(dir, "0.4.0", "darwin", "2026-10-09T00:00:00.000Z");
  const text = fs.readFileSync(path.join(dir, "latest-mac.yml"), "utf8");
  assert.doesNotMatch(text, /minimumSystemVersion/);
  const parsed = await verifyUpdateMetadata(dir, "0.4.0", "darwin");
  assert.equal(parsed.size, 11);
  assert.equal(parseUpdateMetadata(text).url, "HAICoMo-0.4.0-arm64-mac.zip");
  fs.appendFileSync(path.join(dir, "HAICoMo-0.4.0-arm64-mac.zip"), "!");
  await assert.rejects(verifyUpdateMetadata(dir, "0.4.0", "darwin"), /does not match/);
  assert.throws(() => renderUpdateMetadata({ version: "0.4.0", name: "../x.zip", sha512: "abc", size: 1, releaseDate: "" }), /Invalid/);
  await assert.rejects(verifyUpdateMetadata(dir, "0.4.0", "win32"));
});

test("WorkBuddy shows its official application icon on both platforms; CodeBuddy uses the colour mark", () => {
  assert.equal(clientIcon("workbuddy"), "/local-assets/workbuddy-app.png");
  assert.equal(clientIcon("codex"), "/local-assets/chatgpt-logo.svg");
  assert.equal(clientIcon("cursor"), "/local-assets/cursor-app.svg");
  const manifest = JSON.parse(fs.readFileSync("assets/manifest.json", "utf8"));
  const entry = manifest.files.find((f: any) => f.file === "local-assets/workbuddy-app.png");
  assert.match(entry.source, /Official WorkBuddy desktop application icon/);
  assert.match(entry.license, /not licensed under HAICoMo's MIT licence/);
  const png = fs.readFileSync("assets/runtime/local-assets/workbuddy-app.png");
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(fs.existsSync("assets/runtime/local-assets/workbuddy-app.svg"), false);
  assert.doesNotMatch(fs.readFileSync("assets/runtime/local-assets/codebuddy-app.svg", "utf8"), /currentColor/);
});

const task = (title: string, extra: Partial<Task> = {}): Task => ({ id: randomUUID(), revision: 1, archived: false, acceptedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", title, description: "", parentId: null, dependencies: [], assignees: [], status: "todo", progress: 0, startDate: "", endDate: "", handoff: "", artifacts: [], tableVisible: true, ...extra });
const note = (title: string, body: string, kind: Note["kind"], updatedAt = "2026-10-02T00:00:00.000Z"): Note => ({ id: randomUUID(), revision: 1, title, body, kind, createdAt: updatedAt, updatedAt });

test("overview search matches every term in tasks, meetings and notes, with ranked, highlighted excerpts", () => {
  assert.deepEqual(searchTerms("  Timeout  timeout 超时 "), ["Timeout", "超时"]);
  assert.equal(searchTerms("a b c d e f g h i j").length, 8);
  const state = {
    tasks: [
      task("Configure the uploader", { description: "Set the upload timeout to 45 seconds after the review.", updatedAt: "2026-10-03T00:00:00.000Z" }),
      task("Timeout policy", { archived: true, updatedAt: "2026-09-01T00:00:00.000Z" }),
      task("渲染管线", { handoff: "决定：帧率参数固定为 60 FPS" }),
      task("Unrelated", { artifacts: [{ id: randomUUID(), label: "Timeout report", path: "reports/timeout.md" }] }),
    ],
    notes: [note("Weekly sync", "Decision: timeout stays at 45 seconds.", "meeting"), note("Scratch", "timeout idea", "note")],
  } as unknown as ProjectState;
  const all = searchLocal(state, "timeout 45", "all");
  assert.deepEqual(all.tasks.map((h) => h.task.title), ["Configure the uploader"]);
  assert.equal(all.meetings.length, 1);
  assert.equal(all.notes.length, 0);
  const single = searchLocal(state, "TIMEOUT", "all");
  // Title matches rank first; archived tasks remain searchable.
  assert.deepEqual(single.tasks.map((h) => h.task.title), ["Timeout policy", "Configure the uploader", "Unrelated"]);
  assert.equal(single.tasks[0].kind === "task" && single.tasks[0].archived, true);
  assert.equal(single.notes.length, 1);
  assert.equal(searchLocal(state, "timeout", "meetings").tasks.length, 0);
  assert.equal(searchLocal(state, "timeout", "meetings").notes.length, 0);
  assert.equal(searchLocal(state, "timeout", "tasks").meetings.length, 0);
  assert.equal(searchLocal(state, "timeout", "revisions").tasks.length, 0);
  const chinese = searchLocal(state, "帧率", "tasks");
  assert.equal(chinese.tasks.length, 1);
  assert.deepEqual(chinese.tasks[0].snippet.filter((s) => s.hit).map((s) => s.text), ["帧率"]);
  assert.deepEqual(highlight("Timeout and TIMEOUT", ["timeout"]).filter((s) => s.hit).map((s) => s.text), ["Timeout", "TIMEOUT"]);
  const long = `${"a".repeat(300)} needle ${"b".repeat(300)}`;
  const cut = excerpt(long, ["needle"]);
  assert.equal(cut[0].text.startsWith("…"), true);
  assert.equal(cut.at(-1)!.text.endsWith("…"), true);
  assert.ok(cut.some((s) => s.hit && s.text === "needle"));
  assert.deepEqual(searchLocal(state, "   ", "all").tasks, []);
});

test("revision search covers review notes and proposed values, never JSON keys", (t) => {
  const dir = temporaryDirectory(t, "haicomo-v040-search-");
  const store = new ProjectStore(dir, "Search");
  beforeRemove(t, () => store.close());
  const parameter = exampleProposal(store.state());
  parameter.title = "Tune upload";
  parameter.changes[0].values = { ...parameter.changes[0].values, description: "Retry budget is 7 attempts" };
  publishProposal(dir, parameter);
  const other = exampleProposal(store.state());
  other.title = "Unrelated proposal";
  publishProposal(dir, other);
  store.ingest();
  store.command({ id: randomUUID(), type: "proposal.review", payload: { proposalId: other.proposalId, decision: "reject", reason: "Superseded by the frame-rate decision" } });
  assert.equal(store.queryProposals({ search: "retry budget" }).total, 1);
  assert.equal(store.queryProposals({ search: "RETRY 7" }).total, 1);
  assert.equal(store.queryProposals({ search: "retry missing" }).total, 0);
  assert.equal(store.queryProposals({ search: "frame-rate" }).total, 1);
  assert.equal(store.queryProposals({ search: "expectedRevision" }).total, 0);
  assert.equal(store.queryProposals({ search: "operation" }).total, 0);
  const hits = revisionHits(store.queryProposals({ search: "retry" }).items, ["retry"]);
  assert.equal(hits[0].kind, "revision");
  assert.ok(hits[0].snippet.some((s) => s.hit && s.text === "Retry"));
});
