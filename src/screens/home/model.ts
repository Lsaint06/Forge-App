import type { Repository } from "../../data/repository";
import { currentEnrollment, programProgress } from "../../data/programs";
import { currentPath, pathSummary } from "../../data/paths";
import type { NextSession } from "../../data/today";
import { latestWeighIn, type GoalView } from "../../domain/goals";
import { displayUnit, toDisplay } from "../../domain/measurements";
import type { Profile, Workout } from "../../domain/types";
import { localDate } from "../../domain/types";

// Home (Phase 7.1B) presentation model. Read-only: it selects and formats
// values that existing code already computes; nothing here is a new metric.

/** The moment Home renders: one reading for every date on the screen. */
export function homeClock(time = Date.now()) {
  return {
    now: time,
    today: localDate(time),
    hour: new Date(time).getHours(),
  };
}

/** "Good afternoon, Alex." — the first name, or none for the default name. */
export function greeting(name: string, hour: number) {
  const part =
    hour >= 5 && hour < 12
      ? "Good morning"
      : hour >= 12 && hour < 17
        ? "Good afternoon"
        : "Good evening";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first && first !== "Athlete" ? `${part}, ${first}.` : `${part}.`;
}

/** Program phase names carry their weeks ("Weeks 1–3 · Accumulation"). */
export const phaseLabel = (name: string) =>
  name.split(" · ").pop()!.trim() || name;

/** Where the current plan stands: "Week 2 · Accumulation". */
export function planContext(r: Repository, today: string) {
  const enrollment = currentEnrollment(r);
  if (enrollment) {
    const next = programProgress(r, enrollment, today).next;
    return next
      ? { week: next.week, phase: phaseLabel(next.phase.name) }
      : undefined;
  }
  const path = currentPath(r);
  if (path && path.data.status === "active") {
    const s = pathSummary(r, path, today);
    return s.complete ? undefined : { week: s.week, phase: s.phase.name };
  }
  return undefined;
}

/** Facts about the hero's session: its exercise count and level, if known. */
export function sessionFacts(
  r: Repository,
  next: NextSession,
  today: string,
): { exercises?: number; level?: string } {
  const count = (n: number | undefined) => (n ? n : undefined);
  switch (next.kind) {
    case "active":
      return { exercises: count(r.workoutExercises(next.workout.id).length) };
    case "program": {
      const slot = programProgress(r, next.enrollment, today).next;
      return {
        exercises: count(
          slot && slot.session.name === next.name
            ? slot.session.exercises.length
            : undefined,
        ),
        level: next.enrollment.program?.experience,
      };
    }
    case "path":
      return {
        exercises: count(
          r.templates().find((t) => t.id === String(next.entry.data.templateId))
            ?.exercises.length,
        ),
      };
    case "planned":
      return { exercises: count(next.template?.exercises.length) };
    case "none":
      return {};
  }
}

/**
 * The goal Home shows as its next target (deterministic):
 * 1. an active target goal (not a weekly habit) with measured progress that
 *    is not yet reached — the one closest to its target;
 * 2. otherwise any active goal with a recorded current value;
 * ties go to the most recently created goal, then the greater ID.
 */
export function nextTarget(views: GoalView[]): GoalView | undefined {
  const newest = (a: GoalView, b: GoalView) =>
    b.goal.createdAt - a.goal.createdAt ||
    (a.goal.id < b.goal.id ? 1 : a.goal.id > b.goal.id ? -1 : 0);
  const active = views.filter((v) => v.status === "active");
  const measured = active
    .filter((v) => !v.habit && v.ratio !== undefined && !v.reached)
    .sort((a, b) => b.ratio! - a.ratio! || newest(a, b));
  if (measured[0]) return measured[0];
  return active.filter((v) => v.current !== undefined).sort(newest)[0];
}

/** Monday-to-Sunday of the current week: whether a workout was completed. */
export function weekDays(workouts: Workout[], now = Date.now()) {
  const today = new Date(now);
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - ((today.getDay() + 6) % 7),
  );
  const done = new Set(
    workouts
      .filter((w) => w.status === "completed")
      .map((w) => new Date(w.finishedAt ?? w.startedAt).toDateString()),
  );
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return done.has(d.toDateString());
  });
}

/**
 * Current bodyweight: the latest weigh-in (as Measurements and Goals read
 * it), else the profile weight. In the lifter's units, one decimal.
 */
export function bodyweight(
  measurements: Parameters<typeof latestWeighIn>[0],
  profile: Pick<Profile, "weight" | "units">,
) {
  const unit = displayUnit("mass", profile.units);
  const latest = latestWeighIn(measurements);
  const round = (n: number) => Math.round(n * 10) / 10;
  if (latest)
    return {
      value: round(
        toDisplay(Number(latest.data.value), latest.data.unit, profile.units),
      ),
      unit,
      date: latest.date,
    };
  if (profile.weight > 0)
    return {
      value: round(toDisplay(profile.weight, "kg", profile.units)),
      unit,
    };
  return undefined;
}
