# 0.4.0 verification status

Status: local macOS verification complete; native CI gates and publication pending. Nothing in this record is claimed for Windows from a Mac run. Synthetic projects, fixture agents and loopback release servers are used throughout; no real project, account or conversation is touched, and no automated test contacts GitHub.

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

## Native CI (pending)

- Mac: signed, notarised and stapled 0.4.0; `latest-mac.yml` generated from the final ZIP and recorded in `mac-release-verification.json`; installed upgrade from 0.3.5.
- Windows: `latest.yml` from the final installer; standard-user install/run/reinstall/uninstall; upgrade from 0.3.5; real in-app update of the installed 0.4.0 to a next-version fixture served from a loopback release origin (`tests/e2e/inapp-update.spec.ts`), with a machine-wide registration fixture present to prove the installer never stops at a dialog. The evidence (`inAppUpdate`) is a publication requirement.

## Known limits

- Windows installers are not publisher-signed; in-app updates rely on GitHub HTTPS and the SHA-512 in `latest.yml`.
- Mac updates download the full ZIP (no blockmap for the re-created notarised ZIP).
- WorkBuddy's Windows install location has not been observed on a real Windows machine; the icon itself is platform-independent.
- Versions up to 0.3.5 need one manual download, or the bootstrap update source, to reach 0.4.0.

`prd_draft.md` SHA-256 remains `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`.
