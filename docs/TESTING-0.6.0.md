# 0.6.0 verification status

Status: **local candidate, not published.** 0.6.0 was implemented and verified on the development Mac (Apple Silicon) on 2026-10-20. A Developer ID–signed, not notarised candidate is installed for the maintainer's acceptance. Nothing here is claimed for Windows from a Mac run; Windows evidence will come from native GitHub runners and the maintainer's Windows PC. Tests used synthetic projects, fixture agents and isolated profiles. The live checks below ran in dedicated temporary folders, in a clean environment that did not inherit the development session's `ANTHROPIC_*` or `CLAUDE_CODE_*` variables.

## Changes

- **Clients.** Hermes (`hermes`) added, for 16 clients. Every client list a person reads is sorted A–Z by English name (`CLIENTS_BY_NAME`).
- **Sidebar.** Relay → Timeline has the same gap as Mind map → Office.
- **Channels.** ACP for clients whose installed help names an ACP entry (`src/providers/local.ts` `startAcp`), and Claude's host permission channel (`--permission-prompts host`). Permission prompts from both reach the HAICoMo dialog; unattended relays answer them with `autoDecide`. See [AGENT_ADAPTERS](AGENT_ADAPTERS.md).
- **Delivery records**, **return with comments**, and **relay working copies**. See [PROTOCOL](PROTOCOL.md) and [DECISIONS-0.6.0](DECISIONS-0.6.0.md).
- Schema stays v6.

## Local macOS results (Apple Silicon, 2026-10-20)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run check:assets` | Passed; 87 runtime assets (Hermes mark added) |
| `npm test` (each file run separately) | 147/147 passed in 22 files, including the new `tests/v060.test.ts` (12) |
| `npx playwright test` (source build) | 40 passed, 4 skipped (Windows-only, installed-upgrade and Windows in-app scenarios). The first full run had 3 failures, all assertions that still expected 15 clients; they now follow the client table and pass |
| New `tests/e2e/v060.spec.ts`, in all four locales | Settings rows in A–Z order with Hermes, and Kimi's ACP channel. Sidebar gaps equal (≤ 1 px). Delivery record with a found and a missing path; adding the found path saves it as a deliverable. Request changes: comments required, original agent continues its session (fixture Codex `thread/resume`, prompt carries the comments and the review section), task back to `doing`, other-agent list A–Z. Relay editor defaults to working copies in a git project. Screenshots written to `docs/images/0.6.0/<locale>/` |
| Fixture coverage | ACP: handshake capabilities, streamed reply, end_turn, empty turn, permissions (allow → `allow_once`, deny → `reject_once`), cancel → `stopReason: cancelled`, model set through session config, fallback to the CLI for a model the session lacks, `session/load` without replaying history, sign-in refusal, unsupported client requests answered `-32601`. Claude host: detection, `can_use_tool` allow/deny with the original input, interrupt → cancelled. Worktrees on real temporary git repositories: creation, retry reuse, `.gitignore`, HAICoMo files ignored for cleanliness, `--no-ff` merge, conflict abort with branch kept, manual merge accepted on retry, dirty tree and missing identity refused. Scheduler: working copy in each parallel prompt, merge before stage B, conflict blocks then resumes |
| `prd_draft.md` SHA-256 | `da6a5edb…c41c8`, unchanged |
| Screenshots inspected | Delivery record, return dialog (original and other agent; radio layout fixed during review), Settings A–Z with the ACP channel, relay working-copy option, sidebar gaps; four locales |

## Live checks (2026-10-20)

