import { localDate } from "./types";
import { addDays } from "./paths/model";

// Calendar dates for scheduling, as local "YYYY-MM-DD" strings. Every date is
// read at noon, so a time-zone or daylight-saving change can never move a
// chosen day to the day before or after.

const atNoon = (date: string) => new Date(`${date}T12:00:00`);

/** The first of the month containing `date`. */
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

export function shiftMonth(month: string, by: number) {
  const d = atNoon(month);
  d.setMonth(d.getMonth() + by, 1);
  return localDate(d.getTime());
}

/** "October 2026". */
export const monthName = (month: string) =>
  atNoon(month).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

/**
 * The weeks of a month, Monday first. Days outside the month are undefined,
 * so every row has seven cells.
 */
export function monthWeeks(month: string): (string | undefined)[][] {
  const first = monthOf(month);
  const lead = (atNoon(first).getDay() + 6) % 7;
  const days: (string | undefined)[] = Array(lead).fill(undefined);
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1))
    days.push(d);
  while (days.length % 7) days.push(undefined);
  const weeks: (string | undefined)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Monday-first short weekday names for the grid header, e.g. "Mon". */
export function weekdayHeaders() {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    atNoon(addDays("2024-01-01", i)).toLocaleDateString(undefined, {
      weekday: "short",
    }),
  );
}

/** "Today", "Yesterday" or "Thu, Oct 22": a day being looked back on. */
export function dayTitle(date: string, today = localDate()) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return atNoon(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
