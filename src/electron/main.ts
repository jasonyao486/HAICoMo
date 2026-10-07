import { resolveArtifactPath } from "../core/artifact-path";
import { portableArtifactPath } from "../shared/artifact-path";
import {
  app,
  autoUpdater as nativeUpdater,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  utilityProcess,
  clipboard,
  Menu,
  Tray,
  nativeImage,
  powerMonitor,
  type UtilityProcess,
} from "electron";
import { launchWindowsTerminal } from "./windows-terminal";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  atomicWrite,
  projectDirectory,
  readJson,
  resolveEntry,
  type ProjectEntry,
} from "../core/files";
import { LocalRunners, findExecutable, supportedEfforts } from "../providers/local";
import type { Settings, Recent, Workspace, Capabilities } from "../shared/domain";
import { assertTaskRunnable, inferFamily } from "../shared/domain";
import { z } from "zod";
import { detectClients, detectClient } from "../providers/registry";
import { HARNESS_IDS } from "../shared/clients";
import { InstallGate, resumeTabSchema, type ResumeWindow } from "../core/install";
import { UpdateController } from "../core/updates";
import { MacUpdater, NsisUpdater } from "electron-updater";
import { errorData } from "../shared/errors";
import { settingsSchema, defaultSettings, mergeSettings, applySettingsEdits } from "../shared/settings";
import { openLegalLink } from "../shared/legal";
import { legacyPreview } from "../core/legacy";
import { isRelaySystemCommand } from "../core/store";
import { relayPredecessor, type Relay } from "../shared/relay";
import { RelayScheduler } from "./relay";

