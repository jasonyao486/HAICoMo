import type { Capabilities } from "./domain";
/** Effort values valid for a provider/model pair (Codex: per model; Claude: provider-wide). */
export function capabilityEfforts(cap: Capabilities | undefined, model?: string): string[] {
  if (!cap) return [];
  if (cap.provider === "claude") return cap.efforts ?? [];
  return cap.models?.find((m) => (model ? m.id === model : m.isDefault))?.efforts ?? [];
}
/** Known operating-mode identifiers mapped to resource keys; unknown ids are shown verbatim. */
export const MODE_LABEL_KEYS: Record<string, string> = {
  default: "modeDefault",
  manual: "modeManual",
  plan: "modePlan",
  acceptEdits: "modeAcceptEdits",
  auto: "modeAuto",
  dontAsk: "modeDontAsk",
  "on-request": "modeOnRequest",
  never: "modeNever",
  "on-failure": "modeOnFailure",
  untrusted: "modeUntrusted",
};
/** Visible terminal flags that mirror a background mode/effort choice. */
export function modeArguments(provider: string, mode: string, effort: string): string[] {
  if (provider === "claude") return [...(mode ? ["--permission-mode", mode] : []), ...(effort ? ["--effort", effort] : [])];
  if (provider === "codex") return [...(mode ? ["-a", mode] : []), ...(effort ? ["-c", `model_reasoning_effort=${JSON.stringify(effort)}`] : [])];
  return [];
}
