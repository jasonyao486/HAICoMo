import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  ListTodo,
  CalendarDays,
  Workflow,
  GitBranch,
  Network,
  Building2,
  GitPullRequest,
  NotebookPen,
  ChartNoAxesCombined,
  Archive,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  FolderOpen,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  ArrowLeft,
  X,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  RotateCw,
  Circle,
  Sparkles,
  MapPin,
  ListX,
} from "lucide-react";
import { useApi, useTab, useDirty } from "./api";
import { errorText, lockDetails } from "./errors";
import { RelayPage } from "./Relay";
import { RelayEditor } from "./RelayEditor";
import type { Relay } from "../shared/relay";
import {
  type Workspace,
  type Settings,
  type Recent,
  type Task,
  type Note,
  type ProposalRecord,
  type Family,
  familyName,
  aggregateFamily,
  sessionStatus,
  taskStatus,
} from "../shared/domain";
import { translator, formatDate, type Key } from "./i18n";
import {
  Avatar,
  Badge,
  Empty,
  Modal,
  TaskList,
  TaskEditor,
  NoteEditor,
  ProposalReview,
  HandoffDialog,
  PermissionDialog,
} from "./components";
import {
  Overview,
  Timeline,
  GraphView,
  Analytics,
  SettingsView,
} from "./Views";
import { LegacyImport } from "./LegacyImport";
import { Records } from "./Records";
import { ModeToggle, UserAvatar } from "./Identity";
import { defaultSettings, settingsEdits } from "../shared/settings";
import { Office } from "./Office";

const defaults = defaultSettings;
const modules = [
  ["overview", LayoutDashboard],
  ["tasks", ListTodo],
  ["proposals", GitPullRequest],
  ["relay", Workflow],
  ["timeline", CalendarDays],
  ["dependencies", GitBranch],
  ["mindmap", Network],
  ["office", Building2],
  ["notes", NotebookPen],
  ["history", Clock3],
  ["analytics", ChartNoAxesCombined],
  ["archive", Archive],
] as const;
const pageLabel = (page: string): Key => page === "tasks" ? "taskList" : page as Key;
type Editor =
  | { kind: "task"; task: Task | null }
  | { kind: "note"; note: Partial<Note> | null }
  | { kind: "proposal"; record: ProposalRecord }
  | { kind: "handoff"; task: Task }
  | { kind: "agent"; family: string }
  | { kind: "project" }
  | { kind: "permission"; data: any }
  | { kind: "legacy"; data: any }
  | { kind: "recovery" }
  | { kind: "relay"; relay: Relay | null }
  | { kind: "lock"; entryPath: string; details: { hostname?: string; pid?: number; at?: string | null; app?: string | null } }
  | null;
