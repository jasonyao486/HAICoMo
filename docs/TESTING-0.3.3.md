# 0.3.3 verification

Status: implementation in progress; no new public installer has been accepted or published yet.

- Local type checking and 79 unit tests passed on Node 24.12.0; native CI uses the required Node 24.21.0.
- Developer ID identity creation and encrypted GitHub signing-secret setup completed. Account-specific values are intentionally omitted.
- App-specific notarization password setup pending.
- Native Mac signed-package, Gatekeeper and browser-download checks pending.
- Windows standard-user install, installed desktop tests, reinstall and uninstall pending. The new test rejects an administrator token and demonstrates denial of a protected registry write.
- Public source scan passed (282 files); historical scan passed (360 Git blobs); all commit emails use the GitHub noreply address. Package, workflow evidence and anonymous download checks pending.
- Local build and all 22 desktop scenarios passed; synthetic desktop screenshots were inspected.
- Source brief checksum matches the contributor-instruction baseline.

A hosted Windows standard-user test and an agent-observed Mac launch do not certify every consumer OS, organisation policy, CLI login or hardware combination. Intel Mac, Windows ARM64 and older OS acceptance remain outside this release.
