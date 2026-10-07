import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The scanner runs as a subprocess, so these tests exercise its actual failure boundary.
const checker = path.resolve('scripts/check-public.mjs');
function checkFixture(file: string, contents: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haicomo-privacy-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
    execFileSync('git', ['add', '--', file], { cwd: root });
    try { return { ok: true, output: execFileSync(process.execPath, [checker], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) }; }
    catch (error: any) { return { ok: false, output: String(error.stderr) }; }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('public scan rejects signing material even when already tracked and never echoes secrets', () => {
  for (const suffix of ['p8', 'p12', 'certSigningRequest', 'keychain-db']) {
    assert.equal(checkFixture(`signing.${suffix}`, 'not a real credential').ok, false);
  }
  const secret = ['ghp', '_', 'x'.repeat(36)].join('');
  const result = checkFixture('settings.txt', secret);
  assert.equal(result.ok, false);
  assert.ok(!result.output.includes(secret));
  const pem = ['-----BEGIN ', 'ENCRYPTED PRIVATE KEY-----', '\n', 'A'.repeat(64)].join('');
  assert.equal(checkFixture('settings.txt', pem).ok, false);
});
test('public scan permits templates but rejects personal source paths', () => {
  assert.equal(checkFixture('README.md', 'Use the CSC_LINK environment variable.').ok, true);
  const personal = ['/', 'Users', '/private-person/work'].join('');
  assert.equal(checkFixture('settings.txt', personal).ok, false);
  const windows = ['C:', '\\Users\\private-person\\work'].join('');
  assert.equal(checkFixture('settings.txt', windows).ok, false);
});
