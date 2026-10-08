# Contributing

Use Node 24.21 or later. Clone this repository, run `npm ci`, then `npm run dev`. Packaged application users do not need Node.

## Working across macOS and Windows

Both machines contribute to the same source history. Before editing, check the branch, working tree and remote URL, then run `git fetch origin --prune --tags`. On `main`, compare with `origin/main`: fast-forward with `git merge --ff-only origin/main` when only behind; merge when both sides have new commits. On a feature branch, use its actual remote counterpart and include the current mainline as required for the work.

Preserve uncommitted work and both sides' intended changes. Resolve conflicts by reviewing their purpose, not by replacing an entire file with one machine's copy. Do not hard-reset away work, force-push, or rewrite published commits or release tags. Ask for clarification when a conflict changes product behaviour that cannot be inferred from the requirements.

Fetch again immediately before every push, integrate any new commits and rerun the affected checks. A rejected ordinary push means the remote must be checked again; it is not a reason to force-push. After pushing, compare the local and remote commit IDs and confirm the relevant commits from both machines are included. Report the final commit and any remaining difference. Source/tag synchronisation does not install Windows binaries on macOS or vice versa.

## Verification and review

Before submitting changes, run `npm run typecheck`, `npm test`, `npm run test:e2e` and `npm run check:assets`. Use temporary projects and isolated Electron user data; never test against personal projects or conversations. Tests launch a deterministic local fixture, not paid model accounts. Platform-specific skipped tests are not evidence for that platform.

Read [architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md) and [AGENTS.md](AGENTS.md). Preserve project identity, revision checks, transactional approval, and the distinction between delivery and human acceptance. Keep all four interface dictionaries and manuals aligned. Preserve original third-party permissions for asset changes and update the manifest hashes.

Include the problem, resulting behaviour, relevant test results and any platform limitations in a pull request. Do not commit project databases, prompts, diagnostics, credentials, build outputs or personal screenshots. Use `npm run demo -- /absolute/empty/directory` for synthetic data.
