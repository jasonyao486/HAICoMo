import { verifyPlatformRun } from './release-provenance.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileHash, verifyPublishedMacBaseline } from './mac-release-state.mjs';
import { assertApplicationSource } from './check-release-source.mjs';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const gh = args => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const api = route => JSON.parse(gh(['api', `repos/${process.env.GH_REPO}/${route}`]));
const id = process.env.VERIFY_RUN_ID;
const windowsId = process.env.WINDOWS_VERIFY_RUN_ID || id;
if (!/^\d+$/.test(id ?? '')) throw new Error('Invalid verification run ID');
const run = api(`actions/runs/${id}`);
const jobs = api(`actions/runs/${id}/jobs?per_page=100`).jobs;
verifyPlatformRun(run, jobs, 'mac', process.env.GH_REPO);
execFileSync('git', ['fetch','origin',run.head_sha]);
assertApplicationSource(run.head_sha);
const tag = `v${version}`;
const existing = spawnSync('gh', ['release','view',tag,'--json','assets,isDraft'],{encoding:'utf8'});
const hasRelease = existing.status === 0;
let reference = run.head_sha;
let windowsSource = run.head_sha;
const mac = path.resolve(`verified/haicomo-${version}-mac-arm64`);
const windows = path.resolve(`verified/haicomo-${version}-windows-x64`);
fs.mkdirSync(mac,{recursive:true});fs.mkdirSync(windows,{recursive:true});
gh(['run','download',id,'-n',`haicomo-${version}-mac-arm64`,'-D',mac]);
execFileSync('sha256sum',['-c','SHA256SUMS-darwin-arm64.txt'],{cwd:mac,stdio:'inherit'});
const reportPath = path.join(mac,'mac-release-verification.json');
const report = JSON.parse(fs.readFileSync(reportPath,'utf8'));
assertApplicationSource(report.buildCommit, run.head_sha);
assertApplicationSource(report.applicationReferenceCommit, run.head_sha);
reference = report.applicationReferenceCommit;
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
    // Keep historical evidence outside the directory glob used for publication.
    const baseline = path.resolve('published-mac-baseline');
    fs.mkdirSync(baseline, {recursive:true});
    for (const name of ['mac-release-verification.json','SHA256SUMS-darwin-arm64.txt']) gh(['release','download',tag,'-p',name,'-D',baseline]);
    const prior = verifyPublishedMacBaseline(baseline, report, version, reference);
    assertApplicationSource(reference, prior.buildCommit);
  }
} else {
  if (!/^\d+$/.test(windowsId ?? '')) throw new Error('Invalid Windows verification run ID');
  const windowsRun = windowsId === id ? run : api(`actions/runs/${windowsId}`);
  const windowsJobs = windowsId === id ? jobs : api(`actions/runs/${windowsId}/jobs?per_page=100`).jobs;
  verifyPlatformRun(windowsRun, windowsJobs, 'windows', process.env.GH_REPO);
  execFileSync('git', ['fetch','origin',windowsRun.head_sha]);
  assertApplicationSource(run.head_sha, windowsRun.head_sha);
  windowsSource = windowsRun.head_sha;
  gh(['run','download',windowsId,'-n',`haicomo-${version}-windows-x64`,'-D',windows]);
}
execFileSync('sha256sum',['-c','SHA256SUMS-win32-x64.txt'],{cwd:windows,stdio:'inherit'});
const acceptedHash = process.env.FIRST_OPEN_DMG_SHA256;
if (!/^[a-f0-9]{64}$/.test(acceptedHash ?? '') || acceptedHash !== report.hashes?.[`HAICoMo-${version}-arm64.dmg`]) throw new Error('Provide the exact DMG hash after browser first-open acceptance in a fresh macOS account');
report.firstOpen = {method:'browser-download-fresh-macos-account',dmgSha256:acceptedHash,recordedAt:new Date().toISOString()};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const macNames=[`HAICoMo-${version}-arm64.dmg`,`HAICoMo-${version}-arm64-mac.zip`,'mac-release-verification.json'];
fs.writeFileSync(path.join(mac,'SHA256SUMS-darwin-arm64.txt'),macNames.map(name=>`${fileHash(path.join(mac,name))}  ${name}\n`).join(''));
execFileSync(process.execPath,['scripts/check-release-evidence.mjs','verified',run.head_sha,reference,windowsSource],{stdio:'inherit'});
fs.appendFileSync(process.env.GITHUB_ENV,`SOURCE_SHA=${run.head_sha}\nEXISTING_RELEASE=${hasRelease}\n`);
