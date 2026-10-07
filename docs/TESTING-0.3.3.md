# 0.3.3 verification

Status: Windows native acceptance passed; Apple accepted the CI App and DMG submissions, but final notarized artifact validation remains incomplete. Windows was published separately at the owner’s request. A signed but unnotarized Mac interim build is provided separately from the formal notarized acceptance.

- Local type checking and 79 unit tests passed on Node 24.12.0; native CI uses the required Node 24.21.0.
- Developer ID identity creation and encrypted GitHub signing-secret setup completed. Account-specific values are intentionally omitted.
- All five required GitHub signing/notarization secrets are configured. No values are recorded here.
- Native Mac final-package, Gatekeeper and browser-download acceptance pending. Initial native run: [37625139021](https://github.com/jasonyao486/HAICoMo/actions/runs/37625139021).
- Windows native job [112811555839](https://github.com/jasonyao486/HAICoMo/actions/runs/37627098656/job/112811555839) passed: source and packaged desktop suites, package privacy/license scan, real non-admin installation and desktop tests, reinstall, upgrade from 0.3.2, uninstall, retained settings, and unchanged simulated machine-wide installation. The test rejects an administrator token and demonstrates denial of a protected registry write.
- Apple status inspection [37628766459](https://github.com/jasonyao486/HAICoMo/actions/runs/37628766459) initially reported HAICoMo submissions as `In Progress`; later acceptance is recorded below. Signing identity selection and notarization authentication succeeded.
- First Windows verification failed because its test assumed an unversioned uninstall display name; the test now reads the stable installer GUID keys. No privilege escalation was added.
- Public source scan passed (285 files); historical scan passed (360 Git blobs); all commit emails use the GitHub noreply address. Windows package scans and anonymous downloads passed. Interim Mac package scans passed; formal notarized Mac acceptance remains pending.
- Local build and all 22 desktop scenarios passed; synthetic desktop screenshots were inspected.
- Release gate fixture checks passed: valid evidence accepted; administrator-token evidence and tampered installer rejected.
- Source brief checksum matches the contributor-instruction baseline.

A hosted Windows standard-user test and an agent-observed Mac launch do not certify every consumer OS, organisation policy, CLI login or hardware combination. Intel Mac, Windows ARM64 and older OS acceptance remain outside this release.

Windows publication and anonymous SHA-256 verification passed in [37633757117](https://github.com/jasonyao486/HAICoMo/actions/runs/37633757117), using the Windows artifacts from source `3c475f244629cb3f286a54454b814b0bcc3c8ea4`. Published attachments contain the installer, blockmap, checksum manifest and standard-user report. GitHub integration could not create the release; an empty draft and matching tag were created using the authorized local account, then the workflow uploaded and published the verified files.

Mac run `37627098656` notarized and stapled the App, but its final DMG notarization call failed while Apple still reported that submission In Progress. The package scan passed with archive SHA-256 `686c6f9bbdb8854467812a85e27548aa29ca56567ac3112be2f12b824d4b48a2`. Packaged desktop results were 21 passed / 1 failed: background permission routing timed out in `tabs.spec.ts`. No Mac release artifacts from that failed CI run were published. The signing script now exits explicitly after keychain cleanup so dependency exit hooks cannot mask a signing failure; the publication gate independently requires a successful verification report.

## Mac interim build

At the owner’s request, a Developer ID-signed, hardened-runtime interim DMG/ZIP is explicitly labeled `unnotarized`. It is not an automatic fallback from the formal release workflow. The local build explicitly disables notarization and seals locale `.pak` data as framework resources rather than separately signing those data files; all executable code and framework/app resource seals pass deep strict signature verification. Both final DMG and ZIP were opened/extracted and their App signatures and archive hashes checked. Their application archive matches the native CI hash recorded above.

All 22 packaged desktop scenarios passed locally, including the permission-routing scenario that timed out in CI. This covers isolated-profile project/database use and synthetic CLI startup, with no real projects or provider accounts. Screenshots were inspected and remain in ignored local validation storage. Package privacy/license scanning passed across 9,756 entries. Gatekeeper rejected the interim App as expected; no notarization or clean-account browser first-launch acceptance is claimed. The separate `mac-interim-verification.json` records these limitations, and `SHA256SUMS-darwin-arm64-unnotarized.txt` covers the exact final downloads.

The interim Mac files were published to [v0.3.3](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.3), and anonymous downloads of both packages and their report passed every SHA-256 check in [37638602802](https://github.com/jasonyao486/HAICoMo/actions/runs/37638602802). Invalid-certificate testing also confirmed a nonzero signing exit, no credential values in output, and restoration of the keychain search list.

At 2026-10-07 14:34 UTC, [Apple status inspection](https://github.com/jasonyao486/HAICoMo/actions/runs/37637736743) reported all four earlier App/DMG submissions Accepted. Those accepted CI submissions are distinct from the locally packaged interim downloads; this does not retroactively notarize or staple the interim files. Formal Mac release acceptance still requires a completed final-artifact verification and first-download launch in a fresh account.
