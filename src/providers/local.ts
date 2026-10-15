import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  spawn,
  execFile,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
  fail,
  inferFamily,
  type Capabilities,
  type RunEvent,
} from "../shared/domain";
import { APP_VERSION } from "../shared/version";
import type { BackgroundHarnessId } from "../shared/clients";
import {
  adapterFor,
  helpChoices,
  newJsonlState,
  readJsonlEvent,
  jsonlMessage,
  FORBIDDEN_MODES,
  WINDOWS_ARGV_PROMPT_LIMIT,
  type JsonlState,
  type ModeLaunch,
} from "./adapters";
const exec = promisify(execFile);

export { FORBIDDEN_MODES, CODEX_MODES, CLAUDE_FALLBACK_MODES, helpChoices } from "./adapters";

/**
 * npm installs on Windows expose `<name>.cmd` shims that `spawn` cannot run
 * without a shell. The shim text names the JavaScript entry; we launch that
 * entry with a Node runtime instead of interpolating a shell command.
 */
export function parseCmdShim(text: string, shimDirectory: string): string | null {
  const match = /"%dp0%\\([^"]+?\.(?:c|m)?js)"/i.exec(text) ?? /%dp0%\\(\S+?\.(?:c|m)?js)\b/i.exec(text);
  if (!match) return null;
  return path.join(shimDirectory, match[1].replace(/[\\/]/g, path.sep));
}
export type Launch = { command: string; prefix: string[]; env?: NodeJS.ProcessEnv };
export function nodeRuntime(shimDirectory: string, platform = process.platform): Launch {
  const local = path.join(shimDirectory, "node.exe");
  if (platform === "win32" && fs.existsSync(local)) return { command: local, prefix: [] };
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, platform === "win32" ? "node.exe" : "node");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return { command: candidate, prefix: [] };
    } catch {}
  }
  // Electron and Node both expose a Node-capable runtime at process.execPath.
  return { command: process.execPath, prefix: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } };
}
export function resolveLaunch(executable: string, platform = process.platform): Launch {
  if (platform === "win32" && /\.cmd$/i.test(executable)) {
    let text = "";
    try { text = fs.readFileSync(executable, "utf8"); } catch { return { command: executable, prefix: [] }; }
    const script = parseCmdShim(text, path.dirname(executable));
    if (script && fs.existsSync(script)) {
      const runtime = nodeRuntime(path.dirname(executable), platform);
      return { ...runtime, prefix: [...runtime.prefix, script] };
    }
  }
  return { command: executable, prefix: [] };
}
function launchArgs(executable: string, args: string[]) {
  const launch = resolveLaunch(executable);
  return { command: launch.command, args: [...launch.prefix, ...args], env: launch.env ?? process.env };
}

