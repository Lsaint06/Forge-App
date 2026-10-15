import type { Exercise } from "../types";
import { exerciseStimulus } from "./stimulus";
import type { PathPreferences, PathRole } from "./model";

// Goal-specific working-set ceilings. Duration-aware filling approaches the
// requested session length only up to these caps, so it never adds junk volume
// just to "use up" time. Every cap stays within the planner's hard limits
// (<= 28 working sets per session, <= 5 sets per exercise, <= 3 for beginners).

export function sessionSetCap(p: PathPreferences): number {
  if (p.experience === "Beginner" || p.pathKey === "start-strong") return 16;
  switch (p.pathKey) {
    case "advanced-physique":
      return 28;
    case "build-muscle":
      return 24;
    case "get-strong":
      return 20; // strength is intensity-led, not volume-led
    case "athlete-mode":
    case "lean-strong":
      return 22;
    default:
      return 22;
  }
}

export function exerciseSetCap(
  p: PathPreferences,
  ex: Exercise | undefined,
  primaryStrength: boolean,
): number {
  if (p.experience === "Beginner" || p.pathKey === "start-strong") return 3;
  if (primaryStrength) return 5;
  // Strength assistance stays deliberately low so the main lifts remain the
  // emphasis; it is not a hypertrophy accessory block.
  if (p.pathKey === "get-strong") return 3;
  const isolation = ex ? exerciseStimulus(ex.id).isolation : false;
  return isolation ? 4 : 5;
}

// Upper bound on direct weekly working sets for a single muscle, used so that
// duration-aware filling across a high-frequency week does not pile excessive
// volume onto one muscle. These are practical ceilings where returns clearly
// diminish for most lifters, not claimed per-person optima. Smaller muscles and
// accessories get a lower ceiling than the large prime movers.
const smallMuscles = new Set([
  "Side delts",
  "Rear delts",
  "Front delts",
  "Biceps",
  "Triceps",
  "Calves",
  "Core",
  "Glutes",
]);

export function weeklyMuscleCap(p: PathPreferences, muscle: string): number {
  const big =
    p.pathKey === "advanced-physique"
      ? 24
      : p.pathKey === "build-muscle"
        ? 20
        : 16;
  return smallMuscles.has(muscle) ? Math.round(big * 0.7) : big;
}

// Shared mapping from a user's muscle priorities to the roles/patterns that
// train them. Used by both set redistribution and duration-aware filling.
const priorityRoles: Record<string, PathRole[]> = {
  Chest: ["push"],
  Back: ["pull"],
  Shoulders: ["shoulder"],
  Quadriceps: ["squat"],
  Hamstrings: ["posterior"],
  Glutes: ["posterior"],
  Arms: ["biceps", "triceps"],
  Core: ["core"],
};

export function isPriorityTarget(
  p: PathPreferences,
  role: PathRole,
  exercise: Exercise | undefined,
): boolean {
  if (!exercise) return false;
  return p.priorities.some((name) =>
    name === "Glutes"
      ? ["squat", "hinge", "hip extension"].includes(exercise.pattern)
      : name === "Hamstrings"
        ? role === "posterior" && exercise.pattern !== "hip extension"
        : (priorityRoles[name] ?? []).includes(role),
  );
}