// This file is present only in separately named, locally signed upgrade fixtures.
// It keeps their profile and debugging port stable across the native relaunch.
let upgradeFixture: { userData: string; cdpPort: number } | undefined;
if (app.getName().toLowerCase().includes("upgrade")) {
  try { upgradeFixture = z.object({ userData: z.string(), cdpPort: z.number().int().min(1024).max(65535) }).strict().parse(readJson(path.join(process.resourcesPath, "upgrade-fixture.json"))); } catch {}
}
if (upgradeFixture) { app.setPath("userData", upgradeFixture.userData); app.commandLine.appendSwitch("remote-debugging-port", String(upgradeFixture.cdpPort)); }
else if (process.env.HAICOMO_USER_DATA) app.setPath("userData", process.env.HAICOMO_USER_DATA);
const testing = process.env.HAICOMO_TEST === "1";
const upgradeIntegration = !!upgradeFixture;
let shutdownComplete = false, quitting = false;
const updateRestores = new Map<number, Promise<any>>();
let db: UtilityProcess;
let workerAlive = false;
let stopping = false;
let recovery: Promise<void> | null = null;
let recentCrashes: number[] = [];
const openedDirectories = new Map<string, ProjectEntry>();
let requestId = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
const windowProjects = new Map<number, Map<string, ProjectEntry>>();
const projectBindings = (win: BrowserWindow) => {
  let value = windowProjects.get(win.id);
  if (!value) {
    value = new Map();
    windowProjects.set(win.id, value);
  }
  return value;
};
const legacySelections = new Map<string, string>();
const closeAllowed = new Set<number>();
const replacingProjects = new Set<string>();
const startingProjects = new Map<string, number>();
let quitRequested = false;
const defaults = defaultSettings;
function configFile(name: string) {
  return path.join(app.getPath("userData"), name);
}
// settings.json is tiny but read on every request; cache it by file metadata.
let settingsCache: { mtimeMs: number; size: number; value: Settings } | null = null;
function settings(): Settings {
  const file = configFile("settings.json");
  let stat: fs.Stats;
  try { stat = fs.statSync(file); } catch { return structuredClone(defaults); }
  if (settingsCache && settingsCache.mtimeMs === stat.mtimeMs && settingsCache.size === stat.size) return structuredClone(settingsCache.value);
  try {
    const value = settingsSchema.parse(readJson(file));
    value.clientPaths = {
      codex: value.codexPath,
      claude: value.claudePath,
      ...value.clientPaths,
    };
    value.codexPath = value.clientPaths.codex ?? "";
    value.claudePath = value.clientPaths.claude ?? "";
    settingsCache = { mtimeMs: stat.mtimeMs, size: stat.size, value };
    return structuredClone(value);
  } catch {
    return structuredClone(defaults);
  }
}
function writeSettings(value: Settings) {
  atomicWrite(configFile("settings.json"), JSON.stringify(value, null, 2));
  settingsCache = null;
}
// Main-process strings (native dialogs, menu, tray) in the three resource languages.
const MAIN_TEXT = {
  "zh-CN": { file: "文件", newTab: "新建标签页", closeTab: "关闭当前标签", closeWindow: "关闭窗口", quitQuestion: "本地智能体仍在运行。退出并请求取消？", quitRelays: "已设定的接力任务在应用关闭期间不会执行。", keepRunning: "保持运行", quit: "退出", trayOpen: "打开 HAICoMo 窗口", trayQuit: "退出 HAICoMo", trayTooltip: "HAICoMo 正在后台运行智能体或接力任务" },
  "zh-TW": { file: "檔案", newTab: "新增分頁", closeTab: "關閉目前分頁", closeWindow: "關閉視窗", quitQuestion: "本機智慧體仍在執行。結束並要求取消？", quitRelays: "已設定的接力任務在應用程式關閉期間不會執行。", keepRunning: "保持執行", quit: "結束", trayOpen: "開啟 HAICoMo 視窗", trayQuit: "結束 HAICoMo", trayTooltip: "HAICoMo 正在背景執行智慧體或接力任務" },
  en: { file: "File", newTab: "New tab", closeTab: "Close current tab", closeWindow: "Close window", quitQuestion: "Local agents are running. Quit and request cancellation?", quitRelays: "Scheduled relay tasks do not run while the app is closed.", keepRunning: "Keep running", quit: "Quit", trayOpen: "Open HAICoMo window", trayQuit: "Quit HAICoMo", trayTooltip: "HAICoMo is running agents or relay tasks in the background" },
} as const;
function mainText(key: keyof (typeof MAIN_TEXT)["en"]) {
  const locale = settings().locale;
  return (locale === "zh-CN" ? MAIN_TEXT["zh-CN"] : locale === "zh-TW" ? MAIN_TEXT["zh-TW"] : MAIN_TEXT.en)[key];
}
function configureMenu() {
  const tabAction = (event: string) => () => {
    if (installGate.active || updates.state.status === "installing") return;
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().at(-1);
    if (win) win.webContents.send("haicomo:event", { event });
    else if (event === "tab.new") createWindow();
  };
  // On Windows/Linux the renderer owns Ctrl+T/W (the keydown also reaches it);
  // registering the accelerator there would fire both. macOS menus consume it.
  const registerAccelerator = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
      {
        label: mainText("file"),
        submenu: [
          {
            label: mainText("newTab"),
            accelerator: "CmdOrCtrl+T",
            registerAccelerator,
            click: tabAction("tab.new"),
          },
          {
            label: mainText("closeTab"),
            accelerator: "CmdOrCtrl+W",
            registerAccelerator,
            click: tabAction("tab.close"),
          },
          { label: mainText("closeWindow"), accelerator: "CmdOrCtrl+Shift+W", role: "close" },
          ...(process.platform !== "darwin" ? [{ role: "quit" as const }] : []),
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}
function recents(): Recent[] {
  try {
    return readJson<Recent[]>(configFile("recents.json")).map((r) => ({
      ...r,
      entryPath: r.entryPath ?? path.join(r.directory, "HAICoMo.haicomo"),
    }));
  } catch {
    return [];
  }
}
const broadcast = (event: any) =>
  BrowserWindow.getAllWindows().forEach((w) =>
    w.webContents.send("haicomo:event", event),
  );
const updates = new UpdateController(
  app.getVersion(),
  () => {
    const updater =
      process.platform === "darwin" ? new MacUpdater() : new NsisUpdater();
    updater.forceDevUpdateConfig = testing && !app.isPackaged;
    if (process.platform === "darwin") Object.assign(updater, {
      prepareInstall: () => new Promise<void>((resolve, reject) => {
        // electron-updater has downloaded the ZIP; the native updater must still
        // validate its signature. Keep the database open if that fails.
        const cleanup = () => { clearTimeout(timer); nativeUpdater.removeListener("error", failed); nativeUpdater.removeListener("update-downloaded", ready); };
        const failed = (error: Error) => { cleanup(); reject(error); };
        const ready = () => { cleanup(); resolve(); };
        const timer = setTimeout(() => failed(new Error("UPDATE_NATIVE_TIMEOUT")), 120000);
        nativeUpdater.once("error", failed); nativeUpdater.once("update-downloaded", ready);
        try { nativeUpdater.checkForUpdates(); } catch (error) { failed(error as Error); }
      }),
    });
    return updater;
  },
  (state) => {
    broadcast({ event: "updates", state });
    if (state.status === "error" && state.errorStage === "install" && shutdownComplete) void reopenAfterInstallFailure().catch((error) => broadcast({ event: "fatal", error: String(error) }));
  },
  testing || upgradeIntegration,
);
function updateFeed() {
  if (settings().updateFeed) return settings().updateFeed;
  try { return readJson<{ url: string }>(path.join(process.resourcesPath, "release-channel.json")).url || ""; } catch { return ""; }
}
const updateJournal = () => configFile("pending-update.json");
async function reopenAfterInstallFailure() {
  shutdownComplete = false; stopping = false; closeAllowed.clear();
  const old = db; workerAlive = false; db = undefined as any; old?.kill();
  try { await recoverWorker(); }
  finally {
    try { fs.rmSync(updateJournal(), { force: true }); } catch {}
    broadcast({ event: "updates.cancelled", error: errorData(new Error("UPDATE_PREPARATION_FAILED")) });
  }
}

const installGate = new InstallGate({
  busy: () => !!runners.active().length || startingProjects.size > 0,
  begin: () => updates.preparing(),
  prepare: (id, ticket) => BrowserWindow.fromId(id)?.webContents.send("haicomo:event", { event: "updates.prepare", ticket }),
  commit: async (windows) => {
    if (testing && process.env.HAICOMO_UPDATE_PREFLIGHT_TEST === "1") {
      await request("flush", "");
      updates.cancelPreparation();
      broadcast({ event: "updates.cancelled", verified: true });
      return;
    }
    await updates.stage();
    const journal = { from: app.getVersion(), target: updates.state.targetVersion, windows, at: new Date().toISOString() };
    atomicWrite(updateJournal(), JSON.stringify(journal, null, 2));
    try {
      await request("shutdown", "");
      stopping = true; shutdownComplete = true;
      for (const win of BrowserWindow.getAllWindows()) closeAllowed.add(win.id);
      updates.install();
    } catch (error) {
      if (shutdownComplete) await reopenAfterInstallFailure();
      throw error;
    }
  },
  cancel: () => { updates.cancelPreparation(); broadcast({ event: "updates.cancelled" }); },
  failed: (error) => {
    updates.failure(error, "install");
    try { fs.rmSync(updateJournal(), { force: true }); } catch {}
    broadcast({ event: "updates.cancelled", error: errorData(error) });
  },
});
async function restoreUpdateWindow(win: BrowserWindow, saved: ResumeWindow) {
  const tabs: any[] = []; let failed = 0;
  for (const tab of saved.tabs) {
    // The reserved "scheduled" page merged into the relay page in 0.3.0.
    const page = tab.page === "scheduled" ? "relay" : tab.page;
    if (!tab.entryPath) { tabs.push({ page, active: tab.active, workspace: null }); continue; }
    try {
      const entry = resolveEntry(tab.entryPath);
      if (entry.id !== tab.id || entry.epoch !== tab.epoch) throw new Error("PROJECT_REPLACED");
      tabs.push({ page, active: tab.active, workspace: await openProject(win, tab.entryPath) });
    } catch { failed++; }
  }
  return { tabs, failed, home: saved.home ?? false };
}
function restoreAfterUpdate(first: BrowserWindow) {
  if (!fs.existsSync(updateJournal())) return;
  try {
    const parsed = z.object({ from: z.string(), target: z.string(), at: z.string(), windows: z.array(z.object({ tabs: z.array(resumeTabSchema).max(100), home: z.boolean().optional() })).max(20) }).parse(readJson(updateJournal()));
    if (parsed.target !== app.getVersion()) {
      updates.restored(app.getVersion(), 1);
      fs.renameSync(updateJournal(), configFile("last-update-failed.json"));
      return;
    }
    const pending = parsed.windows.map((saved, i) => {
      const win = i === 0 ? first : createWindow();
      const promise = restoreUpdateWindow(win, saved);
      updateRestores.set(win.id, promise); return promise;
    });
    void Promise.all(pending).then((values) => {
      updates.restored(app.getVersion(), values.reduce((n, v) => n + v.failed, 0));
      atomicWrite(configFile("last-update.json"), JSON.stringify({ ...parsed, completedAt: new Date().toISOString(), restoredVersion: app.getVersion() }, null, 2));
      fs.rmSync(updateJournal(), { force: true });
    }).catch(() => updates.restored(app.getVersion(), 1));
  } catch {
    updates.restored(app.getVersion(), 1);
    fs.renameSync(updateJournal(), configFile("last-update-failed.json"));
  }
}
function rawRequest(
  type: string,
  directory: string,
  payload: any = {},
  identity?: Pick<ProjectEntry, "id" | "epoch">,
): Promise<any> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          "DATABASE_TIMEOUT: outcome unknown; reopen and inspect before retrying",
        ),
      );
    }, 60000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    try {
      db.postMessage({ id, type, directory, payload, identity, humanName: settings().userName ?? "" });
    } catch (error) {
      pending.get(id)?.reject(error as Error);
      pending.delete(id);
    }
  });
}
async function recoverWorker() {
  if (recovery) return recovery;
  if (workerAlive) return;
  recovery = (async () => {
    startWorker();
    for (const [directory, identity] of openedDirectories) {
      try {
        await rawRequest(
          "open",
          directory,
          {
            internal: true,
            entryPath: identity.entryPath,
            instanceId: runners.instanceId,
            activeIds: runners.active().map((r) => r.runId),
          },
          identity,
        );
      } catch (error) {
        broadcast({ event: "warning", directory, error: String(error) });
      }
    }
    broadcast({ event: "changed" });
  })().finally(() => {
    recovery = null;
  });
  return recovery;
}
async function request(
  type: string,
  directory: string,
  payload: any = {},
  identity = openedDirectories.get(directory),
) {
  if (!workerAlive || recovery) await recoverWorker();
  return rawRequest(type, directory, payload, identity);
}
/** A project with pending relays stays open so the scheduler can fire them. */
async function hasArmedRelays(directory: string) {
  if (scheduler.armed(directory)) return true;
  try {
    const view: Workspace = await request("view", directory);
    return view.state.relays.some((r) => r.enabled && ["scheduled", "firing"].includes(r.status));
  } catch {
    return false;
  }
}
async function releaseDirectory(directory: string) {
  if (
    stopping ||
    startingProjects.has(directory) ||
    runners.active().some((r) => r.directory === directory) ||
    [...windowProjects.values()].some((m) =>
      [...m.values()].some((p) => p.directory === directory),
    )
  )
    return;
  if (openedDirectories.has(directory)) {
    if (await hasArmedRelays(directory)) { syncTray(); return; }
    await request("close", directory).catch(() => {});
    openedDirectories.delete(directory);
    scheduler.forget(directory);
  }
  syncTray();
}

