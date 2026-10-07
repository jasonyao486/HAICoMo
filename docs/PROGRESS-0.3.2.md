# Progress — 0.3.2

Date: 7 October 2026.

Implemented the four approved UI changes: collapsed entry icons, home copy, independent window home navigation and short activity roles. Home is kept outside the project-tab collection. Retained frames preserve project drafts; a retained home settings form participates in close/update guards. A compatible optional home flag is stored in update restoration records. Project schema stays v5.

Added version-derived package/CI/release paths, role and update-gate unit tests, navigation/layout/activity Electron checks, and updated existing regression cases. Four full manuals and current synthetic screenshots replace the current documentation links; 0.3.1 reports and release remain historical evidence.

Local verification and native release status are recorded in [TESTING-0.3.2.md](TESTING-0.3.2.md). Windows human checks and signing remain separate, unfinished work; see [COMPATIBILITY-0.3.2.md](COMPATIBILITY-0.3.2.md).

Verification passed: local Mac 77 unit and 22 source/22 packaged Electron cases; clean clone 77 unit plus four demo/navigation cases; DMG installation six cases. Native CI passed on Mac ARM64 (77 unit; 22 source/22 packaged) and Windows x64 (75 unit; two Mac-only skipped; 22 source/22 packaged; four NSIS-installed cases). Local canonical Mac 0.3.1 has been archived and replaced with 0.3.2. [0.3.2 pre-release](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.2) is public. [Publishing and anonymous download verification](https://github.com/jasonyao486/HAICoMo/actions/runs/37618269320) passed for all three binaries and their blockmaps. The previous 0.3.1 release remains available. Three post-install canonical Mac navigation cases passed; only the canonical Mac app remains registered.
