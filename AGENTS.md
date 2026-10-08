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

### Synchronise work across macOS and Windows

The two development machines share this repository. At the start of work, inspect the current branch, working tree and remote URL, then run `git fetch origin --prune --tags` and compare the local branch with its remote counterpart. Before starting changes for `main`, include the latest `origin/main`.

If only behind, fast-forward with `git merge --ff-only origin/main`. If both sides have new commits, merge the remote changes and retain both sides' intent; ask only when a conflict leaves product behaviour unclear. Preserve existing uncommitted work before integrating changes. Do not use hard resets, force pushes or whole-file replacement to resolve divergence, and do not rewrite published commits or release tags.

Fetch again immediately before pushing. Integrate any newly arrived changes and repeat checks affected by the integration. If an ordinary push is rejected because the remote advanced, repeat this process instead of forcing it. After pushing, verify the remote commit and that both machines' relevant commits are ancestors of the result; report the final commit and any remaining difference. Synchronisation covers the complete cross-platform source and tags, not installation of the other platform's binaries. These rules also apply to feature branches using their actual remote counterpart.

### Deliver updates to the current development computer

After implementing and verifying a new application version, upgrade the installed HAICoMo on the current development computer as part of delivery. Downloading/installing the verified native package is the agent's responsibility; do not leave the user on an older app or require a manual repository download for ordinary local updates. Use the exact accepted candidate/release artifact for this operating system and architecture, verifying its hash and platform signing requirements. A candidate may be installed locally before public release; identify its candidate status explicitly and retain the independent publication gates.

Preserve projects, settings and databases, keep a verified recoverable backup of the replaced app, and never force-quit active work. If an active session, account authentication or OS permission blocks installation, identify the precise remaining user action. After replacement, verify the installed path/version and launch it with an isolated synthetic profile; do not run tests against real projects. Clean up expanded build/test apps and obsolete registrations so only the intended installed copy remains in the application list. Report source-push status, public-release status and the actual locally installed version separately. A fresh-account browser first-open acceptance test remains distinct from this local update and must not be claimed from installation alone.

### Build and verification

Node 24.21+ and npm. `npm ci`; `npm run dev`; `npm test`; `npm run typecheck`; `npm run test:e2e`; `npm run pack`.
SQLite uses the runtime's built-in `node:sqlite` with a single writer, FULL synchronous rollback-journal transactions. Do not enable WAL without reviewing runtime SQLite support and backup guarantees.

Use disposable test directories and isolated Electron userData. Never run tests against the user's actual projects or agent conversations. Live provider smoke tests must use a dedicated temporary directory/session and no destructive tool requests.
Keep `en-US`, `en-GB`, `zh-CN`, `zh-TW` key sets aligned. Do not mark Windows tests as passed based on a macOS build. Keep generated/local-reference assets separated from release-cleared assets.

Before finishing: run checks appropriate to changed behavior, inspect actual desktop screenshots, update the requirement/evidence register, and verify the draft checksum.

Ordinary open must never regenerate a removed entry. Scope IPC and runner events to the original ID/epoch/binding. Keep current vs historical execution separate from task acceptance. Default to one window with retained project tabs; closing a tab must not cancel its runners.