function startWorker() {
  const child = db = utilityProcess.fork(path.join(__dirname, "worker.cjs"), [], {
    serviceName: "HAICoMo database",
  });
  workerAlive = true;
  db.on("message", (m) => {
    if (m.event) {
      if (m.updatedAt && m.identity) {
        const items = recents();
        let changed = false;
        for (const r of items) if (r.id === m.identity.id && (!r.epoch || r.epoch === m.identity.epoch)) {
          if (r.updatedAt !== m.updatedAt || r.title !== m.title) { r.updatedAt = m.updatedAt; r.title = m.title ?? r.title; changed = true; }
        }
        if (changed) { atomicWrite(configFile("recents.json"), JSON.stringify(items, null, 2)); broadcast({ event: "recents", recents: items }); }
      }
      broadcast(m);
      return;
    }
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error
        ? p.reject(Object.assign(new Error(m.error.message), m.error))
        : p.resolve(m.result);
    }
  });
  db.on("exit", () => {
    if (db !== child) return;
    workerAlive = false;
    for (const p of pending.values())
      p.reject(new Error("DATABASE_WORKER_EXITED: reopen the project"));
    pending.clear();
    if (stopping) return;
    recentCrashes = recentCrashes.filter((at) => Date.now() - at < 60000);
    recentCrashes.push(Date.now());
    broadcast({
      event: "warning",
      error:
        "Database service stopped. Unconfirmed actions were not retried; check project history.",
    });
    if (recentCrashes.length <= 2)
      void recoverWorker().catch((error) =>
        broadcast({ event: "fatal", error: String(error) }),
      );
  });
}
let relayTickTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRelayTick(delay = 300) {
  if (relayTickTimer) return;
  relayTickTimer = setTimeout(() => { relayTickTimer = null; void scheduler.tick().then(syncTray); }, delay);
  relayTickTimer.unref?.();
}
const runners = new LocalRunners(
  (directory, e) => {
    void request(
      "event",
      directory,
      e,
      e.projectId && e.epoch
        ? ({ id: e.projectId, epoch: e.epoch } as ProjectEntry)
        : openedDirectories.get(directory),
    )
      .then(() => { if (e.lifecycle === "history") scheduleRelayTick(); })
      .catch((error) => broadcast({ event: "warning", error: String(error) }));
  },
  (p) => {
    for (const w of BrowserWindow.getAllWindows())
      for (const [binding, entry] of projectBindings(w))
        if (
          entry.directory === p.directory &&
          entry.id === p.projectId &&
          entry.epoch === p.epoch
        )
          w.webContents.send("haicomo:event", {
            event: "permission",
            ...p,
            binding,
          });
  },
  (directory, runId, id) => {
    broadcast({ event: "permissionResolved", directory, runId, id });
    void releaseDirectory(directory);
  },
);
// Capability detection spawns the client twice (and probes the Codex app server);
// remember results per executable identity for ten minutes.
const capabilityCache = new Map<string, { key: string; at: number; value: Capabilities }>();
function configuredPath(id: string) {
  const prefs = settings();
  return prefs.clientPaths[id] || (id === "codex" ? prefs.codexPath : id === "claude" ? prefs.claudePath : "");
}
function capabilityKey(provider: "codex" | "claude", executable: string) {
  let key = `${provider}:${executable}`;
  try { const s = fs.statSync(executable); key += `:${s.mtimeMs}:${s.size}`; } catch {}
  return key;
}
async function capability(provider: "codex" | "claude", fresh = false): Promise<Capabilities> {
  const configured = configuredPath(provider);
  const key = capabilityKey(provider, findExecutable(provider, configured));
  const hit = capabilityCache.get(provider);
  if (!fresh && hit && hit.key === key && Date.now() - hit.at < 600000) return hit.value;
  const value = await detectClient(provider, configured);
  capabilityCache.set(provider, { key, at: Date.now(), value });
  return value;
}
/** Shared checks for a human handoff and a relay start; throws domain codes. */
async function prepareStart(provider: "codex" | "claude", model: string | undefined, effort: string | undefined, mode: string | undefined) {
  const cap = await capability(provider);
  if (!cap.background) throw new Error(cap.reason || "BACKGROUND_UNSUPPORTED");
  if (mode && !cap.modes.includes(mode)) throw new Error(`MODE_UNSUPPORTED: ${mode}`);
  if (effort && !supportedEfforts(cap, model).includes(effort)) throw new Error("EFFORT_UNSUPPORTED_FOR_MODEL");
  return cap;
}
const scheduler = new RelayScheduler({
  directories: () => [...openedDirectories.keys()],
  view: (directory) => request("view", directory),
  command: (directory, type, payload) => request("command", directory, { id: randomUUID(), type, payload }),
  start: async (directory, relay: Relay, state, prompt) => {
    const identity = openedDirectories.get(directory);
    if (!identity) throw new Error("PROJECT_NOT_OPEN");
    if (replacingProjects.has(directory)) throw new Error("PROJECT_REPLACED");
    const checked = resolveEntry(identity.entryPath);
    if (checked.id !== identity.id || checked.epoch !== identity.epoch) throw new Error("PROJECT_REPLACED");
    if (installGate.active || updates.state.status === "installing") throw new Error("UPDATE_IN_PROGRESS");
    const cap = await prepareStart(relay.handoff.provider, relay.handoff.model || undefined, relay.handoff.effort || undefined, relay.handoff.mode || undefined);
    const predecessor = relayPredecessor(relay, state);
    const threadId = relay.handoff.continueThread ? predecessor?.threadId : relay.handoff.threadId || undefined;
    startingProjects.set(directory, (startingProjects.get(directory) ?? 0) + 1);
    try {
      const result = await runners.start({
        provider: relay.handoff.provider,
        executable: cap.executable,
        directory,
        taskId: relay.taskId,
        projectId: identity.id,
        epoch: identity.epoch,
        prompt,
        model: relay.handoff.model || undefined,
        effort: relay.handoff.effort || undefined,
        mode: relay.handoff.mode || undefined,
        threadId,
      });
      const model = relay.handoff.model || cap.models?.find((m) => m.isDefault)?.id || "";
      return { runId: result.runId, threadId: result.threadId, to: inferFamily(model) ?? `client:${relay.handoff.provider}` };
    } finally {
      const remaining = (startingProjects.get(directory) ?? 1) - 1;
      if (remaining) startingProjects.set(directory, remaining);
      else startingProjects.delete(directory);
    }
  },
  warn: (directory, message) => broadcast({ event: "warning", directory, error: message }),
});
// Windows/Linux have no dock: a tray keeps background agents and relays reachable
// after the last window closes.
let tray: Tray | null = null;
function syncTray() {
  if (process.platform === "darwin" || stopping) return;
  const needed = !BrowserWindow.getAllWindows().length && (runners.active().length > 0 || scheduler.armed() > 0);
  if (needed && !tray) {
    try {
      const icon = nativeImage.createFromPath(path.join(app.getAppPath(), "build", "icon.png")).resize({ width: 16, height: 16 });
      tray = new Tray(icon);
      tray.setToolTip(mainText("trayTooltip"));
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: mainText("trayOpen"), click: () => createWindow() },
        { label: mainText("trayQuit"), click: () => app.quit() },
      ]));
      tray.on("click", () => createWindow());
    } catch (error) {
      broadcast({ event: "warning", error: String(error) });
    }
  } else if (!needed && tray) {
    tray.destroy();
    tray = null;
  }
}
async function pickDirectory(
  win: BrowserWindow,
  title?: string,
  defaultPath?: string,
) {
  if (testing && process.env.HAICOMO_TEST_DIRECTORY)
    return process.env.HAICOMO_TEST_DIRECTORY;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory", "showHiddenFiles"],
    title,
    defaultPath,
  });
  return result.canceled ? null : result.filePaths[0];
}
async function openProject(win: BrowserWindow, input: string, takeoverLock = false) {
  const entry = resolveEntry(input),
    { directory } = entry;
  const duplicate = [...openedDirectories.values(), ...recents()].find(
    (r) =>
      r.id === entry.id &&
      r.directory !== directory &&
      (() => {
        try {
          const manifest = readJson(
            path.join(r.directory, ".haicomo", "manifest.json"),
          );
          return manifest.id === entry.id && manifest.epoch === entry.epoch;
        } catch {
          return false;
        }
      })(),
  );
  if (duplicate) throw new Error(`DUPLICATE_PROJECT: ${duplicate.directory}`);
  for (const old of openedDirectories.values())
    if (
      old.id === entry.id &&
      old.directory !== directory &&
      !fs.existsSync(old.directory) &&
      runners.hasProcesses(old.directory)
    )
      throw new Error("PROJECT_HAS_ACTIVE_RUNS");
  const view: Workspace = await request(
    takeoverLock ? "takeoverLock" : "open",
    directory,
    {
      entryPath: entry.entryPath,
      instanceId: runners.instanceId,
      activeIds: runners.active().map((r) => r.runId),
    },
    entry,
  );
  for (const [oldDir, old] of openedDirectories)
    if (old.id === entry.id && oldDir !== directory && !fs.existsSync(oldDir))
      openedDirectories.delete(oldDir);
  openedDirectories.set(directory, entry);
  for (const w of BrowserWindow.getAllWindows())
    for (const [token, old] of projectBindings(w)) {
      if (
        old.id === entry.id &&
        old.epoch === entry.epoch &&
        old.entryPath !== entry.entryPath &&
        (old.directory === directory || !fs.existsSync(old.directory))
      ) {
        projectBindings(w).set(token, entry);
        w.webContents.send("haicomo:event", {
          event: "relocated",
          binding: token,
          view: { ...view, ...entry, binding: token },
        });
      }
    }
  const bindings = projectBindings(win);
  const binding =
    [...bindings].find(
      ([, p]) =>
        p.id === entry.id &&
        p.epoch === entry.epoch &&
        p.directory === directory,
    )?.[0] ?? randomUUID();
  bindings.set(binding, entry);
  atomicWrite(
    configFile("recents.json"),
    JSON.stringify(
      [
        {
          ...entry,
          title: view.state.title,
          openedAt: new Date().toISOString(),
          updatedAt: view.state.updatedAt,
        },
        ...recents().filter(
          (r) => r.id !== entry.id && r.entryPath !== entry.entryPath,
        ),
      ].slice(0, 100),
      null,
      2,
    ),
  );
  scheduleRelayTick();
  return { ...view, binding, entryPath: entry.entryPath };
}
function routeFile(file: string) {
  if (installGate.active || updates.state.status === "installing") { broadcast({ event: "warning", error: "UPDATE_IN_PROGRESS" }); return; }
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().at(-1);
  if (!win) {
    createWindow(file);
    return;
  }
  void openProject(win, file)
    .then((view) => {
      win.show();
      win.focus();
      win.webContents.send("haicomo:event", { event: "opened", view });
    })
    .catch((error) =>
      win.webContents.send("haicomo:event", {
        event: "warning",
        error: errorData(error).message,
      }),
    );
}

