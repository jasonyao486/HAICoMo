import { z } from "zod";
import {
  CLIENTS,
  HARNESS_IDS,
  clientName,
  isClientActor,
  type HarnessId,
} from "./clients";
export { CLIENTS, clientName, isClientActor } from "./clients";
import type { Relay } from "./relay";

export const FAMILIES = [
  "chatgpt",
  "claude",
  "gemini",
  "deepseek",
  "grok",
  "kimi",
  "glm",
  "minimax",
  "mistral",
  "qwen",
  "llama",
  "seedance",
  "ernie",
  "perplexity",
] as const;
export const COLORS = [
  "#6b8d80",
  "#cd8b68",
  "#738fcd",
  "#667bd0",
  "#65717b",
  "#6b91cc",
  "#9277ba",
  "#cc7ea0",
  "#d59151",
  "#997cc9",
  "#779fd2",
  "#91a76c",
  "#798bba",
  "#5faaa1",
];
export type Family = (typeof FAMILIES)[number];
export const ACTORS = [
  ...FAMILIES,
  ...CLIENTS.map((c) => `client:${c.id}` as const),
] as const;
export type ActorId = Family | `client:${HarnessId}`;
export const assigneeSchema = z
  .string()
  .refine(
    (id) =>
      id === "human" ||
      (FAMILIES as readonly string[]).includes(id) ||
      (id.startsWith("client:") &&
        HARNESS_IDS.includes(id.slice(7) as HarnessId)),
    "Unknown participant",
  );
export const familyName = (id: string) =>
  isClientActor(id)
    ? clientName(id.slice(7))
    : ({
        chatgpt: "ChatGPT",
        claude: "Claude",
        gemini: "Gemini",
        deepseek: "DeepSeek",
        grok: "Grok",
        kimi: "Kimi",
        glm: "GLM",
        minimax: "MiniMax",
        mistral: "Mistral",
        qwen: "Qwen",
        llama: "Llama",
        seedance: "Seedance",
        ernie: "ERNIE",
        perplexity: "Perplexity",
        human: "You",
      }[id] ?? id);
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const date = z
  .string()
  .refine(
    (s) =>
      s === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        new Date(s).toISOString().slice(0, 10) === s),
    "Invalid date",
  );
export const taskValuesSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(100000).default(""),
    parentId: idSchema.nullable().default(null),
    dependencies: z.array(idSchema).max(2000).default([]),
    assignees: z.array(assigneeSchema).default([]),
    status: z.enum(["todo", "doing", "delivered"]).default("todo"),
    progress: z.number().min(0).max(100).default(0),
    startDate: date.default(""),
    endDate: date.default(""),
    handoff: z.string().max(100000).default(""),
    artifacts: z
      .array(
        z
          .object({
            id: idSchema,
            label: z.string().max(500),
            path: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .default([]),
    tableVisible: z.boolean().default(true),
  })
  .strict();
export type TaskValues = z.infer<typeof taskValuesSchema>;
export type Task = TaskValues & {
  id: string;
  revision: number;
  archived: boolean;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export const noteValuesSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    body: z.string().max(300000),
    kind: z.enum(["note", "meeting"]),
  })
  .strict();
export type Note = z.infer<typeof noteValuesSchema> & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export const runEventSchema = z
  .object({
    id: idSchema,
    sessionId: idSchema,
    family: z.enum(FAMILIES).nullable().default(null),
    provider: z.enum(HARNESS_IDS),
    harnessId: z.enum(HARNESS_IDS).optional(),
    avatarId: z.string().max(100).optional(),
    model: z.string().max(200),
    taskIds: z.array(idSchema),
    status: z.enum(["running", "waiting", "idle", "error", "unknown"]),
    source: z.enum(["runner", "self-report"]),
    at: z.string().datetime(),
    message: z.string().max(12000).default(""),
    threadId: z.string().max(300).optional(),
    projectId: z.string().optional(),
    epoch: z.string().optional(),
    lifecycle: z.enum(["current", "history"]).optional(),
    instanceId: z.string().optional(),
    endedAt: z.string().datetime().optional(),
    endReason: z
      .enum([
        "completed",
        "permission",
        "failed",
        "cancelled",
        "lost",
        "legacy",
        "tracking-ended",
      ])
      .optional(),
  })
  .strict();
