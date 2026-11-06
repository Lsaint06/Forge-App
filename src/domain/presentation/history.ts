import type { Workout } from "../types";
import { localDate } from "../types";
import {
  dayLabel,
  durationMinutes,
  plural,
  volumeText,
  workoutTime,
} from "../training-display";
import { workoutTitle } from "../workout-display";

// Workout history rows (Phase 7.5E). Presentation only: each completed
// workout keeps its own row, read from what was saved; nothing is merged,
// inferred or added.

export type HistoryRow = {
  id: string;
  /** The saved name, for labels ("Review Push day, Tue, Oct 21"). */
  name: string;
  /** The display title (the session part of a program name). */
  title: string;
  /** "Tue, Oct 21". */
  day: string;
  /** "21" and "Tue", for the date block. */
  date: { number: string; weekday: string };
  /** "52 min", "4 exercises", "12,400 kg": only what was recorded. */
  meta: string[];
};

/** Local dates with more than one completed workout. */
export function sharedDays(workouts: Workout[]) {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const w of workouts) {
    const d = localDate(workoutTime(w));
    if (seen.has(d)) shared.add(d);
    seen.add(d);
  }
  return shared;
}

/**
 * One workout's row. The finish time leads the details only when another
 * workout finished the same day, so same-day sessions stay distinguishable.
 * A duration under a minute, no exercises or no volume are left out rather
 * than shown as zero; a workout with no exercises says so.
 */
export function historyRow(
  w: Workout,
  recorded: { exercises: number; volumeKg: number },
  units: "kg" | "lb",
  showTime = false,
): HistoryRow {
  const time = workoutTime(w);
  const date = localDate(time);
  const at = new Date(`${date}T12:00:00`);
  const minutes = durationMinutes(w);
  return {
    id: w.id,
    name: w.name,
    title: workoutTitle(w.name),
    day: dayLabel(date),
    date: {
      number: String(at.getDate()),
      weekday: at.toLocaleDateString(undefined, { weekday: "short" }),
    },
    meta: [
      showTime
        ? new Date(time).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : undefined,
      minutes >= 1 ? `${minutes} min` : undefined,
      recorded.exercises > 0
        ? plural(recorded.exercises, "exercise")
        : "No exercises logged",
      recorded.volumeKg > 0 ? volumeText(recorded.volumeKg, units) : undefined,
    ].filter((m): m is string => !!m),
  };
}
