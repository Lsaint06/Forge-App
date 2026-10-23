import type { LoadKind, LoggedExercise } from "./strength";
import { isWorkingSet } from "./strength";
import type { Bucket } from "./range";

// Training volume and muscle distribution (Design System 2.0, Phase 5).
// - Working sets: completed, non-warm-up sets with at least one rep, any
//   exercise.
// - Load volume: weight × reps of those sets, for exercises whose logged
//   weight is external load only. Bodyweight-based and assisted movements
//   are left out: their logged number may be assistance.
// - Muscles: each working set counts once, for the exercise's primary
//   muscle. Secondary muscles are not credited, so compound lifts are under-
//   rather than over-counted.

export type ExerciseInfo = { kind: LoadKind; muscle: string };

export function volumeBuckets(
  log: LoggedExercise[],
  info: (exerciseId: string) => ExerciseInfo,
  list: Bucket[],
) {
  return list.map((b) => {
    let workingSets = 0;
    let loadVolume = 0;
    for (const e of log) {
      if (e.date < b.start || e.date > b.end) continue;
      const kind = info(e.exerciseId).kind;
      for (const s of e.sets) {
        if (!isWorkingSet(s)) continue;
        workingSets++;
        if (kind === "load") loadVolume += s.weight * s.reps;
      }
    }
    return { start: b.start, end: b.end, workingSets, loadVolume };
  });
}

export function muscleSets(
  log: LoggedExercise[],
  info: (exerciseId: string) => ExerciseInfo,
) {
  const sets = new Map<string, number>();
  for (const e of log) {
    const n = e.sets.filter(isWorkingSet).length;
    if (!n) continue;
    const { kind, muscle } = info(e.exerciseId);
    if (kind === "none") continue;
    sets.set(muscle, (sets.get(muscle) ?? 0) + n);
  }
  return [...sets.entries()]
    .map(([muscle, count]) => ({ muscle, sets: count }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}
