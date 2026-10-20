import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FolderOpen, Plus, Send } from "lucide-react";
import { composeAgentPrompt } from "../shared/agent-prompt";
import { structuredHandoff, type HandoffRecord } from "../shared/autonomy";
import { CLIENTS_BY_NAME, clientName, isBackgroundHarness, type HarnessId } from "../shared/clients";
import { inferFamily, type Capabilities, type Session, type Task, type Workspace } from "../shared/domain";
import { MODE_LABEL_KEYS } from "../shared/capabilities";
import { useApi } from "./api";
import { Modal } from "./components";
import { errorText } from "./errors";
import type { Key, Translate } from "./i18n";

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
const sessionEnd = (s: Session) => s.endedAt ?? s.at;
/** Runs of a task, newest first. */
export function taskRuns(task: Pick<Task, "id">, sessions: Session[]) {
  return sessions.filter((s) => s.taskIds.includes(task.id)).sort((a, b) => sessionEnd(b).localeCompare(sessionEnd(a)));
}
/** The newest finished run of the task that carried a delivery record. */
export function latestRecord(task: Pick<Task, "id">, sessions: Session[]): { session: Session; record: HandoffRecord } | null {
  for (const session of taskRuns(task, sessions)) {
    if (session.lifecycle !== "history") continue;
    const record = structuredHandoff(session.lastMessage || session.message);
    if (record) return { session, record };
  }
  return null;
}

