import { taskStatus, type Note, type ProjectState, type ProposalRecord, type Task } from "../shared/domain";
import { searchTerms } from "../shared/search";

// Pure overview-search logic: matching, ranking and highlighted excerpts.
export type SearchScope = "all" | "tasks" | "revisions" | "meetings";
export type Segment = { text: string; hit: boolean };
type HitBase = { id: string; title: Segment[]; snippet: Segment[]; updatedAt: string; titleHit: boolean };
export type TaskHit = HitBase & { kind: "task"; task: Task; status: ReturnType<typeof taskStatus>; archived: boolean };
export type NoteHit = HitBase & { kind: "meeting" | "note"; note: Note };
export type RevisionHit = HitBase & { kind: "revision"; record: ProposalRecord; status: ProposalRecord["status"] };
export type SearchHit = TaskHit | NoteHit | RevisionHit;
export { searchTerms };

const SNIPPET = 140;
const fold = (text: string) => text.toLowerCase();
const containsAll = (text: string, terms: string[]) => { const folded = fold(text); return terms.every((term) => folded.includes(fold(term))); };
const flat = (text: string) => text.replace(/\s+/gu, " ").trim();

/** Splits text into highlighted and plain segments for every occurrence of any term. */
export function highlight(text: string, terms: string[]): Segment[] {
  const folded = fold(text);
  // Case folding that changes length (rare scripts) would misalign offsets: show it unmarked.
  if (!text || folded.length !== text.length || !terms.length) return text ? [{ text, hit: false }] : [];
  const ranges: [number, number][] = [];
  for (const term of terms.map(fold)) {
    for (let at = folded.indexOf(term); term && at >= 0; at = folded.indexOf(term, at + term.length)) ranges.push([at, at + term.length]);
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}
/** A short excerpt centred on the first matching term. */
export function excerpt(text: string, terms: string[], length = SNIPPET): Segment[] {
  const value = flat(text);
  if (!value) return [];
  const folded = fold(value);
  const first = Math.min(...terms.map((term) => folded.indexOf(fold(term))).filter((i) => i >= 0), Number.POSITIVE_INFINITY);
  const start = Number.isFinite(first) ? Math.max(0, Math.min(first - 40, value.length - length)) : 0;
  const end = Math.min(value.length, start + length);
  return highlight(`${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`, terms);
}
/** Builds a hit when every term appears somewhere in the fields; the excerpt comes from the first body field that matches. */
function hit(title: string, body: string[], terms: string[]) {
  if (!containsAll([title, ...body].join("\n"), terms)) return null;
  const titleHit = terms.some((term) => fold(title).includes(fold(term)));
  const matching = body.find((field) => terms.some((term) => fold(field).includes(fold(term))));
  return { title: highlight(title, terms), snippet: excerpt(matching ?? body.find((field) => field.trim()) ?? "", terms), titleHit };
}
const rank = <T extends HitBase>(hits: T[]) => hits.sort((a, b) => Number(b.titleHit) - Number(a.titleHit) || b.updatedAt.localeCompare(a.updatedAt));

export function searchTasks(state: ProjectState, terms: string[]): TaskHit[] {
  if (!terms.length) return [];
  const hits: TaskHit[] = [];
  for (const task of state.tasks) {
    const found = hit(task.title, [task.description, task.handoff, ...task.artifacts.flatMap((a) => [a.label, a.path])], terms);
    if (found) hits.push({ ...found, kind: "task", id: task.id, task, status: taskStatus(task, state.tasks), archived: task.archived, updatedAt: task.updatedAt });
  }
  return rank(hits);
}
export function searchNotes(state: ProjectState, terms: string[], kind: Note["kind"]): NoteHit[] {
  if (!terms.length) return [];
  const hits: NoteHit[] = [];
  for (const note of state.notes) {
    if (note.kind !== kind) continue;
    const found = hit(note.title, [note.body], terms);
    if (found) hits.push({ ...found, kind, id: note.id, note, updatedAt: note.updatedAt });
  }
  return rank(hits);
}
/** Text values proposed in a revision, e.g. a changed task description or parameter. */
export function changeText(record: ProposalRecord): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") { if (value.trim()) out.push(value); }
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  for (const change of record.proposal.changes) walk(change.values);
  return out;
}
/** Revisions come pre-filtered from the database; this ranks and annotates them. */
export function revisionHits(records: ProposalRecord[], terms: string[]): RevisionHit[] {
  const hits: RevisionHit[] = [];
  for (const record of records) {
    const p = record.proposal;
    const fields = [p.reason, record.reviewNote, p.actor.name, ...changeText(record)];
    const titleHit = terms.some((term) => fold(p.title).includes(fold(term)));
    const matching = fields.find((field) => terms.some((term) => fold(field ?? "").includes(fold(term))));
    hits.push({ kind: "revision", id: p.proposalId, record, status: record.status, title: highlight(p.title, terms), snippet: excerpt(matching ?? p.reason ?? "", terms), titleHit, updatedAt: record.reviewedAt ?? record.receivedAt });
  }
  return hits;
}
export function searchLocal(state: ProjectState, query: string, scope: SearchScope) {
  const terms = searchTerms(query);
  return {
    terms,
    tasks: scope === "all" || scope === "tasks" ? searchTasks(state, terms) : [],
    meetings: scope === "all" || scope === "meetings" ? searchNotes(state, terms, "meeting") : [],
    // Ordinary notes are part of "Everything" only; there is no separate notes scope.
    notes: scope === "all" ? searchNotes(state, terms, "note") : [],
  };
}
