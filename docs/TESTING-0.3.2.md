# Verification record — 0.3.2

Date: 7 October 2026. All tests use disposable synthetic projects and isolated Electron profiles. No real project or account conversation was opened for testing.

## Current execution evidence

| Check | Result |
|---|---|
| Local host | macOS 27.0 ARM64; isolated Node 24.21.0; Electron 44.5.1 |
| Build/type check | Passed |
| Unit tests | 77 passed, 0 failed |
| New navigation/layout/identity Electron cases | 3 passed |
| Full source Electron regression | 22 passed, 0 failed |
| Native macOS / Windows CI | Pending new source push |
| Native packages / installed checks | Pending |
| Public release/download hashes | Pending |

## Changed behaviour

- Twenty consecutive logo clicks do not add project tabs. Task drafts return through Recent projects and the project menu, and Cmd/Ctrl+W returns to the previous tab. Cycling shortcuts still visit real tabs.
- Home settings drafts survive navigation away and back. Window close/update preparation includes hidden project and home forms; new-project title drafts are guarded too. Old restoration records remain valid and the optional home flag restores home plus the original project page.
- Both sidebar entry icons have measured 19×19px bounds, centred without labels or arrows while collapsed. Their menu/dialog, keyboard focus, tooltips and accessible names work in four locales, both themes and a 1000×720 window. The descriptor is 13px and stays clear of the decorative orbit.
- Known model families produce short labels; human names, verbose test-author descriptions and full model versions stay in expanded details. Legacy proposal snapshots can supply explicit family identity. Unknown/client-only identities are not guessed. Unit and Electron checks compare original record contents after display.
- Existing regression suites cover background permission routing, relay lifetime, independent project identities, stale revisions, immutable proposal review, recovery, migration, graphs and art. These are rerun on each native platform rather than inferred across platforms.

An initial full regression exposed a test selecting every textarea after settings had been retained in ordinary project navigation. Retention was narrowed to the dedicated home settings view; existing project page behaviour remains unchanged. The final source rerun passed all 22 scenarios.

## Reproduce and limits

Run `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e`. For package tests set `HAICOMO_PACKAGED_EXECUTABLE` to the native executable. The verification workflow repeats checks on native macOS ARM64 and Windows x64, scans the packaged ASAR and silently installs the Windows NSIS package before testing it.

No live paid-agent calls were sent. Fixtures test integration logic, not all current third-party clients. Windows consumer-desktop human acceptance, signed automatic replacement and untested OS/architecture combinations remain pending. See [compatibility](COMPATIBILITY-0.3.2.md).