export type RunEvent = z.infer<typeof runEventSchema>;
export type Session = Omit<RunEvent, "id"> & {
  startedAt: string | null;
  measuredMs: number;
  lastMessage: string;
};
export type Handoff = {
  id: string;
  taskId: string;
  provider: string;
  from: string[];
  to: string;
  prompt: string;
  sessionId?: string;
  at: string;
  mode: "copy" | "foreground" | "background" | "relay";
  relayId?: string;
};
export type ProjectState = {
  schemaVersion: 5;
  id: string;
  epoch: string;
  revision: number;
  metadataRevision: number;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  notes: Note[];
  sessions: Session[];
  handoffs: Handoff[];
  relays: Relay[];
  historyStats: { acceptanceReturns: number };
};
export const changeSchema = z
  .object({
    entity: z.enum(["task", "note", "project"]),
    operation: z.enum(["create", "update"]),
    id: idSchema,
    expectedRevision: z.number().int().nonnegative().nullable(),
    values: z.record(z.string(), z.unknown()),
  })
  .strict();
export const proposalSchema = z
  .object({
    protocolVersion: z.union([z.literal(1), z.literal(2)]),
    projectId: idSchema,
    epoch: idSchema,
    proposalId: idSchema,
    actor: z
      .object({
        name: z.string().min(1).max(200),
        family: z.enum(FAMILIES).nullable().optional(),
        harnessId: z.enum(HARNESS_IDS).optional(),
        model: z.string().max(200).optional(),
        avatarId: z.string().max(100).optional(),
      })
      .strict(),
    title: z.string().min(1).max(300),
    reason: z.string().max(10000),
    createdAt: z.string().datetime(),
    dependsOn: z.array(idSchema).max(100).default([]),
    changes: z.array(changeSchema).min(1).max(200),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type ProposalRecord = {
  proposal: Proposal;
  hash: string;
  status: "pending" | "applied" | "rejected";
  receivedAt: string;
  reviewedAt: string | null;
  reviewNote: string;
  appliedRevision: number | null;
  appliedChanges?: Proposal["changes"];
  raw?: string;
};
export type Audit = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string;
  context?: AuditContext;
};
export type AuditPerson = { kind: "human" | "model" | "system"; name: string; family?: Family | null; model?: string; harnessId?: string };
export type AuditTask = { id: string; path: { id: string; title: string }[] };
export type AuditContext = { actor: AuditPerson; reviewer?: AuditPerson; modified?: boolean; decision?: "approve" | "reject"; proposalId?: string; tasks: AuditTask[] };
export type Workspace = {
  agentGuideError?: "AGENT_GUIDE_CONFLICT" | "AGENT_GUIDE_UNAVAILABLE";
  directory: string;
  entryPath?: string;
  binding?: string;
  entryError?: string;
  state: ProjectState;
  proposals: ProposalRecord[];
  audit: Audit[];
  warnings: string[];
  metrics: {
    acceptanceReturns: number;
    auditEntries: number;
    totalProposals: number;
    pendingProposals: number;
    proposalActors: Record<
      string,
      { count: number; taskMentions: number; distinctTasks: number }
    >;
    models?: import("./analytics").ModelMetrics;
  };
};
export type Settings = {
  userName?: string;
  avatarInitials?: string;
  locale: "en-US" | "en-GB" | "zh-CN" | "zh-TW";
  theme: "light" | "dark" | "system";
  enhanced: boolean;
  reducedMotion: boolean;
  accent: string;
  codexPath: string;
  claudePath: string;
  clientPaths: Record<string, string>;
  updateFeed: string;
};
export type Recent = {
  id: string;
  epoch?: string;
  entryPath?: string;
  directory: string;
  title: string;
  openedAt: string;
  updatedAt?: string;
};
export type Capabilities = {
  models?: {
    id: string;
    name: string;
    efforts: string[];
    isDefault: boolean;
  }[];
  provider: HarnessId;
  appPath?: string;
  open?: boolean;
  installed: boolean;
  executable: string;
  version: string;
  background: boolean;
  resume: boolean;
  model: boolean;
  effort: boolean;
  speed: boolean;
  /** Operating/permission modes the client accepts; bypass modes are never listed. */
  modes: string[];
  /** Provider-level effort values (Claude); Codex efforts live per model. */
  efforts?: string[];
  reason: string;
};

export function fail(code: string, detail = ""): never {
  throw new Error(detail ? `${code}: ${detail}` : code);
}
export function revisionGuard(actual: number, expected: unknown) {
  if (actual !== expected)
    fail("REVISION_CONFLICT", `expected ${expected}, current ${actual}`);
}
export function validateGraph(tasks: Task[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (t.parentId && !byId.has(t.parentId)) fail("MISSING_PARENT", t.parentId);
    if (t.startDate && t.endDate && t.startDate > t.endDate)
      fail("INVALID_DATE_RANGE", t.title);
    if (new Set(t.dependencies).size !== t.dependencies.length)
      fail("DUPLICATE_DEPENDENCY");
    for (const dep of t.dependencies)
      if (!byId.has(dep)) fail("MISSING_DEPENDENCY", dep);
  }
  const visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail("DEPENDENCY_CYCLE", id);
    if (done.has(id)) return;
    visiting.add(id);
    const t = byId.get(id)!;
    const inherited = new Set(t.dependencies),
      ancestors = new Set([t.id]);
    let parent = t.parentId ? byId.get(t.parentId) : undefined;
    while (parent) {
      if (ancestors.has(parent.id)) fail("DEPENDENCY_CYCLE", parent.id);
      ancestors.add(parent.id);
      parent.dependencies.forEach((dep) => inherited.add(dep));
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    for (const next of [
      ...inherited,
      ...tasks.filter((c) => c.parentId === id).map((c) => c.id),
    ])
      visit(next);
    visiting.delete(id);
    done.add(id);
  };
  tasks.forEach((t) => visit(t.id));
}
export function blockers(task: Task, tasks: Task[]): Task[] {
  const ids = new Set(task.dependencies);
  let parent = tasks.find((t) => t.id === task.parentId);
  while (parent) {
    parent.dependencies.forEach((id) => ids.add(id));
    parent = tasks.find((t) => t.id === parent!.parentId);
  }
  return tasks.filter((t) => ids.has(t.id) && !t.acceptedAt);
}
export function taskStatus(
  task: Task,
  tasks: Task[],
): "done" | "blocked" | "review" | "doing" | "todo" {
  if (task.acceptedAt) return "done";
  if (blockers(task, tasks).length) return "blocked";
  return task.status === "delivered" ? "review" : task.status;
}
export function assertTaskRunnable(task: Task, tasks: Task[]) {
  if (task.archived) fail("TASK_ARCHIVED");
  const waiting = blockers(task, tasks);
  if (waiting.length)
    fail("TASK_BLOCKED", waiting.map((t) => t.title).join(", "));
}
export function topTask(task: Task, tasks: Task[]): Task {
  let current = task;
  const seen = new Set<string>();
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const p = tasks.find((t) => t.id === current.parentId);
    if (!p) break;
    current = p;
  }
  return current;
}
export function sessionStatus(
  session: Session,
  now = Date.now(),
): RunEvent["status"] {
  return ["running", "waiting"].includes(session.status) &&
    now - Date.parse(session.at) > 60000
    ? "unknown"
    : session.status;
}
export function inferFamily(model: string): Family | null {
  const m = model.toLowerCase();
  if (/^(gpt-|o[134]([-.]|$)|chatgpt|codex)/.test(m)) return "chatgpt";
  if (/^(claude|sonnet|opus|haiku)/.test(m)) return "claude";
  return (
    FAMILIES.find(
      (f) => f !== "chatgpt" && f !== "claude" && m.startsWith(f),
    ) ?? null
  );
}
export function sessionAvatar(
  s: Pick<RunEvent, "family" | "provider" | "harnessId">,
): string {
  return s.family ?? `client:${s.harnessId ?? s.provider}`;
}
export function normalizeEvent<
  T extends Pick<RunEvent, "family" | "provider" | "harnessId">,
