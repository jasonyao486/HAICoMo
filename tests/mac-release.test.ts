import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Native ESM release helpers are exercised by subprocess-free runtime tests.
import { fileHash, verifyArtifact, validateState, waitForAcceptance, requireEnvironment, withCleanup, isReleaseMaintenance } from '../scripts/mac-release-state.mjs';
const id = '12345678-1234-1234-1234-123456789abc';
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
