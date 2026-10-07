import { execFileSync } from 'node:child_process';
import { isReleaseMaintenance } from './mac-release-state.mjs';
export function assertApplicationSource(reference, revision = 'HEAD') {
  if (!/^[a-f0-9]{40}$/.test(reference) || !/^(?:HEAD|[a-f0-9]{40})$/.test(revision)) throw new Error('Source commit required');
  const files = execFileSync('git', ['diff', '--name-only', reference, revision], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const changed = files.filter(file => !isReleaseMaintenance(file));
  if (changed.length) throw new Error(`Application inputs changed; publish a new patch version: ${changed.join(', ')}`);
}
