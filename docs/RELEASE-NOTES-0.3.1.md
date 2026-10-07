# HAICoMo 0.3.1 — pre-release

- Added confirmed deletion of individual activity records. Schema v5 stores historical return counts separately and backs up before migration. Deleting activity does not reverse work or alter old backups.
- Reworked dependency and mind-map layout, with zoom, fit, pan, long titles and company marks for explicitly assigned models.
- Moved sidebar collapse/version below the logo and removed the personal preview label.
- Added a laptop/extended-monitor desk and front-facing two-seat sofa. Empty relay Visual mode previews an unoccupied scene in either style; Table mode keeps its existing message.
- Normalised deliverable references across Mac/Windows and labelled external references.
- Added GitHub Releases and Issues links, MIT source licensing, separate asset permissions and dependency notices.
- Added a curated asset build, native Mac ARM64/Windows x64 CI, bilingual README, four complete manuals and synthetic application screenshots.

Downloads are manual. Mac packages are ad-hoc signed and not notarised; Windows has no publisher signature. Windows human desktop acceptance remains pending. See the [platform report](COMPATIBILITY-0.3.1.md) and [test evidence](TESTING-0.3.1.md).

Keep the `.haicomo` entry, hidden data directory and actual deliverables together when moving projects. Stop work and exit before syncing. Live NAS databases and simultaneous multi-computer editing are not supported. Do not reopen a migrated v5 database with an older application; restore its pre-migration ZIP to an empty folder instead.
