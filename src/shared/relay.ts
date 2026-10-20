import { composeAgentPrompt, type RelayPromptResult } from "./agent-prompt";
import { z } from "zod";
import {
  blockers,
  familyName,
  idSchema,
  inferFamily,
  sessionAvatar,
  type ProjectState,
  type Session,
  type Settings,
  type Task,
} from "./domain";
import { HARNESS_IDS, clientName, isBackgroundHarness, isClientActor } from "./clients";
import { humanBlocker, needsHuman, selfReportedDecisions, structuredHandoff, withoutHandoff } from "./autonomy";

/**
 * A relay is a human-configured chain of up to three stages (A → B → C). Each
 * stage starts up to three background runs in parallel once an optional start
 * condition holds (a predecessor run delivered, plus a delay or time); the
 * next stage starts automatically when every run of the current stage has
 * delivered (ended `completed`). Stage order is pre-authorised by the human
 * who saved the relay, so dependencies on earlier stages of the same relay are
 * treated as satisfied for starting — but nothing is ever accepted: delivery
 * acceptance stays a separate human step. A relay never retries on its own;
 * every failure stops at its stage for a human. Every transition is audited.
 */
export const RELAY_STATUSES = [
  "scheduled",
  "paused",
  "blocked",
  "missed",
  "firing",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RelayStatus = (typeof RELAY_STATUSES)[number];
export const RELAY_MAX_DELAY_MS = 30 * 86400000;
export const RELAY_MAX_AHEAD_MS = 365 * 86400000;
export const RELAY_MISSED_GRACE_MS = 10 * 60000;
export const RELAY_PREDECESSOR_WINDOW_MS = 24 * 3600000;
export const RELAY_MAX_STAGES = 3;
export const RELAY_MAX_STEPS = 3;
export const RELAY_RESULT_EXCERPT_CHARS = 4000;
/** With a delivery record the excerpt is only background, so it is shorter. */
export const RELAY_RECORD_EXCERPT_CHARS = 1500;
export const RELAY_MAX_TOTAL_PROMPT_CHARS = 200000;
export const RELAY_STEP_LOST_GRACE_MS = 60000;
export const RELAY_MAX_DECISIONS = 300;
/** Relays that still hold runs or may start runs. */
export const RELAY_ARMED_STATUSES: RelayStatus[] = ["scheduled", "firing", "running"];
/** Relays whose task references must survive (anything that may still run). */
export const RELAY_LIVE_STATUSES: RelayStatus[] = ["scheduled", "paused", "blocked", "missed", "firing", "running", "failed"];
export const STAGE_LETTERS = ["A", "B", "C"] as const;
export const stepLabel = (stage: number, step: number) => `${STAGE_LETTERS[stage] ?? stage + 1}${step + 1}`;

export const relayTriggerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("delay"),
      ms: z.number().int().min(1000).max(RELAY_MAX_DELAY_MS),
    })
    .strict(),
  z.object({ kind: z.literal("at"), iso: z.string().datetime() }).strict(),
]);
export const relayAutonomySchema = z
  .object({
    enabled: z.boolean().default(false),
    consentedAt: z.string().datetime().nullable().default(null),
  })
  .strict();
export const relayStepValuesSchema = z
  .object({
    id: idSchema.optional(),
    provider: z.enum(HARNESS_IDS),
    model: z.string().max(200).default(""),
    effort: z.string().max(30).default(""),
    mode: z.string().max(40).default(""),
    threadId: z.string().max(300).default(""),
    continueThread: z.boolean().default(false),
    taskId: idSchema,
    referenceTaskId: idSchema.nullable().default(null),
    prompt: z.string().max(100000),
  })
  .strict();
export const relayStageValuesSchema = z
  .object({ steps: z.array(relayStepValuesSchema).min(1).max(RELAY_MAX_STEPS) })
  .strict();
export const relayValuesSchema = z
  .object({
    title: z.string().trim().max(300).default(""),
    afterSessionId: idSchema.nullable().default(null),
    trigger: relayTriggerSchema,
    autonomy: relayAutonomySchema.default({ enabled: false, consentedAt: null }),
    /** Git projects: each step of a stage with two or more steps works in its own worktree, merged when the stage completes. */
    worktrees: z.boolean().optional(),
    stages: z.array(relayStageValuesSchema).min(1).max(RELAY_MAX_STAGES),
  })
  .strict();
