import { addDays } from "../paths/model";

// Time ranges for Progress. Weeks run Monday–Sunday in local dates.

export type RangeKey = "4w" | "12w" | "1y" | "all";
export const rangeLabels: Record<RangeKey, string> = {
  "4w": "4 weeks",
  "12w": "12 weeks",
  "1y": "1 year",
  all: "All time",
};

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (date: string) =>
  (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
export const mondayOf = (date: string) => addDays(date, -weekdayIndex(date));
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
function nextMonth(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export type RangeWindow = {
  key: RangeKey;
  /** First day (a Monday). */
  from: string;
  /** Last day: today. */
  to: string;
  bucket: "week" | "month";
};

/**
 * 4 and 12 weeks include the current week; 1 year is 52 weeks. All time
 * starts at the first recorded activity. Ranges over 16 weeks are charted by
 * month, everything else by week.
 */
export function rangeWindow(
  key: RangeKey,
  today: string,
  firstDate?: string,
): RangeWindow {
  const thisWeek = mondayOf(today);
  const weeks = key === "4w" ? 4 : key === "12w" ? 12 : key === "1y" ? 52 : 0;
  const from = weeks
    ? addDays(thisWeek, -(weeks - 1) * 7)
    : mondayOf(firstDate && firstDate < today ? firstDate : today);
  const span = Math.round(
    (new Date(`${thisWeek}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      (7 * 86400000),
  );
  return { key, from, to: today, bucket: span + 1 > 16 ? "month" : "week" };
}

export const inWindow = (date: string, w: Pick<RangeWindow, "from" | "to">) =>
  date >= w.from && date <= w.to;

export type Bucket = { start: string; end: string };

/** Week (Monday) or calendar-month buckets covering the window. */
export function buckets(w: RangeWindow): Bucket[] {
  const out: Bucket[] = [];
  if (w.bucket === "week")
    for (let d = w.from; d <= w.to; d = addDays(d, 7))
      out.push({ start: d, end: addDays(d, 6) });
  else
    for (let m = monthOf(w.from); m <= w.to; m = nextMonth(m))
      out.push({ start: m, end: addDays(nextMonth(m), -1) });
  return out;
}

/** The weeks (Mondays) from the window's first week to the current week. */
export function weekStarts(w: Pick<RangeWindow, "from" | "to">) {
  const out: string[] = [];
  for (let d = mondayOf(w.from); d <= w.to; d = addDays(d, 7)) out.push(d);
  return out;
}
