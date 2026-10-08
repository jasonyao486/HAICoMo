# 0.3.5 verification status

Status: candidate; not yet accepted or published. Both platforms must pass before release. No previous fresh-account acceptance is reused.

Application changes cover new-project entry filenames, protected generated guides, four-language agent connection and shared handoff/relay prompt composition. Database v5, entry v2 and proposal v1/v2 remain unchanged.

Local macOS ARM64 type checking, 99 unit tests and all 86 runtime asset checks passed. Public-source scanning passed for 297 files, including relative Markdown links. All 25 local native Electron scenarios passed, including the complete proposal/delivery flow and four locales in both themes. Two Windows-only scenarios and the separately invoked installed-version upgrade scenario were skipped locally; these remain explicit native CI gates. The installed local Node is 24.12.0; downloading the documented 24.21.0 runtime encountered DNS/timeouts, so supported-runtime acceptance remains the native CI run on 24.21.0. Tests use synthetic projects, isolated Electron profiles and fixture CLIs, with no real model account. Evidence is retained in ignored `validation/0.3.5/` and CI artifacts. Screenshots contain only synthetic data and disposable paths; no personal workspace is used.

Native release gates:

- Mac Apple Silicon: source and packaged suites, 0.3.3 installed-app upgrade preserving project identity/rules/settings, Developer ID signing, notarisation, stapling, strict signature and Gatekeeper. A browser download in a fresh macOS account must then open without Open Anyway using this candidate's exact DMG hash.
- Windows x64: source and packaged suites; actual standard-user token; fresh install, launch, reinstall, 0.3.4 → 0.3.5 upgrade, user associations/shortcuts and uninstall retaining settings/project/delivery data. An administrator CI installation alone is insufficient.
- Publication: independent trusted platform run IDs may be supplied; application build inputs and versions must agree. Evidence hashes must match the original artifacts. Missing upgrade or fresh-account evidence blocks publication.

Immutable original brief SHA-256: `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`.
