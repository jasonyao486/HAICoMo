# 0.3.3 requirement and evidence register

Implementation and verification are separate. Current platform acceptance and test results are recorded in [TESTING-0.3.3.md](TESTING-0.3.3.md). Earlier private handoffs are retained locally, not published as current evidence.

| ID | Requirement | Implementation / evidence |
|---|---|---|
| CORE-01 | Identity, epoch, revision and single SQLite writer | Core/lifecycle/recovery suites; bound multi-window Electron checks |
| CORE-02 | Immutable proposals, offline ingestion, atomic human review | Core, v2 and MCP suites; no agent approval or acceptance |
| CORE-03 | Parent/dependency invariants and human acceptance | Shared graph validation; return/delivery/acceptance tests |
| AUDIT-01 | Confirmed one-record deletion with independent statistics | Records/Activity UI; `audit.delete`; v031 unit and Electron tests |
| AUDIT-02 | v4→v5 backup, rollback, idempotency, reopen, old backups | `historyStats`; v031 and v2 migration/recovery assertions |
| UI-01 | Version below logo, collapse button, no preview label | App/sidebar styles; v024/v031 Electron checks |
| GRAPH-01 | 60 reachable nodes, stable non-overlapping layout | Pure subtree/topological layout; v031 unit and small-window Electron checks |
| GRAPH-02 | Zoom/pan/fit/reset, long titles, explicit owner companies | GraphView/brands; synthetic graph screenshots and assignment tests |
| PATH-01 | Portable references, old Windows separators, external notice | Shared/core path resolver; Unicode and foreign-absolute tests |
| RUN-01 | Truthful local runner states and identity-scoped permissions | Provider fixtures, tabs race/cancellation/background tests |
| RELAY-01 | One-step, claim before start, missed/failed human recovery | Relay suites and Electron fixture execution |
| ART-01 | Desk and sofa in existing style with user revisions | Manifest hashes, ART production record, actual relay light/dark captures |
| ART-02 | Only release-cleared runtime materials packaged | `check-assets.mjs`, Vite publicDir, clean-clone and package content checks |
| LEGAL-01 | MIT source, separate characters/marks, dependency notices | Root LICENSE, ASSET-LICENSES, THIRD-PARTY-NOTICES, four-language Settings |
| LINK-01 | GitHub Releases/Issues and separate diagnostics | Fixed shared allowlist, unit and offline Electron external-link tests |
| DOC-01 | UK/US English, simplified/traditional Chinese full manuals | Four USER-MANUAL-0.3.3 files; aligned locale key test |
| DOC-02 | Bilingual README, installation SOP, at least seven actual screenshots | README pair, synthetic demo and `docs/images/0.3.2` |
| PUBLIC-01 | Clean public repository, no private history/data/keys | .gitignore, index/file scan, curated initial commit, clean clone |
| RELEASE-01 | Native Mac ARM64 and Windows x64 package/automation | GitHub matrix; complete NSIS and DMG/ZIP; per-platform evidence |
| RELEASE-02 | Manual pre-release, correct download choices and SHA-256 | Releases page, checksum script, compatibility report |
| REVIEW-01 | Scenario review, stranger simulation, gap/platform reports | Current TESTING-0.3.3 and GAP-ANALYSIS; earlier review and first-run records remain available at their version tags |

Remaining evidence and scope limits are explicit: broader Windows consumer-device and real CLI coverage, Windows publisher signing, signed automatic replacement, and unsupported architectures/OS versions. Mac signing/notarisation and fresh-account acceptance, plus Windows standard-user-token acceptance, are complete. The original local brief remains immutable.

The final user addition also requires an unoccupied relay preview when no relays exist, with the original empty text below it. The default/enhanced preview screenshots and no-side-effect assertions are in the public-demo Electron case.

## 0.3.2 additions

| ID | Requirement | Evidence |
|---|---|---|
| UI-02 | Centred 19px folder/terminal, no collapsed labels or arrow | v032 Electron: actual bounding boxes, keyboard menus, both themes/four locales |
| UI-03 | Revised home text, 13px descriptor, original title size | v032 Electron: four languages, expanded/collapsed at 1000×720; captured screens |
| NAV-01 | Home outside tab list; repeated logo clicks preserve pages/drafts | v032 Electron: 20 clicks, menu/recent return, task/settings drafts, shortcuts |
| NAV-02 | Hidden drafts guarded on close/update; compatible home restore | v032 unit/Electron and update-safety two-window test |
| AUDIT-03 | Short roles, explicit identity only, full details unchanged | v032 unit/Electron: legacy snapshots, long names, unknown models, record equality |
| RELEASE-03 | Version-derived build, CI, scan and publishing paths | package output macro and ci-version; native verification required before publish |

