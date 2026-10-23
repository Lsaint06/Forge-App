import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import {
  copyForwardTargets,
  previousValues,
  hasPrevious,
} from "../src/domain/copy-forward";
import {
  moveExerciseTo,
  beginWorkoutEdit,
  cancelWorkoutEdit,
  saveWorkoutEdit,
  editInProgress,
  workoutEdited,
  workoutSummary,
} from "../src/data/workout-session";
import type { WorkoutSet } from "../src/domain/types";

// Phase 7B WP2: copy-forward rules, positional reordering, editing finished
// workouts safely, and the post-workout summary.

const set = (id: string, position: number, patch: Partial<WorkoutSet> = {}) =>
  ({
    id,
    exerciseRowId: "row",
    position,
    weight: 0,
    reps: 8,
    duration: 0,
    distance: 0,
    rpe: null,
    rir: null,
    kind: "working",
    completed: false,
    rest: 90,
    tempo: "",
    notes: "",
    side: "both",
    ...patch,
  }) as WorkoutSet;
const none = { touched: new Set<string>(), filled: new Set<string>() };

// ---- Copy-forward -----------------------------------------------------------

test("a working load fills the empty working sets after it", () => {
  const sets = [
    set("a", 0, { weight: 60 }),
    set("b", 1),
    set("c", 2),
    set("d", 3),
  ];
  assert.deepEqual(copyForwardTargets(sets, "a", none), ["b", "c", "d"]);
  // Only sets after the edited one.
  assert.deepEqual(copyForwardTargets(sets, "c", none), ["d"]);
});

test("copying stops at a set that already has its own load", () => {
  const sets = [
    set("a", 0, { weight: 61.2 }),
    set("b", 1),
    set("c", 2, { weight: 56.7 }),
    set("d", 3),
  ];
  // Set 3 keeps its 125 lb (56.7 kg); set 4 belongs to that later load.
  assert.deepEqual(copyForwardTargets(sets, "a", none), ["b"]);
});

test("copying never touches completed sets, other set types or typed zeros", () => {
  const done = [set("a", 0), set("b", 1, { completed: true }), set("c", 2)];
  assert.deepEqual(copyForwardTargets(done, "a", none), []);
  const mixed = [set("a", 0), set("b", 1, { kind: "drop" }), set("c", 2)];
  assert.deepEqual(copyForwardTargets(mixed, "a", none), []);
  // A warm-up load never spreads into working sets.
  const warm = [set("w", 0, { kind: "warmup" }), set("a", 1), set("b", 2)];
  assert.deepEqual(copyForwardTargets(warm, "w", none), []);
  // A 0 the lifter typed (for example bodyweight) is their choice.
  const typed = [set("a", 0), set("b", 1), set("c", 2)];
  assert.deepEqual(
    copyForwardTargets(typed, "a", {
      touched: new Set(["b"]),
      filled: new Set(),
    }),
    [],
  );
});

test("loads Forge copied can be updated again; typed ones cannot", () => {
  const sets = [
    set("a", 0, { weight: 100 }),
    set("b", 1, { weight: 100 }),
    set("c", 2, { weight: 100 }),
  ];
  // b and c were filled from a: editing a again updates them.
  assert.deepEqual(
    copyForwardTargets(sets, "a", {
      touched: new Set(["a"]),
      filled: new Set(["b", "c"]),
    }),
    ["b", "c"],
  );
  // Once the lifter types into b, it is theirs.
  assert.deepEqual(
    copyForwardTargets(sets, "a", {
      touched: new Set(["a", "b"]),
      filled: new Set(["c"]),
    }),
    [],
  );
  // Sets are read in position order, whatever the array order.
  assert.deepEqual(
    copyForwardTargets(
      [set("c", 2), set("a", 0, { weight: 1 }), set("b", 1)],
      "a",
      none,
    ),
    ["b", "c"],
  );
  assert.deepEqual(copyForwardTargets(sets, "missing", none), []);
});

