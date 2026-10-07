# 0.3.3 verification

Status: Windows native acceptance passed; Mac Developer ID signing completed and Apple notarization is pending. Windows was published separately at the owner’s request; Mac downloads are still pending.

- Local type checking and 79 unit tests passed on Node 24.12.0; native CI uses the required Node 24.21.0.
- Developer ID identity creation and encrypted GitHub signing-secret setup completed. Account-specific values are intentionally omitted.
- All five required GitHub signing/notarization secrets are configured. No values are recorded here.
- Native Mac signed-package, Gatekeeper and browser-download checks pending. Initial native run: [37625139021](https://github.com/jasonyao486/HAICoMo/actions/runs/37625139021).
- Windows native job [112811555839](https://github.com/jasonyao486/HAICoMo/actions/runs/37627098656/job/112811555839) passed: source and packaged desktop suites, package privacy/license scan, real non-admin installation and desktop tests, reinstall, upgrade from 0.3.2, uninstall, retained settings, and unchanged simulated machine-wide installation. The test rejects an administrator token and demonstrates denial of a protected registry write.
- Apple status inspection [37628766459](https://github.com/jasonyao486/HAICoMo/actions/runs/37628766459) reports HAICoMo submissions as `In Progress`; this is not an accepted notarization. Signing identity selection and notarization authentication succeeded.
- First Windows verification failed because its test assumed an unversioned uninstall display name; the test now reads the stable installer GUID keys. No privilege escalation was added.
- Public source scan passed (284 files); historical scan passed (360 Git blobs); all commit emails use the GitHub noreply address. Windows package scans and anonymous downloads passed. Mac final package checks remain pending.
- Local build and all 22 desktop scenarios passed; synthetic desktop screenshots were inspected.
- Release gate fixture checks passed: valid evidence accepted; administrator-token evidence and tampered installer rejected.
- Source brief checksum matches the contributor-instruction baseline.

A hosted Windows standard-user test and an agent-observed Mac launch do not certify every consumer OS, organisation policy, CLI login or hardware combination. Intel Mac, Windows ARM64 and older OS acceptance remain outside this release.

Windows publication and anonymous SHA-256 verification passed in [37633757117](https://github.com/jasonyao486/HAICoMo/actions/runs/37633757117), using the Windows artifacts from source `3c475f244629cb3f286a54454b814b0bcc3c8ea4`. Published attachments contain the installer, blockmap, checksum manifest and standard-user report. GitHub integration could not create the release; an empty draft and matching tag were created using the authorized local account, then the workflow uploaded and published the verified files.
