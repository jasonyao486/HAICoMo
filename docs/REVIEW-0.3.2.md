# Application review — 0.3.2

This patch changes presentation and window navigation. It leaves project schema v5, proposal/entry protocols, human approval boundaries and execution adapters unchanged. Review evidence is in [TESTING-0.3.2.md](TESTING-0.3.2.md); earlier architectural findings remain in [the 0.3.1 review](REVIEW-0.3.1.md).

| Scenario | Review focus and conclusion |
|---|---|
| No agent / task management | Home and recent projects remain usable without a client/account. Logo navigation does not accumulate tabs. |
| Single or multiple projects | The dedicated home frame has no project binding. Returning to an existing project reuses its mounted frame, page and draft. Shared sidebar state is per window. |
| Multiple agents / permission waits | Home does not close project bindings or cancel runners. Background entry remains available; existing permission routing and relay tests are rerun. |
| Offline proposals / conflicts | Transaction and revision guards are unchanged. Short activity roles use explicit identity while expanded details preserve original provenance. |
| Unknown model / legacy activity | Client or author names are not evidence of family. Legacy proposal actor snapshots are read only; there is no history rewrite. |
| Close / upgrade / recovery | Hidden project and home settings drafts participate in preflight. Optional home restoration is compatible with old records. Manual installation remains the public channel. |
| Small window / languages / themes | Four languages, two themes, collapsed/expanded states have measured layout checks and actual screenshots. |
| Failure / crash / data recovery | Existing database, rollback, backup and identity tests remain required. This patch adds no distributed storage or background OS service. |

Known limits: agents' declared identities are not authentication; deletable activity is not an immutable compliance log. NAS and simultaneous cloud-sync database writers are unsupported. A retained draft is in-memory until saved, so an OS crash can still lose it. The current release is not signed/notarised for a trusted automatic-upgrade channel. Windows human acceptance remains separate from CI.
