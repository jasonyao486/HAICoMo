# 0.5.0 verification status

Status: **local macOS candidate, not published.** Implemented and verified on the development Mac (Apple Silicon) on 2026-10-15 on the local branch `dev/0.5.0`. Windows builds, native CI, notarisation and the fresh-account first-open check have not been run for 0.5.0; nothing here is claimed for Windows. Synthetic projects, fixture agents and isolated profiles only; no real Codex or Claude session was started.

## Changes

- **Agents.** Detection adds Kimi (`kimi-code`), Grok Bot (`grok-bot`), DeepSeek Harness (`deepseek-harness`), Gemini CLI (`gemini-cli`) and Qwen Code (`qwen-code`). Background launch moved to a data-driven adapter table (`src/providers/adapters.ts`) covering twelve clients; each is enabled only when the installed CLI's help names the flags it needs. See [AGENT_ADAPTERS](AGENT_ADAPTERS.md).
- **Relays (schema v6).** Up to 3 stages × 3 parallel tasks with automatic hand-over between stages; stopped tasks block their stage; retry / mark handled; interrupted claims never re-sent; v5 → v6 migration with backup.
- **Unattended mode.** Per-relay consent, clients' own autonomous flags, Codex questions answered with the recommended option, destructive commands declined, human-only steps pause with a notification, decision record.
- **Relay page.** Text view is a full flowchart; visual view seats the working stage at the desk and each waiting stage on its own three-seat sofa; desk and sofa have equal visible width. The enhanced three-seat sofa is a spliced placeholder (see [ART](ART.md)).

## Local macOS results (Apple Silicon, 2026-10-15)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run check:assets` | Passed; 86 runtime assets (sofa hash updated) |
| `npm test` (each file run separately) | 131/131 passed in 23 files, including new `adapters.test.ts` (8), `relay-stages.test.ts` (10) and updated relay/schema assertions |
| `npx playwright test` (source build) | 31 passed, 4 skipped (Windows-only, installed-upgrade and Windows in-app scenarios) |
| New `tests/e2e/v050.spec.ts` | Builds A1 + A2 → B1 in the editor with unattended consent; fixture Codex asks a question, HAICoMo answers "Safe (Recommended)" and records it; 3 `turn/start` calls, handoff stages 0/0/1, stage-B prompt contains A's results and the unattended instructions; decision record file written. Then a 3 × 3 relay: A1–A3 at the desk, B and C on two sofas (geometry inside each scene), cancelling one A run blocks the relay at stage A with Retry offered and no stage-B start |
| `prd_draft.md` SHA-256 | `da6a5edb…c41c8`, unchanged |
| Screenshots inspected | Relay text flowchart (completed and 3 × 3), visual default and enhanced (1, 2 sofas; blocked), editor flow and unattended consent, decision record; demo relay in light and dark |

## Live checks of locally installed CLIs (no task executed successfully)

Run once each in a temporary directory with a "reply with one word, use no tools" prompt.

| CLI | What was verified | Why the success path is unverified |
|---|---|---|
| Kimi Code CLI 2.2.0 (`~/.kimi-code/bin/kimi`) | Flags (`--prompt`, `--output-format stream-json`, `--yolo`, `--auto`, `--session`, `--model`); first stream line `{"role":"meta","type":"system.version"}`; exit 1 with the error on stderr | The account's monthly quota is exhausted (provider 403) |
| DeepSeek Harness 0.2.0-rc.2 (bundled `dsh`) | `--profile headless --json -` events: `session` (sessionId), `status` phases, `turn_end` with `reason.kind=error`, `final`; exit 1; permission presets via `DSH_PERMISSION_MODE` | Headless needs a DeepSeek API key (`MISSING_CREDENTIAL`); none is configured, and HAICoMo does not obtain keys |
| Cursor Agent 2026.01.23 | Flags (`-p`, `--output-format stream-json`, `--force`, `--approve-mcps`, `--workspace`, `--resume`, `--model`); logged-out error path (exit 1, "Authentication required") | Not logged in on this Mac |
| Grok Bot 0.70.2 | App bundle detected; no command-line interface found | Manual handoff only by design |

Gemini CLI, Qwen Code, CodeBuddy, Qoder CLI, OpenCode, GitHub Copilot CLI and Pi are not installed here; their adapters follow vendor documentation and the help-text gate and are exercised only with fixtures.

## Local candidate installation

See the section appended after installation below.