export function probeCodex(executable: string) {
  const launch = launchArgs(executable, ["app-server", "--listen", "stdio://"]);
  const proc = spawn(launch.command, launch.args, {
    stdio: "pipe",
    shell: false,
    windowsHide: true,
    env: launch.env,
  });
  return new Promise<{ models: NonNullable<Capabilities["models"]> }>(
    (resolve, reject) => {
      let buffer = "",
        settled = false;
      const finish = (
        error?: Error,
        models: NonNullable<Capabilities["models"]> = [],
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        proc.stdin.end();
        proc.kill();
        error ? reject(error) : resolve({ models });
      };
      const timer = setTimeout(
        () => finish(new Error("APP_SERVER_DISCOVERY_TIMEOUT")),
        8000,
      );
      proc.on("error", finish);
      proc.on("exit", () => {
        if (!settled) finish(new Error("APP_SERVER_DISCONNECTED"));
      });
      proc.stdin.on("error", finish);
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.length > 4 * 1024 * 1024) {
          finish(new Error("DISCOVERY_OUTPUT_LIMIT"));
          return;
        }
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          try {
            const m = JSON.parse(line);
            if (m.error) {
              finish(new Error(JSON.stringify(m.error)));
              return;
            }
            if (m.id === 1) {
              proc.stdin.write(
                JSON.stringify({ method: "initialized", params: {} }) + "\n",
              );
              proc.stdin.write(
                JSON.stringify({
                  id: 2,
                  method: "model/list",
                  params: { limit: 100 },
                }) + "\n",
              );
            }
            if (m.id === 2)
              finish(
                undefined,
                (m.result?.data ?? []).map((v: any) => ({
                  id: String(v.model ?? v.id),
                  name: String(v.displayName ?? v.model),
                  efforts: (v.supportedReasoningEfforts ?? []).map((e: any) =>
                    String(e.reasoningEffort),
                  ),
                  isDefault: Boolean(v.isDefault),
                })),
              );
          } catch {}
        }
      });
      proc.stdin.write(
        JSON.stringify({
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "haicomo", title: "HAICoMo", version: APP_VERSION },
          },
        }) + "\n",
      );
    },
  );
}
export type RunOptions = {
  provider: BackgroundHarnessId;
  executable: string;
  directory: string;
  taskId: string;
  projectId?: string;
  epoch?: string;
  prompt: string;
  model?: string;
  effort?: string;
  mode?: string;
  threadId?: string;
  /** Set only for relays the user explicitly consented to run unattended. */
  autonomous?: boolean;
};
export type PermissionRequest = {
  runId: string;
  directory: string;
  projectId?: string;
  epoch?: string;
  id: number | string;
  method: string;
  params: any;
};
type Run = {
  process: ChildProcessWithoutNullStreams;
  options: RunOptions;
  id: string;
  threadId?: string;
  turnId?: string;
  turnStarted: boolean;
  status: RunEvent["status"];
  heartbeat: ReturnType<typeof setInterval>;
  pending: Map<
    number | string,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >;
  nextId: number;
  finished: boolean;
  log: string[];
  serverRequests: Map<number | string, { method: string; params: any }>;
  output: string;
  lastEventAt: number;
  protocol: "codex-app-server" | "claude-stream" | "jsonl" | "text";
  jsonl?: JsonlState;
};

export function findExecutable(provider: string, configured = "") {
  if (configured) {
    if (!path.isAbsolute(configured) || !fs.existsSync(configured)) return "";
    return configured;
  }
  const adapter = adapterFor(provider);
  const names = adapter?.executableNames ?? [provider];
  const paths = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...(adapter?.extraDirs(process.platform) ?? []),
  ];
  if (process.platform === "win32" && process.env.APPDATA) paths.push(path.join(process.env.APPDATA, "npm"));
  for (const dir of paths)
    for (const base of names)
      for (const name of process.platform === "win32" ? [`${base}.exe`, `${base}.cmd`, base] : [base]) {
        const file = path.join(dir, name);
        try {
          fs.accessSync(file, fs.constants.X_OK);
          if (fs.statSync(file).isFile()) return file;
        } catch {}
      }
  return "";
}
export async function detect(provider: string, configured = ""): Promise<Capabilities> {
  const adapter = adapterFor(provider);
  const executable = findExecutable(provider, configured),
    base: Capabilities = {
      provider: provider as Capabilities["provider"],
      installed: false,
      executable,
      version: "",
      background: false,
      resume: false,
      model: false,
      effort: false,
      speed: false,
      modes: [],
      reason: "NOT_INSTALLED",
    };
  if (!adapter) return { ...base, reason: "MANUAL_HANDOFF_ONLY" };
  if (!executable) return base;
  try {
    const versionLaunch = launchArgs(executable, ["--version"]);
    const { stdout } = await exec(versionLaunch.command, versionLaunch.args, { timeout: 7000, env: versionLaunch.env });
    const helpLaunch = launchArgs(executable, adapter.helpArgs);
    const { stdout: helpOut, stderr: helpErr } = await exec(helpLaunch.command, helpLaunch.args, { timeout: 15000, env: helpLaunch.env });
    const help = `${helpOut}\n${helpErr}`;
    const headless = adapter.requiredHelp.every((flag) => help.includes(flag));
    let models: Capabilities["models"];
    let discoveryError = "";
    if (provider === "codex" && headless)
      try {
        models = (await probeCodex(executable)).models;
      } catch (error) {
        discoveryError = String(error);
      }
    const modes = adapter.modes(help).filter((m) => !FORBIDDEN_MODES.includes(m));
    const efforts = provider === "claude" && help.includes("--effort") ? helpChoices(help, "--effort") : [];
    const autonomous = headless ? adapter.autonomousMode(help) : null;
    return {
      ...base,
      installed: true,
      version: stdout.trim().split(/\r?\n/)[0] ?? "",
      background: headless && !discoveryError && !adapter.autonomyOnly,
      autonomousMode: autonomous ?? undefined,
      autonomyOnly: Boolean(adapter.autonomyOnly) || undefined,
      relayReady: headless && !discoveryError,
      resume: adapter.resume(help),
      model: adapter.model(help),
      effort: Boolean(models?.some((m) => m.efforts.length)) || efforts.length > 0,
      models,
      efforts,
      modes,
      reason: discoveryError || (headless ? "" : "HEADLESS_FLAGS_NOT_FOUND"),
    };
  } catch (e) {
    return { ...base, reason: String(e) };
  }
}
/** Effort values valid for a provider/model pair, or null when unconstrained. */
export function supportedEfforts(cap: Capabilities, model?: string): string[] {
  if (cap.provider === "claude") return cap.efforts ?? [];
  return cap.models?.find((m) => (model ? m.id === model : m.isDefault))?.efforts ?? [];
}