## 0.3.3 installation and release

| ID | Requirement | Evidence/status |
| --- | --- | --- |
| MAC-033 | Developer ID, hardened runtime, notarization, stapling and Gatekeeper required for release | Formal native run 37648181888 passed signature, App/DMG notarization, tickets, Gatekeeper and all 22 final packaged tests. Owner confirmed fresh-account browser download, first launch and project reopening without Open Anyway on 2026-10-07 |
| WIN-033 | Current-user install/run/reinstall/uninstall without elevation | Passed native Windows CI with a real non-admin token, upgrade/reinstall/uninstall and retained-data checks |
| PRIV-033 | No signing credentials in Git or release attachments | Expanded ignore/scanning rules and regression tests passed; Windows, interim and formal Mac package scans passed; formal verification/publication log scans passed |
| REC-033 | Recover notarization without changing saved candidate bytes or duplicating known submissions | Persisted checkpoints/IDs, source and SHA-256 validation, bounded waits and main-only recovery; regression scenarios passed. Native recovery run 37652293297 reused the original accepted App/DMG IDs and passed all suites |
| PUB-033 | Supplement existing release only with matching application inputs and platform acceptance | Publication 37651600519 passed fixed-tag/build/archive comparisons and the first-open DMG hash gate; anonymous downloads passed and all original Windows hashes were retained |

See [0.3.3 verification](TESTING-0.3.3.md). Existing acceptance evidence is not retroactively changed.

Repository cleanup, the synthetic Claude/ChatGPT relay capture, formal-baseline regression and retained-download verification are recorded in [0.3.3 repository cleanup](REPOSITORY-CLEANUP-0.3.3.md).

## Windows functional validation, 2026-10-07

| ID | Requirement | Evidence/status |
| --- | --- | --- |
| WIN-DISCOVERY | Separate CLI, desktop opening and background capability | Windows Cursor dual-install and Claude MSIX discovery regressions; real desktop launches and Cursor handoff verified |
| WIN-TERMINAL | Open a usable terminal in Unicode/space-containing project paths | Fixed independent PowerShell console; native child remains alive, including ampersand path |
| RUN-CANCEL | Acknowledgement is distinct from actual start and confirmed termination | Queued-start and missing-completion fixture regressions; real Codex cancelled; Claude cancellation remains unknown |
| WIN-SCENARIOS | Verify real files and preserve human acceptance boundary | Real Codex/Claude files and resume, Cursor manual delivery, isolated native Windows scenario evidence |

See [Windows functional evidence and limitations](TESTING-WINDOWS-2026-10-07.md). No post-change Mac execution, publishing or replacement of the everyday installation is implied.

## 0.3.4 release shutdown regression

| ID | Requirement | Evidence/status |
| --- | --- | --- |
| QUIT-034 | Wait for database shutdown acknowledgement before terminating its process | Windows main CI 37669497273 exposed a retained writer lock. A recovered worker fixture delaying shutdown by 2 seconds reproduces the old 1.5-second forced-exit failure; after removing that premature kill and guarding re-entrant quit, the same desktop scenario passes three independent local runs |
| TEST-WIN-PROCESS | Observe and clean up only the test-owned terminal, retaining primary failure diagnostics | The same CI trace revealed a WMI observation timeout hidden by directory cleanup failure. Native Toolhelp snapshots replace WMI; cleanup locates the owned child even after assertion failure and terminates its console tree. Three independent local runs passed without changing assertion timeout |
| TABS-RESTORE-034 | Keyboard navigation uses the current restored tab list even before passive effects replace a listener | Mac CI 37671811094 exposed all restored pages becoming hidden after Ctrl+Tab. Retaining and invoking the initial keyboard callback reproduces the same failure on Windows before the fix; reading the existing current-tabs ref fixes the stale closure. Native and retained-callback forward/reverse navigation remain asserted |
