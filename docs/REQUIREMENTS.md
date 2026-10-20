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
| RELAY-01 | Claim before start, missed/failed human recovery (the one-step limit was lifted in 0.5.0, see RELAY-02) | Relay suites and Electron fixture execution |
| ART-01 | Desk and sofa in existing style with user revisions; 0.5.0: three-seat sofa at the desk's visible width | Manifest hashes, ART production record, actual relay light/dark captures; 0.5.0 sofa is a spliced placeholder pending a new painting |
| ART-02 | Only release-cleared runtime materials packaged | `check-assets.mjs`, Vite publicDir, clean-clone and package content checks |
| LEGAL-01 | MIT source, separate characters/marks, dependency notices | Root LICENSE, ASSET-LICENSES, THIRD-PARTY-NOTICES, four-language Settings |
| LINK-01 | GitHub Releases/Issues and separate diagnostics | Fixed shared allowlist, unit and offline Electron external-link tests |
| DOC-01 | UK/US English, simplified/traditional Chinese full manuals | Four USER-MANUAL-0.3.3 files; aligned locale key test |
| DOC-02 | Bilingual README, installation SOP, at least seven actual screenshots | README pair, shared English home capture in `docs/images/0.3.4`, retained synthetic demo images; [capture and source checks](TESTING.md#shared-english-home-screenshot-and-source-synchronisation--2026-10-08) |
| DOC-03 | Two agent connection routes, copyable instructions and a reviewed-delivery walkthrough | Bilingual README links to four 0.3.3 manuals, sections 4.1–4.4; isolated file-protocol and desktop walkthrough verified on 2026-10-08; no automatic client configuration implied |
| DEV-SYNC | Preserve Mac and Windows work in shared source history | AGENTS and CONTRIBUTING require start/pre-push fetch, integration without history rewriting, and post-push ancestry verification; Windows 0.3.4 source and tag confirmed locally on 2026-10-08 |
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

## 0.3.4 Windows installation and publication

| ID | Requirement | Evidence/status |
| --- | --- | --- |
| WIN-034 | Install the accepted Windows artifact locally before publishing the identical bytes | Main CI 37675096047 passed all Windows gates; current-user 0.3.3 upgrade and version/shortcut/association checks passed locally, preserving all 58 existing profile-file hashes. Installed desktop suite 25/25, background handoff 3/3 and real Codex file/resume/cancel passed |
| PUB-034 | Keep historical downloads and separate platform recommendations | Publication 37677874919 passed; anonymous downloads match installed SHA-256, and all 8 v0.3.3 attachments retain names/sizes/digests. Windows recommendation is 0.3.4; signed/notarised Mac remains 0.3.3 |

See [0.3.4 Windows acceptance, failure analysis and screenshot](TESTING-0.3.4-WINDOWS.md). Remaining provider limitations and unobserved native mouse interactions remain explicit.


## 0.3.5: entry names and agent onboarding

- New GUI projects derive a portable default entry filename from the validated title; the dialog remains editable. Old entries/title edits are not renamed. Shared filename cases plus lifecycle/e2e tests cover Unicode, reserved names, length, conflict, cancellation and reopening.
- Project-level connection and optional task context use four-language prompts. Handoff and relay share composition while storing only custom content. Agent authority remains submit-only, never approve/accept.
- The complete English guide is `.haicomo/agent-guide.md`; existing project rules and `.haicomo/AGENTS.md` are preserved. Conflicts and access failures prevent claiming successful connection.
- Evidence: `tests/agent-onboarding.test.ts`, `tests/e2e/v035.spec.ts`, `tests/e2e/upgrade.spec.ts`, `tests/mac-release.test.ts`; [version verification](TESTING-0.3.5.md). Both native automated release gates passed; the maintainer confirmed this version's requested fresh-account browser first-open acceptance on 2026-10-08 and authorised joint publication. [v0.3.5](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.5) is public on both platforms; the publication workflow passed anonymous download/hash verification.

## 0.4.0: in-app updates, project search and client icons

| ID | Requirement | Implementation / evidence |
| --- | --- | --- |
| UPD-01 | Built-in official source: GitHub releases including previews; choose the highest version whose platform metadata and package are both uploaded | `src/core/release-feed.ts` (constant feed URLs, ETag, Atom fallback on rate limits); `tests/v040.test.ts` selection/resolver cases |
| UPD-02 | Explicit two-step update: download with progress, speed, remaining time and cancel; restart and install only on a second click | `src/core/updates.ts`, `src/ui/UpdatePanel.tsx`; controller cancel/verify cases; `tests/e2e/updates.spec.ts` official-source flow |
| UPD-03 | Automatic checks (launch + 12 h) only notify and can be turned off; development runs never contact a server | `autoCheckUpdates` setting, `main.ts` scheduler; e2e banner and zero-request assertions |
| UPD-04 | Explain installations that cannot replace themselves before downloading | `src/core/update-preflight.ts`; preflight table tests |
| UPD-05 | Releases carry `latest-mac.yml`/`latest.yml` generated from the final signed files, uploaded last and gated by hash/size | `scripts/update-metadata.mjs`, release/publish scripts and workflows; `tests/mac-release.test.ts` 0.4.0 gate |
| UPD-06 | Real replacement on both platforms | Windows CI run 37982128168: installed 0.4.0 updated in-app to a 0.4.1 fixture (differential download, installer relaunch, restore). Mac: local signed trial (success and tampered-signature rejection) and the development Mac's own 0.3.5 → 0.4.0 in-app update between public Developer ID releases; see [TESTING-0.4.0](TESTING-0.4.0.md) |
| SEARCH-01 | Overview search spanning the three cards, above tasks/team, with four scopes (Everything also covers notes) | `src/ui/ProjectSearch.tsx`, `src/ui/search-model.ts`; `tests/e2e/v040.spec.ts` geometry, scopes, opening results, four locales, both themes |
| SEARCH-02 | Revisions searched in the database across title, reason, review note, author and proposed text values, never JSON keys | `store.queryProposals` term clauses; `tests/v040.test.ts` |
| ICON-01 | Official WorkBuddy application icon on macOS and Windows; CodeBuddy colour mark | `assets/manifest.json`, `clientIcon()`; asset check, unit and e2e image checks |

## 0.4.1: settings scrolling and update cache

| ID | Requirement | Implementation / evidence |
| --- | --- | --- |
| UI-SCROLL-041 | Pages end at their last section: the window itself never scrolls and no element is positioned against it | `.workspace-frame` is the positioned, overscroll-contained scroll container; `tests/e2e/v041.spec.ts` checks every page, wheel scrolling past the end, keyboard focus on the last link and scrolling back up (fails without the fix) |
| UPD-07 | After an installed update, macOS removes the payload and any `update.zip` left by older updaters; Windows keeps `installer.exe` for differential downloads | `updateCacheLeftovers()` in `src/core/updates.ts`; unit case and the journal-restore case in `tests/e2e/update-safety.spec.ts` (fails without the fix) |

## 0.5.0: background agents, three-stage relays and unattended mode

| ID | Requirement | Implementation / evidence |
| --- | --- | --- |
| AGENT-DETECT-05 | Detect Kimi (CLI + desktop), Grok Bot, DeepSeek Harness, Gemini CLI and Qwen Code next to the existing ten clients, with ids distinct from model families | `src/shared/clients.ts` (`kimi-code`, `grok-bot`, `deepseek-harness`, `gemini-cli`, `qwen-code`), reused LobeHub marks; `tests/adapters.test.ts`, `tests/e2e/tabs.spec.ts` (15 client rows) |
| AGENT-BG-05 | Every client with a headless CLI can run in the background; enabled only when its own help names the flags; arguments are arrays; evidence level shown | `src/providers/adapters.ts` (`ADAPTERS`, `requiredHelp`, jsonl/text readers), `src/providers/local.ts`; `tests/adapters.test.ts` with Kimi, DeepSeek, Gemini and Copilot fixture dialects. Live (2026-10-16): Cursor and DeepSeek Harness (account route, `deepseek-flash`) completed real runs through HAICoMo and a Cursor → DeepSeek relay; Kimi help and error path only (quota exhausted). See TESTING-0.5.0 |
| RELAY-02 | Up to 3 stages × 3 parallel tasks; next stage only after every run of the current one delivered; no review between stages; acceptance untouched; dependency exemption only for earlier stages of the same relay | `src/shared/relay.ts` (`relayProgress`, `relayNext`, `assertRelayStepRunnable`, `composeRelayStepPrompt`), store commands (`relay.claim/stepFired/stepFailed/stageFired/completed`), `src/electron/relay.ts`; `tests/relay-stages.test.ts`, `tests/e2e/v050.spec.ts` |
| RELAY-03 | Stopped tasks block their stage; retry only the stopped tasks (optionally in the previous session) or mark handled; never automatic; interrupted claims never re-sent | `relay.retry`, `relay.overrideStep`, INTERRUPTED via `inFlight`; unit cases for cancel/retry, start failure, interrupt, needs-human; e2e cancel → blocked → retry button |
| RELAY-04 | v5 → v6 migration: backup once, one stage of one step per old relay, honest status mapping, rollback on failure | `upgradeRelayV5`, store v6 block; migration case in `tests/relay-stages.test.ts`; schema assertions in v2/v031/lifecycle/agent-onboarding |
| AUTO-01 | Unattended mode only with per-relay consent; clients' own autonomous flags; Codex questions answered with the recommended option, approvals accepted except destructive commands; human-only steps pause the relay with a notification | `src/shared/autonomy.ts`, `RunOptions.autonomous` guard, `main.ts` permission handler and `Notification`; `tests/autonomy` cases in `relay-stages.test.ts`, `tests/adapters.test.ts` consent guard, e2e auto-answer |
| AUTO-02 | Decision record per relay: automatic answers, self-reported (unverified) decisions and human items, rebuilt from the database | `relayDecisionReport`, `.haicomo/relay-decisions/`, relay page dialog with open/export; unit and e2e checks |
| RELAY-UI-05 | Text mode shows the whole flow; visual mode: desk and sofa equal width, desk = working stage, one three-seat sofa per waiting stage | `src/ui/Relay.tsx`, `src/ui/RelayEditor.tsx`, `src/ui/figures.tsx` (`FURNITURE_WIDTH`, `SLOT_FRACTIONS`); e2e 3×3 geometry checks and screenshots |
| DETECT-06 | Detection results last for the app session (all pages, tabs and windows), reset only on quit; optional background detection at launch (off by default); edited paths mark a row stale; concurrent detections share one run | `lastDetection`/`runDetection` in `main.ts`, `providers.detection`, `detection` broadcast, `autoDetectAgents` setting; `tests/e2e/v050.spec.ts` (leave and return, stale path, launch detection) |
| DETECT-07 | A client that disappeared or changed after detection is caught before any start, with a translated reason naming the client; sign-in/quota failures pause a relay as "needs you"; relay steps warn when the latest detection marks their client unavailable | `prepareStart` re-check, `EXECUTABLE_MISSING` in the runner, `CONFIGURED_PATH_NOT_FOUND`/`EXECUTABLE_FAILED`, `humanBlocker`, `clientUsable`; unit cases in `adapters`, `providers`, `relay-stages`; e2e vanished-client refusal |

## After 0.5.0: release diagnostics and test timing

| ID | Requirement | Implementation / evidence |
| --- | --- | --- |
| REL-DIAG-05 | A failed Mac release stage names the failing signing check without exposing credentials | `toolFailure` and `isSafeReleaseError` in `scripts/mac-release-state.mjs`; `check`/`assess` in `scripts/release-mac.mjs`, with one retry for `stapler validate` and `spctl --assess`; `tests/mac-release.test.ts` covers redaction, refusing notarytool/security, truncation and the safe prefixes. Prompted by the undiagnosed `finalize` (run 39028470032) and `package` (run 39030052278) failures. Not yet exercised by a real CI failure |
| TEST-POLL-05 | E2E checks of files written by a UI save wait for that save | `tests/e2e/v032.spec.ts` polls `snapshot.json` and the saved settings; Windows main run 39028470032, attempt 1 (job 117384026985) read the snapshot before the task save committed |

## 0.6.0: ACP and host permissions, delivery records, return with comments, relay working copies

| ID | Requirement | Implementation / evidence |
| --- | --- | --- |
| AGENT-HERMES-06 | Detect Hermes (Nous Research) as a 16th client; background over ACP when its help lists `acp`, else a documented one-shot query | `CLIENTS`/`HARNESS_IDS`/`ADAPTERS.hermes`, LobeHub `nousresearch.svg` registered in the manifest; `tests/v060.test.ts` (detection with and without `acp`, CLI run) |
| UI-ORDER-06 | Every client list a person reads is sorted A–Z by English name; internal order and stored data unchanged | `CLIENTS_BY_NAME` in Settings, handoff, relay editor, records filter and return dialog; `tests/v060.test.ts`, `tests/e2e/v060.spec.ts` (Settings row order, dialog options) in four locales |
| UI-NAV-06 | Relay → Timeline has the same gap as Mind map → Office | `nav-separator` on `timeline`; e2e measures both gaps (≤ 1 px apart) |
| ACP-01 | Clients whose installed help names an ACP entry run over ACP: handshake without fs/terminal capabilities, session new/load, model/effort/mode via session config, prompt, cancel with `stopReason: cancelled` | `src/providers/local.ts` (`startAcp`, `acpMessage`, `acpEnded`, `cancel`), `adapters.ts` (`acp`, `ACP_LAUNCHES`); fixture ACP server; live Kimi 2.2.0 handshake and session creation (2026-10-20) |
| ACP-02 | Before anything is sent, an ACP session that cannot honour a request or fails its handshake falls back to the headless path; a required sign-in is reported | `startAcp` returns null / `ACP_AUTH_REQUIRED`; unit cases for an unknown model, session load, sign-in refusal |
| ACP-03 | ACP and Claude host prompts reach the permission dialog; human answers pick one-time options; unattended answers use `autoDecide` (never "always", destructive and out-of-project actions declined) and are recorded | `permissionSummary`/`PermissionDialog`, `respond()`, `autoDecide()` branches; unit cases in `tests/v060.test.ts` |
| ACP-04 | A turn that ends with no reply and no tool call is not a delivery | `ACP_EMPTY_TURN` in `acpEnded`; found live: Kimi 2.2.0 with an exhausted plan ends ACP turns silently. Unit case asserts failure and a human blocker |
| HOST-01 | Claude Code with `--permission-prompts` and `--input-format` runs on its host channel: stream-json input, `can_use_tool` answered in HAICoMo, interrupt certifies cancellation, denials made in HAICoMo are not "permission" ends | `ADAPTERS.claude.hostPermissions`, `hostControl()`, `cancel()`; fixture `claudehost`; live: detection with 2.1.290 and the expired-sign-in failure path (success path pending a fresh login) |
| RECORD-01 | Task prompts ask for a HAICOMO-HANDOFF block (goal, artifacts, evidence, next, open questions); it is parsed from the final message, shown read-only with path checks, can add found paths as deliverables, and replaces the long excerpt for later relay stages | `structuredHandoff`, `withoutHandoff`, `composeAgentPrompt`, `composeRelayStepPrompt`, `DeliveryRecord`, `artifact.exists`; unit and four-locale e2e |
| RETURN-01 | "Request changes" requires comments, returns the task, and sends the comments to the delivering agent (continuing its session when possible) or another agent chosen A–Z, or copies the prompt, or only records the return | `ReturnDialog`, review section in `composeAgentPrompt`; unit (prompt, audit, return count) and e2e (validation, Codex `thread/resume` with the comments, status `doing`) |
| WT-01 | In git projects, steps of a stage with two or more steps work in their own worktree under `.haicomo/worktrees`; readiness (commit, branch, no operation in progress, clean tracked files excluding HAICoMo's own) is checked first | `src/core/worktree.ts` (`prepareWorktree`, `assertReady`, `ensureIgnored`), scheduler `worktree` hook, `relay.stepFired` worktree payload, store path guard; unit cases on real temporary repositories |
| WT-02 | A completed stage is committed and merged (`--no-ff`) step by step before the next stage; a conflict is aborted, blocks the relay and keeps the branch; "continue" retries and accepts a branch the human already merged | `relayNext` `merge` action, `relay.stepMerged`, `mergeWorktree`, relay page actions; unit (real conflict, abort, manual merge, identity, dirty tree) and scheduler integration |
