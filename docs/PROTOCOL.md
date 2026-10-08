# Agent file protocol v2 (v1 compatible)

The app maintains `.haicomo/agent-guide.md`, `protocol.schema.json` and a project-specific `proposal-example.json` automatically. Read applicable project rules and `.haicomo/AGENTS.md` first. Existing rule files are preserved; only a missing `.haicomo/AGENTS.md` receives a pointer to the full English guide. A conflicting custom `agent-guide.md` is preserved and reported instead of overwritten. These files are the agent's entry point. The envelope schema is generated from the ingestion Zod validator; `$defs.taskValues` describes task values, which are strictly validated when approval is applied.

## Read

Read `manifest.json` for identity/epoch and `snapshot.json` for saved state. Snapshot `revision` and `updatedAt` identify its freshness, not whether the app or agent is live. Each task/note has a separate revision.

Project title/description use `metadataRevision` for `expectedRevision`. This separates metadata conflicts from telemetry updates to the global snapshot revision. Earlier preview snapshots without that field are read as metadataRevision 0.

## Propose

```json
{
  "protocolVersion": 2,
  "projectId": "manifest-id",
  "epoch": "manifest-epoch",
  "proposalId": "unique-id",
  "actor": {"name": "Planning agent", "harnessId": "claude", "family": "claude", "model": "actual-model-id"},
  "title": "Create implementation task",
  "reason": "Approved scope requires a persistence layer",
  "createdAt": "2026-10-05T12:00:00.000Z",
  "dependsOn": [],
  "changes": [{
    "entity": "task", "operation": "create", "id": "new-task-id",
    "expectedRevision": null,
    "values": {"title": "Implement storage", "assignees": ["chatgpt"], "status": "todo"}
  }]
}
```

Write UTF-8 JSON to `inbox/<proposalId>.json` with exclusive creation. Flush and close it. Last, write `inbox/<proposalId>.ready` containing the lowercase SHA-256 hex digest of the exact JSON bytes. Missing ready files are ignored. Same ID + same bytes is a safe retry; changed bytes need a new ID. Do not overwrite a half-written file belonging to another process.

Supported changes: task/note create/update, project update. Update requires current `expectedRevision`; create uses null. Only explicitly provided fields are applied. Agent values cannot set acceptance, archive, revisions or system timestamps. Dependencies are proposal IDs that must already be applied before approval. Within a proposal, changes are evaluated in array order and committed atomically after final graph validation.

## Receipts and conflicts

Read `receipts/<proposalId>.json`: pending, applied or rejected; timestamps, review note, appliedRevision and persisted status. A missing receipt means unknown. A stale proposal stays pending until the person edits or rejects it; no automatic conflict merging. The person can edit the change set, including updating guards after reviewing the current state.

Database commit and exported receipt are distinct. If exporting fails, the database remains authoritative and receipts are rebuilt on reopening. No agent approval endpoint is exposed.

## Runtime events

Submit `events/<id>.json` plus a SHA-256 `.ready` marker. Fields: id, sessionId, nullable family, harnessId, optional avatarId, provider (`external` for a generic agent), actual model string, taskIds, status (`running|waiting|idle|error|unknown`), source (`self-report`), at (ISO timestamp), message and optional threadId. All task IDs must exist. Self-report is not independently verified, and timestamps over one minute in the future are rejected. A running/waiting session without a fresh event for 60 seconds becomes visually unknown.

File access itself is not authentication. The application is local, and files or proposal prose never grant execution permissions.

## Optional MCP

Build first. Use absolute executable, bundle and project paths in the client's supported MCP configuration:

```json
{
  "mcpServers": {
    "haicomo": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/HAICoMo/dist-electron/haicomo-mcp.cjs", "--project", "/absolute/work-directory"]
    }
  }
}
```

Tools: `haicomo_read`, `haicomo_submit_proposal`, `haicomo_receipt`, `haicomo_proposals`, `haicomo_report_event`. Standard output is reserved for MCP framing. Submit uses the same immutable file transport and supports the desktop application being closed. No client configuration is automatically installed. Node is required for the standalone bridge, while the desktop app includes its own runtime.

## v2 identity, migration and incremental receipt

Task assignees are `human`, a model-family ID, or `client:<harnessId>`. A proposal actor has `name`, optional `harnessId`, nullable `family`, actual `model` and optional `avatarId`. A harness is never evidence of the model in use. Events retain the v1 `provider` alias and normalise it with `harnessId`; unknown models retain a client avatar.

