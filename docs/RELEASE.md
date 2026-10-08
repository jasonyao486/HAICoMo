# Release process — 0.3.5

The first public channel is a GitHub pre-release with manual downloads. No independent website is required. An installer being built does not prove that it works on a user's desktop; consult [TESTING-0.3.5.md](TESTING-0.3.5.md) for the evidence and outstanding checks.

## Targets and workflow

The `.github/workflows/verify.yml` matrix builds on native macOS ARM64 and Windows x64. Node 24.21.0 runs `npm ci`, type checking, unit tests, build, Electron tests, packaging and packaged Electron tests. Release files and test evidence are retained as workflow artifacts for 14 days. Packaging always uses `--publish never`; publication is a separate reviewed action.

The workflow also scans each packaged `app.asar` against the asset manifest and checks the bundled licences. Windows CI additionally installs under an actual non-administrator token and verifies installation, desktop behaviour, reinstall, file associations, uninstall and retained data. Version 0.3.5 requires native 0.3.4 → 0.3.5 upgrade evidence; the corresponding Mac upgrade starts at 0.3.3. An administrator-only silent installation is not proof of this guarantee.

After reviewing native and human acceptance, dispatch `publish.yml` with the Mac `verification_run`, the optional separate `windows_verification_run`, and the exact accepted `first_open_dmg_sha256`. Each selected platform job must succeed; an unrelated job in the same run does not supply acceptance. Application source, dependencies, resources and build inputs must match; permitted test, documentation and release-maintenance changes do not require rebuilding. It downloads the original accepted installers, verifies their SHA-256 values, uploads to a draft, then publishes the pre-release. It then downloads every published installer and checksum-listed metadata file without authentication and verifies the hashes again. An existing Windows-first release can receive the verified Mac assets only when its tag and Windows manifest match the accepted source; existing attachments are never overwritten.

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright test
# Run only the appropriate native target:
npx electron-builder --mac --arm64 --publish never
npx electron-builder --win --x64 --publish never
node scripts/package-checksums.mjs
```

The current version is read from `package.json` by electron-builder and CI (`scripts/ci-version.mjs`). Output is `release/<version>/`. macOS offers DMG and ZIP; Windows offers a complete NSIS `.exe`. An unpacked directory or `.nsis.7z` is not the Windows download. Only Apple Silicon and Windows x64 are first-release targets. `minimumSystemVersion: 13.0` is a packaging declaration, not evidence that macOS 13 was tested. Intel Mac, Windows ARM64 and Linux have no release acceptance claim.

## Material and privacy gate

`assets/runtime/` is the only Vite public directory. Before every build, `scripts/check-assets.mjs` verifies the hashes, sizes and complete file set in `assets/manifest.json`; unlisted assets and unsafe SVG references fail the build. The root notices distinguish MIT source, non-commercial characters, CC furniture and third-party marks. Installer resources include those notices; Electron's own licence files remain in the package.

Only current source, tests, public assets and maintenance documentation enter Git. Project databases, original briefs, old handoffs, videos, private references, local test logs, keys, certificates and environment files remain ignored. Inspect the actual Git index, screenshots and extracted installer; `.gitignore` does not remove previously tracked files. Build once from a clean clone with no private `public/` directory.

## Manual update and migration

Stop agent runs, pause pending relays, exit HAICoMo, retain the full project directory and an exported backup, then replace the application. On first open, schema v4 is backed up to `.haicomo/backups/pre-v5.haicomo.zip` before v5 migration. Entry-file version and proposal protocol stay unchanged. For rollback, restore the pre-migration ZIP into an empty directory; never open the migrated database with an older app. Backups contain management data, not source code or deliverable files.

GitHub Releases and Issues are fixed allowlisted destinations in Settings. No project is uploaded automatically. The optional custom updater remains unconfigured in this channel. Checks must report “not configured” rather than “up to date” when no source is set.

## Signing and installation

Trusted main-branch builds run `scripts/release-mac.mjs`; PR builds have no signing secrets and cannot be published. Required repository secrets are `CSC_LINK` (base64 encrypted PKCS#12), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`. Export only the Developer ID Application identity. Never commit or print secret values. App-specific passwords are created by the account owner in Apple's account UI.

The Mac job imports the identity into an ephemeral keychain, signs and notarizes the App, checks the ZIP, signs/notarizes/staples the DMG and verifies Gatekeeper. The temporary keychain and exported identity are removed even on failure. Checksums are generated after final stapling. Differential metadata for the modified DMG is omitted because this is a manual-download channel.

Windows uses a one-click current-user installer under LocalAppData with `asInvoker`, no elevation helper, and user-level file associations. Existing per-machine installations are left alone; uninstalling those old installations may independently require an administrator. The CI creates a disposable non-admin user to verify install, desktop behavior, reinstall, data retention and uninstall. No real projects are used.

Publication requires matching Mac signature/notarization evidence and Windows non-admin evidence bound to the exact final installer hashes. Windows remains unsigned, so SmartScreen can still prompt. Automatic installation and rollback remain separate future work.

## Release checklist

1. Verify source version, four manuals, release notes and manifest.
2. Complete native matrix checks and local Mac acceptance; record Windows human checks honestly as pending until performed.
3. Inspect clean-clone outputs and packaged content for private information.
4. Calculate SHA-256 of final files, publish the `v0.3.5` GitHub pre-release, and attach both native platform packages plus checksums.
5. Verify anonymous public links, downloaded hashes, extracted contents and a fresh-profile launch.
6. Preserve old local recovery material. Do not include private historical repositories or databases in the release.

## Historical Windows-first publication

Version 0.3.5 is released on both platforms together, with no unnotarised temporary package. The following describes the earlier, explicitly requested Windows-first route: `publish-windows.yml` can publish a successful native Windows job while Mac notarization is pending. It verifies identical application source, the actual standard-user acceptance report, installer hashes, and anonymous downloads. An inspected empty draft may be resumed, but a populated release cannot be overwritten. Mac interim artifacts, if offered, must have `unnotarized` in the filename and explicitly state that Open Anyway may be required; they do not satisfy MAC-033. The normal notarized publication gate remains unchanged.

## Resumable formal Mac build

Dispatch `verify.yml` with `platform=mac`. The main Mac job has a 180-minute ceiling and each Apple wait has a 60-minute ceiling. Prepared and packaged candidate artifacts retain their exact bytes for 14 days; separate progress artifacts retain submission IDs and statuses. If waiting fails or remains pending, dispatch again with `platform=mac` and `resume_run_id` set to the previous run. Only trusted main-branch verification runs are accepted, with source compatibility and candidate hashes rechecked. Checkpoint artifacts never include keychains, certificate exports or credentials. The latest run uploads candidates again so a second recovery can use that run ID.

For an existing release, the application source, dependencies, resources and build inputs must match its tag; only release infrastructure, tests and documentation may differ. The report records the original build, application-reference and verification commits separately. A 0.3.3 supplement additionally checks the existing formal verification report and manifest, including the application archive hash and tag provenance. Existing Windows downloads are independently downloaded and validated, then checked again after publication.

Dispatch `publish.yml` only after a browser download and first launch in a fresh macOS account, supplying `first_open_dmg_sha256` from the exact accepted candidate. This is an operator attestation, not an automated claim based on signing alone. Publication records the method and hash in the final report. Never enter that attestation for a simulated launch or a different file. Until that acceptance is complete, keep candidates in Actions artifacts and retain the previous public releases. After acceptance, also upgrade the current development computer with the verified native app, preserving user data and a rollback archive as required by `AGENTS.md`.
