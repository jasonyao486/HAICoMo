# Verification record — 0.3.1

Date: 7 October 2026. Tests use disposable projects and isolated Electron profiles. Public screenshots use synthetic data. Private raw logs remain outside the source repository; native CI retains its own artifact evidence.

## Execution record

<!-- TEST_EVIDENCE_START -->
| Check | Result |
|---|---|
| Local host | Apple Silicon ARM64, macOS 27.0 (26A428); isolated Node 24.21.0, Electron 44.5.1 |
| Type check / curated assets | Passed; 86 allowed runtime files |
| Unit tests | 75 passed, 0 failed |
| Source Electron scenarios | 19 passed, 0 failed |
| Packaged Mac Electron scenarios | 19 passed, 0 failed |
| Mac DMG/ZIP and ad-hoc integrity | `hdiutil verify`, `unzip -tq` and `codesign --verify --deep --strict` passed |
| Packaged application content | 9,756 application/dependency files scanned locally; all 86 runtime asset hashes match; no recognised private content found |
| Clean source clone | Fresh `npm ci`, public-file scan, build/type check, 75 unit tests and the 60-task Electron demo passed without private reference folders |
| DMG installation simulation | Mounted read-only, copied to an isolated application directory, ejected, verified signature and passed both fresh-profile desktop scenarios |
| Public source index | 244 files; excluded-path, recognised credential-pattern, personal-path and relative Markdown-link checks passed |
| Production dependency audit | `npm audit --omit=dev`: 0 reported vulnerabilities at the evidence date; not a guarantee of absence |
| Native GitHub matrix | [Run 37602609681](https://github.com/jasonyao486/HAICoMo/actions/runs/37602609681) passed on both platforms from source `5893593fe4c56d40226a2eab8a4186c725fa7819` |
| Native macOS 15.7.9 ARM64 | 75/75 unit tests; source 19/19; packaged 19/19; DMG and ZIP built |
| Native Windows Server 2025 x64 | 73 unit tests passed, 2 Mac-only cases skipped, 0 failed; source 19/19; packaged 19/19; NSIS built and silently installed; installed 0.3.1 demo passed |
| Package comparison | Both platforms scanned 9,756 files; the installed Windows ASAR matches its unpacked build; all 86 curated asset hashes match on both platforms |
| Public download round trip | Pending release assets |

The private raw evidence directory is `validation/0.3.1/`. The source test harness initially omitted the required project binding for its direct IPC calls; the app correctly returned `NO_PROJECT`. The harness now supplies the bootstrap binding. Older fixed-delay screenshot checks were replaced with explicit renderer readiness and mode checks; obsolete link-count and migration-count assertions were updated for the intentional additions. Local source tests and the clean public clone were rerun with an isolated official Node 24.21.0 download whose SHA-256 was checked; the machine's global Node installation was left unchanged.
<!-- TEST_EVIDENCE_END -->

## Behaviour covered

The Windows test host initially crashed with exit code `3221226505` while copying a disposable Unicode project directory under Node 24.12.0. A controlled [two-runtime diagnostic run](https://github.com/jasonyao486/HAICoMo/actions/runs/37600672114) ran the same two desktop cases against the same source: Node 24.12.0 crashed after one pass; Node 24.21.0 passed both. CI and development requirements now use 24.21.0, matching the Node version already embedded in Electron. This records the observed test-host failure and does not claim an upstream root cause.

Final native logs are linked from the successful run: [Mac job](https://github.com/jasonyao486/HAICoMo/actions/runs/37602609681/job/112730374396), [Windows job](https://github.com/jasonyao486/HAICoMo/actions/runs/37602609681/job/112730374798). The curated manifest SHA-256 is `0b737fb963b38cafc35ade8bbedc027a4af3b94465d5a7283f27ba682bbe3456`. Mac ASAR: `50de8af6c4af95b93c3a9d471eb82822a4002f7964539234437e1aa38d0591a2`; Windows ASAR: `77b44092d8eac314a42b2b2e06ff61a13756de2f711340c0c1ffc2d819a67efe`. Platform-specific packages differ; their source revision and runtime artwork match.

The final local Mac installer was rebuilt from that same source. Its ASAR hash exactly matches the CI Mac application. Its DMG checksum, ZIP contents and ad-hoc signature passed inspection. The release uses the native CI installer files; local installation simulation and the publisher's anonymous public-download checks are separate evidence, not a claim that a person completed a quarantined browser download and every OS warning.

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
