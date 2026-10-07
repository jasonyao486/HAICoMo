// Explicit, path-scoped maintenance for build/test artifacts; never run from the app.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
export const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
export const TEST_ID = "app.haicomo.upgrade-test";
export function assertOwned(appPath, ownerRoot) {
  const root = fs.realpathSync(ownerRoot), app = path.resolve(appPath);
  if (!app.endsWith(".app") || app === root || !app.startsWith(root + path.sep) || fs.realpathSync(app) !== app || fs.lstatSync(app).isSymbolicLink()) throw new Error("UNOWNED_APP_PATH");
  return app;
}
export function bundleInfo(appPath) {
  return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", path.join(appPath, "Contents/Info.plist")], { encoding: "utf8" }));
}
export function ownedProcesses(appPath) {
  return execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }).split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    return match && match[2].startsWith(path.resolve(appPath) + "/Contents/") ? [Number(match[1])] : [];
  });
}
export function treeDigest(root) {
  const hash = createHash("sha256");
  function visit(relative) {
    const file = path.join(root, relative), stat = fs.lstatSync(file);
    hash.update(JSON.stringify([relative, stat.mode & 0o777, stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "dir" : "file"]));
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(file));
    else if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    else {
      const fd = fs.openSync(file, "r"), buffer = Buffer.alloc(1024 * 1024);
      try { let count; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count)); }
      finally { fs.closeSync(fd); }
    }
  }
  visit(""); return hash.digest("hex");
}
export function findBundles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(root, item.name);
    if (!item.isDirectory() || item.isSymbolicLink()) return [];
    return item.name.endsWith(".app") ? [file] : findBundles(file);
  });
}
export function registeredApps() {
  const dump = execFileSync(LSREGISTER, ["-dump"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return dump.split(/-{40,}/).flatMap((block) => {
    const id = /^identifier:\s+(app\.haicomo\.(?:desktop|upgrade-test))\s*$/m.exec(block)?.[1];
    const file = /^path:\s+(.+?) \(0x[0-9a-f]+\)\s*$/m.exec(block)?.[1];
    return id && file ? [{ id, path: file }] : [];
  });
}
export function unregisterApp(app) {
  if (!registeredApps().some((item) => item.path === app)) return;
  execFileSync(LSREGISTER, ["-u", app]);
  if (registeredApps().some((item) => item.path === app)) throw new Error("APP_REGISTRATION_REMAINS");
}
export function archiveAndRemove({ appPath, ownerRoot, archiveDirectory, bundleId, unregister = unregisterApp }) {
  const app = assertOwned(appPath, ownerRoot), info = bundleInfo(app);
  if (info.CFBundleIdentifier !== bundleId) throw new Error("UNEXPECTED_BUNDLE_ID");
  if (ownedProcesses(app).length) throw new Error("APP_STILL_RUNNING");
  fs.mkdirSync(archiveDirectory, { recursive: true });
  const digest = treeDigest(app), archive = path.join(archiveDirectory, `${info.CFBundleIdentifier}-${info.CFBundleShortVersionString}-${digest.slice(0, 16)}.zip`);
  const temporary = archive + ".partial.zip";
  if (!fs.existsSync(archive)) {
    try { execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, temporary]); fs.renameSync(temporary, archive); }
    finally { fs.rmSync(temporary, { force: true }); }
  }
  // Compare the complete restored file tree, executable modes and symlinks before removing anything.
  const verification = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-archive-check-"));
  try {
    execFileSync("ditto", ["-x", "-k", archive, verification]);
    if (treeDigest(path.join(verification, path.basename(app))) !== digest) throw new Error("ARCHIVE_CONTENT_MISMATCH");
  } finally { fs.rmSync(verification, { recursive: true, force: true }); }
  if (ownedProcesses(app).length || treeDigest(app) !== digest) throw new Error("APP_CHANGED_DURING_ARCHIVE");
  unregister(app);
  const receipt = { app, archive, digest, bundleId, version: info.CFBundleShortVersionString, verifiedAt: new Date().toISOString() };
  // Record recoverability before deletion; a retry is safe if interrupted here.
  fs.appendFileSync(path.join(archiveDirectory, "archive-receipts.jsonl"), JSON.stringify(receipt) + "\n");
  fs.rmSync(app, { recursive: true });
  return receipt;
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function validateSession(session, root) {
  const staging = path.resolve(session.staging);
  if (session.kind !== "haicomo-upgrade-artifacts-v1" || session.evidenceRoot !== path.resolve(root) || !path.basename(staging).startsWith("haicomo-upgrade-") || path.dirname(staging) !== fs.realpathSync(os.tmpdir()) || path.basename(staging) !== session.token) throw new Error("INVALID_ARTIFACT_OWNER");
}
export function finishSession(session, root, hooks = {}) {
  validateSession(session, root);
  const journal = path.join(root, "archives/archive-receipts.jsonl");
  const receipts = fs.existsSync(journal) ? fs.readFileSync(journal, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((receipt) => receipt.app.startsWith(session.staging + path.sep)) : [];
  for (const app of findBundles(session.staging)) receipts.push(archiveAndRemove({ appPath: app, ownerRoot: session.staging, archiveDirectory: path.join(root, "archives"), bundleId: TEST_ID, ...hooks }));
  fs.rmSync(session.staging, { recursive: true, force: true });
  fs.writeFileSync(session.record, JSON.stringify({ ...session, finishedAt: new Date().toISOString(), receipts }, null, 2));
  return receipts;
}
export function beginSession(root, purpose, hooks = {}) {
  root = path.resolve(root); fs.mkdirSync(path.join(root, "owners"), { recursive: true });
  // Do not overlap fixtures sharing the same native updater identity/profile/cache.
  for (const name of fs.readdirSync(path.join(root, "owners"))) {
    if (!name.endsWith(".json")) continue;
    const record = path.join(root, "owners", name), previous = JSON.parse(fs.readFileSync(record, "utf8"));
    if (previous.finishedAt) continue;
    validateSession(previous, root);
    if (alive(previous.pid)) throw new Error("UPGRADE_TEST_ALREADY_RUNNING");
    finishSession({ ...previous, record }, root, hooks);
  }
  const staging = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "haicomo-upgrade-"));
  const record = path.join(root, "owners", `${randomUUID()}.json`);
  const session = { kind: "haicomo-upgrade-artifacts-v1", purpose, evidenceRoot: root, staging, token: path.basename(staging), pid: process.pid, record, startedAt: new Date().toISOString() };
  fs.writeFileSync(record, JSON.stringify(session, null, 2)); return session;
}
export async function stopOwnedTestApps(staging) {
  const apps = findBundles(staging);
  for (const app of apps) {
    assertOwned(app, staging);
    if (bundleInfo(app).CFBundleIdentifier !== TEST_ID) throw new Error("UNEXPECTED_BUNDLE_ID");
    for (const pid of ownedProcesses(app)) try { process.kill(pid, "SIGTERM"); } catch {}
  }
  for (let n = 0; n < 50 && apps.some((app) => ownedProcesses(app).length); n++) await new Promise((r) => setTimeout(r, 100));
  for (const app of apps) for (const pid of ownedProcesses(app)) try { process.kill(pid, "SIGKILL"); } catch {}
  for (let n = 0; n < 30 && apps.some((app) => ownedProcesses(app).length); n++) await new Promise((r) => setTimeout(r, 100));
  if (apps.some((app) => ownedProcesses(app).length)) throw new Error("TEST_APP_DID_NOT_EXIT");
}
