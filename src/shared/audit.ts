import type { Audit, AuditContext, AuditTask, ProjectState, Task } from "./domain";
export function auditTasks(state: ProjectState, ids: string[], fallback: unknown[] = []): AuditTask[] {
  const known = new Map(state.tasks.map((t) => [t.id, t]));
  for (const value of fallback) if (value && typeof value === "object" && "title" in value && "parentId" in value) {
    const task = value as Task;
    if (!known.has(task.id)) known.set(task.id, task);
  }
  return [...new Set(ids)].map((id) => {
    const chain: AuditTask["path"] = [], seen = new Set<string>();
    let task = known.get(id);
    while (task && !seen.has(task.id)) { seen.add(task.id); chain.unshift({ id: task.id, title: task.title }); if (task.parentId && !known.has(task.parentId)) chain.unshift({ id: task.parentId, title: "" }); task = task.parentId ? known.get(task.parentId) : undefined; }
    return { id, path: chain };
  });
}
export function auditContext(a: Audit, state: ProjectState, historical = true): AuditContext {
  if (a.context) return a.context;
  // Legacy names do not prove a model family or a particular human identity.
  const actor = { kind: a.actor === "system" ? "system" : a.actor === "human" ? "human" : "model", name: ["human", "system"].includes(a.actor) ? "" : a.actor } as AuditContext["actor"];
  const record = a.after as any;
  const ids = a.action.startsWith("task.") || a.action === "acceptance.invalidated" ? [a.entityId] : a.action === "handoff.record" || a.action.startsWith("relay.") ? [record?.taskId ?? (a.before as any)?.taskId].filter(Boolean) : a.action === "proposal.review" ? record?.proposal?.changes?.filter((c: any) => c.entity === "task").map((c: any) => c.id) ?? [] : [];
  // Only before/after payloads prove historical titles. Current titles cannot
  // establish an old hierarchy after a rename or deletion.
  return { actor, tasks: auditTasks(historical ? { ...state, tasks: [] } : state, ids, [a.after, a.before]) };
}
