import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { build, Platform, Arch } from 'electron-builder';
import { notarize } from '@electron/notarize';

const required = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_SPECIFIC_PASSWORD'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing release secrets: ${missing.join(', ')}`);
if (process.platform !== 'darwin') throw new Error('macOS release requires a Mac');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const root = path.resolve(`release/${pkg.version}`);
const temp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'haicomo-signing-'));
const keychain = path.join(temp, 'release.keychain-db');
const certificate = path.join(temp, 'identity.p12');
const password = randomBytes(32).toString('hex');
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
const oldKeychains = run('security', ['list-keychains', '-d', 'user']).match(/"([^"\n]+)"/g)?.map(value => value.slice(1, -1)) ?? [];
let stage = 'importing signing identity';
try {
  fs.writeFileSync(certificate, Buffer.from(process.env.CSC_LINK, 'base64'), { mode: 0o600 });
  run('security', ['create-keychain', '-p', password, keychain]);
  run('security', ['set-keychain-settings', '-lut', '21600', keychain]);
  run('security', ['unlock-keychain', '-p', password, keychain]);
  run('security', ['import', certificate, '-k', keychain, '-P', process.env.CSC_KEY_PASSWORD, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security']);
  run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain]);
  run('security', ['list-keychains', '-d', 'user', '-s', keychain, ...oldKeychains]);
  fs.unlinkSync(certificate);
  // Use only the identity imported into this temporary keychain.
  delete process.env.CSC_LINK;
  delete process.env.CSC_KEY_PASSWORD;
  process.env.CSC_KEYCHAIN = keychain;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'true';
  stage = 'signing and notarizing the application';
  await build({ publish: 'never', targets: Platform.MAC.createTarget(['dmg', 'zip'], Arch.arm64), config: {
    ...pkg.build, extends: null, forceCodeSigning: true,
    mac: { ...pkg.build.mac, identity: process.env.APPLE_TEAM_ID, hardenedRuntime: true, notarize: true },
    dmg: { sign: true },
  } });
  const app = path.join(root, 'mac-arm64/HAICoMo.app');
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const info = spawnSync('codesign', ['-dvv', app], { encoding: 'utf8' });
  if (info.status !== 0 || !info.stderr.includes('Authority=Developer ID Application:') || !info.stderr.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`)) throw new Error('Wrong signing identity');
  run('xcrun', ['stapler', 'validate', app]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  stage = 'notarizing the final disk image';
  const dmg = path.join(root, `HAICoMo-${pkg.version}-arm64.dmg`);
  run('codesign', ['--verify', '--strict', dmg]);
  await notarize({ appPath: dmg, appleId: process.env.APPLE_ID, appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD, teamId: process.env.APPLE_TEAM_ID });
  run('xcrun', ['stapler', 'validate', dmg]);
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg]);
  stage = 'checking the distributed ZIP';
  const zip = path.join(root, `HAICoMo-${pkg.version}-arm64-mac.zip`);
  const extracted = path.join(temp, 'zip-check');
  run('ditto', ['-x', '-k', zip, extracted]);
  run('codesign', ['--verify', '--deep', '--strict', path.join(extracted, 'HAICoMo.app')]);
  run('xcrun', ['stapler', 'validate', path.join(extracted, 'HAICoMo.app')]);
  // Changing the DMG after packaging invalidates its original differential map.
  // This channel uses manual downloads, so omit differential metadata entirely.
  for (const name of fs.readdirSync(root)) if (name.endsWith('.blockmap') || /^latest.*\.ya?ml$/.test(name)) fs.unlinkSync(path.join(root, name));
  const hashes = Object.fromEntries([dmg, zip].map(file => [path.basename(file), createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  fs.writeFileSync(path.join(root, 'mac-release-verification.json'), JSON.stringify({ version: pkg.version, sourceCommit: run('git', ['rev-parse', 'HEAD']).trim(), developerId: true, notarized: true, stapled: true, gatekeeper: true, hashes }, null, 2) + '\n');
  console.log('Mac release signature, notarization, stapling and Gatekeeper checks passed.');
} catch {
  // Underlying tools may include command arguments with credentials in errors.
  console.error(`Mac release failed while ${stage}. No unsigned release is permitted.`);
  process.exitCode = 1;
} finally {
  spawnSync('security', ['list-keychains', '-d', 'user', '-s', ...oldKeychains], { stdio: 'ignore' });
  spawnSync('security', ['delete-keychain', keychain], { stdio: 'ignore' });
  fs.rmSync(temp, { recursive: true, force: true });
}
