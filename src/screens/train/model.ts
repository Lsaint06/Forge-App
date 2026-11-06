import type { Repository } from "../../data/repository";
import { currentEnrollment, programProgress } from "../../data/programs";
import { currentPath, pathSummary } from "../../data/paths";
import { pathSession, programNext, type NextSession } from "../../data/today";
import { workoutTitle } from "../../domain/workout-display";
import { dayLabel, relativeDay } from "../../domain/training-display";
import type { Template, Workout } from "../../domain/types";
import { phaseLabel } from "../home/model";

// Train hub (Phase 7.2B) presentation model. Read-only: it selects and
// formats what the program, Path and workout code already provide. Sessions
// start only through data/today.ts, exactly as on Home.

/**
 * Template shortcuts, most recently trained first (the last workout started
 * from each template); templates never trained follow in name order, as on
 * the Templates screen. Nothing new is tracked.
 */
export function templateOrder(
  templates: Template[],
  workouts: Pick<Workout, "templateId" | "startedAt">[],
) {
  const last = new Map<string, number>();
  for (const w of workouts)
    if (w.templateId && w.startedAt > (last.get(w.templateId) ?? -1))
      last.set(w.templateId, w.startedAt);
  return templates
    .map((t, i) => ({ t, i, at: last.get(t.id) }))
    .sort(
      (a, b) =>
        (b.at ?? -Infinity) - (a.at ?? -Infinity) ||
        // Untrained templates keep the repository's name order.
        a.i - b.i,
    )
    .map(({ t }) => t);
}

export type PlanNext = Extract<NextSession, { kind: "program" | "path" }>;

/** The current program or Path as the hub shows it; undefined without one. */
export type PlanOverview = {
  kind: "program" | "path";
  name: string;
  /** "Week 2 · Accumulation", when the plan has a next session. */
  context?: string;
  /** "Intermediate · 3 days a week" for curated programs. */
  level?: string;
  done: number;
  /** Sessions in the whole plan; open-ended programs have none. */
  total?: number;
  state: "active" | "complete" | "paused" | "unavailable";
  next?: PlanNext;
};

export function planOverview(
  r: Repository,
  today: string,
): PlanOverview | undefined {
  const enrollment = currentEnrollment(r);
  if (enrollment) {
    const progress = programProgress(r, enrollment, today);
    const program = enrollment.program;
    const slot = progress.next;
    return {
      kind: "program",
      name: enrollment.data.name,
      // As Home's plan line (planContext).
      context: slot
        ? `Week ${slot.week} · ${phaseLabel(slot.phase.name)}`
        : undefined,
      level: program
        ? `${program.experience} · ${program.daysPerWeek} days a week`
        : undefined,
      done: progress.completed,
      total: progress.total,
      state: !program
        ? "unavailable"
        : progress.complete
          ? "complete"
          : "active",
      next: programNext(r, today),
    };
  }
  const path = currentPath(r);
  if (path) {
    const stats = pathSummary(r, path, today);
    const paused = path.data.status === "paused";
    const running = path.data.status === "active" && !stats.complete;
    return {
      kind: "path",
      name: path.data.name,
      context: running ? `Week ${stats.week} · ${stats.phase.name}` : undefined,
      done: stats.completed,
      total: stats.expected,
      state: paused ? "paused" : stats.complete ? "complete" : "active",
      next: path.data.status === "active" ? pathSession(r, today) : undefined,
    };
  }
  return undefined;
}

/** "7 of 36 sessions", or "7 sessions completed" for open-ended programs. */
export function progressText(plan: Pick<PlanOverview, "done" | "total">) {
  return plan.total !== undefined
    ? `${plan.done} of ${plan.total} ${plan.total === 1 ? "session" : "sessions"}`
    : `${plan.done} ${plan.done === 1 ? "session" : "sessions"} completed`;
}

/** When the plan's next session is due, in words. */
export function nextWhen(next: PlanNext, today: string) {
  if (next.when === "today") return "Today";
  if (next.when === "missed") return `Missed · ${dayLabel(next.date)}`;
  const day = relativeDay(next.date, today);
  return `${next.kind === "program" ? "Suggested" : "Scheduled"} for ${day}`;
}

/** The hero's one state, in priority order (see Train.tsx). */
export type TrainHero =
  | {
      kind: "active";
      title: string;
      plan?: string;
      paused: boolean;
      sets: { done: number; total: number };
    }
  | { kind: "plan"; plan: PlanOverview }
  | { kind: "none"; programs: number };

/**
 * The workout in progress always comes first (Resume, never a second
 * start); then the current plan; otherwise Forge Paths.
 */
export function trainHero(
  r: Repository,
  today: string,
  programs: number,
): TrainHero {
  const active = r.active();
  if (active) {
    const sets = r.workoutSets(active.id);
    return {
      kind: "active",
      title: workoutTitle(active.name),
      plan: active.name.includes(" · ")
        ? active.name.split(" · ")[0]
        : undefined,
      paused: active.status === "paused",
      sets: {
        done: sets.filter((s) => s.completed).length,
        total: sets.length,
      },
    };
  }
  const plan = planOverview(r, today);
  if (plan) return { kind: "plan", plan };
  return { kind: "none", programs };
}
