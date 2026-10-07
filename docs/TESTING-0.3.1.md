# Verification record — 0.3.1

Date: 7 October 2026. Tests use disposable projects and isolated Electron profiles. Public screenshots use synthetic data. Private raw logs remain outside the source repository; native CI retains its own artifact evidence.

## Execution record

<!-- TEST_EVIDENCE_START -->
Final execution and native package results are being collected. The release is gated on native CI and local Mac verification; unexecuted checks are not counted as passed.
<!-- TEST_EVIDENCE_END -->

## Behaviour covered

- Single writer, project identity/epoch, stale edits, atomic proposal review, parallel and offline inbox submissions, receipt reconstruction and crash recovery.
- Parent/dependency cycle rejection, delivered versus accepted, task returns, metadata/date changes and retained project tabs.
- v4→v5 pre-migration archive; backup failure and in-transaction failure leave old state intact; migration resumes safely. Historic return count initialises once and survives audit deletion.
- Delete cancellation/confirmation, reopen, idempotent command retry, fresh duplicate rejection, cross-project audit IDs, old versus new backups, independent copies, last-page correction and empty pagination. Tasks, approvals and statistics do not change.
- Sixty-node layouts, independent components, many-to-one/cross-layer dependencies, parent centring, long Unicode titles, explicit multiple-model company marks, small viewport and keyboard activation.
- Shared path resolution for slash/backslash relative references, Unicode, parent-directory links and foreign absolute paths.
- Relay once-only claim/start, chain rejection, missed/error paths, permission/cancellation states and target capabilities. Empty visual preview contains no agent and creates no relay; Table view stays unchanged.
- Default/enhanced art, light/dark themes, reduced motion, four locale key sets and offline terms; graphics failure preserves the management UI.
- Fixed allowlisted external destinations; exported diagnostics remain separate. Update fixtures cover source/checksum failures, user-selected download and protected installation boundary, not a trusted signed replacement.

## Reproduce

```sh
npm ci
npm run typecheck
npm test
npm run test:e2e
```

For a package, set `HAICOMO_PACKAGED_EXECUTABLE` to the native executable and run `npx playwright test`. The workflow builds/packages on each native platform and repeats this suite. Screenshots can be directed with `HAICOMO_SCREENSHOT_DIR`; do not upload real user data in traces.

## Release-content checks

`node scripts/check-assets.mjs` checks each allowed file's path, size, hash, provenance and licence; no extra Vite public assets are accepted. The public source index is scanned for private files and credential patterns, and a clean clone is built without local reference folders. Final installer archives and downloaded files are checked separately; matching SHA-256 verifies transport integrity, not publisher trust.

## Limits

No live paid-agent prompts were sent for this patch. Fixtures verify adapter logic, not all third-party service versions. Windows consumer-desktop human tests, macOS 13 minimum-version execution, Intel/ARM64 alternate architectures, physical power loss/disk corruption and signed automatic replacement remain unverified unless explicitly reported in the platform matrix. Previous private-version results are not silently reused as new release evidence.
