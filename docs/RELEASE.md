# Release process — 0.3.2

The first public channel is a GitHub pre-release with manual downloads. No independent website is required. An installer being built does not prove that it works on a user's desktop; consult [COMPATIBILITY-0.3.2.md](COMPATIBILITY-0.3.2.md) for the evidence and outstanding checks.

## Targets and workflow

The `.github/workflows/verify.yml` matrix builds on native macOS ARM64 and Windows x64. Node 24.21.0 runs `npm ci`, type checking, unit tests, build, Electron tests, packaging and packaged Electron tests. Release files and test evidence are retained as workflow artifacts for 14 days. Packaging always uses `--publish never`; publication is a separate reviewed action.

The workflow also scans each packaged `app.asar` against the asset manifest and checks the bundled licences. Windows CI performs a silent NSIS install into a temporary directory and runs the public-demo and 0.3.2 navigation scenarios against that installed executable. This does not replace the human Windows checklist.

After reviewing the completed native run and local acceptance, dispatch `publish.yml` with its `verification_run` ID. It requires both jobs to have succeeded and refuses changes to the tested application, tests or build configuration (documentation and the publication workflow itself may be updated). It downloads that run's installers, verifies their SHA-256 values, uploads to a draft, then publishes the pre-release. It then downloads every published installer and checksum-listed metadata file without authentication and verifies the hashes again. An existing release requires inspection instead of automatic overwriting.

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

## Signing and later automatic installation

The Mac package uses ad-hoc signing; Windows has no publisher certificate. Users may see operating-system security prompts. Do not instruct users to disable system protection globally. Developer ID, hardened runtime/entitlements, notarisation and Windows signing, followed by actual signed replacement/rollback tests, are future requirements for a trusted automatic-install channel. A loopback updater fixture is not that validation.

## Release checklist

1. Verify source version, four manuals, release notes and manifest.
2. Complete native matrix checks and local Mac acceptance; record Windows human checks honestly as pending until performed.
3. Inspect clean-clone outputs and packaged content for private information.
4. Calculate SHA-256 of final files, publish the `v0.3.2` GitHub pre-release, and attach both native platform packages plus checksums.
5. Verify anonymous public links, downloaded hashes, extracted contents and a fresh-profile launch.
6. Preserve old local recovery material. Do not include private historical repositories or databases in the release.
