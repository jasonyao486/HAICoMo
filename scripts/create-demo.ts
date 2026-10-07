import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../src/core/store";
import { publishProposal } from "../src/core/files";
import { FAMILIES } from "../src/shared/domain";

/** Entirely synthetic. Never reads another project, account or conversation. */
export function createDemo(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  if (fs.readdirSync(directory).length) throw new Error("DEMO_REQUIRES_EMPTY_DIRECTORY");
  const store = new ProjectStore(directory, "HAICoMo Demo");
  const titles = ["Plan the workspace", "Prepare a sample project", "Review task flows", "Refine the timeline", "Map dependencies", "Explore the studio", "Check proposal review", "Document recovery", "Verify platform builds", "Prepare the release"];
  const parts = ["Outline the approach", "Prepare a small example", "Check the result", "Review edge cases", "Write the notes"];
  const command = (type: string, payload: unknown) => store.command({ id: randomUUID(), type, payload }, "Demo user");
  fs.mkdirSync(path.join(directory, "deliverables"));
  fs.writeFileSync(path.join(directory, "deliverables/example.md"), "# Synthetic demonstration\n\nThis file is sample content, not a real delivery or production record.\n");
  const roots: string[] = [], all: string[] = [];
  const at = new Date().toISOString();
  try {
    for (let i = 0; i < titles.length; i++) {
      const parent = `demo-task-${i + 1}`; roots.push(parent);
      for (let j = -1; j < 5; j++) {
        const id = j < 0 ? parent : `${parent}-${j + 1}`; all.push(id);
        command("change", { entity: "task", operation: "create", id, expectedRevision: null, values: {
          title: j < 0 ? titles[i] : parts[j], description: "Synthetic demonstration only. Review the sample deliverable before accepting this task.",
          parentId: j < 0 ? null : parent, dependencies: j < 0 && i > 0 ? [roots[i - 1]] : j > 0 ? [`${parent}-${j}`] : [],
          assignees: [FAMILIES[i % FAMILIES.length], ...(j === -1 && i % 3 === 0 ? ["claude"] : [])],
          status: i < 2 || i === 2 && j < 2 ? "delivered" : i === 2 ? "doing" : "todo", progress: i < 2 ? 100 : i === 2 ? 45 : 0,
          startDate: `2026-10-${String(1 + i * 2).padStart(2, "0")}`, endDate: `2026-10-${String(4 + i * 2).padStart(2, "0")}`,
          artifacts: [{ id: "sample", label: "Example notes", path: "deliverables/example.md" }], handoff: "Read the sample notes. Propose a small, reviewable change; wait for human acceptance.",
        } });
      }
      if (i < 2) for (const id of [...Array.from({ length: 5 }, (_, j) => `${parent}-${j + 1}`), parent]) {
        const task = store.state().tasks.find(t => t.id === id)!;
        command("task.accept", { taskId: id, expectedRevision: task.revision });
      }
    }
    for (let i = 0; i < 6; i++) {
      store.recordEvent({ id: randomUUID(), sessionId: `synthetic-session-${i}`, family: FAMILIES[i], provider: i % 2 ? "claude" : "codex", model: "synthetic-demo", taskIds: [roots[i]], status: i === 2 ? "running" : i === 3 ? "waiting" : "idle", source: "self-report", at, message: "Synthetic example; no model account was invoked." });
    }
    const state = store.state();
    for (let i = 0; i < 3; i++) {
      const task = state.tasks.find(t => t.id === roots[i + 3])!;
      publishProposal(directory, { protocolVersion: 2, proposalId: `demo-proposal-${i}`, projectId: state.id, epoch: state.epoch,
        actor: { name: i % 2 ? "Demo reviewer" : "Demo assistant", family: i % 2 ? "claude" : "chatgpt", model: "synthetic-demo", harnessId: i % 2 ? "claude" : "codex" },
        title: ["Clarify a dependency", "Add a review checklist", "Shorten the release notes"][i], reason: "Synthetic proposal for practising review; no real agent was used.", createdAt: at, dependsOn: [],
        changes: [{ entity: "task", operation: "update", id: task.id, expectedRevision: task.revision, values: { description: "Updated demonstration notes, ready for human review." } }],
      });
    }
    store.ingest(true);
  command("change", { entity: "note", operation: "create", id: "demo-note", expectedRevision: null, values: { title: "Demo guide", body: "All tasks, proposals, people and runs in this project are synthetic. Try reviewing a proposal, locating a deliverable, and changing the visual mode.", kind: "note" } });
  command("relay.create", { values: { title: "Draft a review summary", taskId: roots[2], referenceTaskId: roots[1], afterSessionId: null, trigger: { kind: "delay", ms: 60000 }, handoff: { provider: "codex", model: "gpt-6-astra", effort: "", mode: "", threadId: "", continueThread: false }, prompt: "Read the synthetic example notes and outline a short review. This paused demo never starts by itself." }, enabled: false });
  return path.join(directory, "HAICoMo.haicomo");
  } finally { store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: npm run demo -- /absolute/empty/directory");
  console.log(createDemo(path.resolve(process.argv[2])));
}
