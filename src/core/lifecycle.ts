import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "./store";
import {
  atomicWrite,
  entryFiles,
  readJson,
  writeEntry,
  resolveEntry,
} from "./files";
import { fail } from "../shared/domain";

const journalName = ".haicomo-create.json";
/** Recover only a creation transaction, never repair a user-deleted entry. */
export function recoverCreation(directory: string) {
  const file = path.join(directory, journalName);
  if (!fs.existsSync(file)) return;
  const j = readJson(file);
  if (
    !/^\.haicomo-stage-[\w-]+$/.test(j.stage) ||
    !/^[\w-]+$/.test(j.archive) ||
    path.basename(j.entry) !== j.entry
  )
    fail("INVALID_CREATION_JOURNAL");
  const root = path.join(directory, ".haicomo"),
    stage = path.join(directory, j.stage),
    archive = path.join(directory, ".haicomo-history", j.archive, ".haicomo");
  const entryPath = path.join(directory, j.entry);
  let committed = false;
  try {
    committed = resolveEntry(entryPath).id === j.id;
  } catch {}
  if (!committed) {
    if (fs.existsSync(root)) {
      let id: string | undefined;
      try {
        id = readJson(path.join(root, "manifest.json")).id;
      } catch {}
      if (id === j.id) fs.rmSync(root, { recursive: true });
      else if (fs.existsSync(archive)) fail("CREATION_RECOVERY_CONFLICT");
    }
    if (fs.existsSync(archive)) fs.renameSync(archive, root);
  }
  fs.rmSync(stage, { recursive: true, force: true });
  fs.unlinkSync(file);
}
export function createFreshProject(entryPath: string, title: string) {
  const directory = fs.realpathSync(path.dirname(entryPath));
  entryPath = path.join(directory, path.basename(entryPath));
  if (!/\.haicomo$/i.test(entryPath)) fail("INVALID_ENTRY", entryPath);
  recoverCreation(directory);
  if (entryFiles(directory).length || fs.existsSync(entryPath))
    fail("ENTRY_ALREADY_EXISTS", entryPath);
  const root = path.join(directory, ".haicomo"),
    lock = path.join(root, "writer.lock");
  ProjectStore.unlockClosed(directory);
  if (fs.existsSync(lock)) {
    const info = readJson(lock);
    if (
      info.hostname !== os.hostname() &&
      info.hostname !== process.env.COMPUTERNAME &&
      info.hostname !== process.env.HOSTNAME
    )
      fail("PROJECT_LOCKED_OTHER_HOST");
    try {
      process.kill(info.pid, 0);
      fail("PROJECT_LOCKED");
    } catch (e: any) {
      if (e.code !== "ESRCH") throw e;
    }
  }
  const suffix = randomUUID(),
    stageName = `.haicomo-stage-${suffix}`,
    stage = path.join(directory, stageName);
  fs.mkdirSync(stage);
  let store: ProjectStore | undefined;
  try {
    store = new ProjectStore(stage, title);
    const identity = store.state();
    store.close();
    store = undefined;
    const archiveName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${suffix}`;
    atomicWrite(
      path.join(directory, journalName),
      JSON.stringify({
        stage: stageName,
        archive: archiveName,
        entry: path.basename(entryPath),
        id: identity.id,
      }),
    );
    if (fs.existsSync(root)) {
      const archive = path.join(directory, ".haicomo-history", archiveName);
      fs.mkdirSync(archive, { recursive: true });
      fs.renameSync(root, path.join(archive, ".haicomo"));
      atomicWrite(
        path.join(archive, "recovery.json"),
        JSON.stringify({
          at: new Date().toISOString(),
          originalDirectory: directory,
          reason: "Entry removed; retained before creating a new project",
        }),
      );
    }
    fs.renameSync(path.join(stage, ".haicomo"), root);
    writeEntry(entryPath, identity);
    recoverCreation(directory);
    return entryPath;
  } catch (error) {
    store?.close();
    if (fs.existsSync(path.join(directory, journalName)))
      recoverCreation(directory);
    else fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
export function restoreEntry(directory: string, fileName = "HAICoMo.haicomo") {
  directory = fs.realpathSync(directory);
  recoverCreation(directory);
  if (path.basename(fileName) !== fileName || !/\.haicomo$/i.test(fileName))
    fail("INVALID_ENTRY");
  if (entryFiles(directory).length) fail("ENTRY_ALREADY_EXISTS");
  const store = new ProjectStore(directory, undefined, true);
  try {
    if (
      (store.db.prepare("PRAGMA integrity_check").get() as any)
        .integrity_check !== "ok"
    )
      fail("BACKUP_INTEGRITY_FAILED");
    writeEntry(path.join(directory, fileName), store.state());
  } finally {
    store.close();
  }
  return path.join(directory, fileName);
}
export function restoreHistory(historyDirectory: string, target: string) {
  historyDirectory = fs.realpathSync(historyDirectory);
  if (
    path.basename(path.dirname(historyDirectory)) !== ".haicomo-history" ||
    !fs.existsSync(path.join(historyDirectory, "recovery.json"))
  )
    fail("INVALID_BACKUP");
  const source = path.join(historyDirectory, ".haicomo");
  if (!fs.existsSync(path.join(source, "project.sqlite")))
    fail("INVALID_BACKUP");
  if (entryFiles(target).length || fs.existsSync(path.join(target, ".haicomo")))
    fail("PROJECT_ALREADY_EXISTS");
  const staging = path.join(target, `.haicomo-history-restore-${randomUUID()}`);
  fs.mkdirSync(staging);
  let installed = false;
  try {
    fs.cpSync(source, path.join(staging, ".haicomo"), {
      recursive: true,
      filter: (p) => path.basename(p) !== "writer.lock",
    });
    const store = new ProjectStore(staging, undefined, true);
    const identity = store.state();
    const valid =
      (store.db.prepare("PRAGMA integrity_check").get() as any)
        .integrity_check === "ok";
    store.close();
    if (!valid) fail("BACKUP_INTEGRITY_FAILED");
    fs.renameSync(
      path.join(staging, ".haicomo"),
      path.join(target, ".haicomo"),
    );
    installed = true;
    writeEntry(path.join(target, "HAICoMo.haicomo"), identity);
    return path.join(target, "HAICoMo.haicomo");
  } catch (error) {
    if (installed)
      fs.renameSync(
        path.join(target, ".haicomo"),
        path.join(staging, ".haicomo"),
      );
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
