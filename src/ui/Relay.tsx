import { useEffect, useState } from "react";
import { Pause, Play, Pencil, Trash2, Zap, Ban, LayoutList, Clapperboard } from "lucide-react";
import { familyName, sessionAvatar, sessionStatus, type Settings, type Workspace } from "../shared/domain";
import { relayDecision, relayPredecessor, relayTitle, type Relay } from "../shared/relay";
import { useApi, useTab } from "./api";
import { Avatar, Empty } from "./components";
import { errorText } from "./errors";
import { Figure, Sofa, Workstation, useAnimationClock } from "./figures";
import { relayTargetFamily } from "./RelayEditor";
import { MODE_LABEL_KEYS } from "../shared/capabilities";
import type { Translate, Key } from "./i18n";

const STATUS_KEYS: Record<Relay["status"], Key> = { scheduled: "relayScheduled", paused: "relayPaused", blocked: "relayBlocked", missed: "relayMissed", firing: "relayFiring", fired: "relayFired", failed: "relayFailed", cancelled: "relayCancelled" };
export function relayStatusLabel(status: Relay["status"], t: Translate) {
  return t(STATUS_KEYS[status]);
}
function reasonText(relay: Relay, t: Translate) {
  const r = relay.statusReason;
  if (!r) return "";
  if (r === "PREDECESSOR_NOT_FOUND") return t("relayReasonPredecessorNotFound");
  if (r.startsWith("PREDECESSOR_")) return `${t("relayReasonPredecessorNotCompleted")} (${r.slice(12).toLowerCase()})`;
  if (r === "APP_NOT_RUNNING") return t("relayReasonAppNotRunning");
  if (r === "START_FAILED") return `${t("relayReasonStartFailed")}${relay.lastError ? `: ${relay.lastError.slice(0, 300)}` : ""}`;
  if (r === "manual") return t("relayReasonManual");
  return r;
}
const when = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleString(locale) : "");
function triggerText(relay: Relay, state: Workspace["state"], t: Translate, locale: string) {
  const trigger = relay.trigger.kind === "delay" ? `${relay.afterSessionId ? t("relayDelay") : t("relayDelayNow")} ${formatHms(relay.trigger.ms, t)}` : `${t("relayAt")} ${when(relay.trigger.iso, locale)}`;
  const decision = relayDecision(relay, state, Date.now(), null);
  const due = relay.status === "scheduled" ? (decision.dueAt ? `${t("relayDue")} ${when(decision.dueAt, locale)}` : `${t("relayDue")}: ${t("relayDueWaiting")}`) : relay.dueAt ? `${t("relayDue")} ${when(relay.dueAt, locale)}` : "";
  return { trigger, due };
}
export function formatHms(ms: number, t: Translate) {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h ? `${h} ${t("unitHour")}` : "", m ? `${m} ${t("unitMinute")}` : "", sec || (!h && !m) ? `${sec} ${t("unitSecond")}` : ""].filter(Boolean).join(" ");
}
export function RelayPage({ workspace, settings, t, onEdit, onAgent, onChanged }: { workspace: Workspace; settings: Settings; t: Translate; onEdit: (relay: Relay | null) => void; onAgent: (actor: string) => void; onChanged: (w: Workspace) => void }) {
  const { command } = useApi();
  const tab = useTab();
  const [visual, setVisual] = useState(() => { try { return localStorage.getItem("haicomo.relay-view") === "visual"; } catch { return false; } });
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const seconds = useAnimationClock(visual && workspace.state.relays.length > 0 && tab.active && !hidden && !settings.reducedMotion, 8);
  const state = workspace.state;
  const relays = state.relays.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const act = async (type: string, relay: Relay, confirmKey?: Key) => {
    if (confirmKey && !confirm(t(confirmKey))) return;
    try {
      onChanged(await command(type, { relayId: relay.id, expectedRevision: relay.revision }));
      setError("");
    } catch (e) {
      setError(errorText(e, t));
    }
  };
  const toggleView = (next: boolean) => {
    setVisual(next);
    try { localStorage.setItem("haicomo.relay-view", next ? "visual" : "text"); } catch {}
  };
  const actions = (relay: Relay) => (
    <div className="relay-actions">
      {!["firing", "fired"].includes(relay.status) && <button className="icon-button" title={t("relayEdit")} aria-label={t("relayEdit")} onClick={() => onEdit(relay)}><Pencil size={15} /></button>}
      {["scheduled", "blocked", "missed"].includes(relay.status) && <button className="icon-button" title={t("relayPause")} aria-label={t("relayPause")} onClick={() => void act("relay.pause", relay)}><Pause size={15} /></button>}
      {["paused", "blocked", "missed", "failed", "cancelled"].includes(relay.status) && <button className="icon-button" title={t("relayResume")} aria-label={t("relayResume")} onClick={() => void act("relay.resume", relay)}><Play size={15} /></button>}
      {["scheduled", "paused", "blocked", "missed", "failed"].includes(relay.status) && <button className="icon-button" title={t("relayFireNow")} aria-label={t("relayFireNow")} onClick={() => void act("relay.fireNow", relay, "relayConfirmFireNow")}><Zap size={15} /></button>}
      {["scheduled", "paused", "blocked", "missed", "failed"].includes(relay.status) && <button className="icon-button" title={t("relayCancelAction")} aria-label={t("relayCancelAction")} onClick={() => void act("relay.cancel", relay)}><Ban size={15} /></button>}
      {relay.status !== "firing" && <button className="icon-button danger" title={t("deleteAction")} aria-label={t("deleteAction")} onClick={() => void act("relay.delete", relay, "relayConfirmDelete")}><Trash2 size={15} /></button>}
    </div>
  );
  const details = (relay: Relay) => {
    const predecessor = relayPredecessor(relay, state);
    const task = state.tasks.find((x) => x.id === relay.taskId);
    const { trigger, due } = triggerText(relay, state, t, settings.locale);
    const reason = reasonText(relay, t);
    return {
      predecessor,
      task,
      trigger,
      due,
      reason,
      target: relayTargetFamily(relay),
      handoff: [relay.handoff.provider, relay.handoff.model || t("auto"), relay.handoff.effort, relay.handoff.mode ? (MODE_LABEL_KEYS[relay.handoff.mode] ? t(MODE_LABEL_KEYS[relay.handoff.mode] as Key) : relay.handoff.mode) : ""].filter(Boolean).join(" · "),
    };
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
            <div className={`relay-scene workstation ${settings.enhanced ? "enhanced" : ""}`} aria-label={t("relayWorkstation")}><Workstation enhanced={settings.enhanced} /></div>
            <div className="relay-arrow" aria-hidden="true">→</div>
            <div className={`relay-scene sofa ${settings.enhanced ? "enhanced" : ""}`} aria-label={t("relaySofa")}><Sofa enhanced={settings.enhanced} /></div>
          </div>}
          <Empty title={t("relayEmpty")} hint={t("relayEmptyHint")} action={<button className="button" onClick={() => onEdit(null)}>{t("relayNew")}</button>} />
        </div>
      ) : visual ? (
        <div className="relay-visual-list">
          {relays.map((relay, i) => {
            const d = details(relay);
            const workerActor = d.predecessor ? sessionAvatar(d.predecessor) : null;
            const workerRunning = d.predecessor ? d.predecessor.lifecycle !== "history" && sessionStatus(d.predecessor) === "running" : false;
            const span = 150, phase = Math.sin(seconds * 0.9 + i);
            const x = workerRunning ? 20 + (0.5 + 0.5 * phase) * span : 20 + span / 2;
            const flip = workerRunning ? Math.cos(seconds * 0.9 + i) < 0 : false;
            const waitingPose = relay.status === "fired" ? "run" : relay.status === "scheduled" || relay.status === "firing" ? (Math.floor(seconds / 6 + i) % 2 ? (settings.enhanced ? "hobby" : "sit") : "sleep") : "sit";
            return (
              <article className="relay-row visual" key={relay.id} data-relay-id={relay.id} data-status={relay.status} data-pose={waitingPose} onDoubleClick={() => onEdit(relay)}>
                <div className={`relay-scene workstation ${settings.enhanced ? "enhanced" : ""}`} aria-label={t("relayWorkstation")}>
                  <Workstation enhanced={settings.enhanced} />
                  {workerActor && (
                    <button type="button" className="relay-actor" style={{ left: x }} title={familyName(workerActor)} onContextMenu={(e) => { e.preventDefault(); onAgent(workerActor); }} onClick={() => onAgent(workerActor)}>
                      <Figure actor={workerActor} pose={workerRunning ? "run" : "idle"} seconds={seconds} enhanced={settings.enhanced} reducedMotion={settings.reducedMotion} flip={flip} />
                    </button>
                  )}
                </div>
                <div className="relay-arrow" aria-hidden="true">→</div>
                <div className={`relay-scene sofa ${settings.enhanced ? "enhanced" : ""}`} aria-label={t("relaySofa")}>
                  <Sofa enhanced={settings.enhanced} />
                  <button type="button" className="relay-actor seated" title={familyName(d.target)} onContextMenu={(e) => { e.preventDefault(); onAgent(d.target); }} onClick={() => onAgent(d.target)}>
                    <Figure actor={d.target} pose={waitingPose} seconds={seconds} enhanced={settings.enhanced} reducedMotion={settings.reducedMotion} flip={relay.status === "fired"} />
                    {waitingPose === "sleep" && <span className="relay-bubble">zᶻ</span>}
                  </button>
                </div>
                <div className="relay-caption">
                  <div><span className={`badge badge-relay-${relay.status}`}><i />{relayStatusLabel(relay.status, t)}</span> <strong>{relayTitle(relay, state)}</strong></div>
                  <small>{d.trigger}{d.due ? ` · ${d.due}` : ""} · {d.handoff} · {t("relayTargetTask")}: {d.task?.title ?? relay.taskId}</small>
                  {d.reason && <small className="relay-reason">{d.reason}</small>}
                </div>
                {actions(relay)}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <table className="relay-table">
            <thead>
              <tr><th>{t("status")}</th><th>{t("relayName")}</th><th>{t("relayAfter")}</th><th>{t("relayTrigger")}</th><th>{t("handoff")}</th><th>{t("relayTargetTask")}</th><th></th></tr>
            </thead>
            <tbody>
              {relays.map((relay) => {
                const d = details(relay);
                return (
                  <tr key={relay.id} data-relay-id={relay.id} data-status={relay.status}>
                    <td><span className={`badge badge-relay-${relay.status}`}><i />{relayStatusLabel(relay.status, t)}</span>{d.reason && <small className="relay-reason">{d.reason}</small>}</td>
                    <td><button className="link" onClick={() => onEdit(relay)}>{relayTitle(relay, state)}</button></td>
                    <td>{d.predecessor ? <span className="relay-cell"><Avatar family={sessionAvatar(d.predecessor)} size={22} /> {d.predecessor.model} · {d.predecessor.lifecycle === "history" ? t("relayAfterCompleted") : t(sessionStatus(d.predecessor))}</span> : <span className="muted">{t("relayAfterNone")}</span>}</td>
                    <td>{d.trigger}{d.due && <small>{d.due}</small>}</td>
                    <td><span className="relay-cell"><Avatar family={d.target} size={22} /> {d.handoff}</span>{relay.resultRunId && <small>{t("relayResult")}: {relay.resultRunId.slice(0, 8)}</small>}</td>
                    <td>{d.task?.title ?? relay.taskId}</td>
                    <td>{actions(relay)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
