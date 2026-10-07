import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { listPackage, statFile, extractFile } from '@electron/asar';
import { privatePath, credentialPattern, personalPath } from './privacy-rules.mjs';

const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const resources = process.argv[2];
if (!resources) throw new Error('Usage: node scripts/check-package.mjs <packaged Resources directory>');
const archive = path.join(resources, 'app.asar');
const manifest = JSON.parse(fs.readFileSync('assets/manifest.json', 'utf8'));
const expected = new Map(manifest.files.map(asset => [`dist/${asset.file}`, asset]));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = [];
let checkedFiles = 0, runtimeAssets = 0;
for (const name of listPackage(archive)) {
  // asar traverses using the host's path separator; normalise only for manifest comparisons.
  const nativeFile = name.replace(/^[\\/]/, '');
  const file = nativeFile.replaceAll('\\', '/');
  const stat = statFile(archive, nativeFile, false);
  if (stat.files) continue;
  checkedFiles++;
  const dependency = file.startsWith('node_modules/');
  if (!dependency && privatePath.test(file)) errors.push(`${file}: excluded application file`);
  if (file.startsWith('dist/local-assets/')) {
    runtimeAssets++;
    const entry = expected.get(file);
    if (!entry || stat.link || sha256(extractFile(archive, nativeFile)) !== entry.sha256)
      errors.push(`${file}: runtime allowlist/hash mismatch`);
    expected.delete(file);
  }
  if (/\.(?:[cm]?js|ts|json|html|css|md|txt|pem|key|p8)$/i.test(file) && !stat.link) {
    const text = extractFile(archive, nativeFile).toString('utf8');
    if (credentialPattern.test(text)) errors.push(`${file}: credential pattern`);
    if (!dependency && personalPath.test(text))
      errors.push(`${file}: personal absolute path`);
  }
}
// Extra resources and unpacked files are outside app.asar and need the same checks.
function inspectResources(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = prefix + entry.name, absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) { errors.push(`${file}: unexpected resource symlink`); continue; }
    if (entry.isDirectory()) { inspectResources(absolute, file + '/'); continue; }
    if (file === 'app.asar') continue;
    if (privatePath.test(file)) errors.push(`${file}: excluded resource`);
    if (/\.(?:[cm]?js|json|yml|yaml|html|css|md|txt|pem|key|p8)$/i.test(file)) {
      const text = fs.readFileSync(absolute, 'utf8');
      if (credentialPattern.test(text)) errors.push(`${file}: credential pattern`);
      if (!file.includes('node_modules/') && personalPath.test(text)) errors.push(`${file}: personal absolute path`);
    }
  }
}
inspectResources(resources);
for (const file of expected.keys()) errors.push(`${file}: missing runtime asset`);
for (const file of ['LICENSE', 'ASSET-LICENSES.md', 'THIRD-PARTY-NOTICES.md']) {
  if (sha256(fs.readFileSync(file)) !== sha256(fs.readFileSync(path.join(resources, 'licenses', file))))
    errors.push(`${file}: packaged licence differs from source`);
}
if (errors.length) throw new Error(errors.join('\n'));
const report = {
  version, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  platform: process.platform, arch: process.arch, checkedFiles, runtimeAssets,
  archiveSha256: sha256(fs.readFileSync(archive)), manifestSha256: sha256(fs.readFileSync('assets/manifest.json')),
  result: 'passed', scope: 'Application paths, runtime allowlist and hashes, recognised credential patterns, application personal paths, packaged licences.'
};
fs.mkdirSync(`validation/${version}`, { recursive: true });
fs.writeFileSync(`validation/${version}/package-scan-${process.platform}-${process.arch}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