>(input: T) {
  return {
    ...input,
    harnessId: input.harnessId ?? input.provider,
    avatarId: sessionAvatar(input),
  };
}
export function officeActors(state: ProjectState): string[] {
  const ids = new Set<string>(FAMILIES);
  state.tasks
    .filter((t) => !t.archived)
    .forEach((t) =>
      taskActors(t, state).forEach((id) => {
        if (id !== "human") ids.add(id);
      }),
    );
  state.sessions
    .filter((s) => s.lifecycle !== "history")
    .filter((s) =>
      s.taskIds.some((id) =>
        state.tasks.some((t) => t.id === id && !t.archived),
      ),
    )
    .forEach((s) => ids.add(sessionAvatar(s)));
  return [...ids];
}
/** A resolved client assignment appears at its actual family; unresolved work stays unknown. */
export function taskActors(task: Task, state: ProjectState): string[] {
  return [
    ...new Set(
      task.assignees.flatMap((id) => {
        if (!isClientActor(id)) return [id];
        const sessions = state.sessions.filter(
          (s) =>
            (s.harnessId ?? s.provider) === id.slice(7) &&
            s.taskIds.includes(task.id),
        );
        return sessions.length ? sessions.map(sessionAvatar) : [id];
      }),
    ),
  ];
}
export function aggregateFamily(
  family: string,
  state: ProjectState,
  now = Date.now(),
) {
  const assigned = state.tasks.filter(
    (t) =>
      !t.archived && !t.acceptedAt && taskActors(t, state).includes(family),
  );
  const history = state.sessions.filter(
    (s) => sessionAvatar(s) === family && s.lifecycle === "history",
  );
  const sessions = state.sessions.filter(
    (s) =>
      s.lifecycle !== "history" &&
      sessionAvatar(s) === family &&
      s.taskIds.some((id) =>
        state.tasks.some((t) => t.id === id && !t.archived),
      ),
  );
  const statusOf = (s: Session) => sessionStatus(s, now);
  const counts = { running: 0, waiting: 0, unknown: 0, error: 0, idle: 0 };
  sessions.forEach((s) => counts[statusOf(s)]++);
  const activeTaskIds = new Set(
    sessions.filter((s) => statusOf(s) === "running").flatMap((s) => s.taskIds),
  );
  const tables = [
    ...new Set(
      state.tasks
        .filter((t) => activeTaskIds.has(t.id))
        .map((t) => topTask(t, state.tasks).id),
    ),
  ];
  return {
    family,
    assigned,
    history,
    sessions,
    counts,
    tables,
    status: counts.running
      ? "running"
      : counts.waiting
        ? "waiting"
        : counts.unknown || (assigned.length && !sessions.length)
          ? "unknown"
          : counts.error
            ? "error"
            : assigned.length
              ? "idle"
              : "standby",
  };
}

