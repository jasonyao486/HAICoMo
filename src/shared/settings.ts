import { z } from "zod";
import type { Settings } from "./domain";
import { HARNESS_IDS } from "./clients";

export const characters = (value: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((s) => s.segment);
export function initials(name = "", override = "") {
  if (override.trim()) return characters(override.trim()).slice(0, 4);
  const words = name.trim().split(/[\s\-]+/u).filter(Boolean);
  return words.flatMap((w) => /\p{Script=Han}/u.test(w) ? characters(w) : characters(w).slice(0, 1)).map((s) => s.toLocaleUpperCase()).flatMap(characters).slice(0, 4);
}
export const settingsSchema = z.object({
  userName: z.string().trim().max(200).default(""),
  avatarInitials: z.string().trim().refine((v) => characters(v).length <= 4 && !/[\r\n\t]/.test(v), "INITIALS_TOO_LONG").default(""),
  locale: z.enum(["en-US", "en-GB", "zh-CN", "zh-TW"]),
  theme: z.enum(["light", "dark", "system"]),
  enhanced: z.boolean(), reducedMotion: z.boolean(),
  accent: z.string().regex(/^#[\da-fA-F]{6}$/),
  codexPath: z.string(), claudePath: z.string(),
  clientPaths: z.partialRecord(z.enum(HARNESS_IDS), z.string()).default({}),
  updateFeed: z.string().default(""),
}).strict();
export const defaultSettings: Settings = { userName: "", avatarInitials: "", locale: "zh-CN", theme: "light", enhanced: false, reducedMotion: false, accent: "#347965", codexPath: "", claudePath: "", clientPaths: {}, updateFeed: "" };
const preferenceKeys = ["userName", "avatarInitials", "locale", "theme", "enhanced", "reducedMotion", "accent", "updateFeed"] as const;
const editSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preference"), key: z.enum(preferenceKeys), before: z.union([z.string(), z.boolean()]), after: z.union([z.string(), z.boolean()]) }).strict(),
  z.object({ kind: z.literal("path"), key: z.enum(HARNESS_IDS), before: z.string(), after: z.string() }).strict(),
]);
type SettingsEdit = z.infer<typeof editSchema>;
export function settingsEdits(base: Settings, next: Settings): SettingsEdit[] {
  const edits: SettingsEdit[] = [];
  for (const key of preferenceKeys) if ((base[key] ?? "") !== (next[key] ?? "")) edits.push({ kind: "preference", key, before: base[key] ?? "", after: next[key] ?? "" });
  for (const key of HARNESS_IDS) if ((base.clientPaths[key] ?? "") !== (next.clientPaths[key] ?? "")) edits.push({ kind: "path", key, before: base.clientPaths[key] ?? "", after: next.clientPaths[key] ?? "" });
  return edits;
}
export function applySettingsEdits(current: Settings, input: unknown) {
  const edits = z.array(editSchema).max(18).parse(input), base = structuredClone(current), next = structuredClone(current), seen = new Set<string>();
  for (const edit of edits) {
    const id = `${edit.kind}:${edit.key}`;
    if (seen.has(id)) throw new Error("SETTINGS_CONFLICT"); seen.add(id);
    if (edit.kind === "path") { base.clientPaths[edit.key] = edit.before; next.clientPaths[edit.key] = edit.after; }
    else { (base as any)[edit.key] = edit.before; (next as any)[edit.key] = edit.after; }
  }
  return mergeSettings(current, settingsSchema.parse(base), settingsSchema.parse(next));
}

// Compare only edited fields, including each individual client path. A stale
// form may save an unrelated field, but cannot silently replace a newer value.
export function mergeSettings(current: Settings, base: Settings, next: Settings): Settings {
  const result = structuredClone(current);
  for (const key of preferenceKeys) {
    if ((base[key] ?? "") === (next[key] ?? "")) continue;
    if ((current[key] ?? "") !== (base[key] ?? "") && current[key] !== next[key]) throw new Error("SETTINGS_CONFLICT");
    (result as any)[key] = next[key];
  }
  for (const key of HARNESS_IDS) {
    const before = base.clientPaths[key] ?? "", after = next.clientPaths[key] ?? "", actual = current.clientPaths[key] ?? "";
    if (before === after) continue;
    if (actual !== before && actual !== after) throw new Error("SETTINGS_CONFLICT");
    result.clientPaths[key] = after;
  }
  result.codexPath = result.clientPaths.codex ?? "";
  result.claudePath = result.clientPaths.claude ?? "";
  return settingsSchema.parse(result);
}
