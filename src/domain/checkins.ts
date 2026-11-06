import { validateJournal } from "./validation";
import { addDays } from "./paths/model";
import {
  GAP_DAYS,
  RANGES,
  dayNumber,
  newestFirst,
  rangeStart,
  type Range,
} from "./measurements";
import type { Journal } from "./types";

// Recovery check-ins (Phase 7B WP4C). Records keep their journal shape
// (`kind: "recovery"`): sleep in hours, four required 1–5 scales and the
// optional self-rated `readiness`, `restDay` and `notes`. Nothing here
// computes a score, rewrites a stored value or tightens what storage accepts;
// unusual legacy values are shown as recorded.

export type Checkin = Pick<
  Journal,
  "id" | "date" | "createdAt" | "updatedAt" | "data"
>;
export { GAP_DAYS, RANGES, dayNumber, newestFirst, type Range };

export type ScaleKey =
  "quality" | "soreness" | "energy" | "stress" | "readiness";
export type Scale = {
  key: ScaleKey;
  /** The question, as asked in the check-in. */
  question: string;
  /** Short name for summaries and chart choices. */
  short: string;
  /** Meaning of 1 … 5; the direction is the stored one, never reversed. */
  words: readonly [string, string, string, string, string];
  required: boolean;
};
export const SCALES: readonly Scale[] = [
  {
    key: "quality",
    question: "Sleep quality",
    short: "Quality",
    words: ["Poor", "Fair", "Okay", "Good", "Great"],
    required: true,
  },
  {
    key: "soreness",
    question: "Soreness",
    short: "Soreness",
    words: ["None", "Mild", "Moderate", "High", "Severe"],
    required: true,
  },
  {
    key: "energy",
    question: "Energy",
    short: "Energy",
    words: ["Drained", "Low", "Okay", "High", "Energised"],
    required: true,
  },
  {
    key: "stress",
    question: "Stress",
    short: "Stress",
    words: ["Calm", "Low", "Moderate", "High", "Very stressed"],
    required: true,
  },
  {
    key: "readiness",
    question: "Ready to train",
    short: "Ready",
    words: ["Not at all", "Barely", "Somewhat", "Mostly", "Fully"],
    required: false,
  },
];
export const scaleOf = (key: ScaleKey) => SCALES.find((s) => s.key === key)!;

const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
/** A whole 1–5 answer that the scale buttons can show as selected. */
export const isAnswer = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

// ---- Reading recorded values --------------------------------------------------

