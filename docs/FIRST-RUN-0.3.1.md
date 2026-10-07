# Simulated first installation and use — 0.3.1

This is a **simulated new-user test**, conducted with disposable project folders and a fresh Electron profile. It is not feedback from an independent stranger. The evaluator follows the public README, does not reuse private project data, and distinguishes a tested action from a pending external check.

## Journey and acceptance criteria

| Step | Expected result | Evidence / status |
|---|---|---|
| Find the right download | Apple Silicon DMG and Windows x64 setup are named separately; source archives are explained | README pair and architecture table reviewed; public download verification recorded below |
| Understand installation warnings | Unsigned/ad-hoc status is visible before installation; no global security-disable instruction | README and four manuals reviewed |
| Start without an AI account | Home opens; project/task management does not require Node, Git, API keys or subscription | Fresh-profile Electron create/edit/accept scenario |
| Create a project | `.haicomo` entry and sibling hidden data exist; identity stays stable on reopen | Desktop, lifecycle and recovery suites |
| Create a task and child | Dates, ownership and hierarchy save; cycles and premature acceptance are rejected | Core and desktop suites |
| Explore 60 tasks | List includes all 60; timeline, hierarchy and dependencies remain accessible in a small window | Synthetic public-demo Electron scenario and screenshots |
| Receive a proposal | Offline immutable submission appears in review; approval applies a transaction | Core/desktop proposal scenarios; no real service call required |
| Inspect and accept delivery | Task's file is separate; only human acceptance unlocks prerequisites | Core and desktop scenarios; no claim that a generated output is automatically correct |
| Understand relay before configuring it | Empty Table view explains the next action; Visual shows an unoccupied desk/sofa in either style | Public-demo empty-state assertions and two README captures |
| Delete activity | Cancellation changes nothing; confirmation removes one row without reversing work or counts | v031 unit and Electron pagination tests |
| Quit, reopen and recover | Saved state survives; backup restores to an empty directory; old backup may include deleted activity | Core/lifecycle/recovery/v031 suites |
| Find help and updates | Settings points to Releases/Issues, diagnostics are exported separately | Allowlist and offline four-locale UI test |

## Installation evidence

Final native package, clean-clone and public download outcomes are recorded in [TESTING-0.3.1.md](TESTING-0.3.1.md) and [COMPATIBILITY-0.3.1.md](COMPATIBILITY-0.3.1.md). A packaged executable launch is not counted as a human clicking through Windows NSIS, SmartScreen, file associations or uninstall. Those require the Windows desktop checklist.

Windows CI built a complete NSIS installer, installed it silently into an isolated directory, checked the installed contents and passed the 0.3.1 demo against the installed executable. The local Mac simulation used a rebuilt DMG from the verified source with an ASAR hash identical to CI: read-only mount, application copy, eject, signature/content checks and fresh-profile desktop use. Public downloads are verified separately in the release workflow. This is a combined, reproducible simulation rather than one novice's uninterrupted browser-to-desktop session.

## Friction found and addressed

- The initial interface can use Chinese: the English installation steps include the exact Chinese labels for switching language before creating a project.
- A non-developer can easily choose GitHub's “Source code” instead of an installer: README now identifies exact filenames and explains chip/System type discovery.
- A `.haicomo` entry looks self-contained: all manuals explain the hidden sibling data and separate deliverables, and give a safe closed-app transfer sequence.
- Agent “completed” can be mistaken for accepted: installation tutorial and task guidance distinguish delivery from human acceptance.
- A blank relay page hid the visual mode: the empty scene now previews furniture without implying that agents are running.
- Dense task maps require zoom: the toolbar exposes fit, zoom and reset, and manuals explain the overview/readability trade-off.
- Download/signing prompts remain a first-use obstacle: they are disclosed. Signed distribution is a future release improvement, not simulated away in this test.

## Confidence and limits

The local first-use management journey has automated, reproducible evidence. Real Windows consumer-desktop behaviour, accessibility with screen-reader users, novice comprehension and long-lived paid-agent workflows still need external participants. No completion time, satisfaction score or “everyone can install” claim is inferred from automation.
