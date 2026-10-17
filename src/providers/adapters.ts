import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BACKGROUND_EVIDENCE, type BackgroundHarnessId } from "../shared/clients";

/**
 * Headless launch descriptions for every background-capable client. Each
 * adapter is enabled only when the installed CLI's own help text names the
 * flags it relies on (`requiredHelp`), so a renamed or older CLI degrades to
 * manual handoff instead of being started with arguments it does not accept.
 * Arguments are always arrays; nothing is interpolated into a shell.
 */
export type Protocol = "codex-app-server" | "claude-stream" | "jsonl" | "text";
export type ModeLaunch = { args: string[]; env?: Record<string, string>; autonomous: boolean };
export type LaunchRequest = { prompt: string; model?: string; effort?: string; mode?: string; threadId?: string; directory: string; patchFile?: string };
/** A per-run configuration overlay written to a private temporary file (DeepSeek Harness `--patch`). */
export type RunPatch = { yaml: string; model: string };
export type ProviderAdapter = {
  id: BackgroundHarnessId;
  /** Executable names searched on PATH and in `extraDirs`, in order. */
  executableNames: string[];
  extraDirs: (platform: NodeJS.Platform) => string[];
  helpArgs: string[];
  /** Every string must appear in the help output for background use. */
  requiredHelp: string[];
  protocol: Protocol;
  promptVia: "stdin" | "arg";
  /** Modes offered to a human in ordinary handoffs (never a permission bypass). */
  modes: (help: string) => string[];
  /** The client's own unattended mode, used only by relays the user explicitly consented to run autonomously. */
  autonomousMode: (help: string) => string | null;
  /** Resolves a mode id to flags/environment; throws MODE_UNSUPPORTED for unknown ids. */
  mode: (id: string | undefined) => ModeLaunch;
  args: (request: LaunchRequest, mode: ModeLaunch) => string[];
  resume: (help: string) => boolean;
  model: (help: string) => boolean;
  /** No permission system at all: only usable in consented autonomous relays. */
  autonomyOnly?: boolean;
  /** Optional per-run overlay; its file path reaches `args` as `request.patchFile`. */
  patch?: (request: LaunchRequest) => RunPatch | null;
  /** Model suggestions known without a network call. */
  models?: () => { id: string; name: string; efforts: string[]; isDefault: boolean }[] | undefined;
};

/** Modes the application will never offer or pass, autonomous or not. */
export const FORBIDDEN_MODES = ["bypassPermissions", "dangerously-skip-permissions", "danger-full-access"];
export const CODEX_MODES = ["on-request", "never", "on-failure", "untrusted"];
export const CLAUDE_FALLBACK_MODES = ["default", "plan", "acceptEdits"];

