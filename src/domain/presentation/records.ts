import type {
  RecordCategory,
  RecordEvent,
  SessionBest,
} from "../progress/strength";

// The Progress PR highlight (Phase 7.4E, decision P1): which record to show
// and how far it moved past the best it beat. Presentation only: records and
// how they are found (`exerciseRecords`) are unchanged.

/** Most significant first, as `RecordEvent.categories` orders them. */
const SIGNIFICANCE: RecordCategory[] = [
  "heaviest",
  "e1rm",
  "reps-at-weight",
  "most-reps",
];

/**
 * The newest record. Records from the same workout (same finish time) are
 * ordered by their headline category (heaviest set, then estimated 1RM,
 * then reps at a weight, then most reps), then by exercise id, so the
 * choice never depends on storage order.
 */
export function latestRecord(events: RecordEvent[]) {
  return [...events].sort(
    (a, b) =>
      b.time - a.time ||
      SIGNIFICANCE.indexOf(a.categories[0]!) -
        SIGNIFICANCE.indexOf(b.categories[0]!) ||
      a.exerciseId.localeCompare(b.exerciseId),
  )[0];
}

export type RecordGain = {
  category: RecordCategory;
  /** The best this record beat, from the exercise's earlier sessions. */
  previous: number;
  /** Kilograms for heaviest set and estimated 1RM; repetitions otherwise. */
  delta: number;
  /** For reps at a weight: the weight (kg). */
  weight?: number;
};

const most = (values: (number | undefined)[]) => {
  const known = values.filter((v): v is number => v !== undefined);
  return known.length ? Math.max(...known) : undefined;
};

/**
 * The headline category's gain over the best held before this record, read
 * from the exercise's earlier session bests exactly as `exerciseRecords`
 * compares them. Undefined only if no earlier session holds that best.
 */
export function recordGain(
  event: RecordEvent,
  bests: SessionBest[],
): RecordGain | undefined {
  const category = event.categories[0];
  const earlier = bests.filter((b) => b.time < event.time);
  let now: number | undefined;
  let previous: number | undefined;
  let weight: number | undefined;
  if (category === "heaviest") {
    now = event.heaviest?.weight;
    previous = most(earlier.map((b) => b.topSet?.weight));
  } else if (category === "e1rm") {
    now = event.e1rm?.value;
    previous = most(earlier.map((b) => b.e1rm?.value));
  } else if (category === "reps-at-weight") {
    weight = event.repsAtWeight?.weight;
    now = event.repsAtWeight?.reps;
    previous =
      weight === undefined
        ? undefined
        : most(earlier.map((b) => b.repsAtWeight.get(weight!)));
  } else if (category === "most-reps") {
    now = event.mostReps;
    previous = most(earlier.map((b) => b.mostReps?.reps));
  }
  if (!category || now === undefined || previous === undefined)
    return undefined;
  return { category, previous, delta: now - previous, weight };
}
