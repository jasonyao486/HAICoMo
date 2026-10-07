# Roadmap

HAICoMo 0.3.1 provides a local management and approval workspace, with background control for supported Codex/Claude installations and file-based collaboration for other clients. See [GAP-ANALYSIS.md](GAP-ANALYSIS.md) for evidence and boundaries.

The next release priorities are:

1. Complete human Windows desktop acceptance: installation, association, tray, local CLI paths, manual upgrade and uninstall. Expand operating-system coverage only with recorded evidence.
2. Add trusted release signing and notarisation, then verify real automatic replacement and rollback before enabling an automatic-install channel.
3. Improve transcript inspection, long-running session recovery and the visibility of unknown/failed execution. Never turn missing telemetry into success.
4. Add individual provider adapters when stable, supported APIs make start, permissions, cancellation and model capabilities observable. Keep GUI-only clients as manual handoffs until then.
5. Evaluate local background scheduling separately from UI lifetime. Multi-step pipelines and automatic retries need an explicit product decision and stronger idempotency/recovery design.
6. Design a server-backed concurrency model if multi-computer live collaboration becomes a requirement. Syncing an active SQLite file is not that implementation.

No dates or blanket compatibility promises are implied. Multi-human accounts, a cloud service, arbitrary GUI-session takeover, and commercial redistribution of non-commercial character assets are outside the current product scope.
