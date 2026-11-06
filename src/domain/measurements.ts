import type { Journal } from "./types";
import { isBodyweightName, validateJournal } from "./validation";
import {
  canonicalMeasurement,
  cmToIn,
  displayMeasurement,
  kgToLb,
} from "./metrics";
import { decimalText } from "./numbers";

// Body measurements (Phase 7B WP4B). Records keep the journal shape they
// always had — { name, value, unit, notes? } in kg, cm or percent — and are
// never renamed or rewritten here. This module groups them for display,
// orders them deterministically, turns them into per-day series and formats
// them in the lifter's units. See docs/audits/PHASE_7B_WP4B_MEASUREMENTS_AUDIT.md.

export type Units = "kg" | "lb";
export type Family = "mass" | "length" | "percent";
export type Entry = Pick<Journal, "id" | "date" | "createdAt" | "updatedAt"> & {
  data: Journal["data"];
};

/** Preset measurement types, in the order they are offered. */
export const TYPES: { name: string; family: Family }[] = [
  { name: "Bodyweight", family: "mass" },
  { name: "Body fat", family: "percent" },
  { name: "Waist", family: "length" },
  { name: "Hips", family: "length" },
  { name: "Chest", family: "length" },
  { name: "Shoulders", family: "length" },
  { name: "Neck", family: "length" },
  { name: "Left arm", family: "length" },
  { name: "Right arm", family: "length" },
  { name: "Left forearm", family: "length" },
  { name: "Right forearm", family: "length" },
  { name: "Left thigh", family: "length" },
  { name: "Right thigh", family: "length" },
  { name: "Left calf", family: "length" },
  { name: "Right calf", family: "length" },
];

const STORED_UNIT: Record<Family, "kg" | "cm" | "percent"> = {
  mass: "kg",
  length: "cm",
  percent: "percent",
};
export const familyOfUnit = (unit: unknown): Family | undefined =>
  unit === "kg"
    ? "mass"
    : unit === "cm"
      ? "length"
      : unit === "percent"
        ? "percent"
        : undefined;

/** The unit a family is shown and typed in for the lifter's preference. */
export function displayUnit(family: Family, units: Units) {
  if (family === "percent") return "%";
  if (family === "mass") return units;
  return units === "lb" ? "in" : "cm";
}

