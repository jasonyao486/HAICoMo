import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { UpdateState } from "../core/updates";
import type { Translate, Key } from "./i18n";
import { api } from "./api";
import { errorText } from "./errors";
const statusKeys: Record<UpdateState["status"], Key> = { "not-configured": "updateNoSource", idle: "updates", checking: "updateChecking", available: "updateAvailable", "up-to-date": "updateCurrent", downloading: "updateDownloading", downloaded: "updateReady", preparing: "updatePreparing", installing: "updateInstalling", error: "updateFailure" };
export function useUpdates() {
  const [state, setState] = useState<UpdateState>({ status: "idle", version: "" });
  useEffect(() => { void api("updates.state").then(setState); return window.haicomo.subscribe((e) => { if (e.event === "updates") setState(e.state); }); }, []);
  return state;
}
export function UpdateActions({ state, t, notify, check }: { state: UpdateState; t: Translate; notify: (message: string, error?: boolean) => void; check?: () => Promise<void> }) {
  const run = (type: string) => void api(type).catch((e) => notify(errorText(e, t), true));
  const busy = ["checking", "downloading", "preparing", "installing"].includes(state.status);
  return <div className="button-row">
    {check && <button className="button" disabled={busy} onClick={() => void check().catch((e) => notify(errorText(e, t), true))}>{t("updates")}</button>}
    {(state.status === "available" || state.status === "error" && state.errorStage === "download") && <><button className="button primary" onClick={() => run("updates.download")}><Download size={15} />{t(state.status === "error" ? "updateRetry" : "updateNow")}</button><button className="button" onClick={() => run("updates.defer")}>{t("updateLater")}</button></>}
    {state.status === "downloaded" && <><button className="button primary" onClick={() => run("updates.install")}>{t("restartInstall")}</button><button className="button" onClick={() => run("updates.defer")}>{t("restartLater")}</button></>}
  </div>;
}
export function UpdatePanel({ t, notify, feed, setFeed, save }: { t: Translate; notify: (message: string, error?: boolean) => void; feed: string; setFeed: (v: string) => void; save: () => Promise<void> }) {
  const state = useUpdates();
  const errorKey = /sha512|checksum|digest/i.test(state.error ?? "") ? "updateChecksumError" : /signature|code.?sign|signed/i.test(state.error ?? "") ? "updateSignatureError" : state.errorStage === "install" ? "updateInstallError" : state.errorStage === "download" ? "updateDownloadError" : "updateCheckError";
  return <section className="panel settings-panel update-panel"><h2>HAICoMo <small>version {state.version}</small></h2>
    <p>{t("manualUpdates")}</p>
    <div className="button-row">{([ ["releases", "latestRelease"], ["feedback", "githubFeedback"] ] as const).map(([linkId, key]) => <button key={linkId} className="button" onClick={() => void api("legal.openExternal", { linkId }).catch((e) => notify(errorText(e, t), true))}>{t(key)}</button>)}</div>
    <label>{t("updateFeed")}<input value={feed} placeholder="https://…" onChange={(e) => setFeed(e.target.value)} /></label>
    <p role="status" className="update-status">{t(statusKeys[state.status])} {state.targetVersion}</p>
    {state.releaseNotes && <details><summary>{t("updateDetails")}</summary><p className="update-notes">{state.releaseNotes}</p></details>}
    {state.status === "downloading" && <div><progress max={100} value={state.percent ?? 0} aria-label={t("updateDownloading")} /><small>{Math.floor(state.percent ?? 0)}% · {((state.transferred ?? 0) / 1048576).toFixed(1)} / {((state.total ?? 0) / 1048576).toFixed(1)} MB</small></div>}
    {state.error && <div className="error-box" role="alert"><p>{t(errorKey)}</p><details><summary>{t("technicalDetails")}</summary><p className="update-notes">{state.error.slice(0, 1200)}</p></details></div>}
    <UpdateActions state={state} t={t} notify={notify} check={async () => { await save(); await api("updates.check"); }} />
    <button className="button" onClick={() => void api("feedback.export", { description: "" }).catch((e) => notify(errorText(e, t), true))}>{t("exportDiagnostics")}</button>
  </section>;
}
// Mounted once per native window, outside the retained project trees.
export function UpdateNotice({ t, notify }: { t: Translate; notify: (message: string, error?: boolean) => void }) {
  const state = useUpdates();
  const [focused, setFocused] = useState(document.hasFocus());
  useEffect(() => { const focus = () => setFocused(true), blur = () => setFocused(false); window.addEventListener("focus", focus); window.addEventListener("blur", blur); return () => { window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); }; }, []);
  if (!focused) return null;
  if (state.restored) return <div className="update-banner" role="status"><p>{t(state.restored.failed ? "updateRestoreFailed" : "updateRestoreOK")} {state.restored.version}</p><button className="button" onClick={() => void api("updates.acknowledge")}>{t("close")}</button></div>;
  if (state.deferred || !["available", "downloaded"].includes(state.status)) return null;
  return <div className="update-banner" role="status"><strong>{t(statusKeys[state.status])} {state.targetVersion}</strong><UpdateActions state={state} t={t} notify={notify} /></div>;
}
