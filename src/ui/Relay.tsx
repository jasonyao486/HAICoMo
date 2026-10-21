import { useEffect, useState, type ReactNode } from "react";
import { Pause, Play, Pencil, Trash2, Zap, Ban, LayoutList, Clapperboard, RotateCcw, FileText, Check, Bot } from "lucide-react";
import { sessionAvatar, sessionStatus, type AgentDetection, type Capabilities, type Settings, type Workspace } from "../shared/domain";
import {
  actorLabel,
  relayDecision,
  relayProgress,
  relayStarted,
  relayTitle,
  STAGE_LETTERS,
  type Relay,
  type RelayProgress,
  type RelayStepProgress,
  type RelayStepState,
} from "../shared/relay";
import { clientName } from "../shared/clients";
import { useApi, useTab } from "./api";
import { Avatar, Empty, Modal } from "./components";
import { errorText } from "./errors";
import { DeliveryRecord } from "./Review";
import { structuredHandoff } from "../shared/autonomy";
import { Figure, Sofa, Workstation, slotOffset, useAnimationClock, FURNITURE_WIDTH } from "./figures";
import { MODE_LABEL_KEYS } from "../shared/capabilities";
import type { Translate, Key } from "./i18n";
import type { Pose } from "../shared/art";

const STATUS_KEYS: Record<Relay["status"], Key> = { scheduled: "relayScheduled", paused: "relayPaused", blocked: "relayBlocked", missed: "relayMissed", firing: "relayFiring", running: "relayRunning", completed: "relayCompleted", failed: "relayFailed", cancelled: "relayCancelled" };
export const STEP_STATE_KEYS: Record<RelayStepState, Key> = {
  waiting: "relayStepWaiting",
  pending: "relayStepPending",
  starting: "relayStepStarting",
  running: "relayStepRunning",
  completed: "relayStepCompleted",
  overridden: "relayStepOverridden",
  stopped: "relayStepStopped",
  "start-failed": "relayStepStartFailed",
  "needs-human": "relayStepNeedsHuman",
};
export function relayStatusLabel(status: Relay["status"], t: Translate) {
  return t(STATUS_KEYS[status]);
}
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
export const stageName = (stage: number, t: Translate) => fill(t("relayStageName"), { s: STAGE_LETTERS[stage] ?? stage + 1 });
function reasonText(relay: Relay, t: Translate) {
  const r = relay.statusReason;
  if (!r) return "";
  if (r === "PREDECESSOR_NOT_FOUND") return t("relayReasonPredecessorNotFound");
  if (r.startsWith("PREDECESSOR_")) return `${t("relayReasonPredecessorNotCompleted")} (${r.slice(12).toLowerCase()})`;
  if (r === "APP_NOT_RUNNING") return t("relayReasonAppNotRunning");
  if (r === "START_FAILED" || r === "STEP_START_FAILED") return `${t("relayReasonStartFailed")}${relay.lastError ? `: ${startErrorText(relay.lastError, t)}` : ""}`;
  if (r === "INTERRUPTED") return t("relayReasonInterrupted");
  if (r === "NEEDS_HUMAN") return t("relayReasonNeedsHuman");
  if (r === "WORKTREE_MERGE_CONFLICT") return fill(t("relayReasonWorktreeConflict"), { branch: /WORKTREE_MERGE_CONFLICT:\s*(\S+)/.exec(relay.lastError)?.[1] ?? "" });
  if (r.startsWith("WORKTREE_")) return errorText(new Error(relay.lastError || r), t);
  if (r.startsWith("STEP_")) return `${t("relayReasonStepStopped")} (${r.slice(5).toLowerCase()})`;
  if (r === "manual") return t("relayReasonManual");
  if (r === "retry") return t("relayReasonRetry");
  return r;
}
/** Start errors are stored verbatim ("Error: CODE: client — detail"); show them translated, one per failed task. */
export const startErrorText = (stored: string, t: Translate) =>
  stored
    .split(/\n(?=(?:Error:\s*)?[A-Z][A-Z_]+[:\n]|Error:)/)
    .map((line) => errorText(new Error(line.trim()), t))
    .join(" · ")
    .slice(0, 600);
