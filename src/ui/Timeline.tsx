import { useRef, useState } from "react";
import {
  taskStatus,
  type Task,
  type Settings,
  type Workspace,
} from "../shared/domain";
import { DAY, dateTime, shiftSchedule } from "../shared/schedule";
import { useApi, useTab, useDirty } from "./api";
import { Empty } from "./components";
import type { Translate } from "./i18n";
import { errorText } from "./errors";

export function Timeline({
  workspace,
  t,
  settings,
  onEdit,
}: {
  workspace: Workspace;
  t: Translate;
  settings: Settings;
  onEdit: (t: Task) => void;
}) {
  const { api, command } = useApi();
  const [scale, setScale] = useState(30),
    [anchor, setAnchor] = useState(""),
    [error, setError] = useState("");
  const drag = useRef<{
    task: Task;
    x: number;
    edge: "move" | "start" | "end";
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    dates: { startDate: string; endDate: string };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const tasks = workspace.state.tasks.filter(
    (t) => !t.archived && t.startDate && t.endDate,
  );
  if (!tasks.length) return <Empty title={t("timeline")} hint={t("noDates")} />;
  const min = Math.min(...tasks.map((t) => dateTime(t.startDate))),
    max = Math.max(...tasks.map((t) => dateTime(t.endDate)));
  const count = Math.max(14, Math.ceil((max - min) / DAY) + 3),
    visibleDays = Math.min(count, 180);
  const start = Math.max(
    min,
    Math.min(anchor ? dateTime(anchor) : min, Math.max(min, max - 7 * DAY)),
  );
  const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
  async function save(
    task: Task,
    dates: { startDate: string; endDate: string },
  ) {
    setSaving(true);
    try {
      await command("change", {
        entity: "task",
        operation: "update",
        id: task.id,
        expectedRevision: task.revision,
        values: dates,
      });
      setError("");
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setSaving(false);
      setPreview(null);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("timeline")}</h2>
        <div className="button-row">
          <button
            className="button small"
            disabled={start <= min}
            onClick={() => setAnchor(iso(Math.max(min, start - 90 * DAY)))}
          >
            ←
          </button>
          <input
            className="gantt-jump"
            aria-label={t("jumpToDate")}
            type="date"
            value={iso(start)}
            min={iso(min)}
            max={iso(max)}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
          />
          <button
            className="button small"
            disabled={start + visibleDays * DAY > max}
            onClick={() => setAnchor(iso(start + 90 * DAY))}
          >
            →
          </button>
          <button
            className="button small"
            aria-label={t("zoomOut")}
            onClick={() => setScale(Math.max(8, scale - 8))}
          >
            −
          </button>
          <button
            className="button small"
            aria-label={t("zoomIn")}
            onClick={() => setScale(Math.min(80, scale + 8))}
          >
            +
          </button>
        </div>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div className="gantt">
        <div className="gantt-names">
          <div className="gantt-header">{t("tasks")}</div>
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => {
                setAnchor(task.startDate);
                onEdit(task);
              }}
            >
              <span
                className={`status-dot ${taskStatus(task, workspace.state.tasks)}`}
              />
              {task.title}
            </button>
          ))}
        </div>
        <div className="gantt-scroll">
          <div style={{ width: visibleDays * scale }}>
            <div className="gantt-days">
              {Array.from({ length: visibleDays }, (_, i) => (
                <span
                  key={i}
                  title={iso(start + i * DAY)}
                  style={{ width: scale }}
                >
                  {i % Math.max(1, Math.floor(35 / scale)) === 0
                    ? new Date(start + i * DAY).getUTCDate()
                    : ""}
                </span>
              ))}
            </div>
            {tasks.map((task) => {
              const dates = preview?.id === task.id ? preview.dates : task;
              const left = (dateTime(dates.startDate) - start) / DAY,
                right = (dateTime(dates.endDate) - start) / DAY + 1;
              const shown = right > 0 && left < visibleDays;
              return (
                <div
                  key={task.id}
                  className="gantt-row"
                  style={{ backgroundSize: `${scale}px 100%` }}
                >
                  {shown && (
                    <button
                      disabled={saving}
                      className={`gantt-bar ${taskStatus(task, workspace.state.tasks)}`}
                      title={`${task.title}: ${dates.startDate} → ${dates.endDate}`}
                      aria-label={`${task.title} ${dates.startDate} ${dates.endDate}`}
                      style={{
                        left: Math.max(0, left) * scale,
                        width: Math.max(
                          scale,
                          (Math.min(visibleDays, right) - Math.max(0, left)) *
                            scale,
                        ),
                      }}
                      onDoubleClick={() => onEdit(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onEdit(task);
                          return;
                        }
                        if (!["ArrowLeft", "ArrowRight"].includes(e.key))
                          return;
                        e.preventDefault();
                        try {
                          void save(
                            task,
                            shiftSchedule(
                              task,
                              (e.key === "ArrowLeft" ? -1 : 1) *
                                (e.shiftKey ? 7 : 1),
                              e.altKey ? "end" : e.ctrlKey ? "start" : "move",
                            ),
                          );
                        } catch (err) {
                          setError(errorText(err, t));
                        }
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = {
                          task: structuredClone(task),
                          x: e.clientX,
                          edge:
                            ((e.target as HTMLElement).dataset.edge as any) ||
                            "move",
                        };
                      }}
                      onPointerMove={(e) => {
                        if (!drag.current) return;
                        try {
                          setPreview({
                            id: task.id,
                            dates: shiftSchedule(
                              drag.current.task,
                              Math.round((e.clientX - drag.current.x) / scale),
                              drag.current.edge,
                            ),
                          });
                        } catch {}
                      }}
                      onPointerUp={(e) => {
                        const d = drag.current;
                        drag.current = null;
                        if (!d) return;
                        const days = Math.round((e.clientX - d.x) / scale);
                        if (!days) {
                          setPreview(null);
                          return;
                        }
                        try {
                          void save(
                            d.task,
                            shiftSchedule(d.task, days, d.edge),
                          );
                        } catch (err) {
                          setPreview(null);
                          setError(errorText(err, t));
                        }
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                        setPreview(null);
                      }}
                    >
                      {left >= 0 && (
                        <span className="date-grip start" data-edge="start" />
                      )}
                      {task.title}
                      {right <= visibleDays && (
                        <span className="date-grip end" data-edge="end" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="muted panel-caption">
        {iso(min)} — {iso(max)} · {t("timelineHelp")}
      </p>
    </section>
  );
}
