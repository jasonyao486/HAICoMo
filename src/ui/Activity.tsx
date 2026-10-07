import { Trash2 } from "lucide-react";
import type { Audit, AuditPerson, ProjectState } from "../shared/domain";
import { familyName } from "../shared/domain";
import { auditContext } from "../shared/audit";
import type { Translate, Key } from "./i18n";
const actions: Record<string, Key> = { "task.create": "actionCreateTask", "task.update": "actionUpdateTask", "task.accept": "actionAccept", "task.return": "actionReturn", "task.archive": "actionArchive", "task.restore": "actionRestore", "task.delete": "actionDeleteTask", "note.create": "actionCreateNote", "note.update": "actionUpdateNote", "note.delete": "actionDeleteNote", "project.update": "actionProject", "handoff.record": "actionHandoff", "session.untrack": "actionUntrack", "acceptance.invalidated": "actionInvalidate", "schema.migrate": "actionMigrate", "legacy.import": "actionImport", "project.fork": "actionFork" };
export function ActivitySummary({ entry, state, t, locale, compact = false, onDelete }: { entry: Audit; state: ProjectState; t: Translate; locale: string; compact?: boolean; onDelete?: () => void }) {
  const context = auditContext(entry, state), task = context.tasks[0], root = task?.path[0], sub = task?.path.slice(1).map((p) => p.title || t("unknownTask")).join(" / ");
  const person = (p: AuditPerson) => p.kind === "human" ? (p.name || t("actorHuman")) : p.kind === "system" ? t("actorSystem") : [p.family ? familyName(p.family) : p.name || t("unknownModel"), p.model].filter(Boolean).join(" · ");
  const type = entry.action === "proposal.review" ? context.decision === "approve" ? "actionApprove" : context.decision === "reject" ? "actionReject" : "actionReview" : actions[entry.action] ?? "actionUnknown";
  return <div className={`activity-summary ${compact ? "compact" : ""}`}>
    <div className="activity-who"><strong title={person(context.actor)}>{person(context.actor)}</strong>{context.reviewer && <small title={person(context.reviewer)}>{t("modelProposed")}: {person(context.actor)} · {t("reviewedBy")}: {person(context.reviewer)}{context.modified && ` · ${t("humanAdjusted")}`}</small>}</div>
    <span className="activity-action" title={entry.action}>{t(type)}</span>
    <div className="activity-task"><span title={root?.title || ""}>{context.tasks.length ? `${t("auditTask")}: ${root?.title || t("unknownTask")}` : t("projectActivity")}</span>{sub && <small title={sub}>{t("auditSubtask")}: {sub}</small>}{context.tasks.length > 1 && <small>{t("affectedTasks")}: {context.tasks.length}</small>}</div>
    <div className="activity-date"><time dateTime={entry.at}>{new Date(entry.at).toLocaleString(locale)}</time>{onDelete && <button className="icon-button danger" title={t("deleteRecord")} aria-label={t("deleteRecord")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button>}</div>
  </div>;
}
export function ActivityTasks({ entry, state, t }: { entry: Audit; state: ProjectState; t: Translate }) {
  const tasks = auditContext(entry, state).tasks;
  return tasks.length ? <ul className="audit-task-list">{tasks.map((task) => <li key={task.id}>{task.path.map((p) => p.title || t("unknownTask")).join(" / ") || `${t("unknownTask")} (${task.id})`}</li>)}</ul> : null;
}
