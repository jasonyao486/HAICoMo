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
| Native GitHub CI | [Run 37616743573](https://github.com/jasonyao486/HAICoMo/actions/runs/37616743573), both platforms passed from `926255a58003723691796c2fbf1d2c7e59cfdcb2` |
| Native macOS 15.7.9 ARM64 | 77 unit tests, source 22/22, packaged 22/22; DMG/ZIP built |
| Native Windows Server 2025 x64 | 75 unit tests passed, 2 Mac-only cases skipped; source 22/22, packaged 22/22; NSIS installed and four installed-app scenarios passed |
| Local Mac package | DMG/ZIP integrity and ad-hoc signature passed; packaged Electron 22/22 passed |
| Clean clone | Fresh npm ci, public scan, build/type check, 77 unit tests and four demo/navigation scenarios passed |
| DMG installed checks | Mounted read-only, copied into an isolated application directory, ejected, signature verified; six installed-app scenarios passed |
| Public release/download hashes | Awaiting publication and anonymous round-trip verification |
| Public content | 274 tracked files scanned; 16 current synthetic screenshots inspected; original private brief checksum unchanged |
| Local application | Canonical Mac app replaced with verified 0.3.2 after confirming 0.3.1 was not running; previous app archived; no real user projects opened |

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

## Package provenance

[Mac job](https://github.com/jasonyao486/HAICoMo/actions/runs/37616743573/job/112776806259) and [Windows job](https://github.com/jasonyao486/HAICoMo/actions/runs/37616743573/job/112776805814) build the same source. Both scans cover 9,756 files and 86 allowlisted runtime assets. Manifest SHA-256: `0b737fb963b38cafc35ade8bbedc027a4af3b94465d5a7283f27ba682bbe3456`.

Mac ASAR: `f0c2c0af8c8a66b734b4a707f54b3050eda04666ad874d15243a2e8d1c22379a`. Windows ASAR: `7d21c2a6e85854ea8183328b8e2d45784a2cfb0070c6be466c9f9881fddeea1b`. The locally rebuilt Mac DMG application has the same ASAR as native CI. The installed Windows ASAR matches its unpacked build. Container hashes can differ because of packaging metadata; published downloads use the native CI installer files and their own checksum manifests.

Mac DMG verification, ZIP integrity and ad-hoc signature checks passed. Installation simulation used a read-only DMG mount, copy to an isolated application directory, eject, then tests with a new isolated profile. This is not an independent person's quarantined-browser-download/Gatekeeper acceptance. Mac Developer ID/notarisation and Windows publisher signing remain unconfigured.
