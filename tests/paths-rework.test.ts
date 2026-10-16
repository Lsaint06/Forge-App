import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { generatePath } from "../src/domain/paths/generator";
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
      }),
      exercises,
    );
    const review = workloadReview(draft, exercises);
    assert.equal(draft.engineVersion, 7);
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
  }
});

test("sessions are no longer built to a time target: volume comes from goal caps, never junk", () => {
  const totalSets = (draft: ReturnType<typeof generatePath>) =>
    draft.days.reduce(
      (n, day) => n + day.exercises.reduce((m, e) => m + e.sets, 0),
      0,
    );
  const draft = generatePath(pathPreferences(), exercises);
  // Regenerating the same request yields the same volume; no hidden budget.
  assert.equal(
    totalSets(generatePath(pathPreferences(), exercises)),
    totalSets(draft),
  );
  for (const day of draft.days) {
    assert.ok(day.exercises.reduce((n, e) => n + e.sets, 0) <= 24);
    assert.equal(
      new Set(day.exercises.map((e) => e.exerciseId)).size,
      day.exercises.length,
    );
  }
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
  const home = generatePath({ ...p, equipment: ["Dumbbell"] }, exercises);
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

test("strength emphasises heavy main-lift practice over assistance volume", () => {
  const strength = generatePath(
    pathPreferences({ pathKey: "get-strong", frequency: 3 }),
    exercises,
  );
  for (const d of strength.days) {
    const primary = d.exercises.slice(0, 2);
    const assistance = d.exercises.slice(2);
    assert.ok(
      primary.every(
        (e) => e.reps === 5 && e.rest === 180 && e.sets >= 4 && e.sets <= 5,
      ),
    );
    assert.ok(
      assistance.every(
        (e) => [8, 12].includes(e.reps) && e.sets >= 2 && e.sets <= 3,
      ),
    );
    const primarySets = primary.reduce((n, e) => n + e.sets, 0);
    const assistanceSets = assistance.reduce((n, e) => n + e.sets, 0);
    assert.ok(primarySets >= assistanceSets);
  }
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

test("specific machines are independent and legacy full-gym programs remain compatible", () => {
  const p = pathPreferences({
    equipment: [
      "Full gym machines",
      "Cable",
      "Bench",
      "Barbell",
      "Squat rack",
      "Dumbbell",
    ],
  });
  const legacy = legacyPath(p, exercises);
  const { r, db } = pathRepository();
  try {
    acceptPath(r, legacy);
    assert.doesNotThrow(() =>
      startPathSession(r, pathSessions(r, pathPrograms(r)[0]!)[0]!.record.id),
    );
    const onlyChest = generatePath(
      pathPreferences({
        equipment: ["Dumbbell", "Chest press machine"],
      }),
      exercises,
    );
    assert.ok(
      onlyChest.days.every((d) =>
        d.exercises.every(
          (e) =>
            ![
              "leg-press",
              "leg-extension",
              "seated-leg-curl",
              "machine-row",
              "pec-deck-fly",
            ].includes(e.exerciseId),
        ),
      ),
    );
  } finally {
    db.close();
  }
});

test("no Path requires squatting when the user excludes that movement", () => {
  for (const path of forgePaths) {
    const p = pathPreferences({
      pathKey: path.key,
      frequency: path.frequency,
      avoidPatterns: ["squat"],
    });
    const draft = generatePath(p, exercises);
    assert.ok(
      draft.days.every((d) =>
        d.exercises.every(
          (item) =>
            exercises.find((e) => e.id === item.exerciseId)!.pattern !==
            "squat",
        ),
      ),
    );
    assert.ok(
      workloadReview(draft, exercises).warnings.some((w) =>
        w.includes("no direct quadriceps"),
      ),
    );
    const { r, db } = pathRepository();
    try {
      acceptPath(r, draft);
      const program = pathPrograms(r)[0]!;
      for (const session of pathSessions(r, program).slice(0, p.frequency)) {
        const w = startPathSession(r, session.record.id);
        assert.ok(
          r
            .workoutExercises(w.id)
            .every(
              (item) =>
                exercises.find((e) => e.id === item.exerciseId)!.pattern !==
                "squat",
            ),
        );
        r.finishWorkout(w.id);
      }
    } finally {
      db.close();
    }
  }
});

test("all other movement exclusions and individual exercise exclusions are respected", () => {
  const base = pathPreferences({ frequency: 3 });
  for (const pattern of [
    "horizontal push",
    "horizontal pull",
    "vertical push",
    "vertical pull",
    "hinge",
    "hip extension",
    "shoulder isolation",
    "elbow flexion",
    "elbow extension",
    "trunk stability",
  ] as const) {
    const plan = generatePath({ ...base, avoidPatterns: [pattern] }, exercises);
    assert.ok(
      plan.days.every((day) =>
        day.exercises.every(
          (item) =>
            exercises.find((e) => e.id === item.exerciseId)!.pattern !==
            pattern,
        ),
      ),
    );
  }
  const allSquats = exercises
    .filter((e) => e.pattern === "squat")
    .slice(0, 30)
    .map((e) => e.id);
  const plan = generatePath({ ...base, excluded: allSquats }, exercises);
  assert.ok(
    plan.days.every((day) =>
      day.exercises.every((item) => !allSquats.includes(item.exerciseId)),
    ),
  );
});

test("a single permitted movement survives saving and backup without restoring excluded slots", () => {
  const plan = generatePath(
    pathPreferences({
      pathKey: "start-strong",
      frequency: 1,
      equipment: ["Dumbbell"],
      excluded: ["dead-bug", "bird-dog", "reverse-crunch"],
      avoidPatterns: ["squat", "horizontal push", "hinge", "hip extension"],
    }),
    exercises,
  );
  assert.equal(plan.days[0]!.exercises.length, 1);
  assert.deepEqual(plan.days[0]!.roles, ["pull"]);
  const { r, db } = pathRepository();
  const restored = pathRepository();
  try {
    acceptPath(r, plan);
    restored.r.importBackup(JSON.stringify(r.exportBackup()));
    const session = pathSessions(restored.r, pathPrograms(restored.r)[0]!)[0]!;
    const workout = startPathSession(restored.r, session.record.id);
    assert.equal(restored.r.workoutExercises(workout.id).length, 1);
    assert.throws(
      () =>
        generatePath(
          {
            ...plan.preferences,
            equipment: [],
            avoidPatterns: [
              "squat",
              "horizontal push",
              "hinge",
              "hip extension",
            ],
          },
          exercises,
        ),
      /No exercises match/,
    );
  } finally {
    db.close();
    restored.db.close();
  }
});
