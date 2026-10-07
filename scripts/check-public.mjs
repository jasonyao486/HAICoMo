import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('Stage the public source before checking it.');
const excluded = /(^|\/)(?:node_modules|dist|dist-electron|release|validation|handoff|legacy|public|\.haicomo|\.haicomo-history)(\/|$)|(?:\.haicomo(?:\.zip)?|\.sqlite(?:-.*)?|\.db|\.p12|\.pfx|\.pem|\.key|\.log)$|(^|\/)\.env(?:\.|$)|(^|\/)prd_draft\.md$/i;
const secrets = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{32,})\b/;
const set = new Set(files), errors = [];
for (const file of files) {
  if (excluded.test(file)) errors.push(`${file}: private/generated path`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) { errors.push(`${file}: not a regular file`); continue; }
  if (stat.size >= 100_000_000) errors.push(`${file}: exceeds public source file limit`);
  if (/\.(png|gif|jpe?g|ico|icns)$/i.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (secrets.test(text)) errors.push(`${file}: credential pattern`);
  const personal = [...text.matchAll(/\/Users\/([A-Za-z0-9._-]+)\//g)].filter(m => !['example', 'user', 'name'].includes(m[1]));
  if (personal.length) errors.push(`${file}: personal absolute path`);
  if (file.endsWith('.md')) for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target)));
    if (!set.has(resolved)) errors.push(`${file}: missing public link ${target}`);
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Checked ${files.length} public files: no excluded paths, recognised credential patterns, personal absolute paths or missing relative Markdown links.`);
