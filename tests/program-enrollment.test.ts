import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository, pathPreferences } from "./path-fixture";
import { placeholderProgram } from "./program-fixture";
import {
  currentEnrollment,
  endProgram,
  enrollProgram,
  programProgress,
  programWorkoutContext,
  restoreProgramSession,
  skipProgramSession,
  startProgramSession,
} from "../src/data/programs";
import {
  acceptPath,
  currentPath,
  pathPrograms,
  visibleSchedules,
} from "../src/data/paths";
import { generatePath } from "../src/domain/paths/generator";
import { exercises } from "../src/data/catalog";
import { sessionAt, suggestedDates } from "../src/domain/programs/enrollment";
import type { CuratedProgram } from "../src/domain/programs/model";

// Test-only published copy of the development placeholder, two weeks long,
// with distinct sessions so ordering is observable.
function testProgram(patch: Partial<CuratedProgram> = {}): CuratedProgram {
  const base = placeholderProgram();
  const sessions = base.phases[0]!.sessions.map((s, i) => ({
    ...s,
    exercises: [
      {
        exerciseId: ["barbell-bench-press", "back-squat", "lat-pulldown"][i]!,
        sets: 2 + i,
        reps: { min: 5, max: 5 + i },
        restSeconds: 60 + i,
        ...(i === 0 ? { notes: "Placeholder note" } : {}),
      },
    ],
  }));
  return placeholderProgram({
    status: "published",
    durationWeeks: 2,
    phases: [{ name: "Placeholder", weeks: 2, sessions }],
    ...patch,
  });
}

function finish(r: ReturnType<typeof pathRepository>["r"], workoutId: string) {
  for (const row of r.workoutExercises(workoutId))
    for (const set of r.sets(row.id))
      r.editSet(set.id, { completed: true, weight: 20 });
  r.finishWorkout(workoutId);
}

test("enrolling references the exact version and arranges the rest day", () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ restDay: 6 });
    const program = testProgram();
    const before = JSON.stringify(program);
    const record = enrollProgram(r, program, "2026-10-19");
    const enrollment = currentEnrollment(r, [program])!;
    assert.equal(enrollment.record.id, record.id);
    assert.equal(enrollment.data.programVersion, 1);
    assert.equal(enrollment.data.weekdays, "0,2,4");
    assert.equal(enrollment.program, program);
    assert.equal(JSON.stringify(program), before);
    // Program records never appear as ordinary calendar schedules.
    assert.deepEqual(visibleSchedules(r), []);
    assert.throws(
      () => enrollProgram(r, program, "2026-10-19"),
      /Confirm replacement/,
    );
    assert.throws(
      () => enrollProgram(r, placeholderProgram(), "2026-10-19", true),
      /published/,
    );
  } finally {
    db.close();
  }
});

test("sessions start exactly as authored and snapshot targets into the workout", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const { id } = enrollProgram(r, program, "2026-10-19");
    const workout = startProgramSession(r, id, [program]);
    assert.equal(workout.name, `${program.name} · Placeholder session a`);
    assert.equal(workout.templateId, null);
    const rows = r.workoutExercises(workout.id);
    assert.deepEqual(
      rows.map((row) => [row.exerciseId, row.rest, row.target]),
      [["barbell-bench-press", 60, { min: 5, max: 5, sets: 2 }]],
    );
    assert.equal(r.sets(rows[0]!.id).length, 2);
    // Starting again resumes rather than duplicating.
    assert.equal(startProgramSession(r, id, [program]).id, workout.id);
    const context = programWorkoutContext(r, workout.id, [program])!;
    assert.equal(context.slot?.session.id, "a");
    assert.equal(
      programProgress(r, currentEnrollment(r, [program])!).next?.state,
      "in-progress",
    );
  } finally {
    db.close();
  }
});

test("completing advances in order; missed days never create makeup work", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const { id } = enrollProgram(r, program, "2026-10-19");
    const enrollment = () => currentEnrollment(r, [program])!;
    finish(r, startProgramSession(r, id, [program]).id);
    // Weeks pass without training: nothing is marked missed or added.
    const later = programProgress(r, enrollment(), "2026-11-30");
    assert.equal(later.completed, 1);
    assert.equal(later.next?.session.id, "b");
    assert.equal(later.next?.week, 1);
    assert.equal(later.upcoming[0]!.suggested >= "2026-11-30", true);
    assert.equal(later.logs.length, 1);
    const second = startProgramSession(r, id, [program]);
    assert.deepEqual(r.workoutExercises(second.id)[0]!.target, {
      min: 5,
      max: 6,
      sets: 3,
    });
  } finally {
    db.close();
  }
});

