import type { Prescription } from "./types";

export function repRangeLabel(item: Pick<Prescription, "reps" | "repMax">) {
  return item.repMax != null && item.repMax !== item.reps
    ? `${item.reps}-${item.repMax}`
    : String(item.reps);
}

const minutes = (seconds: number) => Math.round((seconds / 60) * 2) / 2;
// "rest 2–3 min" from a rest guidance range in seconds.
export const restGuidanceLabel = (rest: { min: number; max: number }) =>
  rest.min === rest.max
    ? `rest ${minutes(rest.min)} min`
    : `rest ${minutes(rest.min)}–${minutes(rest.max)} min`;
