import { ensureAgentGuide } from "./agent-guide";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { zipSync, unzipSync } from "fflate";
import { z } from "zod";
import { modelMetrics, type ProposalLike } from "../shared/analytics";
import { auditContext } from "../shared/audit";
import { searchTerms } from "../shared/search";
import type { AuditContext } from "../shared/domain";
import { convertLegacy } from "./legacy";
import {
  applyChange,
  blockers,
  changeSchema,
  fail,
  newState,
  proposalSchema,
  revisionGuard,
  runEventSchema,
  normalizeEvent,
  taskValuesSchema,
  validateGraph,
  type Audit,
  type ProjectState,
  type ProposalRecord,
  type Workspace,
  type RunEvent,
} from "../shared/domain";
import {
  relayAuditView,
  relayDecision,
  relayProgress,
  relayStarted,
  relayStepActor,
  relayPredecessor,
  relaySteps,
  relayValuesSchema,
  upgradeRelayV5,
  validateRelay,
  RELAY_LIVE_STATUSES,
  RELAY_MAX_DECISIONS,
  type Relay,
  type RelayDecisionEntry,
  type RelayStage,
  type RelayStep,
  type RelayV5,
  type RelayValues,
} from "../shared/relay";
import {
  atomicWrite,
  hash,
  readJson,
  projectDirectory,
  exampleProposal,
  resolveEntry,
  entryFiles,
  writeEntry,
} from "./files";

const now = () => new Date().toISOString();
export const SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6];
export const CURRENT_SCHEMA = 6;
// Written once if absent so a project kept in Git never commits the writer lock,
// backups or staging folders, and never has proposal bytes rewritten by EOL
// conversion (hash markers must match the exact bytes).
const GITIGNORE = `# HAICoMo: machine-local and regenerable files\nwriter.lock\nbackups/\nworktrees/\n*.tmp\n*.sqlite-journal\n.haicomo-stage-*\n.haicomo-restore-*\n.haicomo-history-restore-*\n`;
const GITATTRIBUTES = `# HAICoMo: proposal/event files are hashed byte-for-byte; never convert line endings\n* -text\nproject.sqlite binary\n`;
const RELAY_SYSTEM_COMMANDS = [
  "relay.claim",
  "relay.stepFired",
  "relay.stepFailed",
  "relay.stageFired",
  "relay.failed",
  "relay.blocked",
  "relay.missed",
  "relay.completed",
  "relay.decision",
  "relay.stepMerged",
];
const RELAY_HUMAN_COMMANDS = ["relay.pause", "relay.resume", "relay.cancel", "relay.fireNow", "relay.delete", "relay.retry", "relay.overrideStep"];
/** Runtime fields start blank; step ids are assigned once and never reused within a relay. */
function freshStages(values: RelayValues): RelayStage[] {
  return values.stages.map((stage) => ({
    steps: stage.steps.map((s) => ({ ...s, id: s.id ?? randomUUID(), runId: null, firedAt: null, error: "", attempt: 0, resumeThreadId: null, overriddenAt: null })),
  }));
}
const relayValuesOf = (relay: Relay): RelayValues => ({
  title: relay.title,
  afterSessionId: relay.afterSessionId,
  trigger: relay.trigger,
  autonomy: relay.autonomy,
  ...(relay.worktrees ? { worktrees: true } : {}),
  stages: relay.stages.map((stage) => ({ steps: stage.steps.map(({ runId, firedAt, error, attempt, resumeThreadId, overriddenAt, worktree, ...values }) => values) })),
});
/** The working copy a scheduler start reports; paths must stay inside the project's .haicomo/worktrees. */
const worktreeSchema = z.object({ path: z.string().min(1).max(4000), branch: z.string().regex(/^haicomo\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/), cwd: z.string().min(1).max(4000) }).strict();
export const isRelaySystemCommand = (type: string) => RELAY_SYSTEM_COMMANDS.includes(type);
const hostName = () => os.hostname();
const sameHost = (hostname: unknown) =>
  hostname === process.env.COMPUTERNAME || hostname === process.env.HOSTNAME || hostname === hostName();
export type WriterLock = { pid: number; hostname: string; token: string; at?: string; app?: string };