/** Whether the latest detection says this client can start the step now (unknown when never detected). */
export function clientUsable(detection: AgentDetection | null, provider: string, autonomous: boolean): { usable: boolean | null; cap?: Capabilities } {
  const cap = detection?.caps.find((c) => c.provider === provider);
  if (!cap) return { usable: null };
  return { usable: Boolean(cap.background || (autonomous && cap.relayReady)), cap };
}
export function useAgentDetection() {
  const { api } = useApi();
  const [detection, setDetection] = useState<AgentDetection | null>(null);
  useEffect(() => {
    let live = true;
    void api("providers.detection").then((r: { detection: AgentDetection | null }) => { if (live) setDetection(r.detection); }).catch(() => {});
    const off = window.haicomo.subscribe((e: any) => { if (e.event === "detection") setDetection(e.detection ?? null); });
    return () => { live = false; off(); };
  }, []);
  return detection;
}
const when = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleString(locale) : "");
function triggerText(relay: Relay, state: Workspace["state"], t: Translate, locale: string) {
  const trigger = relay.trigger.kind === "delay" ? `${relay.afterSessionId ? t("relayDelay") : t("relayDelayNow")} ${formatHms(relay.trigger.ms, t)}` : `${t("relayAt")} ${when(relay.trigger.iso, locale)}`;
  const decision = relayDecision(relay, state, Date.now(), null);
  const due = relay.status === "scheduled" ? (decision.dueAt ? `${t("relayDue")} ${when(decision.dueAt, locale)}` : `${t("relayDue")}: ${t("relayDueWaiting")}`) : !relayStarted(relay) && relay.dueAt ? `${t("relayDue")} ${when(relay.dueAt, locale)}` : "";
  return { trigger, due };
}
export function formatHms(ms: number, t: Translate) {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h ? `${h} ${t("unitHour")}` : "", m ? `${m} ${t("unitMinute")}` : "", sec || (!h && !m) ? `${sec} ${t("unitSecond")}` : ""].filter(Boolean).join(" ");
}
export const modeLabel = (mode: string, t: Translate) => (MODE_LABEL_KEYS[mode] ? t(MODE_LABEL_KEYS[mode] as Key) : mode);

