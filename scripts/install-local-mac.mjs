// Explicit local delivery: one installed app, archived historical binaries, no publication.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { archiveAndRemove, bundleInfo, findBundles, LSREGISTER, ownedProcesses, registeredApps, treeDigest, unregisterApp } from "./mac-app-lifecycle.mjs";
if (process.platform !== "darwin") throw new Error("MACOS_ONLY");
const repo = fs.realpathSync("."), pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const output = path.join(repo, "release", pkg.version), canonical = "/Applications/HAICoMo.app", id = "app.haicomo.desktop";
let source = path.join(output, "mac-arm64/HAICoMo.app");
if (ownedProcesses(canonical).length) throw new Error("Quit HAICoMo normally after saving work and waiting for active agents; installation does not force quit.");
const expanded = findBundles(path.join(repo, "release")).filter((app) => /^\d+\.\d+\.\d+$/.test(path.relative(path.join(repo, "release"), app).split(path.sep)[0]));
const oldTestRoot = path.join(repo, "validation/0.2.2/native-upgrade");
const oldTests = findBundles(oldTestRoot);
for (const app of [...expanded, ...oldTests]) if (ownedProcesses(app).length) throw new Error(`App still running: ${app}`);
const staging = fs.mkdtempSync("/Applications/.haicomo-install-");
let previous, replaced = false;
try {
  const staged = path.join(staging, "HAICoMo.app");
  if (fs.existsSync(source)) execFileSync("ditto", [source, staged]);
  else { execFileSync("ditto", ["-x", "-k", path.join(output, `HAICoMo-${pkg.version}-arm64-mac.zip`), staging]); source = staged; }
  const info = bundleInfo(staged);
  if (info.CFBundleIdentifier !== id || info.CFBundleShortVersionString !== pkg.version || fs.existsSync(path.join(staged, "Contents/Resources/upgrade-fixture.json"))) throw new Error("INVALID_LOCAL_RELEASE");
  execFileSync("codesign", ["--verify", "--deep", "--strict", staged]);
  if (fs.existsSync(canonical)) {
    if (bundleInfo(canonical).CFBundleIdentifier !== id) throw new Error("CANONICAL_APP_ID_CONFLICT");
    previous = archiveAndRemove({ appPath: canonical, ownerRoot: "/Applications", archiveDirectory: path.join(repo, "release/archives"), bundleId: id });
  }
  try {
    fs.renameSync(staged, canonical); replaced = true;
    execFileSync("codesign", ["--verify", "--deep", "--strict", canonical]);
    execFileSync(LSREGISTER, ["-f", canonical]);
  } catch (error) {
    if (replaced) archiveAndRemove({ appPath: canonical, ownerRoot: "/Applications", archiveDirectory: path.join(repo, "release/archives"), bundleId: id });
    if (previous) { execFileSync("ditto", ["-x", "-k", previous.archive, "/Applications"]); execFileSync(LSREGISTER, ["-f", canonical]); }
    throw error;
  }
  const receipts = [];
  for (const app of expanded) {
    console.log(`Archiving and unregistering ${path.relative(repo, app)}`);
    receipts.push(archiveAndRemove({ appPath: app, ownerRoot: path.join(repo, "release"), archiveDirectory: path.join(repo, "release/archives"), bundleId: id }));
  }
  for (const app of oldTests) {
    console.log(`Archiving and unregistering ${path.relative(repo, app)}`);
    receipts.push(archiveAndRemove({ appPath: app, ownerRoot: oldTestRoot, archiveDirectory: path.join(oldTestRoot, "archives"), bundleId: "app.haicomo.upgrade-test" }));
  }
  // Remove only the known stale registration, never its contents or the whole Trash.
  const trash = path.join(os.homedir(), ".Trash/HAICoMo.app");
  if (registeredApps().some((entry) => entry.path === trash && entry.id === id)) unregisterApp(trash);
  const registrations = registeredApps();
  fs.mkdirSync(path.join(repo, "validation", pkg.version), { recursive: true });
  fs.writeFileSync(path.join(repo, "validation", pkg.version, "local-install.json"), JSON.stringify({ installedAt: new Date().toISOString(), canonical, version: pkg.version, digest: treeDigest(canonical), previous, receipts, registrations }, null, 2));
  if (registrations.length !== 1 || registrations[0].path !== canonical || registrations[0].id !== id) throw new Error("Unexpected registrations remain; recorded for inspection without deleting unknown apps.");
  console.log(`Installed ${pkg.version}. Exactly one application registration: ${canonical}`);
} finally {
  // Never leave an install verification copy registered, even if installation failed.
  const staged = path.join(staging, "HAICoMo.app");
  if (fs.existsSync(staged)) {
    if (ownedProcesses(staged).length) throw new Error("STAGING_APP_RUNNING");
    unregisterApp(staged);
  }
  fs.rmSync(staging, { recursive: true, force: true });
}