export class ProjectStore {
  // A directory can move while its SQLite connection is open. Reclaim only a
  // token whose connection this process has already closed, never an active lock.
  private static releasedLocks = new Set<string>();
  static unlockClosed(directory: string) {
    const file = path.join(directory, ".haicomo", "writer.lock");
    if (!fs.existsSync(file)) return;
    const lock = readJson(file);
    if (
      lock.pid === process.pid &&
      ProjectStore.releasedLocks.has(lock.token)
    ) {
      fs.unlinkSync(file);
      ProjectStore.releasedLocks.delete(lock.token);
    }
  }
  /** Read a lock left by another host. Returns null when no foreign lock exists. */
  static foreignLock(directory: string): WriterLock | null {
    const file = path.join(directory, ".haicomo", "writer.lock");
    if (!fs.existsSync(file)) return null;
    const lock = readJson<WriterLock>(file);
    return sameHost(lock.hostname) ? null : lock;
  }
  /**
   * Explicit human takeover of a lock left behind by another computer after an
   * unclean exit. The caller must have confirmed that computer is not using the
   * project; the removed lock is returned so the opening store can audit it.
   */
  static takeoverForeignLock(directory: string): WriterLock {
    const lock = ProjectStore.foreignLock(directory);
    if (!lock) fail("LOCK_NOT_FOREIGN");
    fs.unlinkSync(path.join(directory, ".haicomo", "writer.lock"));
    return lock;
  }
  private auditState?: ProjectState;
  private auditHuman = "";
  private modelCache?: { signature: string; proposals: unknown; value: ReturnType<typeof modelMetrics> };
  private proposalsCache: ProposalLike[] | null = null;
  private closed = false;
  readonly directory: string;
  readonly root: string;
  entryPath: string;
  readonly db!: DatabaseSync;
  warnings: string[] = [];
  private lockFile: string;
  private lockToken: string;
  private scanCache = new Map<string, string>();
  private scanErrors = new Map<string, string>();
  private dirtyReceipts = new Set<string>();
  private repairReceipts = true;
  private watchers: fs.FSWatcher[] = [];
  private inboxDirty = true;
  private lastScan = 0;
  private batching = false;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private proposalMetricsCache: Workspace["metrics"]["proposalActors"] | null =
    null;
  constructor(input: string, createTitle?: string, internal = false) {
    this.directory = projectDirectory(input);
    this.root = path.join(this.directory, ".haicomo");
    this.entryPath =
      createTitle !== undefined || internal
        ? path.join(this.directory, "HAICoMo.haicomo")
        : resolveEntry(input).entryPath;
    if (createTitle !== undefined) {
      createTitle = z.string().trim().min(1).max(300).parse(createTitle);
      if (entryFiles(this.directory).length) fail("ENTRY_ALREADY_EXISTS");
      if (fs.existsSync(this.root)) fail("PROJECT_ALREADY_EXISTS");
      fs.mkdirSync(this.root);
      const state = newState(
        randomUUID(),
        randomUUID(),
        z.string().trim().min(1).max(300).parse(createTitle),
        now(),
      );
      atomicWrite(
        path.join(this.root, "manifest.json"),
        JSON.stringify({
          format: "haicomo",
          schemaVersion: CURRENT_SCHEMA,
          id: state.id,
          epoch: state.epoch,
        }),
      );
      atomicWrite(path.join(this.root, "initial.json"), JSON.stringify(state));
    }
    const manifest = readJson(path.join(this.root, "manifest.json"));
    if (!SCHEMA_VERSIONS.includes(manifest.schemaVersion)) fail("UNSUPPORTED_SCHEMA");
    this.lockFile = path.join(this.root, "writer.lock");
    this.lockToken = randomUUID();
    if (fs.existsSync(this.lockFile)) {
      const lock = readJson<WriterLock>(this.lockFile);
      if (!sameHost(lock.hostname))
        fail(
          "PROJECT_LOCKED_OTHER_HOST",
          JSON.stringify({ hostname: lock.hostname, pid: lock.pid, at: lock.at ?? null, app: lock.app ?? null }),
        );
      if (!(
        lock.pid === process.pid && ProjectStore.releasedLocks.has(lock.token)
      ))
        try {
          process.kill(lock.pid, 0);
          fail("PROJECT_LOCKED", JSON.stringify({ hostname: lock.hostname, pid: lock.pid, at: lock.at ?? null }));
        } catch (e: any) {
          // ESRCH: dead process. EPERM (Windows/other user): the PID is alive.
          if (e.code === "EPERM") fail("PROJECT_LOCKED", JSON.stringify({ hostname: lock.hostname, pid: lock.pid, at: lock.at ?? null }));
          if (e.code !== "ESRCH") throw e;
        }
      fs.unlinkSync(this.lockFile);
      ProjectStore.releasedLocks.delete(lock.token);
    }
    fs.writeFileSync(
      this.lockFile,
      JSON.stringify({
        pid: process.pid,
        hostname: hostName(),
        token: this.lockToken,
        at: now(),
        app: "HAICoMo",
      } satisfies WriterLock),
      { flag: "wx" },
    );
    try {
      this.db = new DatabaseSync(path.join(this.root, "project.sqlite"));
      this.db.exec(
        "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, hash TEXT NOT NULL);",
      );
      if (!this.db.prepare("SELECT 1 FROM project").get()) {
        const initial = readJson(path.join(this.root, "initial.json"));
        this.db
          .prepare("INSERT INTO project VALUES(1,?)")
          .run(JSON.stringify(initial));
        fs.rmSync(path.join(this.root, "initial.json"));
      }
      const state = this.state();
      if (
        !SCHEMA_VERSIONS.includes(state.schemaVersion) ||
        state.id !== manifest.id ||
        state.epoch !== manifest.epoch
      )
        fail("MANIFEST_MISMATCH");
      for (const folder of ["inbox", "receipts", "events"])
        fs.mkdirSync(path.join(this.root, folder), { recursive: true });
      for (const [name, content] of [[".gitignore", GITIGNORE], [".gitattributes", GITATTRIBUTES]] as const)
        if (!fs.existsSync(path.join(this.root, name))) atomicWrite(path.join(this.root, name), content);
      this.migrate(manifest);
      for (const kind of ["inbox", "events"])
        try {
          this.watchers.push(
            fs.watch(path.join(this.root, kind), () => {
              this.inboxDirty = true;
            }),
          );
        } catch {}
      if (createTitle !== undefined) writeEntry(this.entryPath, this.state());
      const guideError = ensureAgentGuide(this.root);
      if (guideError) this.warnings.push(guideError);
      atomicWrite(
        path.join(this.root, "proposal-example.json"),
        JSON.stringify(exampleProposal(state), null, 2),
      );
      atomicWrite(
        path.join(this.root, "protocol.schema.json"),
        JSON.stringify(
          {
            ...z.toJSONSchema(proposalSchema),
            $defs: { taskValues: z.toJSONSchema(taskValuesSchema.partial()) },
            description:
              "changes with entity=task use the taskValues definition for values. Artifacts are {id,label,path} objects, not path strings. Relative paths resolve against the working directory. Agents cannot approve or accept.",
          },
          null,
          2,
        ),
      );
      this.publish();
      this.ingest(true, 200);
    } catch (e) {
      try {
        this.watchers.forEach((w) => w.close());
        this.db?.close();
      } catch {}
      fs.rmSync(this.lockFile, { force: true });
      throw e;
    }
  }
  private migrate(manifest: any) {
    const state = this.state();
    if ((state.schemaVersion as number) === 1) {
      // Backup must finish before the first migration write. Original inbox bytes are never changed.
      const backup = path.join(this.root, "backups", "pre-v2.haicomo.zip");
      if (!fs.existsSync(backup)) this.exportZip(backup);
      this.db.exec("BEGIN IMMEDIATE");
      try {
        (state as any).schemaVersion = 2;
        state.sessions = state.sessions.map((s) => ({
          ...s,
          ...normalizeEvent(s),
        }));
        this.db
          .prepare("UPDATE project SET json=? WHERE id=1")
          .run(JSON.stringify(state));
        this.audit(
          "system",
          "schema.migrate",
          state.id,
          { version: 1 },
          { version: 2 },
          "Pre-migration backup: backups/pre-v2.haicomo.zip",
        );
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
    if ((state.schemaVersion as number) < 3) {
      const backup = path.join(this.root, "backups", "pre-v3.haicomo.zip");
      if (!fs.existsSync(backup)) this.exportZip(backup);
      this.transaction(() => {
        const before = structuredClone(state.sessions);
        (state as any).schemaVersion = 3;
        state.sessions = state.sessions.map((s) =>
          s.source === "runner" && !s.lifecycle
            ? { ...s, lifecycle: "history", endReason: "legacy" }
            : s,
        );
        this.db
          .prepare("UPDATE project SET json=? WHERE id=1")
          .run(JSON.stringify(state));
        this.audit(
          "system",
          "schema.migrate",
          state.id,
          { version: 2, sessions: before },
          { version: 3, sessions: state.sessions },
          "Pre-migration backup: backups/pre-v3.haicomo.zip; old runner outcomes preserved as unknown history",
        );
      });
    }
    if ((state.schemaVersion as number) < 4) {
      const backup = path.join(this.root, "backups", "pre-v4.haicomo.zip");
      if (!fs.existsSync(backup)) this.exportZip(backup);
      this.transaction(() => {
        (state as any).schemaVersion = 4;
        state.relays = Array.isArray(state.relays) ? state.relays : [];
        this.db
          .prepare("UPDATE project SET json=? WHERE id=1")
          .run(JSON.stringify(state));
        this.audit(
          "system",
          "schema.migrate",
          state.id,
          { version: 3 },
          { version: 4 },
          "Pre-migration backup: backups/pre-v4.haicomo.zip; relay list added (empty)",
        );
      });
    }
    if ((state.schemaVersion as number) < 5) {
      const backup = path.join(this.root, "backups", "pre-v5.haicomo.zip");
      if (!fs.existsSync(backup)) this.exportZip(backup);
      this.transaction(() => {
        (state as any).schemaVersion = 5;
        state.historyStats = { acceptanceReturns: Number((this.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE json_extract(json,'$.action')='task.return'").get() as any).n) };
        this.db.prepare("UPDATE project SET json=? WHERE id=1").run(JSON.stringify(state));
        this.audit("system", "schema.migrate", state.id, { version: 4 }, { version: 5 }, "Pre-migration backup: backups/pre-v5.haicomo.zip; historical return count retained independently");
      });
    }
    if ((state.schemaVersion as number) < 6) {
      const backup = path.join(this.root, "backups", "pre-v6.haicomo.zip");
      if (!fs.existsSync(backup)) this.exportZip(backup);
      this.transaction(() => {
        const before = structuredClone(state.relays);
        state.schemaVersion = 6;
        state.relays = (state.relays as unknown as RelayV5[]).map((r) => upgradeRelayV5(r, state.sessions));
        this.db.prepare("UPDATE project SET json=? WHERE id=1").run(JSON.stringify(state));
        this.audit("system", "schema.migrate", state.id, { version: 5, relays: before }, { version: 6, relays: state.relays }, "Pre-migration backup: backups/pre-v6.haicomo.zip; each relay became a one-stage, one-step relay");
      });
    }
    // SQLite is authoritative after a committed migration.
    if (manifest.schemaVersion !== CURRENT_SCHEMA)
      atomicWrite(
        path.join(this.root, "manifest.json"),
        JSON.stringify({ ...manifest, schemaVersion: CURRENT_SCHEMA }),
      );
  }
  assertEntry() {
    const entry = resolveEntry(this.entryPath),
      state = this.state();
    if (entry.id !== state.id || entry.epoch !== state.epoch)
      fail("ENTRY_IDENTITY_MISMATCH", this.entryPath);
  }
  /** Audit an explicit foreign-lock takeover performed before this store opened. */
  auditLockTakeover(lock: WriterLock, humanName = "") {
    this.auditHuman = humanName;
    try {
      this.transaction(() => {
        this.audit(
          "human",
          "project.lock.takeover",
          this.state().id,
          { hostname: lock.hostname, pid: lock.pid, at: lock.at ?? null, app: lock.app ?? null },
          { hostname: hostName(), pid: process.pid },
          "Lock left by another computer was removed after human confirmation",
        );
      });
    } finally {
      this.auditHuman = "";
    }
  }
  markDisconnected(instanceId: string, activeIds: string[]) {
    const state = this.state();
    const changed = state.sessions.filter(
      (s) =>
        s.source === "runner" &&
        s.lifecycle === "current" &&
        !activeIds.includes(s.sessionId) &&
        s.instanceId !== instanceId &&
        (s.status !== "unknown" || s.endReason !== "lost"),
    );
    if (!changed.length) return;
    this.transaction(() => {
      for (const s of changed) {
        s.status = "unknown";
        s.endReason = "lost";
      }
      this.persist(state);
    });
  }

  state(): ProjectState {
    const state = JSON.parse(
      (this.db.prepare("SELECT json FROM project WHERE id=1").get() as any)
        .json,
    );
    state.metadataRevision ??= 0;
    state.relays ??= [];
    return state;
  }
  proposals(): ProposalRecord[] {
    return this.db
      .prepare("SELECT json FROM proposals ORDER BY rowid DESC")
      .all()
      .map((r: any) => JSON.parse(r.json));
  }
  queryProposals(
    input: {
      status?: string;
      author?: string;
      harnessId?: string;
      taskId?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(0, Math.trunc(input.page ?? 0)),
      size = Math.max(1, Math.min(100, Math.trunc(input.pageSize ?? 30)));
    const clauses: string[] = [],
      args: string[] = [];
    const add = (sql: string, value?: string) => {
      if (value && value !== "all") {
        clauses.push(sql);
        args.push(value);
      }
    };
    add("json_extract(json,'$.status')=?", input.status);
    add(
      "instr(lower(json_extract(json,'$.proposal.actor.name')),lower(?))>0",
      input.author,
    );
    add("json_extract(json,'$.proposal.actor.harnessId')=?", input.harnessId);
    add(
      "EXISTS(SELECT 1 FROM json_each(json_extract(proposals.json,'$.proposal.changes')) c WHERE json_extract(c.value,'$.entity')='task' AND json_extract(c.value,'$.id')=?)",
      input.taskId,
    );
    // Each term must match the title, reason, review note, author or a text value
    // in the proposed changes (field values only, never JSON keys or entity ids).
    for (const term of searchTerms(input.search)) {
      clauses.push(
        "(instr(lower(coalesce(json_extract(json,'$.proposal.title'),'') || ' ' || coalesce(json_extract(json,'$.proposal.reason'),'') || ' ' || coalesce(json_extract(json,'$.reviewNote'),'') || ' ' || coalesce(json_extract(json,'$.proposal.actor.name'),'')),lower(?))>0" +
          " OR EXISTS(SELECT 1 FROM json_tree(proposals.json,'$.proposal.changes') c WHERE c.type='text' AND c.key NOT IN ('entity','operation','id') AND instr(lower(c.value),lower(?))>0))",
      );
      args.push(term, term);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS n FROM proposals${where}`)
          .get(...args) as any
      ).n,
    );
    const items = this.db
      .prepare(
        `SELECT json FROM proposals${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, size, page * size)
      .map((r: any) => JSON.parse(r.json) as ProposalRecord);
    return { items, total, page, pageSize: size };
  }
  queryAudit(page = 0, pageSize = 30) {
    const size = Math.max(1, Math.min(100, Math.trunc(pageSize)));
    return {
      items: this.db
        .prepare("SELECT json FROM audit ORDER BY seq DESC LIMIT ? OFFSET ?")
        .all(size, Math.max(0, Math.trunc(page)) * size)
        .map((r: any) => JSON.parse(r.json) as Audit),
      total: Number(
        (this.db.prepare("SELECT COUNT(*) AS n FROM audit").get() as any).n,
      ),
      page,
      pageSize: size,
    };
  }
  /** Slim projection of every proposal for attribution metrics; rebuilt only when proposals change. */
  private proposalSummaries(): ProposalLike[] {
    if (this.proposalsCache) return this.proposalsCache;
    return (this.proposalsCache = this.db
      .prepare("SELECT json_extract(json,'$.proposal.proposalId') AS id, json_extract(json,'$.proposal.actor.family') AS family, json_extract(json,'$.proposal.changes') AS changes FROM proposals")
      .all()
      .map((r: any) => ({
        proposal: {
          proposalId: String(r.id),
          actor: { family: r.family ?? null },
          changes: (JSON.parse(r.changes) as any[]).map((c) => ({ entity: String(c.entity), id: String(c.id) })),
        },
      })));
  }
  private proposalMetrics() {
    if (this.proposalMetricsCache) return this.proposalMetricsCache;
    const result: Workspace["metrics"]["proposalActors"] = {},
      distinct = new Map<string, Set<string>>();
    for (const { proposal: p } of this.proposals()) {
      const keys = [
        ...new Set([
          p.actor.family ?? "unknown",
          ...(p.actor.harnessId ? [`client:${p.actor.harnessId}`] : []),
        ]),
      ];
      const tasks = new Set(
        p.changes.filter((c) => c.entity === "task").map((c) => c.id),
      );
      for (const key of keys) {
        const entry = (result[key] ??= {
          count: 0,
          taskMentions: 0,
          distinctTasks: 0,
        });
        entry.count++;
        entry.taskMentions += tasks.size;
        if (!distinct.has(key)) distinct.set(key, new Set());
        tasks.forEach((id) => distinct.get(key)!.add(id));
      }
    }
    for (const key of Object.keys(result))
      result[key].distinctTasks = distinct.get(key)!.size;
    return (this.proposalMetricsCache = result);
  }
  view(): Workspace {
    const state = this.state();
    const proposalMetrics = this.proposalMetrics();
    const agentGuideError = ensureAgentGuide(this.root, false);
    // Attribution depends on tasks, sessions and proposals, not on telemetry text.
    const signature = JSON.stringify([
      state.tasks.map((t) => [t.id, t.assignees, t.acceptedAt]),
      state.sessions.map((s) => [s.sessionId, s.family, s.taskIds, s.source, s.measuredMs]),
    ]);
    if (!this.modelCache || this.modelCache.signature !== signature || this.modelCache.proposals !== proposalMetrics)
      this.modelCache = { signature, proposals: proposalMetrics, value: modelMetrics(state, this.proposalSummaries()) };
    return {
      directory: this.directory,
      agentGuideError,
      state,
      proposals: this.queryProposals({ pageSize: 50 }).items,
      audit: this.db
        .prepare("SELECT json FROM audit ORDER BY seq DESC LIMIT 50")
        .all()
        .map((r: any) => JSON.parse(r.json)),
      warnings: [...this.warnings.filter(w => !w.startsWith("AGENT_GUIDE_")), ...(agentGuideError ? [agentGuideError] : [])],
      metrics: {
        totalProposals: Number(
          (this.db.prepare("SELECT COUNT(*) AS n FROM proposals").get() as any)
            .n,
        ),
        pendingProposals: Number(
          (
            this.db
              .prepare(
                "SELECT COUNT(*) AS n FROM proposals WHERE json_extract(json,'$.status')='pending'",
              )
              .get() as any
          ).n,
        ),
        proposalActors: proposalMetrics,
        models: this.modelCache.value,
        acceptanceReturns: state.historyStats.acceptanceReturns,
        auditEntries: Number(
          (this.db.prepare("SELECT COUNT(*) AS n FROM audit").get() as any).n,
        ),
      },
    };
  }
  private audit(
    actor: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
    reason = "",
    context?: Partial<AuditContext>,
  ) {
    const entry: Audit = {
      id: randomUUID(),
      at: now(),
      actor,
      action,
      entityId,
      before,
      after,
      reason,
    };
    entry.context = { ...auditContext(entry, this.auditState ?? this.state(), false), ...context };
    if (entry.context.actor.kind === "human") entry.context.actor.name = this.auditHuman;
    this.db
      .prepare("INSERT INTO audit(json) VALUES(?)")
      .run(JSON.stringify(entry));
  }
  private persist(state: ProjectState) {
    state.revision++;
    state.updatedAt = now();
    this.db
      .prepare("UPDATE project SET json=? WHERE id=1")
      .run(JSON.stringify(state));
  }
  /**
   * `deferPublish` is used only for current-run telemetry: the database commit
   * is immediate, while the snapshot/receipt files are written at most every
   * two seconds. Any other change, and close(), flush immediately.
   */
  private transaction(fn: () => void, deferPublish = false) {
    if (this.batching) {
      fn();
      return;
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    if (deferPublish) this.schedulePublish();
    else this.publish();
    this.auditState = undefined;
    this.auditHuman = "";
  }
  private schedulePublish() {
    if (this.publishTimer) return;
    const timer = setTimeout(() => {
      this.publishTimer = null;
      if (!this.closed) this.publish();
    }, 2000);
    timer.unref?.();
    this.publishTimer = timer;
  }
  /** Write any deferred telemetry snapshot now. */
  flushPublish() {
    if (!this.publishTimer) return false;
    clearTimeout(this.publishTimer);
    this.publishTimer = null;
    this.publish();
    return true;
  }
  publish() {
    if (this.publishTimer) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
    try {
      atomicWrite(
        path.join(this.root, "snapshot.json"),
        JSON.stringify(this.state(), null, 2),
      );
      const receipts = this.repairReceipts
        ? this.proposals()
        : [...this.dirtyReceipts].map((id) => {
            const row = this.db
              .prepare("SELECT json FROM proposals WHERE id=?")
              .get(id) as any;
            return JSON.parse(row.json) as ProposalRecord;
          });
      for (const p of receipts) {
        const file = path.join(
          this.root,
          "receipts",
          `${p.proposal.proposalId}.json`,
        );
        const content = JSON.stringify(
          {
            proposalId: p.proposal.proposalId,
            status: p.status,
            receivedAt: p.receivedAt,
            reviewedAt: p.reviewedAt,
            note: p.reviewNote,
            appliedRevision: p.appliedRevision,
            persisted: true,
          },
          null,
          2,
        );
        if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content)
          atomicWrite(file, content);
        this.dirtyReceipts.delete(p.proposal.proposalId);
      }
      this.repairReceipts = false;
      this.warnings = this.warnings.filter(
        (w) => !w.startsWith("PUBLISH_FAILED"),
      );
    } catch (e) {
      this.repairReceipts = true;
      this.warnings.push(
        `PUBLISH_FAILED: database committed; snapshot/receipts will be rebuilt on reopen. ${String(e)}`,
      );
    }
  }
  ingest(force = true, maxFiles = Infinity): boolean {
    if (!force && !this.inboxDirty && Date.now() - this.lastScan < 15000)
      return false;
    this.inboxDirty = false;
    this.lastScan = Date.now();
    let changed = false;
    const errors: string[] = [];
    const fingerprints = new Map<string, string>();
    const identity = this.state();
    let processed = 0;
    this.db.exec("BEGIN IMMEDIATE");
    this.batching = true;
    try {
      incoming: for (const kind of ["inbox", "events"])
        for (const name of fs
          .readdirSync(path.join(this.root, kind))
          .filter((n) => n.endsWith(".ready"))) {
          const key = `${kind}/${name}`;
          let fingerprint = "";
          try {
            const jsonFile = path.join(
              this.root,
              kind,
              `${name.slice(0, -6)}.json`,
            );
            const a = fs.lstatSync(jsonFile),
              b = fs.lstatSync(path.join(this.root, kind, name));
            if (a.isSymbolicLink() || b.isSymbolicLink())
              fail("SYMLINK_REJECTED");
            fingerprint = [
              a.ino,
              a.size,
              a.mtimeMs,
              a.ctimeMs,
              b.ino,
              b.size,
              b.mtimeMs,
              b.ctimeMs,
            ].join(":");
            if (this.scanCache.get(key) === fingerprint) {
              if (this.scanErrors.has(key))
                errors.push(this.scanErrors.get(key)!);
              continue;
            }
            if (processed >= maxFiles) {
              this.inboxDirty = true;
              fingerprint = "";
              break incoming;
            }
            processed++;
            this.db.exec("SAVEPOINT incoming_file");
            const id = name.slice(0, -6);
            if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail("INVALID_ID");
            const file = path.join(this.root, kind, `${id}.json`);
            if (fs.lstatSync(file).isSymbolicLink()) fail("SYMLINK_REJECTED");
            if (fs.statSync(file).size > 2 * 1024 * 1024)
              fail("PAYLOAD_TOO_LARGE");
            const raw = fs.readFileSync(file),
              digest = hash(raw);
            if (
              fs
                .readFileSync(path.join(this.root, kind, name), "utf8")
                .trim() !== digest
            )
              fail("HASH_MISMATCH");
            if (kind === "events") {
              const old = this.db
                .prepare("SELECT hash FROM events WHERE id=?")
                .get(id) as any;
              if (old) {
                if (old.hash !== digest) fail("ID_REUSED");
                continue;
              }
              const event = runEventSchema.parse(JSON.parse(raw.toString()));
              if (event.id !== id || event.source !== "self-report")
                fail("INVALID_EVENT");
              this.recordEvent(event, digest);
              changed = true;
              continue;
            }
            const old = this.db
              .prepare("SELECT json FROM proposals WHERE id=?")
              .get(id) as any;
            if (old) {
              if (JSON.parse(old.json).hash !== digest) fail("ID_REUSED");
              continue;
            }
            const p = proposalSchema.parse(JSON.parse(raw.toString())),
              state = identity;
            if (
              p.proposalId !== id ||
              p.projectId !== state.id ||
              p.epoch !== state.epoch
            )
              fail("WRONG_PROJECT_OR_EPOCH");
            if (p.dependsOn.includes(id)) fail("PROPOSAL_DEPENDENCY_CYCLE");
            const all = new Map([[id, p]]);
            const visiting = new Set<string>(),
              done = new Set<string>();
            const walk = (key: string) => {
              if (visiting.has(key)) fail("PROPOSAL_DEPENDENCY_CYCLE");
              if (done.has(key)) return;
              visiting.add(key);
              if (!all.has(key)) {
                const row = this.db
                  .prepare("SELECT json FROM proposals WHERE id=?")
                  .get(key) as any;
                if (row) all.set(key, JSON.parse(row.json).proposal);
              }
              all.get(key)?.dependsOn.forEach(walk);
              visiting.delete(key);
              done.add(key);
            };
            walk(id);
            const record: ProposalRecord = {
              proposal: p,
              raw: raw.toString("utf8"),
              hash: digest,
              status: "pending",
              receivedAt: now(),
              reviewedAt: null,
              reviewNote: "",
              appliedRevision: null,
            };
            this.db
              .prepare("INSERT INTO proposals VALUES(?,?)")
              .run(id, JSON.stringify(record));
            this.dirtyReceipts.add(id);
            changed = true;
          } catch (e) {
            try {
              this.db.exec("ROLLBACK TO incoming_file");
            } catch {}
            const message = `${kind}/${name}: ${String(e)}`;
            errors.push(message);
            this.scanErrors.set(key, message);
            // Errors are retried, including after a disk/permission recovery without metadata changes.
            fingerprint = "";
          } finally {
            try {
              this.db.exec("RELEASE incoming_file");
            } catch {}
            if (fingerprint) {
              fingerprints.set(key, fingerprint);
              this.scanErrors.delete(key);
            }
          }
        }
      this.db.exec("COMMIT");
      fingerprints.forEach((v, k) => this.scanCache.set(k, v));
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.batching = false;
    }
    this.warnings = [
      ...this.warnings.filter((w) => w.startsWith("PUBLISH_FAILED")),
      ...errors,
    ];
    if (changed) {
      this.proposalMetricsCache = null;
      this.proposalsCache = null;
      this.publish();
    }
    return changed;
  }
  /** A reported working copy must live under this project's .haicomo/worktrees. */
  private insideWorktrees(w: { path: string; branch: string; cwd: string }) {
    const base = path.join(path.dirname(this.root), ".haicomo", "worktrees");
    const inside = (p: string) => {
      const r = path.relative(base, path.resolve(p));
      return r !== "" && !r.startsWith("..") && !path.isAbsolute(r);
    };
    if (!inside(w.path) || !inside(w.cwd)) fail("WORKTREE_OUTSIDE_PROJECT");
    return w;
  }
  private relayOf(state: ProjectState, id: unknown, expectedRevision?: unknown, required = false): Relay {
    const relay = state.relays.find((r) => r.id === id);
    if (!relay) fail("RELAY_NOT_FOUND");
    if (expectedRevision !== undefined || required) revisionGuard(relay.revision, expectedRevision);
    return relay;
  }
  command(input: any, humanName = ""): Workspace {
    this.assertEntry();
    const op = z
      .object({
        id: z.string().min(1).max(100),
        type: z.string(),
        payload: z.unknown(),
      })
      .strict()
      .parse(input);
    const digest = hash(JSON.stringify(op));
    const previous = this.db
      .prepare("SELECT hash FROM commands WHERE id=?")
      .get(op.id) as any;
    if (previous) {
      if (previous.hash !== digest) fail("ID_REUSED");
      return this.view();
    }
    this.auditHuman = humanName;
    try { this.transaction(() => {
      const state = this.state(),
        beforeState = structuredClone(state),
        p = op.payload as any,
        at = now();
      this.auditState = state;
      if (op.type === "audit.delete") {
        const { auditId } = z.object({ auditId: z.string().uuid() }).strict().parse(p);
        const result = this.db.prepare("DELETE FROM audit WHERE json_extract(json,'$.id')=?").run(auditId);
        if (Number(result.changes) !== 1) fail("AUDIT_NOT_FOUND");
        // Do not preserve the deleted payload in another audit row. Command hashes
        // retain idempotency; historical business metrics live in project state.
      } else if (op.type === "session.untrack") {
        const session = state.sessions.find((s) => s.sessionId === p.sessionId);
        if (!session) fail("SESSION_NOT_FOUND");
        const before = structuredClone(session);
        session.lifecycle = "history";
        session.endReason = "tracking-ended";
        this.audit(
          "human",
          op.type,
          session.sessionId,
          before,
          session,
          "Tracking ended; this does not stop an external process or accept delivery",
        );
      } else if (op.type === "change") {
        const change = changeSchema.parse(p);
        const result = applyChange(state, change, at);
        validateGraph(state.tasks);
        this.audit(
          "human",
          `${change.entity}.${change.operation}`,
          change.id,
          result.before,
          result.after,
        );
      } else if (
        [
          "task.accept",
          "task.return",
          "task.archive",
          "task.restore",
          "task.delete",
        ].includes(op.type)
      ) {
        const task = state.tasks.find((t) => t.id === p.taskId);
        if (!task) fail("TASK_NOT_FOUND");
        revisionGuard(task.revision, p.expectedRevision);
        const before = structuredClone(task);
        if (op.type === "task.accept") {
          if (task.status !== "delivered") fail("NOT_DELIVERED");
          if (
            blockers(task, state.tasks).length ||
            state.tasks.some((t) => t.parentId === task.id && !t.acceptedAt)
          )
            fail("UNFINISHED_PREREQUISITES_OR_CHILDREN");
          task.acceptedAt = at;
          task.progress = 100;
        } else if (op.type === "task.return") {
          state.historyStats.acceptanceReturns++;
          task.status = "doing";
          task.acceptedAt = null;
          let parent = state.tasks.find((t) => t.id === task.parentId);
          while (parent) {
            if (parent.acceptedAt) {
              parent.acceptedAt = null;
              parent.revision++;
              parent.updatedAt = at;
            }
            parent = state.tasks.find((t) => t.id === parent!.parentId);
          }
        } else if (op.type === "task.archive" || op.type === "task.restore") {
          task.archived = op.type === "task.archive";
          if (
            task.archived &&
            state.tasks.some((t) => t.parentId === task.id && !t.archived)
          )
            fail("ARCHIVE_CHILDREN_FIRST");
        } else {
          if (!task.archived) fail("ARCHIVE_BEFORE_DELETE");
          if (
            state.tasks.some(
              (t) => t.parentId === task.id || t.dependencies.includes(task.id),
            ) ||
            state.relays.some((r) => RELAY_LIVE_STATUSES.includes(r.status) && relaySteps(r).some((s) => s.taskId === task.id || s.referenceTaskId === task.id))
          )
            fail("TASK_REFERENCED");
          state.tasks = state.tasks.filter((t) => t.id !== task.id);
        }
        task.revision++;
        task.updatedAt = at;
        this.audit(
          "human",
          op.type,
          task.id,
          before,
          op.type === "task.delete" ? null : task,
          String(p.reason ?? ""),
        );
      } else if (op.type === "note.delete") {
        const n = state.notes.find((n) => n.id === p.id);
        if (!n) fail("NOTE_NOT_FOUND");
        revisionGuard(n.revision, p.expectedRevision);
        state.notes = state.notes.filter((n) => n.id !== p.id);
        this.audit("human", op.type, p.id, n, null);
      } else if (op.type === "proposal.review") {
        const row = this.db
          .prepare("SELECT json FROM proposals WHERE id=?")
          .get(p.proposalId) as any;
        if (!row) fail("PROPOSAL_NOT_FOUND");
        const record: ProposalRecord = JSON.parse(row.json);
        if (record.status !== "pending") fail("ALREADY_REVIEWED");
        if (p.decision === "approve") {
          for (const dep of record.proposal.dependsOn) {
            const r = this.db
              .prepare("SELECT json FROM proposals WHERE id=?")
              .get(dep) as any;
            if (!r || JSON.parse(r.json).status !== "applied")
              fail("PROPOSAL_DEPENDENCY_UNRESOLVED", dep);
          }
          const changes = p.changes
            ? z.array(changeSchema).min(1).max(200).parse(p.changes)
            : record.proposal.changes;
          for (const change of changes) {
            const result = applyChange(state, change, at);
            this.audit(
              `${record.proposal.actor.name} → human`,
              `${change.entity}.${change.operation}`,
              change.id,
              result.before,
              result.after,
              record.proposal.reason,
              { actor: { kind: "model", ...record.proposal.actor }, reviewer: { kind: "human", name: humanName }, proposalId: record.proposal.proposalId, modified: JSON.stringify(changes) !== JSON.stringify(record.proposal.changes) },
            );
          }
          validateGraph(state.tasks);
          record.status = "applied";
          record.appliedRevision = state.revision + 1;
          record.appliedChanges = changes;
        } else if (p.decision === "reject") record.status = "rejected";
        else fail("INVALID_DECISION");
        this.dirtyReceipts.add(p.proposalId);
        record.reviewedAt = at;
        record.reviewNote = String(p.reason ?? "");
        this.db
          .prepare("UPDATE proposals SET json=? WHERE id=?")
          .run(JSON.stringify(record), p.proposalId);
        this.audit(
          "human",
          op.type,
          p.proposalId,
          null,
          record,
          record.reviewNote,
          { decision: p.decision, proposalId: record.proposal.proposalId },
        );
      } else if (op.type === "handoff.record") {
        const handoff = z
          .object({
            id: z.string(),
            taskId: z.string(),
            provider: z.string(),
            from: z.array(z.string()),
            to: z.string(),
            prompt: z.string(),
            sessionId: z.string().optional(),
            at: z.string().datetime(),
            mode: z.enum(["copy", "foreground", "background", "relay"]),
            relayId: z.string().optional(),
          })
          .strict()
          .parse(p);
        // Relay handoffs are written by the scheduler inside relay.stepFired, never as a human record.
        if (handoff.mode === "relay") fail("RELAY_SYSTEM_ONLY");
        if (!state.tasks.some((t) => t.id === handoff.taskId))
          fail("TASK_NOT_FOUND");
        state.handoffs.push(handoff);
        this.audit("human", op.type, handoff.taskId, null, handoff);
      } else if (op.type === "relay.create") {
        const values = relayValuesSchema.parse(p.values);
        validateRelay(values, state, state.relays);
        const enabled = p.enabled !== false;
        const relay: Relay = {
          ...values,
          stages: freshStages(values),
          id: typeof p.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(p.id) ? p.id : randomUUID(),
          revision: 1,
          enabled,
          status: enabled ? "scheduled" : "paused",
          statusReason: "",
          armedAt: at,
          dueAt: null,
          stageIndex: 0,
          claimedAt: null,
          fireRequestedAt: null,
          completedAt: null,
          lastError: "",
          decisions: [],
          createdAt: at,
          updatedAt: at,
        };
        if (state.relays.some((r) => r.id === relay.id)) fail("ENTITY_EXISTS", relay.id);
        relay.dueAt = relayDecision(relay, state).dueAt;
        state.relays.push(relay);
        this.audit("human", op.type, relay.id, null, relay);
      } else if (op.type === "relay.update") {
        const relay = this.relayOf(state, p.relayId, p.expectedRevision, true);
        if (relay.status === "firing" || relayStarted(relay)) fail("RELAY_NOT_EDITABLE", relay.status);
        const values = relayValuesSchema.parse(p.values);
        validateRelay(values, state, state.relays, relay.id);
        const before = structuredClone(relay);
        Object.assign(relay, values, {
          stages: freshStages(values),
          revision: relay.revision + 1,
          enabled: p.enabled !== undefined ? Boolean(p.enabled) : relay.enabled,
          statusReason: "",
          lastError: "",
          armedAt: at,
          fireRequestedAt: null,
          decisions: [],
          updatedAt: at,
        });
        relay.status = relay.enabled ? "scheduled" : "paused";
        relay.dueAt = relayDecision(relay, state).dueAt;
        this.audit("human", op.type, relay.id, before, relay);
      } else if (RELAY_HUMAN_COMMANDS.includes(op.type)) {
        const relay = this.relayOf(state, p.relayId, p.expectedRevision, true);
        const before = structuredClone(relay);
        const started = relayStarted(relay);
        if (relay.status === "firing") fail("RELAY_BUSY");
        if (op.type === "relay.delete") {
          if (relay.status === "running") fail("RELAY_BUSY");
          state.relays = state.relays.filter((r) => r.id !== relay.id);
        } else if (op.type === "relay.pause") {
          if (!["scheduled", "running", "blocked", "missed"].includes(relay.status)) fail("RELAY_NOT_EDITABLE", relay.status);
          // Pausing never stops runs; it only keeps the next stage from starting.
          relay.enabled = false;
          relay.status = "paused";
        } else if (op.type === "relay.resume") {
          if (!["paused", "blocked", "missed", "failed", "cancelled"].includes(relay.status)) fail("RELAY_NOT_EDITABLE", relay.status);
          if (started) {
            if (relay.status === "failed" || relayProgress(relay, state).retryable.length) fail("RELAY_RETRY_REQUIRED");
            relay.status = "running";
            relay.fireRequestedAt = at;
          } else {
            validateRelay(relayValuesOf(relay), state, state.relays, relay.id);
            relay.status = "scheduled";
            relay.armedAt = at;
            relay.dueAt = relayDecision(relay, state).dueAt;
          }
          relay.enabled = true;
          relay.statusReason = "";
          relay.lastError = "";
        } else if (op.type === "relay.cancel") {
          if (["completed", "cancelled"].includes(relay.status)) fail("RELAY_NOT_EDITABLE", relay.status);
          relay.enabled = false;
          relay.status = "cancelled";
        } else if (op.type === "relay.fireNow") {
          if (started || !["scheduled", "paused", "blocked", "missed"].includes(relay.status)) fail("RELAY_NOT_EDITABLE", relay.status);
          validateRelay(relayValuesOf(relay), state, state.relays, relay.id);
          relay.enabled = true;
          relay.status = "scheduled";
          relay.statusReason = "manual";
          relay.lastError = "";
          relay.fireRequestedAt = at;
          relay.dueAt = at;
        } else if (op.type === "relay.retry") {
          if (!started || !["blocked", "failed", "paused", "cancelled", "missed"].includes(relay.status)) fail("RELAY_NOT_EDITABLE", relay.status);
          const progress = relayProgress(relay, state);
          const retryable = new Set(progress.retryable.map((x) => x.step.id));
          const ids: string[] = Array.isArray(p.stepIds) ? p.stepIds.map(String) : [...retryable];
          if (ids.some((id) => !retryable.has(id))) fail("RELAY_NOTHING_TO_RETRY");
          if (!ids.length && !progress.unfired.length) fail("RELAY_NOTHING_TO_RETRY");
          for (const step of relay.stages[relay.stageIndex].steps) {
            if (!ids.includes(step.id)) continue;
            const session = step.runId ? state.sessions.find((x) => x.sessionId === step.runId) : undefined;
            step.resumeThreadId = p.resume === true && session?.threadId ? session.threadId : null;
            step.runId = null;
            step.error = "";
            step.firedAt = null;
          }
          relay.enabled = true;
          relay.status = "running";
          relay.statusReason = "retry";
          relay.lastError = "";
          relay.fireRequestedAt = at;
        } else {
          // relay.overrideStep: a human declares a stopped step handled (e.g. finished in the foreground).
          if (!started) fail("RELAY_NOT_EDITABLE", relay.status);
          const progress = relayProgress(relay, state);
          const target = progress.retryable.find((x) => x.step.id === p.stepId);
          if (!target) fail("RELAY_STEP_NOT_STOPPED");
          relay.stages[relay.stageIndex].steps[target.stepIndex].overriddenAt = at;
          if (["blocked", "failed", "missed"].includes(relay.status)) {
            relay.status = "running";
            relay.enabled = true;
            relay.statusReason = "";
            relay.fireRequestedAt = at;
          }
        }
        if (op.type !== "relay.delete") { relay.revision++; relay.updatedAt = at; }
        this.audit("human", op.type, relay.id, before, op.type === "relay.delete" ? null : relay, String(p.reason ?? p.note ?? ""));
      } else if (op.type === "relay.decision") {
        // Append-only record of an automatic answer; not an edit of the relay, so no revision guard.
        const relay = this.relayOf(state, p.relayId);
        const d = p.entry ?? {};
        const entry: RelayDecisionEntry = {
          id: randomUUID(),
          at,
          stepId: String(d.stepId ?? "").slice(0, 100),
          kind: z.enum(["auto-answer", "auto-approve", "auto-decline", "waiting-human"]).parse(d.kind),
          method: String(d.method ?? "").slice(0, 200),
          question: String(d.question ?? "").slice(0, 4000),
          options: (Array.isArray(d.options) ? d.options : []).map((o: unknown) => String(o).slice(0, 500)).slice(0, 20),
          choice: String(d.choice ?? "").slice(0, 1000),
          reason: String(d.reason ?? "").slice(0, 500),
        };
        relay.decisions = [...(relay.decisions ?? []), entry].slice(-RELAY_MAX_DECISIONS);
        this.audit("system", op.type, relay.id, null, { relayId: relay.id, steps: relaySteps(relay).filter((s) => (s as RelayStep).id === entry.stepId), entry }, entry.reason, { actor: { kind: "system", name: "relay-scheduler" } });
      } else if (RELAY_SYSTEM_COMMANDS.includes(op.type)) {
        const relay = this.relayOf(state, p.relayId, p.expectedRevision, true);
        const before = relayAuditView(relay, typeof p.stepId === "string" ? p.stepId : undefined);
        const k = relay.stageIndex;
        const stepIn = (id: unknown) => {
          const step = relay.stages[k]?.steps.find((s) => s.id === id);
          if (!step) fail("RELAY_STEP_NOT_FOUND");
          return step;
        };
        if (op.type === "relay.claim") {
          const stage = z.number().int().min(0).parse(p.stage);
          const progress = relayProgress(relay, state);
          if (relay.status === "scheduled") {
            if (!relay.enabled || stage !== 0 || relayStarted(relay)) fail("RELAY_NOT_SCHEDULED", relay.status);
            relay.claimedAt = at;
            relay.stageIndex = 0;
            relay.dueAt = typeof p.dueAt === "string" ? p.dueAt : relay.dueAt;
          } else if (relay.status === "running" && relay.enabled) {
            if (stage === k) {
              if (!progress.unfired.length) fail("RELAY_NOTHING_TO_FIRE");
            } else if (stage === k + 1 && stage < relay.stages.length) {
              // The store itself enforces A → B → C: every run of the current stage must have delivered.
              if (!progress.stageComplete) fail("RELAY_STAGE_INCOMPLETE");
              relay.stageIndex = stage;
            } else fail("RELAY_STAGE_INCOMPLETE");
          } else fail("RELAY_NOT_SCHEDULED", relay.status);
          relay.status = "firing";
          relay.statusReason = relay.fireRequestedAt && relay.statusReason === "manual" ? "manual" : "";
          relay.fireRequestedAt = null;
        } else if (op.type === "relay.stepFired") {
          if (relay.status !== "firing") fail("RELAY_NOT_FIRING", relay.status);
          const step = stepIn(p.stepId);
          if (step.runId) fail("RELAY_STEP_ALREADY_FIRED");
          const h = z.object({ id: z.string().min(1).max(100), to: z.string().max(200), prompt: z.string().max(400000) }).strict().parse(p.handoff);
          step.runId = z.string().min(1).parse(p.runId);
          step.firedAt = at;
          step.error = "";
          step.attempt = (step.attempt ?? 0) + 1;
          step.resumeThreadId = null;
          if (p.worktree) step.worktree = { ...this.insideWorktrees(worktreeSchema.parse(p.worktree)), mergedAt: null };
          const task = state.tasks.find((t) => t.id === step.taskId);
          const predecessor = relayPredecessor(relay, state);
          const from =
            k === 0
              ? predecessor
                ? [relayStepActor({ model: predecessor.model, provider: (predecessor.harnessId ?? predecessor.provider) as RelayStep["provider"] }, predecessor)]
                : task?.assignees ?? []
              : [...new Set(relay.stages[k - 1].steps.map((s) => relayStepActor(s, state.sessions.find((x) => x.sessionId === s.runId))))];
          const handoff = {
            id: h.id,
            taskId: step.taskId,
            provider: step.provider,
            from,
            to: h.to,
            prompt: h.prompt,
            sessionId: step.runId,
            at,
            mode: "relay" as const,
            relayId: relay.id,
            relayStage: k,
            relayStepId: step.id,
            relayAttempt: step.attempt,
          };
          state.handoffs.push(handoff);
          this.audit("system", "handoff.record", step.taskId, null, handoff, "", { actor: { kind: "system", name: "relay-scheduler" } });
        } else if (op.type === "relay.stepFailed") {
          if (relay.status !== "firing") fail("RELAY_NOT_FIRING", relay.status);
          const step = stepIn(p.stepId);
          if (step.runId) fail("RELAY_STEP_ALREADY_FIRED");
          step.error = String(p.error ?? "START_FAILED").slice(0, 4000);
          step.firedAt = at;
          step.attempt = (step.attempt ?? 0) + 1;
          if (p.worktree) step.worktree = { ...this.insideWorktrees(worktreeSchema.parse(p.worktree)), mergedAt: null };
        } else if (op.type === "relay.stepMerged") {
          // The scheduler merged one completed step's working copy back into the user's branch.
          if (relay.status !== "running" || !relayProgress(relay, state).stageComplete) fail("RELAY_STAGE_INCOMPLETE");
          const step = stepIn(p.stepId);
          if (!step.worktree || step.worktree.mergedAt) fail("RELAY_NOTHING_TO_MERGE");
          step.worktree = { ...step.worktree, mergedAt: at, commit: String(p.commit ?? "").slice(0, 64), removed: p.removed === true };
        } else if (op.type === "relay.stageFired") {
          if (relay.status !== "firing") fail("RELAY_NOT_FIRING", relay.status);
          const steps = relay.stages[k].steps;
          if (steps.some((s) => !s.runId && !s.error && !s.overriddenAt)) fail("RELAY_STAGE_NOT_FIRED");
          const errors = steps.filter((s) => s.error);
          if (errors.length) {
            relay.status = "failed";
            relay.statusReason = "START_FAILED";
            relay.lastError = errors.map((s) => s.error).join("\n").slice(0, 4000);
          } else {
            relay.status = "running";
            relay.statusReason = "";
          }
        } else if (op.type === "relay.failed") {
          if (relay.status !== "firing") fail("RELAY_NOT_FIRING", relay.status);
          relay.status = "failed";
          relay.lastError = String(p.error ?? "").slice(0, 4000);
          relay.statusReason = String(p.reason ?? "START_FAILED").slice(0, 200);
        } else if (op.type === "relay.blocked") {
          if (!["scheduled", "running"].includes(relay.status)) fail("RELAY_NOT_SCHEDULED", relay.status);
          relay.status = "blocked";
          relay.statusReason = String(p.reason ?? "").slice(0, 200);
          if (typeof p.error === "string") relay.lastError = p.error.slice(0, 4000);
        } else if (op.type === "relay.missed") {
          if (!["scheduled", "running"].includes(relay.status)) fail("RELAY_NOT_SCHEDULED", relay.status);
          relay.status = "missed";
          relay.statusReason = "APP_NOT_RUNNING";
          relay.dueAt = typeof p.dueAt === "string" ? p.dueAt : relay.dueAt;
        } else {
          if (relay.status !== "running" || k !== relay.stages.length - 1 || !relayProgress(relay, state).stageComplete) fail("RELAY_NOT_COMPLETE");
          relay.status = "completed";
          relay.statusReason = "";
          relay.completedAt = at;
        }
        relay.revision++;
        relay.updatedAt = at;
        this.audit("system", op.type, relay.id, before, relayAuditView(relay, typeof p.stepId === "string" ? p.stepId : undefined), String(p.reason ?? ""), { actor: { kind: "system", name: "relay-scheduler" } });
      } else fail("UNKNOWN_COMMAND");
      for (const old of beforeState.tasks) {
        const after = state.tasks.find((t) => t.id === old.id);
        if (old.acceptedAt && after && !after.acceptedAt)
          this.audit(
            "system",
            "acceptance.invalidated",
            old.id,
            { acceptedAt: old.acceptedAt },
            { acceptedAt: null },
            "Delivery or prerequisite changed",
          );
      }
      this.persist(state);
      this.db.prepare("INSERT INTO commands VALUES(?,?)").run(op.id, digest);
    }); } finally { this.auditState = undefined; this.auditHuman = ""; }
    return this.view();
  }
  recordEvent(input: RunEvent, digest = hash(JSON.stringify(input))) {
    const e = normalizeEvent(runEventSchema.parse(input));
    if (this.db.prepare("SELECT id FROM events WHERE id=?").get(e.id)) return;
    // Only in-flight runner telemetry defers its file publication.
    const defer = e.source === "runner" && e.lifecycle === "current";
    this.transaction(() => {
      const state = this.state();
      if (
        (e.projectId && e.projectId !== state.id) ||
        (e.epoch && e.epoch !== state.epoch)
      )
        fail("WRONG_PROJECT_OR_EPOCH");
      if (e.taskIds.some((id) => !state.tasks.some((t) => t.id === id)))
        fail("TASK_NOT_FOUND");
      if (Date.parse(e.at) > Date.now() + 60000) fail("FUTURE_EVENT");
      const previous = state.sessions.find((s) => s.sessionId === e.sessionId);
      if (
        previous &&
        (previous.source !== e.source ||
          previous.provider !== e.provider ||
          (previous.harnessId ?? previous.provider) !== e.harnessId)
      )
        fail("SESSION_ORIGIN_MISMATCH");
      if (previous && Date.parse(e.at) < Date.parse(previous.at)) {
        this.db.prepare("INSERT INTO events VALUES(?,?)").run(e.id, digest);
        return;
      }
      let measuredMs = previous?.measuredMs ?? 0;
      const gap = previous
        ? Date.parse(e.at) - Date.parse(previous.at)
        : Infinity;
      if (
        previous?.status === "running" &&
        previous.source === "runner" &&
        e.source === "runner" &&
        gap >= 0 &&
        gap <= 60000
      )
        measuredMs += gap;
      const startedAt =
        e.status === "running"
          ? previous?.status === "running" && gap <= 60000
            ? (previous.startedAt ?? e.at)
            : e.at
          : null;
      const session = {
        ...previous,
        ...e,
        startedAt,
        measuredMs,
        lastMessage: e.message || previous?.lastMessage || "",
      };
      if (previous) state.sessions[state.sessions.indexOf(previous)] = session;
      else state.sessions.push(session);
      this.persist(state);
      this.db.prepare("INSERT INTO events VALUES(?,?)").run(e.id, digest);
    }, defer);
  }
  exportZip(file: string) {
    this.flushPublish();
    const temp = path.join(this.root, `backup-${randomUUID()}.sqlite`);
    try {
      this.db.prepare("VACUUM INTO ?").run(temp);
      const entries: Record<string, Uint8Array> = {
        "manifest.json": fs.readFileSync(path.join(this.root, "manifest.json")),
        "project.sqlite": fs.readFileSync(temp),
      };
      for (const kind of ["inbox", "events"])
        for (const name of fs.readdirSync(path.join(this.root, kind)))
          if (/^[\w-]+\.(json|ready)$/.test(name)) {
            const f = path.join(this.root, kind, name);
            if (fs.lstatSync(f).isFile())
              entries[`${kind}/${name}`] = fs.readFileSync(f);
          }
      atomicWrite(file, Buffer.from(zipSync(entries, { level: 6 })));
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  importLegacy(
    file: string,
    projectId: string | string[],
    expectedHash: string,
    humanName = "",
  ) {
    this.assertEntry();
    const imported = convertLegacy(file, projectId, expectedHash);
    this.transaction(() => {
      const state = this.state();
      if (state.tasks.length || state.notes.length || this.proposals().length)
        fail("IMPORT_REQUIRES_EMPTY_PROJECT");
      state.title = imported.title;
      state.metadataRevision++;
      state.description = imported.description;
      state.tasks = imported.tasks;
      state.notes = imported.notes;
      validateGraph(state.tasks);
      this.auditHuman = humanName;
      try { this.audit("human", "legacy.import", state.id, null, imported.provenance); } finally { this.auditHuman = ""; }
      this.persist(state);
    });
    return this.view();
  }
  fork(directory: string, humanName = "") {
    const target = fs.realpathSync(directory);
    if (fs.existsSync(path.join(target, ".haicomo")))
      fail("PROJECT_ALREADY_EXISTS");
    const store = new ProjectStore(target, `${this.state().title} — copy`);
    const state = structuredClone(this.state());
    state.id = store.state().id;
    state.epoch = store.state().epoch;
    state.title += " — copy";
    state.revision = 0;
    state.metadataRevision = 0;
    state.sessions = [];
    state.handoffs = [];
    state.relays = [];
    state.historyStats = { acceptanceReturns: 0 };
    store.db
      .prepare("UPDATE project SET json=? WHERE id=1")
      .run(JSON.stringify(state));
    store.auditHuman = humanName;
    store.audit("human", "project.fork", state.id, null, {
      sourceProjectId: this.state().id,
    });
    store.publish();
    store.close();
    return target;
  }
  close(relocatedDirectory?: string) {
    if (this.closed) return;
    this.flushPublish();
    this.watchers.forEach((w) => w.close());
    this.db.close();
    this.closed = true;
    try {
      const file = relocatedDirectory
        ? path.join(relocatedDirectory, ".haicomo", "writer.lock")
        : this.lockFile;
      if (readJson(file).token === this.lockToken) fs.unlinkSync(file);
    } catch {
      ProjectStore.releasedLocks.add(this.lockToken);
    }
  }
}
export function restoreZip(file: string, directory: string) {
  if (fs.statSync(file).size > 100 * 1024 * 1024) fail("BACKUP_TOO_LARGE");
  let expectedTotal = 0;
  const entries = unzipSync(fs.readFileSync(file), {
    filter: (entry) => {
      expectedTotal += entry.originalSize;
      if (
        entry.originalSize > 100 * 1024 * 1024 ||
        expectedTotal > 200 * 1024 * 1024
      )
        fail("BACKUP_TOO_LARGE");
      return true;
    },
  });
  let total = 0;
  for (const [name, data] of Object.entries(entries)) {
    total += data.length;
    if (total > 200 * 1024 * 1024) fail("BACKUP_TOO_LARGE");
    if (
      !/^(manifest\.json|project\.sqlite|(inbox|events)\/[\w-]+\.(json|ready))$/.test(
        name,
      )
    )
      fail("INVALID_BACKUP_ENTRY", name);
  }
  if (!entries["manifest.json"] || !entries["project.sqlite"])
    fail("INVALID_BACKUP");
  const dir = fs.realpathSync(directory),
    root = path.join(dir, ".haicomo");
  if (fs.existsSync(root)) fail("PROJECT_ALREADY_EXISTS");
  if (
    entryFiles(dir).length ||
    fs.existsSync(path.join(dir, "HAICoMo.haicomo"))
  )
    fail("ENTRY_ALREADY_EXISTS");
  let installed = false;
  const staging = path.join(dir, `.haicomo-restore-${randomUUID()}`);
  fs.mkdirSync(staging);
  try {
    for (const [name, data] of Object.entries(entries))
      atomicWrite(path.join(staging, name), Buffer.from(data));
    const manifest = readJson(path.join(staging, "manifest.json"));
    if (
      manifest.format !== "haicomo" ||
      !SCHEMA_VERSIONS.includes(manifest.schemaVersion)
    )
      fail("UNSUPPORTED_SCHEMA");
    const check = new DatabaseSync(path.join(staging, "project.sqlite"), {
      readOnly: true,
    });
    try {
      if (
        (check.prepare("PRAGMA integrity_check").get() as any)
          .integrity_check !== "ok"
      )
        fail("BACKUP_INTEGRITY_FAILED");
      const state = JSON.parse(
        (check.prepare("SELECT json FROM project WHERE id=1").get() as any)
          .json,
      );
      if (
        !SCHEMA_VERSIONS.includes(state.schemaVersion) ||
        state.id !== manifest.id ||
        state.epoch !== manifest.epoch ||
        !Array.isArray(state.tasks)
      )
        fail("MANIFEST_MISMATCH");
      validateGraph(state.tasks);
    } finally {
      check.close();
    }
    if (entryFiles(dir).length) fail("ENTRY_ALREADY_EXISTS");
    fs.renameSync(staging, root);
    installed = true;
    writeEntry(path.join(dir, "HAICoMo.haicomo"), manifest);
  } catch (e) {
    if (installed) fs.renameSync(root, staging);
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  return dir;
}
