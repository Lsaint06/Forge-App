import type { Repository } from "../../data/repository";
import { programWorkoutContext } from "../../data/programs";
import { pathPrograms } from "../../data/paths";
import { pathSessionDataSchema } from "../../domain/paths/model";
import type { WorkoutSet } from "../../domain/types";
import { phaseLabel } from "../home/model";

// Active-workout presentation model (Phase 7.2A). Read-only: it selects and
// formats values the logger already stores; nothing here is a new metric.

/**
 * Exercises finished in this workout: every set of the exercise completed
 * (an exercise without sets is not finished).
 */
export function exerciseProgress(rows: WorkoutSet[][]) {
  const done = rows.filter(
    (sets) => sets.length > 0 && sets.every((s) => s.completed),
  ).length;
  const total = rows.length;
  return { done, total, ratio: total ? done / total : 0 };
}

/**
 * Where a plan workout sits in its plan ("Week 2 · Accumulation"): curated
 * programs from their session log, existing Paths from their schedule.
 * Freestyle and template workouts have none.
 */
export function workoutPlan(
  r: Repository,
  workoutId: string,
): { week: number; phase?: string } | undefined {
  try {
    const program = programWorkoutContext(r, workoutId);
    if (program)
      return program.slot
        ? {
            week: program.slot.week,
            phase: phaseLabel(program.slot.phase.name),
          }
        : undefined;
    const entry = r
      .journal("schedule")
      .find((j) => j.data.forgePath === 1 && j.data.workoutId === workoutId);
    if (!entry) return undefined;
    const parsed = pathSessionDataSchema.safeParse(entry.data);
    if (!parsed.success) return undefined;
    const path = pathPrograms(r).find(
      (p) => p.record.id === parsed.data.programId,
    );
    return {
      week: parsed.data.week,
      phase: path?.data.phases[parsed.data.week <= 4 ? 0 : 1]?.name,
    };
  } catch {
    // Plan context is decoration: a damaged plan record never blocks logging.
    return undefined;
  }
}

/**
 * The rest the ring measures against. `stored` is the length saved when rest
 * started; it is ignored when missing or inconsistent with what is left (an
 * older countdown), and the ring then starts full. The countdown's clock
 * ticks once a second, so just after rest starts it may read one second over
 * the total: that still counts as this rest.
 */
export function restTotal(stored: string | undefined, left: number) {
  const total = Number(stored);
  return Number.isFinite(total) &&
    total > 0 &&
    total <= 7200 &&
    total + 1 >= left
    ? total
    : left;
}

/** "6:42 PM": when the session started, in the device's format. */
export const startedAt = (time: number) =>
  new Date(time).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