export class LocalRunners {
  readonly instanceId = randomUUID();
  private runs = new Map<string, Run>();
  private processes = new Map<ChildProcessWithoutNullStreams, RunOptions>();
  hasProcesses(directory: string) {
    return [...this.processes.values()].some((p) => p.directory === directory);
  }
  constructor(
    private onEvent: (directory: string, event: RunEvent) => void,
    private onPermission: (p: PermissionRequest) => void,
    private onResolved: (
      directory: string,
      runId: string,
      id?: number | string,
    ) => void = () => {},
  ) {}
  interactions() {
    return [...this.runs.values()]
      .filter((r) => !r.finished)
      .flatMap((r) =>
        [...r.serverRequests].map(([id, p]) => ({
          ...p,
          id,
          runId: r.id,
          directory: r.options.directory,
          projectId: r.options.projectId,
          epoch: r.options.epoch,
        })),
      );
  }
  active() {
    return [...this.runs.values()]
      .filter((r) => !r.finished)
      .map((r) => ({
        runId: r.id,
        provider: r.options.provider,
        taskId: r.options.taskId,
        directory: r.options.directory,
        projectId: r.options.projectId,
        epoch: r.options.epoch,
        status: r.status,
        threadId: r.threadId,
        model: r.options.model,
        mode: r.options.mode,
      }));
  }
  private emit(
    run: Run,
    status: RunEvent["status"],
    message = "",
    lifecycle: "current" | "history" = "current",
    endReason?: RunEvent["endReason"],
  ) {
    message = message.slice(-12000);
    if (
      status === "running" &&
      run.status === "running" &&
      message &&
      Date.now() - run.lastEventAt < 250
    )
      return;
    run.status = status;
    run.lastEventAt = Date.now();
    if (message) run.log = [...run.log, message].slice(-100);
    // A consumer failure must never corrupt runner bookkeeping or strand timers.
    try {
      this.deliver(run, status, message, lifecycle, endReason);
    } catch (error) {
      run.log = [...run.log, `onEvent failed: ${String(error)}`].slice(-100);
    }
  }
  private deliver(
    run: Run,
    status: RunEvent["status"],
    message: string,
    lifecycle: "current" | "history",
    endReason?: RunEvent["endReason"],
  ) {
    this.onEvent(run.options.directory, {
      id: randomUUID(),
      sessionId: run.id,
      projectId: run.options.projectId,
      epoch: run.options.epoch,
      instanceId: this.instanceId,
      lifecycle,
      endReason,
      ...(lifecycle === "history" ? { endedAt: new Date().toISOString() } : {}),
      family: inferFamily(run.options.model || ""),
      harnessId: run.options.provider,
      avatarId:
        inferFamily(run.options.model || "") ??
        `client:${run.options.provider}`,
      provider: run.options.provider,
      model: run.options.model || "default",
      taskIds: [run.options.taskId],
      status,
      source: "runner",
      at: new Date().toISOString(),
      message,
      threadId: run.threadId,
    });
  }
  private send(run: Run, message: any) {
    if (run.process.stdin.destroyed || run.process.stdin.writableEnded)
      fail("AGENT_DISCONNECTED");
    run.process.stdin.write(JSON.stringify(message) + "\n");
  }
  private request(
    run: Run,
    method: string,
    params: any,
    timeout = 30000,
  ): Promise<any> {
    const id = ++run.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        run.pending.delete(id);
        reject(new Error(`RPC_TIMEOUT ${method}; outcome may be unknown`));
      }, timeout);
      run.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.send(run, { id, method, params });
      } catch (error) {
        clearTimeout(timer);
        run.pending.delete(id);
        reject(error);
      }
    });
  }
  async start(options: RunOptions) {
    if (!options.prompt.trim()) fail("PROMPT_REQUIRED");
    if (!path.isAbsolute(options.executable)) fail("EXECUTABLE_REQUIRED");
    if (options.mode && FORBIDDEN_MODES.includes(options.mode)) fail("MODE_UNSUPPORTED", options.mode);
    if (
      this.active().some(
        (r) =>
          r.provider === options.provider &&
          options.threadId &&
          r.threadId === options.threadId,
      )
    )
      fail("SESSION_ALREADY_RUNNING");
    const adapter = adapterFor(options.provider);
    if (!adapter) fail("BACKGROUND_UNSUPPORTED", options.provider);
    let mode: ModeLaunch;
    try {
      mode = adapter.mode(options.mode);
    } catch (error) {
      fail("MODE_UNSUPPORTED", String((error as Error).message).replace(/^MODE_UNSUPPORTED:\s*/, ""));
    }
    // Unattended flags are honoured only for relays whose owner consented to them.
    if ((mode.autonomous || adapter.autonomyOnly) && !options.autonomous) fail("AUTONOMY_CONSENT_REQUIRED", options.mode ?? "");
    if (adapter.promptVia === "arg" && process.platform === "win32" && options.prompt.length > WINDOWS_ARGV_PROMPT_LIMIT)
      fail("PROMPT_TOO_LONG_FOR_ARGV");
    const args = adapter.args(
      { prompt: options.prompt, model: options.model, effort: options.effort, mode: options.mode, threadId: options.threadId, directory: options.directory },
      mode,
    );
    const protocol = adapter.protocol;
    const launch = launchArgs(options.executable, args);
    const proc = spawn(launch.command, launch.args, {
      cwd: options.directory,
      stdio: "pipe",
      shell: false,
      windowsHide: true,
      env: mode.env ? { ...launch.env, ...mode.env } : launch.env,
    });
    this.processes.set(proc, options);
    const run: Run = {
      process: proc,
      options,
      id: randomUUID(),
      threadId: options.threadId,
      turnStarted: false,
      status: "unknown",
      heartbeat: (() => {
        const timer = setInterval(() => {
          if (!run.finished) this.emit(run, run.status);
        }, 15000);
        timer.unref?.();
        return timer;
      })(),
      pending: new Map(),
      nextId: 0,
      finished: false,
      log: [],
      serverRequests: new Map(),
      output: "",
      lastEventAt: 0,
      protocol,
      jsonl: protocol === "jsonl" ? newJsonlState() : undefined,
    };
    this.runs.set(run.id, run);
    this.emit(run, "unknown", "Starting local agent; execution not confirmed");
    proc.stdin.on("error", (error) => {
      if (!run.finished) {
        this.emit(run, "error", String(error));
        this.finish(run);
      }
    });
    let buffer = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) {
        this.emit(run, "error", "OUTPUT_LIMIT");
        proc.kill();
        return;
      }
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (protocol === "text") {
          if (line.trim()) {
            run.output = `${run.output}${run.output ? "\n" : ""}${line}`.slice(-12000);
            this.emit(run, "running", run.output);
          }
          continue;
        }
        try {
          this.message(run, JSON.parse(line));
        } catch (e) {
          if (line.trim())
            run.log = [...run.log, line.slice(0, 2000)].slice(-100);
        }
      }
    });
    proc.stderr.on("data", (b) => {
      run.log = [...run.log, String(b).slice(0, 2000)].slice(-100);
    });
    proc.on("error", (error) => {
      this.processes.delete(proc);
      if (!run.finished)
        this.emit(run, "error", String(error), "history", "failed");
      this.finish(run);
    });
    proc.on("exit", (code) => {
      this.processes.delete(proc);
      // Exit-terminated protocols: the exit code is the completion signal.
      if (!run.finished && (protocol === "jsonl" || protocol === "text")) {
        const text = run.jsonl ? jsonlMessage(run.jsonl) : run.output;
        const failed = code !== 0 || Boolean(run.jsonl?.error);
        const detail = failed ? [run.jsonl?.error, run.log.slice(-3).join("\n")].filter(Boolean).join("\n") : "";
        this.emit(run, failed ? "error" : "idle", [text, detail].filter(Boolean).join("\n") || `Agent exited (${code})`, "history", failed ? "failed" : "completed");
        this.finish(run);
        return;
      }
      if (!run.finished)
        this.emit(
          run,
          code === 0 ? "unknown" : "error",
          run.log.slice(-3).join("\n") || `Agent exited (${code})`,
          "current",
          "lost",
        );
      this.finish(run);
    });
    let turnSent = false;
    try {
      if (options.provider === "codex") {
        await this.request(run, "initialize", {
          clientInfo: { name: "haicomo", title: "HAICoMo", version: APP_VERSION },
        });
        this.send(run, { method: "initialized", params: {} });
        const result = await this.request(
          run,
          options.threadId ? "thread/resume" : "thread/start",
          {
            ...(options.threadId ? { threadId: options.threadId } : {}),
            cwd: options.directory,
            ...(options.model ? { model: options.model } : {}),
            approvalPolicy: options.mode || "on-request",
            sandbox: "workspace-write",
          },
        );
        run.threadId = result.thread.id;
        if (typeof result.model === "string") run.options.model = result.model;
        turnSent = true;
        const turnResult = await this.request(run, "turn/start", {
          threadId: run.threadId,
          input: [{ type: "text", text: options.prompt, text_elements: [] }],
          ...(options.model ? { model: options.model } : {}),
          ...(options.effort ? { effort: options.effort } : {}),
        });
        run.turnId = turnResult.turn?.id ?? run.turnId;
      } else {
        await new Promise<void>((resolve, reject) => {
          proc.once("spawn", resolve);
          proc.once("error", reject);
        });
        turnSent = true;
        if (adapter.promptVia === "stdin") proc.stdin.end(options.prompt);
        else proc.stdin.end();
      }
      return { runId: run.id, threadId: run.threadId, status: "started" };
    } catch (e) {
      if (!run.finished)
        this.emit(
          run,
          turnSent ? "unknown" : "error",
          String(e),
          turnSent ? "current" : "history",
          turnSent ? "lost" : "failed",
        );
      if (!turnSent) {
        this.finish(run);
        proc.kill();
      }
      throw e;
    }
  }
  private message(run: Run, m: any) {
    if (run.finished) return;
    if (run.options.provider === "codex") {
      if (m.id !== undefined && !m.method) {
        const pending = run.pending.get(m.id);
        if (pending) {
          run.pending.delete(m.id);
          if (m.error) pending.reject(new Error(JSON.stringify(m.error)));
          else pending.resolve(m.result);
        }
        return;
      }
      if (m.id !== undefined && m.method) {
        run.serverRequests.set(m.id, { method: m.method, params: m.params });
        this.emit(run, "waiting", JSON.stringify(m.params).slice(0, 12000));
        this.onPermission({
          runId: run.id,
          directory: run.options.directory,
          projectId: run.options.projectId,
          epoch: run.options.epoch,
          id: m.id,
          method: m.method,
          params: m.params,
        });
        return;
      }
      if (m.method === "turn/completed") {
        const status = m.params?.turn?.status;
        this.emit(
          run,
          status === "completed"
            ? "idle"
            : status === "interrupted"
              ? "idle"
              : "error",
          m.params?.turn?.error
            ? JSON.stringify(m.params.turn.error)
            : run.output || "Turn completed",
          "history",
          status === "completed"
            ? "completed"
            : status === "interrupted"
              ? "cancelled"
              : "failed",
        );
        this.finish(run);
        run.process.stdin.end();
        setTimeout(() => run.process.kill(), 1500).unref();
      } else if (
        m.method === "item/agentMessage/delta" &&
        !run.serverRequests.size
      ) {
        run.output = (run.output + String(m.params.delta ?? "")).slice(-12000);
        this.emit(run, "running", run.output);
      } else if (m.method === "turn/started") {
        run.turnId = m.params?.turn?.id;
        run.turnStarted = true;
        if (!run.serverRequests.size) this.emit(run, "running");
      } else if (m.method === "item/started" && !run.serverRequests.size)
        this.emit(run, "running");
    } else if (run.protocol === "jsonl" && run.jsonl) {
      const seen = readJsonlEvent(run.jsonl, m);
      if (run.jsonl.threadId) run.threadId = run.jsonl.threadId;
      if (run.jsonl.model && !run.options.model) run.options.model = run.jsonl.model;
      if (seen.text) this.emit(run, "running", jsonlMessage(run.jsonl));
      else if (run.status === "unknown") this.emit(run, "running");
    } else {
      if (m.session_id) run.threadId = m.session_id;
      if (m.type === "result") {
        const denied =
          Array.isArray(m.permission_denials) &&
          m.permission_denials.length > 0;
        this.emit(
          run,
          denied ? "waiting" : m.is_error ? "error" : "idle",
          String(m.result ?? m.error ?? "") +
            (denied
              ? "\nPermission required. Continue in the foreground client.\n" +
                JSON.stringify(m.permission_denials).slice(0, 4000)
              : ""),
          "history",
          denied ? "permission" : m.is_error ? "failed" : "completed",
        );
        this.finish(run);
      } else if (m.type === "system" && m.subtype === "init") {
        if (typeof m.model === "string") run.options.model = m.model;
        this.emit(run, "running");
      } else if (m.type === "assistant")
        this.emit(
          run,
          "running",
          m.message?.content
            ?.filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n") ?? "",
        );
    }
  }
  respond(
    runId: string,
    id: number | string,
    method: string,
    allow: boolean,
    answers?: any,
  ) {
    const run = this.runs.get(runId);
    if (!run || run.finished) fail("RUN_NOT_ACTIVE");
    const request = run.serverRequests.get(id);
    if (!request || request.method !== method) fail("INTERACTION_NOT_PENDING");
    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval"
    )
      this.send(run, {
        id,
        result: { decision: allow ? "accept" : "decline" },
      });
    else if (
      method === "item/tool/requestUserInput" ||
      method === "tool/requestUserInput"
    ) {
      if (
        allow &&
        request.params?.questions?.some(
          (q: any) =>
            !Array.isArray(answers?.[q.id]?.answers) ||
            !answers[q.id].answers.length,
        )
      )
        fail("ANSWERS_REQUIRED");
      this.send(run, { id, result: { answers: allow ? answers : {} } });
    } else
      this.send(run, {
        id,
        error: {
          code: -32601,
          message: "Unsupported interaction; continue in the native client",
        },
      });
    run.serverRequests.delete(id);
    this.onResolved(run.options.directory, run.id, id);
    this.emit(run, run.serverRequests.size ? "waiting" : "running");
  }
  async cancel(runId: string) {
    const run = this.runs.get(runId);
    if (!run || run.finished) return;
    if (run.options.provider === "codex" && run.threadId && run.turnId) {
      try {
        // turn/start can acknowledge a queued turn before it becomes active.
        // Sending interrupt in that interval returns "no active turn" on Codex.
        const readyDeadline = Date.now() + 3000;
        while (!run.finished && !run.turnStarted && Date.now() < readyDeadline)
          await new Promise(resolve => setTimeout(resolve, 20));
        if (run.finished) return;
        if (!run.turnStarted) throw new Error("TURN_START_NOT_CONFIRMED");
        await this.request(
          run,
          "turn/interrupt",
          { threadId: run.threadId, turnId: run.turnId },
          3000,
        );
        // The RPC reply acknowledges the request, not the end of the turn.
        // Let turn/completed certify cancellation before falling back to a kill.
        const deadline = Date.now() + 3000;
        while (!run.finished && Date.now() < deadline)
          await new Promise(resolve => setTimeout(resolve, 20));
      } catch {}
    }
    if (run.finished) return;
    run.process.kill("SIGINT");
    this.emit(
      run,
      "unknown",
      "Cancellation requested; check external child processes before restarting.",
      "current",
      "lost",
    );
    this.finish(run);
    setTimeout(() => run.process.kill(), 3000).unref();
  }
  private finish(run: Run) {
    run.finished = true;
    this.runs.delete(run.id);
    clearInterval(run.heartbeat);
    for (const pending of run.pending.values())
      pending.reject(new Error("AGENT_DISCONNECTED"));
    run.pending.clear();
    run.serverRequests.clear();
    this.onResolved(run.options.directory, run.id);
  }
  dispose() {
    for (const proc of this.processes.keys()) proc.kill("SIGTERM");
    this.processes.clear();
    for (const run of this.runs.values()) {
      if (!run.finished) {
        run.process.kill("SIGINT");
        this.emit(run, "unknown", "Application closed", "current", "lost");
      }
      this.finish(run);
    }
  }
}
