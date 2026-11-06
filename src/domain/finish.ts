import type { WorkoutSet } from "./types";

// Finishing a workout: only sets marked done count toward progress. Sets
// that hold a recordable result but were never ticked are surfaced so the
// lifter decides, rather than having them silently left out.

/**
 * A set with a result that can be recorded: reps, time or distance. A load
 * alone is not a set, and the repository refuses to complete one.
 */
export const hasValues = (s: WorkoutSet) =>
  s.reps > 0 || s.duration > 0 || s.distance > 0;

export type UnmarkedGroup<Row> = {
  row: Row;
  /** Unticked sets with values, with their 1-based number in the exercise. */
  sets: { set: WorkoutSet; number: number }[];
};

/** Exercises (in order) that have unticked sets holding values. */
export function unmarkedSets<Row>(
  exercises: { row: Row; sets: WorkoutSet[] }[],
): UnmarkedGroup<Row>[] {
  return exercises
    .map(({ row, sets }) => ({
      row,
      sets: sets
        .map((set, i) => ({ set, number: i + 1 }))
        .filter(({ set }) => !set.completed && hasValues(set)),
    }))
    .filter((g) => g.sets.length > 0);
}

/** "Sets 2 and 3", "Set 4", "Sets 1, 2 and 4". */
export function setNumbers(numbers: number[]) {
  if (numbers.length === 1) return `Set ${numbers[0]}`;
  return `Sets ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}
