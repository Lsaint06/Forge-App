import { localDate, type Workout } from "./types";
import { elapsedSeconds, kgToLb } from "./metrics";

// Display formatting shared by Today, Train and History. Dates are local
// calendar dates (YYYY-MM-DD) so midnight in UTC never shifts a day.

const atNoon = (date: string) => new Date(`${date}T12:00:00`);

/** "Thu, Oct 24". */
export function dayLabel(date: string) {
  return atNoon(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "today", "tomorrow" or "Thu, Oct 24", for use inside a sentence. */
export function relativeDay(date: string, today = localDate()) {
  if (date === today) return "today";
  const tomorrow = atNoon(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === localDate(tomorrow.getTime())) return "tomorrow";
  return dayLabel(date);
}

/** "Wednesday, Oct 22": the factual overline above Today. */
export function longDayLabel(time = Date.now()) {
  return new Date(time).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export const workoutTime = (w: Workout) => w.finishedAt ?? w.startedAt;

/** "2026-10" for grouping; sorts chronologically as text. */
export const monthKey = (time: number) => localDate(time).slice(0, 7);

/** "October 2026". */
export function monthLabel(key: string) {
  return atNoon(`${key}-01`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Groups workouts by month, newest month first, keeping the given order. */
export function byMonth<T extends Workout>(workouts: T[]) {
  const groups = new Map<string, T[]>();
  for (const w of workouts) {
    const key = monthKey(workoutTime(w));
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, title: monthLabel(key), items }));
}

export function durationMinutes(w: Workout) {
  return Math.round(
    elapsedSeconds(w.startedAt, w.finishedAt ?? w.startedAt, w.pausedMs) / 60,
  );
}

export function volumeText(volumeKg: number, units: "kg" | "lb") {
  const value = Math.round(units === "lb" ? kgToLb(volumeKg) : volumeKg);
  return `${value.toLocaleString()} ${units}`;
}

/** "1 exercise", "3 exercises". */
export const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/** "3 exercises · 9 sets" for a template. */
export function templateLine(exercises: { sets: number }[]) {
  return `${plural(exercises.length, "exercise")} · ${plural(
    exercises.reduce((n, e) => n + e.sets, 0),
    "set",
  )}`;
}

/** "2 of 4 sessions", or "5 sessions · goal met" once the goal is reached. */
export function weekGoalText(done: number, goal: number) {
  return done >= goal && goal > 0
    ? `${plural(done, "session")} · goal met`
    : `${done} of ${plural(goal, "session")}`;
}

/** "Tue, Oct 21 · 52 min · 12,400 lb": the compact history line. */
export function workoutLine(w: Workout, volumeKg: number, units: "kg" | "lb") {
  return [
    dayLabel(localDate(workoutTime(w))),
    `${durationMinutes(w)} min`,
    volumeText(volumeKg, units),
  ].join(" · ");
}