Artifacts are objects `{ "id": "readme", "label": "README", "path": "README.md" }`, never strings. Approval does not copy artifact contents; revisions and audited values refer to relative paths.

Opening a v1 database produces `.haicomo/backups/pre-v2.haicomo.zip` before a transactional migration. Failed backup prevents migration; metadata publication can be retried after a committed migration. Identity, epoch, entity revisions, old raw proposal bytes, hashes, receipts and audit remain intact. Unsupported future versions fail visibly.

Desktop startup verifies a batch of up to 200 inbox/events files and continues remaining batches in its utility process. A filesystem watcher and 15-second metadata reconciliation discover additions and changes; unchanged files are not parsed every 1.5 seconds. A proposal's `.ready` file alone never means pending approval: CLI reports `awaitingReceipt`, `pendingReview`, `processed`, `invalidReceipt`, `incomplete`; `pendingFiles` is awaitingReceipt plus pendingReview. Invalid/missing receipts remain unknown.

`project.proposals` accepts page/pageSize, status, author, harnessId, taskId and search. `project.audit` is paginated. UI metrics count full persisted history. These desktop queries do not add approval authority to the CLI or MCP.

## Desktop 0.2.1: database v3 and entry v2

These versions are independent: proposals remain protocol 1/2; the database/snapshot is schema 3; newly created entry files are version 2 and include `projectId` and `epoch`. Existing version-1 entry bytes are read without rewriting. CLI/MCP directory arguments must resolve exactly one existing valid entry. MCP binds identity at connection time; replacing the project requires reconnecting.

Ordinary opening never repairs an entry. New creation after entry deletion archives the old package in `.haicomo-history`, assigns new identity/epoch, and invalidates earlier bindings. Recovery is explicit. The app's database worker alone owns live stores; scoped UI requests include a binding resolved to identity, and runner events carry projectId/epoch/instanceId.

Schema-3 migration writes `backups/pre-v3.haicomo.zip` before committing and audits the transition. Legacy app-owned sessions without a lifecycle move to `history` with `endReason=legacy`; original statuses/messages/measuredMs remain, and an unobserved execution end is not invented. New run events optionally include `lifecycle` (`current|history`), `instanceId`, `endedAt` and `endReason` (`completed|permission|failed|cancelled|lost|legacy|tracking-ended`). Current prior-instance runs absent from the actual registry become unknown/lost. External self-reports remain identifiable and do not certify task acceptance. `session.untrack` is desktop-human-only and audited; it is neither cancellation nor task acceptance.

## Desktop 0.3.0: database v4 and relays

Schema 4 adds `relays` to the project state and snapshot. Relays are human-configured automated handoffs (predecessor run, time condition, client/model/effort/mode/session, target task, prompt). They are **read-only for agents**: proposals cannot create or change them, and no CLI/MCP tool touches them. Opening a v3 project writes `backups/pre-v4.haicomo.zip` before the audited migration. Entry files stay version 2; proposals stay protocol 1/2. The project folder also receives `.gitignore` and `.gitattributes` on first open so lock/backup files are not committed and proposal bytes are never rewritten by line-ending conversion.

`handoff.record` accepts `mode: "relay"` with `relayId`. Run events are unchanged; a relay-started run is an ordinary runner session.

## Desktop 0.3.1: database v5 and deletable activity

Entry v2 and proposal protocol v2 are unchanged. Before migrating database v4, the application writes `backups/pre-v5.haicomo.zip`. The v5 state has `historyStats.acceptanceReturns`, initialised once from existing `task.return` audit entries, then incremented within each return transaction. Metrics no longer recount deletable activity rows.

`audit.delete({ auditId })` is a human desktop command scoped to the existing project identity and transaction guards. It removes exactly one UUID-addressed audit entry, returns `AUDIT_NOT_FOUND` for a different fresh request after deletion, and retains normal same-command-ID idempotency. It cannot be submitted through proposal changes, CLI or MCP. It does not roll back tasks or approvals, alter receipts or change historical return counts. Publication rebuilds receipts from proposal state without recreating deleted audit rows. Old ZIP backups remain unchanged and may restore their historical audit entries.

New deliverable references use `/` separators. Legacy Windows `\` separators are normalised when locating a file or composing manual/relay handoffs. Relative paths refer to the project directory. Absolute or parent-directory references are external; a foreign-platform absolute path requires relinking rather than being interpreted as a relative local file.