/** One step node of the flowchart; shared by the relay list and the editor. */
export function FlowNode({ label, actor, title, sub, state, t, selected, onClick, children }: { label: string; actor: string; title: string; sub: string; state?: RelayStepProgress; t: Translate; selected?: boolean; onClick?: () => void; children?: ReactNode }) {
  const s = state?.state;
  const content = (
    <>
      <span className="relay-node-label">{label}</span>
      <Avatar family={actor} size={24} />
      <span className="relay-node-text">
        <strong>{title}</strong>
        <small>{sub}</small>
        {state && (
          <span className={`relay-step-state state-${s}`}>
            {t(STEP_STATE_KEYS[s!])}
            {state.waitingHuman ? ` · ${t("relayStepWaitingHuman")}` : state.stale ? ` · ${t("relayStepStale")}` : ""}
            {state.endReason && !["completed"].includes(state.endReason) ? ` · ${state.endReason}` : ""}
            {state.step.attempt > 1 ? ` · ${t("relayAttempt")} ${state.step.attempt}` : ""}
          </span>
        )}
        {state?.humanReason && <small className="relay-reason">{state.humanReason}</small>}
        {state?.state === "start-failed" && state.step.error && <small className="relay-reason">{startErrorText(state.step.error, t)}</small>}
      </span>
    </>
  );
  const record = state?.session?.lifecycle === "history" ? structuredHandoff(state.session.lastMessage || state.session.message) : null;
  return (
    <div className={`relay-flow-node ${selected ? "selected" : ""}`} data-step-state={s} data-step-label={label}>
      {onClick ? <button type="button" className="relay-node-main" onClick={onClick}>{content}</button> : <div className="relay-node-main">{content}</div>}
      {record && state?.session && (
        <details className="relay-record">
          <summary>{t("recordTitle")}</summary>
          <DeliveryRecord session={state.session} record={record} t={t} />
        </details>
      )}
      {children}
    </div>
  );
}
function RelayFlowView({ relay, progress, state, t, locale, onOverride, detection }: { relay: Relay; progress: RelayProgress; state: Workspace["state"]; t: Translate; locale: string; onOverride: (stepId: string) => void; detection: AgentDetection | null }) {
  const { trigger, due } = triggerText(relay, state, t, locale);
  const predecessor = progress.predecessor;
  return (
    <ol className="relay-flow" aria-label={t("relayFlow")}>
      <li className="relay-flow-stage relay-flow-start">
        <div className="relay-flow-stage-head">{t("relayStartCondition")}</div>
        <div className="relay-flow-node">
          <div className="relay-node-main">
            {predecessor ? <Avatar family={sessionAvatar(predecessor)} size={24} /> : <span className="relay-node-label">⏱</span>}
            <span className="relay-node-text">
              <strong>{predecessor ? `${actorLabel(sessionAvatar(predecessor))} · ${predecessor.model}` : t("relayAfterNone")}</strong>
              <small>{trigger}{due ? ` · ${due}` : ""}</small>
              {predecessor && <span className="relay-step-state">{predecessor.lifecycle === "history" ? t("relayAfterCompleted") : t(sessionStatus(predecessor))}</span>}
            </span>
          </div>
        </div>
      </li>
      {progress.steps.map((stage, si) => {
        const stageState = si < progress.stageIndex || progress.completed ? "done" : si === progress.stageIndex && relayStarted(relay) ? "current" : "waiting";
        return (
          <li key={si} className="relay-flow-stage" data-stage-state={stageState}>
            <div className="relay-flow-stage-head">{stageName(si, t)} · {t("relayStageParallel")}</div>
            {stage.map((p) => {
              const task = state.tasks.find((x) => x.id === p.step.taskId);
              return (
                <FlowNode
                  key={p.step.id}
                  label={p.label}
                  actor={p.actor}
                  title={task?.title ?? p.step.taskId}
                  sub={[clientName(p.step.provider), p.session?.model && p.session.model !== "default" ? p.session.model : p.step.model || t("auto"), relay.autonomy.enabled ? t("relayAutonomyBadge") : p.step.mode ? modeLabel(p.step.mode, t) : ""].filter(Boolean).join(" · ")}
                  state={p}
                  t={t}
                >
                  {["pending", "waiting", "start-failed", "stopped", "needs-human"].includes(p.state) && !["completed", "cancelled"].includes(relay.status) && (() => {
                    const { usable, cap } = clientUsable(detection, p.step.provider, relay.autonomy.enabled);
                    if (usable !== false || !cap) return null;
                    const why = !cap.installed ? t("unavailable") : cap.reason && !["MANUAL_HANDOFF_ONLY"].includes(cap.reason) ? errorText(new Error(cap.reason), t) : cap.autonomyOnly ? t("relayAutonomyOnly") : t("evidenceManual");
                    return <small className="relay-step-warning" role="note">⚠ {t("relayClientUnavailable")} {clientName(p.step.provider)} · {why}</small>;
                  })()}
                  {progress.retryable.some((x) => x.step.id === p.step.id) && !["firing", "running"].includes(relay.status) && (
                    <button type="button" className="button small" onClick={() => onOverride(p.step.id)}>
                      <Check size={13} /> {t("relayOverride")}
                    </button>
                  )}
                </FlowNode>
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}

const SEATED_HEIGHT = { enhanced: 66, plain: 56 };
const DESK_HEIGHT = { enhanced: 74, plain: 62 };
function bubbleOf(p: RelayStepProgress) {
  if (p.state === "completed" || p.state === "overridden") return "✓";
  if (p.state === "needs-human" || p.waitingHuman) return "?";
  if (p.state === "stopped" || p.state === "start-failed") return "!";
  return null;
}
function DeskScene({ relay, progress, seconds, settings, t, onAgent, index }: { relay: Relay | null; progress: RelayProgress | null; seconds: number; settings: Settings; t: Translate; onAgent: (actor: string) => void; index: number }) {
  const enhanced = settings.enhanced;
  const height = enhanced ? DESK_HEIGHT.enhanced : DESK_HEIGHT.plain;
  const started = relay ? relayStarted(relay) : false;
  const predecessor = progress?.predecessor;
  // Before stage A starts, the predecessor run (if any) works at the desk; afterwards the current stage does.
  const workers: { key: string; actor: string; pose: Pose; x: number; flip: boolean; bubble: string | null; title: string; label?: string }[] = [];
  if (!started && predecessor) {
    const running = predecessor.lifecycle !== "history" && sessionStatus(predecessor) === "running";
    const moving = running && !settings.reducedMotion;
    const phase = Math.sin(seconds * 0.9 + index);
    workers.push({ key: "predecessor", actor: sessionAvatar(predecessor), pose: running ? "run" : "idle", x: moving ? phase * (FURNITURE_WIDTH * 0.32) : 0, flip: moving ? Math.cos(seconds * 0.9 + index) < 0 : false, bubble: null, title: actorLabel(sessionAvatar(predecessor)) });
  } else if (progress)
    progress.desk.forEach((p, slot) => {
      const working = p.state === "running" && !p.waitingHuman;
      // Seats are about 74px apart: a lone worker may roam, neighbours only shuffle so figures never overlap; reduced motion keeps everyone in place.
      const sway = settings.reducedMotion ? 0 : progress.desk.length === 1 ? 24 : 5;
      const phase = Math.sin(seconds * 1.4 + slot * 2 + index);
      workers.push({
        key: p.step.id,
        actor: p.actor,
        pose: working ? "run" : p.state === "starting" ? "walk" : "idle",
        x: slotOffset(slot) + (working ? phase * sway : 0),
        flip: working && sway > 0 ? Math.cos(seconds * 1.4 + slot * 2 + index) < 0 : false,
        bubble: bubbleOf(p),
        title: `${p.label} · ${actorLabel(p.actor)} · ${t(STEP_STATE_KEYS[p.state])}`,
        label: p.label,
      });
    });
  return (
    <div className={`relay-scene workstation ${enhanced ? "enhanced" : ""}`} aria-label={progress && started ? fill(t("relayDeskStage"), { s: STAGE_LETTERS[progress.stageIndex] }) : t("relayWorkstation")}>
      <Workstation enhanced={enhanced} />
      {workers.map((w) => (
        <button key={w.key} type="button" className="relay-actor" data-step-label={w.label} style={{ left: `calc(50% + ${w.x}px)` }} title={w.title} onContextMenu={(e) => { e.preventDefault(); onAgent(w.actor); }} onClick={() => onAgent(w.actor)}>
          <Figure actor={w.actor} pose={w.pose} seconds={seconds} enhanced={enhanced} reducedMotion={settings.reducedMotion} flip={w.flip} height={height} maxWidth={FURNITURE_WIDTH / 3} />
          {w.bubble && <span className="relay-bubble">{w.bubble}</span>}
        </button>
      ))}
      {progress && started && <span className="relay-scene-label">{fill(t("relayDeskStage"), { s: STAGE_LETTERS[progress.stageIndex] })}</span>}
    </div>
  );
}
function SofaScene({ stage, seats, seconds, settings, t, onAgent, index, sleepy }: { stage: number | null; seats: RelayStepProgress[]; seconds: number; settings: Settings; t: Translate; onAgent: (actor: string) => void; index: number; sleepy: boolean }) {
  const enhanced = settings.enhanced;
  return (
    <div className={`relay-scene sofa ${enhanced ? "enhanced" : ""}`} data-stage={stage === null ? undefined : STAGE_LETTERS[stage]} aria-label={stage === null ? t("relaySofa") : fill(t("relaySofaStage"), { s: STAGE_LETTERS[stage] })}>
      <Sofa enhanced={enhanced} />
      {seats.map((p, slot) => {
        const pose: Pose = sleepy ? (Math.floor(seconds / 6 + index + slot) % 2 ? (enhanced ? "hobby" : "sit") : "sleep") : "sit";
        return (
          <button key={p.step.id} type="button" className="relay-actor seated" data-step-label={p.label} data-pose={pose} style={{ left: `calc(50% + ${slotOffset(slot)}px)` }} title={`${p.label} · ${actorLabel(p.actor)} · ${t(STEP_STATE_KEYS[p.state])}`} onContextMenu={(e) => { e.preventDefault(); onAgent(p.actor); }} onClick={() => onAgent(p.actor)}>
            <Figure actor={p.actor} pose={pose} seconds={seconds} enhanced={enhanced} reducedMotion={settings.reducedMotion} height={enhanced ? SEATED_HEIGHT.enhanced : SEATED_HEIGHT.plain} maxWidth={FURNITURE_WIDTH / 3 - 6} />
            {pose === "sleep" && <span className="relay-bubble">zᶻ</span>}
          </button>
        );
      })}
      {stage !== null && <span className="relay-scene-label">{fill(t("relaySofaStage"), { s: STAGE_LETTERS[stage] })}</span>}
    </div>
  );
}

export function RelayPage({ workspace, settings, t, onEdit, onAgent, onChanged }: { workspace: Workspace; settings: Settings; t: Translate; onEdit: (relay: Relay | null) => void; onAgent: (actor: string) => void; onChanged: (w: Workspace) => void }) {
  const { api, command } = useApi();
  const tab = useTab();
  const [visual, setVisual] = useState(() => { try { return localStorage.getItem("haicomo.relay-view") === "visual"; } catch { return false; } });
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(document.hidden);
  const [report, setReport] = useState<{ relay: Relay; markdown: string; file: string } | null>(null);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const seconds = useAnimationClock(visual && workspace.state.relays.length > 0 && tab.active && !hidden && !settings.reducedMotion, 8);
  const detection = useAgentDetection();
  const state = workspace.state;
  const relays = state.relays.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const act = async (type: string, relay: Relay, confirmKey?: Key, extra: Record<string, unknown> = {}) => {
    if (confirmKey && !confirm(t(confirmKey))) return;
    try {
      onChanged(await command(type, { relayId: relay.id, expectedRevision: relay.revision, ...extra }));
      setError("");
    } catch (e) {
      setError(errorText(e, t));
    }
  };
  const openReport = async (relay: Relay) => {
    try {
      const r = await api("relay.report", { relayId: relay.id });
      setReport({ relay, markdown: r.markdown, file: r.file });
    } catch (e) {
      setError(errorText(e, t));
    }
  };
  const toggleView = (next: boolean) => {
    setVisual(next);
    try { localStorage.setItem("haicomo.relay-view", next ? "visual" : "text"); } catch {}
  };
  const actions = (relay: Relay, progress: RelayProgress) => {
    const started = relayStarted(relay);
    const s = relay.status;
    const retry = started && ["blocked", "failed", "paused", "cancelled", "missed"].includes(s) && (progress.retryable.length > 0 || progress.unfired.length > 0);
    return (
      <div className="relay-actions">
        {!started && s !== "firing" && <button className="icon-button" title={t("relayEdit")} aria-label={t("relayEdit")} onClick={() => onEdit(relay)}><Pencil size={15} /></button>}
        {["scheduled", "running", "blocked", "missed"].includes(s) && <button className="icon-button" title={t("relayPause")} aria-label={t("relayPause")} onClick={() => void act("relay.pause", relay)}><Pause size={15} /></button>}
        {["paused", "blocked", "missed", "failed", "cancelled"].includes(s) && !(started && (s === "failed" || progress.retryable.length > 0)) && <button className="icon-button" title={t("relayResume")} aria-label={t("relayResume")} onClick={() => void act("relay.resume", relay)}><Play size={15} /></button>}
        {!started && ["scheduled", "paused", "blocked", "missed"].includes(s) && <button className="icon-button" title={t("relayFireNow")} aria-label={t("relayFireNow")} onClick={() => void act("relay.fireNow", relay, "relayConfirmFireNow")}><Zap size={15} /></button>}
        {retry && <button className="icon-button" title={t("relayRetry")} aria-label={t("relayRetry")} onClick={() => void act("relay.retry", relay, "relayConfirmRetry", { resume: true })}><RotateCcw size={15} /></button>}
        {!["completed", "cancelled", "firing"].includes(s) && <button className="icon-button" title={t("relayCancelAction")} aria-label={t("relayCancelAction")} onClick={() => void act("relay.cancel", relay)}><Ban size={15} /></button>}
        {started && <button className="icon-button" title={t("relayDecisions")} aria-label={t("relayDecisions")} onClick={() => void openReport(relay)}><FileText size={15} /></button>}
        {!["firing", "running"].includes(s) && <button className="icon-button danger" title={t("deleteAction")} aria-label={t("deleteAction")} onClick={() => void act("relay.delete", relay, "relayConfirmDelete")}><Trash2 size={15} /></button>}
      </div>
    );
  };
  const header = (relay: Relay, progress: RelayProgress) => {
    const { trigger, due } = triggerText(relay, state, t, settings.locale);
    const reason = reasonText(relay, t);
    const steps = progress.steps.flat().length;
    return (
      <div className="relay-caption">
        <div>
          <span className={`badge badge-relay-${relay.status}`}><i />{relayStatusLabel(relay.status, t)}</span>{" "}
          <button className="link" onClick={() => (relayStarted(relay) ? void openReport(relay) : onEdit(relay))}><strong>{relayTitle(relay, state)}</strong></button>
          {relay.autonomy.enabled && <span className="badge relay-autonomy-badge"><Bot size={12} /> {t("relayAutonomyBadge")}</span>}
        </div>
        <small>
          {trigger}{due ? ` · ${due}` : ""} · {fill(t("relayStepsSummary"), { n: steps, s: relay.stages.length })}
          {relayStarted(relay) && relay.status !== "completed" ? ` · ${stageName(relay.stageIndex, t)}` : ""}
        </small>
        {reason && <small className="relay-reason">{reason}</small>}
        {relay.status === "blocked" && relay.statusReason.startsWith("WORKTREE_") && (
          <button type="button" className="button small" onClick={() => void act("relay.resume", relay)}>
            <Play size={14} />
            {t(relay.statusReason === "WORKTREE_MERGE_CONFLICT" ? "relayMergedManually" : "relayMergeRetry")}
          </button>
        )}
        {(() => {
          // Copies of earlier attempts or unmerged stages stay on disk until the human removes them.
          const kept = relay.stages.flatMap((stage) => stage.steps).filter((st) => st.worktree && !(st.worktree.mergedAt && st.worktree.removed));
          return kept.length > 0 && ["blocked", "failed", "cancelled", "completed"].includes(relay.status) ? (
            <small className="relay-worktrees-kept">
              {t("relayWorktreeKept")}: {kept.map((st) => st.worktree!.branch).join(", ")}
            </small>
          ) : null;
        })()}
      </div>
    );
  };
  return (
    <>
      <div className="relay-toolbar">
        <p className="muted">{t("relayIntro")}</p>
        <div className="segmented" role="group" aria-label={t("relay")}>
          <button className={!visual ? "selected" : ""} aria-pressed={!visual} onClick={() => toggleView(false)}><LayoutList size={15} /> {t("relayTextView")}</button>
          <button className={visual ? "selected" : ""} aria-pressed={visual} onClick={() => toggleView(true)}><Clapperboard size={15} /> {t("relayVisualView")}</button>
        </div>
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
      {!relays.length ? (
        <div className={visual ? "relay-empty-preview" : undefined}>
          {visual && <div className="relay-row visual" aria-label={t("relayVisualView")}>
            <div className="relay-stage-strip">
              <DeskScene relay={null} progress={null} seconds={0} settings={settings} t={t} onAgent={onAgent} index={0} />
              <div className="relay-arrow" aria-hidden="true">→</div>
              <SofaScene stage={null} seats={[]} seconds={0} settings={settings} t={t} onAgent={onAgent} index={0} sleepy={false} />
            </div>
          </div>}
          <Empty title={t("relayEmpty")} hint={t("relayEmptyHint")} action={<button className="button" onClick={() => onEdit(null)}>{t("relayNew")}</button>} />
        </div>
      ) : visual ? (
        <div className="relay-visual-list">
          {relays.map((relay, i) => {
            const progress = relayProgress(relay, state);
            const sleepy = ["scheduled", "firing", "running"].includes(relay.status);
            const firstPose = sleepy ? (Math.floor(seconds / 6 + i) % 2 ? (settings.enhanced ? "hobby" : "sit") : "sleep") : "sit";
            return (
              <article className="relay-row visual" key={relay.id} data-relay-id={relay.id} data-status={relay.status} data-pose={progress.sofa.length ? firstPose : "run"} data-stage={STAGE_LETTERS[relay.stageIndex]} onDoubleClick={() => !relayStarted(relay) && onEdit(relay)}>
                <div className="relay-stage-strip">
                  <DeskScene relay={relay} progress={progress} seconds={seconds} settings={settings} t={t} onAgent={onAgent} index={i} />
                  {progress.sofa.length > 0 && <div className="relay-arrow" aria-hidden="true">←</div>}
                  {progress.sofa.map((seats) => (
                    <SofaScene key={seats[0].stageIndex} stage={seats[0].stageIndex} seats={seats} seconds={seconds} settings={settings} t={t} onAgent={onAgent} index={i} sleepy={sleepy} />
                  ))}
                </div>
                {header(relay, progress)}
                {actions(relay, progress)}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="relay-card-list">
          {relays.map((relay) => {
            const progress = relayProgress(relay, state);
            return (
              <article className="relay-card panel" key={relay.id} data-relay-id={relay.id} data-status={relay.status}>
                <div className="relay-card-head">
                  {header(relay, progress)}
                  {actions(relay, progress)}
                </div>
                <RelayFlowView relay={relay} progress={progress} state={state} t={t} locale={settings.locale} detection={detection} onOverride={(stepId) => void act("relay.overrideStep", relay, "relayConfirmOverride", { stepId })} />
              </article>
            );
          })}
        </div>
      )}
      {report && (
        <Modal title={`${t("relayDecisions")} · ${relayTitle(report.relay, state)}`} onClose={() => setReport(null)} wide>
          <div className="modal-body">
            <p className="muted">{t("relayDecisionsSavedAt")}: <code>{report.file.startsWith(workspace.directory) ? report.file.slice(workspace.directory.length).replace(/^[\\/]+/, "") : report.file}</code></p>
            <pre className="relay-report">{report.markdown}</pre>
          </div>
          <div className="modal-footer">
            <button className="button" onClick={() => void api("relay.report", { relayId: report.relay.id, action: "export" }).catch((e: unknown) => setError(errorText(e, t)))}>{t("relayDecisionsExport")}</button>
            <button className="button primary" onClick={() => void api("relay.report", { relayId: report.relay.id, action: "open" }).catch((e: unknown) => setError(errorText(e, t)))}>{t("relayDecisionsOpen")}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
