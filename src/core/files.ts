import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  proposalSchema,
  runEventSchema,
  fail,
  type Proposal,
} from "../shared/domain";

export const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
function syncDirectory(directory: string) {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, "r");
    fs.fsyncSync(fd);
  } catch (error: any) {
    if (
      !["EINVAL", "EPERM", "EACCES", "EISDIR", "ENOTSUP"].includes(error.code)
    )
      throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
export function atomicWrite(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
    syncDirectory(path.dirname(file));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}
export function readJson<T = any>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export type ProjectEntry = {
  entryPath: string;
  directory: string;
  id: string;
  epoch: string;
};
export function entryFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((f) => f.isFile() && /\.haicomo$/i.test(f.name))
    .map((f) => path.join(directory, f.name));
}
export function resolveEntry(input: string): ProjectEntry {
  if (!fs.existsSync(input)) fail("ENTRY_NOT_FOUND", path.resolve(input));
  let file = fs.realpathSync(input);
  if (fs.statSync(file).isDirectory()) {
    if (path.basename(file) === ".haicomo") file = path.dirname(file);
    const entries = entryFiles(file);
    if (!entries.length)
      fail("ENTRY_NOT_FOUND", path.join(file, "HAICoMo.haicomo"));
    if (entries.length !== 1) fail("MULTIPLE_ENTRIES", file);
    file = entries[0];
  }
  if (!/\.haicomo$/i.test(file) || !fs.statSync(file).isFile())
    fail("INVALID_ENTRY", file);
  const directory = path.dirname(file);
  if (entryFiles(directory).length !== 1) fail("MULTIPLE_ENTRIES", directory);
  let entry: any, manifest: any;
  try {
    entry = readJson(file);
    manifest = readJson(path.join(directory, ".haicomo", "manifest.json"));
  } catch {
    fail("INVALID_ENTRY", file);
  }
  if (
    entry.format !== "haicomo" ||
    entry.data !== ".haicomo" ||
    ![1, 2].includes(entry.version)
  )
    fail("INVALID_ENTRY", file);
  if (
    entry.version === 2 &&
    (entry.projectId !== manifest.id || entry.epoch !== manifest.epoch)
  )
    fail("ENTRY_IDENTITY_MISMATCH", file);
  if (
    manifest.format !== "haicomo" ||
    typeof manifest.id !== "string" ||
    typeof manifest.epoch !== "string"
  )
    fail("INVALID_ENTRY", file);
  return { entryPath: file, directory, id: manifest.id, epoch: manifest.epoch };
}
export function writeEntry(
  entryPath: string,
  identity: { id: string; epoch: string },
) {
  if (fs.existsSync(entryPath)) fail("ENTRY_ALREADY_EXISTS", entryPath);
  immutableWrite(
    entryPath,
    JSON.stringify(
      {
        format: "haicomo",
        version: 2,
        data: ".haicomo",
        projectId: identity.id,
        epoch: identity.epoch,
      },
      null,
      2,
    ),
  );
}
export function projectDirectory(input: string): string {
  let dir = fs.realpathSync(input);
  if (fs.statSync(dir).isFile()) {
    if (!dir.endsWith(".haicomo")) fail("INVALID_ENTRY");
    const entry = readJson(dir);
    if (entry.format !== "haicomo" || entry.data !== ".haicomo")
      fail("INVALID_ENTRY");
    dir = path.dirname(dir);
  }
  if (path.basename(dir) === ".haicomo") dir = path.dirname(dir);
  return dir;
}
export function immutableWrite(file: string, data: string) {
  try {
    const fd = fs.openSync(file, "wx", 0o600);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    syncDirectory(path.dirname(file));
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
    if (fs.readFileSync(file, "utf8") !== data)
      fail("ID_REUSED", path.basename(file));
  }
}
export function publishProposal(directory: string, input: unknown) {
  const p = proposalSchema.parse(input),
    root = path.join(resolveEntry(directory).directory, ".haicomo"),
    manifest = readJson(path.join(root, "manifest.json"));
  if (p.projectId !== manifest.id || p.epoch !== manifest.epoch)
    fail("WRONG_PROJECT_OR_EPOCH");
  const content = JSON.stringify(p, null, 2),
    digest = hash(content);
  fs.mkdirSync(path.join(root, "inbox"), { recursive: true });
  immutableWrite(path.join(root, "inbox", `${p.proposalId}.json`), content);
  immutableWrite(path.join(root, "inbox", `${p.proposalId}.ready`), digest);
  return { proposalId: p.proposalId, status: "submitted", sha256: digest };
}
export function publishEvent(directory: string, input: unknown) {
  const e = runEventSchema.parse(input);
  if (e.source !== "self-report") fail("RUNNER_SOURCE_RESERVED");
  const entry = resolveEntry(directory);
  if (
    (e.projectId && e.projectId !== entry.id) ||
    (e.epoch && e.epoch !== entry.epoch)
  )
    fail("WRONG_PROJECT_OR_EPOCH");
  const dir = path.join(entry.directory, ".haicomo", "events");
  fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(e);
  immutableWrite(path.join(dir, `${e.id}.json`), content);
  immutableWrite(path.join(dir, `${e.id}.ready`), hash(content));
  return { id: e.id, status: "submitted" };
}
export function readSnapshot(directory: string) {
  return readJson(
    path.join(resolveEntry(directory).directory, ".haicomo", "snapshot.json"),
  );
}
export function exampleProposal(state: any): Proposal {
  return {
    protocolVersion: 2,
    projectId: state.id,
    epoch: state.epoch,
    proposalId: randomUUID(),
    actor: { name: "Your agent" },
    title: "Propose a task",
    reason: "Describe the evidence and intent",
    createdAt: new Date().toISOString(),
    dependsOn: [],
    changes: [
      {
        entity: "task",
        operation: "create",
        id: randomUUID(),
        expectedRevision: null,
        values: {
          title: "Review project requirements",
          assignees: ["human"],
          status: "todo",
        },
      },
    ],
  };
}

/** Offline status never infers receipt persistence from a ready marker. */
export function collaborationStatus(directory: string) {
  const root = path.join(resolveEntry(directory).directory, ".haicomo");
  const counts = {
    awaitingReceipt: 0,
    pendingReview: 0,
    processed: 0,
    invalidReceipt: 0,
    incomplete: 0,
  };
  for (const name of fs.readdirSync(path.join(root, "inbox"))) {
    if (
      name.endsWith(".json") &&
      !fs.existsSync(
        path.join(root, "inbox", name.replace(/\.json$/, ".ready")),
      )
    )
      counts.incomplete++;
    if (!name.endsWith(".ready")) continue;
    const id = name.slice(0, -6),
      file = path.join(root, "receipts", `${id}.json`);
    if (!fs.existsSync(file)) {
      counts.awaitingReceipt++;
      continue;
    }
    try {
      const receipt = readJson(file);
      if (receipt.proposalId !== id || receipt.persisted !== true) {
        counts.invalidReceipt++;
        continue;
      }
      if (receipt.status === "pending") counts.pendingReview++;
      else if (["applied", "rejected"].includes(receipt.status))
        counts.processed++;
      else counts.invalidReceipt++;
    } catch {
      counts.invalidReceipt++;
    }
  }
  return {
    manifest: readJson(path.join(root, "manifest.json")),
    snapshotUpdatedAt: readSnapshot(directory).updatedAt,
    source: "saved-snapshot",
    ...counts,
    pendingFiles: counts.awaitingReceipt + counts.pendingReview,
    receiptMissingMeaning:
      "unknown; acceptance and persistence are not confirmed",
  };
}