/** The agent's own account of a delivery: read-only, with the reported paths checked against the project. */
export function DeliveryRecord({
  session,
  record,
  t,
  existing,
  onAdd,
}: {
  session: Session;
  record: HandoffRecord;
  t: Translate;
  /** Deliverable paths already on the task, so a reported path is offered only once. */
  existing?: string[];
  onAdd?: (path: string) => void;
}) {
  const { api } = useApi();
  const [found, setFound] = useState<boolean[] | null>(null);
  const [error, setError] = useState("");
  const key = record.artifacts.join("\n");
  useEffect(() => {
    let live = true;
    if (!record.artifacts.length) return;
    void api("artifact.exists", { paths: record.artifacts })
      .then((r: boolean[]) => live && setFound(r))
      .catch(() => live && setFound(null));
    return () => {
      live = false;
    };
  }, [key]);
  const agent = clientName(session.harnessId ?? session.provider);
  const rows: [Key, string][] = [
    ["recordGoalLabel", record.goal],
    ["recordEvidenceLabel", record.evidence],
    ["recordNextLabel", record.next],
    ["recordOpenLabel", record.open],
  ];
  return (
    <section className="delivery-record" aria-label={t("recordTitle")}>
      <header>
        <strong>{t("recordTitle")}</strong>
        <small>{fill(t("recordFrom"), { agent: `${agent}${session.model && session.model !== "default" ? ` · ${session.model}` : ""}`, time: new Date(sessionEnd(session)).toLocaleString(t.locale) })}</small>
      </header>
      <p className="muted">{t("recordSelfReported")}</p>
      <dl>
        {rows.slice(0, 1).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
        ))}
        {record.artifacts.length > 0 && (
          <div>
            <dt>{t("recordArtifactsLabel")}</dt>
            <dd>
              <ul className="record-artifacts">
                {record.artifacts.map((p, i) => {
                  const exists = found?.[i];
                  const added = existing?.includes(p);
                  return (
                    <li key={p}>
                      <code>{p}</code>
                      {exists === false && <small className="record-missing">{t("recordMissing")}</small>}
                      {exists && (
                        <button type="button" className="link" onClick={() => void api("artifact.reveal", { path: p }).catch((e: unknown) => setError(errorText(e, t)))}>
                          <FolderOpen size={14} />
                          {t("recordShow")}
                        </button>
                      )}
                      {exists && onAdd && (added ? <small>{t("recordAdded")}</small> : (
                        <button type="button" className="link" onClick={() => onAdd(p)}>
                          <Plus size={14} />
                          {t("recordAddArtifact")}
                        </button>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </div>
        )}
        {rows.slice(1).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {error && <div className="error-box">{error}</div>}
    </section>
  );
}

/**
 * Return a delivery with the reviewer's comments, to the agent that delivered
 * it (the default, continuing its session when the client can) or to another
 * agent chosen A–Z. "Return only" records the comments without starting anyone.
 */
export function ReturnDialog({
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
  onComplete: (workspace?: Workspace) => void;
}) {
  const { api, command } = useApi();
  const state = workspace.state;
  const last = useMemo(() => taskRuns(task, state.sessions).find((s) => s.source === "runner"), [task.id, state.sessions]);
  const previous = useMemo(() => latestRecord(task, state.sessions)?.record ?? null, [task.id, state.sessions]);
  const originalProvider = (last?.harnessId ?? last?.provider) as HarnessId | undefined;
  const [target, setTarget] = useState<"original" | "other">(originalProvider ? "original" : "other");
  const [other, setOther] = useState<HarnessId>(() => (CLIENTS_BY_NAME.find((c) => isBackgroundHarness(c.id) && c.id !== originalProvider)?.id ?? "codex") as HarnessId);
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("");
  const [comment, setComment] = useState("");
  const [caps, setCaps] = useState<Capabilities[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("providers.detect", { trigger: "recheck" })
      .then(setCaps)
      .catch((e: unknown) => setError(errorText(e, t)));
  }, []);
  const provider: HarnessId = target === "original" && originalProvider ? originalProvider : other;
  const cap = caps.find((c) => c.provider === provider);
  // Whether the delivering agent's session can be continued, shown on its row whichever target is selected.
  const originalResumes = Boolean(last?.threadId) && Boolean(caps.find((c) => c.provider === originalProvider)?.resume);
  const continueSession = target === "original" && originalResumes;
  const chosenModel = target === "original" ? (last?.model && last.model !== "default" ? last.model : "") : model;
  const prompt = composeAgentPrompt(workspace.directory, state, t.locale, task.id, task.handoff, undefined, undefined, { review: { comment, previous } });
  const record = async (sessionId: string | undefined, kind: "copy" | "background") =>
    api("project.command", {
      id: crypto.randomUUID(),
      type: "handoff.record",
      payload: {
        id: crypto.randomUUID(),
        taskId: task.id,
        provider,
        from: task.assignees,
        to: inferFamily(chosenModel || cap?.models?.find((m) => m.isDefault)?.id || "") ?? `client:${provider}`,
        prompt,
        sessionId,
        at: new Date().toISOString(),
        mode: kind,
      },
    });
  const returnTask = async () => {
    const fresh = state.tasks.find((x) => x.id === task.id) ?? task;
    return command("task.return", { taskId: task.id, expectedRevision: fresh.revision, reason: comment.trim() }) as Promise<Workspace>;
  };
  const act = async (kind: "send" | "only" | "copy") => {
    if (!comment.trim()) {
      setError(t("returnCommentHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const after = await returnTask();
      if (kind === "only") {
        onComplete(after);
        onClose();
        return;
      }
      if (kind === "copy") {
        await api("clipboard", { text: prompt });
        await record(undefined, "copy");
        onComplete(after);
        onClose();
        return;
      }
      try {
        const result = await api("providers.start", {
          provider,
          taskId: task.id,
          prompt,
          ...(chosenModel ? { model: chosenModel } : {}),
          ...(target === "other" && mode ? { mode } : {}),
          ...(continueSession ? { threadId: last!.threadId } : {}),
        });
        await record(result.runId, "background");
      } catch (e) {
        onComplete(after);
        setError(fill(t("returnStartFailed"), { reason: errorText(e, t) }));
        return;
      }
      onComplete(after);
      onClose();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const background = Boolean(cap?.background) && isBackgroundHarness(provider);
  const modes = target === "other" ? cap?.modes ?? [] : [];
  return (
    <Modal title={`${t("returnTitle")} · ${task.title}`} onClose={onClose} wide>
      <div className="modal-body form-grid">
        <label className="full">
          {t("returnComment")}
          <textarea rows={5} value={comment} onChange={(e) => { setComment(e.target.value); if (error === t("returnCommentHint")) setError(""); }} aria-describedby="return-comment-hint" />
          <small id="return-comment-hint" className="muted">{t("returnCommentHint")}</small>
        </label>
        <fieldset className="full return-target">
          <legend>{t("returnTarget")}</legend>
          <label className="check-row">
            <input type="radio" name="return-target" checked={target === "original"} disabled={!originalProvider} onChange={() => setTarget("original")} />
            <span>
              {t("returnOriginal")}
              {originalProvider ? (
                <small>
                  {" "}
                  {clientName(originalProvider)}
                  {last?.model && last.model !== "default" ? ` · ${last.model}` : ""} · {originalResumes ? t("returnContinue") : t("returnNewSession")}
                </small>
              ) : (
                <small> {t("returnOriginalNone")}</small>
              )}
            </span>
          </label>
          <label className="check-row">
            <input type="radio" name="return-target" checked={target === "other"} onChange={() => setTarget("other")} />
            <span>{t("returnOther")}</span>
          </label>
          {target === "other" && (
            <div className="return-other">
              <label>
                {t("provider")}
                <select aria-label={t("provider")} value={other} onChange={(e) => { setOther(e.target.value as HarnessId); setModel(""); setMode(""); }}>
                  {CLIENTS_BY_NAME.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("model")}
                <input value={model} list="return-models" disabled={!cap?.model} onChange={(e) => setModel(e.target.value)} placeholder={t("auto")} />
                <datalist id="return-models">
                  {cap?.models?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </datalist>
              </label>
              <label>
                {t("relayMode")}
                <select aria-label={t("relayMode")} value={mode} disabled={!modes.length} onChange={(e) => setMode(e.target.value)}>
                  <option value="">{modes.length ? t("relayModeDefault") : t("unsupported")}</option>
                  {modes.map((m) => <option key={m} value={m}>{MODE_LABEL_KEYS[m] ? t(MODE_LABEL_KEYS[m] as Key) : m}</option>)}
                </select>
              </label>
            </div>
          )}
        </fieldset>
        <label className="full">{t("returnPreview")}<textarea readOnly rows={7} value={prompt} /></label>
        {!background && cap && <p className="muted full">{t("manualCapability")}</p>}
        {error && <div className="error-box full">{error}</div>}
      </div>
      <div className="modal-footer">
        <button type="button" className="button" disabled={busy} onClick={() => void act("only")}>{t("returnOnly")}</button>
        <button type="button" className="button" disabled={busy} onClick={() => void act("copy")}>
          <Copy size={15} />
          {t("returnCopy")}
        </button>
        <button type="button" className="button primary" disabled={busy || !background || task.archived} onClick={() => void act("send")}>
          {busy ? <Check size={15} /> : <Send size={15} />}
          {t("returnSend")}
        </button>
      </div>
    </Modal>
  );
}
