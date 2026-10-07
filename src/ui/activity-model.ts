import { auditContext } from "../shared/audit";
import { FAMILIES, familyName, proposalSchema, type Audit, type AuditPerson, type ProjectState } from "../shared/domain";
import type { Translate } from "./i18n";

// Presentation only: never rewrite stored context or infer identity from a name/client.
export function activityContext(entry: Audit, state: ProjectState) {
  const context = auditContext(entry, state);
  if (entry.action !== "proposal.review" || context.reviewer) return context;
  const record = entry.after as { proposal?: { actor?: unknown }; status?: string } | null;
  const actor = proposalSchema.shape.actor.safeParse(record?.proposal?.actor);
  if (!actor.success) return context;
  return {
    ...context,
    actor: { ...actor.data, kind: "model" as const },
    reviewer: context.actor.kind === "human" ? context.actor : { kind: "human" as const, name: "" },
    decision: context.decision ?? (record?.status === "applied" ? "approve" : record?.status === "rejected" ? "reject" : undefined),
  };
}

export function shortRole(person: AuditPerson, t: Translate) {
  if (person.kind === "human") return t("actorHuman");
  if (person.kind === "system") return t("actorSystem");
  return person.family && FAMILIES.includes(person.family) ? familyName(person.family) : t("unknownModel");
}

export function activityRoles(entry: Audit, state: ProjectState, t: Translate) {
  const context = activityContext(entry, state);
  return [context.actor, ...(context.reviewer ? [context.reviewer] : [])].map(person => shortRole(person, t)).join(" → ");
}