export function newState(
  id: string,
  epoch: string,
  title: string,
  at: string,
): ProjectState {
  return {
    schemaVersion: 5,
    id,
    epoch,
    revision: 0,
    metadataRevision: 0,
    title,
    description: "",
    createdAt: at,
    updatedAt: at,
    tasks: [],
    notes: [],
    sessions: [],
    handoffs: [],
    relays: [],
    historyStats: { acceptanceReturns: 0 },
  };
}
export function applyChange(
  state: ProjectState,
  change: Proposal["changes"][number],
  at: string,
): { before: unknown; after: unknown } {
  if (change.entity === "project") {
    if (change.id !== state.id || change.operation !== "update")
      fail("INVALID_PROJECT_CHANGE");
    revisionGuard(state.metadataRevision, change.expectedRevision);
    const values = z
      .object({
        title: z.string().trim().min(1).max(300).optional(),
        description: z.string().max(100000).optional(),
      })
      .strict()
      .parse(change.values);
    const before = { title: state.title, description: state.description };
    Object.assign(state, values);
    state.metadataRevision++;
    return { before, after: values };
  }
  const list = change.entity === "task" ? state.tasks : state.notes;
  const old = list.find((t) => t.id === change.id);
  const before = old ? structuredClone(old) : null;
  if (change.operation === "create") {
    if (old || change.expectedRevision !== null)
      fail("ENTITY_EXISTS", change.id);
  } else {
    if (!old) fail("ENTITY_NOT_FOUND", change.id);
    revisionGuard(old.revision, change.expectedRevision);
  }
  const checked = (
    change.entity === "task"
      ? taskValuesSchema.partial()
      : noteValuesSchema.partial()
  ).parse(change.values);
  const values = Object.fromEntries(
    Object.keys(change.values).map((k) => [
      k,
      (checked as Record<string, unknown>)[k],
    ]),
  );
  if (change.entity === "task") {
    const t = old as Task | undefined;
    const base = t
      ? Object.fromEntries(
          Object.keys(taskValuesSchema.shape).map((k) => [
            k,
            t[k as keyof Task],
          ]),
        )
      : {};
    const parsed = taskValuesSchema.parse({ ...base, ...values });
    const substantive =
      !t ||
      Object.keys(values).some(
        (k) =>
          !["tableVisible", "startDate", "endDate"].includes(k) &&
          JSON.stringify(parsed[k as keyof typeof parsed]) !==
            JSON.stringify(t[k as keyof Task]),
      );
    const next: Task = {
      ...parsed,
      id: change.id,
      revision: (t?.revision ?? 0) + 1,
      archived: t?.archived ?? false,
      acceptedAt: substantive ? null : (t?.acceptedAt ?? null),
      createdAt: t?.createdAt ?? at,
      updatedAt: at,
    };
    if (t) state.tasks[state.tasks.indexOf(t)] = next;
    else state.tasks.push(next);
    let parent = state.tasks.find((p) => p.id === next.parentId);
    const visited = new Set<string>();
    while (substantive && parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (parent.acceptedAt) {
        parent.acceptedAt = null;
        parent.revision++;
        parent.updatedAt = at;
      }
      parent = state.tasks.find((p) => p.id === parent!.parentId);
    }
    return { before, after: next };
  }
  const n = old as Note | undefined;
  const next: Note = {
    ...noteValuesSchema.parse({
      title: n?.title,
      body: n?.body,
      kind: n?.kind,
      ...values,
    }),
    id: change.id,
    revision: (n?.revision ?? 0) + 1,
    createdAt: n?.createdAt ?? at,
    updatedAt: at,
  };
  if (n) state.notes[state.notes.indexOf(n)] = next;
  else state.notes.push(next);
  return { before, after: next };
}