export type RelayValues = z.infer<typeof relayValuesSchema>;
export type RelayStepValues = z.infer<typeof relayStepValuesSchema>;
export type RelayStep = Omit<RelayStepValues, "id"> & {
  id: string;
  runId: string | null;
  firedAt: string | null;
  error: string;
  attempt: number;
  /** Retry in the step's previous session (set by a human retry). */
  resumeThreadId: string | null;
  /** A human marked the step handled after intervening (e.g. finished it in the foreground). */
  overriddenAt: string | null;
  /** The git worktree the step works in (relays with `worktrees`), and when it was merged back. */
  worktree?: RelayWorktree | null;
};
export type RelayWorktree = { path: string; branch: string; cwd: string; mergedAt: string | null; commit?: string; removed?: boolean };
/** Steps of a stage use worktrees only when the relay asks for them and the stage runs two or more in parallel. */
export const stageUsesWorktrees = (relay: Pick<RelayValues, "worktrees"> & { stages: { steps: unknown[] }[] }, stageIndex: number) =>
  Boolean(relay.worktrees) && (relay.stages[stageIndex]?.steps.length ?? 0) >= 2;
export type RelayStage = { steps: RelayStep[] };
export type RelayDecisionEntry = {
  id: string;
  at: string;
  stepId: string;
  kind: "auto-answer" | "auto-approve" | "auto-decline" | "waiting-human";
  method: string;
  question: string;
  options: string[];
  choice: string;
  reason: string;
};
export type Relay = Omit<RelayValues, "stages"> & {
  stages: RelayStage[];
  id: string;
  revision: number;
  enabled: boolean;
  status: RelayStatus;
  statusReason: string;
  armedAt: string;
  dueAt: string | null;
  /** Index of the current (or last claimed) stage. */
  stageIndex: number;
  /** When stage A was first claimed; null means not started. */
  claimedAt: string | null;
  /** A human asked to run now / continue; consumed by the next claim. */
  fireRequestedAt: string | null;
  completedAt: string | null;
  lastError: string;
  decisions: RelayDecisionEntry[];
  createdAt: string;
  updatedAt: string;
};
export type RelayDecision = {
  action: "idle" | "wait" | "fire" | "blocked" | "missed";
  dueAt: string | null;
  reason: string;
};

export const relayStarted = (relay: Pick<Relay, "claimedAt">) => relay.claimedAt !== null;
export function relayPredecessor(relay: Pick<Relay, "afterSessionId">, state: ProjectState): Session | undefined {
  return relay.afterSessionId ? state.sessions.find((s) => s.sessionId === relay.afterSessionId) : undefined;
}
export const relaySteps = (relay: { stages: { steps: RelayStepValues[] }[] }) => relay.stages.flatMap((s) => s.steps);
/** The run's terminal reason once it can no longer deliver; null while it may still. */
export function sessionEnd(s: Session | undefined): string | null {
  if (!s) return null;
  if (s.lifecycle === "history" || s.endReason === "lost") return s.endReason ?? "unknown";
  return null;
}
/** Avatar for a step: the actual run's model family once known, else the configured model or client. */
export function relayStepActor(step: Pick<RelayStepValues, "model" | "provider">, session?: Session): string {
  if (session) return sessionAvatar(session);
  return inferFamily(step.model || "") ?? `client:${step.provider}`;
}
export const actorLabel = (actor: string) => (isClientActor(actor) ? clientName(actor.slice(7)) : familyName(actor));
export function relayTitle(relay: Pick<Relay, "title"> & { stages: { steps: Pick<RelayStepValues, "taskId" | "provider">[] }[] }, state: ProjectState) {
  if (relay.title) return relay.title;
  const steps = relay.stages.flatMap((s) => s.steps);
  const first = steps[0];
  const task = state.tasks.find((t) => t.id === first?.taskId);
  return `${first ? clientName(first.provider) : "?"} → ${task?.title ?? first?.taskId ?? ""}${steps.length > 1 ? ` (+${steps.length - 1})` : ""}`;
}

/**
 * Pure start-condition decision for a scheduled relay. `aliveSince` is when the
 * scheduler became able to fire (launch or resume); a due time that passed
 * before that minus the grace window is reported as missed.
 */
export function relayDecision(
  relay: Relay,
  state: ProjectState,
  now = Date.now(),
  aliveSince: number | null = null,
): RelayDecision {
  if (relay.status !== "scheduled" || !relay.enabled)
    return { action: "idle", dueAt: relay.dueAt, reason: relay.status };
  if (relay.fireRequestedAt) return { action: "fire", dueAt: relay.fireRequestedAt, reason: "manual" };
  const predecessor = relayPredecessor(relay, state);
  let endedAt: number | null = null;
  if (relay.afterSessionId) {
    if (!predecessor) return { action: "blocked", dueAt: null, reason: "PREDECESSOR_NOT_FOUND" };
    if (predecessor.source !== "runner") return { action: "blocked", dueAt: null, reason: "PREDECESSOR_NOT_RUNNER" };
    const end = sessionEnd(predecessor);
    if (end === null)
      return {
        action: "wait",
        dueAt: relay.trigger.kind === "at" ? relay.trigger.iso : null,
        reason: "PREDECESSOR_RUNNING",
      };
    if (end !== "completed")
      return { action: "blocked", dueAt: null, reason: `PREDECESSOR_${end.toUpperCase()}` };
    endedAt = Date.parse(predecessor.endedAt ?? predecessor.at);
  }
  const base = endedAt ?? Date.parse(relay.armedAt);
  const due =
    relay.trigger.kind === "delay"
      ? base + relay.trigger.ms
      : Math.max(Date.parse(relay.trigger.iso), endedAt ?? 0);
  const dueAt = new Date(due).toISOString();
  if (now < due) return { action: "wait", dueAt, reason: "NOT_DUE" };
  if (aliveSince !== null && due < aliveSince - RELAY_MISSED_GRACE_MS)
    return { action: "missed", dueAt, reason: "APP_NOT_RUNNING" };
  return { action: "fire", dueAt, reason: "" };
}

