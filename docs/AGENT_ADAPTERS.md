# Local agent adapters — 0.3.1

HAICoMo uses installed local clients and their existing login state. It does not acquire API keys, change accounts or silently switch billing. This document describes implemented capabilities; current test evidence is in [TESTING-0.3.1.md](TESTING-0.3.1.md), not a blanket promise about every upstream version.

| Client | Implemented path | Boundary |
|---|---|---|
| Codex | App Server stdio; capability/model discovery, background handoff, supported effort/mode, permission questions, cancellation, explicit session continuation | No arbitrary GUI-session injection; no unsupported speed flag; uncertain send is never automatically retried |
| Claude Code | Local CLI stream-json; discovery, supported model/effort/mode, background handoff and cancellation | Non-interactive permission denial requires human handling or foreground work; no permission bypass |
| WorkBuddy, Pi, Copilot, OpenCode, Cursor, TRAE, Qoder, CodeBuddy | Installed-client registry, configured path, open/foreground and project file protocol | Detection/opening is not background control; unsupported send/resume/cancel capabilities stay disabled |

Models, clients, family avatars and session identities are separate. The actual model is recorded when known; otherwise the client keeps an unknown-model identity. Graph company marks are based only on explicit task model assignments.

## Launch and state

Providers receive executable plus argument arrays rather than interpolated shell commands. Windows npm `.cmd` shims resolve their JavaScript entry and use the runtime's Node mode; Unix uses executable scripts. User paths may include spaces and Unicode. Authentication stays in the client's existing credential system.

Starting remains unknown until acknowledged. A clean process exit without a protocol result is not success. Current and historical sessions have explicit lifecycle/end reasons. Only observed runner intervals count as work time; self-reported file events cannot manufacture trusted runner telemetry. Cancellation is not acceptance or proof that all external child activity has ended.

Human permission answers remain explicit. Multiple questions can be outstanding; callbacks are bound to the original project ID/epoch/binding. Closing a tab does not cancel its retained runner. Unknown sends are not automatically repeated after a worker or transport failure.

## File and MCP collaboration

All clients with filesystem access can read snapshots and submit immutable proposals with ready markers. Optional CLI/MCP use this same boundary. No agent endpoint approves proposals, accepts deliveries or deletes human audit activity. See [PROTOCOL](PROTOCOL.md).

## Verification scope

The release suites use local fixtures to exercise parsing, permissions, lifecycle, cancellation, path resolution and scheduling without sending paid work. Real account login expiry, third-party service changes, installed-version capability catalogues and Windows foreground behaviour require separate native acceptance. Earlier private live trials are not republished or represented as fresh 0.3.1 evidence.

Upstream interfaces: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude CLI](https://code.claude.com/docs/en/headless). Capability discovery remains the authority at runtime when a particular field is unsupported.
