# Local agent adapters — 0.5.0

HAICoMo uses installed local clients and their existing login state. It does not acquire API keys, change accounts or silently switch billing. This document describes implemented capabilities; current test evidence is in [TESTING-0.5.0.md](TESTING-0.5.0.md), not a blanket promise about every upstream version.

Background launch is data-driven (`src/providers/adapters.ts`). An adapter is enabled only when the installed CLI's own help output names every flag it relies on (`requiredHelp`); otherwise the client falls back to manual handoff with `HEADLESS_FLAGS_NOT_FOUND`. Each client carries an evidence level shown in Settings and the relay editor.

| Client | Background path (arguments as arrays) | Unattended flag (consented relays only) | Evidence |
|---|---|---|---|
| Codex | App Server stdio; models, effort, mode, permission questions, cancel, resume | `on-request` + workspace sandbox; HAICoMo answers requests | verified (earlier releases) |
| Claude Code | `-p --output-format stream-json`, stdin prompt; model, effort, mode, resume | `--permission-mode auto` (never `bypassPermissions`) | verified (earlier releases) |
| Cursor Agent | `cursor-agent -p --output-format stream-json … --workspace <dir> <prompt>`; modes default/plan/ask; resume | `--force --approve-mcps` | local: help and logged-out error path on the development Mac |
| Kimi (Kimi Code CLI) | `kimi --prompt <p> --output-format stream-json`; modes default/plan/ask-when-needed (`--yolo`); `--session`, `--model`; searched in `~/.kimi-code/bin` | `--auto` (never ask) | local: help and quota-exhausted error path; success path unverified |
| DeepSeek Harness | `dsh --profile headless --json [--session-id] -`, stdin prompt; bundled shim inside `DeepSeek Harness.app`; `DSH_PERMISSION_MODE` = workspace-write (default) / read-only | workspace-write kept (sandboxed) | local: help and missing-API-key error path; headless needs a DeepSeek API key |
| CodeBuddy | Claude-compatible stream-json | `auto` if listed, else `acceptEdits` | documented |
| Qoder CLI | `qodercli --print <p> --output-format stream-json` | `--yolo` if listed | documented |
| Gemini CLI / Qwen Code | `--prompt <p> --output-format stream-json --approval-mode default/auto_edit` | `--approval-mode yolo` | documented |
| OpenCode | `opencode run --format json [--session] <p>` | none (follows OpenCode's own permission config) | documented |
| GitHub Copilot CLI | `copilot --prompt <p>` (plain text) | `--allow-all-tools` | documented |
| Pi | `pi --print --mode json <p>` | Pi has no permission system: only usable in consented unattended relays | documented |
| Grok Bot, WorkBuddy, TRAE, Kimi desktop | No headless interface: detection, opening the app and copying the prompt | — | — |

"Documented" means the adapter follows the vendor's published headless flags and the help-text gate; it has not been run against a real installation. When the help gate passes but a vendor changes its event format, the generic readers still end the run on the process exit code and keep stdout/stderr as the message.

Windows limits a command line to 32,767 characters: clients that take the prompt as an argument refuse prompts longer than 24,000 characters (`PROMPT_TOO_LONG_FOR_ARGV`) instead of truncating them.

Models, clients, family avatars and session identities are separate. The actual model is recorded when known; otherwise the client keeps an unknown-model identity. Graph company marks are based only on explicit task model assignments.

## Launch and state

Providers receive executable plus argument arrays rather than interpolated shell commands. Windows npm `.cmd` shims resolve their JavaScript entry and use the runtime's Node mode; Unix uses executable scripts. User paths may include spaces and Unicode. Authentication stays in the client's existing credential system.

Starting remains unknown until acknowledged. A clean process exit without a protocol result is not success. Current and historical sessions have explicit lifecycle/end reasons. Only observed runner intervals count as work time; self-reported file events cannot manufacture trusted runner telemetry. Cancellation is not acceptance or proof that all external child activity has ended.

Human permission answers remain explicit. Multiple questions can be outstanding; callbacks are bound to the original project ID/epoch/binding. Closing a tab does not cancel its retained runner. Unknown sends are not automatically repeated after a worker or transport failure.

## File and MCP collaboration

All clients with filesystem access can read snapshots and submit immutable proposals with ready markers. Optional CLI/MCP use this same boundary. No agent endpoint approves proposals, accepts deliveries or deletes human audit activity. See [PROTOCOL](PROTOCOL.md).

## Verification scope

The release suites use local fixtures (Codex app-server, Claude stream-json, Kimi role lines, DeepSeek session/status/final events, Gemini message deltas, Copilot plain text) to exercise parsing, permissions, lifecycle, cancellation, path resolution and scheduling without sending paid work. Real account login expiry, third-party service changes, installed-version capability catalogues and Windows behaviour of the new adapters require separate native acceptance.

Upstream interfaces: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude CLI](https://code.claude.com/docs/en/headless). Capability discovery remains the authority at runtime when a particular field is unsupported.
