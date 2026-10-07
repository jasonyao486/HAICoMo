import { FAMILIES, type Family, type ProjectState } from "./domain";
export type ModelWork = { taskIds: string[]; completed: number; proposals: number; measuredMs: number; taskMentions: number; distinctTasks: number };
export type ModelMetrics = { families: Record<Family, ModelWork>; humanTasks: number; unknownTasks: number; unknownProposals: number; unknownMeasuredMs: number };
/** The subset of a proposal record that attribution needs; a full record satisfies it. */
export type ProposalLike = { proposal: { proposalId: string; actor: { family?: Family | null }; changes: { entity: string; id: string }[] } };
export function modelMetrics(state: ProjectState, proposals: ProposalLike[]): ModelMetrics {
  const families = Object.fromEntries(FAMILIES.map((f) => [f, { taskIds: [], completed: 0, proposals: 0, measuredMs: 0, taskMentions: 0, distinctTasks: 0 }])) as unknown as ModelMetrics["families"];
  const tasks = new Map(FAMILIES.map((f) => [f, new Set<string>()]));
  const mentioned = new Map(FAMILIES.map((f) => [f, new Set<string>()]));
  const human = new Set<string>(), unknown = new Set<string>(), existing = new Set(state.tasks.map((t) => t.id));
  let unknownProposals = 0, unknownMeasuredMs = 0;
  for (const task of state.tasks) for (const actor of task.assignees) {
    if (actor === "human") human.add(task.id);
    else if (tasks.has(actor as Family)) tasks.get(actor as Family)!.add(task.id);
    else unknown.add(task.id);
  }
  for (const s of new Map(state.sessions.map((s) => [s.sessionId, s])).values()) {
    const known = s.family && families[s.family];
    for (const id of s.taskIds) if (existing.has(id)) (known ? tasks.get(s.family!)! : unknown).add(id);
    if (s.source === "runner") {
      if (known) known.measuredMs += Math.max(0, s.measuredMs || 0);
      else unknownMeasuredMs += Math.max(0, s.measuredMs || 0);
    }
  }
  for (const { proposal: p } of new Map(proposals.map((p) => [p.proposal.proposalId, p])).values()) {
    const known = p.actor.family && families[p.actor.family];
    const ids = new Set(p.changes.filter((c) => c.entity === "task").map((c) => c.id));
    if (known) {
      known.proposals++; known.taskMentions += ids.size;
      for (const id of ids) { mentioned.get(p.actor.family!)!.add(id); if (existing.has(id)) tasks.get(p.actor.family!)!.add(id); }
    } else { unknownProposals++; for (const id of ids) if (existing.has(id)) unknown.add(id); }
  }
  // Client-only assignments become attributable when there is actual model evidence.
  for (const [family, ids] of tasks) {
    families[family].taskIds = [...ids];
    families[family].completed = state.tasks.filter((t) => ids.has(t.id) && t.acceptedAt).length;
    families[family].distinctTasks = mentioned.get(family)!.size;
  }
  const explicitUnknown = new Set([...state.sessions.filter((s) => !s.family).flatMap((s) => s.taskIds), ...proposals.filter((p) => !p.proposal.actor.family).flatMap((p) => p.proposal.changes.filter((c) => c.entity === "task").map((c) => c.id))]);
  for (const id of unknown) if (!explicitUnknown.has(id) && [...tasks.values()].some((ids) => ids.has(id))) unknown.delete(id);
  return { families, humanTasks: human.size, unknownTasks: unknown.size, unknownProposals, unknownMeasuredMs };
}
