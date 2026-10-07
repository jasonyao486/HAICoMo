import { clientIcon } from "../shared/clients";
import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  Plus,
  CheckCircle2,
  Layers,
  GitPullRequest,
  Activity,
  FileText,
  ChevronRight,
  ExternalLink,
  CalendarDays,
  Download,
  Copy,
  RotateCw,
  Folder,
  Check,
  Trash2,
} from "lucide-react";
import {
  aggregateFamily,
  familyName,
  FAMILIES,
  ACTORS,
  sessionAvatar,
  taskStatus,
  COLORS,
  type Workspace,
  type Task,
  type Settings,
  type Capabilities,
} from "../shared/domain";
import { ModelPortrait, Avatar, Badge, Empty, TaskList } from "./components";
import { formatDate, formatDuration, type Translate } from "./i18n";
import { CLIENTS, clientName, isClientActor } from "../shared/clients";
import type { UpdateState } from "../core/updates";
import { useApi, useTab, useDirty } from "./api";

import { modelMetrics } from "../shared/analytics";
import { characters } from "../shared/settings";
import { UpdatePanel } from "./UpdatePanel";
import { LegalSection } from "./LegalSection";
import { UserAvatar } from "./Identity";
import { InitialsEditor, ThemeSelect } from "./SettingsControls";
import { ActivitySummary } from "./Activity";
import { errorText } from "./errors";

