# HAICoMo 0.3.5 — User manual (UK English)

> Candidate documentation: 0.3.5 is not published until both platforms pass acceptance. Current downloads remain linked from the README.

This is a complete guide to version 0.3.5. Interface translations: UK English, US English, Simplified Chinese and Traditional Chinese. Examples and screenshots are synthetic. Platform evidence is recorded separately in [the compatibility report](TESTING-0.3.5.md).

## 1. Install and update

Open [GitHub Releases](https://github.com/jasonyao486/HAICoMo/releases), choose v0.3.5 and expand Assets. Apple Silicon Mac users download the arm64 DMG; Windows x64 users download the windows-x64-setup.exe. Source-code ZIPs are not installers. Intel Mac, Windows ARM64 and Linux are not verified release targets.

On macOS, open the DMG, drag the app to Applications, eject the image and start the installed app. The formal package is Developer ID signed, notarised by Apple and stapled. A normal downloaded-app Open confirmation may appear; Publication requires fresh-account acceptance without Open Anyway. On Windows, setup installs automatically for the current user; installation, upgrade and uninstall do not request administrator permissions. Existing machine-wide installations require separate handling. The unsigned package may trigger SmartScreen, which is separate from administrator permissions; check the source and checksum before proceeding.

Task management requires no Node.js, Git or AI subscription. Background AI work requires an installed, signed-in client. Updates are manual: stop agents, quit HAICoMo, keep project folders, and replace/reinstall the app. Settings includes Downloads and releases, GitHub feedback and a separate diagnostic export. Diagnostic export does not send anything automatically. The optional custom update-source field is for a separately configured, verified update channel; it is not needed for this release.

If the first launch uses Chinese, open **设置 (Settings) → 语言 (Language)**, choose **English (UK)** or **English (US)**, then select **保存修改 (Save changes)**.

## 2. Create, open and move a project

Choose New project, select a local working folder and save a `.haicomo` entry. One folder contains one project identity. The entry is only a pointer: the hidden `.haicomo/` directory holds the SQLite database, saved snapshot, proposal inbox, events and receipts. Deliverable files are ordinary files in the working folder or explicitly referenced elsewhere. Keep all required files together.

Open an entry using the app or file association. Reopening the same project focuses its tab. Click the HAICoMo logo to return to the window’s home view. Home is not a project tab: repeated clicks create no tabs. Existing project pages and unsaved task or settings drafts remain available. Select a project from the switcher or Recent projects to return to it. Cmd+T/Ctrl+T creates a separate tab; Cmd+W/Ctrl+W closes the current tab, or returns from home to the previous tab. Cmd+Tab/Ctrl+Tab cycles real tabs; add Shift to cycle backwards. Window closing and update preparation check drafts in hidden projects and home Settings too. The top-left switcher lists retained tabs and additional project operations. Unsaved forms can be saved, discarded or kept open when closing a tab. Closing a tab does not stop its agents or pending relays. Use Background tasks to return to them. Quit the app to release all project locks.

Move the complete folder after stopping work and quitting the app. Windows normally refuses to move a folder while its SQLite database is open. Recent entries can be relocated. Ordinary Open does not recreate a deleted entry. Recovery distinguishes a missing entry, retained project history and ZIP backups. A fresh project in a folder whose entry was removed has a new identity; prior data is retained in local history. An independent copy gets a new identity and fresh run, relay and audit history; it does not copy deliverable files.

The project name supplies the default entry filename: `rpi5` → `rpi5.haicomo`. The save dialog can choose another name. Chinese, spaces and valid Unicode are retained; illegal characters become underscores, reserved Windows names gain an underscore prefix, repeated extensions are removed and the stem is limited to 180 UTF-8 bytes. The display name remains unchanged. Existing entries and later title edits are never automatically renamed. Cancelling the save creates no project data.

## 3. Tasks, subtasks and acceptance

Create a task and enter its title, description, dates, assignees, prerequisites, handoff notes and deliverables. Choose a parent to make a subtask. Models and clients are distinct assignments; a client can use an unknown model. Human work is also supported. Saving a human edit applies it immediately; model proposals require review.

Task hierarchy and dependencies cannot contain cycles. A prerequisite stays blocking until human acceptance; a parent cannot be accepted while its children remain unaccepted. “Delivered” means work awaits human review. Open each deliverable, inspect it, then accept or return the task with a reason. Changes affecting an accepted delivery can invalidate acceptance. Archive children before their parent; permanently removing an archived task is blocked while it is still referenced.

Relative deliverable paths use `/` across platforms. Existing Windows separators are recognised. Absolute and parent-directory paths are external references and may not work after moving computers. Relocate those files in the task; HAICoMo does not silently substitute another file.

![Tasks and subtasks](images/0.3.2/tasks.png)

## 4. Revision proposals and file collaboration

Give an agent the location of `.haicomo/AGENTS.md`. It can read the saved snapshot and submit an immutable JSON proposal with a SHA-256 `.ready` marker. HAICoMo ingests valid proposals even if they arrived while the app was closed. File order or a missing acknowledgement is not evidence of success: query the original proposal ID instead of resending under another ID.

In Proposals, filter by status, author, client, task or search text. Open a proposal, inspect all changes, then approve, modify-and-approve or reject. An approval is transactional; revision conflicts or unmet proposal dependencies prevent partial application. Agents cannot approve proposals or accept deliveries through file, CLI or MCP interfaces.

Optional developer CLI: `npm run cli -- read --project /absolute/project`; submit, receipt, status and event commands are documented in [PROTOCOL](PROTOCOL.md). The optional stdio MCP interface offers the same bounded collaboration capabilities. HAICoMo does not change other clients' configuration automatically.

![Proposals](images/0.3.2/proposals.png)

<a id="agent-onboarding"></a>

### 4.1 Connect an agent for the first time

Create or open the working project in HAICoMo first. The app generates the collaboration guide and protocol files inside that project's hidden `.haicomo/` folder. The required directory is the project being worked on, not the HAICoMo application's source repository. The agent must be able to read and write that directory within the authorised task scope; sending a local path to a chat without local file access does not grant access.

Choose either route:

1. **Start in HAICoMo:** choose **Connect an agent** at the top of an open project. Leave the task selector empty for project-level reading and waiting, or select a task to include its ID, title, description and deliverable references. Review the read-only preview and choose **Copy connection instructions**. Paste into a conversation with access to that project directory. Task **Handoff** also supports copying or sending through supported local clients; its automatic connection block always accompanies the editable custom content. Only custom content is saved back to the task. Terminal copy, preview and actual send use the same composition; relay references are resolved at execution time. Copying a prompt or opening a client does not itself send it.
2. **Start in an existing agent conversation:** open the same working directory in a client with local file access, replace the path placeholder in the connection instructions below, and send them. Ask the agent to identify the project and current tasks before assigning work. For a new conversation or a different project, provide the appropriate instructions again; do not assume that another conversation's context was retained.

File collaboration needs no dedicated HAICoMo plugin or additional HAICoMo Node.js installation; the selected agent client has its own requirements. Installing HAICoMo does not register a global `hcm` command, configure MCP, or notify other clients automatically. The optional developer CLI/MCP setup is documented in [PROTOCOL](PROTOCOL.md); it is not required for the following workflow.

HAICoMo maintains the complete English protocol guide in `.haicomo/agent-guide.md`. Existing `.haicomo/AGENTS.md` and root project rules are preserved exactly; a missing `.haicomo/AGENTS.md` receives a pointer. A custom file at the managed-guide path is preserved and reported as a conflict. Resolve the conflict or file-access error before connecting; a failed guide check is not successful connection. The interface and copied instructions follow the selected language. No client configuration, global command, approval or acceptance permissions are added.

<a id="agent-connection-prompt"></a>

### 4.2 Copyable connection instructions

Replace the entire path placeholder with the actual working project's absolute path. The slash-separated file names below are relative to that directory on both macOS and Windows. Preserve existing project instructions; this guide does not expand the agent's file permissions.

```text
This project uses HAICoMo for task management and human review.
Project directory: <absolute path to the working project folder>

Read these files in order:
0. Applicable project rules, including root AGENTS.md if present
1. .haicomo/AGENTS.md, then .haicomo/agent-guide.md — collaboration rules and protocol
2. .haicomo/manifest.json — current project identity and epoch
3. .haicomo/snapshot.json — saved tasks, IDs and entity revisions
4. .haicomo/protocol.schema.json — proposal structure and allowed task fields
5. .haicomo/proposal-example.json — a project-specific example

Read current IDs, epoch and revisions from these files; never invent or reuse
values from another project. New proposals and new tasks need fresh unique IDs.
Submit task, progress and deliverable-record changes as proposals for human review.
Edit actual code and deliverable files only within the authorised task scope.
Never write the HAICoMo database, manifest, snapshot, receipts or generated guide.
Do not approve proposals, accept deliveries or change human-configured relays.
Follow the file protocol: finish the JSON first, then write its exact-byte
SHA-256 .ready marker last. Check the receipt for the same proposal ID;
a missing receipt means unknown, not success.
First summarise the project and relevant tasks. If no task is assigned, await one.
```

<a id="agent-walkthrough"></a>

### 4.3 Synthetic walkthrough: propose, review and accept

Use a new empty local folder with a disposable project named **Agent onboarding demo**. No model account is needed to verify the file protocol with a local test fixture; choosing a real agent client instead uses that client's existing login and permissions.

1. Send the connection instructions through the existing-conversation route. The agent should identify the demo project and report that it has no tasks. This confirms file access, not a completed task.
2. Send the task-creation request below. The agent reads the generated example, uses the actual project identity/epoch, fresh proposal/task IDs, and `expectedRevision: null` for task creation. It writes a proposal and its matching `.ready` file under `.haicomo/inbox/`.
3. Keep the project open, or reopen it after offline submission. In **Proposals**, inspect the new task and choose **Approve**. The task then appears in the task list. The agent reads the original proposal's receipt and waits for `applied` before treating that change as applied.
4. From the new task, use **Handoff** for the delivery request below, retaining the connection instructions. This exercises the HAICoMo-started route. After authorisation, the agent creates `demo-notes.md` in the working folder, rereads the task revision, and submits a new update proposal with `status: "delivered"` and an artifact object `{ "id": "demo-notes", "label": "Demo notes", "path": "demo-notes.md" }`.
5. Inspect and approve that update proposal. Its receipt becomes `applied`, but the task still awaits human acceptance. Open the actual file, check its contents, then choose **Accept delivery** on the task. The agent can reread the snapshot to observe acceptance; the proposal receipt alone does not certify it.

Task-creation request:

```text
Propose a task named "Write demo notes", with status todo and no prerequisites.
Its deliverable will be demo-notes.md containing three brief points about the
synthetic project. Submit only the task-creation proposal, report its proposal ID,
and wait for human approval. Do not create the deliverable yet.
```

Delivery request, after the creation proposal is applied:

```text
Work on the approved "Write demo notes" task. Create demo-notes.md in the project
folder with the three synthetic points. Reread the saved task and its revision,
then submit a new proposal recording the file as an artifact object and marking
the task delivered. Report the new proposal ID. Do not accept the delivery.
```

### 4.4 Markers, receipts and troubleshooting

- Write each proposal as UTF-8 JSON with exclusive creation, flush and close it, then write `.haicomo/inbox/<proposalId>.ready` last. Its contents are the lowercase SHA-256 hex digest of the exact JSON bytes. A JSON file without a marker is not ready; a marker is not approval.
- Read `.haicomo/receipts/<proposalId>.json`: `pending` means received and awaiting review, `applied` means approved changes were applied, and `rejected` means the proposal was rejected. Missing means unknown; check the project, marker and app state, then query the same ID. Never issue a new proposal merely because a receipt is missing.
- Preserve submitted JSON and markers. The same ID with identical bytes is an idempotent retry; changed contents require a fresh ID. If a revision conflict occurs, reread the task and bring it to human review; do not overwrite the original submission.
- A delivery record is a file reference, not a copy of the file. Human proposal approval applies management changes; human delivery acceptance follows inspection of the actual work. Neither is granted by agent completion or animation.
- If the guide is missing or inaccessible, check the project folder and open it in HAICoMo; do not recreate a database or guess project IDs. Review and remove private content from prompts, paths and files before sharing diagnostics publicly.

## 5. Timeline, dependency graph and mind map

The timeline shows task dates. Drag a bar to move it or an edge to resize it; keyboard controls are described on the timeline. Changes retain revision checks.

The dependency graph groups connected tasks into layers; the mind map follows parent–child hierarchy. Disconnected groups are packed together. Use Fit to view for an overview, zoom for text, and drag an empty area or scroll to navigate. Enter or Space on a focused node opens its task. Long titles wrap, with the complete title available as a tooltip. Ten tasks with five children each are covered by layout tests; they need not all be readable simultaneously at overview scale.

Company logos at the right of a node reflect explicitly assigned model families. Duplicates are removed; extra companies appear as a count with a tooltip. Unknown client models do not acquire a guessed company logo.

![Timeline](images/0.3.2/timeline.png)

## 6. Local agents and handoff

Settings → Local agents detects the available clients. An empty path enables automatic detection; set an explicit path only when needed. Codex and Claude Code support background handoff using the existing local login. Available model, effort and permission-mode choices depend on the installed client. HAICoMo does not buy subscriptions, collect model keys or silently switch billing.

Open Handoff from a task. Choose client, model, effort, mode and an optional existing session. Review the prompt and referenced deliverables. Copying a prompt, opening a client, and sending in the background are separate actions. Other clients use foreground commands or file collaboration; opening a GUI is not proof of prompt delivery.

Codex requests for permission or user answers appear in the app and require explicit responses. Claude background mode cannot answer interactive permission prompts; continue in the foreground or select an appropriate supported permission mode. Permission bypass is not offered. Cancel stops an app-managed run; End tracking does not stop an external process or accept work. Lost or stale telemetry remains unknown.

## 7. Relay tasks (experimental)

Create a relay and select a preceding run, or None for a timer only. Choose a delay or a date/time, the target task, reference-delivery task, client/model/effort/mode, session and prompt. The preview shows the prompt structure; deliverable references are resolved when the relay fires. Save enabled to schedule it, or paused to store it without execution.

A relay starts once after both conditions are met. It does not accept results. Chained relay results cannot be selected as predecessors. Scheduled and paused items can be edited; firing/fired items cannot. Blocked, missed and failed items require review and an explicit Run now or corrected rescheduling; there is no automatic retry.

Relays require HAICoMo to be running with the project loaded. A closed tab can remain loaded in the background. Quitting or sleeping through the due time can cause a missed relay after the grace period. Check Background tasks before switching computers. The visual view shows a three-person workstation and a two-seat sofa in enhanced mode; reducing motion or hiding the view stops animation.

![Relay](images/0.3.3/relay-claude-chatgpt.png)

Synthetic demonstration: a test CLI keeps Claude running at the workstation; ChatGPT sits on the sofa waiting for relay. The relay is paused and no model account is invoked.

With no relays, Table view retains its empty message. Visual view shows one unoccupied workstation and sofa row, followed by the same message; it creates no relay or agent work.

## 8. Studio, statistics, notes and activity

The collaboration studio uses default figures or enhanced characters. Task desks, standby areas and hobbies illustrate observed states. Dragging characters changes presentation only. Unknown telemetry is not successful execution. The mode switch changes visuals, not project state.

Statistics count participation, proposals, handoffs and observed run duration. Copied prompts are counted separately from actual handoffs. Unobserved time and external conversations are not invented. Notes and meeting minutes can be edited in the project.

Activity summaries show a short role (Human, Claude, System or Unknown model), action, task context and date. Reviewed proposals show the author and reviewer, such as Claude → Human. Names, full model versions and original author text remain in expanded details. Only structured identities or an explicit identity in an old proposal snapshot identify a model; client names and descriptive text are not guesses. This display change does not rewrite old records or statistics. The delete button to the right of the date opens a confirmation. Confirming permanently deletes that one record from the current project; it does not undo the operation, alter approval/acceptance or reduce historical return statistics. Cancellation changes nothing. Existing backups are unchanged and restoring an older backup can bring back its old records. This is record deletion, not a promise of secure disk erasure.

## 9. Backup, migration and cloud storage

Export a backup ZIP before moving machines or significant changes. It contains management data, inbox and events; it does **not** contain source code or deliverable files. Back those up separately. Restore into an empty folder; retain originals until validation succeeds. Projects from 0.3.1 already use schema v5 and require no migration. Opening a pre-0.3.1 project creates a pre-v5 backup before migration. Do not reopen the migrated project with older apps.

For a cloud drive or Git checkout: stop runs and disable/pause pending relays, quit HAICoMo, wait for a complete sync or commit/push, then fully download/pull on the other computer. Keep files available locally. Do not pull, switch branches or merge `project.sqlite` while the project is open. If conflicts occur, preserve both copies and restore a chosen consistent version.

A GitHub URL cannot be opened as a live project. Copying only the `.haicomo` entry is insufficient. Live NAS/SMB/NFS SQLite databases and simultaneous writers are not supported; use local working copies. A foreign lock can be taken over only after confirming that the other computer is no longer using the project. The lock is not distributed synchronisation. See [SQLite's network-file guidance](https://www.sqlite.org/useovernet.html).

## 10. Settings, privacy and licences

Settings controls display name/initials, four languages, theme/accent, enhanced visuals, reduced motion, client paths and project preferences. The sidebar toggle and `version 0.3.5` are beneath the app logo. When collapsed, the switcher shows a centred 19px folder icon and Background tasks shows a matching terminal icon. Hover or focus for the control name; click to open the menu or background list. The collapse state is shared by home and project tabs in the same window. Feedback opens GitHub; sanitise all attachments before submission.

Code: MIT. Characters: separately permitted non-commercial use/distribution, with ZipZipPipe attribution. Whale character: original 上善无形 → ZipZipPipe → application adaptation, CC BY-NC-SA 4.0. Environment furniture: CC BY 4.0. Third-party dependencies and logos retain their own licences and trademark ownership. No endorsement is implied. See [asset permissions](../ASSET-LICENSES.md) and [third-party notices](../THIRD-PARTY-NOTICES.md).

## 11. Troubleshooting

| Problem | Action |
|---|---|
| Missing entry | Relocate the entry or explicitly recover it; do not delete the hidden database |
| Revision conflict | Reopen the current task/proposal and reapply the intended change |
| Blocked task | Review and accept its prerequisites and children as appropriate |
| Unknown run | Check the client; do not infer completion from silence |
| Missing deliverable after switching OS | Relocate external files; relative Windows separators are supported |
| Missed or failed relay | Inspect the reason and prompt before explicit execution |
| Automatic update source missing | Use Downloads and releases; this release uses manual installation |

For unresolved issues, report version, OS/architecture and a synthetic reproduction through [GitHub Issues](https://github.com/jasonyao486/HAICoMo/issues/new/choose). Never attach an unsanitised project database or credentials.
