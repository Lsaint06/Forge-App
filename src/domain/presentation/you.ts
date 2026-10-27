import type { Workout } from "../types";
import { localDate } from "../types";
import { cmToIn } from "../metrics";
import { addDays } from "../paths/model";
import { mondayOf } from "../progress/range";
import { dayTitle } from "../calendar-dates";

// The You tab's performance strip and My stats (Phase 7.5C). Presentation
// only: workouts, profile values and measurements are read, never changed.

/**
 * Weeks consistent: consecutive calendar weeks (Monday to Sunday, local
 * dates, as everywhere in FORGE) that each hold at least one completed
 * workout, dated by its local finish day (as the day streak dates it).
 *
 * The run ends at the current week when it already has a workout; otherwise
 * at the week before, so a week still in progress never breaks it. Any
 * fully elapsed week without a workout ends the run. Unfinished workouts and
 * planned sessions do not count; it is activity, not plan adherence.
 */
export function weeksConsistent(
  workouts: Pick<Workout, "status" | "startedAt" | "finishedAt">[],
  today: string,
) {
  const weeks = new Set(
    workouts
      .filter((w) => w.status === "completed")
      .map((w) => mondayOf(localDate(w.finishedAt ?? w.startedAt))),
  );
  let week = mondayOf(today);
  if (!weeks.has(week)) week = addDays(week, -7);
  let count = 0;
  while (weeks.has(week)) {
    count++;
    week = addDays(week, -7);
  }
  return count;
}

/**
 * The saved height in the lifter's units: whole centimetres for kilogram
 * users, feet and inches for pound users (as Edit profile asks for it).
 * Undefined when no height is saved.
 */
export function heightText(cm: number, units: "kg" | "lb") {
  if (!(cm > 0)) return undefined;
  if (units === "kg") return { value: String(Math.round(cm)), unit: "cm" };
  const inches = Math.round(cmToIn(cm));
  return { value: `${Math.floor(inches / 12)} ft ${inches % 12} in` };
}

/**
 * Where the shown bodyweight comes from: the date of the latest weigh-in
 * ("Logged today", "Logged Thu, Oct 22"), or the profile's weight.
 */
export function bodyweightSource(date: string | undefined, today: string) {
  if (!date) return "From your profile";
  const day = dayTitle(date, today);
  const recent = date === today || date === addDays(today, -1);
  return `Logged ${recent ? day.toLowerCase() : day}`;
}
