import { useId, useMemo, useRef, useState } from "react";
import { NODE_HEIGHT, NODE_WIDTH, graphLayout } from "../shared/graph-layout";
import { assignedCompanies } from "../shared/brands";
import { familyName, taskStatus, type Task, type Workspace } from "../shared/domain";
import type { Translate } from "./i18n";
import { Empty } from "./components";

export function GraphView({ workspace, t, onEdit, mindmap = false }: { workspace: Workspace; t: Translate; onEdit: (task: Task) => void; mindmap?: boolean }) {
  const tasks = workspace.state.tasks.filter(task => !task.archived);
  const layout = useMemo(() => graphLayout(tasks, mindmap), [workspace.state.tasks, mindmap]);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const marker = useId().replaceAll(":", "");
  const resize = (next: number) => setZoom(Math.max(.02, Math.min(2, next)));
  if (!tasks.length) return <Empty title={t("tasksEmpty")} />;
  return <section className="graph-panel panel">
    <div className="graph-toolbar button-row">
      <button className="button small" aria-label={t("zoomOut")} onClick={() => resize(zoom / 1.2)}>−</button>
      <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      <button className="button small" aria-label={t("zoomIn")} onClick={() => resize(zoom * 1.2)}>+</button>
      <button className="button small" onClick={() => { const el = viewport.current; if (el) { resize(Math.min((el.clientWidth - 16) / layout.width, (el.clientHeight - 16) / layout.height)); el.scrollTo(0, 0); } }}>{t("fitGraph")}</button>
      <button className="button small" onClick={() => { resize(1); viewport.current?.scrollTo(0, 0); }}>{t("resetGraph")}</button>
      <small>{tasks.length} · {t("tasks")}</small>
    </div>
    <p className="graph-help">{t("graphHelp")}</p>
    <div ref={viewport} className="graph-scroll" tabIndex={0} aria-label={t(mindmap ? "mindmap" : "dependencies")}
      onPointerDown={e => { if (e.button !== 0 || (e.target as Element).closest(".graph-node")) return; const el = e.currentTarget; drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; el.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const d = drag.current; if (d) { e.currentTarget.scrollLeft = d.left + d.x - e.clientX; e.currentTarget.scrollTop = d.top + d.y - e.clientY; } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <svg width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={t(mindmap ? "mindmap" : "dependencies")}>
        <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#95a69e" /></marker></defs>
        {tasks.flatMap(task => layout.incoming.get(task.id)!.map(id => {
          const a = layout.points.get(id)!, b = layout.points.get(task.id)!;
          const x = a.x + NODE_WIDTH, y = a.y + NODE_HEIGHT / 2, by = b.y + NODE_HEIGHT / 2;
          return <path key={`${id}-${task.id}`} d={`M${x},${y} C${x + 35},${y} ${b.x - 35},${by} ${b.x},${by}`} fill="none" stroke="#9aaea3" strokeWidth="1.5" markerEnd={`url(#${marker})`} />;
        }))}
        {tasks.map(task => {
          const p = layout.points.get(task.id)!, status = taskStatus(task, workspace.state.tasks), companies = assignedCompanies(task.assignees);
          return <g className="graph-node" data-task-id={task.id} key={task.id} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button" aria-label={task.title}
            onClick={() => onEdit(task)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(task); } }}>
            <title>{`${task.title}\n${task.assignees.map(familyName).join(", ")}`}</title>
            <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="10" />
            <foreignObject x="14" y="10" width={companies.length ? 186 : 250} height="48"><div className="graph-title">{task.title}</div></foreignObject>
            <circle cx="18" cy="76" r="4" fill={status === "done" ? "#529b77" : status === "blocked" ? "#d89e5c" : "#8fa7b3"} />
            <text className="graph-subtitle" x="30" y="80">{t(status)}</text>
            {companies.slice(0, 2).map((company, i) => <g className="company-mark" key={company.id}><title>{company.name}</title><circle cx={221 + i * 30} cy="30" r="13" fill="#fff" /><image aria-label={company.name} href={`./local-assets/company-${company.id}.svg`} x={210 + i * 30} y="19" width="22" height="22" /></g>)}
            {companies.length > 2 && <text x="243" y="65"><title>{companies.map(c => c.name).join(", ")}</title>+{companies.length - 2}</text>}
          </g>;
        })}
      </svg>
    </div>
  </section>;
}
