# Implementation map — 0.3.1

| Area | Entry points | Design and checks |
|---|---|---|
| Project identity, recovery, migration | `src/core/store.ts`, `files.ts`, `lifecycle.ts` | SQLite utility writer; schema v5; pre-migration archives; revisions and explicit recovery |
| Tasks and proposals | `src/shared/domain.ts`, `graph.ts`, `src/core/store.ts` | All-or-nothing human approval, dependency and parent invariants |
| Audit deletion | `src/ui/Records.tsx`, `Activity.tsx`, `src/core/store.ts` | Single record, confirmation, scoped human command, separate historical return counter |
| Graphs | `src/shared/graph-layout.ts`, `brands.ts`, `src/ui/GraphView.tsx` | Subtree and topological layout, independent components, zoom/pan/fit, explicit family logos |
| Deliverable paths | `src/shared/artifact-path.ts`, `src/core/artifact-path.ts` | Portable `/` references, old Windows separator support, explicit external references |
| Local runners | `src/providers/`, `src/electron/` | Codex App Server, Claude CLI, identity-scoped lifecycle and permissions |
| Relay | `src/electron/relay.ts`, `src/ui/Relay.tsx`, `RelayEditor.tsx` | One-step scheduling, claim before start, no automatic retry of unknown outcomes |
| Presentation | `Office.tsx`, `figures.tsx`, `style.css` | Default and enhanced characters; animation is not telemetry |
| Releases and legal | `src/shared/legal.ts`, `LegalSection.tsx`, `UpdatePanel.tsx` | Fixed public links, explicit diagnostic export, separate source/asset licences |
| Reproducible public media | `assets/manifest.json`, `scripts/check-assets.mjs`, `scripts/create-demo.ts` | Curated hashed assets; synthetic demo generated locally |

See [architecture](ARCHITECTURE.md), [protocol](PROTOCOL.md), [requirements](REQUIREMENTS.md), and [testing](TESTING-0.3.1.md). Original private handoff documents are deliberately not part of this public repository.
