import { verifyPlatformRun } from '../scripts/release-provenance.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error Native ESM release helpers are exercised by subprocess-free runtime tests.
import { fileHash, isSubmissionId, submitNotarization, verifyArtifact, validateState, waitForAcceptance, requireEnvironment, withCleanup, isReleaseMaintenance, verifyPublishedMacBaseline } from '../scripts/mac-release-state.mjs';
const id = '12345678-1234-1234-1234-123456789abc';
test('formal baseline works without interim assets and rejects missing or modified evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haicomo-formal-baseline-'));
  try {
    const version = '0.3.3', reference = '1'.repeat(40), archiveSha256 = '2'.repeat(64);
    const dmg = `HAICoMo-${version}-arm64.dmg`, zip = `HAICoMo-${version}-arm64-mac.zip`;
    const reportFile = path.join(dir, 'mac-release-verification.json'), manifestFile = path.join(dir, 'SHA256SUMS-darwin-arm64.txt');
    const prior: any = { version, applicationReferenceCommit: reference, buildCommit: reference, sourceCommit: reference, archiveSha256,
      developerId: true, notarized: true, stapled: true, gatekeeper: true, notarization: { app: id, dmg: id },
      hashes: { [dmg]: '3'.repeat(64), [zip]: '4'.repeat(64) }, firstOpen: { method: 'browser-download-fresh-macos-account', dmgSha256: '3'.repeat(64) } };
    const reset = () => {
      fs.writeFileSync(reportFile, JSON.stringify(prior));
      fs.writeFileSync(manifestFile, Object.entries({ ...prior.hashes, 'mac-release-verification.json': fileHash(reportFile) }).map(([name, hash]) => `${hash}  ${name}\n`).join(''));
    };
    const check = () => verifyPublishedMacBaseline(dir, { archiveSha256 }, version, reference);
    reset(); assert.equal(check().archiveSha256, archiveSha256);
    fs.unlinkSync(reportFile); assert.throws(check); reset();
    fs.unlinkSync(manifestFile); assert.throws(check); reset();
    fs.appendFileSync(reportFile, ' '); assert.throws(check, /hash mismatch/); reset();
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, 'utf8').replace('3'.repeat(64), '5'.repeat(64))); assert.throws(check, /baseline/); reset();
    fs.appendFileSync(manifestFile, `${'6'.repeat(64)}  mac-release-verification.json\n`); assert.throws(check, /manifest/); reset();
    assert.throws(() => verifyPublishedMacBaseline(dir, { archiveSha256: '7'.repeat(64) }, version, reference), /archive changed/);
    assert.throws(() => verifyPublishedMacBaseline(dir, { archiveSha256 }, version, '8'.repeat(40)), /baseline/);
    prior.notarized = false; reset(); assert.throws(check, /baseline/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('notarization survives pending, transient disconnect and resumption without a new submission', async () => {
  const item = { id, status: 'In Progress' };
  let clock = 0, calls = 0, saved = 0;
  const config = { save: () => saved++, now: () => clock, sleep: async (ms: number) => { clock += ms; }, intervalMs: 1, timeoutMs: 3 };
  await assert.rejects(waitForAcceptance(item, { ...config, info: async () => { calls++; return { id, status: 'In Progress' }; } }), /still pending/);
  assert.equal(calls, 3);
  let disconnected = false;
  await waitForAcceptance(item, { ...config, info: async (requested: string) => { assert.equal(requested,id); if (!disconnected) { disconnected=true; throw new Error('network'); } return { id, status: 'Accepted' }; } });
  assert.equal(item.status, 'Accepted');
  assert.ok(saved >= 4);
});
test('Apple rejection, wrong submission and repeated outages fail closed', async () => {
  for (const status of ['Invalid', 'Rejected']) await assert.rejects(waitForAcceptance({id}, {save(){}, info: async () => ({id,status})}), /publication blocked/);
  await assert.rejects(waitForAcceptance({id}, {save(){},info:async()=>({id:'other',status:'Accepted'})}), /Unexpected/);
  await assert.rejects(waitForAcceptance({id}, {save(){}, sleep:async()=>{},info:async()=>{throw new Error('private response');}}), /saved submission ID/);
});
test('checkpoint tampering and unsafe paths are rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'haicomo-checkpoint-'));
  try {
    const file = path.join(dir,'candidate.zip'); fs.writeFileSync(file,'original');
    const metadata = {file:'candidate.zip',sha256:fileHash(file)};
    assert.equal(verifyArtifact(dir,metadata),file);
    fs.writeFileSync(file,'modified'); assert.throws(()=>verifyArtifact(dir,metadata),/hash mismatch/);
    assert.throws(()=>verifyArtifact(dir,{...metadata,file:'../candidate.zip'}),/Invalid/);
    assert.throws(()=>validateState({schema:1,version:'wrong'},'0.3.3'),/mismatched/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('missing credentials and failed operations preserve cleanup and do not expose values', async () => {
  assert.throws(()=>requireEnvironment(['CSC_LINK','CSC_KEY_PASSWORD'],{CSC_LINK:'private-value'}),/Missing release secrets: CSC_KEY_PASSWORD/);
  let cleaned = false;
  await assert.rejects(withCleanup(async()=>{throw new Error('signing failed');},async()=>{cleaned=true;}),/signing failed/);
  assert.equal(cleaned,true);
  cleaned=false; await withCleanup(async()=>{},async()=>{cleaned=true;}); assert.equal(cleaned,true);
});
test('supplements allow release infrastructure, but never application changes', () => {
  for (const name of ['scripts/release-mac.mjs','.github/workflows/verify.yml','tests/e2e/tabs.spec.ts','docs/TESTING-0.3.3.md']) assert.equal(isReleaseMaintenance(name),true);
  for (const name of ['src/ui/Views.tsx','package.json','package-lock.json','build/installer.nsh','scripts/build.mjs','assets/runtime/logo.svg']) assert.equal(isReleaseMaintenance(name),false);
});
test('lost upload responses recover only the exact hash and never repeat submission', async () => {
  const item: {sha256:string; id?:string; status?:string; submissionStartedAt?:string} = {sha256:'a'.repeat(64)};
  let submitted = 0, saved = 0;
  const hooks = {save:()=>saved++, submit:async()=>{submitted++; throw new Error('network');}, recover:async()=>undefined};
  await assert.rejects(submitNotarization(item,hooks), /resume status recovery/);
  assert.equal(submitted,1); assert.equal(saved,1); assert.ok(item.submissionStartedAt);
  await assert.rejects(submitNotarization(item,hooks), /outcome unknown/);
  await assert.rejects(submitNotarization(item,{...hooks,recover:async()=>({jobId:id,sha256:'b'.repeat(64)})}), /outcome unknown/);
  assert.equal(submitted,1); assert.equal(item.id,undefined);
  await submitNotarization(item,{...hooks,recover:async()=>({jobId:id,sha256:item.sha256})});
  assert.equal(item.id,id); assert.equal(item.status,'In Progress'); assert.equal(saved,2);
  await submitNotarization(item,hooks); assert.equal(submitted,1);
  assert.equal(isSubmissionId('-'.repeat(36)),false);
});
for (const version of ['0.3.3','0.3.5']) test(`publication ${version} requires exact formal files and fresh-account first-open evidence`, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haicomo-publish-gate-'));
  try {
    const source='1'.repeat(40), reference='2'.repeat(40);
    const mac=path.join(dir,`haicomo-${version}-mac-arm64`), win=path.join(dir,`haicomo-${version}-windows-x64`);
    fs.mkdirSync(mac);fs.mkdirSync(win);fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({version}));
    const dmg=`HAICoMo-${version}-arm64.dmg`, zip=`HAICoMo-${version}-arm64-mac.zip`, exe=`HAICoMo-${version}-windows-x64-setup.exe`;
    for(const name of [dmg,zip]) fs.writeFileSync(path.join(mac,name),name);
    fs.writeFileSync(path.join(win,exe),exe);
    const hashes=Object.fromEntries([dmg,zip].map(name=>[name,fileHash(path.join(mac,name))]));
    const m:any={version,sourceCommit:source,buildCommit:source,applicationReferenceCommit:reference,developerId:true,notarized:true,stapled:true,gatekeeper:true,notarization:{app:id,dmg:id},hashes};
    const w:any={version,result:'passed',admin:false,installerSha256:fileHash(path.join(win,exe))};
    for(const key of ['protectedWriteDenied','install','launch','reinstall','uninstall','retainedData'])w[key]=true;
    const check=()=>{
      fs.writeFileSync(path.join(mac,'mac-release-verification.json'),JSON.stringify(m));
      fs.writeFileSync(path.join(win,'windows-user-verification.json'),JSON.stringify(w));
      return spawnSync(process.execPath,[path.resolve('scripts/check-release-evidence.mjs'),dir,source,reference],{cwd:dir,encoding:'utf8'});
    };
    assert.match(check().stderr,/first-open acceptance is missing/);
    m.firstOpen={method:'browser-download-fresh-macos-account',dmgSha256:hashes[dmg]};
    if (version === '0.3.5') {
      assert.match(check().stderr,/Windows 0.3.4 upgrade evidence/);
      Object.assign(w,{previousVersionUpgrade:'0.3.4',upgradeLaunch:true,upgradeProject:true,upgradeSettings:true,upgradeAssociation:true,upgradeRetainedData:true,sourceCommit:source});
      assert.match(check().stderr,/Mac 0.3.3 upgrade evidence/);
      Object.assign(m,{previousVersionUpgrade:'0.3.3',upgradeProject:true,upgradeSettings:true});
      w.sourceCommit=reference; assert.match(check().stderr,/Windows 0.3.4 upgrade evidence/); w.sourceCommit=source;
      w.previousVersionUpgrade='0.3.3'; assert.notEqual(check().status,0); w.previousVersionUpgrade='0.3.4';
    }
    assert.equal(check().status,0);
    m.firstOpen.dmgSha256='a'.repeat(64);assert.notEqual(check().status,0);m.firstOpen.dmgSha256=hashes[dmg];
    w.admin=true;assert.match(check().stderr,/Windows standard-user/);w.admin=false;
    m.notarized=false;assert.match(check().stderr,/Mac signing/);m.notarized=true;
    m.buildCommit='unknown';assert.notEqual(check().status,0);m.buildCommit=source;
    fs.appendFileSync(path.join(mac,dmg),'tampered');assert.match(check().stderr,/differs from release/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});


test('independent platform runs require trusted main jobs and never accept an unverified platform', () => {
  const repository='example/project', sha='1'.repeat(40);
  const run={status:'completed',conclusion:'success',head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/verify.yml',head_repository:{full_name:repository},head_sha:sha};
  const jobs=[{name:'desktop (windows-2025, windows, x64)',conclusion:'success'}];
  verifyPlatformRun({...run,conclusion:'failure'},jobs,'windows',repository);
  assert.throws(()=>verifyPlatformRun({...run,conclusion:'failure'},jobs,'mac',repository));
  verifyPlatformRun({...run,conclusion:'failure'},[{name:'desktop (macos-15, mac, arm64)',conclusion:'success'}],'mac',repository);
  assert.throws(()=>verifyPlatformRun({...run,event:'pull_request'},jobs,'windows',repository));
  assert.throws(()=>verifyPlatformRun({...run,head_branch:'feature'},jobs,'windows',repository));
  assert.throws(()=>verifyPlatformRun(run,jobs,'windows','different/repository'));
  assert.throws(()=>verifyPlatformRun(run,[{...jobs[0],conclusion:'failure'}],'windows',repository));
  assert.throws(()=>verifyPlatformRun({...run,conclusion:'cancelled'},jobs,'windows',repository));
});
