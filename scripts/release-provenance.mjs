/** A platform job must pass; an unrelated job may have failed in the same run. */
export function verifyPlatformRun(run, jobs, platform, repository) {
  const windows = platform === 'windows';
  if (run.status !== 'completed' || !['success','failure'].includes(run.conclusion)
      || run.head_branch !== 'main' || !['push','workflow_dispatch'].includes(run.event)
      || run.path !== '.github/workflows/verify.yml' || run.head_repository?.full_name !== repository
      || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) throw new Error(`Trusted completed ${platform} verification required`);
  const name = windows ? 'desktop (windows-2025, windows, x64)' : 'desktop (macos-15, mac, arm64)';
  if (!jobs.some(job => job.name === name && job.conclusion === 'success')) throw new Error(`${platform} native verification missing`);
}
