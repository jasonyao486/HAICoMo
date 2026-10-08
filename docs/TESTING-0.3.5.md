# 0.3.5 verification status

Status: both native automated release gates passed. On 2026-10-08, the maintainer confirmed that the requested acceptance checks for this version passed and authorised publication of both platforms. This records human confirmation of fresh-account browser first-open acceptance for the exact DMG below; it is separate from the automated gates and local installation. No previous version's first-open result is reused. Both platforms are publicly available in [v0.3.5](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.5); publication and anonymous download verification passed in [run 37809739155](https://github.com/jasonyao486/HAICoMo/actions/runs/37809739155).

New-project entry filenames, protected generated guides, four-language agent connection and shared handoff/relay prompts are implemented. Database v5, entry v2 and proposal v1/v2 remain unchanged. Synthetic projects and fixture CLIs exercise proposal submission, human approval, delivery registration and separate human acceptance without real model accounts.

| Platform | Native verification | Application/build provenance |
|---|---|---|
| Mac Apple Silicon | [Run 37794633164](https://github.com/jasonyao486/HAICoMo/actions/runs/37794633164), successful job `113370763592` | `9609deebc775248445837f1b9197d6bca7ceaf5f` |
| Windows x64 | [Run 37793086209](https://github.com/jasonyao486/HAICoMo/actions/runs/37793086209), successful Windows job `113365326186` | `45749ad20e236536a0e8e2f50352e3f819fc331c` |

The commits differ only in tests and documentation. The release source check confirms identical application build inputs. The unrelated Mac job in the Windows run failed on an asynchronous clipboard test assertion; the independent successful Mac run contains its correction. Publication verifies the selected platform job, version, source inputs and original artifact hashes rather than accepting an unrelated job's result.

Both platforms passed type checking on Node 24.21.0. Mac passed all 99 unit cases; Windows passed 97, with two Mac artifact-cleanup cases platform-skipped. Mac source, signed-candidate and final packaged Electron suites each passed 26 scenarios; two Windows-only scenarios and the separately invoked upgrade scenario were skipped in those general suites. Windows source and packaged suites each passed 28 scenarios, with the dedicated upgrade scenario invoked separately. Tests cover four locales, both themes, narrow windows, optional task context, exact clipboard content and failures, concurrent handoff edits, custom-content preservation, repeated opening, proposal/delivery flow and separate project contexts.

Mac App, DMG and ZIP-contained App passed strict Developer ID signatures, Hardened Runtime, notarisation tickets and Gatekeeper. App notarisation: `9e9c511b-5d8a-4432-8b8e-241f29eb6b45`; DMG notarisation: `016db23a-1186-4c77-ba64-b0e847cc5a2a`. The actual 0.3.3 app seeded a project and settings; 0.3.5 reopened them with the same identity, epoch, tasks, custom rule bytes and delivery file. Both upgrade stages passed. Temporary signing-keychain cleanup passed.

Windows installed-app checks also ran under an actual non-administrator token, with a protected registry write denied. Seven installed desktop scenarios passed. Fresh installation, launch, reinstall, current-user associations/shortcuts and uninstall passed. Separate old/new app stages verified 0.3.4 → 0.3.5 upgrade, project identity, settings, rules, association and retained project/database/delivery/settings files after uninstall. The synthetic machine-wide installation remained unchanged. An administrator installation was not used as proof of the permission guarantee. SmartScreen remains distinct from elevation.

Published installer hashes (unchanged from the accepted candidates):

```text
3d499484fd5861cf09747f04337337137308c114fed0934c8cbe5e50dc9a08d5  HAICoMo-0.3.5-arm64.dmg
21e4713e8825485473472288b7bc5496394fd6e92c2e7f5a485c4106359b4ea0  HAICoMo-0.3.5-arm64-mac.zip
6e8a16470660edb28d8643a865dc2b8c3f326afdf9420f42cb55dccf424beaac  HAICoMo-0.3.5-windows-x64-setup.exe
```

The downloaded platform reports match their SHA-256 manifests. Source privacy/link scanning passed for 300 tracked files; all 86 runtime assets and packaged resource/license/privacy checks passed. Mac and Windows synthetic connection screenshots were visually inspected. Evidence stays in ignored `validation/0.3.5/` and CI artifacts; no real project or account data was used. The installed local Node is 24.12.0; supported-runtime acceptance comes from the native CI runs on 24.21.0.

Publication completed on 2026-10-08 from release-maintenance commit `75c3005addf7ec9b44be271a881159c0586f4252`; the version tag points to the exact Mac build commit `9609deebc775248445837f1b9197d6bca7ceaf5f`. The selected Windows build has identical application inputs. The maintainer's acceptance covers the requested new-account browser download, first launch without Open Anyway, named project entry, connection instructions and reopening. The published Mac verification report records this attestation against the exact DMG hash. The report and its checksum were updated at publication; the DMG, ZIP and Windows installer were not rebuilt or modified.

The release contains eight uploaded assets: Mac DMG, ZIP, verification report and SHA-256 manifest; Windows Setup, blockmap, verification report and SHA-256 manifest. GitHub additionally generates two source archives. The publication job anonymously downloaded and verified every checksum-listed file. Previous v0.3.3 and v0.3.4 asset identities, sizes, digests and update timestamps remained unchanged. Ten release-gate regression cases and the public privacy/link scan passed before publication. No unnotarised temporary package is offered.

The current development Mac was upgraded from 0.3.2 to this same 0.3.5 app. Strict signing, tickets and Gatekeeper passed locally; an isolated installed-app smoke check verified named project creation and agent connection. Existing user settings were unchanged, the old app was archived for rollback, and only the canonical installed app remains registered. This local update does not substitute for the separately confirmed fresh-account acceptance.

Immutable original brief SHA-256: `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`.
