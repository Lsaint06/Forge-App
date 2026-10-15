import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { generatePath, estimatedMinutes } from "../src/domain/paths/generator";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import { workloadReview } from "../src/domain/paths/review";
import {
  calendarWeek,
  weekDates,
  mondayOf,
  weekIntention,
} from "../src/domain/paths/calendar";
import { forgePaths } from "../src/domain/paths/catalog";
import { pathPreferences, pathRepository } from "./path-fixture";
import {
  acceptPath,
  pathPrograms,
  pathSessions,
  savedDraft,
  startPathSession,
  editPathDay,
} from "../src/data/paths";

test("muscle-building defaults include complementary back, leg, calf and arm work", () => {
  for (const key of ["build-muscle", "advanced-physique"] as const) {
    const path = forgePaths.find((p) => p.key === key)!;
    const draft = generatePath(
      pathPreferences({
        pathKey: key,
        frequency: path.frequency,
        duration: path.duration,
      }),
      exercises,
    );
    const review = workloadReview(draft, exercises);
    assert.equal(draft.engineVersion, 2);
    assert.deepEqual(review.warnings, []);
    assert.ok(review.sets.Chest! >= 10);
    assert.ok(review.sets.Back! >= 10);
    assert.ok(review.sets.Quads! >= 10);
    assert.ok(review.sets.Hamstrings! >= 8);
    for (const target of ["Calves", "Side delts", "Biceps", "Triceps"])
      assert.ok(review.sets[target]! >= 4, target);
    assert.ok(
      draft.days.some((d) =>
        d.exercises.some((e) => e.exerciseId === "seated-leg-curl"),
      ),
    );
    assert.ok(draft.days.every((d) => !/\b[AB]$/.test(d.name)));
    assert.ok(
      draft.days.every((d) => estimatedMinutes(d.exercises) <= path.duration),
    );
  }
});

test("short duration requests are explained rather than silently weakening workouts", () => {
  assert.throws(
    () => generatePath(pathPreferences({ duration: 30 }), exercises),
    /will not silently cut/,
  );
  const full = generatePath(pathPreferences({ duration: 90 }), exercises);
  const regular = generatePath(pathPreferences({ duration: 75 }), exercises);
  assert.deepEqual(full.days, regular.days);
});

test("priorities redistribute the same set budget and limited equipment exposes coverage gaps", () => {
  const p = pathPreferences();
  const base = generatePath(p, exercises);
  const emphasis = generatePath({ ...p, priorities: ["Chest"] }, exercises);
  assert.equal(
    workloadReview(base, exercises).total,
    workloadReview(emphasis, exercises).total,
  );
  assert.ok(
    workloadReview(emphasis, exercises).sets.Chest! >
      workloadReview(base, exercises).sets.Chest!,
  );
  const home = generatePath(
    { ...p, equipment: ["Dumbbell"], duration: 90 },
    exercises,
  );
  assert.ok(
    workloadReview(home, exercises).warnings.some((w) =>
      w.includes("vertical pull"),
    ),
  );
  assert.ok(
    workloadReview(home, exercises).warnings.some((w) =>
      w.includes("knee-flexion"),
    ),
  );
});

test("strength separates primary lift work from assistance and beginner split work stays manageable", () => {
  const strength = generatePath(
    pathPreferences({ pathKey: "get-strong", frequency: 3 }),
    exercises,
  );
  assert.ok(
    strength.days.every((d) =>
      d.exercises
        .slice(0, 2)
        .every((e) => e.sets === 4 && e.reps === 5 && e.rest === 180),
    ),
  );
  assert.ok(
    strength.days.every((d) =>
      d.exercises.slice(2).every((e) => e.sets === 2 && e.reps === 8),
    ),
  );
  const beginner = generatePath(
    pathPreferences({ experience: "Beginner" }),
    exercises,
  );
  assert.ok(beginner.days.every((d) => d.exercises.every((e) => e.sets <= 3)));
});

test("legacy saved programs still start and edit without migrating history or phase references", () => {
  const { r, db } = pathRepository();
  try {
    acceptPath(r, legacyPath(pathPreferences(), exercises));
    const program = pathPrograms(r)[0]!;
    assert.equal(program.data.engineVersion, 1);
    const session = pathSessions(r, program)[0]!;
    const workout = startPathSession(r, session.record.id);
    const snapshot = r.workoutSets(workout.id);
    const draft = savedDraft(r, program);
    editPathDay(
      r,
      program.record.id,
      0,
      draft.days[0]!.exercises.map((e) => ({ ...e, weight: 20 })),
    );
    assert.deepEqual(r.workoutSets(workout.id), snapshot);
    assert.equal(pathSessions(r, program)[0]!.data.workoutId, workout.id);
    assert.deepEqual(pathPrograms(r)[0]!.data.phases, program.data.phases);
  } finally {
    db.close();
  }
});

test("calendar uses real Monday–Sunday dates across DST and keeps moved sessions reachable beyond eight weeks", () => {
  assert.equal(mondayOf("2027-03-14"), "2027-03-08");
  assert.deepEqual(weekDates("2027-03-12", 1), [
    "2027-03-08",
    "2027-03-09",
    "2027-03-10",
    "2027-03-11",
    "2027-03-12",
    "2027-03-13",
    "2027-03-14",
  ]);
  assert.equal(weekDates("2027-03-12", 2)[0], "2027-03-15");
  assert.equal(calendarWeek("2027-03-12", "2027-05-24"), 12);
  assert.ok(weekDates("2027-03-12", 12).includes("2027-05-24"));
  assert.match(weekIntention(1), /Foundation/);
  assert.match(weekIntention(5), /Evolution/);
  assert.match(weekIntention(12), /rescheduled/);
});

test("every advertised frequency generates a recoverable experienced-lifter plan", () => {
  for (const path of forgePaths)
    for (let frequency = path.minDays; frequency <= path.maxDays; frequency++) {
      const draft = generatePath(
        pathPreferences({
          pathKey: path.key,
          frequency,
          duration: 90,
          experience: "Advanced",
        }),
        exercises,
      );
      assert.equal(draft.days.length, frequency);
      assert.ok(
        draft.days.every(
          (d) => d.exercises.length >= 2 && d.exercises.length <= 8,
        ),
      );
    }
});
