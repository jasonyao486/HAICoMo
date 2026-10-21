import { assertAgentConnection, connectionText } from "../shared/agent-prompt";
import { useEffect, useMemo, useState } from "react";
import { Check, Plus, RotateCw, X } from "lucide-react";
import {
  familyName,
  sessionAvatar,
  type Capabilities,
  type Settings,
  type Workspace,
} from "../shared/domain";
import { BACKGROUND_EVIDENCE, CLIENTS_BY_NAME, clientName, isBackgroundHarness } from "../shared/clients";
import { capabilityEfforts } from "../shared/capabilities";
import {
  composeRelayStepPrompt,
  relayPredecessorCandidates,
  relayStepActor,
  relayValuesSchema,
  relayWarnings,
  stepLabel,
  validateRelay,
  RELAY_MAX_STAGES,
  RELAY_MAX_STEPS,
  type Relay,
  type RelayStepValues,
  type RelayValues,
} from "../shared/relay";
import { useApi, useDirty } from "./api";
import { Modal } from "./components";
import { errorText } from "./errors";
import { FlowNode, modeLabel, stageName } from "./Relay";
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
  return "";
}
type DraftStep = Omit<RelayStepValues, "referenceTaskId"> & { key: string; referenceTaskId: string };
type DraftStage = { steps: DraftStep[] };
let draftKey = 0;
const nextKey = () => `draft-${++draftKey}`;
const EVIDENCE_KEYS: Record<string, Key> = { verified: "evidenceVerified", local: "evidenceLocal", documented: "evidenceDocumented" };
export const evidenceLabel = (id: string, t: Translate) => {
  const e = (BACKGROUND_EVIDENCE as Record<string, string>)[id];
  return e ? t(EVIDENCE_KEYS[e]) : t("evidenceManual");
};

