import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exerciseProgress,
  restTotal,
  workoutPlan,
} from "../src/screens/workout/model";
import { phaseLabel } from "../src/screens/home/model";
import { enrollProgram, startProgramSession } from "../src/data/programs";
import {
  pathPrograms,
  pathSessions,
  startPathSession,
} from "../src/data/paths";
import { programLibrary } from "../src/programs";
import { defaults, type WorkoutSet } from "../src/domain/types";
import { pathRepository } from "./path-fixture";
import { freshPathRepository } from "./legacy-fixture";

// Phase 7.2A: the active workout's presentation rules over existing data.

const set = (completed: boolean): WorkoutSet => ({
  id: String(Math.random()),
  exerciseRowId: "row",
  position: 0,
  weight: 60,
  reps: 8,
  duration: 0,
  distance: 0,
  rpe: null,
  rir: null,
  kind: "working",
  completed,
  rest: 90,
  tempo: "",
  notes: "",
  side: "both",
});

test("workout progress counts exercises with every set completed", () => {
  assert.deepEqual(exerciseProgress([]), { done: 0, total: 0, ratio: 0 });
  const p = exerciseProgress([
    [set(true), set(true)],
    [set(true), set(false)],
    [],
    [set(true)],
  ]);
  // An exercise without sets, or with one open set, is not finished.
  assert.deepEqual(p, { done: 2, total: 4, ratio: 0.5 });
});

test("the rest ring's length is the stored total, or what is left", () => {
  assert.equal(restTotal("120", 84), 120);
  // The once-a-second clock may read one second over just after a start.
  assert.equal(restTotal("90", 91), 90);
  // Missing, malformed or stale totals start the ring full.
  assert.equal(restTotal(undefined, 84), 84);
  assert.equal(restTotal("abc", 84), 84);
  assert.equal(restTotal("60", 84), 84);
  assert.equal(restTotal("0", 0), 0);
  // A deadline value read as a total (larger than any rest) is ignored.
  assert.equal(restTotal(String(Date.now() + 75_000), 75), 75);
});

test("a curated program workout shows its week and phase; freestyle none", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ ...defaults, onboarded: true, restDay: 6 });
    const program = programLibrary.find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    const { id } = enrollProgram(r, program, "2026-10-19");
    const w = startProgramSession(r, id);
    assert.deepEqual(workoutPlan(r, w.id), {
      week: 1,
      phase: phaseLabel(program.phases[0]!.name),
    });
    r.deleteWorkout(w.id);
    const free = r.startWorkout("Freestyle");
    assert.equal(workoutPlan(r, free.id), undefined);
  } finally {
    db.close();
  }
});

test("an existing Path workout shows its scheduled week and phase", () => {
  const { r, db } = freshPathRepository();
  try {
    const path = pathPrograms(r)[0]!;
    const session = pathSessions(r, path)[0]!;
    const w = startPathSession(r, session.record.id);
    assert.deepEqual(workoutPlan(r, w.id), {
      week: session.data.week,
      phase: path.data.phases[0]!.name,
    });
  } finally {
    db.close();
  }
});
