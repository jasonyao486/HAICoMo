# 0.3.3 verification

Status: Windows native acceptance and formal Mac acceptance passed. The owner confirmed fresh-account browser download, first launch and project reopening without Open Anyway on 2026-10-07. Formal Mac files are public in v0.3.3, with anonymous download hashes verified; earlier intermediate results below are retained as history.

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

## Formal Mac completion in progress

The release job now persists signed candidates separately from notarization progress, including submission IDs and input hashes. Main-only resumption validates source compatibility and exact saved bytes. Local type checking, 84 unit tests (including five release recovery tests) and all 22 desktop tests passed. The permission-routing test now distinguishes the fixture CLI turn handshake from subsequent permission delivery and records protocol method names/statuses on startup failure; it retains the original permission assertions. Formal Mac publication remains blocked pending native candidate verification and fresh-account browser first-open acceptance of its exact DMG hash.

Native formal verification [37648181888](https://github.com/jasonyao486/HAICoMo/actions/runs/37648181888) passed on 2026-10-07. The application reference is the unchanged v0.3.3 tag `3c475f244629cb3f286a54454b814b0bcc3c8ea4`; the actual build is `1f5243b1057a6dffd991ff94c7abf3cbd29f8583`. The application archive hash remains `686c6f9bbdb8854467812a85e27548aa29ca56567ac3112be2f12b824d4b48a2`, identical to the earlier native and interim builds.

- Source type checking, 84 native unit tests and 22 source desktop tests passed.
- All 22 signed-candidate tests and all 22 final packaged tests passed, including database/project reopening and synthetic CLI permission routing. Package privacy, resources and license scans passed.
- Apple accepted App submission `efde642f-61e0-4e49-b635-1a9657fb3140` and DMG submission `37c0ea61-9b40-4a60-ba22-6b56b2ec5e9a`. Final signatures, stapled tickets and Gatekeeper checks passed; keychain cleanup succeeded.
- The final artifact is [haicomo-0.3.3-mac-arm64](https://github.com/jasonyao486/HAICoMo/actions/runs/37648181888/artifacts/11496636283). It is a candidate for first-open acceptance, not yet the public formal release.
- A subsequent local infrastructure update passed type checking and all 86 unit tests, including seven recovery/publication scenarios. A lost submission response now records an unknown upload outcome; recovery must match Apple's job log SHA-256 before reusing an ID and never silently duplicates the upload. Publication rejects missing or mismatched first-open acceptance, an altered DMG, unsigned/unnotarized evidence and Windows administrator-token evidence.
- Synthetic desktop captures were inspected. The original brief still matches SHA-256 `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`. No recognized credential pattern was found in the formal CI log.

The earlier timeout's trace records zero permissions at the five-second deadline but contains no CLI protocol diagnostic, so the precise historical missing event cannot be reconstructed. Inspection confirmed the test could begin its permission deadline before asynchronous capability discovery and process handshake completed. It now waits for the fixture model and actual `turn/start` request before the unchanged permission assertion, with bounded startup waits and sanitized failure diagnostics. This passed in source, signed candidate and final package without retries or application changes.

On 2026-10-07, the owner explicitly confirmed completion and passage of the fresh-account browser-download, first-open and test-project reopening procedure for artifact `11496636283` from run `37648181888`, without using Open Anyway or removing the download quarantine marker. This is owner-observed acceptance, separate from automated CI checks. The publication report binds that acceptance to the final DMG hash. Existing Windows attachments and interim Mac attachments have not been replaced.

## Formal Mac publication

[Publication run 37651600519](https://github.com/jasonyao486/HAICoMo/actions/runs/37651600519) supplemented [v0.3.3](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.3) with the same accepted DMG/ZIP, the acceptance report and a new Mac checksum manifest. Anonymous downloads of every file listed in both platform manifests passed SHA-256 verification. All four original Windows attachments retained their exact hashes; the four interim Mac attachments also retain their original hashes. The original tag remains `3c475f244629cb3f286a54454b814b0bcc3c8ea4`.

| Formal Mac file | SHA-256 |
| --- | --- |
| HAICoMo-0.3.3-arm64.dmg | `1ef889f7a7e95a97504ef48e9e68e35201b275d0614262ce116bef616d57adce` |
| HAICoMo-0.3.3-arm64-mac.zip | `be3c0c76d4f290f83a20a89b6c21c4938f9d7562fe767a029139fc7ceaf184d9` |
| mac-release-verification.json | `f32d1a4fa315cb146edb19f560e30080555f2b3b4e98d28c38550efabae9d930` |
| SHA256SUMS-darwin-arm64.txt | `2a05037b112d017f1275973bf3be090cc05796adae55e9cf112df271328ca7bb` |

The report was also downloaded anonymously on the local host and matched its published SHA-256. The publication log scan found no recognized credential patterns. Local source validation used macOS 27.0 ARM64; native release validation used macOS 15 ARM64 and Node 24.21.0. Automated CLI coverage uses isolated synthetic providers; personal CLI accounts and unsupported architectures are not implied to be certified.

[Recovery verification 37652293297](https://github.com/jasonyao486/HAICoMo/actions/runs/37652293297) then passed using `resume_run_id=37648181888`. It restored the saved candidate, rechecked source and file hashes, and reused both original accepted submission IDs without uploading a new notarization request. The source, signed-candidate and final-package suites each passed all 22 desktop cases; all 86 unit tests passed. The resumed finalization also explicitly ran Gatekeeper on the extracted ZIP App. That ZIP hash is the same `be3c0c76d4f290f83a20a89b6c21c4938f9d7562fe767a029139fc7ceaf184d9` as the published download. This was additional acceptance evidence; it did not replace any public attachment.
