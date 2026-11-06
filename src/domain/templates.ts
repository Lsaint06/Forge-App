import type { Prescription } from "./types";
import { loadText } from "./progress/format";
import { kgToLb, lbToKg } from "./metrics";

// Template prescriptions as the editor and library present them. Loads are
// stored in kilograms and shown in the lifter's units.

type Units = "kg" | "lb";

/** "1:30" for 90 seconds, "45s" under a minute. */
export function restText(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "6", or "6–8" for a range. */
export const repsText = (p: Pick<Prescription, "reps" | "repMax">) =>
  p.repMax !== undefined && p.repMax !== p.reps
    ? `${p.reps}–${p.repMax}`
    : String(p.reps);

/** "3 × 6–8 · 135 lb · 1:30 rest" (no load when none is set). */
export function prescriptionLine(p: Prescription, units: Units) {
  return [
    `${p.sets} × ${repsText(p)}`,
    p.weight > 0 ? loadText(p.weight, units) : undefined,
    `${restText(p.rest)} rest`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A stored load (kg) in display units, rounded so lb never drifts. */
export const loadForDisplay = (kg: number, units: Units) =>
  Math.round((units === "lb" ? kgToLb(kg) : kg) * 100) / 100;

/** A load entered in display units, as stored (kg). */
export const loadForStorage = (value: number, units: Units) =>
  units === "lb" ? lbToKg(value) : value;

/** The load step for ± buttons: the profile increment, or 5 lb. */
export const loadStep = (incrementKg: number, units: Units) =>
  units === "lb" ? 5 : incrementKg;

/** Exercise names for a template line: "Bench Press, Row and 2 more". */
export function exerciseNames(names: string[], shown = 2) {
  if (names.length <= shown + 1) return names.join(", ");
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}

/** Moves the item at `from` to `to`, keeping every other item's order. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(items.length - 1, to));
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item!);
  return copy;
}