/** "7 h 30 m", "8 h", "0 h". Undefined when not a number of hours. */
export function sleepText(v: unknown) {
  const h = finite(v);
  if (h === undefined || h < 0) return undefined;
  const total = Math.round(h * 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} m` : `${hours} h`;
}
/** Spoken form: "7 hours 30 minutes". */
export function sleepSpoken(v: unknown) {
  const text = sleepText(v);
  return text
    ?.replace(/(\d+) h/, (_, n) => `${n} ${n === "1" ? "hour" : "hours"}`)
    .replace(/(\d+) m/, (_, n) => `${n} ${n === "1" ? "minute" : "minutes"}`);
}

/**
 * A recorded answer: "2 · Mild" for whole answers; other values exactly as
 * recorded ("2.5", "42 (outside 1–5)", "high"). Undefined when absent.
 */
export function scaleText(key: ScaleKey, v: unknown) {
  if (v === undefined || v === null || v === "") return undefined;
  if (isAnswer(v)) return `${v} · ${scaleOf(key).words[v - 1]}`;
  const n = finite(v);
  if (n !== undefined)
    return n >= 1 && n <= 5 ? String(n) : `${n} (outside 1–5)`;
  return String(v);
}

/** The rest-day answer as a switch position; undefined for anything else. */
export function restDayAnswer(v: unknown) {
  if (v === true || v === "yes") return true;
  if (v === false || v === "no") return false;
  return undefined;
}
/** "Rest day" for yes; unusual recorded text as it was written; else nothing. */
export function restDayText(v: unknown) {
  const answer = restDayAnswer(v);
  if (answer === true) return "Rest day";
  if (answer === false || v === undefined || v === null || v === "")
    return undefined;
  return `Rest day: ${String(v)}`;
}

const noteOf = (e: Checkin) => String(e.data.notes ?? "").trim();

/** One line for a history row: sleep and the three body scales, by number. */
export function summaryLine(e: Checkin) {
  const parts = [
    sleepText(e.data.sleep) && `${sleepText(e.data.sleep)} sleep`,
    ...(["soreness", "energy", "stress"] as const).map((k) => {
      const v = e.data[k];
      if (v === undefined) return undefined;
      return `${scaleOf(k).short} ${isAnswer(v) ? v : String(v)}`;
    }),
    restDayText(e.data.restDay),
  ];
  return parts.filter(Boolean).join(" · ");
}
/** Everything recorded, for screen readers and the Today card. */
export function details(e: Checkin) {
  const rows: { label: string; value: string }[] = [];
  const sleep = sleepText(e.data.sleep);
  if (sleep) rows.push({ label: "Sleep", value: sleep });
  for (const s of SCALES) {
    const text = scaleText(s.key, e.data[s.key]);
    if (text) rows.push({ label: s.question, value: text });
  }
  const rest = restDayText(e.data.restDay);
  if (rest)
    rows.push({
      label: "Rest day",
      value: rest === "Rest day" ? "Yes" : rest.replace("Rest day: ", ""),
    });
  return rows;
}
export function spokenSummary(e: Checkin) {
  const parts = details(e).map((d) =>
    d.label === "Sleep"
      ? `Sleep ${sleepSpoken(e.data.sleep)}`
      : `${d.label} ${d.value.replace(" · ", ", ")}`,
  );
  const note = noteOf(e);
  if (note) parts.push(`Note: ${note}`);
  return parts.join(". ");
}

// ---- Days ---------------------------------------------------------------------------

/** Check-ins on a day, newest first (the shared WP4B ordering). */
export function onDay(entries: Checkin[], date: string) {
  return entries.filter((e) => e.date === date).sort(newestFirst);
}
/** The check-in that stands for each day: the latest recorded that day. */
export function latestOfDay(entries: Checkin[]) {
  const days = new Map<string, { entry: Checkin; count: number }>();
  for (const e of [...entries].sort(newestFirst)) {
    const day = days.get(e.date);
    if (day) day.count += 1;
    else days.set(e.date, { entry: e, count: 1 });
  }
  return days;
}

// ---- Trends ---------------------------------------------------------------------------

export type Metric = "sleep" | ScaleKey;
export const METRICS: { key: Metric; label: string }[] = [
  { key: "sleep", label: "Sleep" },
  ...SCALES.map((s) => ({ key: s.key as Metric, label: s.short })),
];
export type DayPoint = {
  date: string;
  value: number;
  count: number;
  entry: Checkin;
};

/**
 * One point per day for a metric, oldest first: the latest check-in of each
 * day. A day whose latest check-in has no usable value for the metric is
 * left out (missing, never zero); unusual values are not charted.
 */
export function pointsFor(entries: Checkin[], metric: Metric): DayPoint[] {
  const out: DayPoint[] = [];
  for (const [date, { entry, count }] of latestOfDay(entries)) {
    const v = finite(entry.data[metric]);
    if (v === undefined) continue;
    if (metric === "sleep" ? v < 0 || v > 24 : v < 1 || v > 5) continue;
    out.push({ date, value: v, count, entry });
  }
  return out.reverse();
}
export function inRange(points: DayPoint[], today: string, range: Range) {
  const start = rangeStart(today, range);
  return points.filter((p) => dayNumber(p.date) >= start);
}
/** The shortest range holding at least two days, otherwise All. */
export function defaultRange(points: DayPoint[], today: string): Range {
  return RANGES.find((r) => inRange(points, today, r).length >= 2) ?? "All";
}
/** Metrics with at least one charted day (the optional rating may have none). */
export const chartable = (entries: Checkin[]) =>
  METRICS.filter((m) => pointsFor(entries, m.key).length > 0);

/** Plain, descriptive text about the shown days; no judgement or advice. */
export function rangeSummary(points: DayPoint[], metric: Metric) {
  const n = points.length;
  if (!n) return undefined;
  const days = `${n} ${n === 1 ? "day" : "days"}`;
  if (metric === "sleep") {
    const avg = points.reduce((t, p) => t + p.value, 0) / n;
    const lo = Math.min(...points.map((p) => p.value));
    const hi = Math.max(...points.map((p) => p.value));
    return n === 1
      ? `${sleepText(avg)} · 1 day`
      : `Average ${sleepText(avg)} · ${sleepText(lo)} to ${sleepText(hi)} · ${days}`;
  }
  // Most frequent whole answer; ties go to the more recent day.
  const counts = new Map<number, { n: number; last: number }>();
  points.forEach((p, i) => {
    const k = Math.round(p.value);
    const c = counts.get(k) ?? { n: 0, last: -1 };
    counts.set(k, { n: c.n + 1, last: i });
  });
  const [mode] = [...counts.entries()].sort(
    (a, b) => b[1].n - a[1].n || b[1].last - a[1].last,
  )[0]!;
  return `Most often ${mode} · ${scaleOf(metric).words[mode - 1]} · ${days}`;
}
/** Distinct days with a check-in among the `days` ending today. */
export function daysCheckedIn(entries: Checkin[], today: string, days = 30) {
  const first = addDays(today, -(days - 1));
  return new Set(
    entries
      .filter((e) => e.date >= first && e.date <= today)
      .map((e) => e.date),
  ).size;
}

// ---- Entering a check-in ----------------------------------------------------------

/** The sheet's answers. Unanswered values stay undefined; nothing is assumed. */
export type Draft = {
  date: string;
  sleep?: number;
  quality?: number;
  soreness?: number;
  energy?: number;
  stress?: number;
  readiness?: number;
  restDay?: boolean;
  notes: string;
};
export const emptyDraft = (date: string): Draft => ({ date, notes: "" });
/** A stored check-in as the sheet starts it (only values it can show). */
export function draftOf(e: Checkin): Draft {
  const d: Draft = { date: e.date, notes: String(e.data.notes ?? "") };
  const sleep = finite(e.data.sleep);
  if (sleep !== undefined) d.sleep = sleep;
  for (const s of SCALES) {
    const v = finite(e.data[s.key]);
    if (v !== undefined) d[s.key] = v;
  }
  const rest = restDayAnswer(e.data.restDay);
  if (rest !== undefined) d.restDay = rest;
  return d;
}

export const SLEEP_MAX = 24;
export const SLEEP_STEP = 0.25;
/** A gentle check, never a block. */
export const sleepHint = (h: number | undefined) =>
  h !== undefined && h > 14
    ? "That's a long night. Check it's right before saving."
    : undefined;

function missing(d: Draft) {
  const names = [
    d.sleep === undefined ? "last night's sleep" : undefined,
    ...SCALES.filter((s) => s.required && d[s.key] === undefined).map((s) =>
      s.question.toLowerCase(),
    ),
  ].filter(Boolean) as string[];
  if (!names.length) return undefined;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Choose ${list} to save this check-in.`;
}
function checkDraft(d: Draft) {
  if (d.sleep !== undefined && (d.sleep < 0 || d.sleep > SLEEP_MAX))
    return "Sleep must be between 0 and 24 hours.";
  return undefined;
}

