import { composeAgentPrompt } from "./agent-prompt";
import { z } from "zod";
import { idSchema, type ProjectState, type Session, type Settings } from "./domain";

/**
 * A relay is an automated handoff: once an optional predecessor run has
 * delivered (completed) and an optional time condition holds, the app starts
 * one background run with a fixed configuration. It never accepts work and is
 * never retried automatically; every transition is audited.
 */
export const RELAY_STATUSES = [
  "scheduled",
  "paused",
  "blocked",
  "missed",
  "firing",
  "fired",
  "failed",
  "cancelled",
] as const;
export type RelayStatus = (typeof RELAY_STATUSES)[number];
export const RELAY_MAX_DELAY_MS = 30 * 86400000;
export const RELAY_MAX_AHEAD_MS = 365 * 86400000;
export const RELAY_MISSED_GRACE_MS = 10 * 60000;
export const RELAY_PREDECESSOR_WINDOW_MS = 24 * 3600000;
export const relayTriggerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("delay"),
      ms: z.number().int().min(1000).max(RELAY_MAX_DELAY_MS),
    })
    .strict(),
  z.object({ kind: z.literal("at"), iso: z.string().datetime() }).strict(),
]);
export const relayHandoffSchema = z
  .object({
    provider: z.enum(["codex", "claude"]),
    model: z.string().max(200).default(""),
    effort: z.string().max(30).default(""),
    mode: z.string().max(40).default(""),
    threadId: z.string().max(300).default(""),
    continueThread: z.boolean().default(false),
  })
  .strict();
export const relayValuesSchema = z
  .object({
    title: z.string().trim().max(300).default(""),
    afterSessionId: idSchema.nullable().default(null),
    trigger: relayTriggerSchema,
    handoff: relayHandoffSchema,
    taskId: idSchema,
    referenceTaskId: idSchema.nullable().default(null),
    prompt: z.string().max(100000),
  })
  .strict();
export type RelayValues = z.infer<typeof relayValuesSchema>;
export type Relay = RelayValues & {
  id: string;
  revision: number;
  enabled: boolean;
  status: RelayStatus;
  statusReason: string;
  armedAt: string;
  dueAt: string | null;
  firedAt: string | null;
  resultRunId: string | null;
  lastError: string;
  createdAt: string;
  updatedAt: string;
};
export type RelayDecision = {
  action: "idle" | "wait" | "fire" | "blocked" | "missed";
  dueAt: string | null;
  reason: string;
};
export function relayPredecessor(relay: Pick<Relay, "afterSessionId">, state: ProjectState): Session | undefined {
  return relay.afterSessionId ? state.sessions.find((s) => s.sessionId === relay.afterSessionId) : undefined;
}
export function relayTitle(relay: Pick<Relay, "title" | "taskId" | "handoff">, state: ProjectState) {
  if (relay.title) return relay.title;
  const task = state.tasks.find((t) => t.id === relay.taskId);
  return `${relay.handoff.provider} → ${task?.title ?? relay.taskId}`;
}
/**
 * Pure decision. `aliveSince` is when the scheduler became able to fire (app
 * launch or resume); a due time that passed before that minus the grace window
 * is reported as missed and needs explicit human confirmation.
 */
export function relayDecision(
  relay: Relay,
  state: ProjectState,
  now = Date.now(),
  aliveSince: number | null = null,
): RelayDecision {
  if (relay.status !== "scheduled" || !relay.enabled)
    return { action: "idle", dueAt: relay.dueAt, reason: relay.status };
  const predecessor = relayPredecessor(relay, state);
  let endedAt: number | null = null;
  if (relay.afterSessionId) {
    if (!predecessor) return { action: "blocked", dueAt: null, reason: "PREDECESSOR_NOT_FOUND" };
    if (predecessor.source !== "runner") return { action: "blocked", dueAt: null, reason: "PREDECESSOR_NOT_RUNNER" };
    if (predecessor.lifecycle !== "history")
      return {
        action: "wait",
        dueAt: relay.trigger.kind === "at" ? relay.trigger.iso : null,
        reason: "PREDECESSOR_RUNNING",
      };
    if (predecessor.endReason !== "completed")
      return { action: "blocked", dueAt: null, reason: `PREDECESSOR_${(predecessor.endReason ?? "unknown").toUpperCase()}` };
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
/** Throws a domain code when values cannot form a valid, non-chained relay. */
export function validateRelay(
  values: RelayValues,
  state: ProjectState,
  relays: Relay[],
  selfId: string | null = null,
  now = Date.now(),
) {
  const task = state.tasks.find((t) => t.id === values.taskId);
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.archived) throw new Error("TASK_ARCHIVED");
  if (values.referenceTaskId && !state.tasks.some((t) => t.id === values.referenceTaskId))
    throw new Error("TASK_NOT_FOUND");
  if (values.afterSessionId) {
    const session = state.sessions.find((s) => s.sessionId === values.afterSessionId);
    if (!session) throw new Error("PREDECESSOR_NOT_FOUND");
    if (session.source !== "runner") throw new Error("PREDECESSOR_NOT_RUNNER");
    if (relays.some((r) => r.id !== selfId && r.resultRunId === values.afterSessionId))
      throw new Error("RELAY_CHAIN_FORBIDDEN");
    if (values.handoff.continueThread && (session.harnessId ?? session.provider) !== values.handoff.provider)
      throw new Error("RELAY_THREAD_PROVIDER_MISMATCH");
  } else if (values.handoff.continueThread) throw new Error("RELAY_THREAD_PROVIDER_MISMATCH");
  if (values.trigger.kind === "at") {
    const at = Date.parse(values.trigger.iso);
    if (at < now - 60000) throw new Error("RELAY_TIME_PAST");
    if (at > now + RELAY_MAX_AHEAD_MS) throw new Error("RELAY_TIME_TOO_FAR");
  }
}
/** Predecessor candidates: current runner sessions plus recent completed ones, never relay results. */
export function relayPredecessorCandidates(state: ProjectState, relays: Relay[], now = Date.now()): Session[] {
  const results = new Set(relays.map((r) => r.resultRunId).filter(Boolean));
  return state.sessions.filter(
    (s) =>
      s.source === "runner" &&
      !results.has(s.sessionId) &&
      (s.lifecycle !== "history" ||
        (s.endReason === "completed" && now - Date.parse(s.endedAt ?? s.at) < RELAY_PREDECESSOR_WINDOW_MS)),
  );
}
/** The exact prompt sent at fire time; deliverable references are resolved then, not when the relay was saved. */
export function composeRelayPrompt(relay: Pick<Relay, "prompt" | "referenceTaskId" | "afterSessionId" | "taskId">, state: ProjectState, directory: string, locale: Settings["locale"] = "en-GB"): string {
  const predecessor = relayPredecessor(relay, state);
  const referenceId = relay.referenceTaskId ?? predecessor?.taskIds[0] ?? relay.taskId;
  const reference = state.tasks.find((t) => t.id === referenceId);
  if (!reference) throw new Error("TASK_NOT_FOUND");
  return composeAgentPrompt(directory, state, locale, relay.taskId, relay.prompt, reference,
    predecessor ? `${predecessor.harnessId ?? predecessor.provider} · ${predecessor.model}${predecessor.threadId ? ` · session ${predecessor.threadId}` : ""}${predecessor.endedAt ? ` · ended ${predecessor.endedAt}` : ""}` : undefined);
}
