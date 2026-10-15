import type { Exercise, Prescription } from "../types";
import type { PathPreferences } from "./model";
import { exerciseStimulus } from "./stimulus";

// Coaching defaults, not exercise-specific biological optima. Only experienced
// hypertrophy plans vary compounds; strength practice and foundation stay fixed.
export function compoundRepRange(
  preferences: PathPreferences,
  exercise: Exercise,
  firstCompound: boolean,
): Pick<Prescription, "reps" | "repMax"> | undefined {
  if (
    preferences.experience === "Beginner" ||
    !["build-muscle", "advanced-physique"].includes(preferences.pathKey) ||
    exerciseStimulus(exercise.id).isolation
  )
    return undefined;
  if (exercise.pattern === "vertical pull") return { reps: 10, repMax: 12 };
  if (
    exercise.pattern === "horizontal pull" ||
    exercise.pattern === "vertical push"
  )
    return { reps: 8, repMax: 10 };
  if (/incline|split-squat|lunge/.test(exercise.id))
    return { reps: 8, repMax: 12 };
  if (["horizontal push", "squat", "hinge"].includes(exercise.pattern))
    return firstCompound ? { reps: 6, repMax: 8 } : { reps: 8, repMax: 12 };
  return undefined;
}