type Base = {
  workspace: Workspace;
  t: Translate;
  settings: Settings;
  onEdit: (task: Task) => void;
};
export function Overview({
  workspace,
  t,
  settings,
  onEdit,
  onNew,
  onNavigate,
}: { onNew: () => void; onNavigate: (view: string) => void } & Base) {
  const { api } = useApi();
  const tasks = workspace.state.tasks.filter((t) => !t.archived),
    done = tasks.filter((t) => t.acceptedAt).length,
    percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const pending = workspace.metrics.pendingProposals,
    review = tasks.filter((t) => taskStatus(t, tasks) === "review").length;
  const cards = [
    {
      icon: CheckCircle2,
      label: t("completion"),
      value: `${percent}%`,
      detail: `${done} / ${tasks.length} ${t("taskCount")}`,
      color: "green",
    },
    {
      icon: Layers,
      label: t("openTasks"),
      value: tasks.length - done,
      detail: t("approvedHint"),
      color: "blue",
    },
    {
      icon: GitPullRequest,
      label: t("waitingReview"),
      value: pending + review,
      detail: `${pending} ${t("proposals")} · ${review} ${t("review")}`,
      color: "orange",
    },
  ];
  return (
    <>
      <section className="welcome-band">
        <div>
          <div className="eyebrow">{t("localFirst")}</div>
          <h1>{workspace.state.title}</h1>
          <p>{workspace.state.description || t("localFirst")}</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          {t("newTask")}
        </button>
      </section>
      <div className="metric-grid">
        {cards.map((c) => (
          <article className="metric" key={c.label}>
            <div className="metric-label">
              <span>{c.label}</span>
              <c.icon size={19} />
            </div>
            <strong>{c.value}</strong>
            <small>{c.detail}</small>
            <div className={`metric-line ${c.color}`} />
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>{t("tasks")}</h2>
              <button className="link" onClick={() => onNavigate("tasks")}>
                {t("viewAll")}
                <ArrowRight size={15} />
              </button>
            </div>
            {tasks.length ? (
              <TaskList
                tasks={tasks.slice(0, 8)}
                all={workspace.state.tasks}
                t={t}
                locale={settings.locale}
                onEdit={onEdit}
              />
            ) : (
              <Empty
                title={t("emptyTasks")}
                hint={t("emptyHint")}
                action={
                  <button className="button" onClick={onNew}>
                    <Plus size={15} />
                    {t("newTask")}
                  </button>
                }
              />
            )}
          </section>
          <section className="panel activity-panel">
            <div className="panel-heading">
              <h2>{t("latest")}</h2>
              <button className="link" onClick={() => onNavigate("history")}>
                {t("viewAll")}
                <ArrowRight size={15} />
              </button>
            </div>
            {workspace.audit.length ? (
              workspace.audit.slice(0, 5).map((a) => (
                <div className="activity-row" key={a.id}>
                  <span className="activity-dot" />
                  <ActivitySummary entry={a} state={workspace.state} t={t} locale={settings.locale} compact />
                </div>
              ))
            ) : (
              <p className="panel-placeholder">{t("noActivity")}</p>
            )}
          </section>
        </div>
        <aside>
          <section className="panel team-panel">
            <div className="panel-heading">
              <h2>{t("team")}</h2>
              <span className="tiny-pill">
                {
                  new Set(
                    tasks
                      .flatMap((t) => t.assignees)
                      .filter((f) => f !== "human"),
                  ).size
                }
              </span>
            </div>
            {FAMILIES.filter(
              (f) =>
                tasks.some((t) => t.assignees.includes(f)) ||
                workspace.state.sessions.some((s) => s.family === f),
            ).map((f) => {
              const a = aggregateFamily(f, workspace.state);
              return (
                <div className="team-row" key={f}>
                  <Avatar family={f} size={35} />
                  <div>
                    <strong>{familyName(f)}</strong>
                    <small>
                      {a.assigned.length} {t("taskCount")}
                    </small>
                  </div>
                  <Badge status={a.status} t={t} />
                </div>
              );
            })}
            <button
              className="office-link"
              onClick={() => onNavigate("office")}
            >
              <span className="office-mini">✦</span>
              <span>
                <strong>{t("office")}</strong>
                <small>{t("collaborate")}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          </section>
          <div className="tip-card">
            <div className="eyebrow">{t("tip")}</div>
            <p>{t("agentTip")}</p>
            <button className="link" onClick={() => void api("project.reveal")}>
              {t("agentFolder")}
              <ExternalLink size={13} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

export { Timeline } from "./Timeline";
export { GraphView } from "./GraphView";

export function Analytics({ workspace, t, settings }: Base) {
  const state = workspace.state,
    tasks = state.tasks,
    done = tasks.filter((t) => t.acceptedAt).length;
  const modelData = workspace.metrics.models ?? modelMetrics(state, workspace.proposals);
  return (
    <>
      <div className="metric-grid four">
        {[
          [t("total"), tasks.length],
          [t("done"), done],
          [t("revisions"), workspace.metrics.totalProposals],
          [t("handoffs"), state.handoffs.filter((h) => h.mode !== "copy").length],
        ].map(([l, v]) => (
          <div className="metric" key={l}>
            <div className="metric-label">{l}</div>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>{t("participation")}</h2>
          <small>{t("modelParticipationHint")}</small>
        </div>
        <div className="analytics-grid">
          {FAMILIES.map((family, i) => {
            const metrics = modelData.families[family];
            const assigned = metrics.taskIds, completed = metrics.completed, count = metrics.proposals, ms = metrics.measuredMs;
            const average = metrics.distinctTasks ? metrics.taskMentions / metrics.distinctTasks : null;
            return (
              <article className="model-card" key={family}>
                {settings.enhanced &&
                (FAMILIES as readonly string[]).includes(family) ? (
                  <ModelPortrait
                    family={family}
                    reducedMotion={settings.reducedMotion}
                  />
                ) : (
                  <Avatar family={family} size={42} />
                )}
                <h3>
                  {familyName(family)}
                </h3>
                <div className="model-bar">
                  <span
                    style={{
                      width: `${tasks.length ? (assigned.length / tasks.length) * 100 : 0}%`,
                      background: COLORS[(i + 13) % 14],
                    }}
                  />
                </div>
                <div className="model-values">
                  <span>{t("tasks")}</span>
                  <strong>
                    {assigned.length} / {tasks.length}
                  </strong>
                  <span>{t("done")}</span>
                  <strong>{completed}</strong>
                  <span>{t("revisions")}</span>
                  <strong>{count}</strong>
                  <span>{t("trackedTime")}</span>
                  <strong>
                    {formatDuration(ms, t)}
                  </strong>
                  <span title={t("proposalsPerTaskHint")}>
                    {t("proposalsPerTask")}
                  </span>
                  <strong>{average === null ? "—" : average.toFixed(1)}</strong>
                </div>
              </article>
            );
          })}
        </div>
        <p className="muted panel-caption">{t("timeHint")}</p>
      </section>
      <section className="panel attribution-summary"><h2>{t("noModelAttribution")}</h2><p>{t("humanTaskSummary")}: {modelData.humanTasks} · {t("unknownTaskSummary")}: {modelData.unknownTasks} · {t("unknownProposalSummary")}: {modelData.unknownProposals}</p><p>{t("unknownModel")} · {t("trackedTime")}: {formatDuration(modelData.unknownMeasuredMs, t)}</p></section>
      <section className="panel">
        <div className="panel-heading">
          <h2>{t("handoffs")}</h2>
          <span>
            {t("returns")}: {workspace.metrics.acceptanceReturns} · {state.handoffs.filter((h) => h.mode === "copy").length} {t("handoffCopies")}
          </span>
        </div>
        {state.handoffs
          .filter((h) => h.mode !== "copy")
          .slice()
          .reverse()
          .map((h) => (
            <div className="handoff-row" key={h.id}>
              <span>{h.from.map(familyName).join(", ") || t("human")}</span>
              <ArrowRight size={16} />
              <strong>{familyName(h.to)}</strong>
              <span>{state.tasks.find((t) => t.id === h.taskId)?.title}</span>
              <small>{h.mode === "relay" ? t("relay") : t(h.mode)} · {formatDate(h.at, settings.locale)}</small>
            </div>
          ))}
      </section>
    </>
  );
}

export function SettingsView({
  value,
  onSave,
  t,
  workspace,
  notify,
}: {
  value: Settings;
  onSave: (s: Settings, base?: Settings) => Promise<Settings>;
  t: Translate;
  workspace: Workspace | null;
  notify: (s: string, error?: boolean) => void;
}) {
  const { api, command } = useApi();
  const baseline = useRef(value);
  const [conflict, setConflict] = useState(false);
  const [settings, setSettings] = useState(value),
    [caps, setCaps] = useState<Capabilities[]>([]),
    [projectTitle, setProjectTitle] = useState(workspace?.state.title ?? ""),
    [metadataRevision, setMetadataRevision] = useState(
      workspace?.state.metadataRevision ?? 0,
    ),
    [description, setDescription] = useState(
      workspace?.state.description ?? "",
    );
  useEffect(() => {
    if (JSON.stringify(settings) === JSON.stringify(baseline.current)) { setSettings(value); baseline.current = value; }
  }, [value]);
  const savePreferences = async () => {
    if (characters(settings.avatarInitials?.trim() ?? "").length > 4) throw new Error("INITIALS_TOO_LONG");
    let saved: Settings;
    try { saved = await onSave(settings, baseline.current); setConflict(false); }
    catch (error) { if (String(error).includes("SETTINGS_CONFLICT")) setConflict(true); throw error; }
    baseline.current = saved; setSettings(saved);
  };
  const saveProject = async () => {
    if (
      workspace &&
      (projectTitle !== workspace.state.title ||
        description !== workspace.state.description)
    ) {
      const result = await api("project.command", {
        id: crypto.randomUUID(),
        type: "change",
        payload: {
          entity: "project",
          operation: "update",
          id: workspace.state.id,
          expectedRevision: metadataRevision,
          values: { title: projectTitle, description },
        },
      });
      setMetadataRevision(result.state.metadataRevision);
    }
  };
  useDirty(
    JSON.stringify(settings) !== JSON.stringify(value) ||
      (!!workspace &&
        (projectTitle !== workspace.state.title ||
          description !== workspace.state.description)),
    async () => {
      await savePreferences();
      await saveProject();
    },
  );
  const set = <K extends keyof Settings>(key: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: v }));
  const action = (fn: () => Promise<any>, message = t("saved")) =>
    void fn()
      .then(() => notify(message))
      .catch((e) => notify(errorText(e, t), true));
  return (
    <div className="settings-page">
      <section className="panel settings-panel">
        <h2>{t("interface")}</h2>
        {conflict && <div className="error-box" role="alert"><p>{t("settingsConflict")}</p><button className="button" onClick={() => { baseline.current = value; setSettings(value); setConflict(false); }}>{t("reloadSettings")}</button></div>}
        <div className="interface-grid">
          <div className="profile-field"><label>{t("userName")}<input aria-label={t("userName")} value={settings.userName ?? ""} maxLength={200} onChange={(e) => set("userName", e.target.value)} /></label>
            <InitialsEditor label={t("avatarInitials")} avatar={<UserAvatar settings={settings} t={t} />}><label>{t("avatarInitials")}<input aria-label={t("avatarInitials")} value={settings.avatarInitials ?? ""} onChange={(e) => set("avatarInitials", e.target.value)} /></label><small>{t("initialsHint")}</small><button className="link" onClick={() => set("avatarInitials", "")}>{t("automaticInitials")}</button></InitialsEditor>
          </div>
          <label>{t("language")}<select aria-label={t("language")} value={settings.locale} onChange={(e) => set("locale", e.target.value as any)}><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option></select></label>
          <ThemeSelect value={settings.theme} onChange={(value) => set("theme", value)} t={t} />
          <label>{t("accentColor")}<input type="color" aria-label={t("accentColor")} value={settings.accent} onChange={(e) => set("accent", e.target.value)} /></label>
        </div>
        <label className="toggle-row">
          <div>
            <strong>{t("enhanced")}</strong>
            <p>{t("enhancedHint")}</p>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={settings.enhanced}
            onChange={(e) => set("enhanced", e.target.checked)}
          />
        </label>
        <label className="toggle-row">
          <div>
            <strong>{t("reducedMotion")}</strong>
            <p>{t("reducedHint")}</p>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={settings.reducedMotion}
            onChange={(e) => set("reducedMotion", e.target.checked)}
          />
        </label>
        <button
          className="button primary"
          onClick={() => action(savePreferences)}
        >
          {t("save")}
        </button>
      </section>
      <section className="panel settings-panel">
        <h2>{t("connections")}</h2>
        <p className="muted">{t("pathHint")}</p>
        {CLIENTS.map((c) => (
          <div className="client-config" key={c.id}>
            <div className="client-config-title"><span className="client-name"><img src={`.${clientIcon(c.id)}`} alt="" />{c.name}</span><button className="link" onClick={() => set("clientPaths", { ...settings.clientPaths, [c.id]: "" })}>{t("clearPath")}</button></div>
            <div className="client-path-row"><input aria-label={`${c.name} · ${t("clientPath")}`} value={settings.clientPaths[c.id] ?? ""} placeholder={t("autoDetect")} onChange={(e) => set("clientPaths", { ...settings.clientPaths, [c.id]: e.target.value })} /><button className="link" onClick={() => void api("providers.pickPath").then((file) => { if (file) set("clientPaths", { ...settings.clientPaths, [c.id]: file }); }).catch((e) => notify(errorText(e, t), true))}>{t("choosePath")}</button></div>
          </div>
        ))}
        <button
          className="button"
          onClick={() =>
            action(async () => {
              await savePreferences();
              setCaps(await api("providers.detect"));
            })
          }
        >
          <RotateCw size={15} />
          {t("detect")}
        </button>
        {caps.map((c) => (
          <div className="capability" key={c.provider}>
            <strong className="client-name">
              <img src={`.${clientIcon(c.provider)}`} alt="" />
              {clientName(c.provider)}
            </strong>
            <span>{t(c.installed ? "available" : "unavailable")}</span>
            <small>
              {c.version} ·{" "}
              {t(
                c.background
                  ? "backgroundAvailable"
                  : c.installed
                    ? "manualCapability"
                    : "unavailable",
              )}
            </small>
            <small className="full-path">
              {t("detectedPath")}: {c.executable || c.appPath || "—"}
            </small>
          </div>
        ))}
        <button
          className="button primary"
          onClick={() => action(savePreferences)}
        >
          {t("save")}
        </button>
        <p className="muted">{t("privacy")}</p>
      </section>
      {workspace && (
        <section className="panel settings-panel">
          <h2>{t("projectSettings")}</h2>
          <label>
            {t("projectName")}
            <input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
            />
          </label>
          <label>
            {t("summary")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            className="button"
            onClick={() =>
              action(() =>
                api("project.command", {
                  id: crypto.randomUUID(),
                  type: "change",
                  payload: {
                    entity: "project",
                    operation: "update",
                    id: workspace.state.id,
                    expectedRevision: metadataRevision,
                    values: { title: projectTitle, description },
                  },
                }).then((result) =>
                  setMetadataRevision(result.state.metadataRevision),
                ),
              )
            }
          >
            {t("save")}
          </button>
          <hr />
          <div className="button-row">
            <button
              className="button"
              onClick={() => action(() => api("project.export"), t("exported"))}
            >
              <Download size={15} />
              {t("exportBackup")}
            </button>
            <button
              className="button"
              onClick={() => action(() => api("project.reveal"))}
            >
              <Folder size={15} />
              {t("agentFolder")}
            </button>
          </div>
        </section>
      )}
      <UpdatePanel t={t} notify={notify} feed={settings.updateFeed} setFeed={(v) => set("updateFeed", v)} save={savePreferences} />
      <LegalSection t={t} notify={notify} />
    </div>
  );
}