function createWindow(initial?: string) {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#f5f6f3",
    title: "HAICoMo",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  if (process.env.HAICOMO_DEV_URL)
    void win.loadURL(process.env.HAICOMO_DEV_URL);
  else void win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.webContents.once("did-finish-load", () => {
    if (initial)
      void openProject(win, initial)
        .then((view) =>
          win.webContents.send("haicomo:event", { event: "opened", view }),
        )
        .catch((e) =>
          win.webContents.send("haicomo:event", {
            event: "warning",
            error: String(e),
          }),
        );
  });
  win.on("close", (e) => {
    if (!stopping && !closeAllowed.has(win.id)) {
      e.preventDefault();
      win.webContents.send("haicomo:event", { event: "window.closeRequested" });
    }
  });
  win.on("closed", () => {
    installGate.lostWindow(win.id);
    updateRestores.delete(win.id);
    const dirs = [...(windowProjects.get(win.id)?.values() ?? [])].map(
      (p) => p.directory,
    );
    windowProjects.delete(win.id);
    dirs.forEach((d) => void releaseDirectory(d));
    syncTray();
  });
  syncTray();
  return win;
}
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    const file = argv.find((a) => /\.haicomo$/i.test(a));
    if (file) routeFile(file);
    else (BrowserWindow.getAllWindows().at(-1) ?? createWindow()).show();
  });
  app.on("open-file", (e, file) => {
    e.preventDefault();
    if (app.isReady()) routeFile(file);
    else app.once("ready", () => setTimeout(() => routeFile(file), 50));
  });
  app.whenReady().then(() => {
    startWorker();
    configureMenu();
    scheduler.start(testing ? 2000 : 20000);
    powerMonitor.on("resume", () => scheduler.resume());
    const automaticUpdateCheck = () => {
      try {
        updates.configure(updateFeed());
        void updates.check();
      } catch (error) {
        broadcast({ event: "warning", error: String(error) });
      }
    };
    setTimeout(automaticUpdateCheck, 3000).unref();
    setInterval(automaticUpdateCheck, 12 * 60 * 60 * 1000).unref();
    ipcMain.handle("haicomo:request", async (event, type, payload) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || event.senderFrame !== event.sender.mainFrame)
          throw new Error("INVALID_SENDER");
        const mutations = ["project.command", "project.create", "project.restore", "project.recoverEntry", "project.recoverHistory", "project.fork", "legacy.import", "settings.patch", "settings.save", "providers.start", "providers.respond", "providers.cancel", "project.open", "project.window", "recent.locate", "recent.remove"];
        if ((installGate.frozen(win.id) || updates.state.status === "installing") && mutations.includes(type) || installGate.active && ["providers.start", "project.window"].includes(type)) throw new Error("UPDATE_IN_PROGRESS");
        const bindingId = payload?.binding;
        const binding = projectBindings(win).get(bindingId);
        if (bindingId && !binding) throw new Error("PROJECT_BINDING_EXPIRED");
        const dir = binding?.directory;
        payload = { ...payload };
        delete payload.binding;
        const projectRequest = (type: string, value: any = {}) => {
          if (!dir || !binding) throw new Error("NO_PROJECT");
          return request(type, dir, value, binding);
        };
        let result: any;
        switch (type) {
          case "window.confirmClose":
            closeAllowed.add(win.id);
            if (quitRequested) {
              if (
                BrowserWindow.getAllWindows().every((w) =>
                  closeAllowed.has(w.id),
                )
              )
                app.quit();
            } else win.close();
            result = true;
            break;
          case "window.cancelClose":
            quitRequested = false;
            closeAllowed.clear();
            result = true;
            break;
          case "bootstrap":
            result = {
              restore: await updateRestores.get(win.id),
              settings: settings(),
              recents: recents(),
              version: app.getVersion(),
              platform: process.platform,
              development: !app.isPackaged,
              projects: [...projectBindings(win)].map(([binding, entry]) => ({
                binding,
                ...entry,
              })),
            };
            break;
          case "project.home":
            result = { recents: recents() };
            break;
          case "legacy.preview": {
            if (!dir) throw new Error("NO_PROJECT");
            const resultFile = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
              filters: [{ name: "Work Planner", extensions: ["json", "html"] }],
            });
            if (resultFile.canceled) {
              result = null;
              break;
            }
            legacySelections.set(bindingId, resultFile.filePaths[0]);
            result = legacyPreview(resultFile.filePaths[0]);
            break;
          }
          case "legacy.import": {
            if (!dir) throw new Error("NO_PROJECT");
            const file = legacySelections.get(bindingId);
            if (!file) throw new Error("SELECT_LEGACY_FILE");
            result = await projectRequest("import", {
              file,
              projectId: z
                .union([z.string(), z.array(z.string()).min(1).max(1000)])
                .parse(payload.projectId),
              hash: z.string().parse(payload.hash),
            });
            legacySelections.delete(bindingId);
            break;
          }
          case "project.close":
            if (binding) {
              projectBindings(win).delete(bindingId);
              await releaseDirectory(binding.directory);
            }
            result = true;
            break;
          case "recent.remove":
            atomicWrite(
              configFile("recents.json"),
              JSON.stringify(
                recents().filter((r) => r.entryPath !== payload.entryPath),
              ),
            );
            result = recents();
            break;
          case "recent.locate": {
            const picked = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
              filters: [{ name: "HAICoMo", extensions: ["haicomo"] }],
            });
            if (picked.canceled) {
              result = null;
              break;
            }
            const entry = resolveEntry(picked.filePaths[0]);
            if (entry.id !== payload.projectId)
              throw new Error("ENTRY_IDENTITY_MISMATCH");
            result = await openProject(win, entry.entryPath);
            break;
          }
          case "project.create": {
            const picked = testing
              ? {
                  canceled: false,
                  filePath: path.join(
                    process.env.HAICOMO_TEST_DIRECTORY!,
                    "HAICoMo.haicomo",
                  ),
                }
              : await dialog.showSaveDialog(win, {
                  defaultPath: "HAICoMo.haicomo",
                  filters: [{ name: "HAICoMo", extensions: ["haicomo"] }],
                });
            if (picked.canceled || !picked.filePath) {
              result = null;
              break;
            }
            const directory = fs.realpathSync(path.dirname(picked.filePath));
            if (
              runners.hasProcesses(directory) ||
              startingProjects.has(directory) ||
              replacingProjects.has(directory)
            )
              throw new Error("PROJECT_HAS_ACTIVE_RUNS");
            replacingProjects.add(directory);
            try {
              const entry = await request("create", directory, {
                entryPath: picked.filePath,
                title: z.string().trim().min(1).max(300).parse(payload.title),
              });
              openedDirectories.delete(directory);
              scheduler.forget(directory);
              broadcast({ event: "invalidated", directory });
              result = await openProject(win, entry);
            } finally {
              replacingProjects.delete(directory);
            }
            break;
          }
          case "project.recoverEntry": {
            const directory = payload.directory || (await pickDirectory(win));
            if (!directory) {
              result = null;
              break;
            }
            if (runners.hasProcesses(directory))
              throw new Error("PROJECT_HAS_ACTIVE_RUNS");
            const entry = await request("restoreEntry", directory);
            result = await openProject(win, entry);
            break;
          }
          case "project.recoverHistory": {
            const source = await pickDirectory(
              win,
              settings().locale.startsWith("zh")
                ? "选择保留的历史副本（带日期的目录）"
                : "Choose retained history (dated directory)",
              dir ? path.join(dir, ".haicomo-history") : undefined,
            );
            if (!source) {
              result = null;
              break;
            }
            const target = await pickDirectory(
              win,
              settings().locale.startsWith("zh")
                ? "选择空的恢复目标目录"
                : "Choose an empty recovery destination",
            );
            if (!target) {
              result = null;
              break;
            }
            const entry = await request("restoreHistory", target, { source });
            result = await openProject(win, entry);
            break;
          }
          case "project.open": {
            let p = payload.entryPath ?? payload.directory;
            if (!p) {
              if (testing) p = process.env.HAICOMO_TEST_DIRECTORY;
              else {
                const r = await dialog.showOpenDialog(win, {
                  properties: ["openFile"],
                  filters: [{ name: "HAICoMo", extensions: ["haicomo"] }],
                });
                p = r.canceled ? null : r.filePaths[0];
              }
            }
            // takeoverLock is an explicit human confirmation that the other
            // computer named in the lock is no longer using the project.
            try {
              result = p ? await openProject(win, p, payload.takeoverLock === true) : null;
            } catch (error) {
              const data = errorData(error);
              if (data.code !== "PROJECT_LOCKED_OTHER_HOST" || !p) throw error;
              let details: Record<string, unknown> = {};
              try { details = JSON.parse(data.details ?? "{}"); } catch {}
              throw new Error(`PROJECT_LOCKED_OTHER_HOST: ${JSON.stringify({ ...details, entryPath: p })}`);
            }
            break;
          }
          case "project.window":
            if (!dir) throw new Error("NO_PROJECT");
            createWindow(binding!.entryPath);
            result = true;
            break;
          case "project.view":
            if (!dir) throw new Error("NO_PROJECT");
            result = await projectRequest("view");
            break;
          case "project.proposals":
          case "project.audit":
            if (!dir) throw new Error("NO_PROJECT");
            result = await projectRequest(type.split(".")[1], payload);
            break;
          case "project.command":
            if (
              payload.type === "session.untrack" &&
              runners
                .active()
                .some((r) => r.runId === payload.payload?.sessionId)
            )
              throw new Error("RUN_STILL_ACTIVE");
            if (typeof payload.type === "string" && isRelaySystemCommand(payload.type)) throw new Error("UNKNOWN_COMMAND");
            if (!dir) throw new Error("NO_PROJECT");
            if (payload.type === "relay.fireNow") {
              const current: Workspace = await projectRequest("view");
              const relay = current.state.relays.find((r) => r.id === payload.payload?.relayId);
              if (!relay) throw new Error("RELAY_NOT_FOUND");
              await prepareStart(relay.handoff.provider, relay.handoff.model || undefined, relay.handoff.effort || undefined, relay.handoff.mode || undefined);
            }
            result = await projectRequest("command", payload);
            if (typeof payload.type === "string" && payload.type.startsWith("relay.")) scheduleRelayTick(50);
            break;
          case "project.export": {
            if (!dir) throw new Error("NO_PROJECT");
            const r = await dialog.showSaveDialog(win, {
              defaultPath: `${path.basename(dir)}.haicomo.zip`,
              filters: [{ name: "HAICoMo backup", extensions: ["zip"] }],
            });
            result = r.canceled
              ? null
              : await projectRequest("export", { file: r.filePath });
            break;
          }
          case "project.restore": {
            const file = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
              filters: [{ name: "HAICoMo backup", extensions: ["zip"] }],
            });
            if (file.canceled) {
              result = null;
              break;
            }
            const target = await pickDirectory(win);
            if (!target) {
              result = null;
              break;
            }
            await request("restore", target, { file: file.filePaths[0] });
            result = await openProject(win, target);
            break;
          }
          case "project.fork": {
            if (!dir) throw new Error("NO_PROJECT");
            const target = await pickDirectory(win);
            if (!target) {
              result = null;
              break;
            }
            await projectRequest("fork", { directory: target });
            result = await openProject(win, target);
            break;
          }
          case "project.reveal":
            if (!dir) throw new Error("NO_PROJECT");
            result = await shell.openPath(path.join(dir, ".haicomo"));
            break;
          case "artifact.reveal": {
            if (!dir) throw new Error("NO_PROJECT");
            const value = z.string().min(1).max(4000).parse(payload.path);
            const file = resolveArtifactPath(dir, value);
            if (!fs.existsSync(file)) throw new Error("ARTIFACT_NOT_FOUND");
            shell.showItemInFolder(file);
            result = { revealed: true, insideProject: !path.relative(dir, file).startsWith("..") && !path.isAbsolute(path.relative(dir, file)) };
            break;
          }
          case "artifact.pick": {
            if (!dir) throw new Error("NO_PROJECT");
            const r = await dialog.showOpenDialog(win, {
              defaultPath: dir,
              properties: ["openFile", "multiSelections"],
            });
            result = r.canceled
              ? []
              : r.filePaths.map((file) => ({
                  id: randomUUID(),
                  label: path.basename(file),
                  path: portableArtifactPath(path.relative(dir, file)),
                }));
            break;
          }
          case "legal.openExternal":
            await openLegalLink(payload, (url) => shell.openExternal(url));
            break;
          case "settings.patch":
          case "settings.save": {
            const value = type === "settings.patch"
              ? payload.edits !== undefined ? applySettingsEdits(settings(), payload.edits) : mergeSettings(settings(), settingsSchema.parse(payload.base), settingsSchema.parse(payload.next))
              : settingsSchema.parse(payload);
            value.codexPath = value.clientPaths.codex ?? "";
            value.claudePath = value.clientPaths.claude ?? "";
            if (value.updateFeed !== settings().updateFeed) updates.configure(value.updateFeed);
            const previous = settings();
            writeSettings(value);
            for (const id of ["codex", "claude"] as const)
              if ((previous.clientPaths[id] ?? "") !== (value.clientPaths[id] ?? "")) capabilityCache.delete(id);
            broadcast({ event: "settings", settings: value });
            configureMenu();
            if (tray) { tray.setToolTip(mainText("trayTooltip")); }
            result = value;
            break;
          }
          case "providers.pickPath": {
            const picked = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
              title: "Select application or CLI executable",
            });
            result = picked.canceled ? null : picked.filePaths[0];
            break;
          }
          case "providers.background":
            result = {
              runs: runners.active().map((r) => ({
                ...r,
                entryPath: openedDirectories.get(r.directory)?.entryPath,
              })),
              permissions: runners.interactions(),
              relays: scheduler.summary().map((r) => ({ ...r, entryPath: openedDirectories.get(r.directory)?.entryPath })),
            };
            break;
          case "providers.detect": {
            const caps = await detectClients(settings());
            for (const cap of caps)
              if (cap.provider === "codex" || cap.provider === "claude")
                capabilityCache.set(cap.provider, { key: capabilityKey(cap.provider, findExecutable(cap.provider, configuredPath(cap.provider))), at: Date.now(), value: cap });
            result = caps;
            break;
          }
          case "providers.open": {
            const id = z.enum(HARNESS_IDS).parse(payload.provider);
            const cap = await detectClient(id, configuredPath(id));
            if (!cap.appPath) throw new Error("CLIENT_USES_TERMINAL");
            const error = await shell.openPath(cap.appPath);
            if (error) throw new Error(error);
            result = { opened: true, sent: false };
            break;
          }
          case "providers.active":
            result = runners
              .active()
              .filter(
                (r) =>
                  r.directory === dir &&
                  r.projectId === binding?.id &&
                  r.epoch === binding?.epoch,
              );
            break;
          case "providers.pending":
            result = runners
              .interactions()
              .filter(
                (p) =>
                  p.directory === dir &&
                  p.projectId === binding?.id &&
                  p.epoch === binding?.epoch,
              );
            break;
          case "providers.start": {
            if (!dir) throw new Error("NO_PROJECT");
            if (replacingProjects.has(dir)) throw new Error("PROJECT_REPLACED");
            startingProjects.set(dir, (startingProjects.get(dir) ?? 0) + 1);
            try {
              const data = z
                .object({
                  provider: z.enum(["codex", "claude"]),
                  taskId: z.string(),
                  prompt: z.string().min(1).max(100000),
                  model: z.string().max(200).optional(),
                  effort: z.string().min(1).max(30).optional(),
                  mode: z.string().min(1).max(40).optional(),
                  threadId: z.string().max(300).optional(),
                })
                .strict()
                .parse(payload);
              const checked = resolveEntry(binding!.entryPath);
              if (
                checked.id !== binding!.id ||
                checked.epoch !== binding!.epoch
              )
                throw new Error("PROJECT_REPLACED");
              const state: Workspace = await projectRequest("view");
              if (!state.state.tasks.some((t) => t.id === data.taskId))
                throw new Error("TASK_NOT_FOUND");
              assertTaskRunnable(
                state.state.tasks.find((t) => t.id === data.taskId)!,
                state.state.tasks,
              );
              const cap = await prepareStart(data.provider, data.model, data.effort, data.mode);
              if (!projectBindings(win).has(bindingId))
                throw new Error("PROJECT_BINDING_EXPIRED");
              const finalEntry = resolveEntry(binding!.entryPath);
              if (
                finalEntry.id !== binding!.id ||
                finalEntry.epoch !== binding!.epoch
              )
                throw new Error("PROJECT_REPLACED");
              result = await runners.start({
                ...data,
                directory: dir,
                projectId: binding!.id,
                epoch: binding!.epoch,
                executable: cap.executable,
              });
            } finally {
              const remaining = (startingProjects.get(dir) ?? 1) - 1;
              if (remaining) startingProjects.set(dir, remaining);
              else startingProjects.delete(dir);
              void releaseDirectory(dir);
            }
            break;
          }
          case "providers.cancel": {
            if (
              !runners
                .active()
                .some(
                  (r) =>
                    r.runId === payload.runId &&
                    r.directory === dir &&
                    r.projectId === binding?.id &&
                    r.epoch === binding?.epoch,
                )
            )
              throw new Error("RUN_NOT_FOUND");
            await runners.cancel(payload.runId);
            result = true;
            break;
          }
          case "providers.respond":
            if (
              !runners
                .active()
                .some(
                  (r) =>
                    r.runId === payload.runId &&
                    r.directory === dir &&
                    r.projectId === binding?.id &&
                    r.epoch === binding?.epoch,
                )
            )
              throw new Error("RUN_NOT_FOUND");
            runners.respond(
              payload.runId,
              payload.id,
              payload.method,
              payload.allow,
              payload.answers,
            );
            result = true;
            break;
          case "clipboard":
            clipboard.writeText(z.string().max(1000000).parse(payload.text));
            result = true;
            break;
          case "terminal.open": {
            if (!dir) throw new Error("NO_PROJECT");
            if (process.platform === "darwin")
              await shell.openPath(
                "/System/Applications/Utilities/Terminal.app",
              );
            else if (process.platform === "win32") {
              const launcher = launchWindowsTerminal(dir);
              await new Promise<void>((resolve, reject) => {
                launcher.once("error", reject);
                launcher.once("exit", code => code === 0 ? resolve() : reject(new Error(`TERMINAL_LAUNCH_FAILED (${code})`)));
              });
            } else
              throw new Error("Use your terminal to run the copied command");
            result = true;
            break;
          }
          case "feedback.export": {
            const r = await dialog.showSaveDialog(win, {
              defaultPath: "haicomo-diagnostics.json",
            });
            if (!r.canceled)
              atomicWrite(
                r.filePath!,
                JSON.stringify(
                  {
                    version: app.getVersion(),
                    platform: process.platform,
                    arch: process.arch,
                    os: os.release(),
                    description: String(payload.description ?? ""),
                    generatedAt: new Date().toISOString(),
                  },
                  null,
                  2,
                ),
              );
            result = !r.canceled;
            break;
          }
          case "updates.defer":
            updates.defer(); result = updates.state; break;
          case "updates.acknowledge":
            updates.acknowledgeRestore(); break;
          case "updates.cancel":
            installGate.cancel(payload.ticket); break;
          case "updates.ready": {
            const input = z.object({ ticket: z.string(), tabs: z.array(resumeTabSchema).max(100), home: z.boolean().optional() }).strict().parse(payload);
            for (const tab of input.tabs) if (tab.entryPath && ![...projectBindings(win).values()].some((p) => p.entryPath === tab.entryPath && p.id === tab.id && p.epoch === tab.epoch)) throw new Error("PROJECT_BINDING_EXPIRED");
            installGate.ready(win.id, input.ticket, input.tabs, input.home); result = true; break;
          }
          case "updates.state":
            result = updates.state;
            break;
          case "updates.check":
            updates.configure(updateFeed());
            result = await updates.check();
            break;
          case "updates.download":
            result = await updates.download();
            break;
          case "updates.install":
            if (runners.active().length || startingProjects.size) throw new Error("STOP_AGENTS_BEFORE_UPDATE");
            if (installGate.active) { result = true; break; }
            if (updates.state.status !== "downloaded") throw new Error("UPDATE_NOT_DOWNLOADED");
            if (testing && !upgradeIntegration && process.env.HAICOMO_UPDATE_PREFLIGHT_TEST !== "1") {
              result = { verified: true, installed: false, reason: "TEST_MODE" }; break;
            }
            result = { ticket: installGate.start(BrowserWindow.getAllWindows().map((w) => w.id)) };
            break;
          default:
            throw new Error("UNKNOWN_REQUEST");
        }
        if (result?.state?.tasks && binding && !result.binding)
          result = {
            ...result,
            binding: bindingId,
            entryPath: binding.entryPath,
          };
        return { result };
      } catch (error) {
        return { error: errorData(error) };
      }
    });
    const first = createWindow(process.argv.find((a) => /\.haicomo$/i.test(a)));
    restoreAfterUpdate(first);
  });
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length && !installGate.active && updates.state.status !== "installing") createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform === "darwin") return;
    if (runners.active().length || scheduler.armed()) { syncTray(); return; }
    app.quit();
  });
  app.on("before-quit", (e) => {
    if (shutdownComplete) return;
    e.preventDefault();
    if (stopping) return;
    if (!BrowserWindow.getAllWindows().every((w) => closeAllowed.has(w.id))) {
      quitRequested = true;
      for (const w of BrowserWindow.getAllWindows())
        if (!closeAllowed.has(w.id))
          w.webContents.send("haicomo:event", {
            event: "window.closeRequested",
          });
      return;
    }
    if (!quitting && runners.active().length) {
      void dialog
        .showMessageBox({
          type: "question",
          message: mainText("quitQuestion"),
          detail: scheduler.armed() ? mainText("quitRelays") : undefined,
          buttons: [mainText("keepRunning"), mainText("quit")],
          defaultId: 0,
          cancelId: 0,
        })
        .then((r) => {
          if (r.response === 1) {
            quitting = true;
            app.quit();
          } else {
            quitRequested = false;
            closeAllowed.clear();
          }
        });
      return;
    }
    quitting = true;
    stopping = true;
    scheduler.stop();
    tray?.destroy();
    tray = null;
    runners.dispose();
    // The worker acknowledges only after flushing and releasing its locks.
    // Killing it on a short wall-clock deadline can interrupt that cleanup.
    // request already has bounded timeout/worker-exit handling.
    void request("shutdown", "")
      .catch(() => {})
      .finally(() => {
        shutdownComplete = true;
        db?.kill();
        app.quit();
      });
  });
}
