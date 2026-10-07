import { randomUUID } from "node:crypto";
import { z } from "zod";
export const resumePageSchema = z.enum(["overview", "tasks", "scheduled", "relay", "timeline", "dependencies", "mindmap", "office", "proposals", "notes", "analytics", "archive", "history", "settings"]);
export const resumeTabSchema = z.object({ entryPath: z.string().max(4000).optional(), id: z.string().optional(), epoch: z.string().optional(), page: resumePageSchema, active: z.boolean() }).strict();
export type ResumeTab = z.infer<typeof resumeTabSchema>;
export type ResumeWindow = { tabs: ResumeTab[] };
// All renderer windows acknowledge their own dirty forms before any native
// installation call. Agents and in-flight launches are rechecked at commit.
export class InstallGate {
  private job?: { ticket: string; windows: Set<number>; ready: Map<number, ResumeWindow>; committing: boolean };
  constructor(private hooks: {
    busy: () => boolean;
    begin: () => void;
    prepare: (window: number, ticket: string) => void;
    commit: (windows: ResumeWindow[]) => Promise<void>;
    cancel: () => void;
    failed: (error: unknown) => void;
  }) {}
  get active() { return !!this.job; }
  frozen(window: number) { return !!this.job && (this.job.committing || this.job.ready.has(window)); }
  start(windows: number[]) {
    if (this.job) return this.job.ticket;
    if (this.hooks.busy()) throw new Error("STOP_AGENTS_BEFORE_UPDATE");
    this.hooks.begin();
    const ticket = randomUUID();
    this.job = { ticket, windows: new Set(windows), ready: new Map(), committing: false };
    for (const window of windows) this.hooks.prepare(window, ticket);
    return ticket;
  }
  ready(window: number, ticket: string, tabs: ResumeTab[]) {
    const job = this.job;
    if (!job || job.ticket !== ticket || !job.windows.has(window)) throw new Error("UPDATE_PREPARATION_FAILED");
    if (job.committing) return;
    job.ready.set(window, { tabs });
    if (job.ready.size !== job.windows.size) return;
    job.committing = true;
    void (async () => {
      try {
        if (this.hooks.busy()) throw new Error("STOP_AGENTS_BEFORE_UPDATE");
        await this.hooks.commit([...job.ready.values()]);
      } catch (error) { this.hooks.failed(error); }
      finally { if (this.job === job) this.job = undefined; }
    })();
  }
  cancel(ticket?: string) {
    if (!this.job || ticket && this.job.ticket !== ticket) return;
    if (this.job.committing) throw new Error("UPDATE_BUSY");
    this.job = undefined; this.hooks.cancel();
  }
  lostWindow(window: number) {
    if (this.job?.windows.has(window) && !this.job.committing) this.cancel();
  }
}
