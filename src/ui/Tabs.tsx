import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FolderOpen,
  Plus,
  X,
  MoreHorizontal,
  Terminal,
} from "lucide-react";
import { UpdateNotice } from "./UpdatePanel";
import { App } from "./App";
import { api, TabContext, type DirtyGuard } from "./api";
import type { Settings, Workspace } from "../shared/domain";
import { translator } from "./i18n";
import { errorText, installFailureText } from "./errors";
type Tab = { id: string; workspace: Workspace | null; title: string; page?: string };
const blank = (): Tab => ({
  id: crypto.randomUUID(),
  workspace: null,
  title: "",
});
const HOME_ID = "window-home";
const homeTab: Tab = { id: HOME_ID, workspace: null, title: "" };
export function Tabs() {
  const [tabs, setTabs] = useState<Tab[]>(() => [blank()]);
  const [active, setActive] = useState("");
  const [home, setHome] = useState(false);
  const [homeVisited, setHomeVisited] = useState(false);
  const [homeNavigation, setHomeNavigation] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const homeRef = useRef(home); homeRef.current = home;
  const goHome = useCallback(() => {
    setHomeVisited(true); setHome(true); setMenu(false);
    setHomeNavigation((value) => value + 1);
  }, []);
  const [locale, setLocale] = useState<Settings["locale"]>("zh-CN");
  const [menu, setMenu] = useState(false),
    [more, setMore] = useState(false);
  const [background, setBackground] = useState<any>({
      runs: [],
      permissions: [],
      relays: [],
    }),
    [showBackground, setShowBackground] = useState(false);
  const [closing, setClosing] = useState<{
      ids: string[];
      window: boolean;
      ticket?: string;
    } | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [updateLocked, setUpdateLocked] = useState(false);
  const pages = useRef(new Map<string, string>());
  const guards = useRef(new Map<string, Map<string, DirtyGuard>>());
  const latest = useRef(tabs);
  latest.current = tabs;
  const activeRef = useRef(active);
  activeRef.current = active || tabs[0]?.id;
  const t = translator(locale);
  const liveT = useRef(t); liveT.current = t;
  const newTab = useCallback(() => {
    const tab = blank();
    setTabs((old) => [...old, tab]);
    setActive(tab.id);
    setHome(false);
    setMenu(false);
  }, []);
  const attach = useCallback((workspace: Workspace, sourceId?: string) => {
    setHome(false);
    setTabs((old) => {
      const existing = old.find(
        (tab) => tab.workspace?.binding === workspace.binding,
      );
      if (existing) {
        setActive(existing.id);
        return existing.workspace?.entryPath === workspace.entryPath
          ? old
          : old.map((t) => (t.id === existing.id ? { ...t, workspace } : t));
      }
      const target = old.find(
        (tab) => tab.id === (sourceId ?? activeRef.current) && !tab.workspace,
      );
      const id = target?.id ?? crypto.randomUUID();
      const tab = { id, workspace, title: workspace.state.title };
      setActive(id);
      return target ? old.map((v) => (v.id === id ? tab : v)) : [...old, tab];
    });
    setMenu(false);
  }, []);
  useEffect(() => {
    void api("bootstrap").then(async (b) => {
      setLocale(b.settings.locale);
      if (b.restore?.tabs?.length) {
        const restored: Tab[] = b.restore.tabs.map((item: any) => ({ id: crypto.randomUUID(), workspace: item.workspace, title: item.workspace?.state.title ?? "", page: item.page }));
        restored.forEach((tab) => pages.current.set(tab.id, tab.page ?? "overview"));
        setTabs(restored); setActive(restored[Math.max(0, b.restore.tabs.findIndex((item: any) => item.active))].id);
      } else for (const p of b.projects ?? []) attach(await api("project.view", { binding: p.binding }));
      if (b.restore?.home) goHome();
    });
    const poll = () => {
      if (document.hidden) return;
      void api("providers.background")
        .then(setBackground)
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 1500);
    document.addEventListener("visibilitychange", poll);
    const unsubscribe = window.haicomo.subscribe((e) => {
      if (e.event === "updates.prepare") void requestClose(latest.current.map((tab) => tab.id), false, e.ticket).catch((error) => { setError(errorText(error, liveT.current)); void api("updates.cancel", { ticket: e.ticket }); });
      if (e.event === "updates.cancelled") { setUpdateLocked(false); setClosing(null); if (e.error) setError(installFailureText(e.error, liveT.current)); }
      if (e.event === "tab.new") newTab();
      if (e.event === "tab.close") void closeCurrent();
      if (e.event === "opened") attach(e.view);
      if (e.event === "relocated")
        setTabs((old) =>
          old.map((tab) =>
            tab.workspace?.binding === e.binding
              ? { ...tab, workspace: e.view }
              : tab,
          ),
        );
      if (e.event === "settings") setLocale(e.settings.locale);
      if (e.event === "window.closeRequested")
        void requestClose(
          latest.current.map((t) => t.id),
          true,
        );
    });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".tab-picker")) setMenu(false);
    };
    const first = document.querySelector<HTMLButtonElement>(
      ".workspace-frame:not([hidden]) .tab-menu button",
    );
    first?.focus();
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menu]);
  const finishClose = async (ids: string[], window = false, ticket?: string) => {
    if (ticket) {
      setUpdateLocked(true);
      try {
        await api("updates.ready", { ticket, home: homeRef.current, tabs: latest.current.map((tab) => ({ ...(tab.workspace ? { entryPath: tab.workspace.entryPath, id: tab.workspace.state.id, epoch: tab.workspace.state.epoch } : {}), page: pages.current.get(tab.id) ?? tab.page ?? "overview", active: tab.id === activeRef.current })) });
        setClosing(null);
      } catch (error) { setUpdateLocked(false); await api("updates.cancel", { ticket }); throw error; }
      return;
    }
    if (window) {
      await api("window.confirmClose");
      return;
    }
    if (ids.includes(HOME_ID)) { setHome(false); setMenu(false); return; }
    for (const id of ids) {
      const tab = latest.current.find((t) => t.id === id);
      if (tab?.workspace?.binding)
        await api("project.close", { binding: tab.workspace.binding });
      guards.current.delete(id);
    }
    setTabs((old) => {
      const next = old.filter((t) => !ids.includes(t.id));
      if (!next.length) next.push(blank());
      if (ids.includes(activeRef.current)) setActive(next[0].id);
      return next;
    });
    setClosing(null);
    setMenu(false);
  };
  const requestClose = async (ids: string[], window = false, ticket?: string) => {
    setMenu(false);
    if (window || ticket) ids = [...ids, HOME_ID];
    if (
      ids.some((id) =>
        [...(guards.current.get(id)?.values() ?? [])].some((g) => g.dirty),
      )
    )
      setClosing({ ids, window, ticket });
    else await finishClose(ids, window, ticket);
  };
  const closeCurrent = async () => {
    if (homeRef.current) { setHome(false); setMenu(false); }
    else await requestClose([activeRef.current]);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || updateLocked) return;
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        newTab();
      }
      if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        void closeCurrent();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setHome(false);
        // Restored tabs render before this effect's listener is replaced.
        // Use the same current snapshot as activeRef, never the old closure.
        const currentTabs = latest.current;
        if (!currentTabs.length) return;
        const i = currentTabs.findIndex((t) => t.id === activeRef.current);
        setActive(
          currentTabs[(i + (e.shiftKey ? currentTabs.length - 1 : 1)) % currentTabs.length].id,
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tabs, newTab, updateLocked]);
  return (
    <>
      <div inert={updateLocked}>
      {[...tabs, ...(homeVisited ? [homeTab] : [])].map((tab) => (
        <TabFrame
          key={tab.id}
          tab={tab}
          active={tab.id === HOME_ID ? home : !home && tab.id === (active || tabs[0].id)}
          goHome={goHome}
          homeNavigation={tab.id === HOME_ID ? homeNavigation : 0}
          collapsed={collapsed}
          toggleSidebar={() => setCollapsed((value) => !value)}
          reportPage={(page) => pages.current.set(tab.id, page)}
          attach={(w) => attach(w, tab.id)}
          newTab={newTab}
          register={(id, guard) => {
            let entries = guards.current.get(tab.id);
            if (!entries) {
              entries = new Map();
              guards.current.set(tab.id, entries);
            }
            if (guard) entries.set(id, guard);
            else entries.delete(id);
          }}
          reportTitle={(title) =>
            setTabs((old) =>
              old.map((v) =>
                v.id === tab.id && v.title !== title ? { ...v, title } : v,
              ),
            )
          }
          switcher={
            <div className="tab-picker">
              <button
                className="workspace-switch"
                aria-label={t("switchProject")}
                title={t("switchProject")}
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => {
                  setMenu(!menu);
                  setMore(false);
                }}
              >
                <FolderOpen size={19} />
                {!collapsed && <><span>{tab.id === HOME_ID ? t("home") : tab.title || t("newTab")}</span><ChevronDown size={14} /></>}
              </button>
              {menu && (
                <div
                  className="tab-menu"
                  role="menu"
                  onKeyDown={(e) => {
                    const buttons = [
                      ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "button",
                      ),
                    ];
                    const i = buttons.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    if (
                      ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      buttons[
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? buttons.length - 1
                            : (i +
                                (e.key === "ArrowUp"
                                  ? buttons.length - 1
                                  : 1)) %
                              buttons.length
                      ]?.focus();
                    }
                    if (e.key === "Escape") {
                      setMenu(false);
                      e.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(".workspace-switch")
                        ?.focus();
                    }
                  }}
                >
                  {tabs.map((item) => (
                    <button
                      role="menuitem"
                      key={item.id}
                      aria-current={item.id === tab.id}
                      onClick={() => {
                        setActive(item.id);
                        setHome(false);
                        setMenu(false);
                      }}
                    >
                      <span>{item.title || t("newTab")}</span>
                      <small title={item.workspace?.entryPath}>
                        {item.workspace?.entryPath}
                      </small>
                    </button>
                  ))}
                  <hr />
                  <button role="menuitem" onClick={newTab}>
                    <Plus size={15} />
                    {t("addTab")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => void (tab.id === HOME_ID ? closeCurrent() : requestClose([tab.id]))}
                  >
                    <X size={15} />
                    {t("closeTab")}
                  </button>
                  {tab.workspace && (
                    <>
                      <button role="menuitem" onClick={() => setMore(!more)}>
                        <MoreHorizontal size={15} />
                        {t("moreProject")}
                      </button>
                      {more && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            void api("project.window", {
                              binding: tab.workspace!.binding,
                            }).catch((e) => setError(errorText(e, t)));
                            setMenu(false);
                          }}
                        >
                          {t("newWindow")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <button
                className="background-entry"
                title={t("backgroundTasks")}
                aria-label={t("backgroundTasks")}
                onClick={() => setShowBackground(true)}
              >
                <Terminal size={19} />
                {!collapsed && <span>{t("backgroundTasks")} · {background.runs.length}
                {background.permissions.length > 0 &&
                  ` · ${t("permission")} ${background.permissions.length}`}
                {(background.relays?.length ?? 0) > 0 &&
                  ` · ${t("backgroundRelays")} ${background.relays.length}`}</span>}
              </button>
            </div>
          }
        />
      ))}
      </div>
      <UpdateNotice t={t} notify={(message) => setError(message)} />
      {updateLocked && <div className="update-banner" role="status">{t("updatePreparing")}</div>}
      {showBackground && (
        <div
          className="shell-dialog"
          role="dialog"
          aria-label={t("backgroundTasks")}
        >
          <h2>{t("backgroundTasks")}</h2>
          {background.runs.length ? (
            background.runs.map((r: any) => (
              <button
                className="recent-row"
                key={r.runId}
                onClick={() =>
                  void api("project.open", { entryPath: r.entryPath })
                    .then((w) => {
                      attach(w);
                      setShowBackground(false);
                    })
                    .catch((e) => setError(errorText(e, t)))
                }
              >
                <span>
                  {r.provider} · {t(r.status)}
                  <small>{r.directory}</small>
                  {background.permissions.some(
                    (p: any) => p.runId === r.runId,
                  ) && <b>{t("permission")}</b>}
                </span>
              </button>
            ))
          ) : (
            <p>{t("noBackground")}</p>
          )}
          {(background.relays?.length ?? 0) > 0 && (
            <>
              <h3>{t("backgroundRelays")}</h3>
              <p className="muted">{t("relayKeepsOpen")}</p>
              {background.relays.map((r: any) => (
                <button
                  className="recent-row"
                  key={r.relayId}
                  disabled={!r.entryPath}
                  onClick={() =>
                    void api("project.open", { entryPath: r.entryPath })
                      .then((w) => {
                        attach(w);
                        setShowBackground(false);
                      })
                      .catch((e) => setError(errorText(e, t)))
                  }
                >
                  <span>
                    {r.provider} · {r.title || r.taskId}
                    <small>{r.directory}{r.dueAt ? ` · ${new Date(r.dueAt).toLocaleString(locale)}` : ""}</small>
                  </span>
                </button>
              ))}
            </>
          )}
          <button className="button" onClick={() => setShowBackground(false)}>
            {t("close")}
          </button>
        </div>
      )}
      {closing && (
        <div
          className="shell-dialog"
          role="alertdialog"
          aria-label={t("unsavedTab")}
        >
          <h2>{t("unsavedTab")}</h2>
          <div className="button-row">
            <button
              className="button primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  for (const id of closing.ids)
                    for (const guard of guards.current.get(id)?.values() ?? [])
                      if (guard.dirty) await guard.save();
                  await finishClose(closing.ids, closing.window, closing.ticket);
                } catch (e) {
                  setError(errorText(e, t));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {t("save")}
            </button>
            <button
              className="button"
              disabled={saving}
              onClick={() => void finishClose(closing.ids, closing.window, closing.ticket).catch((e) => setError(errorText(e, t)))}
            >
              {t("discard")}
            </button>
            <button
              className="button"
              disabled={saving}
              onClick={() => {
                setClosing(null);
                void (closing.ticket ? api("updates.cancel", { ticket: closing.ticket }) : api("window.cancelClose"));
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function TabFrame({
  tab,
  active,
  attach,
  newTab,
  goHome,
  homeNavigation,
  collapsed,
  toggleSidebar,
  switcher,
  reportTitle,
  reportPage,
  register,
}: {
  tab: Tab;
  active: boolean;
  attach: (w: Workspace) => void;
  newTab: () => void;
  goHome: () => void;
  homeNavigation: number;
  collapsed: boolean;
  toggleSidebar: () => void;
  switcher: React.ReactNode;
  reportTitle: (title: string) => void;
  reportPage: (page: string) => void;
  register: (id: string, guard: DirtyGuard | null) => void;
}) {
  const registration = useRef(register);
  registration.current = register;
  const stableRegister = useCallback(
    (id: string, g: DirtyGuard | null) => registration.current(id, g),
    [],
  );
  return (
    <TabContext.Provider
      value={{
        id: tab.id,
        active,
        initialPage: tab.page ?? "overview",
        reportPage,
        workspace: tab.workspace,
        attach,
        newTab,
        goHome,
        homeNavigation,
        collapsed,
        toggleSidebar,
        switcher,
        reportTitle,
        register: stableRegister,
      }}
    >
      <div
        className={`workspace-frame ${tab.id === HOME_ID ? "home-frame" : "tab-frame"}`}
        hidden={!active}
        data-tab-id={tab.id === HOME_ID ? undefined : tab.id}
        data-project-id={tab.workspace?.state.id}
      >
        <App />
      </div>
    </TabContext.Provider>
  );
}
