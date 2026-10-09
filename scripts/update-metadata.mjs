// In-app update metadata (latest-mac.yml / latest.yml) generated from the exact
// final release file, after signing, notarisation and ZIP re-creation.
// Usage: node scripts/update-metadata.mjs write|verify <directory> <darwin|win32>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function updateNames(version, platform) {
  if (platform === 'darwin') return { metadata: 'latest-mac.yml', payload: `HAICoMo-${version}-arm64-mac.zip` };
  if (platform === 'win32') return { metadata: 'latest.yml', payload: `HAICoMo-${version}-windows-x64-setup.exe` };
  throw new Error(`Unsupported update platform: ${platform}`);
}
async function sha512(file) {
  const hash = createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}
const quote = value => `'${String(value).replace(/'/g, "''")}'`;
export function renderUpdateMetadata({ version, name, sha512: digest, size, releaseDate }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || !/^[A-Za-z0-9+/]+={0,2}$/.test(digest) || !(size > 0)) throw new Error('Invalid update metadata input');
  // minimumSystemVersion is deliberately omitted: electron-updater compares it with the Darwin kernel version.
  return [`version: ${version}`, 'files:', `  - url: ${name}`, `    sha512: ${quote(digest)}`, `    size: ${size}`, `path: ${name}`, `sha512: ${quote(digest)}`, `releaseDate: ${quote(releaseDate)}`, ''].join('\n');
}
/** Reads the fields this repository writes; anything else is rejected. */
export function parseUpdateMetadata(text) {
  const field = (pattern) => pattern.exec(text)?.[1];
  const unquote = (value) => value?.startsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value;
  const result = {
    version: field(/^version: (\S+)$/m), url: field(/^ {2}- url: (\S+)$/m), fileSha512: unquote(field(/^ {4}sha512: (\S+)$/m)),
    size: Number(field(/^ {4}size: (\d+)$/m)), path: field(/^path: (\S+)$/m), sha512: unquote(field(/^sha512: (\S+)$/m)),
  };
  if ((text.match(/^ {2}- url:/gm) ?? []).length !== 1) throw new Error('Update metadata must list exactly one file');
  return result;
}
export async function writeUpdateMetadata(directory, version, platform, releaseDate = new Date().toISOString()) {
  const { metadata, payload } = updateNames(version, platform);
  const file = path.join(directory, payload);
  const text = renderUpdateMetadata({ version, name: payload, sha512: await sha512(file), size: fs.statSync(file).size, releaseDate });
  fs.writeFileSync(path.join(directory, metadata), text);
  return path.join(directory, metadata);
}
export async function verifyUpdateMetadata(directory, version, platform) {
  const { metadata, payload } = updateNames(version, platform);
  const file = path.join(directory, payload);
  const parsed = parseUpdateMetadata(fs.readFileSync(path.join(directory, metadata), 'utf8'));
  const digest = await sha512(file);
  if (parsed.version !== version || parsed.url !== payload || parsed.path !== payload || parsed.fileSha512 !== digest || parsed.sha512 !== digest || parsed.size !== fs.statSync(file).size)
    throw new Error(`Update metadata ${metadata} does not match ${payload}`);
  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory, platform = process.platform] = process.argv.slice(2);
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (!directory || !['write', 'verify'].includes(command)) throw new Error('Usage: update-metadata.mjs write|verify <directory> [darwin|win32]');
  if (command === 'write') console.log(await writeUpdateMetadata(directory, version, platform));
  await verifyUpdateMetadata(directory, version, platform);
  console.log(`${updateNames(version, platform).metadata} matches ${updateNames(version, platform).payload}.`);
}
