import { useState } from "react";
import { Modal } from "./components";
import type { Translate } from "./i18n";
import { errorText } from "./errors";
export function LegacyImport({ data, t, onClose, onImport }: { data: any; t: Translate; onClose: () => void; onImport: (ids: string[]) => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(data.projects.map((p: any) => p.id)), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const missing = (data.crossProjectDependencies ?? []).filter((d: any) => ids.includes(d.from) && !ids.includes(d.to));
  return <Modal title={t("importLegacy")} onClose={onClose}><div className="modal-body">
    <p>{t("importLegacyHint")}</p><small>{data.file}</small><p>{t("legacyCrossHint")}</p>
    {data.projects.map((p: any) => <label className="toggle-row" key={p.id}><span><strong>{p.title}</strong><small> · {p.tasks} {t("tasks")} · {p.notes} {t("notes")}</small></span><input type="checkbox" checked={ids.includes(p.id)} onChange={e => setIds(v => e.target.checked ? [...v, p.id] : v.filter(id => id !== p.id))} /></label>)}
    {missing.map((d: any) => <p className="notice" key={d.taskId + d.dependencyId}>{data.projects.find((p: any) => p.id === d.from)?.title} → {data.projects.find((p: any) => p.id === d.to)?.title}</p>)}
    {error && <p className="error-box">{error}</p>}
  </div><div className="modal-footer"><button className="button primary" disabled={busy || !ids.length || !!missing.length} onClick={() => { setBusy(true); void onImport(ids).catch(e => setError(errorText(e, t))).finally(() => setBusy(false)); }}>{t("mergeLegacy")}</button></div></Modal>;
}
