# macOS / Windows compatibility — 0.3.2

Evidence date: 7 October 2026. “Built”, “automated” and “human checked” are separate claims. Both platform artifacts must use the same release source and curated asset manifest.

## Download choice

| Computer | File | Scope |
|---|---|---|
| Apple Silicon Mac (M-series chip) | `HAICoMo-0.3.2-arm64.dmg` | Primary Mac installer; ZIP is an alternative archive |
| Windows x64 PC | `HAICoMo-0.3.2-windows-x64-setup.exe` | Native NSIS installer; Windows human acceptance remains pending |
| Intel Mac | None | No verified x64 Mac build |
| Windows ARM64 | None | No native or emulation acceptance claim |
| Linux | None | Not part of this release |

The Mac package's minimum version metadata is 13.0. This is not evidence of running on macOS 13. Similarly, a Windows Server CI runner is not a substitute for Windows 10/11 consumer-desktop testing.

## Evidence matrix

<!-- PLATFORM_EVIDENCE_START -->
| Environment | Type/unit tests | Electron automation | Native package | Human desktop acceptance |
|---|---|---|---|---|
| Local macOS 27.0 ARM64 | Build passed; 77 unit tests passed | Source 22/22 passed | DMG/ZIP and signature passed; packaged 22/22 | Agent-assisted screenshots checked; no independent human tester |
| GitHub macOS 15.7.9 ARM64 | Passed, 77 unit tests | Source 22/22; packaged 22/22 | DMG/ZIP built, content and hashes verified | Not performed by a person |
| GitHub Windows Server 2025 x64 | Passed, 75 unit tests; 2 Mac-only skipped | Source 22/22; packaged 22/22; installed 4/4 | NSIS built and silently installed; contents verified | Not performed by a person |
| Windows 10/11 consumer desktop | Not performed | Not performed here | Awaiting human install check | Pending owner checklist below |
<!-- PLATFORM_EVIDENCE_END -->

Both native jobs passed in [run 37616743573](https://github.com/jasonyao486/HAICoMo/actions/runs/37616743573) from source `926255a58003723691796c2fbf1d2c7e59cfdcb2`. Local Mac DMG installation passed six scenarios and its ASAR matches the CI build. The canonical Mac application is now 0.3.2; 0.3.1 was archived before replacement. See [test provenance](TESTING-0.3.2.md).

## Shared behaviour and specific paths

- Runtime bundles Node/Electron; end users do not install Node to use the desktop manager. External agent CLIs must be installed/logged in separately.
- New internal deliverable paths use `/`; older `\` paths remain resolvable. A Windows drive/UNC absolute path on Mac, or POSIX absolute path on Windows, requires relinking.
- Cmd shortcuts apply on Mac; Ctrl shortcuts apply on Windows. Fixture clients use executable scripts on Unix and production npm-shim parsing on Windows.
- Background agents/relays remain visible through the dock on Mac and tray on Windows when the last window is closed. Platform UI behaviour needs native observation.
- Source, renderer assets and schema migration are identical; only packaging and native launch/OS integration differ.

## Windows human checklist

Use a disposable project and keep your existing data backed up. Record Windows edition, version, x64 architecture and installed agent CLI versions.

1. Download the NSIS `.exe` from the public release and verify SHA-256 with `Get-FileHash`.
2. Record SmartScreen/publisher prompts; complete a normal per-user install, including a path with spaces or non-ASCII text if desired.
3. Launch from Start; create a project, save/close/reopen it, then double-click `.haicomo` in Explorer and verify the intended installed app opens it.
4. Check Ctrl+T/Ctrl+W, default and enhanced graphics, small window, dark theme and file reveal in Explorer.
5. Install/log into a supported CLI. Detect it, start a harmless temporary task, handle permissions, cancel, and verify errors/unknown states are not displayed as success.
6. Create a paused/test relay. Close the last window while background work is retained, confirm tray access and reopen; quit explicitly and check no unattended job remains.
7. Export a backup. Install the next same-architecture version after quitting, reopen the disposable old project, check migration backup and test restore to an empty directory.
8. Uninstall; verify user project folders are retained. Do not use real private work to test deletion or recovery.

Report results through [GitHub Issues](https://github.com/jasonyao486/HAICoMo/issues/new/choose), with sanitised screenshots. CI does not fill in this checklist on your behalf.

## Signing and expansion

Mac ad-hoc signature integrity can be verified but is not Developer ID/notarisation. Windows packages currently have no publisher signing. Automatic installation/rollback, older Mac releases, Intel Mac, Windows ARM64 and multi-monitor/accessibility edge cases remain separate future checks. No independent website is needed: GitHub handles downloads, checksums and feedback.
