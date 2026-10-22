import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { forgePaths, movementMenu } from "../src/domain/paths/catalog";
import { exerciseStimulus } from "../src/domain/paths/stimulus";
import { generatePath } from "../src/domain/paths/generator";
import { generatePath as previousPlanner } from "../src/domain/paths/versionTwoGenerator";
import { workloadReview } from "../src/domain/paths/review";
import { prescriptionPolicy } from "../src/domain/paths/policy";
import { pathPreferences, pathRepository } from "./path-fixture";
import {
  pathPrograms,
  pathSessions,
  startPathSession,
} from "../src/data/paths";
import { acceptPath, savedDraft, editPathDay } from "../src/data/pathBuilder";

test("every recommended exercise has a reviewed purpose and direct/assisting targets", () => {
  for (const movement of movementMenu)
    assert.equal(exerciseStimulus(movement.id).reviewed, true, movement.id);
  assert.deepEqual(exerciseStimulus("bodyweight-glute-bridge").direct, [
    "Glutes",
  ]);
  assert.deepEqual(exerciseStimulus("band-pull-apart").direct, ["Rear delts"]);
  assert.equal(exerciseStimulus("custom-unknown").reviewed, false);
});

test("default weekly plans cover major muscle groups through deliberate direct or supporting work", () => {
  const muscles = [
    "Chest",
    "Back",
    "Quads",
    "Hamstrings",
    "Glutes",
    "Front delts",
    "Side delts",
    "Rear delts",
    "Biceps",
    "Triceps",
    "Calves",
    "Core",
  ];
  for (const path of forgePaths) {
    const plan = generatePath(
      pathPreferences({
        pathKey: path.key,
        frequency: path.frequency,
        experience: path.key === "start-strong" ? "Beginner" : "Advanced",
      }),
      exercises,
    );
    const review = workloadReview(plan, exercises);
    for (const muscle of muscles)
      assert.ok(
        (review.sets[muscle] ?? 0) +
          (review.secondary[muscle] ?? 0) +
          (review.assistance[muscle] ?? 0) >
          0,
        `${path.key}: ${muscle}`,
      );
    // Secondary involvement is reported separately, never as direct sets.
    if (review.secondary.Glutes)
      assert.ok(
        (review.sets.Glutes ?? 0) < review.secondary.Glutes,
        "squat/hinge glute work is secondary, not direct",
      );
    assert.equal(
      review.total,
      plan.days.flatMap((d) => d.exercises).reduce((sum, p) => sum + p.sets, 0),
      "compound co-targets must not inflate the total set count",
    );
  }
});

test("limited equipment does not turn curls into hinges, overhead presses into raises, or rows into face pulls", () => {
  const plan = generatePath(
    pathPreferences({ equipment: ["Dumbbell"] }),
    exercises,
  );
  for (const day of plan.days) {
    assert.ok(
      day.exercises.filter((e) => /romanian-deadlift/.test(e.exerciseId))
        .length <= 1,
    );
    assert.ok(!day.exercises.some((e) => e.exerciseId === "band-pull-apart"));
    assert.ok(
      !day.exercises.some((e) => e.exerciseId === "bodyweight-split-squat"),
    );
  }
  const strength = generatePath(
    pathPreferences({
      pathKey: "get-strong",
      frequency: 3,
      equipment: ["Dumbbell"],
    }),
    exercises,
  );
  assert.ok(
    strength.days[1]!.exercises.every(
      (e) => e.exerciseId !== "dumbbell-lateral-raise",
    ),
  );
  assert.ok(
    workloadReview(plan, exercises).warnings.some((w) =>
      /knee-flexion/.test(w),
    ),
  );
});

test("isolation prescriptions follow the selected exercise rather than a generic compound slot", () => {
  const plan = generatePath(pathPreferences({ style: "Machines" }), exercises);
  const fly = plan.days
    .flatMap((d) => d.exercises)
    .find((e) => /fly/.test(e.exerciseId) && !/reverse/.test(e.exerciseId))!;
  const policy = prescriptionPolicy(plan.preferences, "isolation", false);
  assert.deepEqual(
    [fly.reps, fly.repMax, fly.rest],
    [policy.reps, policy.repMax, policy.rest],
  );
  assert.deepEqual(exerciseStimulus(fly.exerciseId).assistance, []);
});

test("version-two three-day programs remain startable and editable with their original snapshots", () => {
  const { r, db } = pathRepository();
  try {
    const old = previousPlanner(pathPreferences({ frequency: 3 }), exercises);
    assert.equal(old.engineVersion, 2);
    acceptPath(r, old);
    const program = pathPrograms(r)[0]!;
    const workout = startPathSession(r, pathSessions(r, program)[0]!.record.id);
    const original = r.workoutSets(workout.id);
    const draft = savedDraft(r, program);
    editPathDay(
      r,
      program.record.id,
      0,
      draft.days[0]!.exercises.map((e) => ({ ...e, weight: 20 })),
    );
    assert.deepEqual(r.workoutSets(workout.id), original);
    const restored = pathRepository();
    try {
      restored.r.importBackup(JSON.stringify(r.exportBackup()));
      assert.equal(
        savedDraft(restored.r, pathPrograms(restored.r)[0]!).engineVersion,
        2,
      );
      assert.deepEqual(restored.r.workoutSets(workout.id), original);
    } finally {
      restored.db.close();
    }
  } finally {
    db.close();
  }
});
