import { ActivitySummary, ActivityTasks, ActivityPeople } from "./Activity";
import { useEffect, useState } from "react";
import { CLIENTS, clientName } from "../shared/clients";
import type { Audit, ProposalRecord, Workspace } from "../shared/domain";
import { useApi, useTab, useDirty } from "./api";
import { Avatar, Badge, Empty, Modal } from "./components";
import type { Translate } from "./i18n";
import { errorText } from "./errors";

export function Records({
  kind,
  workspace,
  t,
  onReview,
}: {
  kind: "proposals" | "audit";
  workspace: Workspace;
  t: Translate;
  onReview: (p: ProposalRecord) => void;
}) {
  const { api, command } = useApi();
  const [deleting, setDeleting] = useState<Audit | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    author: "",
    harnessId: "all",
    taskId: "all",
    search: "",
  });
  const [page, setPage] = useState(0),
    [data, setData] = useState<{
      items: any[];
      total: number;
      pageSize: number;
    }>({ items: [], total: 0, pageSize: 30 });
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const set = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  useEffect(() => {
    setPage(0);
    setDeleting(null);
  }, [kind, workspace.state.id]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void api(`project.${kind}`, { ...filters, page, pageSize: 30 })
        .then((result) => {
          if (cancelled) return;
          if (page && !result.items.length) {
            setPage(Math.max(0, Math.floor((result.total - 1) / 30)));
            return;
          }
          setData(result);
          setError("");
        })
        .catch((e) => {
          if (!cancelled) setError(errorText(e, t));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Refetch on real record changes, not on every telemetry-driven workspace object.
  }, [kind, workspace.state.id, workspace.state.revision, workspace.metrics.auditEntries, workspace.metrics.totalProposals, workspace.metrics.pendingProposals, filters, page]);
  return (
    <section aria-busy={loading}>
      {kind === "proposals" && (
        <div className="record-filters">
          <input
            aria-label={t("searchProposals")}
            placeholder={t("searchProposals")}
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
          <input
            aria-label={t("author")}
            placeholder={t("author")}
            value={filters.author}
            onChange={(e) => set("author", e.target.value)}
          />
          <select
            aria-label={t("provider")}
            value={filters.harnessId}
            onChange={(e) => set("harnessId", e.target.value)}
          >
            <option value="all">{t("allClients")}</option>
            {CLIENTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("tasks")}
            value={filters.taskId}
            onChange={(e) => set("taskId", e.target.value)}
          >
            <option value="all">{t("allTasks")}</option>
            {workspace.state.tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <select
            aria-label={t("status")}
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {(["all", "pending", "applied", "rejected"] as const).map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
          <button
            className="button small"
            onClick={() =>
              void api("project.reveal").catch((e) => setError(errorText(e, t)))
            }
          >
            {t("agentFolder")}
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {kind === "proposals" ? (
        <div className="proposal-list">
          {data.items.map((p: ProposalRecord) => (
            <button
              className="proposal-card"
              key={p.proposal.proposalId}
              onClick={() => onReview(p)}
            >
              <Avatar
                family={
                  p.proposal.actor.family ??
                  (p.proposal.actor.harnessId
                    ? `client:${p.proposal.actor.harnessId}`
                    : "unknown")
                }
                size={38}
              />
              <div>
                <h3>{p.proposal.title}</h3>
                <p>
                  {p.proposal.actor.name} ·{" "}
                  {p.proposal.actor.harnessId
                    ? clientName(p.proposal.actor.harnessId)
                    : t("unknownModel")}{" "}
                  · {p.proposal.changes.length} {t("changeCount")}
                </p>
                <small>{p.proposal.reason}</small>
              </div>
              <Badge status={p.status} t={t} />
            </button>
          ))}
        </div>
      ) : (
        <div className="panel history-panel">
          {data.items.map((a: Audit) => (
            <details key={a.id}>
              <summary>
                <ActivitySummary entry={a} state={workspace.state} t={t} locale={document.documentElement.lang} onDelete={() => setDeleting(a)} />
              </summary>
              <ActivityPeople entry={a} state={workspace.state} t={t} />
              <ActivityTasks entry={a} state={workspace.state} t={t} />
              {a.reason && <p>{a.reason}</p>}
              <div className="audit-diff">
                <pre>{JSON.stringify(a.before, null, 2)}</pre>
                <pre>{JSON.stringify(a.after, null, 2)}</pre>
              </div>
            </details>
          ))}
        </div>
      )}
      {!loading && !data.total && (
        <Empty title={t(kind === "proposals" ? "noProposals" : "noActivity")} />
      )}
      {deleting && <Modal title={t("deleteRecordTitle")} onClose={() => { if (!deleteBusy) setDeleting(null); }}>
        <p>{t("deleteRecordHint")}</p>
        <p><time>{new Date(deleting.at).toLocaleString(document.documentElement.lang)}</time></p>
        <div className="button-row">
          <button className="button" disabled={deleteBusy} onClick={() => setDeleting(null)}>{t("cancel")}</button>
          <button className="button danger" disabled={deleteBusy} onClick={async () => {
            setDeleteBusy(true);
            try { await command("audit.delete", { auditId: deleting.id }); setDeleting(null); setError(""); }
            catch (e) { setError(errorText(e, t)); }
            finally { setDeleteBusy(false); }
          }}>{t("deleteRecord")}</button>
        </div>
      </Modal>}
      <nav className="pagination" aria-label={t("pagination")}>
        <button
          className="button small"
          disabled={!page || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          {t("previousPage")}
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(data.total / data.pageSize))} ·{" "}
          {data.total}
        </span>
        <button
          className="button small"
          disabled={(page + 1) * data.pageSize >= data.total || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("nextPage")}
        </button>
      </nav>
    </section>
  );
}