/** A new check-in's data, or what to fix. Nothing unanswered is written. */
export function newCheckin(
  d: Draft,
): { data: Journal["data"]; date: string } | { error: string } {
  const problem = missing(d) ?? checkDraft(d);
  if (problem) return { error: problem };
  const data: Journal["data"] = {
    sleep: d.sleep!,
    quality: d.quality!,
    soreness: d.soreness!,
    energy: d.energy!,
    stress: d.stress!,
  };
  if (d.readiness !== undefined) data.readiness = d.readiness;
  if (d.restDay) data.restDay = "yes";
  const notes = d.notes.trim();
  if (notes) data.notes = notes;
  validateJournal("recovery", data);
  return { data, date: d.date };
}

/**
 * An edit: only answers the lifter changed are merged into the stored data;
 * every other key keeps its exact value and type. Undefined when nothing
 * changed, so an untouched save writes nothing and queues nothing for sync.
 */
export function editedCheckin(
  original: Checkin,
  d: Draft,
): { data: Journal["data"]; date: string } | { error: string } | undefined {
  const start = draftOf(original);
  const changes: Journal["data"] = {};
  const removed: string[] = [];
  if (d.sleep !== start.sleep) {
    if (d.sleep === undefined) return { error: missing(d)! };
    changes.sleep = d.sleep;
  }
  for (const s of SCALES) {
    if (d[s.key] === start[s.key]) continue;
    if (d[s.key] === undefined) {
      if (s.required) return { error: missing(d)! };
      removed.push(s.key);
    } else changes[s.key] = d[s.key]!;
  }
  if (d.restDay !== start.restDay && d.restDay !== undefined)
    changes.restDay = d.restDay ? "yes" : "no";
  const notes = d.notes.trim();
  if (notes !== String(original.data.notes ?? "").trim()) {
    if (notes) changes.notes = notes;
    else if ("notes" in original.data) changes.notes = "";
  }
  const dateChanged = d.date !== original.date;
  if (!Object.keys(changes).length && !removed.length && !dateChanged)
    return undefined;
  const problem = checkDraft(d);
  if (problem) return { error: problem };
  const data = { ...original.data, ...changes };
  for (const k of removed) delete data[k];
  validateJournal("recovery", data);
  return { data, date: d.date };
}

/** Whether the sheet holds anything that would be lost by closing it. */
export function draftChanged(d: Draft, original?: Checkin) {
  if (original) return editedCheckin(original, d) !== undefined;
  return (
    d.sleep !== undefined ||
    SCALES.some((s) => d[s.key] !== undefined) ||
    d.restDay !== undefined ||
    !!d.notes.trim()
  );
}
