import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Note, ProposalRecord, Task, Workspace } from "../shared/domain";
import { useApi, useTab } from "./api";
import { errorText } from "./errors";
import { formatDate, type Key, type Translate } from "./i18n";
import { revisionHits, searchLocal, searchTerms, type SearchHit, type SearchScope, type Segment } from "./search-model";

const SCOPES: [SearchScope, Key][] = [["all", "searchScopeAll"], ["tasks", "searchScopeTasks"], ["revisions", "searchScopeRevisions"], ["meetings", "searchScopeMeetings"]];
const KIND_LABEL: Record<SearchHit["kind"], Key> = { task: "searchKindTask", revision: "searchKindRevision", meeting: "searchKindMeeting", note: "searchKindNote" };
const GROUP_LIMIT = 5, REVISION_LIMIT = 50;
const isMac = () => /Mac/i.test(navigator.platform || navigator.userAgent);

function Marked({ segments }: { segments: Segment[] }) {
  return <>{segments.map((s, i) => s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>)}</>;
}
type Revisions = { items: ProposalRecord[]; total: number; error: string; loading: boolean };

/** Keyword search across tasks, revisions, meetings and notes on the project overview. */
export function ProjectSearch({ workspace, t, onOpenTask, onOpenNote, onOpenProposal }: { workspace: Workspace; t: Translate; onOpenTask: (task: Task) => void; onOpenNote: (note: Note) => void; onOpenProposal: (record: ProposalRecord) => void }) {
  const { api } = useApi();
  const { active } = useTab();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""), [scope, setScope] = useState<SearchScope>("all"), [notesExpanded, setNotesExpanded] = useState(false);
  const deferred = useDeferredValue(query);
  const local = useMemo(() => searchLocal(workspace.state, deferred, scope), [workspace.state, deferred, scope]);
  const [revisions, setRevisions] = useState<Revisions>({ items: [], total: 0, error: "", loading: false });
  const wantsRevisions = scope === "all" || scope === "revisions";
  // Revisions live in the database (the overview only holds the latest 50), so they are queried.
  useEffect(() => {
    if (!wantsRevisions || !searchTerms(query).length) { setRevisions({ items: [], total: 0, error: "", loading: false }); return; }
    let cancelled = false;
    setRevisions((r) => ({ ...r, loading: true }));
    const timer = setTimeout(() => {
      void api("project.proposals", { search: query, pageSize: scope === "revisions" ? REVISION_LIMIT : GROUP_LIMIT * 4 })
        .then((result) => { if (!cancelled) setRevisions({ items: result.items, total: result.total, error: "", loading: false }); })
        .catch((e) => { if (!cancelled) setRevisions({ items: [], total: 0, error: errorText(e, t), loading: false }); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, scope, wantsRevisions, workspace.state.id, workspace.metrics.totalProposals, workspace.metrics.pendingProposals, workspace.state.revision]);
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      // An open dialog keeps the keyboard; inactive tabs close theirs.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f" && !document.querySelector("dialog[open]")) { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active]);
  useEffect(() => setNotesExpanded(false), [deferred, scope]);
  const terms = local.terms;
  const revisionList = useMemo(() => revisionHits(revisions.items, terms), [revisions.items, terms]);
  const groups: { kind: SearchHit["kind"]; scope?: SearchScope; label: Key; items: SearchHit[]; total: number }[] = [
    { kind: "task", scope: "tasks", label: "searchScopeTasks", items: local.tasks, total: local.tasks.length },
    { kind: "revision", scope: "revisions", label: "searchScopeRevisions", items: revisionList, total: revisions.total },
    { kind: "meeting", scope: "meetings", label: "searchScopeMeetings", items: local.meetings, total: local.meetings.length },
    { kind: "note", label: "searchKindNote", items: local.notes, total: local.notes.length },
  ];
  const shown = groups.filter((g) => g.items.length);
  const open = (h: SearchHit) => h.kind === "task" ? onOpenTask(h.task) : h.kind === "revision" ? onOpenProposal(h.record) : onOpenNote(h.note);
  const meta = (h: SearchHit) => {
    const status = h.kind === "task" ? (h.archived ? t("searchArchived") : t(h.status)) : h.kind === "revision" ? t(h.status === "pending" ? "pending" : h.status) : "";
    return [status, formatDate(h.updatedAt, t.locale)].filter(Boolean).join(" · ");
  };
  const total = groups.reduce((n, g) => n + g.total, 0);
  return <section className="project-search" role="search" aria-label={t("projectSearch")}>
    <div className="project-search-bar">
      <Search size={18} aria-hidden="true" />
      <input ref={input} type="search" value={query} aria-label={t("projectSearch")} placeholder={t("projectSearchPlaceholder")} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { if (query) { e.preventDefault(); setQuery(""); } else input.current?.blur(); } }} />
      {query ? <button className="icon-button" aria-label={t("searchClear")} title={t("searchClear")} onClick={() => { setQuery(""); input.current?.focus(); }}><X size={15} /></button>
        : <kbd title={t("searchShortcut")}>{isMac() ? "⌘F" : "Ctrl F"}</kbd>}
    </div>
    <div className="search-scopes" role="group" aria-label={t("searchScope")}>
      {SCOPES.map(([value, key]) => <button key={value} className={scope === value ? "selected" : ""} aria-pressed={scope === value} onClick={() => setScope(value)}>{t(key)}</button>)}
    </div>
    {terms.length > 0 && <div className="search-results" aria-label={t("searchResults")} aria-busy={revisions.loading}>
      <p className="search-summary" role="status">{total} {t("searchResultCount")}</p>
      {shown.map((g) => {
        const limit = scope === "all" ? (g.kind === "note" && notesExpanded ? g.items.length : GROUP_LIMIT) : g.items.length;
        return <section key={g.kind} className="search-group">
          <h3>{t(g.label)} <small>{g.total}</small></h3>
          <ul>{g.items.slice(0, limit).map((h) => <li key={`${h.kind}:${h.id}`}>
            <button className="search-hit" onClick={() => open(h)}>
              <span className={`search-kind ${h.kind}`}>{t(KIND_LABEL[h.kind])}</span>
              <span className="search-hit-main"><strong><Marked segments={h.title} /></strong>{h.snippet.length > 0 && <small><Marked segments={h.snippet} /></small>}</span>
              <span className="search-hit-meta">{meta(h)}</span>
            </button>
          </li>)}</ul>
          {scope === "all" && g.total > GROUP_LIMIT && (g.scope
            ? <button className="link" onClick={() => setScope(g.scope!)}>{t("searchShowAll")} {g.total} {t("searchResultCount")}</button>
            : !notesExpanded && <button className="link" onClick={() => setNotesExpanded(true)}>{t("searchShowAll")} {g.total} {t("searchResultCount")}</button>)}
          {g.kind === "revision" && scope === "revisions" && g.total > REVISION_LIMIT && <p className="search-hint">{t("searchRefine")}</p>}
        </section>;
      })}
      {wantsRevisions && revisions.error && <p className="search-hint error-text" role="alert">{t("searchRevisionError")} {revisions.error}</p>}
      {!shown.length && !revisions.loading && <p className="search-empty">{t("searchNoResults")}: “{query.trim()}”</p>}
    </div>}
  </section>;
}
