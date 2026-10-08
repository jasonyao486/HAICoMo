import { assertAgentConnection, composeAgentPrompt, connectionText } from "../shared/agent-prompt";
import { artifactPromptPath, externalArtifactPath, portableArtifactPath } from "../shared/artifact-path";
import { useEffect, useRef, useState, useId, type ReactNode } from "react";
import {
  X,
  Plus,
  Check,
  FolderOpen,
  Trash2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  FileText,
  Send,
  Copy,
} from "lucide-react";
import {
  FAMILIES,
  ACTORS,
  inferFamily,
  COLORS,
  familyName,
  taskValuesSchema,
  taskStatus,
  blockers,
  type Task,
  type Workspace,
  type Note,
  type ProposalRecord,
  type Capabilities,
  type TaskValues,
} from "../shared/domain";
import {
  CLIENTS,
  clientIcon,
  isClientActor,
  type HarnessId,
} from "../shared/clients";
import { useApi, useTab, useDirty } from "./api";
import { PORTRAITS } from "../shared/art";
import { terminalCommand } from "../shared/terminal";
import { capabilityEfforts, MODE_LABEL_KEYS, modeArguments } from "../shared/capabilities";
import { type Translate, formatDate, type Key } from "./i18n";
import { errorText } from "./errors";

export function Avatar({
  family,
  size = 28,
}: {
  family: string;
  size?: number;
}) {
  const index = FAMILIES.indexOf(family as any);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: index < 0 ? "#e6e9e2" : COLORS[index] + "18",
        borderColor: index < 0 ? "#ccd4cc" : COLORS[index] + "40",
      }}
      title={familyName(family)}
    >
      {index < 0 && !isClientActor(family) ? (
        <span>{family === "human" ? "Y" : "?"}</span>
      ) : (
        <img
          src={
            isClientActor(family)
              ? `.${clientIcon(family.slice(7))}`
              : `./local-assets/${family}-logo.svg`
          }
          alt=""
          aria-hidden="true"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.parentElement!.textContent = familyName(family)[0];
          }}
        />
      )}
    </span>
  );
}
export function ModelPortrait({
  family,
  reducedMotion,
}: {
  family: string;
  reducedMotion: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries[0].isIntersecting),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={host}>
      {failed ? (
        <Avatar family={family} size={42} />
      ) : (
        <img
          className="model-art"
          src={
            PORTRAITS[family as keyof typeof PORTRAITS]?.[
              visible && !reducedMotion ? "animated" : "static"
            ] ?? `.${clientIcon(family.replace("client:", ""))}`
          }
          alt={familyName(family)}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
export function Badge({ status, t }: { status: string; t: Translate }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {t(status as Key)}
    </span>
  );
}
export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <FileText size={28} />
      </div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  closeLabel = "Close",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  const tab = useTab();
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!tab.active) return;
    const dialog = ref.current;
    // show(), not showModal(): the tab-level save/discard dialog must stay usable.
    dialog?.show();
    if (dialog && !dialog.contains(document.activeElement))
      dialog.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select, button:not(.icon-button)")?.focus();
    return () => dialog?.close();
  }, [tab.active]);
  return (
    <>
      <div className="modal-backdrop" aria-hidden="true" />
      <dialog
        ref={ref}
        className={wide ? "modal wide" : "modal"}
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            e.preventDefault();
            e.stopPropagation();
            close.current();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon-button" aria-label={closeLabel} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}
export function TaskList({
  tasks,
  all,
  t,
  locale,
  onEdit,
  archived = false,
}: {
  tasks: Task[];
  all: Task[];
  t: Translate;
  locale: string;
  onEdit: (task: Task) => void;
  archived?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inSet = new Set(tasks.map((t) => t.id));
  const roots = tasks.filter(
    (task) => !task.parentId || !inSet.has(task.parentId),
  );
  const render = (task: Task, depth = 0): ReactNode => {
    const children = tasks.filter((c) => c.parentId === task.id),
      status = taskStatus(task, all);
    return (
      <div key={task.id}>
        <div className="task-row" style={{ paddingLeft: 18 + depth * 24 }}>
          <button
            className="disclosure"
            aria-label={`${t("tasks")}: ${task.title}`}
            onClick={() =>
              setCollapsed((s) => {
                const n = new Set(s);
                n.has(task.id) ? n.delete(task.id) : n.add(task.id);
                return n;
              })
            }
          >
            {children.length ? (
              collapsed.has(task.id) ? (
                <ChevronRight size={15} />
              ) : (
                <ChevronDown size={15} />
              )
            ) : (
              <span className={`task-dot ${status}`}>
                <Check size={10} />
              </span>
            )}
          </button>
          <button className="task-name" onClick={() => onEdit(task)}>
            <span>{task.title}</span>
            {children.length > 0 && (
              <small>
                {children.filter((c) => c.acceptedAt).length}/{children.length}
              </small>
            )}
          </button>
          <div className="avatar-stack">
            {task.assignees.slice(0, 3).map((f) => (
              <Avatar family={f} key={f} />
            ))}
          </div>
          <Badge status={status} t={t} />
          <span className="task-date">{formatDate(task.endDate, locale)}</span>
          <span className="mini-progress">
            <i style={{ width: `${task.acceptedAt ? 100 : task.progress}%` }} />
          </span>
        </div>
        {!collapsed.has(task.id) && children.map((c) => render(c, depth + 1))}
      </div>
    );
  };
  return tasks.length ? (
    <div className="task-list">{roots.map((r) => render(r))}</div>
  ) : (
    <Empty title={t(archived ? "emptyArchive" : "tasksEmpty")} />
  );
}

export function TaskEditor({
  task,
  workspace,
  t,
  onClose,
  onSave,
  onAction,
  onHandoff,
}: {
  task: Task | null;
  workspace: Workspace;
  t: Translate;
  onClose: () => void;
  onSave: (
    values: TaskValues,
    id: string,
    revision: number | null,
  ) => Promise<void>;
  onAction: (type: string, task: Task, reason?: string) => Promise<void>;
  onHandoff: (task: Task) => void;
}) {
  const { api, command } = useApi();
  const [values, setValues] = useState<TaskValues>(() =>
    task
      ? (Object.fromEntries(
          Object.keys(taskValuesSchema.shape).map((k) => [
            k,
            task[k as keyof Task],
          ]),
        ) as TaskValues)
      : taskValuesSchema.parse({ title: "New task" }),
  );
  const [title, setTitle] = useState(task?.title ?? "");
  const original = useRef(JSON.stringify({ ...values, title }));
  const dirty = original.current !== JSON.stringify({ ...values, title });
  useDirty(dirty, () =>
    onSave(
      taskValuesSchema.parse({ ...values, title }),
      task?.id ?? crypto.randomUUID(),
      task?.revision ?? null,
    ),
  );
  const close = () => {
    if (!dirty || confirm(t("unsaved"))) onClose();
  };
  const act = async (type: string) => {
    if (dirty) {
      setError(t("saveFirst"));
      return;
    }
    if (task) await onAction(type, task, reason);
  };
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  const set = <K extends keyof TaskValues>(key: K, value: TaskValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const tasks = workspace.state.tasks.filter(
    (x) => x.id !== task?.id && !x.archived,
  );
  return (
    <Modal title={task ? t("taskDetails") : t("newTask")} onClose={close} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () =>
            onSave(
              taskValuesSchema.parse({ ...values, title }),
              task?.id ?? crypto.randomUUID(),
              task?.revision ?? null,
            ),
          );
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <label className="full">
              {t("title")}
              <input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("required")}
              />
            </label>
            <label className="full">
              {t("description")}
              <textarea
                rows={3}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </label>
            <label>
              {t("status")}
              <select
                aria-label={t("status")}
                value={values.status}
                onChange={(e) =>
                  set("status", e.target.value as TaskValues["status"])
                }
              >
                <option value="todo">{t("todo")}</option>
                <option value="doing">{t("doing")}</option>
                <option value="delivered">{t("delivered")}</option>
              </select>
            </label>
            <label>
              {t("progress")} · {values.progress}%
              <input
                type="range"
                min="0"
                max="100"
                value={values.progress}
                onChange={(e) => set("progress", +e.target.value)}
              />
            </label>
            <label>
              {t("startDate")}
              <input
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </label>
            <label>
              {t("endDate")}
              <input
                type="date"
                value={values.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </label>
            <label className="full">
              {t("parent")}
              <select
                aria-label={t("parent")}
                value={values.parentId ?? ""}
                onChange={(e) => set("parentId", e.target.value || null)}
              >
                <option value="">{t("none")}</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="full">
              <legend>{t("assignees")}</legend>
              <div className="person-picker">
                {["human", ...ACTORS].map((f) => (
                  <button
                    type="button"
                    key={f}
                    aria-label={f === "human" ? t("human") : familyName(f)}
                    aria-pressed={values.assignees.includes(f as any)}
                    className={
                      values.assignees.includes(f as any)
                        ? "person selected"
                        : "person"
                    }
                    onClick={() =>
                      set(
                        "assignees",
                        values.assignees.includes(f as any)
                          ? values.assignees.filter((x) => x !== f)
                          : [...values.assignees, f as any],
                      )
                    }
                  >
                    <Avatar family={f} size={22} />
                    {f === "human" ? t("human") : familyName(f)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="full">
              <legend>{t("dependencies")}</legend>
              <div className="check-list">
                {tasks.length ? (
                  tasks.map((task) => (
                    <label className="check" key={task.id}>
                      <input
                        type="checkbox"
                        checked={values.dependencies.includes(task.id)}
                        onChange={(e) =>
                          set(
                            "dependencies",
                            e.target.checked
                              ? [...values.dependencies, task.id]
                              : values.dependencies.filter(
                                  (id) => id !== task.id,
                                ),
                          )
                        }
                      />
                      {task.title}
                    </label>
                  ))
                ) : (
                  <small>{t("none")}</small>
                )}
              </div>
            </fieldset>
            <label className="full">
              {t("handoff")}
              <textarea
                rows={3}
                value={values.handoff}
                onChange={(e) => set("handoff", e.target.value)}
              />
            </label>
            <fieldset className="full">
              <legend>{t("artifacts")}</legend>
              {values.artifacts.map((a) => (
                <div className="artifact-row" key={a.id}>
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      void run(async () => {
                        await api("artifact.reveal", { path: a.path });
                      })
                    }
                  >
                    <FolderOpen size={16} />
                    {a.label}
                  </button>
                  <code>{portableArtifactPath(a.path)}</code>{externalArtifactPath(a.path) && <small>{t("externalArtifact")}</small>}
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      void run(async () => {
                        const picked = await api("artifact.pick");
                        if (picked[0])
                          set(
                            "artifacts",
                            values.artifacts.map((item) =>
                              item.id === a.id
                                ? { ...item, path: picked[0].path }
                                : item,
                            ),
                          );
                      })
                    }
                  >
                    {t("relink")}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("deleteAction")}
                    onClick={() =>
                      set(
                        "artifacts",
                        values.artifacts.filter((x) => x.id !== a.id),
                      )
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button small"
                onClick={() =>
                  void run(async () =>
                    set("artifacts", [
                      ...values.artifacts,
                      ...(await api("artifact.pick")),
                    ]),
                  )
                }
              >
                <Plus size={14} />
                {t("addArtifact")}
              </button>
            </fieldset>
            <label className="check full">
              <input
                type="checkbox"
                checked={values.tableVisible}
                onChange={(e) => set("tableVisible", e.target.checked)}
              />
              {t("showTable")}
            </label>
          </div>
          {task && (
            <div className="acceptance">
              <h3>
                {t("acceptance")}{" "}
                <Badge status={taskStatus(task, workspace.state.tasks)} t={t} />
              </h3>
              <p>{t("acceptHint")}</p>
              {dirty && <p className="notice">{t("saveFirst")}</p>}
              <textarea
                aria-label={t("reason")}
                placeholder={t("reason")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              <div className="button-row">
                {task.status === "delivered" && !task.acceptedAt && (
                  <button
                    type="button"
                    disabled={busy}
                    className="button primary"
                    onClick={() => void run(() => act("task.accept"))}
                  >
                    <Check size={15} />
                    {t("accept")}
                  </button>
                )}
                {(task.acceptedAt || task.status === "delivered") && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => void run(() => act("task.return"))}
                  >
                    {t("returnWork")}
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    if (dirty) setError(t("saveFirst"));
                    else onHandoff(task);
                  }}
                >
                  <Send size={15} />
                  {t("handoff")}
                </button>
                <button
                  type="button"
                  className="button quiet"
                  onClick={() =>
                    void run(() =>
                      act(task.archived ? "task.restore" : "task.archive"),
                    )
                  }
                >
                  {t(task.archived ? "restore" : "archiveAction")}
                </button>
                {task.archived && (
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => {
                      if (confirm(t("confirmDelete")))
                        void run(() => act("task.delete"));
                    }}
                  >
                    <Trash2 size={15} />
                    {t("deleteAction")}
                  </button>
                )}
              </div>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-footer">
          <small>{t("reviewRequired")}</small>
          <button type="button" className="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button primary" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NoteEditor({
  note,
  t,
  onClose,
  onSave,
  onDelete,
}: {
  note: Partial<Note> | null;
  t: Translate;
  onClose: () => void;
  onSave: (note: any) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(note?.title ?? ""),
    [body, setBody] = useState(note?.body ?? ""),
    [kind, setKind] = useState(note?.kind ?? "note"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useDirty(
    title !== (note?.title ?? "") ||
      body !== (note?.body ?? "") ||
      kind !== (note?.kind ?? "note"),
    () => onSave({ title, body, kind }),
  );
  return (
    <Modal
      title={t(kind)}
      onClose={() => {
        if (
          (title === (note?.title ?? "") &&
            body === (note?.body ?? "") &&
            kind === (note?.kind ?? "note")) ||
          confirm(t("unsaved"))
        )
          onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void onSave({ title, body, kind })
            .catch((e) => setError(errorText(e, t)))
            .finally(() => setBusy(false));
        }}
      >
        <div className="modal-body form-grid">
          <label className="full">
            {t("title")}
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="full">
            {t("note")}
            <select
              aria-label={t("note")}
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
            >
              <option value="note">{t("note")}</option>
              <option value="meeting">{t("meeting")}</option>
            </select>
          </label>
          <label className="full">
            {t("body")}
            <textarea
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-footer">
          {note?.id && (
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => {
                if (confirm(t("confirmDeleteNote"))) {
                  setBusy(true);
                  void onDelete()
                    .catch((e) => setError(errorText(e, t)))
                    .finally(() => setBusy(false));
                }
              }}
            >
              {t("deleteAction")}
            </button>
          )}
          <button className="button primary" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProposalReview({
  record,
  t,
  onClose,
  onReview,
}: {
  record: ProposalRecord;
  t: Translate;
  onClose: () => void;
  onReview: (
    decision: string,
    reason: string,
    changes?: unknown,
  ) => Promise<void>;
}) {
  const draftKey = `haicomo.review-draft:${record.proposal.projectId}:${record.proposal.epoch}:${record.proposal.proposalId}`;
  const [initial] = useState(() => {
    const fallback = {
      edit: false,
      raw: JSON.stringify(record.proposal.changes, null, 2),
      reason: "",
    };
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      return saved &&
        typeof saved.edit === "boolean" &&
        typeof saved.raw === "string" &&
        typeof saved.reason === "string"
        ? (saved as typeof fallback)
        : fallback;
    } catch {
      return fallback;
    }
  });
  const [edit, setEdit] = useState(initial.edit),
    [raw, setRaw] = useState(initial.raw),
    [reason, setReason] = useState(initial.reason),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty =
    JSON.stringify({ edit, raw, reason }) !== JSON.stringify(initial);
  useDirty(dirty, async () => {
    localStorage.setItem(draftKey, JSON.stringify({ edit, raw, reason }));
  });
  const review = async (decision: string) => {
    setBusy(true);
    try {
      await onReview(decision, reason, edit ? JSON.parse(raw) : undefined);
      localStorage.removeItem(draftKey);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={record.proposal.title}
      onClose={() => {
        if (!dirty || confirm(t("unsaved"))) onClose();
      }}
      wide
    >
      <div className="modal-body">
        <p className="muted">
          {record.proposal.actor.name} · {record.proposal.reason}
        </p>
        <Badge status={record.status} t={t} />
        <p className="muted">{t("reviewDraftHint")}</p>
        {record.proposal.dependsOn.length > 0 && (
          <p>
            {t("dependencies")}: {record.proposal.dependsOn.join(", ")}
          </p>
        )}
        <div className="review-changes">
          {edit ? (
            <label>
              {t("proposalJson")}
              <textarea
                className="code-input"
                aria-label={t("proposalJson")}
                rows={15}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
            </label>
          ) : (
            record.proposal.changes.map((c, i) => (
              <div className="change" key={i}>
                <strong>
                  {c.entity} · {c.operation}
                </strong>
                <small>
                  {c.id} · revision {c.expectedRevision ?? "new"}
                </small>
                <pre>{JSON.stringify(c.values, null, 2)}</pre>
              </div>
            ))
          )}
        </div>
        <label>
          {t("reason")}
          <textarea
            aria-label={t("reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </label>
        {error && <div className="error-box">{error}</div>}
      </div>
      {record.status === "pending" && (
        <div className="modal-footer">
          <button
            className="button danger"
            disabled={busy}
            onClick={() => void review("reject")}
          >
            {t("reject")}
          </button>
          <button className="button" onClick={() => setEdit(!edit)}>
            {t("editApprove")}
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void review("approve")}
          >
            <Check size={16} />
            {t("approve")}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function PermissionDialog({
  request,
  t,
  onClose,
  onRespond,
}: {
  request: any;
  t: Translate;
  onClose: () => void;
  onRespond: (allow: boolean, answers?: any) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const questions = request.method.includes("requestUserInput")
    ? (request.params?.questions ?? [])
    : [];
  const send = async (allow: boolean) => {
    setBusy(true);
    try {
      await onRespond(
        allow,
        Object.fromEntries(
          Object.entries(answers).map(([id, value]) => [
            id,
            { answers: [value] },
          ]),
        ),
      );
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const approval = [
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
  ].includes(request.method);
  return (
    <Modal title={t("permission")} onClose={onClose}>
      <div className="modal-body">
        <strong>{request.method}</strong>
        {questions.length ? (
          questions.map((q: any) => (
            <label className="field" key={q.id}>
              <span>
                {q.header} · {q.question}
              </span>
              {q.options?.map((option: any) => (
                <label className="check-row" key={option.label}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === option.label}
                    onChange={() =>
                      setAnswers((a) => ({ ...a, [q.id]: option.label }))
                    }
                  />
                  {option.label} <small>{option.description}</small>
                </label>
              ))}
              <input
                aria-label={q.question}
                type={q.isSecret ? "password" : "text"}
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                }
              />
            </label>
          ))
        ) : (
          <pre className="permission-detail">
            {JSON.stringify(request.params, null, 2)}
          </pre>
        )}
        {!approval && !questions.length && <p>{t("integrationFallback")}</p>}
        {error && <div className="error-box">{error}</div>}
      </div>
      <div className="modal-footer">
        <button
          className="button"
          disabled={busy}
          onClick={() => void send(false)}
        >
          {t("deny")}
        </button>
        {(approval || questions.length > 0) && (
          <button
            className="button primary"
            disabled={
              busy || questions.some((q: any) => !answers[q.id]?.trim())
            }
            onClick={() => void send(true)}
          >
            {t(questions.length ? "save" : "allow")}
          </button>
        )}
      </div>
    </Modal>
  );
}

export function HandoffDialog({
  task,
  workspace,
  t,
  onClose,
  onComplete,
}: {
  task: Task;
  workspace: Workspace;
  t: Translate;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { api, command } = useApi();
  const promptId = useId();
  const [provider, setProvider] = useState<HarnessId>("codex"),
    [model, setModel] = useState(""),
    [effort, setEffort] = useState(""),
    [permissionMode, setPermissionMode] = useState(""),
    [threadId, setThread] = useState(""),
    [caps, setCaps] = useState<Capabilities[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState("");
  const [custom, setCustom] = useState(task.handoff);
  const [savedCustom, setSavedCustom] = useState(task.handoff);
  const text = connectionText(t.locale);
  const currentTask = workspace.state.tasks.find((item) => item.id === task.id);
  const prompt = currentTask ? composeAgentPrompt(workspace.directory, workspace.state, t.locale, task.id, custom) : "";
  const checkContext = async () => {
    const fresh: Workspace = await api("project.view");
    assertAgentConnection(fresh, task.id);
    if (composeAgentPrompt(fresh.directory, fresh.state, t.locale, task.id, custom) !== prompt) {
      onComplete();
      throw new Error("AGENT_CONTEXT_CHANGED");
    }
  };
  useEffect(() => {
    void api("providers.detect")
      .then(setCaps)
      .catch((e) => setError(errorText(e, t)));
  }, []);
  const cap = caps.find((c) => c.provider === provider);
  const modes = cap?.modes ?? [];
  const [copied, setCopied] = useState<"prompt" | "command" | null>(null);
  useEffect(() => {
    setCopied(null);
    setInfo("");
  }, [provider, model, effort, permissionMode, threadId, prompt]);
  const commandText = terminalCommand(
    navigator.userAgent.includes("Windows") ? "win32" : "darwin",
    workspace.directory,
    [
      cap?.executable || provider,
      ...(threadId
        ? [provider === "codex" ? "resume" : "--resume", threadId]
        : []),
      ...(model ? ["--model", model] : []),
      ...modeArguments(provider, permissionMode, effort),
      prompt,
    ],
  );
  const saveCustom = async () => {
    await command("change", {
      entity: "task", operation: "update", id: task.id,
      expectedRevision: currentTask?.revision ?? task.revision,
      values: { handoff: custom },
    });
    setSavedCustom(custom);
    onComplete();
  };
  useDirty(custom !== savedCustom, saveCustom);
  const copy = async (kind: "prompt" | "command") => {
    setCopied(null);
    setInfo("");
    setError("");
    try {
      await checkContext();
      await api("clipboard", {
        text: kind === "prompt" ? prompt : commandText,
      });
      setCopied(kind);
      setInfo(t("copied"));
      await record("copy");
      onComplete();
    } catch (e) {
      setError(errorText(e, t));
    }
  };
  const prerequisites = blockers(task, workspace.state.tasks);
  const efforts = capabilityEfforts(cap, model || undefined);
  const record = async (mode: string, sessionId?: string) =>
    api("project.command", {
      id: crypto.randomUUID(),
      type: "handoff.record",
      payload: {
        id: crypto.randomUUID(),
        taskId: task.id,
        provider,
        from: task.assignees,
        to:
          inferFamily(
            model || cap?.models?.find((m) => m.isDefault)?.id || "",
          ) ?? `client:${provider}`,
        prompt,
        sessionId,
        at: new Date().toISOString(),
        mode,
      },
    });
  const act = async (mode: "copy" | "foreground" | "background") => {
    setBusy(true);
    setError("");
    setCopied(null);
    setInfo("");
    try {
      await checkContext();
      if (mode === "background") {
        const result = await api("providers.start", {
          provider,
          taskId: task.id,
          prompt,
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
          ...(permissionMode ? { mode: permissionMode } : {}),
          ...(threadId ? { threadId } : {}),
        });
        await record(mode, result.runId);
        onComplete();
        onClose();
      } else if (mode === "copy") {
        await api("clipboard", { text: prompt });
        setCopied("prompt");
        await record(mode);
        setInfo(t("copied"));
        onComplete();
      } else if (provider !== "codex" && provider !== "claude") {
        await api("clipboard", { text: prompt });
        setCopied("prompt");
        if (cap?.appPath) await api("providers.open", { provider });
        else await api("terminal.open");
        await record(mode);
        setInfo(t("manualClientHandoff"));
        onComplete();
      } else {
        await api("clipboard", { text: commandText });
        setCopied("command");
        await api("terminal.open");
        await record(mode);
        setInfo(t("integrationFallback"));
        onComplete();
      }
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${t("handoff")} · ${task.title}`} onClose={onClose} wide>
      <div className="modal-body form-grid">
        <label>
          {t("provider")}
          <select
            aria-label={t("provider")}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as any);
              setEffort("");
              setPermissionMode("");
              setModel("");
              setThread("");
            }}
          >
            {CLIENTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("model")}
          <input
            value={model}
            list="provider-models"
            disabled={!cap?.model}
            onChange={(e) => {
              setModel(e.target.value);
              setEffort("");
            }}
            placeholder={t("auto")}
          />
          <datalist id="provider-models">
            {cap?.models?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          {t("effort")}
          <select
            aria-label={t("effort")}
            value={effort}
            disabled={!efforts.length}
            onChange={(e) => setEffort(e.target.value)}
          >
            <option value="">
              {efforts.length ? t("auto") : t("unsupported")}
            </option>
            {efforts.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          {t("relayMode")}
          <select
            aria-label={t("relayMode")}
            value={permissionMode}
            disabled={!modes.length}
            onChange={(e) => setPermissionMode(e.target.value)}
          >
            <option value="">{modes.length ? t("relayModeDefault") : t("unsupported")}</option>
            {modes.map((m) => (
              <option key={m} value={m}>{MODE_LABEL_KEYS[m] ? t(MODE_LABEL_KEYS[m] as Key) : m}</option>
            ))}
          </select>
        </label>
        <label>
          {t("speed")}
          <input disabled value={t("unsupported")} />
        </label>
        <label className="full">
          {t("session")}
          <input
            value={threadId}
            disabled={!cap?.resume}
            onChange={(e) => setThread(e.target.value)}
            placeholder={`${t("none")} → ${t("newTask")}`}
          />
        </label>
        <label className="full">
          {t("workingDirectory")}
          <input value={workspace.directory} disabled />
        </label>
        <div className="full">
          <div className="copy-heading">
            <label htmlFor={promptId}>{text.custom}</label>
            <button
              type="button"
              className="button small"
              onClick={() => void copy("prompt")}
            >
              {copied === "prompt" ? <Check size={15} /> : <Copy size={15} />}{" "}
              {copied === "prompt" ? t("copied") : t("copyPrompt")}
            </button>
          </div>
          <textarea
            id={promptId}
            rows={8}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        <label className="full">{text.preview}<textarea readOnly rows={8} value={prompt} /></label>
        {["codex", "claude"].includes(provider) && (
          <div className="full">
            <div className="copy-heading">
              <span>{t("terminal")}</span>
              <button
                className="button small"
                disabled={busy || !cap}
                onClick={() => void copy("command")}
              >
                {copied === "command" ? (
                  <Check size={15} />
                ) : (
                  <Copy size={15} />
                )}{" "}
                {copied === "command" ? t("copied") : t("copyCommand")}
              </button>
            </div>
            <pre className="command-preview">{commandText}</pre>
          </div>
        )}
        <p className="muted full">
          {cap?.background ? t("sendHint") : t("manualCapability")}{" "}
          {cap ? `${cap.version || t(cap.installed ? "available" : "unavailable")}` : ""}
          {cap?.reason && <span>{cap.reason}</span>}
        </p>
        {error && <div className="error-box full">{error}</div>}
        {info && <div className="notice full">{info}</div>}
      </div>
      <div className="modal-footer">
        <button className="button" disabled={busy || custom === savedCustom} onClick={() => void saveCustom().catch(e => setError(errorText(e, t)))}>{t("save")}</button>
        <button
          className="button"
          disabled={busy || !cap}
          onClick={() => void act("foreground")}
        >
          {t(provider !== "codex" && provider !== "claude" && cap?.appPath ? "openClientCopyPrompt" : "foreground")}
        </button>
        <button
          className="button primary"
          title={
            prerequisites.length
              ? `${t("blocked")}: ${prerequisites.map((t) => t.title).join(", ")}`
              : task.archived
                ? t("archive")
                : undefined
          }
          disabled={
            busy ||
            !cap?.background ||
            !prompt.trim() ||
            prerequisites.length > 0 ||
            task.archived
          }
          onClick={() => void act("background")}
        >
          <Send size={15} />
          {t("background")}
        </button>
      </div>
    </Modal>
  );
}
