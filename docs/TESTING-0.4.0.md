# 0.4.0 verification status

Status: local macOS verification and both native CI gates passed for commit `38adc20f0a1db5c0b57a4180ece41da2f5bd9579`. On 2026-10-09 the maintainer confirmed fresh-account browser download and first launch of the exact DMG below. Both platforms are public in [v0.4.0](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.4.0); [publication run 38001128402](https://github.com/jasonyao486/HAICoMo/actions/runs/38001128402) passed the release gates and anonymous download verification. The tag points to `38adc20`. Nothing in this record is claimed for Windows from a Mac run. Synthetic projects, fixture agents and loopback release servers are used throughout; no real project, account or conversation is touched, and no automated test contacts GitHub.

## Scope

- In-app updates: official GitHub release resolver, explicit download with progress/speed/remaining time and cancel, SHA-512 verification, separate restart-and-install, automatic notify-only checks with an off switch, install preflight, release metadata (`latest-mac.yml`, `latest.yml`).
- Project overview search across tasks, revisions, meetings and notes.
- Official WorkBuddy application icon; CodeBuddy colour mark.
- Database v5, entry v2 and proposal v1/v2 are unchanged.

## Local macOS results (Apple Silicon, 2026-10-09)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run check:assets` | Passed; 86 runtime assets verified |
| `npm test` | 112/112 passed, including `tests/v040.test.ts` (release selection, resolver ETag/Atom fallback/errors, controller cancel/verify/mismatch/blocked/development/quiet automatic failure/source change during a check, preflight tables, settings, metadata tamper detection, search model, database revision search, icons) and the 0.4.0 publication-gate case in `tests/mac-release.test.ts` |
| `npx playwright test` (source build) | 29 passed, 4 skipped (Windows-only, installed-upgrade and Windows in-app scenarios). New: official-source update flow with notes, speed, cancel and resume; automatic check banner, off switch with zero requests, rate-limit message; project search geometry, scopes, opening each result kind, Chinese substring, empty results, ⌘F/Esc, narrow window, four locales and both themes; detection list loads the 256 px WorkBuddy icon |
| Native in-app update trial (local, gitignored script) | Locally signed (Apple Development) 0.4.0 → 0.4.1 fixtures; loopback copy of the GitHub release API. Driven through the UI: check, download, cancel, download again, restart and install with an unsaved task edit saved first, Squirrel signature validation, replacement and relaunch as 0.4.1 with three tabs and the “已更新至 0.4.1” notice. Separate run with a tampered update: Squirrel rejected it (“a sealed resource is missing or invalid”), the app showed “无法验证更新签名，已阻止安装。”, stayed on 0.4.0 and remained editable, and no update journal remained. Both runs repeated on the final code |
| Packaged app (local unsigned `npm run pack`) | `check-package.mjs` passed; update, update-safety, public-demo and search specs 8/8 passed against the packaged executable. The expanded package was then unregistered and removed |
| Revision search scale | 5,000 synthetic proposals: multi-term searches over titles, reasons, review notes and proposed values took 25–60 ms |
| `npm run check:public` | 316 tracked files: no excluded paths, credential patterns, personal paths or missing links |
| Screenshots inspected | Overview search empty/results (zh-CN light), en-GB dark, zh-TW and en-US, narrow window; update panel; download progress; downloaded state; native trial before/after; detection list icons |

The native trial proves the mechanism with development-signed fixtures. A replacement between two Developer ID–signed public releases can first be observed when 0.4.0 is published (0.3.5 → 0.4.0 through the bootstrap source) and fully through the official source at the next release.

## Native CI

[Run 37982128168](https://github.com/jasonyao486/HAICoMo/actions/runs/37982128168) on commit `38adc20f0a1db5c0b57a4180ece41da2f5bd9579`.

| Platform | Job | Results |
|---|---|---|
| Mac Apple Silicon | `113994997559` | Unit 112/112. Electron suites from source, signed candidate and final package: each 29 passed, 4 skipped (Windows-only and separately invoked scenarios). Developer ID signature, App/DMG notarisation (`b66fbbcc-7483-4680-9ee5-3eaa22df8b72`, `6666548c-5c1a-44cc-9f01-ad02abf5128d`), stapling and Gatekeeper passed. Installed upgrade 0.3.5 → 0.4.0 retained project and settings. `latest-mac.yml` was generated from the final ZIP and recorded in the report |
| Windows x64 | `113994997610` | Unit 110 passed, 2 Mac artifact-cleanup cases platform-skipped. Electron suites from source and package: each 31 passed, 2 skipped; isolated installed copy 4 passed. Standard-user token: install, launch, reinstall, uninstall, retained data and 0.3.5 → 0.4.0 upgrade passed. **Real in-app update:** the installed 0.4.0 checked a loopback release API, downloaded the 0.4.1 fixture differentially (8 range requests, no full download), restarted through the installer, which relaunched the app itself, and restored as 0.4.1; a machine-wide registration fixture was present and the installer did not stop at a dialog |

Final artifacts (verified again on the development Mac against their SHA-256 manifests; `latest*.yml` match their payloads; the DMG passes `stapler validate` and `spctl` as “Notarized Developer ID”):

```
2469f1c7296be44a698099a8052df54ac1487f82fe9795eb4e08fdc01eeca429  HAICoMo-0.4.0-arm64.dmg
10350b66cac54f72b7de4c292b87e056cc4187a1651d823c055322a5f10f5b49  HAICoMo-0.4.0-arm64-mac.zip
2a65ce6b4cbb62b7d97f4e15439696a08b65c1fb7a511dbc5bc071840a8be426  latest-mac.yml
91488940ac42bdf81793f314a15547d0f659e8e53e238a2861031f891b43cdb4  HAICoMo-0.4.0-windows-x64-setup.exe
90a3642d5c08a627d528c4126a71b311264b050e3a3c38d85aba68d974da24b2  latest.yml
```

## Development Mac delivery

The everyday installation `/Applications/HAICoMo.app` was upgraded from the published 0.3.5 to the published 0.4.0 **through 0.3.5's own in-app updater**, using the bootstrap source and an isolated synthetic profile: check, download from GitHub, restart and install, Squirrel validation of the Developer ID signature, replacement and native relaunch. This is the first replacement between two Developer ID–signed public releases. Afterwards the installed `app.asar` matched the release archive hash (`ba292d68…`), strict code signing and Gatekeeper passed, the update journal restored the synthetic tab as 0.4.0, and a check against the public GitHub releases reported “up to date”. A verified rollback archive of 0.3.5 is kept locally, the user's real settings and recent projects were not modified, only the canonical app remains registered, and the leftover cache copy written by 0.3.5's updater was removed. This local delivery does not substitute for the fresh-account acceptance above.

The Windows development machine has to perform its own 0.3.5 → 0.4.0 update; it is not reachable from the Mac.

## Known limits

- Windows installers are not publisher-signed; in-app updates rely on GitHub HTTPS and the SHA-512 in `latest.yml`.
- Mac updates download the full ZIP (no blockmap for the re-created notarised ZIP).
- WorkBuddy's Windows install location has not been observed on a real Windows machine; the icon itself is platform-independent.
- Versions up to 0.3.5 need one manual download, or the bootstrap update source, to reach 0.4.0.
- 0.3.5's updater leaves a full copy of the downloaded ZIP (`update.zip`) in its cache after updating a Mac; 0.4.0 itself does not create one. A later version should remove that leftover after a successful update.

`prd_draft.md` SHA-256 remains `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`.
