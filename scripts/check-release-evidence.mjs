import fs from 'node:fs';
import path from 'node:path';
import { fileHash, isSubmissionId } from './mac-release-state.mjs';
import { verifyUpdateMetadata } from './update-metadata.mjs';
const [directory, sourceCommit, referenceCommit = sourceCommit, windowsCommit = sourceCommit] = process.argv.slice(2);
if (!directory || !/^[a-f0-9]{40}$/.test(sourceCommit ?? '') || !/^[a-f0-9]{40}$/.test(referenceCommit ?? '')) throw new Error('Verified directory and source commits required');
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const mac = path.join(directory, `haicomo-${version}-mac-arm64`);
const windows = path.join(directory, `haicomo-${version}-windows-x64`);
const m = JSON.parse(fs.readFileSync(path.join(mac, 'mac-release-verification.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(windows, 'windows-user-verification.json'), 'utf8'));
if (m.version !== version || m.sourceCommit !== sourceCommit || m.applicationReferenceCommit !== referenceCommit || !/^[a-f0-9]{40}$/.test(m.buildCommit ?? '') || !['developerId', 'notarized', 'stapled', 'gatekeeper'].every(key => m[key] === true)) throw new Error('Mac signing verification is missing or mismatched');
for (const kind of ['app','dmg']) if (!isSubmissionId(m.notarization?.[kind])) throw new Error('Mac notarization ID missing');
for (const name of [`HAICoMo-${version}-arm64.dmg`, `HAICoMo-${version}-arm64-mac.zip`]) if (fileHash(path.join(mac, name)) !== m.hashes?.[name]) throw new Error('Mac verified file differs from release file');
if (m.firstOpen?.method !== 'browser-download-fresh-macos-account' || m.firstOpen.dmgSha256 !== m.hashes[`HAICoMo-${version}-arm64.dmg`]) throw new Error('Fresh-account browser first-open acceptance is missing');
if (w.version !== version || w.result !== 'passed' || w.admin !== false || !['protectedWriteDenied', 'install', 'launch', 'reinstall', 'uninstall', 'retainedData'].every(key => w[key] === true)) throw new Error('Windows standard-user verification is missing');
if (fileHash(path.join(windows, `HAICoMo-${version}-windows-x64-setup.exe`)) !== w.installerSha256) throw new Error('Windows verified installer differs from release file');
// 0.4.0 introduced in-app updates: upgrades are verified from 0.3.5 on both platforms,
// and both platforms must ship metadata that matches the exact released payload.
const inApp = !/^0\.[0-3]\./.test(version);
const [windowsBaseline, macBaseline] = inApp ? ['0.3.5', '0.3.5'] : ['0.3.4', '0.3.3'];
if (!['0.3.3', '0.3.4'].includes(version)) {
  if (w.previousVersionUpgrade !== windowsBaseline || w.upgradeLaunch !== true || w.upgradeProject !== true || w.upgradeSettings !== true || w.upgradeAssociation !== true || w.upgradeRetainedData !== true || w.sourceCommit !== windowsCommit) throw new Error(`Windows ${windowsBaseline} upgrade evidence is missing or mismatched`);
  if (m.previousVersionUpgrade !== macBaseline || m.upgradeProject !== true || m.upgradeSettings !== true) throw new Error(`Mac ${macBaseline} upgrade evidence is missing`);
}
if (inApp) {
  try {
    await verifyUpdateMetadata(mac, version, 'darwin');
    await verifyUpdateMetadata(windows, version, 'win32');
  } catch { throw new Error('In-app update metadata is missing or does not match the release files'); }
  if (fileHash(path.join(mac, 'latest-mac.yml')) !== m.hashes?.['latest-mac.yml']) throw new Error('Mac verified file differs from release file');
  const update = w.inAppUpdate;
  if (update?.fromVersion !== version || !/^\d+\.\d+\.\d+$/.test(update?.toVersion ?? '') || update.installed !== true || update.restored !== true) throw new Error('Windows in-app update evidence is missing');
}
console.log('Release artifacts match their platform acceptance evidence.');