/** Parse commander-style help text: `--flag <x> ... (choices: "a", "b")` or `(a, b, c)`. */
export function helpChoices(help: string, flag: string): string[] {
  const start = help.indexOf(flag);
  if (start < 0) return [];
  const window = help.slice(start, start + 600);
  const next = window.slice(flag.length).search(/\n\s*-{1,2}[a-zA-Z]/);
  const scope = next >= 0 ? window.slice(0, flag.length + next) : window;
  const choices = /choices:\s*([^)]*)\)/i.exec(scope) ?? /\(([^)]*)\)/.exec(scope.replace(/<[^>]*>/g, ""));
  if (!choices) return [];
  return choices[1]
    .split(",")
    .map((v) => v.trim().replace(/^["']|["']$/g, ""))
    .filter((v) => /^[\w-]+$/.test(v));
}

const unsupported = (id: string): never => {
  throw new Error(`MODE_UNSUPPORTED: ${id}`);
};
const guard = (id: string | undefined) => {
  if (id && FORBIDDEN_MODES.includes(id)) unsupported(id);
};
/** Static mode table: id → flags. Ids marked autonomous need explicit relay consent. */
function table(entries: Record<string, ModeLaunch>, fallback = "") {
  return (id: string | undefined): ModeLaunch => {
    guard(id);
    const key = id || fallback;
    if (!key) return { args: [], autonomous: false };
    return entries[key] ?? unsupported(key);
  };
}
const offered = (entries: Record<string, ModeLaunch>) => () => Object.entries(entries).filter(([, m]) => !m.autonomous).map(([id]) => id);
const home = () => os.homedir();
const userBin = (...parts: string[]) => () => [path.join(home(), ...parts)];

const claudeLike = (
  id: BackgroundHarnessId,
  names: string[],
  extra: { verbose?: boolean; partial?: boolean; effort?: boolean } = {},
): ProviderAdapter => ({
  id,
  executableNames: names,
  extraDirs: () => [],
  helpArgs: ["--help"],
  requiredHelp: ["stream-json"],
  protocol: "claude-stream",
  promptVia: "stdin",
  modes: (help) => {
    const reported = helpChoices(help, "--permission-mode");
    return (reported.length ? reported : CLAUDE_FALLBACK_MODES).filter((m) => !FORBIDDEN_MODES.includes(m));
  },
  autonomousMode: (help) => (helpChoices(help, "--permission-mode").includes("auto") ? "auto" : "acceptEdits"),
  mode: (mode) => {
    guard(mode);
    return { args: ["--permission-mode", mode || "default"], autonomous: false };
  },
  args: (r, mode) => [
    "-p",
    "--output-format",
    "stream-json",
    ...(extra.verbose === false ? [] : ["--verbose"]),
    ...(extra.partial ? ["--include-partial-messages"] : []),
    ...mode.args,
    ...(r.model ? ["--model", r.model] : []),
    ...(extra.effort && r.effort ? ["--effort", r.effort] : []),
    ...(r.threadId ? ["--resume", r.threadId] : []),
  ],
  resume: (help) => help.includes("--resume"),
  model: (help) => help.includes("--model"),
});

const CURSOR_MODES: Record<string, ModeLaunch> = {
  default: { args: [], autonomous: false },
  plan: { args: ["--mode", "plan"], autonomous: false },
  ask: { args: ["--mode", "ask"], autonomous: false },
  force: { args: ["--force", "--approve-mcps"], autonomous: true },
};
const KIMI_MODES: Record<string, ModeLaunch> = {
  default: { args: [], autonomous: false },
  plan: { args: ["--plan"], autonomous: false },
  "ask-when-needed": { args: ["--yolo"], autonomous: false },
  "never-ask": { args: ["--auto"], autonomous: true },
};
const DSH_MODES: Record<string, ModeLaunch> = {
  "workspace-write": { args: [], env: { DSH_PERMISSION_MODE: "workspace-write" }, autonomous: false },
  "read-only": { args: [], env: { DSH_PERMISSION_MODE: "read-only" }, autonomous: false },
};
const APPROVAL_MODES: Record<string, ModeLaunch> = {
  default: { args: ["--approval-mode", "default"], autonomous: false },
  auto_edit: { args: ["--approval-mode", "auto_edit"], autonomous: false },
  yolo: { args: ["--approval-mode", "yolo"], autonomous: true },
};
const QODER_MODES: Record<string, ModeLaunch> = {
  default: { args: [], autonomous: false },
  yolo: { args: ["--yolo"], autonomous: true },
};
const COPILOT_MODES: Record<string, ModeLaunch> = {
  default: { args: [], autonomous: false },
  "allow-all-tools": { args: ["--allow-all-tools"], autonomous: true },
};
const PI_MODES: Record<string, ModeLaunch> = { unrestricted: { args: [], autonomous: true } };

export const ADAPTERS: Record<BackgroundHarnessId, ProviderAdapter> = {
  codex: {
    id: "codex",
    executableNames: ["codex"],
    extraDirs: (platform) =>
      platform === "darwin"
        ? ["/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS"]
        : platform === "win32" && process.env.LOCALAPPDATA
          ? [path.join(process.env.LOCALAPPDATA, "Programs", "codex")]
          : [],
    helpArgs: ["app-server", "--help"],
    requiredHelp: ["--listen"],
    protocol: "codex-app-server",
    promptVia: "stdin",
    modes: () => CODEX_MODES,
    // Unattended Codex keeps the workspace sandbox; HAICoMo answers its approval requests (see shared/autonomy.ts).
    autonomousMode: () => "on-request",
    mode: (mode) => {
      guard(mode);
      if (mode && !CODEX_MODES.includes(mode)) unsupported(mode);
      return { args: [], autonomous: false };
    },
    args: () => ["app-server", "--listen", "stdio://"],
    resume: () => true,
    model: () => true,
  },
  claude: {
    ...claudeLike("claude", ["claude"], { partial: true, effort: true }),
    extraDirs: (platform) => (platform === "win32" && process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Programs", "claude")] : []),
  },
  cursor: {
    id: "cursor",
    executableNames: ["cursor-agent", "agent"],
    extraDirs: userBin(".local", "bin"),
    helpArgs: ["--help"],
    requiredHelp: ["Cursor Agent", "--output-format", "stream-json"],
    protocol: "claude-stream",
    promptVia: "arg",
    modes: offered(CURSOR_MODES),
    autonomousMode: () => "force",
    mode: table(CURSOR_MODES, "default"),
    args: (r, mode) => [
      "-p",
      "--output-format",
      "stream-json",
      ...mode.args,
      ...(r.model ? ["--model", r.model] : []),
      ...(r.threadId ? ["--resume", r.threadId] : []),
      "--workspace",
      r.directory,
      r.prompt,
    ],
    resume: (help) => help.includes("--resume"),
    model: (help) => help.includes("--model"),
  },
  "kimi-code": {
    id: "kimi-code",
    executableNames: ["kimi"],
    extraDirs: userBin(".kimi-code", "bin"),
    helpArgs: ["--help"],
    requiredHelp: ["--prompt", "stream-json"],
    protocol: "jsonl",
    promptVia: "arg",
    modes: offered(KIMI_MODES),
    autonomousMode: () => "never-ask",
    mode: table(KIMI_MODES, "default"),
    args: (r, mode) => [
      "--prompt",
      r.prompt,
      "--output-format",
      "stream-json",
      ...mode.args,
      ...(r.model ? ["--model", r.model] : []),
      ...(r.threadId ? ["--session", r.threadId] : []),
    ],
    resume: (help) => help.includes("--session"),
    model: (help) => help.includes("--model"),
  },
  "deepseek-harness": {
    id: "deepseek-harness",
    executableNames: ["dsh"],
    extraDirs: (platform) =>
      platform === "darwin"
        ? ["/Applications", path.join(home(), "Applications")].map((root) =>
            path.join(root, "DeepSeek Harness.app", "Contents", "Resources", "runtime", "cli", "bin"),
          )
        : platform === "win32" && process.env.LOCALAPPDATA
          ? [path.join(process.env.LOCALAPPDATA, "Programs", "DeepSeek Harness", "resources", "runtime", "cli", "bin")]
          : [],
    helpArgs: ["--profile", "headless", "--help"],
    requiredHelp: ["--json"],
    protocol: "jsonl",
    promptVia: "stdin",
    modes: offered(DSH_MODES),
    // The sandboxed preset is kept even unattended.
    autonomousMode: () => "workspace-write",
    mode: table(DSH_MODES, "workspace-write"),
    args: (r) => ["--profile", "headless", ...(r.patchFile ? ["--patch", r.patchFile] : []), "--json", ...(r.threadId ? ["--session-id", r.threadId] : []), "-"],
    resume: (help) => help.includes("--session-id"),
    model: () => true,
    patch: (r) => deepseekPatch(r.model),
    models: () => {
      const d = deepseekDesktopDefault();
      return d ? [{ id: d.model, name: `${d.model} (DeepSeek Harness default)`, efforts: [], isDefault: true }] : undefined;
    },
  },
  codebuddy: claudeLike("codebuddy", ["codebuddy"]),
  qoder: {
    id: "qoder",
    executableNames: ["qodercli"],
    extraDirs: () => [],
    helpArgs: ["--help"],
    requiredHelp: ["--print", "stream-json"],
    protocol: "jsonl",
    promptVia: "arg",
    modes: offered(QODER_MODES),
    autonomousMode: (help) => (help.includes("--yolo") ? "yolo" : null),
    mode: table(QODER_MODES, "default"),
    args: (r, mode) => ["--print", r.prompt, "--output-format", "stream-json", ...mode.args, ...(r.model ? ["--model", r.model] : [])],
    resume: () => false,
    model: (help) => help.includes("--model"),
  },
  "gemini-cli": approvalCli("gemini-cli", "gemini"),
  "qwen-code": approvalCli("qwen-code", "qwen"),
  opencode: {
    id: "opencode",
    executableNames: ["opencode"],
    extraDirs: userBin(".opencode", "bin"),
    helpArgs: ["run", "--help"],
    requiredHelp: ["--format"],
    protocol: "jsonl",
    promptVia: "arg",
    // OpenCode's permissions come from its own configuration file; HAICoMo passes no permission flags.
    modes: () => [],
    autonomousMode: () => null,
    mode: table({}),
    args: (r) => ["run", "--format", "json", ...(r.model ? ["--model", r.model] : []), ...(r.threadId ? ["--session", r.threadId] : []), r.prompt],
    resume: (help) => help.includes("--session"),
    model: (help) => help.includes("--model"),
  },
  "github-copilot": {
    id: "github-copilot",
    executableNames: ["copilot"],
    extraDirs: () => [],
    helpArgs: ["--help"],
    requiredHelp: ["--prompt", "--allow-all-tools"],
    protocol: "text",
    promptVia: "arg",
    modes: offered(COPILOT_MODES),
    autonomousMode: () => "allow-all-tools",
    mode: table(COPILOT_MODES, "default"),
    args: (r, mode) => ["--prompt", r.prompt, ...mode.args, ...(r.model ? ["--model", r.model] : []), ...(r.threadId ? ["--resume", r.threadId] : [])],
    resume: (help) => help.includes("--resume"),
    model: (help) => help.includes("--model"),
  },
  pi: {
    id: "pi",
    executableNames: ["pi"],
    extraDirs: () => [],
    helpArgs: ["--help"],
    requiredHelp: ["--print", "--mode"],
    protocol: "jsonl",
    promptVia: "arg",
    modes: offered(PI_MODES),
    autonomousMode: () => "unrestricted",
    mode: table(PI_MODES, "unrestricted"),
    args: (r) => ["--print", "--mode", "json", ...(r.model ? ["--model", r.model] : []), r.prompt],
    resume: () => false,
    model: (help) => help.includes("--model"),
    autonomyOnly: true,
  },
};
function approvalCli(id: "gemini-cli" | "qwen-code", name: string): ProviderAdapter {
  return {
    id,
    executableNames: [name],
    extraDirs: () => [],
    helpArgs: ["--help"],
    requiredHelp: ["--output-format", "stream-json", "--approval-mode"],
    protocol: "jsonl",
    promptVia: "arg",
    modes: offered(APPROVAL_MODES),
    autonomousMode: () => "yolo",
    mode: table(APPROVAL_MODES, "default"),
    args: (r, mode) => [
      "--prompt",
      r.prompt,
      "--output-format",
      "stream-json",
      ...mode.args,
      ...(r.model ? ["--model", r.model] : []),
      ...(r.threadId ? ["--resume", r.threadId] : []),
    ],
    resume: (help) => help.includes("--resume"),
    model: (help) => help.includes("--model"),
  };
}
const SAFE_ID = /^[\w.:/-]{1,100}$/;
const dshHome = () => process.env.DSH_HOME || path.join(home(), ".dsh");
/**
 * The model the DeepSeek Harness desktop app currently uses (its own patch layer),
 * read-only. Headless runs follow it when the step leaves the model empty, so they
 * use the user's account login instead of the API-key route.
 */
export function deepseekDesktopDefault(): { provider: string; model: string } | null {
  let text = "";
  try {
    text = fs.readFileSync(path.join(dshHome(), "profiles", "desktop", "cordis.patch.yml"), "utf8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*-\s*id:\s*["']?agent-default-model["']?\s*$/.test(l));
  if (start < 0) return null;
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*-\s*id:/.test(line)) break;
    block.push(line);
  }
  const value = (key: string) => block.map((l) => new RegExp(`^\\s+${key}:\\s*["']?([^"'#\\s]+)["']?\\s*(#.*)?$`).exec(l)?.[1]).find(Boolean);
  const provider = value("provider"), model = value("model");
  return provider && model && SAFE_ID.test(provider) && SAFE_ID.test(model) ? { provider, model } : null;
}
/** Overlay selecting the account route and model for one headless run; null keeps the profile's own default. */
export function deepseekPatch(requested?: string): RunPatch | null {
  const desktop = deepseekDesktopDefault();
  const model = requested || desktop?.model;
  if (!model) return null;
  if (!SAFE_ID.test(model)) throw new Error(`MODEL_UNSUPPORTED: ${model}`);
  const provider = desktop?.provider ?? "deepseek-account";
  return {
    model,
    yaml: [
      "# Written by HAICoMo for one headless run; deleted when the run ends.",
      "- id: agent-default-model",
      '  name: "@deepseek-ai/dsh-agent-default-model"',
      "  config:",
      `    provider: ${JSON.stringify(provider)}`,
      `    model: ${JSON.stringify(model)}`,
      "",
    ].join("\n"),
  };
}
export const adapterFor = (id: string): ProviderAdapter | undefined =>
  Object.prototype.hasOwnProperty.call(ADAPTERS, id) ? ADAPTERS[id as BackgroundHarnessId] : undefined;
export const evidenceOf = (id: BackgroundHarnessId) => BACKGROUND_EVIDENCE[id];
/** Windows CreateProcess limits the whole command line to 32,767 characters. */
export const WINDOWS_ARGV_PROMPT_LIMIT = 24000;

/**
 * Incremental state for line-delimited JSON CLIs whose event vocabularies differ
 * (Kimi `role` lines, DeepSeek `session/status/final`, Gemini/Qwen `message`
 * deltas, OpenCode `text` parts, Claude-style `assistant/result`). Unknown
 * events are ignored; completion is decided by the process exit code.
 */
export type JsonlState = { text: string; final: string | null; error: string; threadId?: string; model?: string };
export const newJsonlState = (): JsonlState => ({ text: "", final: null, error: "" });
const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c: any) => (typeof c === "string" ? c : c?.type === "text" || c?.type === "output_text" ? String(c.text ?? "") : ""))
      .join("");
  return "";
};
export function readJsonlEvent(state: JsonlState, m: any): { text?: boolean } {
  if (!m || typeof m !== "object") return {};
  const sid = m.session_id ?? m.sessionId ?? m.sessionID ?? m.thread_id ?? m.threadId ?? m.part?.sessionID;
  if (typeof sid === "string" && sid) state.threadId = sid;
  if (typeof m.model === "string" && m.model) state.model = m.model;
  const error = m.type === "error" ? m.error?.message ?? m.message ?? m.error : m.reason?.kind === "error" ? m.reason.error?.message ?? m.reason.error : m.is_error ? m.result ?? m.error : null;
  if (error) state.error = String(typeof error === "string" ? error : JSON.stringify(error)).slice(0, 4000);
  if (m.type === "final" && typeof m.text === "string") {
    state.final = m.text;
    return { text: true };
  }
  if (m.type === "result" && typeof m.result === "string" && !m.is_error) {
    state.final = m.result;
    return { text: true };
  }
  let piece = "";
  if (m.type === "assistant" && m.message) piece = textOf(m.message.content);
  else if (m.role === "assistant") piece = textOf(m.content);
  else if (m.type === "message" && m.role === "assistant") piece = textOf(m.content);
  else if (m.type === "text" && m.part) piece = String(m.part.text ?? "");
  if (!piece) return {};
  // Streaming deltas append; whole messages replace the running paragraph.
  state.text = m.delta ? state.text + piece : state.text ? `${state.text}\n${piece}` : piece;
  state.text = state.text.slice(-12000);
  return { text: true };
}
export const jsonlMessage = (state: JsonlState) => (state.final && state.final.trim() ? state.final : state.text);
