import { fail, type Task } from "./domain";
export const DAY = 86400000;
export const dateTime = (value: string) => Date.parse(`${value}T12:00:00Z`);
export function shiftSchedule(
  task: Pick<Task, "startDate" | "endDate">,
  days: number,
  edge: "move" | "start" | "end" = "move",
) {
  const iso = (date: string, shift: number) =>
    new Date(dateTime(date) + shift * DAY).toISOString().slice(0, 10);
  const next = {
    startDate: iso(task.startDate, edge === "end" ? 0 : days),
    endDate: iso(task.endDate, edge === "start" ? 0 : days),
  };
  if (
    next.startDate > next.endDate ||
    !/^\d{4}-/.test(next.startDate) ||
    !/^\d{4}-/.test(next.endDate)
  )
    fail("INVALID_DATE_RANGE");
  return next;
}
