# Local agent adapters — 0.6.0

HAICoMo uses installed local clients and their existing login state. It does not acquire API keys, change accounts or silently switch billing. This document describes implemented capabilities; current test evidence is in [TESTING-0.6.0.md](TESTING-0.6.0.md), not a blanket promise about every upstream version.

Background launch is data-driven (`src/providers/adapters.ts`). An adapter is enabled only when the installed CLI's own help output names every flag it relies on (`requiredHelp`) or an ACP entry point; otherwise the client falls back to manual handoff with `HEADLESS_FLAGS_NOT_FOUND`. Each client carries an evidence level shown in Settings and the relay editor.

## Channels (0.6.0)

Detection also decides how a client is driven; Settings shows the channel on each row.

- **ACP** (Agent Client Protocol, JSON-RPC 2.0 over stdio). Used automatically when the installed CLI's help names an ACP entry: an `acp` subcommand, `--acp` or `--experimental-acp`. HAICoMo sends `initialize` (no file-system or terminal capability: the agent uses its own tools), `session/new` (or `session/load` to continue a session the agent can load), optionally `session/set_config_option` for model and thought level, and `session/set_mode`, then `session/prompt`.
  - `session/update` message chunks form the final message; tool calls are logged.
  - `session/request_permission` reaches the same permission dialog as Codex. HAICoMo answers with a one-time option, never "always" automatically.
  - `session/cancel` ends the turn with `stopReason: cancelled`.
  - If the session cannot honour a requested model, effort, mode or session, or the handshake fails, HAICoMo closes it before sending anything and uses the client's headless path. A sign-in the agent asks for is reported as `ACP_AUTH_REQUIRED`.
  - A turn that ends with no reply and no tool call is reported as failed (`ACP_EMPTY_TURN`). Kimi 2.2.0 behaves this way when its plan is exhausted.
- **Claude host channel.** When the installed Claude Code lists `--permission-prompts` and `--input-format`, HAICoMo runs `-p --input-format stream-json --output-format stream-json --permission-prompts host`.
  - It writes the prompt as one stream-json user message and keeps stdin open.
  - It answers `control_request` `can_use_tool` with `control_response` (allow with the original input, or deny).
  - It cancels with an `interrupt` control request.
  - The message shapes follow the Agent SDK 0.3.304 type definitions.
- **Command line.** Everything else, as in 0.5.0.

In consented unattended relays, ACP and host-channel prompts are answered by `autoDecide()` instead of passing the client's own "allow everything" flag. Commands go through the same destructive-command check as Codex. Deletions or writes outside the project are declined. Prompts forced by the user's own ask rules, or with no one-time option, stay with the human.

| Client | Background path (arguments as arrays) | Unattended handling (consented relays only) | Evidence |
|---|---|---|---|
| Codex | App Server stdio; models, effort, mode, permission questions, cancel, resume | `on-request` + workspace sandbox; HAICoMo answers requests | verified (earlier releases) |
| Claude Code | Host channel when listed (see above), else `-p --output-format stream-json`, stdin prompt; model, effort, mode, resume; `--add-dir` for relay working copies | Host channel: `--permission-mode default`, HAICoMo answers; otherwise `--permission-mode auto` (never `bypassPermissions`) | verified (earlier releases, command line). Host channel: detection and the sign-in failure path checked live with 2.1.290 on 2026-10-20; the success path waits for a fresh login (see TESTING-0.6.0) |
| Cursor Agent | `cursor-agent -p --output-format stream-json … --workspace <dir> <prompt>`; modes default/plan/ask; resume | `--force --approve-mcps` | verified 2026-10-16: a real run through HAICoMo completed (model "Auto", session id recorded) |
| Kimi (Kimi Code CLI) | ACP via `kimi acp` when listed; otherwise `kimi --prompt <p> --output-format stream-json`; modes default/plan/ask-when-needed (`--yolo`); `--session`, `--model`, `--add-dir`; searched in `~/.kimi-code/bin` | ACP: HAICoMo answers; command line: `--auto` (never ask) | local: ACP `initialize`/`session/new` live with 2.2.0 (model options offered); turn content unverified because the monthly quota is exhausted |
| DeepSeek Harness | `dsh --profile headless --patch <private overlay> --json [--session-id] -`, stdin prompt; bundled shim inside `DeepSeek Harness.app`; `DSH_PERMISSION_MODE` = workspace-write (default) / read-only. The overlay selects the account route (the desktop app's provider, normally `deepseek-account`) and the model: the step's model, or the desktop app's current default when empty | workspace-write kept (sandboxed) | verified 2026-10-16 on the account route with `deepseek-flash`; the account accepts `deepseek-flash` and `deepseek-v4-pro` |
| CodeBuddy | ACP via `--acp` when listed; else Claude-compatible stream-json | ACP: HAICoMo answers; else `auto` if listed, otherwise `acceptEdits` | documented |
| Qoder CLI | ACP via `--acp` when listed; else `qodercli --print <p> --output-format stream-json` | ACP: HAICoMo answers; else `--yolo` if listed | documented |
| Gemini CLI / Qwen Code | ACP via `--acp` / `--experimental-acp` when listed; else `--prompt <p> --output-format stream-json --approval-mode default/auto_edit` | ACP: HAICoMo answers; else `--approval-mode yolo` | documented |
| OpenCode | ACP via `opencode acp` when listed; else `opencode run --format json [--session] <p>` | ACP: HAICoMo answers; else none (OpenCode's own permission config) | documented |
| GitHub Copilot CLI | ACP via `--acp` when listed; else `copilot --prompt <p>` (plain text) | ACP: HAICoMo answers; else `--allow-all-tools` | documented |
| Hermes (Nous Research) | ACP via `hermes acp` when listed; else `hermes chat --quiet [--model] --query <p>` (plain text) | ACP: HAICoMo answers; command line: none | documented (not installed on the development Mac) |
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

The release suites use local fixtures (Codex app-server, Claude stream-json and its host control channel, an ACP server with permissions, cancellation, session loading, model options and an empty turn, Kimi role lines, DeepSeek session/status/final events, Gemini message deltas, Copilot and Hermes plain text) to exercise parsing, permissions, lifecycle, cancellation, path resolution and scheduling without sending paid work. Real account login expiry, third-party service changes, installed-version capability catalogues and Windows behaviour of the new adapters require separate native acceptance.

Upstream interfaces: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude CLI](https://code.claude.com/docs/en/headless), [Agent Client Protocol](https://agentclientprotocol.com) (schema v1, release schema-v1.26.0), [Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp). Capability discovery remains the authority at runtime when a particular field is unsupported.
