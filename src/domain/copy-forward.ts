import type { WorkoutSet } from "./types";

// Weight copy-forward: entering a working set's load fills the empty working
// sets that follow it in the same exercise, so a lifter types a load once.
//
// The data model cannot tell an untouched 0 from a typed 0, so the rule is
// conservative and remembers, for the open logger only, which sets the
// lifter typed into and which Forge filled:
// - only a working set's load is copied, only into later working sets;
// - a later set qualifies if it is not done and either still holds 0 and was
//   never typed into, or holds a load Forge copied (so editing set 1 again
//   updates the copies);
// - copying stops at the first set that does not qualify, such as one with
//   its own load or one already done. Reps, rest and set counts never change.

export type FillMemory = {
  /** Sets whose load the lifter typed or chose this session. */
  touched: ReadonlySet<string>;
  /** Sets whose load Forge copied this session. */
  filled: ReadonlySet<string>;
};

/** The sets (ids, in order) that should receive `sourceId`'s new load. */
export function copyForwardTargets(
  sets: WorkoutSet[],
  sourceId: string,
  memory: FillMemory,
): string[] {
  const ordered = [...sets].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((s) => s.id === sourceId);
  const source = ordered[index];
  if (!source || source.kind !== "working") return [];
  const targets: string[] = [];
  for (const s of ordered.slice(index + 1)) {
    const eligible =
      !s.completed &&
      s.kind === "working" &&
      !memory.touched.has(s.id) &&
      (s.weight === 0 || memory.filled.has(s.id));
    if (!eligible) break;
    targets.push(s.id);
  }
  return targets;
}

/** The values "use previous" copies from the last session's matching set. */
export function previousValues(
  previous: WorkoutSet,
  category: string,
): Partial<Pick<WorkoutSet, "weight" | "reps" | "duration" | "distance">> {
  if (category === "duration") return { duration: previous.duration };
  if (category === "distance")
    return { distance: previous.distance, duration: previous.duration };
  return { weight: previous.weight, reps: previous.reps };
}

/** Whether a previous set holds anything worth copying. */
export function hasPrevious(
  previous: WorkoutSet | undefined,
  category: string,
) {
  if (!previous) return false;
  if (category === "duration") return previous.duration > 0;
  if (category === "distance") return previous.distance > 0;
  return previous.reps > 0;
}
