# 0.3.2 requirement and evidence register

Implementation and verification are separate. Platform acceptance is recorded in [COMPATIBILITY-0.3.2.md](COMPATIBILITY-0.3.2.md); current commands/results are in [TESTING-0.3.2.md](TESTING-0.3.2.md). Earlier private handoffs are retained locally, not published as current evidence.

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
| DOC-01 | UK/US English, simplified/traditional Chinese full manuals | Four USER-MANUAL-0.3.2 files; aligned locale key test |
| DOC-02 | Bilingual README, installation SOP, at least seven actual screenshots | README pair, synthetic demo and `docs/images/0.3.2` |
| PUBLIC-01 | Clean public repository, no private history/data/keys | .gitignore, index/file scan, curated initial commit, clean clone |
| RELEASE-01 | Native Mac ARM64 and Windows x64 package/automation | GitHub matrix; complete NSIS and DMG/ZIP; per-platform evidence |
| RELEASE-02 | Manual pre-release, correct download choices and SHA-256 | Releases page, checksum script, compatibility report |
| REVIEW-01 | Scenario review, stranger simulation, gap/platform reports | REVIEW, FIRST-RUN, GAP-ANALYSIS, COMPATIBILITY documents |

Pending external evidence remains explicit: Windows human desktop acceptance; Apple Developer ID/notarisation and Windows publisher signing; real signed automatic replacement; unsupported architectures/OS versions. The original local brief remains immutable.

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
| MAC-033 | Developer ID, hardened runtime, notarization, stapling and Gatekeeper required for release | Developer ID signing completed; Apple notarization In Progress; final Gatekeeper acceptance pending |
| WIN-033 | Current-user install/run/reinstall/uninstall without elevation | Passed native Windows CI with a real non-admin token, upgrade/reinstall/uninstall and retained-data checks |
| PRIV-033 | No signing credentials in Git or release attachments | Expanded ignore/scanning rules; regression tests passed; release scan pending |

See [0.3.3 verification](TESTING-0.3.3.md). Existing acceptance evidence is not retroactively changed.
