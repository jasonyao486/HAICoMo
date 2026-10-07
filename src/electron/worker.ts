import fs from "node:fs";
import { ProjectStore, restoreZip } from "../core/store";
import {
  projectDirectory,
  resolveEntry,
  entryFiles,
  type ProjectEntry,
} from "../core/files";
import {
  createFreshProject,
  restoreEntry,
  restoreHistory,
} from "../core/lifecycle";
import { errorData } from "../shared/errors";
const parent = (process as any).parentPort;
const stores = new Map<string, ProjectStore>();
const identity = (store: ProjectStore) => {
  const { id, epoch } = store.state();
  return { id, epoch };
};
function view(store: ProjectStore) {
  let entryError: string | undefined;
  try {
    store.assertEntry();
  } catch (e) {
    entryError = errorData(e).message;
  }
  return { ...store.view(), entryPath: store.entryPath, entryError };
}
function open(input: string, internal = false) {
  const entry = internal ? null : resolveEntry(input);
  const dir = entry?.directory ?? projectDirectory(input);
  if (entry)
    for (const [oldDir, old] of stores) {
      const state = old.state();
      if (
        oldDir !== dir &&
        !fs.existsSync(oldDir) &&
        state.id === entry.id &&
        state.epoch === entry.epoch
      ) {
        old.close(dir);
        stores.delete(oldDir);
      }
    }
  let store = stores.get(dir);
  if (!store) {
    store = new ProjectStore(input, undefined, internal);
    stores.set(dir, store);
  }
  if (entry) {
    const state = store.state();
    if (entry.id !== state.id || entry.epoch !== state.epoch)
      throw new Error("PROJECT_REPLACED");
    store.entryPath = entry.entryPath;
  }
  return store;
}
function whileClosed<T>(directory: string, operation: () => T): T {
  const old = stores.get(directory),
    entryPath = old?.entryPath;
  old?.close();
  stores.delete(directory);
  try {
    return operation();
  } catch (error) {
    if (old)
      try {
        const restored = open(directory, true);
        if (entryPath) restored.entryPath = entryPath;
      } catch {}
    throw error;
  }
}
function changed(directory: string, expected?: ProjectEntry | { id: string; epoch: string }) {
  const store = stores.get(directory);
  parent.postMessage({
    event: "changed",
    directory,
    identity: store ? identity(store) : expected,
    updatedAt: store?.state().updatedAt,
    title: store?.state().title,
  });
}
// Runner telemetry can arrive several times per second; one broadcast per
// directory every half second is enough for the renderer to refresh.
const coalesced = new Map<string, ReturnType<typeof setTimeout>>();
function changedSoon(directory: string, expected?: { id: string; epoch: string }) {
  if (coalesced.has(directory)) return;
  const timer = setTimeout(() => {
    coalesced.delete(directory);
    changed(directory, expected);
  }, 500);
  timer.unref?.();
  coalesced.set(directory, timer);
}
parent.on("message", ({ data }: { data: any }) => {
  const { id, type, directory, payload, identity: expected, humanName } = data;
  try {
    let result: any;
    if (type === "flush") {
      for (const store of stores.values()) store.flushPublish();
      result = true;
    } else if (type === "shutdown") {
      for (const store of stores.values()) store.close();
      stores.clear();
      result = true;
    } else if (type === "create") {
      const dir = projectDirectory(directory);
      if (entryFiles(dir).length || fs.existsSync(payload.entryPath))
        throw new Error("ENTRY_ALREADY_EXISTS");
      result = whileClosed(dir, () =>
        createFreshProject(payload.entryPath, payload.title),
      );
    } else if (type === "restoreEntry") {
      if (entryFiles(directory).length) throw new Error("ENTRY_ALREADY_EXISTS");
      result = whileClosed(directory, () => restoreEntry(directory));
    } else if (type === "restoreHistory")
      result = restoreHistory(payload.source, directory);
    else if (type === "lockInfo") {
      result = ProjectStore.foreignLock(projectDirectory(directory));
    } else if (type === "takeoverLock") {
      // Explicit, human-confirmed removal of a lock another computer left behind.
      const dir = projectDirectory(directory);
      if (stores.has(dir)) throw new Error("PROJECT_ALREADY_OPEN");
      const lock = ProjectStore.takeoverForeignLock(dir);
      const store = open(payload.entryPath);
      store.auditLockTakeover(lock, humanName ?? "");
      if (payload?.instanceId)
        store.markDisconnected(payload.instanceId, payload.activeIds ?? []);
      result = view(store);
    } else if (type === "open") {
      const store = open(
        payload?.internal ? directory : (payload?.entryPath ?? directory),
        payload?.internal,
      );
      if (payload?.internal && payload.entryPath)
        store.entryPath = payload.entryPath;
      if (
        expected &&
        (store.state().id !== expected.id ||
          store.state().epoch !== expected.epoch)
      )
        throw new Error("PROJECT_REPLACED");
      if (payload?.instanceId)
        store.markDisconnected(payload.instanceId, payload.activeIds ?? []);
      result = view(store);
    } else if (type === "restore") result = restoreZip(payload.file, directory);
    else {
      const store =
        stores.get(directory) ?? stores.get(projectDirectory(directory));
      if (!store) throw new Error("PROJECT_NOT_OPEN");
      if (
        expected &&
        (store.state().id !== expected.id ||
          store.state().epoch !== expected.epoch)
      )
        throw new Error("PROJECT_REPLACED");
      if (type === "view") result = view(store);
      else if (type === "proposals") result = store.queryProposals(payload);
      else if (type === "audit")
        result = store.queryAudit(payload.page, payload.pageSize);
      else if (type === "command") result = store.command(payload, humanName ?? "");
      else if (type === "import")
        result = store.importLegacy(
          payload.file,
          payload.projectId,
          payload.hash,
          humanName ?? "",
        );
      else if (type === "event") {
        store.recordEvent(payload);
        result = view(store);
      } else if (type === "export") {
        store.exportZip(payload.file);
        result = payload.file;
      } else if (type === "fork") {
        store.assertEntry();
        result = store.fork(payload.directory, humanName ?? "");
      } else if (type === "close") {
        store.close();
        stores.delete(store.directory);
        result = true;
      } else throw new Error("UNKNOWN_WORKER_OPERATION");
    }
    parent.postMessage({ id, result });
    if (type === "event") changedSoon(directory, expected);
    else if (["command", "import", "create", "takeoverLock"].includes(type)) changed(directory, expected);
  } catch (error) {
    parent.postMessage({ id, error: errorData(error) });
  }
});
const entryErrors = new Map<string, string>();
setInterval(() => {
  for (const [directory, store] of stores) {
    try {
      const warnings = JSON.stringify(store.warnings);
      let error = "";
      try {
        store.assertEntry();
      } catch (e) {
        error = errorData(e).message;
      }
      const entryChanged = entryErrors.get(directory) !== error;
      entryErrors.set(directory, error);
      if (
        store.ingest(false, 200) ||
        warnings !== JSON.stringify(store.warnings) ||
        entryChanged
      )
        changed(directory);
    } catch (e) {
      parent.postMessage({
        event: "warning",
        directory,
        error: errorData(e).message,
      });
    }
  }
}, 3000);
process.on("exit", () => {
  for (const store of stores.values()) store.close();
});
