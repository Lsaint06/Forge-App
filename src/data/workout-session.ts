import type { Repository, WorkoutSnapshot } from "./repository";
import { progressModel } from "./progress";
import { volume, elapsedSeconds } from "../domain/metrics";
import type { RecordEvent } from "../domain/progress/strength";

// Logger helpers that sit on top of the repository: editing a finished
// workout safely, moving exercises, and the post-workout summary. None of
// them change how workouts are stored.

// ---- Editing a finished workout --------------------------------------------

const editKey = (workoutId: string) => `workoutEdit:${workoutId}`;

/**
 * Starts editing a finished workout. Edits save as they are made (like the
 * logger), so the workout as it was is kept on the phone until the edit is
 * saved or cancelled. If FORGE closes mid-edit, the copy survives and the
 * workout reopens in edit mode.
 */
export function beginWorkoutEdit(r: Repository, workoutId: string) {
  if (!r.setting(editKey(workoutId)))
    r.setSetting(
      editKey(workoutId),
      JSON.stringify(r.workoutSnapshot(workoutId)),
    );
}

export function editInProgress(r: Repository, workoutId: string) {
  return !!r.setting(editKey(workoutId));
}

function savedCopy(r: Repository, workoutId: string) {
  const text = r.setting(editKey(workoutId));
  return text ? (JSON.parse(text) as WorkoutSnapshot) : undefined;
}

/** Whether the workout differs from how it was when editing began. */
export function workoutEdited(r: Repository, workoutId: string) {
  const before = savedCopy(r, workoutId);
  if (!before || !r.workout(workoutId)) return false;
  const now = r.workoutSnapshot(workoutId);
  // updatedAt changes on every write, even an edit that was undone by hand.
  const comparable = (s: WorkoutSnapshot) =>
    JSON.stringify({
      ...s,
      workout: { ...s.workout, updatedAt: 0 },
    });
  return comparable(before) !== comparable(now);
}

/** Keeps the edits. */
export function saveWorkoutEdit(r: Repository, workoutId: string) {
  r.setSetting(editKey(workoutId), "");
}

/** Discards the edits: the workout returns exactly to how it was. */
export function cancelWorkoutEdit(r: Repository, workoutId: string) {
  const before = savedCopy(r, workoutId);
  r.transaction(() => {
    if (before && r.workout(workoutId)) r.restoreWorkout(before);
    r.setSetting(editKey(workoutId), "");
  });
}

// ---- Exercise order ---------------------------------------------------------

/**
 * Moves an exercise to `target` (0-based) one step at a time, so every other
 * exercise keeps its relative order. Sets stay attached to their exercise.
 */
export function moveExerciseTo(
  r: Repository,
  workoutId: string,
  rowId: string,
  target: number,
) {
  r.transaction(() => {
    const rows = r.workoutExercises(workoutId);
    const from = rows.findIndex((e) => e.id === rowId);
    if (from < 0) return;
    const to = Math.max(0, Math.min(rows.length - 1, target));
    const step = to < from ? -1 : 1;
    for (let i = from; i !== to; i += step) r.moveExercise(rowId, step);
  });
}

// ---- Post-workout summary -----------------------------------------------------

export type WorkoutSummary = {
  name: string;
  finishedAt: number;
  /** Completed sets that are not warm-ups. */
  sets: number;
  /** Exercises with at least one completed set. */
  exercises: number;
  /** Whole minutes, when the session ran at least a minute. */
  minutes?: number;
  /** Load × reps for completed working sets (kg), when any was lifted. */
  volumeKg?: number;
  /** Records set in this workout, from the Progress records engine. */
  records: { exerciseId: string; name: string; event: RecordEvent }[];
};

export function workoutSummary(
  r: Repository,
  workoutId: string,
): WorkoutSummary | undefined {
  const w = r.workout(workoutId);
  if (!w || w.status !== "completed") return undefined;
  const sets = r.workoutSets(workoutId);
  const done = sets.filter((s) => s.completed);
  const exercises = r
    .workoutExercises(workoutId)
    .filter((row) => r.sets(row.id).some((s) => s.completed)).length;
  const finishedAt = w.finishedAt ?? w.startedAt;
  const minutes = Math.round(
    elapsedSeconds(w.startedAt, finishedAt, w.pausedMs) / 60,
  );
  const moved = volume(sets);
  const model = progressModel(r);
  return {
    name: w.name,
    finishedAt,
    sets: done.filter((s) => s.kind !== "warmup").length,
    exercises,
    minutes: minutes >= 1 ? minutes : undefined,
    volumeKg: moved > 0 ? moved : undefined,
    records: model.events
      .filter((e) => e.workoutId === workoutId)
      .map((event) => ({
        exerciseId: event.exerciseId,
        name: model.info(event.exerciseId).name,
        event,
      })),
  };
}
