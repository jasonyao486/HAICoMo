import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileHash, isSubmissionId, requireEnvironment, saveState, submitNotarization, validateState, verifyArtifact, waitForAcceptance, withCleanup } from './mac-release-state.mjs';
import { assertApplicationSource } from './check-release-source.mjs';

const command = process.argv[2];
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const root = path.resolve(`release/${pkg.version}`);
const checkpoint = path.join(root, 'mac-checkpoint');
const stateFile = path.join(checkpoint, 'state.json');
const app = path.join(root, 'mac-arm64/HAICoMo.app');
const dmgName = `HAICoMo-${pkg.version}-arm64.dmg`;
const zipName = `HAICoMo-${pkg.version}-arm64-mac.zip`;
const cleanupFile = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'haicomo-signing-cleanup.json');
const run = (cmd, args, timeout = 300_000) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', timeout });
const git = args => run('git', args).trim();
let state;
const save = () => saveState(stateFile, state);
const artifact = file => ({ file: path.basename(file), sha256: fileHash(file), status: 'Prepared' });
function cleanup() {
  if (!fs.existsSync(cleanupFile)) return;
  const { keychain, oldKeychains, directory } = JSON.parse(fs.readFileSync(cleanupFile, 'utf8'));
  spawnSync('security', ['list-keychains', '-d', 'user', '-s', ...oldKeychains], { stdio: 'ignore' });
  spawnSync('security', ['delete-keychain', keychain], { stdio: 'ignore' });
  fs.rmSync(directory, { recursive: true, force: true });
  fs.rmSync(cleanupFile, { force: true });
}
async function signed(work) {
  requireEnvironment(['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_TEAM_ID']);
  const directory = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'haicomo-signing-'));
  const keychain = path.join(directory, 'release.keychain-db');
  const certificate = path.join(directory, 'identity.p12');
  const password = randomBytes(32).toString('hex');
  const oldKeychains = run('security', ['list-keychains', '-d', 'user']).match(/"([^"\n]+)"/g)?.map(s => s.slice(1, -1)) ?? [];
  fs.writeFileSync(cleanupFile, JSON.stringify({ keychain, oldKeychains, directory }), { mode: 0o600 });
  await withCleanup(async () => {
    fs.writeFileSync(certificate, Buffer.from(process.env.CSC_LINK, 'base64'), { mode: 0o600 });
    run('security', ['create-keychain', '-p', password, keychain]);
    run('security', ['set-keychain-settings', '-lut', '21600', keychain]);
    run('security', ['unlock-keychain', '-p', password, keychain]);
    run('security', ['import', certificate, '-k', keychain, '-P', process.env.CSC_KEY_PASSWORD, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security']);
    run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain]);
    run('security', ['list-keychains', '-d', 'user', '-s', keychain, ...oldKeychains]);
    fs.unlinkSync(certificate);
    delete process.env.CSC_LINK;
    delete process.env.CSC_KEY_PASSWORD;
    process.env.CSC_KEYCHAIN = keychain;
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'true';
    await work();
  }, cleanup);
}
function signature(file, deep = false) {
  requireEnvironment(['APPLE_TEAM_ID']);
  run('codesign', ['--verify', '--strict', ...(deep ? ['--deep'] : []), file]);
  const result = spawnSync('codesign', ['-dvv', file], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stderr.includes('Authority=Developer ID Application:') || !result.stderr.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`) || (deep && !result.stderr.includes('runtime'))) throw new Error('Developer ID or hardened runtime verification failed');
}
function restoreApp() {
  const source = verifyArtifact(checkpoint, state.app);
  fs.rmSync(path.dirname(app), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(app), { recursive: true });
  run('ditto', ['-x', '-k', source, path.dirname(app)]);
  signature(app, true);
}
function apple(action, args) {
  requireEnvironment(['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_SPECIFIC_PASSWORD']);
  // Never propagate subprocess exceptions: they can embed authentication arguments.
  const result = spawnSync('xcrun', ['notarytool', action, ...args, '--apple-id', process.env.APPLE_ID, '--team-id', process.env.APPLE_TEAM_ID, '--password', process.env.APPLE_APP_SPECIFIC_PASSWORD, '--output-format', 'json'], { encoding: 'utf8', timeout: action === 'submit' ? 900_000 : 120_000, maxBuffer: 8 * 1024 * 1024 });
  let data;
  try { data = JSON.parse(result.stdout); } catch {}
  if (action === 'submit' && isSubmissionId(data?.id)) return data;
  if (result.status !== 0 || !data) throw new Error('Apple service request failed; credentials and raw responses are not logged');
  return data;
}
async function submit(kind) {
  const item = state[kind];
  const file = verifyArtifact(checkpoint, item);
  if (item.id) { console.log(`${kind}: using saved submission ${item.id}`); return; }
  requireEnvironment(['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_SPECIFIC_PASSWORD']);
  await submitNotarization(item, {
    submit: () => apple('submit', [file, '--no-wait']), save,
    recover: async pending => {
      const history = apple('history', []).history;
      if (!Array.isArray(history)) throw new Error('Unexpected Apple submission history');
      const candidates = history.filter(entry => isSubmissionId(entry.id) && entry.name === pending.file && Date.parse(entry.createdDate) >= Date.parse(pending.submissionStartedAt) - 60_000);
      for (const entry of candidates.slice(0, 20)) {
        // Logs may not exist while processing. Never expose Apple's raw log.
        try {
          const log = apple('log', [entry.id]);
          if (log.jobId === entry.id && log.sha256 === pending.sha256) return log;
        } catch {}
      }
    },
  });
  console.log(`${kind}: submission ${item.id} saved`);
}
async function staple(file) {
  for (let attempt = 0; ; attempt++) {
    try { run('xcrun', ['stapler', 'staple', file]); return; }
    catch { if (attempt === 2) throw new Error('Apple ticket could not be attached; resume the saved candidate'); }
    await new Promise(resolve => setTimeout(resolve, 20_000));
  }
}
async function acceptedApp() {
  if (state.app.status !== 'Accepted') throw new Error('App notarization has not been accepted');
  restoreApp();
  await staple(app);
  run('xcrun', ['stapler', 'validate', app]);
  signature(app, true);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
}
async function main() {
  if (process.platform !== 'darwin') throw new Error('Mac release requires macOS');
  if (command === 'cleanup') { cleanup(); return; }
  const current = git(['rev-parse', 'HEAD']);
  if (command === 'prepare' && !fs.existsSync(stateFile)) {
    const tag = spawnSync('git', ['rev-parse', `v${pkg.version}^{commit}`], { encoding: 'utf8' });
    const reference = tag.status === 0 ? tag.stdout.trim() : current;
    assertApplicationSource(reference);
    fs.mkdirSync(checkpoint, { recursive: true });
    state = { schema: 1, version: pkg.version, buildCommit: current, applicationReferenceCommit: reference };
    await signed(async () => {
      const { build, Platform, Arch } = await import('electron-builder');
      await build({ publish: 'never', targets: Platform.MAC.createTarget(['dir'], Arch.arm64), config: { ...pkg.build, extends: null, forceCodeSigning: true, mac: { ...pkg.build.mac, identity: process.env.APPLE_TEAM_ID, hardenedRuntime: true, notarize: false, signIgnore: ['\\.lproj/locale\\.pak$'] } } });
      signature(app, true);
    });
    const candidate = path.join(checkpoint, 'HAICoMo-app.zip');
    run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, candidate]);
    state.app = artifact(candidate);
    state.archiveSha256 = fileHash(path.join(app, 'Contents/Resources/app.asar'));
    save();
    return;
  }
  state = validateState(JSON.parse(fs.readFileSync(stateFile, 'utf8')), pkg.version);
  assertApplicationSource(state.applicationReferenceCommit);
  assertApplicationSource(state.buildCommit);
  verifyArtifact(checkpoint, state.app);
  if (command === 'prepare') { restoreApp(); return; }
  if (command === 'submit-app' || command === 'submit-dmg') { await submit(command.slice(7)); return; }
  if (command === 'wait-app' || command === 'wait-dmg') {
    const kind = command.slice(5);
    verifyArtifact(checkpoint, state[kind]);
    await waitForAcceptance(state[kind], { info: id => apple('info', [id]), save: () => { save(); console.log(`${kind}: ${state[kind].status}`); } });
    return;
  }
  if (command === 'package') {
    await acceptedApp();
    if (state.dmg) { verifyArtifact(checkpoint, state.dmg); verifyArtifact(checkpoint, state.zip); return; }
    await signed(async () => {
      const { build, Platform, Arch } = await import('electron-builder');
      // prepackaged skips application signing: preserve the accepted App's signature.
      await build({ publish: 'never', prepackaged: app, targets: Platform.MAC.createTarget(['dmg'], Arch.arm64), config: { ...pkg.build, extends: null, forceCodeSigning: true, mac: { ...pkg.build.mac, identity: process.env.APPLE_TEAM_ID, notarize: false }, dmg: { sign: true } } });
      signature(path.join(root, dmgName));
      signature(app, true);
      run('xcrun', ['stapler', 'validate', app]);
    });
    fs.copyFileSync(path.join(root, dmgName), path.join(checkpoint, dmgName));
    state.dmg = artifact(path.join(checkpoint, dmgName));
    run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, path.join(checkpoint, zipName)]);
    state.zip = artifact(path.join(checkpoint, zipName));
    save();
    return;
  }
  if (command === 'finalize') {
    if (state.dmg?.status !== 'Accepted') throw new Error('DMG notarization has not been accepted');
    await acceptedApp();
    fs.copyFileSync(verifyArtifact(checkpoint, state.dmg), path.join(root, dmgName));
    fs.copyFileSync(verifyArtifact(checkpoint, state.zip), path.join(root, zipName));
    const dmg = path.join(root, dmgName);
    await staple(dmg);
    run('xcrun', ['stapler', 'validate', dmg]);
    signature(dmg);
    run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg]);
    const unpack = fs.mkdtempSync(path.join(os.tmpdir(), 'haicomo-zip-check-'));
    try {
      run('ditto', ['-x', '-k', path.join(root, zipName), unpack]);
      const copy = path.join(unpack, 'HAICoMo.app');
      signature(copy, true);
      run('xcrun', ['stapler', 'validate', copy]);
      run('spctl', ['--assess', '--type', 'execute', '--verbose=2', copy]);
      if (fileHash(path.join(copy, 'Contents/Resources/app.asar')) !== state.archiveSha256) throw new Error('ZIP application differs from verified app');
    } finally { fs.rmSync(unpack, { recursive: true, force: true }); }
    for (const name of fs.readdirSync(root)) if (name.endsWith('.blockmap') || /^latest.*\.ya?ml$/.test(name)) fs.unlinkSync(path.join(root, name));
    const hashes = Object.fromEntries([dmgName, zipName].map(name => [name, fileHash(path.join(root, name))]));
    fs.writeFileSync(path.join(root, 'mac-release-verification.json'), JSON.stringify({ version: pkg.version, sourceCommit: current, buildCommit: state.buildCommit, applicationReferenceCommit: state.applicationReferenceCommit, archiveSha256: state.archiveSha256, developerId: true, notarized: true, stapled: true, gatekeeper: true, notarization: { app: state.app.id, dmg: state.dmg.id }, hashes }, null, 2) + '\n');
    console.log('Final App, DMG and ZIP signatures, tickets and Gatekeeper verification passed.');
    return;
  }
  throw new Error('Unknown Mac release stage');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup(); process.exit(1); });
let failed = false;
try { await main(); }
catch (error) {
  failed = true;
  // Only errors created by our own validation code may be displayed.
  const safe = /^(?:Missing release secrets:|Apple |Checkpoint |App notarization|DMG notarization|Application inputs changed|Submission ID required|Invalid |Unexpected Apple|Unknown Mac release|Mac release requires)/.test(error.message);
  console.error(`Mac release stage ${command} failed.${safe ? ' ' + error.message : ' Tool output suppressed to protect credentials.'}`);
} finally { cleanup(); }
process.exit(failed ? 1 : 0);
