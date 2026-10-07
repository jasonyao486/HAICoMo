import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const id = process.env.RESUME_RUN_ID;
if (!id) process.exit(0);
if (!/^\d+$/.test(id)) throw new Error('Invalid resume run ID');
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const api = route => JSON.parse(execFileSync('gh', ['api', `repos/${process.env.GH_REPO}/${route}`], { encoding: 'utf8' }));
const run = api(`actions/runs/${id}`);
if (run.head_branch !== 'main' || !['push', 'workflow_dispatch'].includes(run.event) || run.path !== '.github/workflows/verify.yml' || run.head_repository?.full_name !== process.env.GH_REPO) throw new Error('Only a trusted main verification run can be resumed');
execFileSync('git', ['fetch', 'origin', run.head_sha]);
const artifacts = api(`actions/runs/${id}/artifacts?per_page=100`).artifacts.filter(a => !a.expired);
const name = artifacts.some(a => a.name === `mac-candidate-${version}-packaged`) ? `mac-candidate-${version}-packaged` : `mac-candidate-${version}-prepared`;
if (!artifacts.some(a => a.name === name)) throw new Error('Saved Mac candidate is missing');
const destination = path.resolve(`release/${version}/mac-checkpoint`);
fs.mkdirSync(destination, { recursive: true });
execFileSync('gh', ['run', 'download', id, '-n', name, '-D', destination], { stdio: 'inherit' });
const progress = artifacts.filter(a => a.name.startsWith(`mac-progress-${version}-`)).sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
if (progress) {
  fs.rmSync(path.join(destination, 'state.json'), { force: true });
  execFileSync('gh', ['run', 'download', id, '-n', progress.name, '-D', destination], { stdio: 'inherit' });
}
console.log('Saved Mac candidate restored; hashes and source are validated by the release stage.');

// A cancellation between packaging and uploading cannot leave a resumable DMG
// submission: submitting is strictly after the packaged artifact upload.
const statePath = path.join(destination, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
if (name.endsWith('-prepared') && state.dmg && !state.dmg.id && !fs.existsSync(path.join(destination, state.dmg.file))) {
  delete state.dmg; delete state.zip;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}