export type RelayStepState =
  | "waiting"
  | "pending"
  | "starting"
  | "running"
  | "completed"
  | "overridden"
  | "stopped"
  | "start-failed"
  | "needs-human";
export type RelayStepProgress = {
  stageIndex: number;
  stepIndex: number;
  label: string;
  step: RelayStep;
  state: RelayStepState;
  endReason?: string;
  /** Text the agent gave for needing a human, or the run's waiting request. */
  humanReason?: string;
  /** The run is waiting for an answer only a human can give. */
  waitingHuman: boolean;
  session?: Session;
  stale: boolean;
  place: "desk" | "sofa" | "done";
  actor: string;
};
export type RelayProgress = {
  stageIndex: number;
  stageStarted: boolean;
  steps: RelayStepProgress[][];
  /** Current-stage steps without a run (to claim/fire). */
  unfired: RelayStepProgress[];
  /** Current-stage steps that ended without delivering. */
  stopped: RelayStepProgress[];
  /** Current-stage steps a human may retry. */
  retryable: RelayStepProgress[];
  stageComplete: boolean;
  stageCompletedAt: string | null;
  completed: boolean;
  desk: RelayStepProgress[];
  /** Waiting stages, one sofa each. */
  sofa: RelayStepProgress[][];
  done: RelayStepProgress[];
  predecessor?: Session;
  exemptTaskIds: string[];
};
const DELIVERED: RelayStepState[] = ["completed", "overridden"];
export function relayProgress(
  relay: Relay,
  state: ProjectState,
  opts: { now?: number; activeRunIds?: ReadonlySet<string> } = {},
): RelayProgress {
  const now = opts.now ?? Date.now();
  const k = relay.stageIndex;
  const started = relayStarted(relay);
  const steps = relay.stages.map((stage, si) =>
    stage.steps.map((step, ti): RelayStepProgress => {
      const session = step.runId ? state.sessions.find((s) => s.sessionId === step.runId) : undefined;
      const base = { stageIndex: si, stepIndex: ti, label: stepLabel(si, ti), step, session, stale: false, waitingHuman: false, actor: relayStepActor(step, session) };
      const place: RelayStepProgress["place"] = relay.status === "completed" ? (si === relay.stages.length - 1 ? "desk" : "done") : si < k ? "done" : si === k && started ? "desk" : "sofa";
      if (step.overriddenAt) return { ...base, state: "overridden", place };
      if (si > k || (si === k && !started)) return { ...base, state: si === k ? "pending" : "waiting", place };
      if (step.runId) {
        const end = sessionEnd(session);
        if (end === "completed") {
          const human = needsHuman(session?.lastMessage || session?.message);
          return human ? { ...base, state: "needs-human", humanReason: human, endReason: end, place } : { ...base, state: "completed", endReason: end, place };
        }
        if (end === "permission") return { ...base, state: "needs-human", endReason: end, humanReason: session?.lastMessage?.slice(-500), place };
        // A failed sign-in or exhausted quota needs the human, not a blind retry.
        const blocker = end === "failed" || end === "lost" ? humanBlocker(session?.lastMessage || session?.message) : null;
        if (blocker && end) return { ...base, state: "needs-human", endReason: end, humanReason: blocker, place };
        if (end) return { ...base, state: "stopped", endReason: end, place };
        if (!session) {
          const since = Date.parse(step.firedAt ?? relay.updatedAt);
          if (opts.activeRunIds && !opts.activeRunIds.has(step.runId) && now - since > RELAY_STEP_LOST_GRACE_MS)
            return { ...base, state: "stopped", endReason: "lost", place };
          return { ...base, state: "starting", place };
        }
        if (opts.activeRunIds && !opts.activeRunIds.has(step.runId) && now - Date.parse(session.at) > RELAY_STEP_LOST_GRACE_MS)
          return { ...base, state: "stopped", endReason: "lost", place };
        const stale = ["running", "waiting"].includes(session.status) && now - Date.parse(session.at) > 60000;
        return { ...base, state: "running", stale, waitingHuman: session.status === "waiting", humanReason: session.status === "waiting" ? session.message?.slice(0, 500) : undefined, place };
      }
      if (step.error) return { ...base, state: "start-failed", place };
      return { ...base, state: relay.status === "firing" && si === k ? "starting" : "pending", place };
    }),
  );
  const current = steps[k] ?? [];
  const unfired = started ? current.filter((p) => !p.step.runId && !p.step.error && !p.step.overriddenAt) : [];
  const stopped = current.filter((p) => ["stopped", "start-failed", "needs-human"].includes(p.state));
  const stageComplete = started && current.length > 0 && current.every((p) => DELIVERED.includes(p.state));
  const stageCompletedAt = stageComplete
    ? current
        .map((p) => p.step.overriddenAt ?? p.session?.endedAt ?? p.session?.at ?? relay.updatedAt)
        .sort()
        .at(-1) ?? null
    : null;
  const flat = steps.flat();
  return {
    stageIndex: k,
    stageStarted: started,
    steps,
    unfired,
    stopped,
    retryable: started ? current.filter((p) => ["stopped", "start-failed", "needs-human"].includes(p.state)) : [],
    stageComplete,
    stageCompletedAt,
    completed: relay.status === "completed" || (stageComplete && k === relay.stages.length - 1),
    desk: flat.filter((p) => p.place === "desk"),
    sofa: steps.map((stage) => stage.filter((p) => p.place === "sofa")).filter((stage) => stage.length > 0),
    done: flat.filter((p) => p.place === "done"),
    predecessor: relayPredecessor(relay, state),
    exemptTaskIds: steps
      .slice(0, k)
      .flat()
      .filter((p) => DELIVERED.includes(p.state))
      .map((p) => p.step.taskId),
  };
}

