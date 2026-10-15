import type { Prescription } from "./types";

export function repRangeLabel(item: Pick<Prescription, "reps" | "repMax">) {
  return item.repMax != null && item.repMax !== item.reps
    ? `${item.reps}-${item.repMax}`
    : String(item.reps);
}
