import type { PathDay } from "./legacyGenerator";
import { exerciseStimulus } from "./stimulus";

// Whole-week programming rules shared by generation, validation and review.
// Exercise counts are compared alongside effective working sets, so a short
// heavy strength day is not mistaken for an under-programmed one.
export const MAX_EXERCISE_SPREAD = 2;
export const MAX_SAME_TARGET_PER_DAY = 3;
const HEAVY_SET_WEIGHT = 1.5;

export type WeekIssue = {
  kind: "exercise-ratio" | "exercise-spread" | "volume-ratio" | "duplication";
  dayKeys: string[];
  message: string;
};

// Every Path training day is a planned lifting session; rest days are not
// represented in a plan, so all days are compared with one another. A day
// reduced to trunk work by equipment gaps is still a lifting day that failed
// to receive its planned work, not a recovery session.
export function effectiveSets(day: PathDay): number {
  return day.exercises.reduce((total, item) => {
    const heavy =
      !exerciseStimulus(item.exerciseId).isolation &&
      (item.repMax ?? item.reps) <= 6 &&
      item.rest >= 180;
    return total + item.sets * (heavy ? HEAVY_SET_WEIGHT : 1);
  }, 0);
}

// Primary targets trained by more than MAX_SAME_TARGET_PER_DAY exercises in
// one session. Distinct exercise IDs are enforced separately.
export function duplicatedTargets(day: PathDay): string[] {
  const counts: Record<string, number> = {};
  for (const item of day.exercises) {
    const muscle = exerciseStimulus(item.exerciseId).direct[0];
    if (muscle) counts[muscle] = (counts[muscle] ?? 0) + 1;
  }
  return Object.keys(counts).filter(
    (muscle) => counts[muscle]! > MAX_SAME_TARGET_PER_DAY,
  );
}

function extremes<T>(items: T[], value: (item: T) => number) {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! };
}

export function auditWeek(days: PathDay[]): WeekIssue[] {
  const issues: WeekIssue[] = [];
  for (const day of days) {
    if (
      new Set(day.exercises.map((e) => e.exerciseId)).size !==
      day.exercises.length
    )
      issues.push({
        kind: "duplication",
        dayKeys: [day.key],
        message: `${day.name} repeats the same exercise. Keep each movement once per session.`,
      });
    const repeated = duplicatedTargets(day);
    if (repeated.length)
      issues.push({
        kind: "duplication",
        dayKeys: [day.key],
        message: `${day.name} has more than ${MAX_SAME_TARGET_PER_DAY} exercises for ${repeated.join(", ")}. Spread that work across the week instead.`,
      });
  }
  const lifting = days;
  if (lifting.length < 2) return issues;
  const count = (day: PathDay) => day.exercises.length;
  const { low, high } = extremes(lifting, count);
  if (count(high) >= 2 * count(low))
    issues.push({
      kind: "exercise-ratio",
      dayKeys: [high.key, low.key],
      message: `${high.name} has ${count(high)} exercises but ${low.name} has ${count(low)}. No training day may have twice as many exercises as another.`,
    });
  else if (count(high) - count(low) > MAX_EXERCISE_SPREAD)
    issues.push({
      kind: "exercise-spread",
      dayKeys: [high.key, low.key],
      message: `${high.name} has ${count(high)} exercises but ${low.name} has ${count(low)}. Keep training days within ${MAX_EXERCISE_SPREAD} exercises of each other.`,
    });
  const volume = extremes(lifting, effectiveSets);
  if (
    effectiveSets(volume.low) > 0 &&
    effectiveSets(volume.high) >= 2 * effectiveSets(volume.low)
  )
    issues.push({
      kind: "volume-ratio",
      dayKeys: [volume.high.key, volume.low.key],
      message: `${volume.high.name} carries at least twice the working-set load of ${volume.low.name}. Distribute weekly volume more evenly.`,
    });
  return issues;
}

export function assertBalancedWeek(days: PathDay[]) {
  const issue = auditWeek(days)[0];
  if (issue) throw new Error(issue.message);
}