export type RelayAction =
  | { action: "idle" | "wait"; reason?: string }
  | { action: "merge"; stage: number; stepId: string }
  | { action: "interrupt" }
  | { action: "claim"; stage: number; dueAt?: string | null }
  | { action: "block"; reason: string; stepId?: string }
  | { action: "missed"; dueAt: string | null }
  | { action: "complete" };
/** The scheduler's whole policy as a pure function of state. */
export function relayNext(
  relay: Relay,
  state: ProjectState,
  ctx: { now: number; aliveSince: number | null; activeRunIds?: ReadonlySet<string>; inFlight: boolean },
): RelayAction {
  if (relay.status === "firing") return ctx.inFlight ? { action: "idle" } : { action: "interrupt" };
  if (!relay.enabled) return { action: "idle" };
  if (relay.status === "scheduled") {
    const d = relayDecision(relay, state, ctx.now, ctx.aliveSince);
    if (d.action === "fire") return { action: "claim", stage: 0, dueAt: d.dueAt };
    if (d.action === "blocked") return { action: "block", reason: d.reason };
    if (d.action === "missed") return { action: "missed", dueAt: d.dueAt };
    return { action: "wait", reason: d.reason };
  }
  if (relay.status !== "running") return { action: "idle" };
  const p = relayProgress(relay, state, { now: ctx.now, activeRunIds: ctx.activeRunIds });
  const k = relay.stageIndex;
  if (p.unfired.length) return { action: "claim", stage: k };
  const first = p.stopped[0];
  if (first)
    return {
      action: "block",
      reason:
        first.state === "start-failed"
          ? "STEP_START_FAILED"
          : first.state === "needs-human"
            ? "NEEDS_HUMAN"
            : `STEP_${(first.endReason ?? "unknown").toUpperCase().replace(/-/g, "_")}`,
      stepId: first.step.id,
    };
  if (!p.stageComplete) return { action: "wait", reason: "STAGE_RUNNING" };
  // A completed stage's working copies are merged, one at a time, before anything else happens.
  const unmerged = relay.stages[k].steps.find((s) => s.worktree && !s.worktree.mergedAt);
  if (unmerged) return { action: "merge", stage: k, stepId: unmerged.id };
  if (k >= relay.stages.length - 1) return { action: "complete" };
  const completedAt = p.stageCompletedAt ? Date.parse(p.stageCompletedAt) : ctx.now;
  const requested = relay.fireRequestedAt ? Date.parse(relay.fireRequestedAt) : 0;
  if (ctx.aliveSince !== null && completedAt < ctx.aliveSince - RELAY_MISSED_GRACE_MS && requested < completedAt)
    return { action: "missed", dueAt: p.stageCompletedAt };
  return { action: "claim", stage: k + 1 };
}