/** Same name for grouping: trimmed, lower case, single spaces; any bodyweight spelling. */
export function nameKey(name: unknown) {
  if (isBodyweightName(name)) return "bodyweight";
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
export const seriesKey = (name: unknown, family: Family) =>
  `${nameKey(name)}|${family}`;

/**
 * The one ordering used everywhere: newest day first; within a day, the
 * entry created last, then updated last, then the greater record ID.
 */
export function newestFirst(a: Entry, b: Entry) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Whether a stored entry can be read as a number in a known unit. */
export function readable(e: Entry) {
  const value = Number(e.data.value);
  return (
    Number.isFinite(value) &&
    value > 0 &&
    !!familyOfUnit(e.data.unit) &&
    String(e.data.name ?? "").trim() !== ""
  );
}

export type Series = {
  key: string;
  /** Shown name: the newest entry's name, as stored. */
  name: string;
  family: Family;
  bodyweight: boolean;
  /** Every entry, newest first. */
  entries: Entry[];
  /** One point per day (the day's latest entry), oldest first. */
  days: { date: string; value: number; count: number; entry: Entry }[];
  latest: Entry;
};

/**
 * Series for display: entries grouped by name (spelling variants together)
 * and unit family, newest-updated series first. Unreadable entries are left
 * out of series but stay in the history.
 */
export function seriesOf(entries: Entry[]): Series[] {
  const groups = new Map<string, Entry[]>();
  for (const e of [...entries].sort(newestFirst)) {
    if (!readable(e)) continue;
    const key = seriesKey(e.data.name, familyOfUnit(e.data.unit)!);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const latest = list[0]!;
    const byDay = new Map<string, Entry[]>();
    for (const e of list) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
    const days = [...byDay.entries()]
      .map(([date, dayEntries]) => ({
        date,
        value: Number(dayEntries[0]!.data.value),
        count: dayEntries.length,
        entry: dayEntries[0]!,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const family = familyOfUnit(latest.data.unit)!;
    return {
      key,
      name: String(latest.data.name).trim(),
      family,
      bodyweight: family === "mass" && isBodyweightName(latest.data.name),
      entries: list,
      days,
      latest,
    };
  });
}

// ---- Values in the lifter's units ------------------------------------------

/** A stored value in display units, unrounded. */
export function toDisplay(value: number, unit: unknown, units: Units) {
  return displayMeasurement(value, String(unit), units).value;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
export function valueText(value: number, family: Family, units: Units) {
  const shown = round1(toDisplay(value, STORED_UNIT[family], units));
  const u = displayUnit(family, units);
  return `${shown.toLocaleString(undefined, { maximumFractionDigits: 1 })}${u === "%" ? " %" : ` ${u}`}`;
}
export const entryText = (e: Entry, units: Units) =>
  valueText(Number(e.data.value), familyOfUnit(e.data.unit)!, units);

/** A signed difference in display units ("−0.3 kg", "+1 cm", "No change"). */
export function changeText(delta: number, family: Family, units: Units) {
  const shown = round1(
    family === "percent"
      ? delta
      : family === "mass"
        ? units === "lb"
          ? kgToLb(delta)
          : delta
        : units === "lb"
          ? cmToIn(delta)
          : delta,
  );
  if (shown === 0) return "No change";
  const u = displayUnit(family, units);
  const n = Math.abs(shown).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  return `${shown > 0 ? "+" : "−"}${n}${u === "%" ? " %" : ` ${u}`}`;
}

/** A stored value as the edit field shows it: display units, ≤ 2 decimals. */
export const editText = (e: Entry, units: Units) =>
  String(
    Math.round(toDisplay(Number(e.data.value), e.data.unit, units) * 100) / 100,
  );

// ---- Ranges and comparisons ------------------------------------------------

export const RANGES = ["1M", "3M", "6M", "1Y", "All"] as const;
export type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  All: Infinity,
};

/** Day number of a local date (whole days since the epoch, DST-proof). */
export function dayNumber(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}
export function rangeStart(today: string, range: Range) {
  return dayNumber(today) - RANGE_DAYS[range];
}
export function inRange(s: Series, today: string, range: Range) {
  const start = rangeStart(today, range);
  return s.days.filter((d) => dayNumber(d.date) >= start);
}
/** 3M when it holds at least two days of entries, otherwise All. */
export function defaultRange(s: Series, today: string): Range {
  return inRange(s, today, "3M").length >= 2 ? "3M" : "All";
}

export type Change = { delta: number; since: string };

/** Latest day against the previous day with an entry. */
export function sincePrevious(s: Series): Change | undefined {
  const last = s.days[s.days.length - 1];
  const prev = s.days[s.days.length - 2];
  if (!last || !prev) return undefined;
  return { delta: last.value - prev.value, since: prev.date };
}

/**
 * Latest day against the newest day on or before the range's start; for All
 * (or when nothing precedes the range), against the first day in the range.
 * Undefined unless both days are real and different.
 */
export function overRange(
  s: Series,
  today: string,
  range: Range,
): Change | undefined {
  const last = s.days[s.days.length - 1];
  if (!last) return undefined;
  const start = rangeStart(today, range);
  const before = [...s.days].reverse().find((d) => dayNumber(d.date) <= start);
  const base = before ?? inRange(s, today, range)[0];
  if (!base || base.date === last.date) return undefined;
  return { delta: last.value - base.value, since: base.date };
}

/** Where a chart line should break: gaps longer than this many days. */
export const GAP_DAYS = 30;

// ---- Entering values ---------------------------------------------------------

export type Draft = { value: string; family: Family; name: string };

/** A typed value in display units → stored value and unit, or what to fix. */
export function readValue(
  text: string,
  family: Family,
  units: Units,
): { value: number; unit: "kg" | "cm" | "percent" } | { error: string } {
  const t = decimalText(text.trim());
  if (!t) return { error: "Enter a number, e.g. 81.5" };
  const n = Number(t);
  if (!/^\d*\.?\d*$/.test(t) || !Number.isFinite(n))
    return { error: "Enter a number, e.g. 81.5" };
  if (n <= 0) return { error: "Enter a number greater than 0" };
  if (family === "percent") {
    if (n > 100) return { error: "Enter a percentage up to 100" };
    return { value: n, unit: "percent" };
  }
  const typedUnit = family === "mass" ? units : units === "lb" ? "in" : "cm";
  const converted = canonicalMeasurement(n, typedUnit);
  // Only binary floating-point noise is removed (33 in → 83.82 cm, not
  // 83.82000000000001); nothing meaningful is rounded.
  const stored = {
    ...converted,
    value: Math.round(converted.value * 1e6) / 1e6,
  };
  if (stored.value < 0.01 || stored.value > 10000)
    return { error: "That value is outside what can be recorded" };
  return stored as { value: number; unit: "kg" | "cm" };
}

/**
 * A gentle check before saving an unusual value (never blocks): returns a
 * question to confirm, or undefined.
 */
export function plausibility(
  stored: number,
  family: Family,
  bodyweight: boolean,
  previous: number | undefined,
  units: Units,
): string | undefined {
  if (bodyweight && (stored < 25 || stored > 350))
    return `${valueText(stored, family, units)} is outside the usual range for bodyweight. Save it anyway?`;
  if (family === "length" && (stored < 5 || stored > 300))
    return `${valueText(stored, family, units)} is outside the usual range for a body measurement. Save it anyway?`;
  if (previous !== undefined && previous > 0) {
    const diff = stored - previous;
    if (Math.abs(diff) / previous > 0.15)
      return `That's ${changeText(diff, family, units).replace(/^[+−]/, "")} ${diff < 0 ? "less" : "more"} than your last entry (${valueText(previous, family, units)}). Save it anyway?`;
  }
  return undefined;
}

/** A new record in the existing shape (validated like any journal entry). */
export function newRecord(
  name: string,
  stored: { value: number; unit: string },
  notes: string,
) {
  const data: Journal["data"] = {
    name: name.trim(),
    value: stored.value,
    unit: stored.unit,
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  };
  validateJournal("measurement", data);
  return data;
}

/**
 * An edit: only fields that changed are merged into the original; every
 * other key keeps its exact value and type. Undefined when nothing changed,
 * so an untouched save writes nothing (and queues nothing for sync).
 */
export function editedRecord(
  original: Entry,
  next: {
    name: string;
    valueText: string;
    notes: string;
    date: string;
  },
  units: Units,
): { data: Journal["data"]; date: string } | { error: string } | undefined {
  const family = familyOfUnit(original.data.unit);
  if (!family) return { error: "This entry's unit can't be edited here" };
  const changes: Journal["data"] = {};
  const name = next.name.trim();
  if (!name) return { error: "Enter a name" };
  if (name !== String(original.data.name ?? "").trim()) changes.name = name;
  if (next.valueText.trim() !== editText(original, units)) {
    const read = readValue(next.valueText, family, units);
    if ("error" in read) return read;
    if (read.value !== Number(original.data.value)) {
      changes.value = read.value;
      changes.unit = read.unit;
    }
  }
  const notes = next.notes.trim();
  const before = String(original.data.notes ?? "").trim();
  if (notes !== before) changes.notes = notes;
  const dateChanged = next.date !== original.date;
  if (!Object.keys(changes).length && !dateChanged) return undefined;
  const data = { ...original.data };
  for (const [k, v] of Object.entries(changes)) {
    if (k === "notes" && v === "" && !("notes" in original.data)) continue;
    data[k] = v;
  }
  validateJournal("measurement", data);
  return { data, date: next.date };
}

// ---- Profile weight offer ------------------------------------------------------

export const PROFILE_WEIGHT_OFFER = "measurementProfileWeightOffer";

/** Offer the profile weight as a first weigh-in only when none exists. */
export function profileWeightOffer(
  entries: Entry[],
  profileWeightKg: number,
  settled: boolean,
) {
  if (settled) return undefined;
  if (!(
    Number.isFinite(profileWeightKg) &&
    profileWeightKg >= 0.01 &&
    profileWeightKg <= 10000
  ))
    return undefined;
  if (entries.some((e) => isBodyweightName(e.data.name))) return undefined;
  return profileWeightKg;
}
