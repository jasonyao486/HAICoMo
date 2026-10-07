# Contributing

Use Node 24.12 or later. Clone this repository, run `npm ci`, then `npm run dev`. Packaged application users do not need Node.

Before submitting changes, run `npm run typecheck`, `npm test`, `npm run test:e2e` and `npm run check:assets`. Use temporary projects and isolated Electron user data; never test against personal projects or conversations. Tests launch a deterministic local fixture, not paid model accounts. Platform-specific skipped tests are not evidence for that platform.

Read [architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md) and [AGENTS.md](AGENTS.md). Preserve project identity, revision checks, transactional approval, and the distinction between delivery and human acceptance. Keep all four interface dictionaries and manuals aligned. Preserve original third-party permissions for asset changes and update the manifest hashes.

Include the problem, resulting behaviour, relevant test results and any platform limitations in a pull request. Do not commit project databases, prompts, diagnostics, credentials, build outputs or personal screenshots. Use `npm run demo -- /absolute/empty/directory` for synthetic data.
