export type UpdateState = {
  status: "not-configured" | "idle" | "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "preparing" | "installing" | "error";
  version: string; targetVersion?: string; percent?: number; transferred?: number; total?: number;
  error?: string; errorStage?: "check" | "download" | "install"; releaseNotes?: string; deferred?: boolean;
  restored?: { version: string; failed: number };
};
export type UpdateBackend = {
  autoDownload: boolean; autoInstallOnAppQuit: boolean; allowDowngrade: boolean;
  setFeedURL(v: { provider: "generic"; url: string }): void;
  on(name: string, fn: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>; downloadUpdate(): Promise<unknown>; quitAndInstall(): void;
  prepareInstall?(): Promise<void>;
};
export class UpdateController {
  state: UpdateState;
  private backend?: UpdateBackend;
  private feed = "";
  private checking?: Promise<UpdateState>;
  private downloading?: Promise<UpdateState>;
  private deferredVersions = new Set<string>();
  constructor(private version: string, private create: () => UpdateBackend, private changed: (s: UpdateState) => void, private allowLocal = false) {
    this.state = { status: "not-configured", version };
  }
  private set(update: Partial<UpdateState>) { this.state = { ...this.state, ...update }; this.changed(this.state); }
  configure(feed: string) {
    if (feed === this.feed) return;
    if (["checking", "downloading", "preparing", "installing"].includes(this.state.status)) throw new Error("UPDATE_BUSY");
    if (feed) {
      let url: URL;
      try { url = new URL(feed); } catch { throw new Error("UPDATE_HTTPS_REQUIRED"); }
      if (url.username || url.password || !(url.protocol === "https:" || (this.allowLocal && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("UPDATE_HTTPS_REQUIRED");
    }
    this.feed = feed;
    this.state = { version: this.version, status: feed ? "idle" : "not-configured" };
    if (!feed) { this.backend = undefined; this.changed(this.state); return; }
    const backend = this.create(); this.backend = backend;
    backend.autoDownload = false; backend.autoInstallOnAppQuit = false; backend.allowDowngrade = false;
    backend.setFeedURL({ provider: "generic", url: feed });
    const listen = (event: string, fn: (...args: any[]) => void) => backend.on(event, (...args) => { if (this.backend === backend) fn(...args); });
    listen("update-available", (info) => this.set({ status: "available", targetVersion: info.version, percent: undefined, transferred: undefined, total: undefined, error: undefined, errorStage: undefined, deferred: this.deferredVersions.has(info.version), releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : Array.isArray(info.releaseNotes) ? info.releaseNotes.map((v: any) => v.note ?? "").join("\n") : "" }));
    listen("update-not-available", () => this.set({ status: "up-to-date", targetVersion: undefined, releaseNotes: undefined, error: undefined, errorStage: undefined }));
    listen("download-progress", (p) => this.set({ status: "downloading", percent: Math.max(0, Math.min(100, p.percent)), transferred: p.transferred, total: p.total }));
    listen("update-downloaded", (info) => this.set({ status: "downloaded", targetVersion: info.version, percent: 100, error: undefined, errorStage: undefined }));
    listen("error", (error) => this.failure(error, ["preparing", "installing"].includes(this.state.status) ? "install" : this.state.status === "downloading" ? "download" : "check"));
    this.changed(this.state);
  }
  failure(error: unknown, stage: UpdateState["errorStage"]) { this.set({ status: "error", error: String(error), errorStage: stage }); }
  async check() {
    if (!this.backend) return this.state;
    if (["downloading", "downloaded", "preparing", "installing"].includes(this.state.status)) return this.state;
    if (this.checking) return this.checking;
    this.set({ status: "checking", error: undefined, errorStage: undefined });
    this.checking = this.backend.checkForUpdates().then(() => this.state).catch((e) => { this.failure(e, "check"); return this.state; }).finally(() => { this.checking = undefined; });
    return this.checking;
  }
  async download() {
    if (this.downloading) return this.downloading;
    if (!this.backend || !(this.state.status === "available" || this.state.status === "error" && this.state.errorStage === "download")) throw new Error("NO_UPDATE_AVAILABLE");
    this.set({ status: "downloading", percent: 0, error: undefined, errorStage: undefined, deferred: false });
    this.downloading = this.backend.downloadUpdate().then(() => this.state).catch((e) => { this.failure(e, "download"); return this.state; }).finally(() => { this.downloading = undefined; });
    return this.downloading;
  }
  defer() { if (this.state.targetVersion) this.deferredVersions.add(this.state.targetVersion); this.set({ deferred: true }); }
  preparing() { if (this.state.status !== "downloaded") throw new Error("UPDATE_NOT_DOWNLOADED"); this.set({ status: "preparing", error: undefined }); }
  cancelPreparation() { if (this.state.status === "preparing") this.set({ status: "downloaded", deferred: true }); }
  async stage() { if (this.state.status !== "preparing") throw new Error("UPDATE_NOT_DOWNLOADED"); await this.backend?.prepareInstall?.(); if (this.state.status !== "preparing") throw new Error("UPDATE_PREPARATION_FAILED"); }
  install() {
    if (!this.backend || !["downloaded", "preparing"].includes(this.state.status)) throw new Error("UPDATE_NOT_DOWNLOADED");
    this.set({ status: "installing" });
    try { this.backend.quitAndInstall(); } catch (e) { this.failure(e, "install"); throw e; }
  }
  restored(version: string, failed: number) { this.set({ restored: { version, failed } }); }
  acknowledgeRestore() { this.set({ restored: undefined }); }
}
