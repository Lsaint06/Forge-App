import { localDate } from "../../domain/types";
import { addDays } from "../../domain/paths/model";
import { mondayOf } from "../../domain/progress/range";
import type { DayDetail, DayStatus } from "../../domain/progress/consistency";
import type { IconName } from "../../components/ui";

// Training calendar (Phase 7.2C-4). Read-only presentation rules over the
// existing day details; nothing here schedules, records or changes training.

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export function shiftMonth(month: string, by: number) {
  const d = new Date(`${month}T12:00:00`);
  d.setMonth(d.getMonth() + by, 1);
  return localDate(d.getTime());
}

export const monthTitle = (month: string) =>
  new Date(`${month}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

/** Whole Monday-to-Sunday weeks covering the month. */
export function monthGrid(month: string) {
  const next = shiftMonth(month, 1);
  const days: string[] = [];
  for (let d = mondayOf(month); d < next || days.length % 7; d = addDays(d, 1))
    days.push(d);
  return days;
}

/**
 * One state, one shape: the same marks as the Path week calendar, so a
 * state never depends on colour alone. Rest days carry no mark in the month
 * grid (the legend says so), which keeps a month of rest quiet.
 */
export type StateTone = "accent" | "primary" | "warning" | "muted";
export const DAY_STATE: Record<
  DayStatus,
  { icon: IconName; tone: StateTone; label: string; spoken: string }
> = {
  completed: {
    icon: "checkmark-circle",
    tone: "accent",
    label: "Completed",
    spoken: "workout completed",
  },
  scheduled: {
    icon: "ellipse",
    tone: "primary",
    label: "Planned",
    spoken: "session planned",
  },
  missed: {
    icon: "alert-circle-outline",
    tone: "warning",
    label: "Missed",
    spoken: "planned session missed",
  },
  skipped: {
    icon: "play-skip-forward-outline",
    tone: "muted",
    label: "Skipped",
    spoken: "session skipped",
  },
  rest: {
    icon: "remove-outline",
    tone: "muted",
    label: "Rest",
    spoken: "rest day",
  },
};

/** "4 workouts this month · 1 skipped · 1 missed", for the days of `month`. */
export function monthSummary(month: string, details: DayDetail[]) {
  const days = details.filter((d) => d.date.slice(0, 7) === month.slice(0, 7));
  const count = (state: string) =>
    days.reduce(
      (n, d) => n + d.sessions.filter((s) => s.state === state).length,
      0,
    );
  const completed = days.reduce((n, d) => n + d.workouts.length, 0);
  const skipped = count("skipped");
  const missed = count("missed");
  return [
    `${completed} ${completed === 1 ? "workout" : "workouts"} this month`,
    ...(skipped ? [`${skipped} skipped`] : []),
    ...(missed ? [`${missed} missed`] : []),
  ].join(" · ");
}

/** "Planned · Path" for a session row on the selected day. */
export function sessionDescription(state: DayStatus, source: string) {
  const where =
    source === "program" ? " · program" : source === "path" ? " · Path" : "";
  return `${DAY_STATE[state].label}${where}`;
}