/** Run ids started by any relay (current and retried attempts). Chaining off them is forbidden. */
export function relayRunIds(relays: Relay[], handoffs: ProjectState["handoffs"] = []): Set<string> {
  const ids = new Set<string>();
  for (const r of relays) for (const s of relaySteps(r) as RelayStep[]) if (s.runId) ids.add(s.runId);
  for (const h of handoffs) if (h.mode === "relay" && h.sessionId) ids.add(h.sessionId);
  return ids;
}
/** Throws a domain code when values cannot form a valid, non-chained relay. */
export function validateRelay(
  values: RelayValues,
  state: ProjectState,
  relays: Relay[],
  selfId: string | null = null,
  now = Date.now(),
) {
  if (values.autonomy.enabled && !values.autonomy.consentedAt) throw new Error("RELAY_AUTONOMY_CONSENT_REQUIRED");
  const ids = new Set<string>();
  let total = 0;
  let session: Session | undefined;
  if (values.afterSessionId) {
    session = state.sessions.find((s) => s.sessionId === values.afterSessionId);
    if (!session) throw new Error("PREDECESSOR_NOT_FOUND");
    if (session.source !== "runner") throw new Error("PREDECESSOR_NOT_RUNNER");
    if (relayRunIds(relays.filter((r) => r.id !== selfId), state.handoffs).has(values.afterSessionId))
      throw new Error("RELAY_CHAIN_FORBIDDEN");
  }
  const stageOf = new Map<string, number>();
  values.stages.forEach((stage, si) => stage.steps.forEach((step) => { if (!stageOf.has(step.taskId)) stageOf.set(step.taskId, si); }));
  values.stages.forEach((stage, si) => {
    const tasks = new Set<string>();
    const threads = new Set<string>();
    for (const step of stage.steps) {
      if (!isBackgroundHarness(step.provider)) throw new Error("RELAY_PROVIDER_UNSUPPORTED");
      if (step.id) {
        if (ids.has(step.id)) throw new Error("RELAY_DUPLICATE_STEP");
        ids.add(step.id);
      }
      const task = state.tasks.find((t) => t.id === step.taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.archived) throw new Error("TASK_ARCHIVED");
      if (step.referenceTaskId && !state.tasks.some((t) => t.id === step.referenceTaskId)) throw new Error("TASK_NOT_FOUND");
      if (tasks.has(step.taskId)) throw new Error("RELAY_DUPLICATE_STAGE_TASK");
      tasks.add(step.taskId);
      if (step.continueThread) {
        if (si !== 0) throw new Error("RELAY_CONTINUE_STAGE_A_ONLY");
        if (!session || (session.harnessId ?? session.provider) !== step.provider) throw new Error("RELAY_THREAD_PROVIDER_MISMATCH");
      }
      const thread = step.continueThread ? session?.threadId ?? "" : step.threadId;
      if (thread) {
        const key = `${step.provider}\0${thread}`;
        if (threads.has(key)) throw new Error("RELAY_DUPLICATE_THREAD");
        threads.add(key);
      }
      // A dependency on a task of the same or a later stage could never be satisfied: guaranteed deadlock.
      for (const blocker of blockers(task, state.tasks)) {
        const at = stageOf.get(blocker.id);
        if (at !== undefined && at >= si) throw new Error(`RELAY_STAGE_ORDER: ${stepLabel(si, stage.steps.indexOf(step))} → ${blocker.title}`);
      }
      total += step.prompt.length;
    }
  });
  if (total > RELAY_MAX_TOTAL_PROMPT_CHARS) throw new Error("RELAY_TOO_LARGE");
  if (values.trigger.kind === "at") {
    const at = Date.parse(values.trigger.iso);
    if (at < now - 60000) throw new Error("RELAY_TIME_PAST");
    if (at > now + RELAY_MAX_AHEAD_MS) throw new Error("RELAY_TIME_TOO_FAR");
  }
}
/** Non-fatal warnings for the editor: unaccepted prerequisites outside the relay will stop that step. */
export function relayWarnings(values: Pick<RelayValues, "stages">, state: ProjectState): { label: string; tasks: string[] }[] {
  const inRelay = new Set(relaySteps(values).map((s) => s.taskId));
  const out: { label: string; tasks: string[] }[] = [];
  values.stages.forEach((stage, si) =>
    stage.steps.forEach((step, ti) => {
      const task = state.tasks.find((t) => t.id === step.taskId);
      if (!task) return;
      const outside = blockers(task, state.tasks).filter((b) => !inRelay.has(b.id));
      if (outside.length) out.push({ label: stepLabel(si, ti), tasks: outside.map((t) => t.title) });
    }),
  );
  return out;
}
/** Predecessor candidates: current runner sessions plus recent completed ones, never relay results. */
export function relayPredecessorCandidates(state: ProjectState, relays: Relay[], now = Date.now()): Session[] {
  const results = relayRunIds(relays, state.handoffs);
  return state.sessions.filter(
    (s) =>
      s.source === "runner" &&
      !results.has(s.sessionId) &&
      s.endReason !== "lost" &&
      (s.lifecycle !== "history" ||
        (s.endReason === "completed" && now - Date.parse(s.endedAt ?? s.at) < RELAY_PREDECESSOR_WINDOW_MS)),
  );
}
/** Start check for one step: prerequisites delivered by earlier stages of this relay are exempt; acceptance is untouched. */
export function assertRelayStepRunnable(task: Task | undefined, state: ProjectState, exemptTaskIds: string[]) {
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.archived) throw new Error("TASK_ARCHIVED");
  const exempt = new Set(exemptTaskIds);
  const waiting = blockers(task, state.tasks).filter((t) => !exempt.has(t.id));
  if (waiting.length) throw new Error(`TASK_BLOCKED: ${waiting.map((t) => t.title).join(", ")}`);
}
type PromptStep = Pick<RelayStepValues, "prompt" | "referenceTaskId" | "taskId">;
/** The exact stage-A prompt; deliverable references are resolved at fire time, not when the relay was saved. */
export function composeRelayPrompt(
  relay: PromptStep & Pick<Relay, "afterSessionId">,
  state: ProjectState,
  directory: string,
  locale: Settings["locale"] = "en-GB",
  unattended = false,
  workCopy?: string,
): string {
  const predecessor = relayPredecessor(relay, state);
  const referenceId = relay.referenceTaskId ?? predecessor?.taskIds[0] ?? relay.taskId;
  const reference = state.tasks.find((t) => t.id === referenceId);
  if (!reference) throw new Error("TASK_NOT_FOUND");
  return composeAgentPrompt(
    directory,
    state,
    locale,
    relay.taskId,
    relay.prompt,
    reference,
    predecessor
      ? `${predecessor.harnessId ?? predecessor.provider} · ${predecessor.model}${predecessor.threadId ? ` · session ${predecessor.threadId}` : ""}${predecessor.endedAt ? ` · ended ${predecessor.endedAt}` : ""}`
      : undefined,
    { unattended, workCopy },
  );
}
/** Prompt for any step; later stages carry the earlier stages' results (tail excerpts of their final messages). */
export function composeRelayStepPrompt(
  relay: Pick<Relay, "afterSessionId" | "autonomy"> & { stages: { steps: (RelayStepValues & Partial<Pick<RelayStep, "runId">>)[] }[] },
  stageIndex: number,
  step: PromptStep,
  state: ProjectState,
  directory: string,
  locale: Settings["locale"] = "en-GB",
  opts: { placeholder?: boolean; workCopy?: string } = {},
): string {
  const unattended = relay.autonomy.enabled;
  if (stageIndex === 0) return composeRelayPrompt({ ...step, afterSessionId: relay.afterSessionId }, state, directory, locale, unattended, opts.workCopy);
  const reference = state.tasks.find((t) => t.id === (step.referenceTaskId ?? step.taskId));
  if (!reference) throw new Error("TASK_NOT_FOUND");
  const results: RelayPromptResult[] = relay.stages.slice(0, stageIndex).flatMap((stage, si) =>
    stage.steps.map((s, ti) => {
      const session = s.runId ? state.sessions.find((x) => x.sessionId === s.runId) : undefined;
      const full = session?.lastMessage || session?.message || "";
      const record = structuredHandoff(full);
      const message = record ? withoutHandoff(full) : full;
      const limit = record ? RELAY_RECORD_EXCERPT_CHARS : RELAY_RESULT_EXCERPT_CHARS;
      return {
        label: stepLabel(si, ti),
        agent: clientName(s.provider),
        model: session?.model && session.model !== "default" ? session.model : s.model,
        taskId: s.taskId,
        endReason: session?.endReason ?? "",
        endedAt: session?.endedAt ?? "",
        threadId: session?.threadId,
        excerpt: message.slice(-limit),
        truncated: message.length > limit,
        placeholder: opts.placeholder || !session,
        record,
      };
    }),
  );
  return composeAgentPrompt(directory, state, locale, step.taskId, step.prompt, reference, undefined, { results, unattended, workCopy: opts.workCopy });
}

