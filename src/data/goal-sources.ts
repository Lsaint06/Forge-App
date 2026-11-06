import type { Repository } from "./repository";
import { localDate } from "../domain/types";
import { elapsedSeconds, volume } from "../domain/metrics";
import { isWorkingSet, loadKind } from "../domain/progress/strength";
import type { DatedWorkout, LiftSet, Sources, Units } from "../domain/goals";

/**
 * Everything goals read, from the repository, computed lazily: weigh-ins,
 * completed workouts (dated by their local finish day), each workout's
 * recorded volume, working sets per exercise and logged calories per day.
 * Read-only; nothing is written.
 */
export function goalSources(
  r: Repository,
  today: string,
  units: Units,
): Sources {
  const completed = r.workouts().filter((w) => w.status === "completed");
  const workouts: DatedWorkout[] = completed.map((w) => {
    const end = w.finishedAt ?? w.startedAt;
    return {
      id: w.id,
      date: localDate(end),
      time: end,
      minutes: elapsedSeconds(w.startedAt, end, w.pausedMs) / 60,
    };
  });
  const volumes = new Map<string, number>();
  const lifts = new Map<string, LiftSet[]>();
  let calories: Map<string, number> | undefined;
  return {
    today,
    units,
    measurements: r.journal("measurement"),
    workouts,
    volumeOf: (id) => {
      if (!volumes.has(id)) volumes.set(id, volume(r.workoutSets(id)));
      return volumes.get(id)!;
    },
    lifts: (exerciseId) => {
      const cached = lifts.get(exerciseId);
      if (cached) return cached;
      // This exercise's sets in completed workouts, in two reads, where
      // reading every workout's rows took one per workout (Phase 8.5).
      const done = r.exerciseHistory(exerciseId);
      const sets: LiftSet[] = [];
      for (const w of workouts)
        for (const s of done.get(w.id) ?? [])
          if (isWorkingSet(s))
            sets.push({
              date: w.date,
              time: w.time,
              weight: s.weight,
              reps: s.reps,
            });
      lifts.set(exerciseId, sets);
      return sets;
    },
    exercise: (exerciseId) => {
      const e = r.exercise(exerciseId);
      return e ? { name: e.name, load: loadKind(e) === "load" } : undefined;
    },
    // Every food entry is read only when a nutrition goal first asks (Phase
    // 8.5): Home evaluates goals on every render.
    get calories() {
      if (!calories) {
        calories = new Map<string, number>();
        for (const e of r.journal("nutrition")) {
          const c = Number(e.data.calories) * Number(e.data.quantity);
          if (!Number.isFinite(c)) continue;
          calories.set(e.date, (calories.get(e.date) ?? 0) + c);
        }
      }
      return calories;
    },
  };
}
