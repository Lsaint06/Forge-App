import type { Workout, WorkoutSet } from "./types";
import { localDate } from "./types";
type Performance = {
  weight: number;
  reps: number;
  completed: boolean;
  kind: string;
  rpe?: number | null;
  rir?: number | null;
};
export const kgToLb = (kg: number) => kg * 2.2046226218487757;
export const lbToKg = (lb: number) => lb / 2.2046226218487757;
export const cmToIn = (cm: number) => cm / 2.54;
export const inToCm = (inch: number) => inch * 2.54;
export function volume(sets: Performance[]) {
  return sets.reduce(
    (sum, s) =>
      sum + (s.completed && s.kind !== "warmup" ? s.weight * s.reps : 0),
    0,
  );
}
export function estimatedMax(weight: number, reps: number) {
  return weight > 0 && reps > 0 && reps <= 12
    ? reps === 1
      ? weight
      : weight * (1 + reps / 30)
    : 0;
}
export function elapsedSeconds(
  start: number,
  now: number,
  pausedMs = 0,
  pausedAt: number | null = null,
) {
  return Math.max(0, Math.floor(((pausedAt ?? now) - start - pausedMs) / 1000));
}
export function clock(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function overload(
  history: Performance[][],
  rule: { min: number; max: number; increment: number },
) {
  const sessions = history
    .map((h) => h.filter((s) => s.completed && s.kind !== "warmup"))
    .filter((h) => h.length);
  const last = sessions[0];
  if (!last)
    return {
      weight: 0,
      reason: "Log working sets to establish a starting load.",
    };
  const weight = Math.max(...last.map((s) => s.weight));
  const recent = sessions.slice(0, 2);
  if (
    recent.length === 2 &&
    recent.every((h) =>
      h.every(
        (s) =>
          s.reps >= rule.max &&
          (s.rpe == null || s.rpe <= 8) &&
          (s.rir == null || s.rir >= 2),
      ),
    )
  )
    return {
      weight: weight + rule.increment,
      reason:
        "Upper rep target reached in two sessions with manageable effort. Try one increment.",
    };
  if (
    recent.length === 2 &&
    recent.every((h) => h.every((s) => s.reps < rule.min))
  )
    return {
      weight: Math.round(weight * 0.9 * 100) / 100,
      reason:
        "Two sessions below the minimum rep target. Consider a 10% reduction and review recovery.",
    };
  return {
    weight,
    reason:
      "Maintain load until all working sets consistently reach the upper rep target. Override as needed.",
  };
}
export function nutritionTotals(
  entries: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    quantity: number;
  }[],
) {
  return entries.reduce(
    (t, e) => ({
      calories: t.calories + e.calories * e.quantity,
      protein: t.protein + e.protein * e.quantity,
      carbs: t.carbs + e.carbs * e.quantity,
      fat: t.fat + e.fat * e.quantity,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
export function readiness(e: {
  sleep: number;
  quality: number;
  soreness: number;
  energy: number;
  stress: number;
}) {
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        ((Math.min(8, e.sleep) / 8 +
          (e.quality - 1) / 4 +
          (5 - e.soreness) / 4 +
          (e.energy - 1) / 4 +
          (5 - e.stress) / 4) /
          5) *
          100,
      ),
    ),
  );
  return {
    score,
    reason:
      "Equal weighting: sleep up to 8 hours, sleep quality, inverse soreness, energy and inverse stress. A subjective training aid, not a medical assessment.",
  };
}
/** The threshold of the "10,000 kg lifted" milestone (total volume, kg). */
export const VOLUME_MILESTONE_KG = 10000;
/**
 * Every milestone with whether it is earned (Progress shows both, 7.4F).
 * Thresholds and names are unchanged; `achievements` is the earned ones.
 */
export function milestoneList(
  count: number,
  totalVolume: number,
  prCount: number,
) {
  return [
    { id: "first", name: "First spark", ok: count >= 1 },
    { id: "ten", name: "Built a habit · 10 workouts", ok: count >= 10 },
    { id: "hundred", name: "Forged · 100 workouts", ok: count >= 100 },
    {
      id: "volume",
      name: "10,000 kg lifted",
      ok: totalVolume >= VOLUME_MILESTONE_KG,
    },
    { id: "pr", name: "New territory · first PR", ok: prCount > 0 },
  ];
}
export function achievements(
  count: number,
  totalVolume: number,
  prCount: number,
) {
  return milestoneList(count, totalVolume, prCount).filter((x) => x.ok);
}
export const resolveRevision = (base: number, remote: number) =>
  base === remote ? "upload" : "conflict";
export function records(sets: WorkoutSet[]) {
  const done = sets.filter((s) => s.completed && s.kind !== "warmup");
  return {
    load: Math.max(0, ...done.map((s) => s.weight)),
    reps: Math.max(0, ...done.map((s) => s.reps)),
    estimatedMax: Math.max(
      0,
      ...done.map((s) => estimatedMax(s.weight, s.reps)),
    ),
    volume: volume(done),
  };
}
export function summary(
  workouts: Workout[],
  getSets: (id: string) => WorkoutSet[],
  now = Date.now(),
) {
  const done = workouts.filter((w) => w.status === "completed");
  const today = localDate(now);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const week = done.filter(
    (w) =>
      (w.finishedAt ?? 0) >= weekStart.getTime() && (w.finishedAt ?? 0) <= now,
  );
  const days = new Set(done.map((w) => localDate(w.finishedAt ?? w.startedAt)));
  let streak = 0;
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  if (!days.has(today)) day.setDate(day.getDate() - 1);
  while (days.has(localDate(day.getTime()))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  const totalVolume = done.reduce((v, w) => v + volume(getSets(w.id)), 0);
  return {
    count: done.length,
    weekly: week.length,
    weeklyVolume: week.reduce((v, w) => v + volume(getSets(w.id)), 0),
    totalVolume,
    streak,
    averageMinutes: done.length
      ? done.reduce(
          (v, w) =>
            v +
            elapsedSeconds(w.startedAt, w.finishedAt ?? now, w.pausedMs) / 60,
          0,
        ) / done.length
      : 0,
  };
}
export function canonicalMeasurement(value: number, unit: string) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error("Measurement must be finite and nonnegative");
  if (unit === "lb") return { value: lbToKg(value), unit: "kg" };
  if (unit === "in") return { value: inToCm(value), unit: "cm" };
  if (!["kg", "cm", "percent"].includes(unit))
    throw new Error("Unknown measurement unit");
  return { value, unit };
}
export function displayMeasurement(
  value: number,
  unit: string,
  preference: "kg" | "lb",
) {
  if (preference === "lb" && unit === "kg")
    return { value: kgToLb(value), unit: "lb" };
  if (preference === "lb" && unit === "cm")
    return { value: cmToIn(value), unit: "in" };
  return { value, unit };
}
