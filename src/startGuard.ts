import { router } from "expo-router";
import { Alert } from "./platform/alert";
import type { Repository } from "./data/repository";
import { workoutTitle } from "./domain/workout-display";

// One workout at a time. Starting a session while another is in progress
// must never silently resume or replace it: every start point checks here
// and offers the way back to the workout in progress instead.

/** The workout in progress, unless it is the one being started. */
export function otherWorkout(r: Repository, allowWorkoutId?: string) {
  const active = r.active();
  return active && active.id !== allowWorkoutId ? active : undefined;
}

export function resumeWorkout() {
  router.push("/workout");
}

/**
 * True (and explains, offering Resume) when another workout is in progress.
 * `allowWorkoutId` is the workout this action would resume, if any.
 */
export function blockIfTraining(r: Repository, allowWorkoutId?: string) {
  const active = otherWorkout(r, allowWorkoutId);
  if (!active) return false;
  Alert.alert(
    "Workout in progress",
    `Finish or discard ${workoutTitle(active.name)} before starting another workout.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Resume workout", onPress: resumeWorkout },
    ],
  );
  return true;
}
