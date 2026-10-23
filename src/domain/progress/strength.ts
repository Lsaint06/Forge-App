import type { Exercise, WorkoutSet } from "../types";
import { estimatedMax } from "../metrics";

// Strength progression and personal records (Design System 2.0, Phase 5).
// Everything here is derived from stored workouts on demand and never
// written back, so editing or deleting history always yields consistent
// records. Weights are kilograms, as stored; conversion happens at display.
// Rules and limitations: docs/PROGRESS_METRICS.md.

/**
 * How an exercise's logged weight can be read.
 * - "load": external load (barbell, dumbbell, cable, machine…), comparable
 *   across sessions; eligible for load records and the 1RM estimate.
 * - "reps": bodyweight-based or assisted movements and bands. Forge cannot
 *   tell assistance from added load, so only repetitions are compared.
 * - "none": timed or distance work, or an unknown exercise.
 */
export type LoadKind = "load" | "reps" | "none";

const repsOnlyEquipment = new Set([
  "Bodyweight",
  "Pull-up bar",
  "Gymnastic rings",
  "Suspension trainer",
  "None",
  "Resistance band",
  "Stability ball",
  "Ab wheel",
  "Assisted pull-up machine",
]);

export function loadKind(
  e:
    | Partial<Pick<Exercise, "id" | "name" | "equipment" | "category">>
    | undefined,
): LoadKind {
  if (!e || (e.category ?? "strength") !== "strength") return "none";
  if (/assist/i.test(`${e.id ?? ""} ${e.name ?? ""} ${e.equipment ?? ""}`))
    return "reps";
  if (e.equipment && repsOnlyEquipment.has(e.equipment)) return "reps";
  return "load";
}

/** The 1RM estimate covers sets of 1–12 reps (Epley; 1 rep is the load). */
export const E1RM_MAX_REPS = 12;
const EPSILON = 1e-6;
const weightKey = (kg: number) => Math.round(kg * 1000) / 1000;

/** A completed, non-warm-up set with at least one rep. */
export const isWorkingSet = (
  s: Pick<WorkoutSet, "completed" | "kind" | "reps">,
) => s.completed && s.kind !== "warmup" && s.reps > 0;

/** One exercise in one completed workout (all its rows merged). */
export type LoggedExercise = {
  workoutId: string;
  workoutName: string;
  exerciseId: string;
  /** Local calendar date the workout finished. */
  date: string;
  /** Finish time, for ordering. */
  time: number;
  sets: Pick<WorkoutSet, "weight" | "reps" | "kind" | "completed">[];
};

export type SetValue = { weight: number; reps: number };

export type SessionBest = {
  workoutId: string;
  exerciseId: string;
  date: string;
  time: number;
  workingSets: number;
  /** Heaviest working set and the most reps done at that weight. */
  topSet?: SetValue;
  /** Highest 1RM estimate and the set it came from. */
  e1rm?: { value: number; set: SetValue };
  /** Most reps in a single working set (and its weight). */
  mostReps?: SetValue;
  /** Most reps at each exact weight. */
  repsAtWeight: Map<number, number>;
};

export function sessionBest(
  entry: LoggedExercise,
  kind: LoadKind,
): SessionBest | undefined {
  if (kind === "none") return undefined;
  const working = entry.sets.filter(isWorkingSet);
  if (!working.length) return undefined;
  const best: SessionBest = {
    workoutId: entry.workoutId,
    exerciseId: entry.exerciseId,
    date: entry.date,
    time: entry.time,
    workingSets: working.length,
    repsAtWeight: new Map(),
  };
  for (const s of working)
    if (!best.mostReps || s.reps > best.mostReps.reps)
      best.mostReps = { weight: s.weight, reps: s.reps };
  if (kind === "load")
    for (const s of working.filter((x) => x.weight > 0)) {
      const w = weightKey(s.weight);
      best.repsAtWeight.set(w, Math.max(best.repsAtWeight.get(w) ?? 0, s.reps));
      if (
        !best.topSet ||
        w > best.topSet.weight + EPSILON ||
        (Math.abs(w - best.topSet.weight) < EPSILON &&
          s.reps > best.topSet.reps)
      )
        best.topSet = { weight: w, reps: s.reps };
      const e = estimatedMax(s.weight, s.reps);
      if (e > 0 && (!best.e1rm || e > best.e1rm.value + EPSILON))
        best.e1rm = { value: e, set: { weight: w, reps: s.reps } };
    }
  return best;
}

/** Groups a training log by exercise, merging rows within a workout. */
export function byExercise(log: LoggedExercise[]) {
  const map = new Map<string, LoggedExercise[]>();
  for (const entry of [...log].sort((a, b) => a.time - b.time)) {
    const list = map.get(entry.exerciseId) ?? [];
    const same = list.find((x) => x.workoutId === entry.workoutId);
    if (same) same.sets = [...same.sets, ...entry.sets];
    else list.push({ ...entry, sets: [...entry.sets] });
    map.set(entry.exerciseId, list);
  }
  return map;
}

/** Session bests in chronological order (sessions without data dropped). */
export function sessionBests(entries: LoggedExercise[], kind: LoadKind) {
  return entries
    .map((e) => sessionBest(e, kind))
    .filter((b): b is SessionBest => !!b)
    .sort((a, b) => a.time - b.time);
}

// ---- Progression ---------------------------------------------------------

export type Metric = "e1rm" | "top" | "reps";

