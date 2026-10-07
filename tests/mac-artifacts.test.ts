import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
// @ts-expect-error Maintenance scripts are native ESM and are not renderer code.
import { archiveAndRemove, assertOwned, beginSession, finishSession, treeDigest, TEST_ID } from "../scripts/mac-app-lifecycle.mjs";
const mac = { skip: process.platform !== "darwin" };
function makeApp(root: string, id = TEST_ID) {
  const app = path.join(root, "Fixture.app"); fs.mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
  fs.writeFileSync(path.join(app, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: id, CFBundleShortVersionString: "0.2.3" }));
  fs.writeFileSync(path.join(app, "Contents/MacOS/fixture"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.symlinkSync("MacOS/fixture", path.join(app, "Contents/link")); return app;
}
test("artifact cleanup verifies exact archive restoration, preserves evidence and rejects unsafe owners", mac, () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "haicomo-artifact-test-"));
  try {
    const app = makeApp(root), archives = path.join(root, "archives"), original = treeDigest(app), calls: string[] = [];
    fs.writeFileSync(path.join(root, "project-data.json"), "preserve");
    assert.throws(() => archiveAndRemove({ appPath: app, ownerRoot: root, archiveDirectory: archives, bundleId: "wrong" }), /UNEXPECTED_BUNDLE_ID/);
    assert.throws(() => assertOwned(app, path.join(app, "Contents")), /UNOWNED_APP_PATH/);
    const link = path.join(root, "Alias.app"); fs.symlinkSync(app, link);
    assert.throws(() => assertOwned(link, root), /UNOWNED_APP_PATH/); fs.unlinkSync(link);
    const receipt = archiveAndRemove({ appPath: app, ownerRoot: root, archiveDirectory: archives, bundleId: TEST_ID, unregister: (p: string) => calls.push(p) });
    assert.deepEqual(calls, [app]); assert.equal(fs.existsSync(app), false); assert.equal(receipt.digest, original);
    assert.equal(fs.readFileSync(path.join(root, "project-data.json"), "utf8"), "preserve");
    execFileSync("ditto", ["-x", "-k", receipt.archive, root]); assert.equal(treeDigest(app), original);
    fs.writeFileSync(receipt.archive, "broken archive");
    assert.throws(() => archiveAndRemove({ appPath: app, ownerRoot: root, archiveDirectory: archives, bundleId: TEST_ID, unregister: () => assert.fail("must not unregister before verification") }));
    assert.equal(treeDigest(app), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("abandoned test ownership recovers on next run, active owner is protected and cleanup is repeatable", mac, () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "haicomo-owner-test-")); let session: any;
  try {
    session = beginSession(root, "interrupted-fixture", { unregister: () => {} }); makeApp(session.staging);
    assert.throws(() => beginSession(root, "competing-fixture"), /UPGRADE_TEST_ALREADY_RUNNING/);
    fs.writeFileSync(session.record, JSON.stringify({ ...session, pid: 99999999 }));
    const next = beginSession(root, "recovery", { unregister: () => {} });
    assert.equal(fs.existsSync(session.staging), false);
    assert.ok(JSON.parse(fs.readFileSync(session.record, "utf8")).finishedAt);
    session = next; finishSession(session, root, { unregister: () => {} }); finishSession(session, root, { unregister: () => {} });
    assert.equal(fs.existsSync(session.staging), false);
  } finally { if (session && fs.existsSync(session.staging)) finishSession(session, root, { unregister: () => {} }); fs.rmSync(root, { recursive: true, force: true }); }
});