test("using the previous result copies the matching values for the exercise type", () => {
  const prev = set("p", 0, {
    weight: 61.235,
    reps: 8,
    duration: 30,
    distance: 400,
  });
  assert.deepEqual(previousValues(prev, "strength"), {
    weight: 61.235,
    reps: 8,
  });
  assert.deepEqual(previousValues(prev, "duration"), { duration: 30 });
  assert.deepEqual(previousValues(prev, "distance"), {
    distance: 400,
    duration: 30,
  });
  assert.equal(hasPrevious(prev, "strength"), true);
  assert.equal(hasPrevious(set("p", 0, { reps: 0 }), "strength"), false);
  assert.equal(hasPrevious(undefined, "strength"), false);
});

// ---- Reordering ---------------------------------------------------------------

const ids = [
  "barbell-bench-press",
  "barbell-bent-over-row",
  "overhead-press",
  "lat-pulldown",
  "dumbbell-lateral-raise",
  "dumbbell-curl",
  "back-squat",
  "plank",
];
function eightExercises(r: ReturnType<typeof pathRepository>["r"]) {
  const w = r.startWorkout("Long");
  const rows = ids.map((exerciseId, i) => {
    const row = r.addExercise(w.id, exerciseId);
    r.editSet(r.addSet(row.id).id, { weight: 10 + i, reps: 8 });
    r.addSet(row.id);
    return row;
  });
  return { w, rows };
}

