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
export const releaseSecretNames = ['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'CSC_LINK', 'CSC_KEY_PASSWORD'];
// Only messages written by the release scripts themselves may be printed.
export const isSafeReleaseError = message => /^(?:Missing release secrets:|Apple tool check failed:|Apple |Checkpoint |App notarization|DMG notarization|Developer ID |ZIP application|Update metadata |Unsupported update platform|Source commit required|Application inputs changed|Submission ID required|Invalid |Unexpected Apple|Unknown Mac release|Mac release requires)/.test(message ?? '');
export function shownPath(arg, cwd = process.cwd()) {
  if (!path.isAbsolute(arg)) return arg;
  const relative = path.relative(cwd, arg);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : arg;
}
const verificationTool = (cmd, args) => ['codesign', 'spctl', 'ditto'].includes(cmd) || (cmd === 'xcrun' && args[0] === 'stapler');
/**
 * Describes a failed local signing check. codesign, spctl, ditto and stapler
 * take no credentials, so the command, exit status and the start of the output
 * are shown. notarytool and security are refused: their arguments carry
 * secrets. Any release secret value that still appears is replaced.
 */
export function toolFailure(cmd, args, result, secrets = [], cwd = process.cwd()) {
  if (!verificationTool(cmd, args)) throw new Error('Unknown Mac release tool; output not shown');
  const outcome = result.status !== null && result.status !== undefined ? `exited ${result.status}` : `stopped (${result.error?.code ?? result.signal ?? 'unknown'})`;
  let command = [cmd, ...args.map(arg => shownPath(arg, cwd))].join(' ');
  let output = [result.stderr, result.stdout].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  for (const value of secrets.filter(value => value && value.length >= 4)) {
    command = command.split(value).join('[redacted]');
    output = output.split(value).join('[redacted]');
  }
  return new Error(`Apple tool check failed: ${command} ${outcome}: ${output.slice(0, 400) || 'no output'}`);
}
// Lost connection, timeout, unknown or unreachable host, no network.
export const isNetworkFailure = message => /NSURLErrorDomain Code=-(?:1001|1003|1004|1005|1006|1009)\b|network connection was lost|timed out/i.test(message ?? '');
/**
 * Runs an Apple tool check that depends on Apple's servers. A network failure
 * gets up to four attempts in all, pausing networkDelaysMs before each retry;
 * any other failure gets one retry after otherDelayMs. Each failure is logged;
 * the last one is thrown unchanged, so it still names the tool.
 */
export async function retryAppleCheck(check, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), warn = console.warn, networkDelaysMs = [15_000, 45_000, 90_000], otherDelayMs = 10_000 } = {}) {
  let otherRetried = false;
  for (let attempt = 1; ; attempt++) {
    try { return await check(); }
    catch (error) {
      const network = isNetworkFailure(error?.message);
      if (attempt > networkDelaysMs.length || (!network && otherRetried)) throw error;
      const delay = network ? networkDelaysMs[attempt - 1] : otherDelayMs;
      otherRetried ||= !network;
      warn(`${error.message} ${network ? 'Network failure; attempt' : 'Attempt'} ${attempt + 1} in ${delay / 1000} s.`);
      await sleep(delay);
    }
  }
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
    || /^(?:README(?:\.zh-CN)?|AGENTS)\.md$/.test(file)
    || file === 'scripts/local-mac-update.py'
    || /^scripts\/(?:release-mac|mac-release-state|check-release-source|check-release-evidence|restore-mac-candidate|mac-first-launch|prepare-mac-publish|prepare-mac-upgrade|record-mac-upgrade|release-provenance|update-metadata)\.mjs$/.test(file);
}
export async function withCleanup(work, cleanup) {
  try { return await work(); } finally { await cleanup(); }
}