test("skipping is reversible and never alters the program", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const before = JSON.stringify(program);
    const { id } = enrollProgram(r, program, "2026-10-19");
    skipProgramSession(r, id, [program]);
    let progress = programProgress(r, currentEnrollment(r, [program])!);
    assert.equal(progress.skipped, 1);
    assert.equal(progress.next?.session.id, "b");
    restoreProgramSession(r, progress.logs[0]!.record.id);
    progress = programProgress(r, currentEnrollment(r, [program])!);
    assert.equal(progress.skipped, 0);
    assert.equal(progress.next?.session.id, "a");
    assert.equal(JSON.stringify(program), before);
  } finally {
    db.close();
  }
});

test("a deleted workout returns its session to the queue; history stays accurate", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const { id } = enrollProgram(r, program, "2026-10-19");
    const first = startProgramSession(r, id, [program]);
    r.deleteWorkout(first.id);
    const progress = programProgress(r, currentEnrollment(r, [program])!);
    assert.equal(progress.completed, 0);
    assert.equal(progress.next?.state, "ready");
    assert.equal(progress.next?.session.id, "a");
    const again = startProgramSession(r, id, [program]);
    finish(r, again.id);
    assert.equal(
      programProgress(r, currentEnrollment(r, [program])!).completed,
      1,
    );
    // One log record per session position.
    assert.equal(
      r.journal("schedule").filter((j) => j.data.forgeProgram === 1).length,
      1,
    );
  } finally {
    db.close();
  }
});

test("finishing every session completes the program", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const { id } = enrollProgram(r, program, "2026-10-19");
    for (let i = 0; i < 6; i++)
      finish(r, startProgramSession(r, id, [program]).id);
    const progress = programProgress(r, currentEnrollment(r, [program])!);
    assert.equal(progress.complete, true);
    assert.equal(progress.completed, 6);
    assert.equal(progress.next, undefined);
    assert.throws(() => startProgramSession(r, id, [program]), /complete/);
    endProgram(r, id, [program]);
    assert.equal(currentEnrollment(r, [program]), undefined);
    assert.equal(r.workouts().length, 6);
  } finally {
    db.close();
  }
});

test("starting a program archives a generated Path without losing its data", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, generatePath(pathPreferences(), exercises));
    const path = currentPath(r)!;
    const schedules = r.journal("schedule").length;
    const templates = r.templates().length;
    const program = testProgram();
    assert.throws(() => enrollProgram(r, program), /Confirm replacement/);
    enrollProgram(r, program, "2026-10-19", true);
    assert.equal(currentPath(r), undefined);
    assert.equal(
      pathPrograms(r).find((p) => p.record.id === path.record.id)?.data.status,
      "archived",
    );
    assert.equal(r.journal("schedule").length, schedules);
    assert.equal(r.templates().length, templates);
  } finally {
    db.close();
  }
});

test("an enrolled version missing from the bundle keeps history and blocks starts", () => {
  const { r, db } = pathRepository();
  try {
    const program = testProgram();
    const { id } = enrollProgram(r, program, "2026-10-19");
    finish(r, startProgramSession(r, id, [program]).id);
    const orphan = currentEnrollment(r, [])!;
    assert.equal(orphan.program, undefined);
    assert.equal(programProgress(r, orphan).logs.length, 1);
    assert.throws(() => startProgramSession(r, id, []), /not available/);
  } finally {
    db.close();
  }
});

test("enrollment records survive backup export and import", () => {
  const { r, db } = pathRepository();
  const restored = pathRepository();
  try {
    const program = testProgram();
    const { id } = enrollProgram(r, program, "2026-10-19");
    finish(r, startProgramSession(r, id, [program]).id);
    skipProgramSession(r, id, [program]);
    restored.r.importBackup(JSON.stringify(r.exportBackup()));
    const progress = programProgress(
      restored.r,
      currentEnrollment(restored.r, [program])!,
    );
    assert.equal(progress.completed, 1);
    assert.equal(progress.skipped, 1);
    assert.equal(progress.next?.session.id, "c");
  } finally {
    db.close();
    restored.db.close();
  }
});

test("phases follow authored week counts and suggested dates use training weekdays", () => {
  const base = testProgram();
  const sessions = base.phases[0]!.sessions;
  const phased = testProgram({
    durationWeeks: 3,
    phases: [
      { name: "One", weeks: 1, sessions },
      { name: "Two", weeks: 2, sessions },
    ],
  });
  assert.equal(sessionAt(phased, 2)!.phase.name, "One");
  assert.equal(sessionAt(phased, 3)!.phase.name, "Two");
  assert.equal(sessionAt(phased, 3)!.week, 2);
  assert.equal(sessionAt(phased, 9), undefined);
  // 2026-10-21 is a Wednesday.
  assert.deepEqual(suggestedDates([0, 2, 4], "2026-10-21", 3), [
    "2026-10-21",
    "2026-10-23",
    "2026-10-26",
  ]);
});
