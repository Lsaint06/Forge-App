import { loadIn } from "../workout-display";
import type { RecordCategory, RecordEvent, SetValue } from "./strength";

type Units = "kg" | "lb";

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "102.5 kg" in the lifter's units. */
export const loadText = (kg: number, units: Units) =>
  `${trim(loadIn(kg, units))} ${units}`;

/** Estimates are shown to one decimal: "121.7 kg". */
export const estimateText = (kg: number, units: Units) =>
  `${Math.round(loadIn(kg, units) * 10) / 10} ${units}`;

/** "100 kg × 5" */
export const setText = (s: SetValue, units: Units) =>
  `${loadText(s.weight, units)} × ${s.reps}`;

/** "8,420", "48.2k", "1.2M" */
export function compactNumber(n: number) {
  const v = Math.round(n);
  if (Math.abs(v) < 10000) return v.toLocaleString();
  if (Math.abs(v) < 1e6)
    return `${Math.round(v / (Math.abs(v) < 1e5 ? 100 : 1000)) / (Math.abs(v) < 1e5 ? 10 : 1)}k`;
  return `${Math.round(v / 1e5) / 10}M`;
}

/** "+2.5 kg", "−1 rep", "±0 kg" */
export function signed(n: number, unit: string) {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return `±0 ${unit}`;
  return `${r > 0 ? "+" : "−"}${Math.abs(r)} ${unit}`;
}

export const categoryLabel: Record<RecordCategory, string> = {
  heaviest: "Heaviest set",
  e1rm: "Estimated 1RM",
  "reps-at-weight": "Rep record",
  "most-reps": "Most reps",
};

/** The headline of a record event: its most significant category. */
export function recordHeadline(e: RecordEvent, units: Units) {
  const top = e.categories[0]!;
  const value =
    top === "heaviest"
      ? setText(e.heaviest!, units)
      : top === "e1rm"
        ? estimateText(e.e1rm!.value, units)
        : top === "reps-at-weight"
          ? setText(e.repsAtWeight!, units)
          : `${e.mostReps} reps`;
  return { label: categoryLabel[top], value };
}