export function defaultMetric(kind: LoadKind, bests: SessionBest[]): Metric {
  if (kind !== "load") return "reps";
  return bests.some((b) => b.e1rm)
    ? "e1rm"
    : bests.some((b) => b.topSet)
      ? "top"
      : "reps";
}

export const metricValue = (b: SessionBest, metric: Metric) =>
  metric === "e1rm"
    ? b.e1rm?.value
    : metric === "top"
      ? b.topSet?.weight
      : b.mostReps?.reps;

/** One point per session that has a value for the metric. */
export function progressionSeries(bests: SessionBest[], metric: Metric) {
  return bests.flatMap((b) => {
    const value = metricValue(b, metric);
    return value === undefined
      ? []
      : [{ date: b.date, time: b.time, workoutId: b.workoutId, value }];
  });
}

export type Comparison =
  | { kind: "weight"; delta: number; reps: number }
  | { kind: "e1rm"; delta: number }
  | { kind: "reps"; delta: number }
  | { kind: "none" };

/**
 * Latest session against the one before it. Weights are compared directly
 * only at the same reps; otherwise the 1RM estimate (both sets within 1–12
 * reps) is compared; otherwise no comparison is made.
 */
export function compareLatest(bests: SessionBest[], kind: LoadKind) {
  const latest = bests.at(-1);
  const previous = bests.at(-2);
  if (!latest) return undefined;
  let comparison: Comparison = { kind: "none" };
  if (previous) {
    if (kind === "load") {
      if (
        latest.topSet &&
        previous.topSet &&
        latest.topSet.reps === previous.topSet.reps
      )
        comparison = {
          kind: "weight",
          delta: latest.topSet.weight - previous.topSet.weight,
          reps: latest.topSet.reps,
        };
      else if (latest.e1rm && previous.e1rm)
        comparison = {
          kind: "e1rm",
          delta: latest.e1rm.value - previous.e1rm.value,
        };
    } else if (latest.mostReps && previous.mostReps)
      comparison = {
        kind: "reps",
        delta: latest.mostReps.reps - previous.mostReps.reps,
      };
  }
  return { latest, previous, comparison };
}

// ---- Records -------------------------------------------------------------

export type RecordCategory =
  "heaviest" | "e1rm" | "reps-at-weight" | "most-reps";

export type RecordEvent = {
  exerciseId: string;
  workoutId: string;
  date: string;
  time: number;
  /** Most significant first. */
  categories: RecordCategory[];
  heaviest?: SetValue;
  e1rm?: { value: number; set: SetValue };
  repsAtWeight?: SetValue;
  mostReps?: number;
};

type Held<T> = T & { date: string; workoutId: string };

export type ExerciseRecords = {
  exerciseId: string;
  kind: LoadKind;
  sessions: number;
  heaviest?: Held<SetValue>;
  e1rm?: Held<{ value: number; set: SetValue }>;
  mostReps?: Held<SetValue>;
  /** Most reps at each weight, heaviest first. */
  repsAtWeight: Held<SetValue>[];
};

/**
 * Current bests and the moments they were beaten. A record event needs an
 * earlier session to beat: an exercise's first session sets the baseline and
 * is not celebrated, and matching a best is not a record (the earliest
 * holder keeps it). Repetition records count only at a weight lifted before.
 */
export function exerciseRecords(bests: SessionBest[], kind: LoadKind) {
  const exerciseId = bests[0]?.exerciseId ?? "";
  const records: ExerciseRecords = {
    exerciseId,
    kind,
    sessions: bests.length,
    repsAtWeight: [],
  };
  const atWeight = new Map<number, Held<SetValue>>();
  const events: RecordEvent[] = [];
  for (const b of bests) {
    const where = { date: b.date, workoutId: b.workoutId };
    const event: RecordEvent = {
      exerciseId,
      workoutId: b.workoutId,
      date: b.date,
      time: b.time,
      categories: [],
    };
    if (kind === "load") {
      if (b.topSet) {
        if (!records.heaviest) records.heaviest = { ...b.topSet, ...where };
        else if (b.topSet.weight > records.heaviest.weight + EPSILON) {
          records.heaviest = { ...b.topSet, ...where };
          event.categories.push("heaviest");
          event.heaviest = b.topSet;
        }
      }
      if (b.e1rm) {
        if (!records.e1rm) records.e1rm = { ...b.e1rm, ...where };
        else if (b.e1rm.value > records.e1rm.value + EPSILON) {
          records.e1rm = { ...b.e1rm, ...where };
          event.categories.push("e1rm");
          event.e1rm = b.e1rm;
        }
      }
      let repRecord: SetValue | undefined;
      for (const [weight, reps] of b.repsAtWeight) {
        const held = atWeight.get(weight);
        if (!held) atWeight.set(weight, { weight, reps, ...where });
        else if (reps > held.reps) {
          atWeight.set(weight, { weight, reps, ...where });
          if (!repRecord || weight > repRecord.weight)
            repRecord = { weight, reps };
        }
      }
      if (repRecord) {
        event.categories.push("reps-at-weight");
        event.repsAtWeight = repRecord;
      }
    } else if (b.mostReps) {
      if (!records.mostReps) records.mostReps = { ...b.mostReps, ...where };
      else if (b.mostReps.reps > records.mostReps.reps) {
        records.mostReps = { ...b.mostReps, ...where };
        event.categories.push("most-reps");
        event.mostReps = b.mostReps.reps;
      }
    }
    if (event.categories.length) events.push(event);
  }
  records.repsAtWeight = [...atWeight.values()].sort(
    (a, b) => b.weight - a.weight,
  );
  return { records, events };
}
