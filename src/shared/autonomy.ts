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
  if (method === "acp/request_permission") {
    const call = params?.toolCall ?? {};
    const options: any[] = Array.isArray(params?.options) ? params.options : [];
    const kind = (o: any) => String(o?.kind ?? "");
    const command = commandOf(call.rawInput) || (call.kind === "execute" ? text(call.title) : "");
    const subject = short(command || [call.title, ...(Array.isArray(call.locations) ? call.locations.map((l: any) => l?.path) : [])].map(text).filter(Boolean).join(" · ") || method);
    const destructive = (command !== "" && isDestructiveCommand(command, directory)) || (call.kind === "delete" && outsideProject(call.locations, directory));
    // Never "always": a remembered rule would outlive this relay. Without a one-time option the human decides.
    const pick = destructive ? options.find((o) => kind(o) === "reject_once") ?? options.find((o) => kind(o) === "reject_always") : options.find((o) => kind(o) === "allow_once");
    if (!pick) return { kind: "human", reason: "UNSUPPORTED_REQUEST", question: subject };
    return {
      kind: "answer",
      result: { outcome: { outcome: "selected", optionId: pick.optionId } },
      allow: !destructive,
      answers: { optionId: pick.optionId },
      decisions: [{ question: subject, options: options.map((o) => text(o?.name ?? o?.optionId)), choice: text(pick.name ?? pick.optionId), reason: destructive ? "destructive" : "approved" }],
    };
  }
  if (method === "claude/can_use_tool") {
    const tool = text(params?.tool_name);
    const input = params?.input ?? {};
    // A prompt the user's own ask rule forced, or one that must be answered on the card itself, stays with the human.
    if (params?.requires_user_interaction || params?.matched_ask_rule) return { kind: "human", reason: "UNSUPPORTED_REQUEST", question: short(`${tool}: ${text(input)}`) };
    const command = tool === "Bash" ? text(input.command) : "";
    const file = text(input.file_path ?? input.notebook_path ?? "");
    const destructive = (command !== "" && isDestructiveCommand(command, directory)) || (file !== "" && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && outsideProject([{ path: file }], directory));
    const subject = short(command || [tool, file].filter(Boolean).join(" · "));
    return {
      kind: "answer",
      result: destructive ? { behavior: "deny" } : { behavior: "allow" },
      allow: !destructive,
      decisions: [{ question: subject, options: ["allow", "deny"], choice: destructive ? "deny" : "allow", reason: destructive ? "destructive" : "approved" }],
    };
  }
  return { kind: "human", reason: "UNSUPPORTED_REQUEST", question: short(`${method}: ${text(params)}`) };
}
/** Any absolute path outside the project directory (relative paths stay inside it). */
function outsideProject(locations: unknown, directory: string) {
  const root = directory.replace(/[\\/]+$/, "");
  const norm = (p: string) => p.replace(/\\/g, "/");
  return (Array.isArray(locations) ? locations : []).some((l: any) => {
    const p = typeof l?.path === "string" ? norm(l.path) : "";
    if (!p || !(p.startsWith("/") || /^[a-z]:\//i.test(p))) return false;
    const r = norm(root);
    return p !== r && !p.toLowerCase().startsWith(`${r.toLowerCase()}/`);
  });
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
/**
 * Failures only the human can fix: an expired sign-in, a missing credential or an
 * exhausted quota. Matched on the failed run's output; returns the matching line.
 */
const HUMAN_BLOCKERS = [
  /authentication required/i,
  /not (?:logged|signed) in/i,
  /please (?:run )?[`'"]?[\w-]+ login/i,
  /\b(?:log|sign) ?in (?:required|again|first)/i,
  /\bunauthori[sz]ed\b/i,
  /\b401\b[^\n]*(?:unauthori[sz]ed|auth)/i,
  /MISSING_CREDENTIAL|missing credential|no api key/i,
  /(?:monthly )?usage limit|quota (?:exceeded|exhausted|reached)|insufficient (?:balance|quota|credit)/i,
  /(?:token|session|credential)s? (?:has )?(?:expired|invalid|revoked)/i,
];
export function humanBlocker(message: string | undefined): string | null {
  if (!message) return null;
  for (const line of message.split(/\r?\n/)) if (HUMAN_BLOCKERS.some((p) => p.test(line))) return line.trim().slice(0, 300);
  return null;
}


export const HANDOFF_BEGIN = "HAICOMO-HANDOFF-BEGIN";
export const HANDOFF_END = "HAICOMO-HANDOFF-END";
/** The delivery record an agent writes about its own work; unverified by HAICoMo. */
export type HandoffRecord = { goal: string; artifacts: string[]; evidence: string; next: string; open: string };
const HANDOFF_KEYS: Record<string, keyof HandoffRecord> = {
  goal: "goal", 目标: "goal", 目標: "goal",
  artifacts: "artifacts", artifact: "artifacts", 产物: "artifacts", 產物: "artifacts",
  evidence: "evidence", 证据: "evidence", 證據: "evidence",
  next: "next", "next step": "next", "next steps": "next", 下一步: "next",
  open: "open", "open questions": "open", 未决问题: "open", 未決問題: "open",
};
/** Parses the last HAICOMO-HANDOFF block of a final message; null when there is none. */
export function structuredHandoff(message: string | undefined): HandoffRecord | null {
  if (!message) return null;
  const start = message.lastIndexOf(HANDOFF_BEGIN);
  if (start < 0) return null;
  const end = message.indexOf(HANDOFF_END, start);
  const block = message.slice(start + HANDOFF_BEGIN.length, end < 0 ? undefined : end);
  const fields: Record<keyof HandoffRecord, string> = { goal: "", artifacts: "", evidence: "", next: "", open: "" };
  let current: keyof HandoffRecord | null = null;
  for (const raw of block.split(/\r?\n/).slice(0, 80)) {
    const line = raw.trim().replace(/^[-*]\s*/, "").replace(/^`|`$/g, "");
    if (!line) continue;
    const m = /^([^:：]{1,20})\s*[:：]\s*(.*)$/.exec(line);
    const key = m ? HANDOFF_KEYS[m[1].trim().toLowerCase()] : undefined;
    if (key) {
      current = key;
      fields[key] = m![2].trim();
    } else if (current) fields[current] = `${fields[current]}\n${line}`.trim();
  }
  if (!Object.values(fields).some(Boolean)) return null;
  const artifacts = fields.artifacts
    .split(/[;\n；]/)
    .map((p) => p.trim().replace(/^`|`$/g, ""))
    .filter((p) => p && !/^(none|无|無|n\/a|-)$/i.test(p))
    .slice(0, 30)
    .map((p) => short(p, 500));
  return { goal: short(fields.goal, 2000), artifacts, evidence: short(fields.evidence, 2000), next: short(fields.next, 2000), open: short(fields.open, 2000) };
}
/** The message without its delivery-record block, so an excerpt does not repeat what is already structured. */
export function withoutHandoff(message: string): string {
  const start = message.lastIndexOf(HANDOFF_BEGIN);
  if (start < 0) return message;
  const end = message.indexOf(HANDOFF_END, start);
  return `${message.slice(0, start)}${end < 0 ? "" : message.slice(end + HANDOFF_END.length)}`.trimEnd();
}