test("moving the eighth exercise to the top keeps every other order and every set", () => {
  const { r, db } = pathRepository();
  try {
    const { w, rows } = eightExercises(r);
    const setsBefore = new Map(rows.map((row) => [row.id, r.sets(row.id)]));
    moveExerciseTo(r, w.id, rows[7]!.id, 0);
    const after = r.workoutExercises(w.id);
    assert.deepEqual(
      after.map((e) => e.exerciseId),
      [ids[7], ...ids.slice(0, 7)],
    );
    assert.deepEqual(
      after.map((e) => e.position),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
    // Same rows, same sets, same values: nothing lost or duplicated.
    assert.equal(after.length, 8);
    for (const row of after)
      assert.deepEqual(r.sets(row.id), setsBefore.get(row.id));
    assert.equal(r.workoutSets(w.id).length, 16);
    moveExerciseTo(r, w.id, rows[7]!.id, 99);
    assert.deepEqual(
      r.workoutExercises(w.id).map((e) => e.exerciseId),
      ids,
    );
    moveExerciseTo(r, w.id, rows[3]!.id, 1);
    assert.equal(r.workoutExercises(w.id)[1]!.id, rows[3]!.id);
    // An unknown row changes nothing.
    moveExerciseTo(r, w.id, "missing", 0);
    assert.equal(r.workoutExercises(w.id)[1]!.id, rows[3]!.id);
  } finally {
    db.close();
  }
});

// ---- Editing a finished workout -----------------------------------------------

function finished(r: ReturnType<typeof pathRepository>["r"]) {
  const w = r.startWorkout("Push");
  const bench = r.addExercise(w.id, "barbell-bench-press");
  const row = r.addExercise(w.id, "barbell-bent-over-row");
  for (const e of [bench, row])
    for (let i = 0; i < 2; i++)
      r.editSet(r.addSet(e.id).id, { weight: 60, reps: 5, completed: true });
  r.finishWorkout(w.id);
  return { w, bench, row };
}

test("cancelling an edit restores the workout exactly, with the same identities", () => {
  const { r, db } = pathRepository();
  try {
    const { w, bench, row } = finished(r);
    const before = r.workoutSnapshot(w.id);
    beginWorkoutEdit(r, w.id);
    assert.equal(editInProgress(r, w.id), true);
    assert.equal(workoutEdited(r, w.id), false);
    // Change a value, add a set, remove an exercise and rename.
    r.editSet(r.sets(bench.id)[0]!.id, { weight: 99 });
    r.addSet(bench.id, { weight: 1, reps: 1 });
    r.removeExercise(row.id);
    r.updateWorkout(w.id, { name: "Renamed" });
    assert.equal(workoutEdited(r, w.id), true);
    cancelWorkoutEdit(r, w.id);
    const after = r.workoutSnapshot(w.id);
    assert.deepEqual(after.exercises, before.exercises);
    assert.deepEqual(after.sets, before.sets);
    assert.deepEqual(
      { ...after.workout, updatedAt: 0 },
      { ...before.workout, updatedAt: 0 },
    );
    assert.equal(editInProgress(r, w.id), false);
    // One workout, still completed: no duplicate record.
    assert.equal(r.workouts().length, 1);
    assert.equal(r.workout(w.id)!.status, "completed");
  } finally {
    db.close();
  }
});

test("saving an edit keeps only the changes made", () => {
  const { r, db } = pathRepository();
  try {
    const { w, bench } = finished(r);
    const before = r.workoutSnapshot(w.id);
    beginWorkoutEdit(r, w.id);
    const target = r.sets(bench.id)[1]!;
    r.editSet(target.id, { reps: 6 });
    saveWorkoutEdit(r, w.id);
    assert.equal(editInProgress(r, w.id), false);
    const after = r.workoutSnapshot(w.id);
    assert.deepEqual(
      after.sets.map((s) => (s.id === target.id ? { ...s, reps: 5 } : s)),
      before.sets,
    );
    // Undoing an edit by hand counts as unchanged.
    beginWorkoutEdit(r, w.id);
    r.editSet(target.id, { reps: 7 });
    r.editSet(target.id, { reps: 6 });
    assert.equal(workoutEdited(r, w.id), false);
  } finally {
    db.close();
  }
});

test("an edit interrupted by FORGE closing can still be cancelled", () => {
  const { r, db } = pathRepository();
  try {
    const { w, bench } = finished(r);
    const before = r.workoutSnapshot(w.id);
    beginWorkoutEdit(r, w.id);
    r.editSet(r.sets(bench.id)[0]!.id, { weight: 120 });
    // The copy lives in device settings, so it survives a restart.
    assert.equal(editInProgress(r, w.id), true);
    // Starting again does not overwrite the original copy with edited data.
    beginWorkoutEdit(r, w.id);
    cancelWorkoutEdit(r, w.id);
    assert.deepEqual(r.workoutSnapshot(w.id).sets, before.sets);
  } finally {
    db.close();
  }
});

test("restoring refuses a copy from another workout", () => {
  const { r, db } = pathRepository();
  try {
    const a = finished(r);
    const b = finished(r);
    const copy = r.workoutSnapshot(a.w.id);
    assert.throws(() =>
      r.restoreWorkout({ ...copy, workout: { ...copy.workout, id: b.w.id } }),
    );
    assert.throws(() =>
      r.restoreWorkout({
        ...copy,
        workout: { ...copy.workout, id: "missing" },
      }),
    );
  } finally {
    db.close();
  }
});

// ---- Post-workout summary -------------------------------------------------------

test("the summary counts only completed working sets and reuses the records engine", () => {
  const { r, db } = pathRepository();
  try {
    // A baseline session: its first session is never a record.
    const first = finished(r);
    const firstSummary = workoutSummary(r, first.w.id)!;
    assert.equal(firstSummary.records.length, 0);
    assert.equal(firstSummary.sets, 4);
    assert.equal(firstSummary.exercises, 2);
    assert.equal(firstSummary.volumeKg, 4 * 60 * 5);

    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    const curl = r.addExercise(w.id, "dumbbell-curl");
    r.editSet(r.addSet(bench.id).id, {
      weight: 40,
      reps: 8,
      kind: "warmup",
      completed: true,
    });
    r.editSet(r.addSet(bench.id).id, { weight: 70, reps: 5, completed: true });
    // Entered but not ticked: never counted.
    r.editSet(r.addSet(bench.id).id, { weight: 75, reps: 5 });
    r.editSet(r.addSet(curl.id).id, { weight: 12, reps: 10 });
    r.finishWorkout(w.id);
    const s = workoutSummary(r, w.id)!;
    assert.equal(s.sets, 1);
    assert.equal(s.exercises, 1);
    assert.equal(s.volumeKg, 70 * 5);
    // Less than a minute recorded: no duration rather than "0 min".
    assert.equal(s.minutes, undefined);
    assert.deepEqual(
      s.records.map((x) => [x.name, x.event.categories[0]]),
      [["Barbell Bench Press", "heaviest"]],
    );
    // Only finished workouts have a summary.
    const active = r.startWorkout("Open");
    assert.equal(workoutSummary(r, active.id), undefined);
  } finally {
    db.close();
  }
});
