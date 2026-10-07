import { randomUUID } from "node:crypto";
import { assertTaskRunnable, sessionAvatar, type ProjectState, type Workspace } from "../shared/domain";
import { composeRelayPrompt, relayDecision, relayPredecessor, type Relay } from "../shared/relay";

export type RelayStartResult = { runId: string; threadId?: string; to: string };
export type RelaySummary = { directory: string; relayId: string; title: string; status: Relay["status"]; dueAt: string | null; taskId: string; provider: string };
export const ARMED_RELAY_STATUSES: Relay["status"][] = ["scheduled", "firing"];
export type SchedulerHooks = {
  /** Directories whose stores are open and may hold relays. */
  directories: () => string[];
  view: (directory: string) => Promise<Workspace>;
  command: (directory: string, type: string, payload: unknown) => Promise<Workspace>;
  /** Capability checks and the actual background start; throws on any refusal. */
  start: (directory: string, relay: Relay, state: ProjectState, prompt: string) => Promise<RelayStartResult>;
  now?: () => number;
  warn?: (directory: string, message: string) => void;
};
/**
 * Main-process scheduler for relays. It only acts on projects that are open in
 * the app; it never retries a start whose outcome is unknown, and it claims a
 * relay in the database before spawning so a crash cannot double-send.
 */
export class RelayScheduler {
  aliveSince: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private queued = false;
  private latest = new Map<string, RelaySummary[]>();
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
  forget(directory: string) {
    this.latest.delete(directory);
  }
  private now() {
    return this.hooks.now?.() ?? Date.now();
  }
  start(intervalMs = 20000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }
  stop() {
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
  private async evaluate() {
    for (const directory of this.hooks.directories()) {
      let view: Workspace;
      try {
        view = await this.hooks.view(directory);
      } catch {
        continue;
      }
      this.latest.set(
        directory,
        view.state.relays
          .filter((r) => !["fired", "cancelled"].includes(r.status))
          .map((r) => ({ directory, relayId: r.id, title: r.title, status: r.status, dueAt: r.dueAt ?? relayDecision(r, view.state, this.now(), this.aliveSince).dueAt, taskId: r.taskId, provider: r.handoff.provider })),
      );
      if (view.entryError) continue;
      for (const relay of view.state.relays) {
        try {
          if (relay.status === "firing" && relay.statusReason === "manual") {
            await this.fire(directory, relay, view.state);
            continue;
          }
          if (relay.status !== "scheduled" || !relay.enabled) continue;
          const decision = relayDecision(relay, view.state, this.now(), this.aliveSince);
          if (decision.action === "blocked")
            await this.hooks.command(directory, "relay.blocked", { relayId: relay.id, expectedRevision: relay.revision, reason: decision.reason });
          else if (decision.action === "missed")
            await this.hooks.command(directory, "relay.missed", { relayId: relay.id, expectedRevision: relay.revision, dueAt: decision.dueAt });
          else if (decision.action === "fire") {
            const claimed = await this.hooks.command(directory, "relay.claim", { relayId: relay.id, expectedRevision: relay.revision, dueAt: decision.dueAt });
            const current = claimed.state.relays.find((r) => r.id === relay.id);
            if (current?.status === "firing") await this.fire(directory, current, claimed.state);
          }
        } catch (error) {
          // A revision conflict means a human changed the relay meanwhile; it is re-evaluated next tick.
          this.hooks.warn?.(directory, `relay ${relay.id}: ${String(error)}`);
        }
      }
    }
  }
  private async fire(directory: string, relay: Relay, state: ProjectState) {
    try {
      const task = state.tasks.find((t) => t.id === relay.taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      assertTaskRunnable(task, state.tasks);
      const prompt = composeRelayPrompt(relay, state);
      const result = await this.hooks.start(directory, relay, state, prompt);
      const predecessor = relayPredecessor(relay, state);
      await this.hooks.command(directory, "handoff.record", {
        id: randomUUID(),
        taskId: relay.taskId,
        provider: relay.handoff.provider,
        from: predecessor ? [sessionAvatar(predecessor)] : task.assignees,
        to: result.to,
        prompt,
        sessionId: result.runId,
        at: new Date(this.now()).toISOString(),
        mode: "relay",
        relayId: relay.id,
      });
      await this.hooks.command(directory, "relay.fired", { relayId: relay.id, expectedRevision: relay.revision, runId: result.runId });
    } catch (error) {
      await this.hooks
        .command(directory, "relay.failed", { relayId: relay.id, expectedRevision: relay.revision, error: String(error) })
        .catch((e) => this.hooks.warn?.(directory, `relay ${relay.id} failure not recorded: ${String(e)}`));
    }
  }
}
