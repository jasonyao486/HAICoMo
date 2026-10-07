# HAICoMo — contributor instructions

## Source of truth

- `prd_draft.md` is the immutable original brief. Do not rewrite, reformat or rename it. Baseline SHA-256: `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`.
- `docs/PRD.md` is the accepted product specification. `docs/REQUIREMENTS.md` tracks implementation and evidence. Keep limitations explicit.
- `legacy/` is read-only reference material. Its AGENTS file describes USING that old tool, not developing this app. Do not overwrite it or reuse its monolithic HTML as a new application.
- No cloud publishing, source-video redistribution, model-key acquisition or unrelated user-agent configuration changes are required for local development.

## Architecture boundaries

- `src/shared`: serializable domain types, validation, task graph and model-family aggregation. No Electron or filesystem imports.
- `src/core`: SQLite transactions, immutable file protocol, backup and recovery. Only the database utility process owns live project databases.
- `src/providers`: local CLI adapters. Use executable + argument arrays, never interpolated shell execution. No default permission bypass, no silent API-billing fallback.
- `src/electron`: privileged OS operations, project identity registry, narrow preload IPC. Renderer must remain sandboxed with no Node integration.
- `src/ui`: React management interfaces and Pixi presentation. Animation NEVER changes task or agent execution state.
- File protocol and CLI may submit proposals, never approve or accept. Run events describe execution; they cannot certify delivery acceptance.

## Data invariants

1. Project ID and epoch survive moving a complete project; explicit independent copies get new identity.
2. Entity revisions guard changes. Approval, changes and audit persist in one transaction. A receipt is reconstructible from the database.
3. Agent completion means delivered, not accepted. Human acceptance unlocks prerequisites. Hierarchy and dependencies must remain acyclic.
4. A saved snapshot is labelled as a snapshot. Missing acknowledgements or stale telemetry are unknown, never successful.
5. Agent identity and self-reported telemetry are not authentication. The local workflow is not protection against arbitrary programs with write permission.
6. Never delete live SQLite files, pending proposals or user artifacts to fix tests. Individual audit deletion is an explicit human command; it must preserve business state, statistics and old backups.

## Development

Node 24.12+ and npm. `npm ci`; `npm run dev`; `npm test`; `npm run typecheck`; `npm run test:e2e`; `npm run pack`.
SQLite uses the runtime's built-in `node:sqlite` with a single writer, FULL synchronous rollback-journal transactions. Do not enable WAL without reviewing runtime SQLite support and backup guarantees.

Use disposable test directories and isolated Electron userData. Never run tests against the user's actual projects or agent conversations. Live provider smoke tests must use a dedicated temporary directory/session and no destructive tool requests.
Keep `en-US`, `en-GB`, `zh-CN`, `zh-TW` key sets aligned. Do not mark Windows tests as passed based on a macOS build. Keep generated/local-reference assets separated from release-cleared assets.

Before finishing: run checks appropriate to changed behavior, inspect actual desktop screenshots, update the requirement/evidence register, and verify the draft checksum.

Ordinary open must never regenerate a removed entry. Scope IPC and runner events to the original ID/epoch/binding. Keep current vs historical execution separate from task acceptance. Default to one window with retained project tabs; closing a tab must not cancel its runners.
