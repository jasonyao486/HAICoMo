# 0.3.3 repository and public-page cleanup

This maintenance changes documentation, one demonstration screenshot, test fixtures and publication helpers. Application code, dependencies, build inputs, project format, version and the original v0.3.3 tag remain unchanged. Accepted installers are not rebuilt or overwritten.

## Current-directory cleanup

Removed files were copied to an ignored local backup and checked before removal. Git history is preserved; the original material remains available at the corresponding version tag.

| Removed from main | Count | Historical location |
| --- | ---: | --- |
| PROGRESS, REVIEW and FIRST-RUN reports for 0.3.1 | 3 | [v0.3.1 docs](https://github.com/jasonyao486/HAICoMo/tree/v0.3.1/docs) |
| PROGRESS, REVIEW and FIRST-RUN reports for 0.3.2 | 3 | [v0.3.2 docs](https://github.com/jasonyao486/HAICoMo/tree/v0.3.2/docs) |
| USER-MANUAL-0.3.1, en-GB/en-US/zh-CN/zh-TW | 4 | [v0.3.1 manuals](https://github.com/jasonyao486/HAICoMo/tree/v0.3.1/docs) |
| docs/images/0.3.1 screenshots | 14 | [v0.3.1 images](https://github.com/jasonyao486/HAICoMo/tree/v0.3.1/docs/images/0.3.1) |

The four 0.3.2 manuals are superseded by the four 0.3.3 manuals. Requirements, architecture, protocols, contribution instructions, licences, current development guidance, and historical release/testing/compatibility reports remain available. Deleting files from main does not erase older commits or copies in clones and forks.

## Documentation and synthetic screenshot

Both READMEs and the release page use the agreed project-management introduction and objective wording. Manuals describe the accepted Mac installation and current-user Windows setup. Necessary pre-0.3.1 migration information and unchanged 0.3.2 UI illustrations remain valid historical context.

The new relay screenshot uses the existing enhanced Claude and ChatGPT artwork, an isolated 60-task synthetic project, a test CLI reporting a running Claude session, and a paused ChatGPT relay. It uses no real project or model account. Electron assertions check the running state, seated waiting pose, correct character atlases, loaded images and placement inside their respective workstation/sofa regions. The captured image was visually inspected.

| Image | SHA-256 |
| --- | --- |
| 0.3.3/relay-claude-chatgpt.png | `c74b42199e2cbceea96a66f505adc59974852a5ebfbff789dc0d52b2528650d0` |
| 0.3.2/relay-preview-default.png — unchanged | `550580a448ea30ad4da80aacda6660c93e10b36c82fee74d92cd28710a3d9f3f` |
| 0.3.2/relay-preview-enhanced.png — unchanged | `8f9bf50c36cb9a9d46023f219543791e5aea8ca082e9477c5a186c9463068f2d` |

## Retired temporary downloads

Each of these four files was backed up locally and matched its original GitHub SHA-256 before retirement:

- HAICoMo-0.3.3-arm64-unnotarized.dmg
- HAICoMo-0.3.3-arm64-unnotarized.zip
- mac-interim-verification.json
- SHA256SUMS-darwin-arm64-unnotarized.txt

The eight formal Mac and Windows assets are retained. The 0.3.3 publication helper now reads the published formal Mac report and checksum manifest in a separate baseline directory. It verifies the report hash, acceptance flags, notarization IDs, first-open DMG hash, application archive hash and tag/build source. Missing or modified evidence blocks publication; interim downloads are no longer required.

## Validation

- Build/type checking and all 87 unit tests passed locally. The formal-baseline regression covers absent report/manifest, altered report/manifest, duplicate manifest entries, mismatched application archive/source and unaccepted notarization.
- Both relevant Electron scenarios passed: the new Claude/ChatGPT relay scene and the existing 60-task demo, graphs, assets, activity deletion and four locales. Fixtures use disposable profiles and projects.
- The actual published formal report and manifest were downloaded without credentials and passed the new baseline check against the original tag and archive hash.
- Reachable history audit: 431 blobs and 31 commits before this maintenance; no recognised credential patterns, private paths or personal absolute paths found. Commit email addresses use GitHub noreply identities. Public developer signing identity, GitHub identity and third-party attribution are intentionally retained.
- Public image metadata inspection found no PNG text/EXIF or EXIF/XMP blocks; existing colour, density and third-party content-provenance chunks are retained. No secret values are printed in audit output.
- Original requirement brief SHA-256 remains `da6a5edbdbe69b600080d9e76d40e4795e2938d7226267c69cf6c13cc0af41c8`.

Local tests used macOS ARM64 and Node 24.12.0; accepted native release tests used Node 24.21.0 as recorded in [0.3.3 verification](TESTING-0.3.3.md). These maintenance tests do not replace or broaden native installation acceptance.

Public source/link checks, final attachment inventory, anonymous download checks and rendered-page review are recorded after publication below.
