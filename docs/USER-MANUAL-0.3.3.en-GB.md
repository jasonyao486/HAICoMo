# HAICoMo 0.3.3 — User manual (UK English)

This is a complete guide to version 0.3.3. Interface translations: UK English, US English, Simplified Chinese and Traditional Chinese. Examples and screenshots are synthetic. Platform evidence is recorded separately in [the compatibility report](TESTING-0.3.3.md).

## 1. Install and update

Open [GitHub Releases](https://github.com/jasonyao486/HAICoMo/releases), choose v0.3.3 and expand Assets. Apple Silicon Mac users download the arm64 DMG; Windows x64 users download the windows-x64-setup.exe. Source-code ZIPs are not installers. Intel Mac, Windows ARM64 and Linux are not verified release targets.

On macOS, open the DMG, drag the app to Applications, eject the image and start the installed app. The formal package is Developer ID signed, notarised by Apple and stapled. A normal downloaded-app Open confirmation may appear; Open Anyway was not needed in fresh-account acceptance. On Windows, setup installs automatically for the current user; installation, upgrade and uninstall do not request administrator permissions. Existing machine-wide installations require separate handling. The unsigned package may trigger SmartScreen, which is separate from administrator permissions; check the source and checksum before proceeding.

Task management requires no Node.js, Git or AI subscription. Background AI work requires an installed, signed-in client. Updates are manual: stop agents, quit HAICoMo, keep project folders, and replace/reinstall the app. Settings includes Downloads and releases, GitHub feedback and a separate diagnostic export. Diagnostic export does not send anything automatically. The optional custom update-source field is for a separately configured, verified update channel; it is not needed for this release.

If the first launch uses Chinese, open **设置 (Settings) → 语言 (Language)**, choose **English (UK)** or **English (US)**, then select **保存修改 (Save changes)**.

## 2. Create, open and move a project

Choose New project, select a local working folder and save a `.haicomo` entry. One folder contains one project identity. The entry is only a pointer: the hidden `.haicomo/` directory holds the SQLite database, saved snapshot, proposal inbox, events and receipts. Deliverable files are ordinary files in the working folder or explicitly referenced elsewhere. Keep all required files together.

Open an entry using the app or file association. Reopening the same project focuses its tab. Click the HAICoMo logo to return to the window’s home view. Home is not a project tab: repeated clicks create no tabs. Existing project pages and unsaved task or settings drafts remain available. Select a project from the switcher or Recent projects to return to it. Cmd+T/Ctrl+T creates a separate tab; Cmd+W/Ctrl+W closes the current tab, or returns from home to the previous tab. Cmd+Tab/Ctrl+Tab cycles real tabs; add Shift to cycle backwards. Window closing and update preparation check drafts in hidden projects and home Settings too. The top-left switcher lists retained tabs and additional project operations. Unsaved forms can be saved, discarded or kept open when closing a tab. Closing a tab does not stop its agents or pending relays. Use Background tasks to return to them. Quit the app to release all project locks.

Move the complete folder after stopping work and quitting the app. Windows normally refuses to move a folder while its SQLite database is open. Recent entries can be relocated. Ordinary Open does not recreate a deleted entry. Recovery distinguishes a missing entry, retained project history and ZIP backups. A fresh project in a folder whose entry was removed has a new identity; prior data is retained in local history. An independent copy gets a new identity and fresh run, relay and audit history; it does not copy deliverable files.

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

Settings controls display name/initials, four languages, theme/accent, enhanced visuals, reduced motion, client paths and project preferences. The sidebar toggle and `version 0.3.3` are beneath the app logo. When collapsed, the switcher shows a centred 19px folder icon and Background tasks shows a matching terminal icon. Hover or focus for the control name; click to open the menu or background list. The collapse state is shared by home and project tabs in the same window. Feedback opens GitHub; sanitise all attachments before submission.

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