export function App() {
  const tab = useTab();
  const { api, command } = useApi();
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);
  const [settings, setSettings] = useState<Settings>(defaults),
    [recents, setRecents] = useState<Recent[]>([]),
    [workspace, setWorkspace] = useState<Workspace | null>(tab.workspace),
    [view, setView] = useState(tab.initialPage),
    [editor, setEditor] = useState<Editor>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [projectTitle, setProjectTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [permissionQueue, setPermissionQueue] = useState<any[]>([]);
  const [version, setVersion] = useState("");
  const [activeRuns, setActiveRuns] = useState<any[]>([]);
  useEffect(() => {
    setWorkspace(tab.workspace);
  }, [tab.workspace]);
  useEffect(() => {
    if (workspace) tab.reportTitle(workspace.state.title);
  }, [workspace?.state.title]);
  useEffect(() => {
    // Only the visible tab of a visible window polls; hidden tabs catch up on return.
    if (!tab.workspace || !tab.active) return;
    const poll = () => {
      if (document.hidden) return;
      void api("providers.active")
        .then(setActiveRuns)
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 1500);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [api, tab.active]);
  const t = useMemo(() => translator(settings.locale), [settings.locale]);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      const lock = lockDetails(e) as (ReturnType<typeof lockDetails> & { entryPath?: string }) | null;
      if (lock?.entryPath) setEditor({ kind: "lock", entryPath: lock.entryPath, details: lock });
      else notify(errorText(e, t), true);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const value = await api("project.view");
    setWorkspace(value);
  };
  useEffect(() => {
    void api("bootstrap")
      .then((r) => {
        setSettings(r.settings);
        setRecents(r.recents);
        setVersion(r.version);
      })
      .catch((e) => notify(errorText(e, t), true));
    return window.haicomo.subscribe((event) => {
      if (event.event === "recents") setRecents(event.recents);
      if (
        event.event === "changed" &&
        tab.workspace &&
        event.directory === tab.workspace.directory &&
        (!event.identity ||
          (event.identity.id === tab.workspace.state.id &&
            event.identity.epoch === tab.workspace.state.epoch))
      )
        void api("project.view")
          .then(setWorkspace)
          .catch(() => {});
      else if (event.event === "settings") setSettings(event.settings);
      else if (
        event.event === "invalidated" &&
        event.directory === tab.workspace?.directory
      )
        setWorkspace((w) =>
          w ? { ...w, entryError: t("projectReplaced") } : w,
        );
      else if (
        event.event === "permissionResolved" &&
        event.directory === tab.workspace?.directory
      ) {
        setPermissionQueue((q) =>
          q.filter(
            (p) =>
              p.runId !== event.runId ||
              (event.id !== undefined && p.id !== event.id),
          ),
        );
        setEditor((e) =>
          e?.kind === "permission" &&
          e.data.runId === event.runId &&
          (event.id === undefined || e.data.id === event.id)
            ? null
            : e,
        );
      } else if (
        event.event === "permission" &&
        event.directory === tab.workspace?.directory &&
        event.binding === tab.workspace?.binding &&
        event.projectId === tab.workspace?.state.id &&
        event.epoch === tab.workspace?.state.epoch
      )
        setPermissionQueue((q) => [...q, event]);
      else if (event.event === "fatal" || event.event === "warning")
        notify(errorText(event.error, t), true);
    });
  }, [api]);
  useEffect(() => {
    document.documentElement.lang = settings.locale;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--accent", settings.accent);
    document.documentElement.dataset.motion = settings.reducedMotion
      ? "reduce"
      : "normal";
  }, [settings]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setPermissionQueue([]);
    if (workspace?.directory)
      void api("providers.pending")
        .then(setPermissionQueue)
        .catch(() => {});
  }, [workspace?.directory]);
  useEffect(() => { tab.reportPage(view); }, [view]);
  const { collapsed, goHome } = tab;
  const [settingsVisited, setSettingsVisited] = useState(tab.initialPage === "settings");
  useEffect(() => { if (tab.homeNavigation) setView("overview"); }, [tab.homeNavigation]);
  const navigate = (next: string) => {
    if (next === "settings") setSettingsVisited(true);
    setView(next);
    setSearch("");
    setFilter("all");
  };
  const editTask = (task: Task) => setEditor({ kind: "task", task });
  const saveSettings = async (value: Settings, base: Settings = settings) => {
    const saved = await api("settings.patch", { edits: settingsEdits(base, value) });
    setSettings(saved);
    return saved as Settings;
  };
  const open = async (directory?: string) => {
    const value = await api("project.open", { directory });
    if (value) {
      tab.attach(value);
    }
  };
  const createProject = async () => {
    const value = await api("project.create", { title: projectTitle });
    if (!value) throw new Error("SAVE_CANCELLED");
    tab.attach(value);
    setEditor(null); setProjectTitle(""); navigate("overview");
    const bootstrap = await api("bootstrap"); setRecents(bootstrap.recents);
  };
  useDirty(editor?.kind === "project" && !!projectTitle.trim(), createProject);
  const active = workspace?.state.tasks.filter((t) => !t.archived) ?? [];
  const filtered =
    workspace?.state.tasks.filter(
      (task) =>
        task.archived === (view === "archive") &&
        (!search ||
          `${task.title} ${task.description}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (filter === "all" ||
          taskStatus(task, workspace.state.tasks) === filter),
    ) ?? [];
  const pending = workspace?.metrics.pendingProposals ?? 0;
  const props = workspace ? { workspace, t, settings, onEdit: editTask } : null;

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <button className="brand" onClick={goHome} aria-label="HAICoMo">
          <span className="brand-symbol">
            H<span>·</span>
          </span>
          {!collapsed && (
            <span>
              HAICoMo<small>HUMAN + AI, TOGETHER</small>
            </span>
          )}
        </button>
        <div className="sidebar-version">
          <button onClick={tab.toggleSidebar} aria-label={t("toggleSidebar")} title={t("toggleSidebar")}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && <small>version {version}</small>}
          </button>
        </div>
        {tab.switcher}
        <nav>
          {modules.map(([name, Icon]) => (
            <button
              key={name}
              title={t(pageLabel(name))}
              disabled={!workspace}
              className={`${view === name && workspace ? "selected" : ""} ${name === "office" ? "nav-separator" : ""}`}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              {!collapsed && (
                <>
                  <span>{t(pageLabel(name))}</span>
                  {name === "proposals" && pending > 0 && <b>{pending}</b>}
                </>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={view === "settings" ? "selected" : ""}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={18} />
            {!collapsed && <span>{t("settings")}</span>}
          </button>

        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{workspace?.state.title || "HAICoMo"}</span>
            <ChevronRight size={14} />
            <strong>
              {t(pageLabel(workspace || view === "settings" ? view : "home"))}
            </strong>
          </div>
          <div className="topbar-actions">
            {workspace && (
              <>
                <span className="saved-indicator">
                  <i />
                  {t(workspace.entryError ? "readOnly" : "healthy")}
                </span>
                <ModeToggle compact enhanced={settings.enhanced} t={t} onClick={() => void run(() => saveSettings({ ...settings, enhanced: !settings.enhanced }))} />
              </>
            )}
            <UserAvatar settings={settings} t={t} />
          </div>
        </header>
        <main className="content">
          {workspace?.entryError && (
            <div className="notice warning" role="alert">
              <strong>{t("missingEntry")}</strong>
              <p>{workspace.entryPath}</p>
              <button
                className="button"
                onClick={() => setEditor({ kind: "recovery" })}
              >
                {t("recovery")}
              </button>
            </div>
          )}
          {permissionQueue.length > 0 && (
            <button
              className="permission-banner"
              onClick={() =>
                setEditor({ kind: "permission", data: permissionQueue[0] })
              }
            >
              {t("permission")} ({permissionQueue.length})
              <ArrowUpRight size={16} />
            </button>
          )}
          {workspace?.warnings.map((w, i) => (
            <div className="notice warning" key={i}>
              {w}
            </div>
          ))}
          {(view === "settings" || (tab.homeNavigation > 0 && settingsVisited)) && (
            <div hidden={view !== "settings"}>
              <div className="page-heading">
                <h1>{t("settings")}</h1>
              </div>
              <SettingsView
                key={workspace?.state.id ?? "global"}
                value={settings}
                onSave={saveSettings}
                t={t}
                workspace={workspace}
                notify={notify}
              />
            </div>
          )}
          {view === "settings" ? null : !workspace ? (
            <div className="home">
              <div className="home-hero">
                <div className="home-description">{t("localFirst")}</div>
                <h1>{t("welcome")}</h1>
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={() => setEditor({ kind: "project" })}
                  >
                    <Plus size={18} />
                    {t("newProject")}
                  </button>
                  <button
                    className="button"
                    onClick={() => void run(() => open())}
                  >
                    <FolderOpen size={17} />
                    {t("openProject")}
                  </button>
                </div>
                <div className="hero-orbit" aria-hidden="true">
                  <div className="orbit o1" />
                  <div className="orbit o2" />
                  <span className="orbit-core">
                    H<span>·</span>
                  </span>
                  <div className="orbit o3" />
                  <span className="orbit-member m1" />
                  <span className="orbit-member m2" />
                  <span className="orbit-member m3" />
                </div>
              </div>
              <section className="panel recent-panel">
                <div className="panel-heading">
                  <h2>{t("recent")}</h2>
                  <button
                    className="link"
                    onClick={() => setEditor({ kind: "recovery" })}
                  >
                    {t("recovery")}
                  </button>
                </div>
                {recents.length ? (
                  recents.map((r) => (
                    <div className="recent-item" key={r.entryPath}>
                      <button
                        className="recent-row"
                        onClick={() => void run(() => open(r.entryPath))}
                      >
                        <span className="project-icon">
                          <FolderOpen size={21} />
                        </span>
                        <span>
                          <strong>{r.title}</strong>
                          <small className="full-path">{r.entryPath}</small>
                        </span>

                      </button>
                      <div className="recent-actions">
                        <button
                          className="recent-action"
                          onClick={() =>
                            void run(async () => {
                              const v = await api("recent.locate", {
                                projectId: r.id,
                              });
                              if (v) tab.attach(v);
                            })
                          }
                        >
                          <MapPin size={18} /><span><strong>{t("locateEntry")}</strong><small>{t("locateEntryHint")}</small></span>
                        </button>
                        <button
                          className="recent-action"
                          onClick={() =>
                            void run(async () =>
                              setRecents(
                                await api("recent.remove", {
                                  entryPath: r.entryPath,
                                }),
                              ),
                            )
                          }
                        >
                          <ListX size={18} /><span><strong>{t("removeRecent")}</strong><small>{t("removeRecentHint")}</small></span>
                        </button>
                      </div>
                      <time className="recent-date" dateTime={r.updatedAt}><span>{t("modifiedAt")}</span>{r.updatedAt ? formatDate(r.updatedAt, settings.locale) : t("unknownDate")}</time>
                    </div>
                  ))
                ) : (
                  <Empty title={t("noProjects")} hint={t("chooseDirectory")} />
                )}
              </section>
              <div className="home-caption">
                <span>{t("flow")}</span>
                <span>{t("footer")}</span>
              </div>
            </div>
          ) : (
            <>
              {view !== "overview" && (
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">{workspace.state.title}</div>
                    <h1>{t(pageLabel(view))}</h1>
                  </div>
                  <div className="button-row">
                    {["tasks", "archive"].includes(view) && (
                      <>
                        <div className="search">
                          <Search size={16} />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("search")}
                          />
                        </div>
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          {[
                            "all",
                            "todo",
                            "doing",
                            "blocked",
                            "review",
                            "done",
                          ].map((v) => (
                            <option value={v} key={v}>
                              {t(v as Key)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {["tasks", "timeline", "dependencies", "mindmap"].includes(
                      view,
                    ) && (
                      <button
                        className="button primary"
                        onClick={() => setEditor({ kind: "task", task: null })}
                      >
                        <Plus size={17} />
                        {t("newTask")}
                      </button>
                    )}
                    {view === "notes" && (
                      <button
                        className="button primary"
                        onClick={() => setEditor({ kind: "note", note: null })}
                      >
                        <Plus size={17} />
                        {t("newNote")}
                      </button>
                    )}
                    {view === "relay" && (
                      <button
                        className="button primary"
                        onClick={() => setEditor({ kind: "relay", relay: null })}
                      >
                        <Plus size={17} />
                        {t("relayNew")}
                      </button>
                    )}
                    {view === "office" && <ModeToggle enhanced={settings.enhanced} t={t} onClick={() => void run(() => saveSettings({ ...settings, enhanced: !settings.enhanced }))} />}
                  </div>
                </div>
              )}
              {view === "overview" && (
                <Overview
                  {...props!}
                  onNew={() => setEditor({ kind: "task", task: null })}
                  onNavigate={navigate}
                />
              )}
              {(view === "tasks" || view === "archive") && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      {t(view === "archive" ? "archive" : "taskList")}{" "}
                      <span className="tiny-pill">{filtered.length}</span>
                    </h2>
                    <small>
                      {t(view === "archive" ? "retained" : "approvedHint")}
                    </small>
                  </div>
                  <TaskList
                    tasks={filtered}
                    all={workspace.state.tasks}
                    t={t}
                    locale={settings.locale}
                    onEdit={editTask}
                    archived={view === "archive"}
                  />
                </section>
              )}
              {view === "timeline" && <Timeline {...props!} />}
              {(view === "dependencies" || view === "mindmap") && (
                <GraphView {...props!} mindmap={view === "mindmap"} />
              )}
              {view === "office" && (
                <Office
                  state={workspace.state}
                  settings={settings}
                  t={t}
                  onSelect={(family) => setEditor({ kind: "agent", family })}
                />
              )}
              {view === "analytics" && <Analytics {...props!} />}
              {view === "proposals" && (
                <Records
                  kind="proposals"
                  workspace={workspace}
                  t={t}
                  onReview={(record) => setEditor({ kind: "proposal", record })}
                />
              )}
              {view === "notes" && (
                <>
                  <div className="notes-grid">
                    {workspace.state.notes.map((note) => (
                      <article key={note.id} className="note-card">
                        <div>
                          <span className="eyebrow">{t(note.kind)}</span>
                          <button
                            className="icon-button"
                            title={t("deleteAction")}
                            onClick={() => {
                              if (confirm(t("deleteNote")))
                                void run(async () => {
                                  setWorkspace(
                                    await command("note.delete", {
                                      id: note.id,
                                      expectedRevision: note.revision,
                                    }),
                                  );
                                });
                            }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <button
                          onClick={() => setEditor({ kind: "note", note })}
                        >
                          <h3>{note.title}</h3>
                          <p>{note.body.slice(0, 240)}</p>
                        </button>
                        <small>
                          {formatDate(note.updatedAt, settings.locale)}
                        </small>
                      </article>
                    ))}
                  </div>
                  {!workspace.state.notes.length && (
                    <Empty title={t("noteEmpty")} />
                  )}
                </>
              )}
              {view === "history" && (
                <Records
                  kind="audit"
                  workspace={workspace}
                  t={t}
                  onReview={() => {}}
                />
              )}
              {view === "relay" && (
                <RelayPage
                  workspace={workspace}
                  settings={settings}
                  t={t}
                  onEdit={(relay) => setEditor({ kind: "relay", relay })}
                  onAgent={(family) => setEditor({ kind: "agent", family })}
                  onChanged={setWorkspace}
                />
              )}
              {view !== "relay" && <footer className="page-footer">
                <span>{t("footer")}</span>
                {!workspace.state.tasks.length &&
                  !workspace.state.notes.length && (
                    <button
                      className="link"
                      onClick={() =>
                        void run(async () => {
                          const data = await api("legacy.preview");
                          if (data) setEditor({ kind: "legacy", data });
                        })
                      }
                    >
                      {t("importLegacy")}
                    </button>
                  )}
                <button
                  className="link"
                  onClick={() =>
                    void run(async () => {
                      const v = await api("project.fork");
                      if (v) tab.attach(v);
                    })
                  }
                >
                  {t("forkProject")}
                </button>
              </footer>}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          <span>{toast.message}</span>
          <button aria-label={t("close")} onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {workspace && editor?.kind === "relay" && (
        <RelayEditor
          relay={editor.relay}
          workspace={workspace}
          settings={settings}
          t={t}
          onClose={() => setEditor(null)}
          onSaved={(w) => {
            setWorkspace(w);
            setEditor(null);
          }}
        />
      )}
      {editor?.kind === "lock" && (
        <Modal title={t("lockTakeoverTitle")} onClose={() => setEditor(null)}>
          <div className="modal-body">
            <p>{t("errProjectLockedOtherHost")}</p>
            <p className="muted"><strong>{t("lockHolder")}:</strong> {editor.details.hostname ?? "?"} · PID {editor.details.pid ?? "?"}{editor.details.at ? ` · ${new Date(editor.details.at).toLocaleString(settings.locale)}` : ""}</p>
            <p>{t("lockTakeoverBody")}</p>
            <small className="full-path">{editor.entryPath}</small>
          </div>
          <div className="modal-footer">
            <button className="button" onClick={() => setEditor(null)}>{t("cancel")}</button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const value = await api("project.open", { entryPath: editor.entryPath, takeoverLock: true });
                  if (value) {
                    tab.attach(value);
                    setEditor(null);
                  }
                })
              }
            >
              {t("lockTakeoverConfirm")}
            </button>
          </div>
        </Modal>
      )}
      {editor?.kind === "recovery" && (
        <Modal title={t("recovery")} onClose={() => setEditor(null)}>
          <div className="modal-body">
            <p>{t("recoveryHint")}</p>
            {(
              [
                ["project.recoverEntry", "restoreEntry"],
                ["project.recoverHistory", "restoreHistory"],
                ["project.restore", "restoreBackup"],
              ] as const
            ).map(([method, key]) => (
              <button
                className="button recovery-choice"
                key={method}
                onClick={() =>
                  void run(async () => {
                    const w = await api(method);
                    if (w) {
                      tab.attach(w);
                      setEditor(null);
                    }
                  })
                }
              >
                {t(key)}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editor?.kind === "project" && (
        <Modal title={t("newProject")} onClose={() => setEditor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(createProject);
            }}
          >
            <div className="modal-body">
              <p className="muted">{t("newFileHint")}</p>
              <label>
                {t("projectName")}
                <input
                  autoFocus
                  required
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="button primary" disabled={busy}>
                {t("create")}
                <ChevronRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {workspace && editor?.kind === "task" && (
        <TaskEditor
          task={editor.task}
          workspace={workspace}
          t={t}
          onClose={() => setEditor(null)}
          onSave={async (values, id, revision) => {
            setWorkspace(
              await command("change", {
                entity: "task",
                operation: revision === null ? "create" : "update",
                id,
                expectedRevision: revision,
                values,
              }),
            );
            setEditor(null);
          }}
          onAction={async (type, task, reason) => {
            setWorkspace(
              await command(type, {
                taskId: task.id,
                expectedRevision: task.revision,
                reason,
              }),
            );
            setEditor(null);
          }}
          onHandoff={(task) => setEditor({ kind: "handoff", task })}
        />
      )}
      {workspace && editor?.kind === "legacy" && (
        <LegacyImport
          data={editor.data}
          t={t}
          onClose={() => setEditor(null)}
          onImport={async (ids) => {
            setWorkspace(
              await api("legacy.import", {
                projectId: ids,
                hash: editor.data.hash,
              }),
            );
            setEditor(null);
          }}
        />
      )}
      {workspace && editor?.kind === "note" && (
        <NoteEditor
          note={editor.note}
          t={t}
          onClose={() => setEditor(null)}
          onDelete={async () => {
            if (!editor.note?.id) return;
            setWorkspace(
              await command("note.delete", {
                id: editor.note.id,
                expectedRevision: editor.note.revision,
              }),
            );
            setEditor(null);
          }}
          onSave={async (values) => {
            setWorkspace(
              await command("change", {
                entity: "note",
                operation: editor.note?.id ? "update" : "create",
                id: editor.note?.id ?? crypto.randomUUID(),
                expectedRevision: editor.note?.revision ?? null,
                values,
              }),
            );
            setEditor(null);
          }}
        />
      )}
      {workspace && editor?.kind === "proposal" && (
        <ProposalReview
          record={editor.record}
          t={t}
          onClose={() => setEditor(null)}
          onReview={async (decision, reason, changes) => {
            setWorkspace(
              await command("proposal.review", {
                proposalId: editor.record.proposal.proposalId,
                decision,
                reason,
                changes,
              }),
            );
            setEditor(null);
          }}
        />
      )}
      {workspace && editor?.kind === "handoff" && (
        <HandoffDialog
          task={editor.task}
          workspace={workspace}
          t={t}
          onClose={() => setEditor(null)}
          onComplete={() => void refresh()}
        />
      )}
      {workspace &&
        editor?.kind === "agent" &&
        (() => {
          const a = aggregateFamily(editor.family, workspace.state);
          return (
            <Modal
              title={familyName(editor.family)}
              onClose={() => setEditor(null)}
            >
              <div className="modal-body">
                <div className="agent-modal-heading">
                  <Avatar family={editor.family} size={50} />
                  {a.sessions.length ? (
                    <Badge status={a.status} t={t} />
                  ) : (
                    <span>{t("noTrackedRun")}</span>
                  )}
                  <span>
                    {a.counts.running} {t("running")} · {a.counts.waiting}{" "}
                    {t("waiting")}
                  </span>
                </div>
                <h3>{t("tasks")}</h3>
                {a.assigned.map((task) => (
                  <button
                    className="agent-task"
                    key={task.id}
                    onClick={() => editTask(task)}
                  >
                    {task.title}
                    <Badge
                      status={taskStatus(task, workspace.state.tasks)}
                      t={t}
                    />
                  </button>
                ))}
                <h3>{t("currentRuns")}</h3>
                {a.sessions.length ? (
                  a.sessions.map((s) => (
                    <div className="session-card" key={s.sessionId}>
                      <strong>{s.model}</strong>
                      <Badge status={sessionStatus(s)} t={t} />
                      <small>
                        {s.provider} · {s.source} · {s.threadId ?? s.sessionId}
                      </small>
                      <pre>{s.lastMessage}</pre>
                      {!activeRuns.some((r) => r.runId === s.sessionId) && (
                        <>
                          <button
                            className="button small"
                            onClick={() =>
                              void run(async () => {
                                await command("session.untrack", {
                                  sessionId: s.sessionId,
                                });
                                await refresh();
                              })
                            }
                          >
                            {t("endTracking")}
                          </button>
                          <small>{t("endTrackingHint")}</small>
                        </>
                      )}
                      {activeRuns.some((r) => r.runId === s.sessionId) && (
                        <button
                          className="button small danger"
                          onClick={() =>
                            void run(() =>
                              api("providers.cancel", { runId: s.sessionId }),
                            )
                          }
                        >
                          {t("stop")}
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted">{t("noTrackedRun")}</p>
                )}
                <h3>
                  {t("historyRuns")} ({a.history.length})
                </h3>
                {a.history.map((s) => (
                  <details className="session-card" key={s.sessionId}>
                    <summary>
                      {s.model} ·{" "}
                      {s.endReason === "legacy"
                        ? t("legacyRun")
                        : s.endReason === "permission"
                          ? t("permissionEnded")
                          : s.endReason === "tracking-ended"
                            ? t("endTracking")
                            : t(s.status)}
                    </summary>
                    <small>
                      {s.provider} · {s.threadId ?? s.sessionId} ·{" "}
                      {s.endedAt ?? s.at}
                    </small>
                    <pre>{s.lastMessage}</pre>
                  </details>
                ))}
              </div>
            </Modal>
          );
        })()}
      {editor?.kind === "permission" && (
        <PermissionDialog
          key={`${editor.data.runId}-${editor.data.id}`}
          request={editor.data}
          t={t}
          onClose={() => setEditor(null)}
          onRespond={async (allow, answers) => {
            await api("providers.respond", {
              runId: editor.data.runId,
              id: editor.data.id,
              method: editor.data.method,
              allow,
              answers,
            });
            setPermissionQueue((q) =>
              q.filter(
                (p) =>
                  !(p.id === editor.data.id && p.runId === editor.data.runId),
              ),
            );
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
