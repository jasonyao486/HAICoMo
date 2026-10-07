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
  "external",
] as const;
export const clientName = (id: string) =>
  CLIENTS.find((c) => c.id === id)?.name ?? id;
export const clientActor = (id: string) => `client:${id}` as const;
export const isClientActor = (id: string) => id.startsWith("client:");
export const clientIcon = (id: string) =>
  `/local-assets/${id === "codex" ? "chatgpt-logo.svg" : id === "claude" ? "claude-logo.svg" : `${id}-app.svg`}`;
