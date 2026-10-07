# First-use report — 0.3.2

This is an agent-run simulation of a stranger following the public README, not feedback from an independent external user. Disposable projects and isolated profiles are used throughout.

| Step | Evidence / status |
|---|---|
| Choose correct download | README distinguishes Apple Silicon DMG, Windows x64 NSIS and source archives; unsupported architectures have no acceptance claim |
| Download and verify | Public 0.3.2 download round trip is pending publication |
| Install Mac DMG/ZIP | DMG mounted read-only, copied, ejected, signature checked; six installed-app scenarios passed (desktop lifecycle, demo and navigation) |
| Install Windows NSIS | Native NSIS silent install and four installed-app demo/navigation scenarios passed; consumer-desktop human check not performed |
| First launch / change language | Four-locale Electron coverage; task manager requires no AI account |
| Create task/subtask and review a proposal | Desktop and synthetic public-demo scenarios passed on source and packaged apps on both native platforms |
| Navigate home and return | New tests retain task/settings drafts; twenty logo clicks do not add tabs; menus and shortcuts work |
| Inspect activity | Short role in list; full original name/model in expanded details, unchanged stored records |
| Accept, restart, recover | Acceptance, entry lifecycle, backup and update-restoration regression passed on both native platforms |

The README supplies direct installation steps and links to full manuals. The main remaining first-use friction is OS security warnings for unsigned/unnotarised downloads, plus installing and signing into external AI clients for background execution. Neither is hidden by the UI tests. A Windows owner should follow the [manual checklist](COMPATIBILITY-0.3.2.md) with a disposable project and report actual results.
