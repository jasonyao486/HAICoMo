# 0.4.1 verification status

Status: published. Local macOS verification and both native CI gates passed for commit `6de059d2fd3931fa564cc284da31a4666d277ab4`; on 2026-10-10 the maintainer confirmed fresh-account browser download and first launch of the exact DMG below. [v0.4.1](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.4.1) is public on both platforms; [publication run 38091206691](https://github.com/jasonyao486/HAICoMo/actions/runs/38091206691) passed the release gates and anonymous download verification. The tag points to `6de059d`. Nothing here is claimed for Windows from a Mac run. Synthetic projects and isolated profiles only.

## Changes

- **Settings scrolling.** The page scroll container is `.workspace-frame`. Nine screen-reader-only link labels in the licence section (`.sr-only`, `position: absolute`) had no positioned ancestor, so they were placed against the window, escaped the frame's clipping and stretched the window to 3,038–3,419 px in a 768–828 px window. After the frame reached its end, scrolling continued on the window for 2.7–4.5 blank screens, and a partly scrolled window shifted the whole frame (small top margin, large bottom margin). The frame is now the positioned, overscroll-contained container. A probe of every page (home, overview, tasks, revisions, relays, timeline, dependencies, mind map, office, notes, activity, insights, archive, settings) found no other element positioned against the window before or after the change.
- **Update cache (Mac).** After an installed update is restored, `update.zip` left by earlier updaters is removed together with `pending`; Windows keeps `installer.exe`.

## Local macOS results (Apple Silicon, 2026-10-10)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run check:assets` | Passed; 86 runtime assets |
| `npm test` | 113/113 passed (new `updateCacheLeftovers` case) |
| `npx playwright test` (source build) | 30 passed, 4 skipped (Windows-only, installed-upgrade and Windows in-app scenarios) |
| New `tests/e2e/v041.spec.ts` | Window height equals the viewport and no element is positioned against the window on every page; on Settings with a project, wheel scrolling past the end, keyboard focus on the last licence link and scrolling back up keep the window at 0 and the frame aligned; the frame ends under 100 px below the last section. Failed before the fix (escaped labels), passes after |
| Update cache e2e (`update-safety.spec.ts`) | Restore removes `pending` and, on macOS, `update.zip`; `installer.exe` stays. Failed when the macOS list was reverted to the old behaviour |
| Local review package (`electron-builder --mac --arm64 --dir`, ad-hoc signature, not notarised) | `check-package.mjs` passed; scroll, search, update and update-safety specs 8/8 against the packaged executable |
| Screenshots inspected | Settings end with a project, light and dark |

## Native CI

[Run 38075323328](https://github.com/jasonyao486/HAICoMo/actions/runs/38075323328) on `6de059d`.

| Platform | Results |
|---|---|
| Mac Apple Silicon (job `114280980336`) | Unit 113/113. Electron suites from source, signed candidate and final package: each 30 passed, 4 skipped. Developer ID signature, App/DMG notarisation, stapling and Gatekeeper passed; installed upgrade 0.3.5 → 0.4.1 retained project and settings; `latest-mac.yml` matches the final ZIP |
| Windows x64 (attempt 2, job `114291396033`) | Unit 111 passed, 2 Mac-only cases skipped. Electron suites passed; standard-user install, launch, reinstall, uninstall, retained data and 0.3.5 → 0.4.1 upgrade passed. Real in-app update of the installed 0.4.1 to a 0.4.2 fixture: differential download, installer relaunch, restore |

Attempt 1 of the Windows job failed one test: in the packaged-app suite, the first scenario (`desktop.spec.ts`, real desktop flow) did not show the newly created project within 5 seconds on a cold runner, and closing the app then exceeded the 60-second limit. The same scenario had passed earlier in that job against the source build, in all Mac suites and in both 0.4.0 Windows runs, and 0.4.1 does not change project creation. Only the failed Windows job was re-run; it passed in full. The Mac job and its artifacts are unchanged from attempt 1. The cause of the slow cold start was not identified; it is recorded as a runner flake rather than proven.

Final artifacts (verified on the development Mac against their manifests; `latest*.yml` match their payloads; the DMG passes `stapler validate` and `spctl` as “Notarized Developer ID”):

```
ee5cc543b8f22e7398ea32880c1357a1ad436894ef39a2d5295a3d47a0769caf  HAICoMo-0.4.1-arm64.dmg
26fa730e51af27f5e8e9c1465f7d0d0caf55fd5c80809080549c2ba6ddf657aa  HAICoMo-0.4.1-arm64-mac.zip
54fb04b34c6a00b70029e4aeef0c18d58157744138605cb861f9baa29c11e341  latest-mac.yml
e36ec8a4f7508f1c3de20741e86eff41a30d918266405d2ba98b74a1c1771afc  HAICoMo-0.4.1-windows-x64-setup.exe
```

## Development Mac delivery

`/Applications/HAICoMo.app` was updated from the published 0.4.0 to the published 0.4.1 **through the official GitHub source inside the app** (no custom source), with an isolated synthetic profile: check, download (about 19 minutes on this network), restart and install, Squirrel validation, replacement and native relaunch. This is the first end-to-end update through the built-in official source between public releases. Afterwards the installed `app.asar` matched the release archive hash, strict code signing and Gatekeeper passed, the synthetic tab was restored with the “已更新至 0.4.1” notice, a check against GitHub reported “up to date”, the Settings page ended at its last section with the window height equal to the viewport, and the updater cache was empty. The user's real settings and recent projects were not modified. At the user's request no local copy of 0.4.0 was kept (it remains downloadable from GitHub Releases); only `/Applications/HAICoMo.app` 0.4.1 is installed and registered. The unnotarised local review build was never installed and was removed. Old local build outputs, rollback archives, earlier test evidence, review packages and test caches (about 28.8 GB) were moved to the Trash, listed in the ignored `validation/cleanup-2026-10-10.json`.

The Windows development machine updates itself from 0.4.0 in the app (Settings → HAICoMo → Check for updates); it is not reachable from the Mac.