| Client | What was verified | What is still unverified |
|---|---|---|
| Claude Code 2.1.290 (`~/.local/bin/claude`) | Help lists `--permission-prompts`, `--permission-prompt-tool` and `--input-format`; detection selects the host channel with unattended mode `default`. **Verified end to end** after the maintainer's fresh login, through HAICoMo's runner in a temporary folder:<br>- **Approve**: a Write `can_use_tool` request reached HAICoMo; allowing it created `hello.txt` and the run ended `completed`.<br>- **Deny**: no file was written, Claude reported the decline, and the run ended `completed`.<br>- **Cancel while the prompt was pending**: the run ended `cancelled` and no file was written.<br>Two problems were found and fixed along the way:<br>- Before the fresh login, all three runs failed with "OAuth session expired", and HAICoMo reported the message.<br>- The first runs after the login showed that `--permission-prompts host` alone never asks the host; Claude denied the tool by itself. The Agent SDK also passes `--permission-prompt-tool=stdio`. HAICoMo now does the same, and the fixture reproduces the old behaviour | — |
| Kimi Code CLI 2.2.0 | `kimi acp` listed; real `initialize` (protocol 1, `loadSession`, terminal sign-in method) and `session/new` (session id, model and thinking options) through HAICoMo's runner | The account's monthly quota is exhausted (CLI: 429). Over ACP Kimi then ends the turn at once with no reply and no error; HAICoMo now reports this as `ACP_EMPTY_TURN` (failed) instead of a delivery |
| Hermes | — | Not installed on the development Mac; adapter follows vendor documentation |

Gemini CLI, Qwen Code, OpenCode, GitHub Copilot CLI, CodeBuddy and Qoder CLI are not installed here; their ACP detection follows their documented flags and is exercised only with fixtures. Codex keeps its verified app-server path, and Cursor and DeepSeek Harness keep their verified command-line paths; none of those changed in 0.6.0 apart from `--add-dir` for relay working copies.

## Local candidate installation

| Step | Result |
|---|---|
| Build | `electron-builder` with the same options as `scripts/release-mac.mjs prepare` (arm64 `dir`, hardened runtime), signed with the login keychain's Developer ID Application identity (team `CXWHS9FG9S`), **not notarised**; `codesign --verify --deep --strict` passed |
| Install | `npm run install:local:mac` replaced `/Applications/HAICoMo.app` (0.5.0 official) with the 0.6.0 candidate; the replaced 0.5.0 is kept as `release/archives/app.haicomo.desktop-0.5.0-074ba8f2….zip` for rollback |
| Registrations | One stale LaunchServices entry for an old copy in the Trash was unregistered (files untouched); exactly one registration remains: `/Applications/HAICoMo.app` |
| Installed-app checks | Isolated synthetic profiles: `tests/e2e/v060.spec.ts` (four locales) and `tests/e2e/v050.spec.ts` against the installed executable, 6/6 passed |
| Reinstall after the host-channel fix | Candidate rebuilt from `44ea229` and installed the same way; the bundle contains `--permission-prompt-tool=stdio`; one registration; installed-app checks 6/6 passed again. The 0.5.0 rollback archive is unchanged |

## Pull request CI

| Run | Result |
|---|---|
| [39524605987](https://github.com/jasonyao486/HAICoMo/actions/runs/39524605987) (`ed95114`) | macOS passed. Windows: the unit-test step timed out after 5 minutes (0.5.0 needed 39–72 s) while `tests/v060.test.ts` was running. Two causes:<br>- **Test cleanup order.** The new tests removed their temporary folder before closing the project store. Windows cannot delete open files, so the store and its watchers stayed open and kept the test process alive. The tests now use the existing `temporaryDirectory`/`beforeRemove` helpers.<br>- **A real worktree bug.** Git reports canonical paths, so a project opened through a Windows 8.3 short name, another letter case or a symlink computed a wrong relative path and could not find its folder. `src/core/worktree.ts` now compares real paths, refuses a project outside its repository, and has a regression test (a project opened through a symlink or junction) that fails without the fix |
| [39526869697](https://github.com/jasonyao486/HAICoMo/actions/runs/39526869697) (`79bb4da`) | The Windows hang is gone: 145 passed, 1 failed. The worktree test compared merged file bytes, and the runner's default `core.autocrlf=true` checked them out with CRLF. The test repository now pins `core.autocrlf=false`. Line-ending conversion in a user's repository follows the user's own git configuration |

## Outstanding before publication

1. Maintainer acceptance of the installed Mac candidate.
2. Native Windows runners (verify.yml) and the maintainer's Windows PC with the 0.6.0 installer from the pull request's CI.
3. Merge on GitHub (Verified tag), main-branch signing and notarisation, the maintainer's fresh-account DMG first open, then `publish.yml`.
