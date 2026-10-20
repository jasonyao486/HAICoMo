import { randomUUID } from "node:crypto";
import { type ProjectState, type Workspace, type Settings } from "../shared/domain";
import {
  assertRelayStepRunnable,
  composeRelayStepPrompt,
  relayNext,
  relayProgress,
  relayTitle,
  RELAY_ARMED_STATUSES,
  stageUsesWorktrees,
  stepLabel,
  type Relay,
  type RelayStep,
  type RelayStepState,
} from "../shared/relay";

export type RelayStartResult = { runId: string; threadId?: string; to: string };
export type RelaySummary = {
  directory: string;
  relayId: string;
  title: string;
  status: Relay["status"];
  statusReason: string;
  dueAt: string | null;
  stage: number;
  stages: number;
  autonomous: boolean;
  steps: { label: string; provider: string; taskId: string; state: RelayStepState; stage: number }[];
};
export const ARMED_RELAY_STATUSES: Relay["status"][] = RELAY_ARMED_STATUSES;
/** A step's git working copy, as the worktree hook prepared it. */
export type RelayWorkCopy = { path: string; branch: string; cwd: string };
export type RelayStartRequest = { relay: Relay; stageIndex: number; step: RelayStep; state: ProjectState; prompt: string; workCopy?: RelayWorkCopy | null };
export type SchedulerHooks = {
  /** Directories whose stores are open and may hold relays. */
  directories: () => string[];
  view: (directory: string) => Promise<Workspace>;
  command: (directory: string, type: string, payload: unknown) => Promise<Workspace>;
  /** Capability checks and the actual background start; throws on any refusal. */
  start: (directory: string, request: RelayStartRequest) => Promise<RelayStartResult>;
  /** Run ids the local runner still owns (a run missing here for long is lost). */
  activeRunIds?: () => string[];
  now?: () => number;
  locale?: () => Settings["locale"];
  warn?: (directory: string, message: string) => void;
  /** Called after a relay reaches a state a human should look at (blocked, failed, completed, missed). */
  attention?: (directory: string, relay: Relay, state: ProjectState) => void;
  /** Creates (or reuses) a step's git working copy; throws a WORKTREE_* error when the repository is not ready. */
  worktree?: (directory: string, relay: Relay, stageIndex: number, step: RelayStep, label: string) => Promise<RelayWorkCopy | null>;
  /** Commits and merges one completed step's working copy; throws a WORKTREE_* error (a conflict is aborted first). */
  merge?: (directory: string, relay: Relay, step: RelayStep, label: string, state: ProjectState) => Promise<{ commit: string; removed: boolean }>;
};
/**
 * Main-process scheduler for relays. It only acts on projects that are open in
 * the app; it never retries a start whose outcome is unknown, and it claims a
 * stage in the database before spawning so a crash cannot double-send. Runs of
 * one stage are started one after another (they then execute in parallel);
 * the next stage is claimed only when every run of the current one delivered.
 */
