# Roadmap

HAICoMo 0.6.0 provides a local management and approval workspace. It runs every client that has a headless command line in the background, answers ACP and Claude permission prompts in the app, passes delivery records between relay stages, and gives parallel relay tasks their own git working copies. See [GAP-ANALYSIS.md](GAP-ANALYSIS.md) for evidence and boundaries.

The next release priorities are:

1. Verify the new channels on real installations. That means Claude's host channel after a fresh login, Kimi's ACP turns once its quota resets, and Hermes, Gemini, Qwen, OpenCode and Copilot over ACP. Promote evidence levels only from real runs.
2. Use ACP tool-call updates in the interface: progress on relay steps, and studio animations that follow real activity. Animation must never change execution state.
3. Show quota and rate-limit status per client where clients expose it, and add an optional quota guard for unattended relays.
4. Extend relays from the fixed 3 × 3 shape to an editable plan graph with per-node client, model and effort, exportable as a template.
5. Expand Windows consumer-device, managed-system and real CLI coverage; evaluate Windows publisher signing.
6. Design a server-backed concurrency model only if multi-computer live collaboration becomes a requirement. Syncing an active SQLite file is not that implementation.

No dates or blanket compatibility promises are implied. Multi-human accounts, a cloud service, arbitrary GUI-session takeover, and commercial redistribution of non-commercial character assets are outside the current product scope.
