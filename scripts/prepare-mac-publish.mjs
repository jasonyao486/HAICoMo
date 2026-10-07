import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileHash } from './mac-release-state.mjs';
import { assertApplicationSource } from './check-release-source.mjs';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const gh = args => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const api = route => JSON.parse(gh(['api', `repos/${process.env.GH_REPO}/${route}`]));
const id = process.env.VERIFY_RUN_ID;
if (!/^\d+$/.test(id ?? '')) throw new Error('Invalid verification run ID');
const run = api(`actions/runs/${id}`);
if (run.conclusion !== 'success' || run.head_branch !== 'main' || !['push','workflow_dispatch'].includes(run.event) || run.path !== '.github/workflows/verify.yml' || run.head_repository?.full_name !== process.env.GH_REPO) throw new Error('Successful trusted main verification required');
const jobs = api(`actions/runs/${id}/jobs`).jobs;
if (!jobs.some(j => j.name === 'desktop (macos-15, mac, arm64)' && j.conclusion === 'success')) throw new Error('Mac native verification missing');
execFileSync('git', ['fetch','origin',run.head_sha]);
assertApplicationSource(run.head_sha);
const tag = `v${version}`;
const existing = spawnSync('gh', ['release','view',tag,'--json','assets,isDraft'],{encoding:'utf8'});
const hasRelease = existing.status === 0;
let reference = run.head_sha;
const mac = path.resolve(`verified/haicomo-${version}-mac-arm64`);
const windows = path.resolve(`verified/haicomo-${version}-windows-x64`);
fs.mkdirSync(mac,{recursive:true});fs.mkdirSync(windows,{recursive:true});
gh(['run','download',id,'-n',`haicomo-${version}-mac-arm64`,'-D',mac]);
execFileSync('sha256sum',['-c','SHA256SUMS-darwin-arm64.txt'],{cwd:mac,stdio:'inherit'});
const reportPath = path.join(mac,'mac-release-verification.json');
const report = JSON.parse(fs.readFileSync(reportPath,'utf8'));
if (hasRelease) {
  const release = JSON.parse(existing.stdout);
  if (release.isDraft) throw new Error('Existing release must be public before supplementation');
  reference = execFileSync('git',['rev-parse',`${tag}^{commit}`],{encoding:'utf8'}).trim();
  assertApplicationSource(reference,run.head_sha);
  assertApplicationSource(reference,report.buildCommit);
  const names = [`HAICoMo-${version}-windows-x64-setup.exe`,`HAICoMo-${version}-windows-x64-setup.exe.blockmap`,'windows-user-verification.json','SHA256SUMS-win32-x64.txt'];
  for (const name of names) gh(['release','download',tag,'-p',name,'-D',windows]);
  fs.writeFileSync('windows-before.json',JSON.stringify(Object.fromEntries(names.map(name=>[name,fileHash(path.join(windows,name))]))));
  if (version === '0.3.3') {
    gh(['release','download',tag,'-p','mac-interim-verification.json','-D','verified']);
    const prior=JSON.parse(fs.readFileSync('verified/mac-interim-verification.json','utf8'));
    if (report.archiveSha256 !== prior.archiveSha256) throw new Error('Application archive changed; publish a new patch version');
  }
} else {
  if (!jobs.some(j=>j.name==='desktop (windows-2025, windows, x64)' && j.conclusion==='success')) throw new Error('A new version requires native Windows verification');
  gh(['run','download',id,'-n',`haicomo-${version}-windows-x64`,'-D',windows]);
}
execFileSync('sha256sum',['-c','SHA256SUMS-win32-x64.txt'],{cwd:windows,stdio:'inherit'});
const acceptedHash = process.env.FIRST_OPEN_DMG_SHA256;
if (!/^[a-f0-9]{64}$/.test(acceptedHash ?? '') || acceptedHash !== report.hashes?.[`HAICoMo-${version}-arm64.dmg`]) throw new Error('Provide the exact DMG hash after browser first-open acceptance in a fresh macOS account');
report.firstOpen = {method:'browser-download-fresh-macos-account',dmgSha256:acceptedHash,recordedAt:new Date().toISOString()};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const macNames=[`HAICoMo-${version}-arm64.dmg`,`HAICoMo-${version}-arm64-mac.zip`,'mac-release-verification.json'];
fs.writeFileSync(path.join(mac,'SHA256SUMS-darwin-arm64.txt'),macNames.map(name=>`${fileHash(path.join(mac,name))}  ${name}\n`).join(''));
execFileSync(process.execPath,['scripts/check-release-evidence.mjs','verified',run.head_sha,reference],{stdio:'inherit'});
fs.appendFileSync(process.env.GITHUB_ENV,`SOURCE_SHA=${run.head_sha}\nEXISTING_RELEASE=${hasRelease}\n`);
