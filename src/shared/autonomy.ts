/**
 * Unattended ("autonomous") relay support. A relay owner may consent, per
 * relay, to let agents run in their own unattended modes and to let HAICoMo
 * answer agent questions with the recommended option. Every automatic answer
 * is recorded; anything only a human can provide (free-text answers such as a
 * verification code) is left waiting for the human.
 */
export type AutoDecision = {
  question: string;
  options: string[];
  choice: string;
  reason: "recommended" | "first-option" | "approved" | "destructive";
};
export type AutoOutcome =
  | { kind: "answer"; result: unknown; allow: boolean; answers?: Record<string, { answers: string[] }>; decisions: AutoDecision[] }
  | { kind: "human"; reason: "FREE_TEXT_QUESTION" | "UNSUPPORTED_REQUEST"; question: string };

const RECOMMENDED = /\((recommended|推荐|推薦|建议|建議)\)|\brecommended\b|推荐|推薦/i;
const text = (value: unknown) => (typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value));
const short = (value: string, max = 2000) => (value.length > max ? `${value.slice(0, max)}…` : value);

/** Commands HAICoMo never approves on the user's behalf, even in an autonomous relay. */
const DESTRUCTIVE: RegExp[] = [
  /(^|[\s;&|(])sudo\b/,
  /\bmkfs(\.\w+)?\b/,
  /\bdiskutil\s+(erase\w*|zeroDisk|secureErase|partitionDisk|reformat)/i,
  /\bdd\b[^|;&]*\bof=\/dev\//,
  /(^|[\s;&|])(shutdown|reboot|halt|poweroff)\b/,
  /\bgit\s+push\b[^|;&]*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bchmod\s+-R\s+[0-7]{3,4}\s+\/(\s|$)/,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /\bformat\s+[a-z]:/i,
  /\bRemove-Item\b[^|;&]*-Recurse\b[^|;&]*\s([A-Z]:\\|\\\\|~)/i,
];
/** `rm -r…` that reaches outside the project directory (absolute, home or parent paths). */
function removesOutside(command: string, directory: string) {
  const root = directory.replace(/[\\/]+$/, "");
  for (const segment of command.split(/[;&|]+/)) {
    const words = segment.trim().split(/\s+/);
    const at = words.findIndex((w) => w === "rm" || w.endsWith("/rm"));
    if (at < 0) continue;
    const args = words.slice(at + 1);
    if (!args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === "--recursive")) continue;
    for (const raw of args.filter((a) => !a.startsWith("-"))) {
      const a = raw.replace(/^["']|["']$/g, "");
      if (/^(~|\$HOME|\$\{HOME\})/.test(a) || a === ".." || a.startsWith("../") || a === "*" || a === "/*") return true;
      if (a.startsWith("/") && a !== root && !a.startsWith(`${root}/`)) return true;
    }
  }
  return false;
}
export function isDestructiveCommand(command: string, directory: string) {
  return DESTRUCTIVE.some((pattern) => pattern.test(command)) || removesOutside(command, directory);
}
const commandOf = (params: any) => {
  const c = params?.command ?? params?.parsedCmd ?? params?.cmd;
  return Array.isArray(c) ? c.join(" ") : text(c);
};

/** Decide one Codex app-server server request for an autonomous relay run. */
export function autoDecide(method: string, params: any, directory: string): AutoOutcome {
  if (method === "item/tool/requestUserInput" || method === "tool/requestUserInput") {
    const questions: any[] = Array.isArray(params?.questions) ? params.questions : [];
    const decisions: AutoDecision[] = [];
    const answers: Record<string, { answers: string[] }> = {};
    for (const q of questions) {
      const options: string[] = (Array.isArray(q?.options) ? q.options : []).map((o: any) => text(o?.label ?? o)).filter(Boolean);
      const question = short([q?.header, q?.question].map(text).filter(Boolean).join(" · "));
      if (!options.length || !q?.id) return { kind: "human", reason: "FREE_TEXT_QUESTION", question };
      const recommended = options.find((o, i) => RECOMMENDED.test(o) || RECOMMENDED.test(text(q.options[i]?.description)));
      const choice = recommended ?? options[0];
      answers[String(q.id)] = { answers: [choice] };
      decisions.push({ question, options, choice, reason: recommended ? "recommended" : "first-option" });
    }
    if (!questions.length) return { kind: "human", reason: "FREE_TEXT_QUESTION", question: short(text(params)) };
    return { kind: "answer", result: { answers }, allow: true, answers, decisions };
  }
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
    const command = commandOf(params);
    const subject = short(command || [params?.reason, params?.grantRoot, params?.path].map(text).filter(Boolean).join(" · ") || method);
    const destructive = method === "item/commandExecution/requestApproval" && isDestructiveCommand(command, directory);
    return {
      kind: "answer",
      result: { decision: destructive ? "decline" : "accept" },
      allow: !destructive,
      decisions: [{ question: subject, options: ["accept", "decline"], choice: destructive ? "decline" : "accept", reason: destructive ? "destructive" : "approved" }],
    };
  }
  return { kind: "human", reason: "UNSUPPORTED_REQUEST", question: short(`${method}: ${text(params)}`) };
}

export const DECISIONS_BEGIN = "HAICOMO-DECISIONS-BEGIN";
export const DECISIONS_END = "HAICOMO-DECISIONS-END";
export const NEEDS_HUMAN = "HAICOMO-NEEDS-HUMAN:";
/** Decisions an agent reports about itself; unverified by HAICoMo. */
export function selfReportedDecisions(message: string): { question: string; options: string; choice: string; reason: string }[] {
  const start = message.lastIndexOf(DECISIONS_BEGIN);
  if (start < 0) return [];
  const end = message.indexOf(DECISIONS_END, start);
  const block = message.slice(start + DECISIONS_BEGIN.length, end < 0 ? undefined : end);
  return block
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, "").replace(/^`|`$/g, ""))
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => {
      const [question = "", options = "", choice = "", ...reason] = line.replace(/\s*\|\s*$/, "").split(/\s+\|\s+/);
      return { question: short(question, 500), options: short(options, 500), choice: short(choice, 300), reason: short(reason.join(" | "), 500) };
    });
}
/** What the agent said only a human can do, if it stopped for that reason. */
export function needsHuman(message: string | undefined): string | null {
  if (!message) return null;
  const at = message.lastIndexOf(NEEDS_HUMAN);
  if (at < 0) return null;
  return message.slice(at + NEEDS_HUMAN.length).split(/\r?\n/)[0].trim().slice(0, 500) || "?";
}