/** Task ids an audit record of a relay command refers to (v5 single-task and v6 shapes). */
export function relayAuditTaskIds(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];
  if (typeof payload.taskId === "string") return [payload.taskId];
  const steps: any[] = Array.isArray(payload.stages) ? payload.stages.flatMap((s: any) => s?.steps ?? []) : Array.isArray(payload.steps) ? payload.steps : [];
  return [...new Set(steps.map((s) => s?.taskId).filter((id): id is string => typeof id === "string"))];
}
/** Compact audit payload for system transitions (full prompts would bloat the audit table). */
export function relayAuditView(relay: Relay, stepId?: string) {
  const steps = stepId ? relaySteps(relay).filter((s) => (s as RelayStep).id === stepId) : relay.stages[relay.stageIndex]?.steps ?? [];
  return {
    id: relay.id,
    revision: relay.revision,
    status: relay.status,
    statusReason: relay.statusReason,
    stageIndex: relay.stageIndex,
    enabled: relay.enabled,
    steps: (steps as RelayStep[]).map((s) => ({ id: s.id, taskId: s.taskId, provider: s.provider, runId: s.runId, error: s.error, attempt: s.attempt })),
  };
}

const REPORT = {
  en: {
    title: "Relay decision record", generated: "Generated", status: "Status", autonomy: "Unattended mode", on: "on (consented", off: "off",
    step: "Step", agent: "Agent", mode: "Mode", task: "Task", run: "Run", result: "Result",
    auto: "Answered automatically by HAICoMo", self: "Reported by the agent (unverified)", human: "Needs a human", none: "None.",
    q: "Question", options: "Options", choice: "Choice", reason: "Reason",
    note: "Automatic answers follow the recommended option (or the first option) and approve tool requests except destructive commands. Self-reported decisions are copied from the agent's final message and were not verified.",
  },
  zh: {
    title: "接力决策记录", generated: "生成时间", status: "状态", autonomy: "无人值守模式", on: "开启（同意于", off: "关闭",
    step: "步骤", agent: "智能体", mode: "模式", task: "任务", run: "运行", result: "结果",
    auto: "HAICoMo 自动作答", self: "智能体自报（未经核实）", human: "需要人工处理", none: "无。",
    q: "问题", options: "选项", choice: "选择", reason: "理由",
    note: "自动作答选择推荐项（没有推荐项时选第一项），并批准工具请求，但破坏性命令一律拒绝。自报决定摘自智能体的最终消息，HAICoMo 未核实。",
  },
  tw: {
    title: "接力決策紀錄", generated: "產生時間", status: "狀態", autonomy: "無人值守模式", on: "開啟（同意於", off: "關閉",
    step: "步驟", agent: "智慧體", mode: "模式", task: "任務", run: "執行", result: "結果",
    auto: "HAICoMo 自動作答", self: "智慧體自報（未經核實）", human: "需要人工處理", none: "無。",
    q: "問題", options: "選項", choice: "選擇", reason: "理由",
    note: "自動作答選擇建議項（沒有建議項時選第一項），並核准工具請求，但破壞性指令一律拒絕。自報決定摘自智慧體的最終訊息，HAICoMo 未核實。",
  },
};
/** Stable file name of a relay's decision record inside .haicomo/relay-decisions. */
export function relayReportName(relay: Pick<Relay, "id" | "title" | "createdAt">) {
  const slug = (relay.title || "relay").replace(/[\\/:*?"<>|\s.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "relay";
  return `${relay.createdAt.slice(0, 10)}-${slug}-${relay.id.slice(0, 8)}.md`;
}
const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
/** Markdown decision record, rebuilt from the database (the record is never the source of truth). */
export function relayDecisionReport(relay: Relay, state: ProjectState, locale: Settings["locale"], at = new Date().toISOString()): string {
  const r = locale === "zh-CN" ? REPORT.zh : locale === "zh-TW" ? REPORT.tw : REPORT.en;
  const progress = relayProgress(relay, state);
  const lines = [
    `# ${r.title}: ${relayTitle(relay, state)}`,
    "",
    `- ${r.generated}: ${at}`,
    `- ${r.status}: ${relay.status}${relay.statusReason ? ` (${relay.statusReason})` : ""}`,
    `- ${r.autonomy}: ${relay.autonomy.enabled ? `${r.on} ${relay.autonomy.consentedAt})` : r.off}`,
    "",
    `| ${r.step} | ${r.agent} | ${r.mode} | ${r.task} | ${r.run} | ${r.result} |`,
    "|---|---|---|---|---|---|",
  ];
  for (const p of progress.steps.flat()) {
    const task = state.tasks.find((t) => t.id === p.step.taskId);
    const model = p.session?.model && p.session.model !== "default" ? p.session.model : p.step.model;
    lines.push(`| ${p.label} | ${cell(clientName(p.step.provider))}${model ? ` · ${cell(model)}` : ""} | ${cell(p.step.mode || "-")} | ${cell(task?.title ?? p.step.taskId)} | ${p.step.runId ? p.step.runId.slice(0, 8) : "-"} | ${p.state}${p.endReason && p.endReason !== "completed" ? ` (${p.endReason})` : ""} |`);
  }
  lines.push("", `## ${r.auto}`, "");
  if (!relay.decisions.length) lines.push(r.none);
  else {
    lines.push(`| ${r.step} | ${r.q} | ${r.options} | ${r.choice} | ${r.reason} |`, "|---|---|---|---|---|");
    for (const d of relay.decisions) {
      const p = progress.steps.flat().find((x) => x.step.id === d.stepId);
      lines.push(`| ${p?.label ?? d.stepId} | ${cell(d.question)} | ${cell(d.options.join(" / "))} | ${cell(d.choice)} | ${cell(d.reason)} |`);
    }
  }
  lines.push("", `## ${r.self}`, "");
  let any = false;
  for (const p of progress.steps.flat()) {
    const entries = selfReportedDecisions(p.session?.lastMessage || p.session?.message || "");
    if (!entries.length) continue;
    any = true;
    lines.push(`### ${p.label}`, "", `| ${r.q} | ${r.options} | ${r.choice} | ${r.reason} |`, "|---|---|---|---|");
    for (const e of entries) lines.push(`| ${cell(e.question)} | ${cell(e.options)} | ${cell(e.choice)} | ${cell(e.reason)} |`);
    lines.push("");
  }
  if (!any) lines.push(r.none, "");
  lines.push(`## ${r.human}`, "");
  const human = progress.steps.flat().filter((p) => p.state === "needs-human" || p.waitingHuman || ["stopped", "start-failed"].includes(p.state));
  if (!human.length) lines.push(r.none);
  for (const p of human) lines.push(`- ${p.label}: ${p.state}${p.endReason ? ` (${p.endReason})` : ""}${p.humanReason ? ` — ${cell(p.humanReason)}` : p.step.error ? ` — ${cell(p.step.error.slice(0, 500))}` : ""}`);
  lines.push("", `> ${r.note}`, "");
  return lines.join("\n");
}

/** v5 → v6: each one-step relay becomes a relay with one stage of one step. */
export type RelayV5 = {
  id: string; revision: number; enabled: boolean; status: string; statusReason: string; armedAt: string; dueAt: string | null; firedAt: string | null;
  resultRunId: string | null; lastError: string; createdAt: string; updatedAt: string; title: string; afterSessionId: string | null;
  trigger: RelayValues["trigger"]; handoff: { provider: string; model: string; effort: string; mode: string; threadId: string; continueThread: boolean };
  taskId: string; referenceTaskId: string | null; prompt: string;
};
export function upgradeRelayV5(old: RelayV5, sessions: Session[]): Relay {
  const session = old.resultRunId ? sessions.find((s) => s.sessionId === old.resultRunId) : undefined;
  const step: RelayStep = {
    id: "s1",
    provider: old.handoff.provider as RelayStep["provider"],
    model: old.handoff.model ?? "",
    effort: old.handoff.effort ?? "",
    mode: old.handoff.mode ?? "",
    threadId: old.handoff.threadId ?? "",
    continueThread: Boolean(old.handoff.continueThread),
    taskId: old.taskId,
    referenceTaskId: old.referenceTaskId ?? null,
    prompt: old.prompt ?? "",
    runId: old.resultRunId ?? null,
    firedAt: old.firedAt ?? null,
    error: "",
    attempt: old.resultRunId ? 1 : 0,
    resumeThreadId: null,
    overriddenAt: null,
  };
  let status: RelayStatus = old.status as RelayStatus;
  let statusReason = old.statusReason ?? "";
  let claimedAt: string | null = null;
  let completedAt: string | null = null;
  if (old.status === "firing") {
    status = "failed";
    statusReason = "INTERRUPTED";
    claimedAt = old.updatedAt;
  } else if (old.status === "failed") {
    statusReason = "START_FAILED";
    step.error = old.lastError || "START_FAILED";
    step.attempt = 1;
    claimedAt = old.updatedAt;
  } else if (old.status === "fired") {
    claimedAt = old.firedAt ?? old.updatedAt;
    const end = sessionEnd(session);
    if (end === "completed") {
      status = "completed";
      completedAt = session?.endedAt ?? old.updatedAt;
      statusReason = "";
    } else if (end || !session) {
      status = "blocked";
      statusReason = `STEP_${(end ?? "lost").toUpperCase().replace(/-/g, "_")}`;
    } else {
      status = "running";
      statusReason = "";
    }
  }
  return {
    id: old.id,
    revision: old.revision,
    enabled: old.enabled,
    status,
    statusReason,
    armedAt: old.armedAt,
    dueAt: old.dueAt,
    title: old.title ?? "",
    afterSessionId: old.afterSessionId ?? null,
    trigger: old.trigger,
    autonomy: { enabled: false, consentedAt: null },
    stages: [{ steps: [step] }],
    stageIndex: 0,
    claimedAt,
    fireRequestedAt: null,
    completedAt,
    lastError: old.lastError ?? "",
    decisions: [],
    createdAt: old.createdAt,
    updatedAt: old.updatedAt,
  };
}
