import type { ResolveResult } from "./release-feed";

export type UpdateSource =
  | { kind: "official" }
  | { kind: "custom"; url: string }
  | { kind: "none"; reason: "not-configured" | "development" | "unsupported-platform" | "test" };
export type UpdateState = {
  status: "not-configured" | "idle" | "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "preparing" | "installing" | "error";
  version: string; source?: UpdateSource["kind"]; sourceReason?: string; sourceUrl?: string;
  targetVersion?: string; percent?: number; transferred?: number; total?: number; bytesPerSecond?: number; verifying?: boolean;
  error?: string; errorCode?: string; errorStage?: "check" | "download" | "install"; releaseNotes?: string; releasePage?: string;
  newerWithoutPackage?: string; blocked?: string; deferred?: boolean;
  lastChecked?: { at: string; ok: boolean; automatic: boolean; code?: string };
  restored?: { version: string; failed: number };
};
export type CancelToken = { cancel(): void; readonly cancelled: boolean };
export type UpdateBackend = {
  autoDownload: boolean; autoInstallOnAppQuit: boolean; allowDowngrade: boolean; autoRunAppAfterInstall?: boolean;
  setFeedURL(v: { provider: "generic"; url: string; useMultipleRangeRequest?: boolean }): void;
  on(name: string, fn: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>; downloadUpdate(token?: any): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  prepareInstall?(): Promise<void>;
};
export type UpdateDeps = {
  /** Chooses the official release for this platform (GitHub releases). */
  resolve?: (current: string) => Promise<ResolveResult>;
  /** Returns a blocking reason code when this installation cannot apply an update. */
  preflight?: () => Promise<string | undefined>;
  token?: () => CancelToken;
  now?: () => Date;
};
const BUSY = ["downloading", "downloaded", "preparing", "installing"];

export function validateUpdateFeed(feed: string, allowLocal: boolean) {
  let url: URL;
  try { url = new URL(feed); } catch { throw new Error("UPDATE_HTTPS_REQUIRED"); }
  if (url.username || url.password || !(url.protocol === "https:" || (allowLocal && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("UPDATE_HTTPS_REQUIRED");
}
export function updateErrorCode(error: unknown): string | undefined {
  const code = (error as any)?.code;
  if (typeof code === "string" && /^ERR_[A-Z0-9_]+$/.test(code)) return code;
  const message = (error instanceof Error ? error.message : String(error)).replace(/^(Error:\s*)+/, "");
  return /^((?:UPDATE|ERR)_[A-Z0-9_]+)/.exec(message)?.[1];
}
const sameSource = (a: UpdateSource, b: UpdateSource) =>
  a.kind === b.kind && (a.kind !== "custom" || a.url === (b as { url: string }).url) && (a.kind !== "none" || a.reason === (b as { reason: string }).reason);
const sourceFields = (s: UpdateSource) => ({ source: s.kind, sourceReason: s.kind === "none" ? s.reason : undefined, sourceUrl: s.kind === "custom" ? s.url : undefined });
const notesText = (notes: unknown) => typeof notes === "string" ? notes : Array.isArray(notes) ? notes.map((v: any) => v?.note ?? "").join("\n") : "";

export class UpdateController {
  state: UpdateState;
  private backend?: UpdateBackend;
  private source: UpdateSource = { kind: "none", reason: "not-configured" };
  private generation = 0;
  private checking?: Promise<UpdateState>;
  private checkingGeneration = -1;
  private downloading?: Promise<UpdateState>;
  private token?: CancelToken;
  private deferredVersions = new Set<string>();
  constructor(private version: string, private create: () => UpdateBackend, private changed: (s: UpdateState) => void, private allowLocal = false, private deps: UpdateDeps = {}) {
    this.state = { status: "not-configured", version, ...sourceFields(this.source) };
  }
  private set(update: Partial<UpdateState>) { this.state = { ...this.state, ...update }; this.changed(this.state); }
  private now() { return (this.deps.now?.() ?? new Date()).toISOString(); }
  /** One backend per process: each MacUpdater registers listeners on Electron's global native updater. */
  private ensureBackend() {
    if (this.backend) return this.backend;
    const backend = this.create(); this.backend = backend;
    backend.autoDownload = false; backend.autoInstallOnAppQuit = false; backend.allowDowngrade = false;
    backend.autoRunAppAfterInstall = true;
    backend.on("update-available", (info) => {
      if (this.state.status !== "checking" || this.checkingGeneration !== this.generation) return;
      this.set({ status: "available", targetVersion: info.version, percent: undefined, transferred: undefined, total: undefined, bytesPerSecond: undefined, verifying: undefined, error: undefined, errorCode: undefined, errorStage: undefined, deferred: this.deferredVersions.has(info.version), releaseNotes: notesText(info.releaseNotes) });
    });
    backend.on("update-not-available", () => {
      if (this.state.status !== "checking" || this.checkingGeneration !== this.generation) return;
      this.set({ status: "up-to-date", targetVersion: undefined, releaseNotes: undefined, error: undefined, errorCode: undefined, errorStage: undefined });
    });
    backend.on("download-progress", (p) => {
      if (this.state.status !== "downloading") return;
      const percent = Math.max(0, Math.min(100, Number(p.percent) || 0));
      this.set({ percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond, verifying: percent >= 100 });
    });
    backend.on("update-downloaded", (info) => {
      if (this.state.status !== "downloading") return;
      this.set({ status: "downloaded", targetVersion: info.version ?? this.state.targetVersion, percent: 100, verifying: false, bytesPerSecond: undefined, error: undefined, errorCode: undefined, errorStage: undefined });
    });
    // Check failures arrive through the rejected check promise; cancellation is not an error.
    backend.on("error", (error) => {
      if (this.state.status === "downloading" && !this.token?.cancelled) this.failure(error, "download");
      else if (["preparing", "installing"].includes(this.state.status)) this.failure(error, "install");
    });
    return backend;
  }
  /** Changing the source never discards a download in progress; it applies to the next check. */
  setSource(source: UpdateSource) {
    if (source.kind === "custom") validateUpdateFeed(source.url, this.allowLocal);
    if (sameSource(source, this.source)) return;
    this.source = source; this.generation++;
    if (BUSY.includes(this.state.status)) { this.set(sourceFields(source)); return; }
    this.state = { version: this.version, status: source.kind === "none" ? "not-configured" : "idle", ...sourceFields(source), lastChecked: this.state.lastChecked, restored: this.state.restored };
    this.changed(this.state);
  }
  /** Compatibility with the original custom-feed API. */
  configure(feed: string) { this.setSource(feed ? { kind: "custom", url: feed } : { kind: "none", reason: "not-configured" }); }
  failure(error: unknown, stage: UpdateState["errorStage"]) { this.set({ status: "error", error: String(error), errorCode: updateErrorCode(error), errorStage: stage, verifying: undefined, bytesPerSecond: undefined }); }
  async check(options: { automatic?: boolean } = {}): Promise<UpdateState> {
    if (BUSY.includes(this.state.status)) return this.state;
    if (this.checking) {
      if (this.checkingGeneration === this.generation) return this.checking;
      await this.checking;
      return this.check(options);
    }
    if (this.source.kind === "none") return this.state;
    const generation = this.generation, previous = this.state, automatic = !!options.automatic;
    this.checkingGeneration = generation;
    this.set({ status: "checking", error: undefined, errorCode: undefined, errorStage: undefined });
    this.checking = this.runCheck(generation, previous, automatic).finally(() => { this.checking = undefined; });
    return this.checking;
  }
  private async runCheck(generation: number, previous: UpdateState, automatic: boolean): Promise<UpdateState> {
    const current = () => generation === this.generation;
    try {
      let feed: string, expected: string | undefined, notes = "", page: string | undefined;
      if (this.source.kind === "official") {
        if (!this.deps.resolve) throw new Error("UPDATE_SOURCE_UNAVAILABLE");
        const found = await this.deps.resolve(this.version);
        if (!current()) return this.state;
        if (found.kind === "none") {
          this.set({ status: "up-to-date", targetVersion: undefined, releaseNotes: undefined, newerWithoutPackage: found.newerWithoutPackage, releasePage: found.page, lastChecked: { at: this.now(), ok: true, automatic } });
          return this.state;
        }
        feed = found.feed; expected = found.version; notes = found.notes; page = found.page;
        validateUpdateFeed(feed, this.allowLocal);
      } else if (this.source.kind === "custom") feed = this.source.url;
      else return this.state;
      const backend = this.ensureBackend();
      // GitHub's storage does not serve multi-range requests used by differential downloads.
      backend.setFeedURL(this.source.kind === "official" ? { provider: "generic", url: feed, useMultipleRangeRequest: false } : { provider: "generic", url: feed });
      const result: any = await backend.checkForUpdates();
      if (!current()) return this.state;
      if (result === null) {
        // electron-updater is inactive in an unpackaged development run.
        this.set({ status: "not-configured", source: "none", sourceReason: "development" });
        return this.state;
      }
      if (this.state.status === "checking") {
        const info = result?.updateInfo;
        if (info?.version && result.isUpdateAvailable) this.set({ status: "available", targetVersion: info.version, deferred: this.deferredVersions.has(info.version), releaseNotes: notesText(info.releaseNotes) });
        else this.set({ status: "up-to-date", targetVersion: undefined, releaseNotes: undefined });
      }
      if (this.state.status === "available") {
        if (expected && this.state.targetVersion !== expected) throw new Error(`UPDATE_METADATA_MISMATCH: ${expected} ≠ ${this.state.targetVersion}`);
        const blocked = await this.deps.preflight?.();
        if (!current()) return this.state;
        this.set({ releaseNotes: notes || this.state.releaseNotes, releasePage: page, newerWithoutPackage: undefined, blocked });
      } else this.set({ newerWithoutPackage: undefined, releasePage: page });
      this.set({ lastChecked: { at: this.now(), ok: true, automatic } });
    } catch (error) {
      if (!current()) return this.state;
      const code = updateErrorCode(error);
      // A background check never interrupts the user; the failure is only recorded.
      if (automatic) { this.state = { ...previous, lastChecked: { at: this.now(), ok: false, automatic, code } }; this.changed(this.state); }
      else { this.failure(error, "check"); this.set({ lastChecked: { at: this.now(), ok: false, automatic, code } }); }
    }
    return this.state;
  }
  async download() {
    if (this.downloading) return this.downloading;
    if (!this.backend || !(this.state.status === "available" || this.state.status === "error" && this.state.errorStage === "download")) throw new Error("NO_UPDATE_AVAILABLE");
    if (this.state.blocked) throw new Error(this.state.blocked);
    const token = this.deps.token?.(); this.token = token;
    this.set({ status: "downloading", percent: 0, transferred: 0, total: undefined, bytesPerSecond: undefined, verifying: false, error: undefined, errorCode: undefined, errorStage: undefined, deferred: false });
    this.downloading = this.backend.downloadUpdate(token).then(() => this.state).catch((e) => {
      if (token?.cancelled || /^(Error:\s*)?cancell?ed$/i.test(String(e?.message ?? e))) {
        if (this.state.status === "downloading" || this.state.status === "error") this.set({ status: "available", percent: undefined, transferred: undefined, total: undefined, bytesPerSecond: undefined, verifying: undefined, error: undefined, errorCode: undefined, errorStage: undefined });
        return this.state;
      }
      this.failure(e, "download"); return this.state;
    }).finally(() => { this.downloading = undefined; this.token = undefined; });
    return this.downloading;
  }
  /** Stops a download in progress; partial files are discarded by electron-updater. */
  async cancelDownload() {
    if (this.state.status !== "downloading" || !this.downloading) return this.state;
    this.token?.cancel();
    return this.downloading;
  }
  defer() { if (this.state.targetVersion) this.deferredVersions.add(this.state.targetVersion); this.set({ deferred: true }); }
  preparing() { if (this.state.status !== "downloaded") throw new Error("UPDATE_NOT_DOWNLOADED"); this.set({ status: "preparing", error: undefined, errorCode: undefined }); }
  cancelPreparation() { if (this.state.status === "preparing") this.set({ status: "downloaded", deferred: true }); }
  async stage() { if (this.state.status !== "preparing") throw new Error("UPDATE_NOT_DOWNLOADED"); await this.backend?.prepareInstall?.(); if (this.state.status !== "preparing") throw new Error("UPDATE_PREPARATION_FAILED"); }
  install() {
    if (!this.backend || !["downloaded", "preparing"].includes(this.state.status)) throw new Error("UPDATE_NOT_DOWNLOADED");
    this.set({ status: "installing" });
    // Windows: the NSIS window shows installation progress, then relaunches. macOS: Squirrel replaces and relaunches.
    try { this.backend.quitAndInstall(false, true); } catch (e) { this.failure(e, "install"); throw e; }
  }
  restored(version: string, failed: number) { this.set({ restored: { version, failed } }); }
  acknowledgeRestore() { this.set({ restored: undefined }); }
}