export class RelayScheduler {
  aliveSince: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private queued = false;
  private stopped = false;
  private latest = new Map<string, RelaySummary[]>();
  /** Relays this process is firing right now (`directory\0relayId`). */
  private inFlight = new Set<string>();
  constructor(private hooks: SchedulerHooks) {
    this.aliveSince = this.now();
  }
  /** Relays seen during the last evaluation of each open directory (pending or needing attention). */
  summary(): RelaySummary[] {
    return [...this.latest.values()].flat();
  }
  armed(directory?: string): number {
    return this.summary().filter((r) => (!directory || r.directory === directory) && ARMED_RELAY_STATUSES.includes(r.status)).length;
  }
  /** Relays between or inside stages: quitting now stops them before their next stage. */
  inProgress(directory?: string): number {
    return this.summary().filter((r) => (!directory || r.directory === directory) && ["firing", "running"].includes(r.status)).length;
  }
  forget(directory: string) {
    this.latest.delete(directory);
  }
  private now() {
    return this.hooks.now?.() ?? Date.now();
  }
  start(intervalMs = 20000) {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  /** After sleep the app was effectively absent: due times before resume count as missed. */
  resume() {
    this.aliveSince = this.now();
    void this.tick();
  }
  /** Serialized evaluation; a tick requested during a tick runs once more afterwards. */
  tick(): Promise<void> {
    if (this.running) {
      this.queued = true;
      return this.running;
    }
    this.running = this.evaluate().finally(() => {
      this.running = null;
      if (this.queued) {
        this.queued = false;
        void this.tick();
      }
    });
    return this.running;
  }
  private summarize(directory: string, state: ProjectState): RelaySummary[] {
    const active = new Set(this.hooks.activeRunIds?.() ?? []);
    return state.relays
      .filter((r) => !["completed", "cancelled"].includes(r.status))
      .map((r) => {
        const p = relayProgress(r, state, { now: this.now(), activeRunIds: this.hooks.activeRunIds ? active : undefined });
        return {
          directory,
          relayId: r.id,
          title: relayTitle(r, state),
          status: r.status,
          statusReason: r.statusReason,
          dueAt: r.status === "scheduled" ? (r.dueAt ?? null) : r.dueAt,
          stage: r.stageIndex + 1,
          stages: r.stages.length,
          autonomous: r.autonomy.enabled,
          steps: p.steps.flat().map((s) => ({ label: s.label, provider: s.step.provider, taskId: s.step.taskId, state: s.state, stage: s.stageIndex })),
        };
      });
  }
  private async evaluate() {
    for (const directory of this.hooks.directories()) {
      let view: Workspace;
      try {
        view = await this.hooks.view(directory);
      } catch {
        continue;
      }
      this.latest.set(directory, this.summarize(directory, view.state));
      if (view.entryError) continue;
      const active = this.hooks.activeRunIds ? new Set(this.hooks.activeRunIds()) : undefined;
      for (const relay of view.state.relays) {
        const key = `${directory}\0${relay.id}`;
        try {
          const next = relayNext(relay, view.state, { now: this.now(), aliveSince: this.aliveSince, activeRunIds: active, inFlight: this.inFlight.has(key) });
          const guard = { relayId: relay.id, expectedRevision: relay.revision };
          let after: Workspace | null = null;
          if (next.action === "interrupt") after = await this.hooks.command(directory, "relay.failed", { ...guard, reason: "INTERRUPTED", error: "INTERRUPTED" });
          else if (next.action === "block") after = await this.hooks.command(directory, "relay.blocked", { ...guard, reason: next.reason, stepId: next.stepId });
          else if (next.action === "missed") after = await this.hooks.command(directory, "relay.missed", { ...guard, dueAt: next.dueAt });
          else if (next.action === "complete") after = await this.hooks.command(directory, "relay.completed", guard);
          else if (next.action === "merge") {
            const stepIndex = relay.stages[next.stage].steps.findIndex((s) => s.id === next.stepId);
            const step = relay.stages[next.stage].steps[stepIndex];
            try {
              if (!this.hooks.merge) throw new Error("WORKTREE_FAILED: merging is not available");
              const merged = await this.hooks.merge(directory, relay, step, stepLabel(next.stage, stepIndex), view.state);
              after = await this.hooks.command(directory, "relay.stepMerged", { ...guard, stepId: step.id, commit: merged.commit, removed: merged.removed });
              // The next working copy (or the next stage) follows straight away.
              this.queued = true;
            } catch (error) {
              const text = String((error as Error)?.message ?? error);
              const code = /^(WORKTREE_[A-Z_]+)/.exec(text)?.[1] ?? "WORKTREE_FAILED";
              after = await this.hooks.command(directory, "relay.blocked", { ...guard, reason: code, stepId: step.id, error: text });
            }
          }
          else if (next.action === "claim") {
            if (view.agentGuideError) {
              after = await this.hooks.command(directory, "relay.blocked", { ...guard, reason: view.agentGuideError });
            } else if (!this.stopped) {
              const claimed = await this.hooks.command(directory, "relay.claim", { ...guard, stage: next.stage, dueAt: "dueAt" in next ? next.dueAt : undefined });
              const current = claimed.state.relays.find((r) => r.id === relay.id);
              if (current?.status === "firing") {
                this.inFlight.add(key);
                try {
                  after = await this.fireStage(directory, current, claimed.state);
                } finally {
                  this.inFlight.delete(key);
                }
              }
            }
          }
          const result = after?.state.relays.find((r) => r.id === relay.id);
          if (after && result && ["blocked", "failed", "completed", "missed"].includes(result.status)) this.hooks.attention?.(directory, result, after.state);
        } catch (error) {
          // A revision conflict means a human changed the relay meanwhile; it is re-evaluated next tick.
          this.hooks.warn?.(directory, `relay ${relay.id}: ${String(error)}`);
        }
      }
      try {
        this.latest.set(directory, this.summarize(directory, (await this.hooks.view(directory)).state));
      } catch {}
    }
  }
  /**
   * Starts every unfired step of the claimed stage, sequentially. A step that
   * cannot start is recorded and its siblings still start. If recording itself
   * fails the relay stays `firing`; the next evaluation marks it INTERRUPTED.
   */
  private async fireStage(directory: string, relay: Relay, state: ProjectState): Promise<Workspace> {
    const k = relay.stageIndex;
    let current = relay;
    let view: Workspace | null = null;
    const exempt = relayProgress(relay, state).exemptTaskIds;
    for (const step of relay.stages[k].steps) {
      if (step.runId || step.error || step.overriddenAt) continue;
      if (this.stopped) throw new Error("APP_QUITTING");
      let result: RelayStartResult | null = null;
      let prompt = "";
      let workCopy: RelayWorkCopy | null = null;
      try {
        assertRelayStepRunnable(state.tasks.find((t) => t.id === step.taskId), state, exempt);
        if (stageUsesWorktrees(current, k) && this.hooks.worktree)
          workCopy = await this.hooks.worktree(directory, current, k, step, stepLabel(k, current.stages[k].steps.findIndex((s) => s.id === step.id)));
        prompt = composeRelayStepPrompt(current, k, step, state, directory, this.hooks.locale?.(), { workCopy: workCopy?.cwd });
        result = await this.hooks.start(directory, { relay: current, stageIndex: k, step, state, prompt, workCopy });
      } catch (error) {
        view = await this.hooks.command(directory, "relay.stepFailed", { relayId: current.id, expectedRevision: current.revision, stepId: step.id, error: String(error), ...(workCopy ? { worktree: workCopy } : {}) });
        current = view.state.relays.find((r) => r.id === relay.id)!;
        continue;
      }
      view = await this.hooks.command(directory, "relay.stepFired", {
        relayId: current.id,
        expectedRevision: current.revision,
        stepId: step.id,
        runId: result.runId,
        handoff: { id: randomUUID(), to: result.to, prompt },
        ...(workCopy ? { worktree: workCopy } : {}),
      });
      current = view.state.relays.find((r) => r.id === relay.id)!;
    }
    return this.hooks.command(directory, "relay.stageFired", { relayId: current.id, expectedRevision: current.revision });
  }
}
