import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { privacyIssues } from './privacy-rules.mjs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('Stage the public source before checking it.');
const excluded = /(^|\/)(?:node_modules|dist|dist-electron|release)(\/|$)/;
const set = new Set(files), errors = [];
for (const file of files) {
  if (excluded.test(file)) errors.push(`${file}: private/generated path`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) { errors.push(`${file}: not a regular file`); continue; }
  if (stat.size >= 100_000_000) errors.push(`${file}: exceeds public source file limit`);
  if (/\.(png|gif|jpe?g|ico|icns)$/i.test(file)) {
    for (const issue of privacyIssues(file, '')) errors.push(`${file}: ${issue}`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const issue of privacyIssues(file, text)) errors.push(`${file}: ${issue}`);
  if (file.endsWith('.md')) for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target)));
    if (!set.has(resolved)) errors.push(`${file}: missing public link ${target}`);
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Checked ${files.length} public files: no excluded paths, recognised credential patterns, personal absolute paths or missing relative Markdown links.`);
