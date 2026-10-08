import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const isSubmissionId = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value ?? '');
export function requireEnvironment(names, env = process.env) {
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw new Error(`Missing release secrets: ${missing.join(', ')}`);
}
export function fileHash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
// An existing formal release is the source of truth after interim files retire.
// The caller downloads both files from the same public release into a separate directory.
export function verifyPublishedMacBaseline(directory, candidate, version, reference) {
  const reportName = 'mac-release-verification.json';
  const manifest = fs.readFileSync(path.join(directory, 'SHA256SUMS-darwin-arm64.txt'), 'utf8');
  const entries = new Map();
  for (const line of manifest.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!match || entries.has(match[2])) throw new Error('Invalid formal Mac checksum manifest');
    entries.set(match[2], match[1]);
  }
  const dmg = `HAICoMo-${version}-arm64.dmg`, zip = `HAICoMo-${version}-arm64-mac.zip`;
  if (entries.size !== 3 || ![reportName, dmg, zip].every(name => entries.has(name))) throw new Error('Incomplete formal Mac checksum manifest');
  const reportFile = verifyArtifact(directory, {file: reportName, sha256: entries.get(reportName)});
  const prior = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (prior.version !== version || prior.applicationReferenceCommit !== reference
      || !/^[a-f0-9]{40}$/.test(prior.buildCommit ?? '') || prior.sourceCommit !== prior.buildCommit
      || !/^[a-f0-9]{64}$/.test(prior.archiveSha256 ?? '')
      || !['developerId', 'notarized', 'stapled', 'gatekeeper'].every(key => prior[key] === true)
      || !['app', 'dmg'].every(key => isSubmissionId(prior.notarization?.[key]))
      || ![dmg, zip].every(name => prior.hashes?.[name] === entries.get(name))
      || prior.firstOpen?.method !== 'browser-download-fresh-macos-account'
      || prior.firstOpen?.dmgSha256 !== entries.get(dmg)) throw new Error('Invalid formal Mac acceptance baseline');
  if (candidate.archiveSha256 !== prior.archiveSha256) throw new Error('Application archive changed; publish a new patch version');
  return prior;
}
export function saveState(file, state) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
export function verifyArtifact(directory, artifact) {
  if (!artifact || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(artifact.file ?? '') || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) throw new Error('Invalid checkpoint artifact');
  const file = path.join(directory, artifact.file);
  if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink() || fileHash(file) !== artifact.sha256) throw new Error('Checkpoint artifact hash mismatch');
  return file;
}
export function validateState(state, version) {
  if (state.schema !== 1 || state.version !== version || !/^[a-f0-9]{40}$/.test(state.buildCommit ?? '') || !/^[a-f0-9]{40}$/.test(state.applicationReferenceCommit ?? '')) throw new Error('Checkpoint source is missing or mismatched');
  for (const key of ['app', 'dmg']) {
    const item = state[key];
    if (!item) continue;
    if (item.id && !isSubmissionId(item.id)) throw new Error('Invalid notarization submission ID');
    if (!['Prepared', 'In Progress', 'Accepted', 'Invalid', 'Rejected'].includes(item.status)) throw new Error('Invalid notarization status');
  }
  return state;
}
// Persist the attempt before upload. A lost response is not permission to submit
// again: recover only when Apple's log proves the exact uploaded file hash.
export async function submitNotarization(item, { submit, recover, save, now = () => new Date().toISOString() }) {
  if (item.id) return;
  let response;
  if (item.submissionStartedAt) {
    response = await recover(item);
    if (!response || !isSubmissionId(response.jobId) || response.sha256 !== item.sha256) throw new Error('Apple upload outcome unknown; preserve the candidate and retry status recovery');
    response = { id: response.jobId };
  } else {
    item.submissionStartedAt = now();
    save();
    try { response = await submit(); }
    catch { throw new Error('Apple upload response unavailable; resume status recovery without resubmitting'); }
  }
  if (!isSubmissionId(response?.id)) throw new Error('Apple did not return a valid submission ID; resume status recovery');
  item.id = response.id;
  item.status = 'In Progress';
  save();
}
export async function waitForAcceptance(item, { info, save, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 60 * 60 * 1000, intervalMs = 60_000 }) {
  if (!item.id) throw new Error('Submission ID required; do not resubmit a known submission');
  const deadline = now() + timeoutMs;
  let errors = 0;
  while (now() < deadline) {
    let result;
    try { result = await info(item.id); errors = 0; }
    catch {
      if (++errors >= 3) throw new Error('Apple status unavailable; resume with the saved submission ID');
      await sleep(intervalMs * errors);
      continue;
    }
    if (result.id !== item.id || !['Accepted', 'In Progress', 'Invalid', 'Rejected'].includes(result.status)) throw new Error('Unexpected Apple submission response');
    item.status = result.status;
    save();
    if (item.status === 'Accepted') return;
    if (item.status !== 'In Progress') throw new Error(`Apple notarization ${item.status}; publication blocked`);
    await sleep(intervalMs);
  }
  throw new Error('Apple notarization still pending; resume with the saved submission ID');
}
// Only release infrastructure, tests and documentation may differ for a supplement.
export function isReleaseMaintenance(file) {
  return /^(?:docs\/|tests\/|\.github\/workflows\/)/.test(file)
    || /^README(?:\.zh-CN)?\.md$/.test(file)
    || /^scripts\/(?:release-mac|mac-release-state|check-release-source|check-release-evidence|restore-mac-candidate|mac-first-launch|prepare-mac-publish|prepare-mac-upgrade|record-mac-upgrade|release-provenance)\.mjs$/.test(file);
}
export async function withCleanup(work, cleanup) {
  try { return await work(); } finally { await cleanup(); }
}
