/** Client identity is independent of the model a session happens to use. */
export const CLIENTS = [
  {
    id: "codex",
    name: "Codex",
    commands: ["codex"],
    apps: ["Codex.app", "ChatGPT.app"],
    site: "https://learn.chatgpt.com/docs/app-server",
  },
  {
    id: "claude",
    name: "Claude Code",
    commands: ["claude"],
    apps: ["Claude.app"],
    site: "https://code.claude.com/docs/en/headless",
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    commands: [],
    apps: ["WorkBuddy.app"],
    site: "https://www.codebuddy.cn/work/",
  },
  { id: "pi", name: "Pi", commands: ["pi"], apps: [], site: "https://pi.dev/" },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    commands: ["copilot"],
    apps: [],
    site: "https://github.com/features/copilot",
  },
  {
    id: "opencode",
    name: "OpenCode",
    commands: ["opencode"],
    apps: ["OpenCode.app", "opencode.app"],
    site: "https://opencode.ai/",
  },
  {
    id: "cursor",
    name: "Cursor",
    commands: ["cursor-agent", "agent", "cursor"],
    apps: ["Cursor.app"],
    site: "https://cursor.com/",
  },
  {
    id: "trae",
    name: "TRAE",
    commands: ["trae", "trae-cn"],
    apps: ["Trae.app", "Trae CN.app"],
    site: "https://www.trae.cn/",
  },
  {
    id: "qoder",
    name: "Qoder CN",
    commands: ["qoder", "qodercli"],
    apps: ["Qoder.app", "Qoder CN.app"],
    site: "https://qoder.com/",
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    commands: ["codebuddy"],
    apps: ["CodeBuddy.app", "CodeBuddy CN.app"],
    site: "https://www.codebuddy.cn/",
  },
  {
    id: "kimi-code",
    name: "Kimi",
    commands: ["kimi"],
    apps: ["Kimi.app"],
    site: "https://www.kimi.com/",
  },
  {
    id: "grok-bot",
    name: "Grok Bot",
    commands: ["grok"],
    apps: ["Grok Bot.app"],
    site: "https://x.ai/",
  },
  {
    id: "deepseek-harness",
    name: "DeepSeek Harness",
    commands: ["dsh"],
    apps: ["DeepSeek Harness.app"],
    site: "https://www.deepseek.com/",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    commands: ["gemini"],
    apps: [],
    site: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "qwen-code",
    name: "Qwen Code",
    commands: ["qwen"],
    apps: [],
    site: "https://github.com/QwenLM/qwen-code",
  },
] as const;
export type HarnessId = (typeof CLIENTS)[number]["id"] | "external";
export const HARNESS_IDS = [
  "codex",
  "claude",
  "workbuddy",
  "pi",
  "github-copilot",
  "opencode",
  "cursor",
  "trae",
  "qoder",
  "codebuddy",
  "kimi-code",
  "grok-bot",
  "deepseek-harness",
  "gemini-cli",
  "qwen-code",
  "external",
] as const;
/**
 * How a client can be launched in the background, and how strongly that path
 * has been verified: "verified" = real sessions completed through HAICoMo
 * (Codex and Claude in earlier releases; Cursor and DeepSeek Harness in 0.5.0);
 * "local" = flags and error paths checked against the CLI installed on the
 * development Mac (success path still needs the user's account);
 * "documented" = adapted from the vendor's published headless flags only.
 * Clients without an entry are manual handoff only (open app / copy prompt).
 */
export const BACKGROUND_EVIDENCE = {
  codex: "verified",
  claude: "verified",
  cursor: "verified",
  "kimi-code": "local",
  "deepseek-harness": "verified",
  codebuddy: "documented",
  qoder: "documented",
  "gemini-cli": "documented",
  "qwen-code": "documented",
  opencode: "documented",
  "github-copilot": "documented",
  pi: "documented",
} as const satisfies Partial<Record<string, "verified" | "local" | "documented">>;
export type BackgroundHarnessId = keyof typeof BACKGROUND_EVIDENCE;
export const BACKGROUND_HARNESS_IDS = Object.keys(BACKGROUND_EVIDENCE) as BackgroundHarnessId[];
export const isBackgroundHarness = (id: string): id is BackgroundHarnessId =>
  Object.prototype.hasOwnProperty.call(BACKGROUND_EVIDENCE, id);
export const clientName = (id: string) =>
  CLIENTS.find((c) => c.id === id)?.name ?? id;
export const clientActor = (id: string) => `client:${id}` as const;
export const isClientActor = (id: string) => id.startsWith("client:");
// Client marks shipped in assets/runtime/local-assets (see assets/manifest.json).
const CLIENT_ICON_FILES: Record<string, string> = {
  codex: "chatgpt-logo.svg",
  claude: "claude-logo.svg",
  workbuddy: "workbuddy-app.png",
  "kimi-code": "kimi-logo.svg",
  "grok-bot": "grok-logo.svg",
  "deepseek-harness": "deepseek-logo.svg",
  "gemini-cli": "gemini-logo.svg",
  "qwen-code": "qwen-logo.svg",
};
export const clientIcon = (id: string) =>
  `/local-assets/${CLIENT_ICON_FILES[id] ?? `${id}-app.svg`}`;