export function RelayEditor({ relay, workspace, settings, t, onClose, onSaved }: { relay: Relay | null; workspace: Workspace; settings: Settings; t: Translate; onClose: () => void; onSaved: (w: Workspace) => void }) {
  const { api, command } = useApi();
  const state = workspace.state;
  const tasks = state.tasks.filter((x) => !x.archived);
  const candidates = useMemo(() => relayPredecessorCandidates(state, state.relays), [state]);
  const blankStep = (taskId = tasks[0]?.id ?? ""): DraftStep => ({
    key: nextKey(),
    provider: "codex",
    model: "",
    effort: "",
    mode: "",
    threadId: "",
    continueThread: false,
    taskId,
    referenceTaskId: "",
    prompt: taskId ? defaultRelayPrompt(workspace, taskId) : "",
  });
  const [title, setTitle] = useState(relay?.title ?? "");
  const [afterSessionId, setAfter] = useState(relay?.afterSessionId ?? "");
  const [triggerKind, setTriggerKind] = useState<"delay" | "at">(relay?.trigger.kind ?? "delay");
  const initialMs = relay?.trigger.kind === "delay" ? relay.trigger.ms : 0;
  const [hours, setHours] = useState(Math.floor(initialMs / 3600000));
  const [minutes, setMinutes] = useState(Math.floor((initialMs % 3600000) / 60000));
  const [seconds, setSeconds] = useState(Math.floor((initialMs % 60000) / 1000));
  const [at, setAt] = useState(relay?.trigger.kind === "at" ? toLocalInput(relay.trigger.iso) : defaultAt());
  const [stages, setStages] = useState<DraftStage[]>(() =>
    relay
      ? relay.stages.map((stage) => ({
          steps: stage.steps.map((s) => ({ key: nextKey(), id: s.id, provider: s.provider, model: s.model, effort: s.effort, mode: s.mode, threadId: s.threadId, continueThread: s.continueThread, taskId: s.taskId, referenceTaskId: s.referenceTaskId ?? "", prompt: s.prompt })),
        }))
      : [{ steps: [blankStep()] }],
  );
  const [selected, setSelected] = useState<[number, number]>([0, 0]);
  const [autonomy, setAutonomy] = useState(relay?.autonomy.enabled ?? false);
  const [consent, setConsent] = useState(Boolean(relay?.autonomy.enabled && relay.autonomy.consentedAt));
  const [caps, setCaps] = useState<Capabilities[]>([]);
  // null until the project folder has been checked for a git repository.
  const [gitRepo, setGitRepo] = useState<boolean | null>(null);
  const [worktrees, setWorktrees] = useState<boolean | null>(relay ? Boolean(relay.worktrees) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("providers.detect", { trigger: "recheck" }).then(setCaps).catch((e) => setError(errorText(e, t)));
    void api("project.git")
      .then((r: { repo: boolean }) => {
        setGitRepo(r.repo);
        // New relays in git projects default to separate working copies.
        setWorktrees((w) => (w === null ? r.repo : w));
      })
      .catch(() => setGitRepo(false));
  }, []);
  const [si, ti] = selected[0] < stages.length && selected[1] < stages[selected[0]].steps.length ? selected : [0, 0];
  const step = stages[si].steps[ti];
  const label = stepLabel(si, ti);
  const capOf = (provider: string) => caps.find((c) => c.provider === provider);
  const cap = capOf(step.provider);
  const efforts = capabilityEfforts(cap, step.model || undefined);
  const modes = cap?.modes ?? [];
  const predecessor = candidates.find((s) => s.sessionId === afterSessionId);
  const usable = (provider: string) => {
    const c = capOf(provider);
    return Boolean(c && (c.background || (autonomy && c.relayReady)));
  };
  const update = (patch: Partial<DraftStep>) =>
    setStages((all) => all.map((stage, a) => (a !== si ? stage : { steps: stage.steps.map((s, b) => (b !== ti ? s : { ...s, ...patch })) })));
  const addStep = (stage: number) => {
    setStages((all) => all.map((s, a) => (a !== stage ? s : { steps: [...s.steps, blankStep(tasks.find((x) => !s.steps.some((y) => y.taskId === x.id))?.id ?? tasks[0]?.id ?? "")] })));
    setSelected([stage, stages[stage].steps.length]);
  };
  const addStage = () => {
    setStages((all) => [...all, { steps: [blankStep()] }]);
    setSelected([stages.length, 0]);
  };
  const removeStep = (stage: number, index: number) => {
    setStages((all) => {
      const next = all.map((s, a) => (a !== stage ? s : { steps: s.steps.filter((_, b) => b !== index) })).filter((s) => s.steps.length > 0);
      return next.length ? next : [{ steps: [blankStep()] }];
    });
    setSelected([0, 0]);
  };
  const removeStage = (stage: number) => {
    setStages((all) => (all.length > 1 ? all.filter((_, a) => a !== stage) : all));
    setSelected([0, 0]);
  };
  const consentedAt = autonomy && consent ? (relay?.autonomy.enabled && relay.autonomy.consentedAt ? relay.autonomy.consentedAt : new Date().toISOString()) : null;
  const values = (): RelayValues =>
    relayValuesSchema.parse({
      title,
      afterSessionId: afterSessionId || null,
      trigger: triggerKind === "delay" ? { kind: "delay", ms: (hours * 3600 + minutes * 60 + seconds) * 1000 } : { kind: "at", iso: new Date(at).toISOString() },
      autonomy: { enabled: autonomy, consentedAt },
      ...(worktrees && gitRepo ? { worktrees: true } : {}),
      stages: stages.map((stage, a) => ({
        steps: stage.steps.map(({ key, ...s }) => ({ ...s, referenceTaskId: s.referenceTaskId || null, continueThread: a === 0 && s.continueThread })),
      })),
    });
  const snapshot = JSON.stringify({ title, afterSessionId, triggerKind, hours, minutes, seconds, at, autonomy, consent, worktrees: relay ? Boolean(worktrees) : null, stages: stages.map((s) => s.steps.map(({ key, ...v }) => v)) });
  const [original] = useState(snapshot);
  const dirty = snapshot !== original;
  const draft = { afterSessionId: afterSessionId || null, autonomy: { enabled: autonomy, consentedAt }, stages: stages.map((s) => ({ steps: s.steps.map(({ key, ...v }) => ({ ...v, referenceTaskId: v.referenceTaskId || null })) })) };
  let preview = "";
  try {
    preview = composeRelayStepPrompt(draft, si, { prompt: step.prompt, referenceTaskId: step.referenceTaskId || null, taskId: step.taskId }, state, workspace.directory, settings.locale, { placeholder: true });
  } catch {
    preview = step.prompt;
  }
  const warnings = relayWarnings(draft, state);
  const allSteps = stages.flatMap((s) => s.steps);
  const ready = allSteps.every((s) => s.taskId && usable(s.provider)) && (!autonomy || consent);
  const save = async (enabled: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (autonomy && !consent) throw new Error("RELAY_AUTONOMY_CONSENT_REQUIRED");
      const fresh: Workspace = await api("project.view");
      assertAgentConnection(fresh);
      for (const s of allSteps) if (!fresh.state.tasks.some((x) => x.id === s.taskId)) throw new Error("TASK_NOT_FOUND");
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
  const sessionLabel = (s: (typeof candidates)[number]) => {
    const task = state.tasks.find((x) => s.taskIds.includes(x.id));
    return `${familyName(sessionAvatar(s))} · ${s.model} · ${task?.title ?? s.taskIds[0] ?? ""} · ${s.lifecycle === "history" ? t("relayAfterCompleted") : t(s.status)}`;
  };
  const autonomousMode = (provider: string) => capOf(provider)?.autonomousMode;
  return (
    <Modal title={relay ? t("relayEdit") : t("relayNew")} onClose={() => { if (!dirty || confirm(t("unsaved"))) onClose(); }} wide className="relay-editor">
      <div className="modal-body form-grid relay-form">
        <p className="muted full">{t("relayLimits")} {t("relayLimitHint")}</p>
        <label className="full">
          {t("relayName")}
          <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t("relayName")} />
        </label>
        <fieldset className="full">
          <legend>{t("relayCondition1")}</legend>
          <label>
            {t("relayAfter")}
            <select aria-label={t("relayAfter")} value={afterSessionId} onChange={(e) => { setAfter(e.target.value); if (!e.target.value) setStages((all) => all.map((s) => ({ steps: s.steps.map((x) => ({ ...x, continueThread: false })) }))); }}>
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
          <legend>{t("relayFlow")}</legend>
          <ol className="relay-flow relay-flow-edit" aria-label={t("relayFlow")}>
            {stages.map((stage, a) => (
              <li key={a} className="relay-flow-stage" data-stage-state="edit">
                <div className="relay-flow-stage-head">
                  {stageName(a, t)} · {t("relayStageParallel")}
                  {stages.length > 1 && <button type="button" className="icon-button" title={t("relayRemoveStage")} aria-label={`${t("relayRemoveStage")} ${stageName(a, t)}`} onClick={() => removeStage(a)}><X size={13} /></button>}
                </div>
                {stage.steps.map((s, b) => {
                  const task = state.tasks.find((x) => x.id === s.taskId);
                  return (
                    <FlowNode
                      key={s.key}
                      label={stepLabel(a, b)}
                      actor={relayStepActor(s)}
                      title={task?.title ?? t("relayStepNoTask")}
                      sub={[clientName(s.provider), s.model || t("auto")].join(" · ")}
                      t={t}
                      selected={a === si && b === ti}
                      onClick={() => setSelected([a, b])}
                    >
                      {(stage.steps.length > 1 || stages.length > 1) && (
                        <button type="button" className="icon-button" title={t("relayRemoveStep")} aria-label={`${t("relayRemoveStep")} ${stepLabel(a, b)}`} onClick={() => removeStep(a, b)}><X size={13} /></button>
                      )}
                    </FlowNode>
                  );
                })}
                {stage.steps.length < RELAY_MAX_STEPS && (
                  <button type="button" className="button small relay-add" onClick={() => addStep(a)}><Plus size={13} /> {t("relayAddStep")}</button>
                )}
              </li>
            ))}
            {stages.length < RELAY_MAX_STAGES && (
              <li className="relay-flow-stage relay-flow-add">
                <button type="button" className="button small relay-add" onClick={addStage}><Plus size={13} /> {t("relayAddStage")}</button>
              </li>
            )}
          </ol>
        </fieldset>
        <fieldset className="full relay-step-editor">
          <legend>{t("relayStepEditing").replace("{label}", label)}</legend>
          <div className="form-grid">
            <label>
              {t("provider")}
              <select aria-label={t("provider")} value={step.provider} onChange={(e) => update({ provider: e.target.value as DraftStep["provider"], model: "", effort: "", mode: "", continueThread: false })}>
                {CLIENTS_BY_NAME.filter((c) => isBackgroundHarness(c.id)).map((c) => {
                  const known = capOf(c.id);
                  return (
                    <option key={c.id} value={c.id} disabled={!usable(c.id) && c.id !== step.provider}>
                      {c.name} · {evidenceLabel(c.id, t)}{known && !usable(c.id) ? ` · ${known.autonomyOnly ? t("relayAutonomyOnly") : t("unavailable")}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              {t("model")}
              <input value={step.model} list="relay-models" disabled={!cap?.model} onChange={(e) => update({ model: e.target.value, effort: "" })} placeholder={t("auto")} />
              <datalist id="relay-models">{cap?.models?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
            </label>
            <label>
              {t("effort")}
              <select aria-label={t("effort")} value={step.effort} disabled={!efforts.length} onChange={(e) => update({ effort: e.target.value })}>
                <option value="">{efforts.length ? t("auto") : t("unsupported")}</option>
                {efforts.map((v) => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label>
              {t("relayMode")}
              {autonomy ? (
                <select aria-label={t("relayMode")} value="" disabled>
                  <option value="">{autonomousMode(step.provider) ? modeLabel(autonomousMode(step.provider)!, t) : t("relayAutonomyNoFlag")}</option>
                </select>
              ) : (
                <select aria-label={t("relayMode")} value={step.mode} disabled={!modes.length} onChange={(e) => update({ mode: e.target.value })}>
                  <option value="">{t("relayModeDefault")}</option>
                  {modes.map((m) => <option key={m} value={m}>{modeLabel(m, t)}</option>)}
                </select>
              )}
              <small className="muted">{t("modeHint")}</small>
            </label>
            <label className="full">
              {t("session")}
              <input value={step.threadId} disabled={!cap?.resume || step.continueThread} onChange={(e) => update({ threadId: e.target.value })} placeholder={`${t("none")} → ${t("newTask")}`} />
            </label>
            {si === 0 && predecessor && (predecessor.harnessId ?? predecessor.provider) === step.provider && (
              <label className="check full">
                <input type="checkbox" checked={step.continueThread} onChange={(e) => update({ continueThread: e.target.checked })} />
                {t("relayContinueThread")}{predecessor.threadId ? ` · ${predecessor.threadId}` : ""}
              </label>
            )}
            <label>
              {t("relayTargetTask")}
              <select aria-label={t("relayTargetTask")} value={step.taskId} onChange={(e) => update({ taskId: e.target.value, ...(step.prompt.trim() === defaultRelayPrompt(workspace, step.taskId).trim() ? { prompt: defaultRelayPrompt(workspace, e.target.value) } : {}) })}>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label>
              {t("relayReferenceTask")}
              <select aria-label={t("relayReferenceTask")} value={step.referenceTaskId} onChange={(e) => update({ referenceTaskId: e.target.value })}>
                <option value="">{si === 0 && afterSessionId ? t("relayReferenceDefault") : t("relayReferenceTargetDefault")}</option>
                {state.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label className="full">
              {connectionText(settings.locale).custom}
              <textarea rows={5} value={step.prompt} onChange={(e) => update({ prompt: e.target.value })} />
            </label>
            <details className="full relay-preview">
              <summary>{t("relayPreview")}</summary>
              <pre>{preview}</pre>
            </details>
            <p className="muted full">{t("sendHint")} {cap ? cap.version || t("unavailable") : ""}{cap?.reason && <span> {errorText(new Error(cap.reason), t)}</span>}</p>
          </div>
        </fieldset>
        {warnings.length > 0 && (
          <div className="notice full">
            {t("relayWarnings")}:
            <ul>{warnings.map((w) => <li key={w.label}>{w.label}: {w.tasks.join(", ")}</li>)}</ul>
          </div>
        )}
        <fieldset className={`full relay-worktrees ${worktrees && gitRepo ? "on" : ""}`}>
          <legend>{t("relayWorktree")}</legend>
          <label className="check">
            <input type="checkbox" checked={Boolean(worktrees && gitRepo)} disabled={!gitRepo} onChange={(e) => setWorktrees(e.target.checked)} />
            {t("relayWorktree")}
          </label>
          <small className="muted">{gitRepo === false ? t("relayWorktreeNoGit") : t("relayWorktreeHint")}</small>
        </fieldset>
        <fieldset className={`full relay-autonomy ${autonomy ? "on" : ""}`}>
          <legend>{t("relayAutonomy")}</legend>
          <label className="check">
            <input type="checkbox" checked={autonomy} onChange={(e) => { setAutonomy(e.target.checked); if (!e.target.checked) setConsent(false); }} />
            {t("relayAutonomy")}
          </label>
          <small className="muted">{t("relayAutonomyHint")}</small>
          {autonomy && (
            <>
              <div className="relay-autonomy-flags">
                <strong>{t("relayAutonomyFlags")}</strong>
                <ul>
                  {allSteps.map((s) => {
                    const where = stages.findIndex((stage) => stage.steps.includes(s));
                    const c = capOf(s.provider);
                    // ACP and Claude's host channel ask HAICoMo, which answers like it does for Codex.
                    const answered = s.provider === "codex" || c?.channel === "acp" || c?.channel === "host";
                    const mode = c?.channel === "acp" ? undefined : autonomousMode(s.provider);
                    return <li key={s.key}>{stepLabel(where, stages[where].steps.indexOf(s))} · {clientName(s.provider)}: {mode ? modeLabel(mode, t) : t("relayAutonomyNoFlag")}{answered ? ` · ${t("relayAutonomyAnswered")}` : ""}</li>;
                  })}
                </ul>
              </div>
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                {t("relayAutonomyConsent")}
              </label>
              {!consent && <small className="relay-reason">{t("relayAutonomyNeedsConsent")}</small>}
            </>
          )}
        </fieldset>
        {error && <div className="error-box full" role="alert">{error}</div>}
      </div>
      <div className="modal-footer">
        <button type="button" className="button" disabled={busy} onClick={() => void api("providers.detect").then(setCaps).catch((e) => setError(errorText(e, t)))}><RotateCw size={14} /> {t("detect")}</button>
        <button type="button" className="button" disabled={busy || !allSteps.every((s) => s.taskId) || (autonomy && !consent)} onClick={() => void save(false)}>{t("relaySaveDisabled")}</button>
        <button type="button" className="button primary" disabled={busy || !ready} onClick={() => void save(true)}><Check size={15} /> {t("relaySaveEnable")}</button>
      </div>
    </Modal>
  );
}
