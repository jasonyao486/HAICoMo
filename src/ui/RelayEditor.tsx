import { useEffect, useMemo, useState } from "react";
import { Check, RotateCw } from "lucide-react";
import {
  familyName,
  inferFamily,
  sessionAvatar,
  type Capabilities,
  type Settings,
  type Workspace,
} from "../shared/domain";
import { CLIENTS } from "../shared/clients";
import { capabilityEfforts, MODE_LABEL_KEYS } from "../shared/capabilities";
import {
  composeRelayPrompt,
  relayPredecessorCandidates,
  relayValuesSchema,
  validateRelay,
  RELAY_MAX_DELAY_MS,
  type Relay,
  type RelayValues,
} from "../shared/relay";
import { useApi, useDirty } from "./api";
import { Modal } from "./components";
import { errorText } from "./errors";
import type { Translate, Key } from "./i18n";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultAt = () => toLocalInput(new Date(Date.now() + 3600000).toISOString());
export function defaultRelayPrompt(workspace: Workspace, taskId: string) {
  const task = workspace.state.tasks.find((t) => t.id === taskId);
  if (task?.handoff.trim()) return task.handoff;
  return `Read .haicomo/AGENTS.md and .haicomo/snapshot.json in ${workspace.directory}.\nContinue task ${taskId}: ${task?.title ?? ""}.\n${task?.description ?? ""}\nStart from the reference deliverables listed below. Submit changes as a proposal and report deliverables for human acceptance.`;
}
export function RelayEditor({ relay, workspace, settings, t, onClose, onSaved }: { relay: Relay | null; workspace: Workspace; settings: Settings; t: Translate; onClose: () => void; onSaved: (w: Workspace) => void }) {
  const { api, command } = useApi();
  const state = workspace.state;
  const tasks = state.tasks.filter((x) => !x.archived);
  const candidates = useMemo(() => relayPredecessorCandidates(state, state.relays), [state]);
  const [title, setTitle] = useState(relay?.title ?? "");
  const [afterSessionId, setAfter] = useState(relay?.afterSessionId ?? "");
  const [triggerKind, setTriggerKind] = useState<"delay" | "at">(relay?.trigger.kind ?? "delay");
  const initialMs = relay?.trigger.kind === "delay" ? relay.trigger.ms : 0;
  const [hours, setHours] = useState(Math.floor(initialMs / 3600000));
  const [minutes, setMinutes] = useState(Math.floor((initialMs % 3600000) / 60000));
  const [seconds, setSeconds] = useState(Math.floor((initialMs % 60000) / 1000));
  const [at, setAt] = useState(relay?.trigger.kind === "at" ? toLocalInput(relay.trigger.iso) : defaultAt());
  const [provider, setProvider] = useState<"codex" | "claude">(relay?.handoff.provider ?? "codex");
  const [model, setModel] = useState(relay?.handoff.model ?? "");
  const [effort, setEffort] = useState(relay?.handoff.effort ?? "");
  const [mode, setMode] = useState(relay?.handoff.mode ?? "");
  const [threadId, setThread] = useState(relay?.handoff.threadId ?? "");
  const [continueThread, setContinue] = useState(relay?.handoff.continueThread ?? false);
  const [taskId, setTaskId] = useState(relay?.taskId ?? tasks[0]?.id ?? "");
  const [referenceTaskId, setReference] = useState(relay?.referenceTaskId ?? "");
  const [prompt, setPrompt] = useState(relay?.prompt ?? (tasks[0] ? defaultRelayPrompt(workspace, tasks[0].id) : ""));
  const [caps, setCaps] = useState<Capabilities[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("providers.detect").then(setCaps).catch((e) => setError(errorText(e, t)));
  }, []);
  const cap = caps.find((c) => c.provider === provider);
  const efforts = capabilityEfforts(cap, model || undefined);
  const modes = cap?.modes ?? [];
  const predecessor = candidates.find((s) => s.sessionId === afterSessionId);
  const values = (): RelayValues =>
    relayValuesSchema.parse({
      title,
      afterSessionId: afterSessionId || null,
      trigger: triggerKind === "delay" ? { kind: "delay", ms: (hours * 3600 + minutes * 60 + seconds) * 1000 } : { kind: "at", iso: new Date(at).toISOString() },
      handoff: { provider, model, effort, mode, threadId, continueThread },
      taskId,
      referenceTaskId: referenceTaskId || null,
      prompt,
    });
  const snapshot = JSON.stringify({ title, afterSessionId, triggerKind, hours, minutes, seconds, at, provider, model, effort, mode, threadId, continueThread, taskId, referenceTaskId, prompt });
  const [original] = useState(snapshot);
  const dirty = snapshot !== original;
  let preview = "";
  try {
    preview = composeRelayPrompt({ prompt, referenceTaskId: referenceTaskId || null, afterSessionId: afterSessionId || null, taskId }, state);
  } catch {
    preview = prompt;
  }
  const save = async (enabled: boolean) => {
    setBusy(true);
    setError("");
    try {
      const v = values();
      validateRelay(v, state, state.relays, relay?.id ?? null);
      const next = relay
        ? await command("relay.update", { relayId: relay.id, expectedRevision: relay.revision, values: v, enabled })
        : await command("relay.create", { values: v, enabled });
      onSaved(next);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  useDirty(dirty, () => save(relay ? relay.enabled : true));
  const modeLabel = (id: string) => (MODE_LABEL_KEYS[id] ? t(MODE_LABEL_KEYS[id] as Key) : id);
  const sessionLabel = (s: (typeof candidates)[number]) => {
    const task = state.tasks.find((x) => s.taskIds.includes(x.id));
    return `${familyName(sessionAvatar(s))} · ${s.model} · ${task?.title ?? s.taskIds[0] ?? ""} · ${s.lifecycle === "history" ? t("relayAfterCompleted") : t(s.status)}`;
  };
  return (
    <Modal title={relay ? t("relayEdit") : t("relayNew")} onClose={() => { if (!dirty || confirm(t("unsaved"))) onClose(); }} wide>
      <div className="modal-body form-grid relay-form">
        <p className="muted full">{t("relayLimitHint")}</p>
        <label className="full">
          {t("relayName")}
          <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t("relayName")} />
        </label>
        <fieldset className="full">
          <legend>{t("relayCondition1")}</legend>
          <label>
            {t("relayAfter")}
            <select aria-label={t("relayAfter")} value={afterSessionId} onChange={(e) => { setAfter(e.target.value); if (!e.target.value) setContinue(false); }}>
              <option value="">{t("relayAfterNone")}</option>
              {candidates.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>{sessionLabel(s)}</option>
              ))}
            </select>
          </label>
          {!candidates.length && <small className="muted">{t("relayNoCandidates")}</small>}
        </fieldset>
        <fieldset className="full">
          <legend>{t("relayCondition2")}</legend>
          <div className="relay-trigger">
            <label className="check">
              <input type="radio" name="trigger" checked={triggerKind === "delay"} onChange={() => setTriggerKind("delay")} />
              {afterSessionId ? t("relayDelay") : t("relayDelayNow")}
            </label>
            <div className="relay-hms" aria-label={t("relayDelay")}>
              <label><input type="number" min={0} max={720} value={hours} disabled={triggerKind !== "delay"} onChange={(e) => setHours(Math.max(0, +e.target.value || 0))} /> {t("unitHour")}</label>
              <label><input type="number" min={0} max={59} value={minutes} disabled={triggerKind !== "delay"} onChange={(e) => setMinutes(Math.min(59, Math.max(0, +e.target.value || 0)))} /> {t("unitMinute")}</label>
              <label><input type="number" min={0} max={59} value={seconds} disabled={triggerKind !== "delay"} onChange={(e) => setSeconds(Math.min(59, Math.max(0, +e.target.value || 0)))} /> {t("unitSecond")}</label>
            </div>
            <label className="check">
              <input type="radio" name="trigger" checked={triggerKind === "at"} onChange={() => setTriggerKind("at")} />
              {t("relayAt")}
            </label>
            <input type="datetime-local" aria-label={t("relayAt")} value={at} disabled={triggerKind !== "at"} onChange={(e) => e.target.value && setAt(e.target.value)} />
          </div>
        </fieldset>
        <fieldset className="full">
          <legend>{t("relayHandoffConfig")}</legend>
          <div className="form-grid">
            <label>
              {t("provider")}
              <select aria-label={t("provider")} value={provider} onChange={(e) => { setProvider(e.target.value as any); setModel(""); setEffort(""); setMode(""); setContinue(false); }}>
                {CLIENTS.map((c) => {
                  const known = caps.find((k) => k.provider === c.id);
                  const supported = c.id === "codex" || c.id === "claude";
                  return <option key={c.id} value={c.id} disabled={!supported}>{c.name}{known && !known.background ? ` · ${t(supported ? "unavailable" : "manualCapability")}` : ""}</option>;
                })}
              </select>
            </label>
            <label>
              {t("model")}
              <input value={model} list="relay-models" disabled={!cap?.model} onChange={(e) => { setModel(e.target.value); setEffort(""); }} placeholder={t("auto")} />
              <datalist id="relay-models">{cap?.models?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
            </label>
            <label>
              {t("effort")}
              <select aria-label={t("effort")} value={effort} disabled={!efforts.length} onChange={(e) => setEffort(e.target.value)}>
                <option value="">{efforts.length ? t("auto") : t("unsupported")}</option>
                {efforts.map((v) => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label>
              {t("relayMode")}
              <select aria-label={t("relayMode")} value={mode} disabled={!modes.length} onChange={(e) => setMode(e.target.value)}>
                <option value="">{t("relayModeDefault")}</option>
                {modes.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
              </select>
              <small className="muted">{t("modeHint")}</small>
            </label>
            <label className="full">
              {t("session")}
              <input value={threadId} disabled={!cap?.resume || continueThread} onChange={(e) => setThread(e.target.value)} placeholder={`${t("none")} → ${t("newTask")}`} />
            </label>
            {predecessor && (predecessor.harnessId ?? predecessor.provider) === provider && (
              <label className="check full">
                <input type="checkbox" checked={continueThread} onChange={(e) => setContinue(e.target.checked)} />
                {t("relayContinueThread")}{predecessor.threadId ? ` · ${predecessor.threadId}` : ""}
              </label>
            )}
          </div>
        </fieldset>
        <label>
          {t("relayTargetTask")}
          <select aria-label={t("relayTargetTask")} value={taskId} onChange={(e) => { setTaskId(e.target.value); if (!relay && !dirtyPrompt(prompt, workspace, taskId)) setPrompt(defaultRelayPrompt(workspace, e.target.value)); }}>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
        <label>
          {t("relayReferenceTask")}
          <select aria-label={t("relayReferenceTask")} value={referenceTaskId} onChange={(e) => setReference(e.target.value)}>
            <option value="">{afterSessionId ? t("relayReferenceDefault") : t("relayReferenceTargetDefault")}</option>
            {state.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
        <label className="full">
          {t("relayPrompt")}
          <textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <details className="full relay-preview">
          <summary>{t("relayPreview")}</summary>
          <pre>{preview}</pre>
        </details>
        <p className="muted full">{t("sendHint")} {cap ? cap.version || t("unavailable") : ""}{cap?.reason && <span> {cap.reason}</span>}</p>
        {error && <div className="error-box full" role="alert">{error}</div>}
      </div>
      <div className="modal-footer">
        <button type="button" className="button" disabled={busy} onClick={() => void api("providers.detect").then(setCaps)}><RotateCw size={14} /> {t("detect")}</button>
        <button type="button" className="button" disabled={busy || !prompt.trim() || !taskId} onClick={() => void save(false)}>{t("relaySaveDisabled")}</button>
        <button type="button" className="button primary" disabled={busy || !prompt.trim() || !taskId || !cap?.background} onClick={() => void save(true)}><Check size={15} /> {t("relaySaveEnable")}</button>
      </div>
    </Modal>
  );
}
function dirtyPrompt(prompt: string, workspace: Workspace, taskId: string) {
  return prompt.trim() !== defaultRelayPrompt(workspace, taskId).trim();
}
export const relayTargetFamily = (relay: Pick<Relay, "handoff">) => inferFamily(relay.handoff.model || "") ?? `client:${relay.handoff.provider}`;
