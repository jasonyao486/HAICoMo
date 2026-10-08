import fs from 'node:fs';
import path from 'node:path';
import { fileHash, isSubmissionId } from './mac-release-state.mjs';
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
if (!['0.3.3', '0.3.4'].includes(version)) {
  if (w.previousVersionUpgrade !== '0.3.4' || w.upgradeLaunch !== true || w.upgradeProject !== true || w.upgradeSettings !== true || w.upgradeAssociation !== true || w.upgradeRetainedData !== true || w.sourceCommit !== windowsCommit) throw new Error('Windows 0.3.4 upgrade evidence is missing or mismatched');
  if (m.previousVersionUpgrade !== '0.3.3' || m.upgradeProject !== true || m.upgradeSettings !== true) throw new Error('Mac 0.3.3 upgrade evidence is missing');
}
console.log('Release artifacts match their platform acceptance evidence.');
