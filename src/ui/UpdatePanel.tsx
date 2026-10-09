import { useEffect, useRef, useState } from "react";
import { Check, Download, RefreshCw, X } from "lucide-react";
import type { UpdateState } from "../core/updates";
import { formatDuration, type Translate, type Key } from "./i18n";
import { api } from "./api";
import { errorText } from "./errors";
const statusKeys: Record<UpdateState["status"], Key> = { "not-configured": "updateNoSource", idle: "updates", checking: "updateChecking", available: "updateAvailable", "up-to-date": "updateCurrent", downloading: "updateDownloading", downloaded: "updateReady", preparing: "updatePreparing", installing: "updateInstalling", error: "updateFailure" };
const blockedKeys: Record<string, Key> = { UPDATE_APP_TRANSLOCATED: "updateBlockedTranslocated", UPDATE_RUNNING_FROM_DISK_IMAGE: "updateBlockedDiskImage", UPDATE_UNSIGNED_BUILD: "updateBlockedUnsigned", UPDATE_UNSUPPORTED_LOCATION: "updateBlockedLocation", UPDATE_UNMANAGED_INSTALL: "updateBlockedUnmanaged" };
const isMac = () => /Mac/i.test(navigator.platform || navigator.userAgent);
export function useUpdates() {
  const [state, setState] = useState<UpdateState>({ status: "idle", version: "" });
  useEffect(() => { void api("updates.state").then(setState); return window.haicomo.subscribe((e) => { if (e.event === "updates") setState(e.state); }); }, []);
  return state;
}
function statusText(state: UpdateState, t: Translate) {
  if (state.status === "not-configured") return t(state.sourceReason === "development" ? "updateDevBuild" : state.sourceReason === "unsupported-platform" ? "updateUnsupportedPlatform" : "updateNoSource");
  if (state.status === "downloading" && state.verifying) return t("updateVerifying");
  if (state.status === "preparing" && isMac()) return t("updatePreparingMac");
  return `${t(statusKeys[state.status])}${["available", "downloading", "downloaded", "preparing", "installing"].includes(state.status) && state.targetVersion ? ` ${state.targetVersion}` : ""}`;
}
export function errorKey(state: UpdateState): Key {
  const code = state.errorCode ?? "", text = state.error ?? "";
  if (code === "UPDATE_RATE_LIMITED") return "updateRateLimited";
  if (code === "UPDATE_NETWORK" || code === "UPDATE_SOURCE_UNAVAILABLE") return "updateNetworkError";
  if (["UPDATE_RELEASE_LIST_INVALID", "UPDATE_METADATA_MISMATCH", "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", "ERR_UPDATER_INVALID_UPDATE_INFO", "ERR_UPDATER_NO_CHECKSUM"].includes(code)) return "updateMetadataError";
  if (code === "ERR_CHECKSUM_MISMATCH" || /sha512|checksum|digest/i.test(text)) return "updateChecksumError";
  if (code === "ERR_UPDATER_INVALID_SIGNATURE" || /signature|code.?sign|signed/i.test(text)) return "updateSignatureError";
  return state.errorStage === "install" ? "updateInstallError" : state.errorStage === "download" ? "updateDownloadError" : "updateCheckError";
}
const mb = (bytes = 0) => (bytes / 1048576).toFixed(1);
/** Download figures: percentage, size, speed and estimated time remaining. */
export function progressText(state: UpdateState, t: Translate) {
  const parts = [`${Math.floor(state.percent ?? 0)}%`, `${mb(state.transferred)} / ${mb(state.total)} MB`];
  const speed = state.bytesPerSecond ?? 0;
  if (speed > 0) {
    parts.push(`${mb(speed)} MB/s`);
    const remaining = ((state.total ?? 0) - (state.transferred ?? 0)) / speed * 1000;
    if (remaining > 0) parts.push(t("updateRemaining").replace("{time}", formatDuration(remaining, t)));
  }
  return parts.join(" · ");
}
/** Check → download → verify → restart and install. */
export function UpdateSteps({ state, t }: { state: UpdateState; t: Translate }) {
  const visible = ["available", "downloading", "downloaded", "preparing", "installing"].includes(state.status) || state.status === "error" && state.errorStage !== "check";
  if (!visible) return null;
  const current = state.status === "available" ? 1 : state.status === "downloading" ? (state.verifying ? 2 : 1) : state.status === "downloaded" ? 3 : state.status === "error" ? (state.errorStage === "install" ? 3 : 1) : 3;
  const active = ["downloading", "preparing", "installing"].includes(state.status);
  const steps: Key[] = ["updateStepCheck", "updateStepDownload", "updateStepVerify", "updateStepInstall"];
  return <ol className="update-steps" aria-label={t("updates")}>
    {steps.map((key, i) => {
      const status = i < current ? "done" : i === current ? (state.status === "error" ? "failed" : active ? "active" : "next") : "todo";
      return <li key={key} className={status} aria-current={i === current ? "step" : undefined}><span>{status === "done" ? <Check size={12} /> : status === "failed" ? <X size={12} /> : i + 1}</span>{t(key)}</li>;
    })}
  </ol>;
}
export function UpdateActions({ state, t, notify, check }: { state: UpdateState; t: Translate; notify: (message: string, error?: boolean) => void; check?: () => Promise<void> }) {
  const run = (type: string, done?: () => void) => void api(type).then(done).catch((e) => notify(errorText(e, t), true));
  const busy = ["checking", "downloading", "preparing", "installing"].includes(state.status);
  return <div className="button-row">
    {check && <button className="button" disabled={busy} onClick={() => void check().catch((e) => notify(errorText(e, t), true))}><RefreshCw size={15} className={state.status === "checking" ? "spinning" : undefined} />{t("updates")}</button>}
    {(state.status === "available" || state.status === "error" && state.errorStage === "download") && !state.blocked && <><button className="button primary" onClick={() => run("updates.download")}><Download size={15} />{t(state.status === "error" ? "updateRetry" : "updateNow")}</button><button className="button" onClick={() => run("updates.defer")}>{t("updateLater")}</button></>}
    {state.status === "downloading" && <button className="button" onClick={() => run("updates.cancelDownload", () => notify(t("updateDownloadCancelled")))}>{t("cancelDownload")}</button>}
    {state.status === "downloaded" && <><button className="button primary" onClick={() => run("updates.install")}>{t("restartInstall")}</button><button className="button" onClick={() => run("updates.defer")}>{t("restartLater")}</button></>}
  </div>;
}
function UpdateProgress({ state, t, compact = false }: { state: UpdateState; t: Translate; compact?: boolean }) {
  if (state.status !== "downloading") return null;
  return <div className={compact ? "update-progress compact" : "update-progress"}>
    <progress max={100} value={state.verifying ? undefined : state.percent ?? 0} aria-label={t(state.verifying ? "updateVerifying" : "updateDownloading")} />
    <small>{state.verifying ? t("updateVerifying") : progressText(state, t)}</small>
  </div>;
}
// The floating banner steps aside while a Settings update panel is on screen.
const panelEvent = "haicomo:update-panel-visible";
const visiblePanels = new Set<Element>();
export function UpdatePanel({ t, notify, feed, setFeed, save, autoCheck, setAutoCheck }: { t: Translate; notify: (message: string, error?: boolean) => void; feed: string; setFeed: (v: string) => void; save: () => Promise<void>; autoCheck: boolean; setAutoCheck: (v: boolean) => Promise<void> }) {
  const state = useUpdates();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const report = () => window.dispatchEvent(new CustomEvent(panelEvent, { detail: visiblePanels.size > 0 }));
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) visiblePanels.add(element); else visiblePanels.delete(element); report(); });
    observer.observe(element);
    return () => { observer.disconnect(); visiblePanels.delete(element); report(); };
  }, []);
  const checked = state.lastChecked ? `${new Intl.DateTimeFormat(t.locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.lastChecked.at))}${state.lastChecked.ok || state.status === "error" ? "" : ` (${t("updateLastCheckFailed")})`}` : t("updateNeverChecked");
  const colon = t.locale.startsWith("zh") ? "：" : ": ";
  const openReleases = () => void api("legal.openExternal", { linkId: "releases" }).catch((e) => notify(errorText(e, t), true));
  return <section ref={ref} className="panel settings-panel update-panel"><h2>HAICoMo <small>{t("updateVersion")} {state.version}</small></h2>
    <p>{t("manualUpdates")}</p>
    {state.source && state.source !== "none" && <p className="update-source muted">{state.source === "custom" ? `${t("updateSourceCustom")}${colon}${state.sourceUrl}` : t("updateSourceOfficial")} · {t("updateLastChecked")}{colon}{checked}</p>}
    <UpdateSteps state={state} t={t} />
    <p role="status" className="update-status">{statusText(state, t)}</p>
    {state.newerWithoutPackage && <p className="update-note">{t("updateNewerWithoutPackage")} ({state.newerWithoutPackage}) <button className="link" onClick={openReleases}>{t("openReleasePage")}</button></p>}
    {state.blocked && ["available", "error"].includes(state.status) && <div className="error-box" role="alert"><p>{t(blockedKeys[state.blocked] ?? "updateBlockedLocation")}</p><button className="button" onClick={openReleases}>{t("openReleasePage")}</button></div>}
    {state.releaseNotes && ["available", "downloading", "downloaded"].includes(state.status) && <details className="update-whats-new"><summary>{t("updateWhatsNew")} {state.targetVersion}</summary><p className="update-notes">{state.releaseNotes}</p></details>}
    <UpdateProgress state={state} t={t} />
    {state.status === "downloaded" && <p className="update-note">{t("updateInstallHint")}</p>}
    {state.error && <div className="error-box" role="alert"><p>{t(errorKey(state))}</p><details><summary>{t("technicalDetails")}</summary><p className="update-notes">{state.error.slice(0, 1200)}</p></details></div>}
    <UpdateActions state={state} t={t} notify={notify} check={async () => { await save(); await api("updates.check"); }} />
    <label className="toggle-row">
      <div><strong>{t("updateAutoCheck")}</strong><p>{t("updateAutoCheckHint")}</p></div>
      <input type="checkbox" role="switch" aria-label={t("updateAutoCheck")} checked={autoCheck} onChange={(e) => void setAutoCheck(e.target.checked).catch((error) => notify(errorText(error, t), true))} />
    </label>
    <details className="update-advanced"><summary>{t("updateAdvanced")}</summary>
      <label>{t("updateFeed")}<input value={feed} placeholder={t("updateFeedPlaceholder")} onChange={(e) => setFeed(e.target.value)} /></label>
      <small className="muted">{t("updateFeedHint")}</small>
    </details>
    <div className="button-row">{([["releases", "latestRelease"], ["feedback", "githubFeedback"]] as const).map(([linkId, key]) => <button key={linkId} className="button" onClick={() => void api("legal.openExternal", { linkId }).catch((e) => notify(errorText(e, t), true))}>{t(key)}</button>)}
      <button className="button" onClick={() => void api("feedback.export", { description: "" }).catch((e) => notify(errorText(e, t), true))}>{t("exportDiagnostics")}</button></div>
  </section>;
}
// Mounted once per native window, outside the retained project trees.
export function UpdateNotice({ t, notify }: { t: Translate; notify: (message: string, error?: boolean) => void }) {
  const state = useUpdates();
  const [focused, setFocused] = useState(document.hasFocus());
  const [panelVisible, setPanelVisible] = useState(visiblePanels.size > 0);
  useEffect(() => { const seen = (e: Event) => setPanelVisible((e as CustomEvent<boolean>).detail); window.addEventListener(panelEvent, seen); return () => window.removeEventListener(panelEvent, seen); }, []);
  useEffect(() => { const focus = () => setFocused(true), blur = () => setFocused(false); window.addEventListener("focus", focus); window.addEventListener("blur", blur); return () => { window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); }; }, []);
  if (!focused) return null;
  if (state.restored) return <div className="update-banner" role="status"><p>{state.restored.failed ? t("updateRestoreFailed") : `${t("updateRestored")} ${state.restored.version} · ${t("updateRestoreOK")}`}</p><button className="button" onClick={() => void api("updates.acknowledge")}>{t("close")}</button></div>;
  if (panelVisible || state.deferred || !["available", "downloading", "downloaded"].includes(state.status) || state.blocked) return null;
  return <div className="update-banner" role="status"><strong>{statusText(state, t)}</strong><UpdateProgress state={state} t={t} compact /><UpdateActions state={state} t={t} notify={notify} /></div>;
}
