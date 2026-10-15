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
  const isolation = ex ? exerciseStimulus(ex.id).isolation : false;
  return isolation ? 4 : 5;
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
