# 0.4.1 verification status

Status: local macOS verification passed; native CI, fresh-account first-open acceptance and publication pending. Nothing here is claimed for Windows from a Mac run. Synthetic projects and isolated profiles only.

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

## Pending

- Native CI on both platforms, including the Windows in-app update of the installed 0.4.1 to a next-version fixture.
- Fresh-account browser first-open acceptance of the exact DMG, then publication.
- The local review build is replaced by the published 0.4.1 bytes after publication.
