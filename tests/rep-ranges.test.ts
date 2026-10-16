import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { generatePath, validateDraft } from "../src/domain/paths/generator";
import { generatePath as legacyPath } from "../src/domain/paths/legacyGenerator";
import { prescriptionPolicy } from "../src/domain/paths/policy";
import { repRangeLabel } from "../src/domain/prescriptions";
import { targetProgression } from "../src/domain/progression";
import type { RepTarget, WorkoutSet } from "../src/domain/types";
import { pathPreferences } from "./path-fixture";

test("prescriptions follow each movement's purpose, not its slot or an experience multiplier", () => {
  const draft = generatePath(pathPreferences(), exercises);
  const upper = draft.days[0]!.exercises;
  const expected = [
    // Heavy session anchor, stable cable/machine compounds, then isolation.
    ["barbell-bench-press", 3, 6, 8, 180],
    ["seated-cable-row", 3, 8, 12, 120],
    ["lat-pulldown", 3, 8, 12, 120],
    ["dumbbell-lateral-raise", 3, 10, 15, 90],
  ] as const;
  for (const [id, sets, min, max, rest] of expected) {
    const item = upper.find((p) => p.exerciseId === id)!;
    assert.deepEqual(
      [item.sets, item.reps, item.repMax, item.rest],
      [sets, min, max, rest],
      id,
    );
  }
  // Advanced lifters do not receive more sets per lift than intermediates.
  const intermediate = prescriptionPolicy(pathPreferences(), "compound", true);
  const advanced = prescriptionPolicy(
    pathPreferences({ experience: "Advanced" }),
    "compound",
    true,
  );
  assert.ok(advanced.sets <= intermediate.sets);
  assert.ok(advanced.rir[0] <= intermediate.rir[0]);
});

test("every non-strength prescription uses a rep range so double progression applies", () => {
  for (const pathKey of [
    "start-strong",
    "build-muscle",
    "athlete-mode",
    "lean-strong",
    "advanced-physique",
  ] as const)
    for (const experience of [
      "Beginner",
      "Intermediate",
      "Advanced",
    ] as const) {
      if (pathKey === "advanced-physique" && experience === "Beginner")
        continue;
      const draft = generatePath(
        pathPreferences({ pathKey, frequency: 3, experience }),
        exercises,
      );
      assert.ok(
        draft.days.every((d) =>
          d.exercises.every((p) => p.repMax != null && p.repMax > p.reps),
        ),
        `${pathKey} ${experience}`,
      );
    }
  // Beginners train strength with dumbbell variants (barbell lifts unlock at
  // Intermediate), so their main lifts use a 6-8 range with long rests.
  const strength = generatePath(
    pathPreferences({
      pathKey: "get-strong",
      experience: "Beginner",
      frequency: 3,
    }),
    exercises,
  );
  assert.ok(
    strength.days.every((d) =>
      d.exercises
        .slice(0, 2)
        .every((p) => p.reps === 6 && p.repMax === 8 && p.rest >= 180),
    ),
  );
});

test("heavy targets of five or fewer reps are reserved for barbell and machine lifts", () => {
  for (const pathKey of [
    "get-strong",
    "athlete-mode",
    "build-muscle",
    "lean-strong",
  ] as const)
    for (const experience of ["Beginner", "Intermediate", "Advanced"] as const)
      for (const frequency of [3, 4]) {
        const draft = generatePath(
          pathPreferences({ pathKey, experience, frequency }),
          exercises,
        );
        for (const item of draft.days.flatMap((d) => d.exercises)) {
          const exercise = exercises.find((e) => e.id === item.exerciseId)!;
          if (item.reps > 5) continue;
          assert.match(
            `${exercise.equipment} ${exercise.id}`,
            /barbell|machine|cable|smith|leg press/i,
            `${pathKey} ${experience} ${frequency}d: ${item.exerciseId} ${item.reps}`,
          );
          if (exercise.pattern === "hinge") assert.ok(item.reps >= 5);
        }
      }
});

test("new ranges retain session and weekly safeguards across supported hypertrophy frequencies", () => {
  for (const pathKey of ["build-muscle", "advanced-physique"] as const) {
    for (
      let frequency = pathKey === "build-muscle" ? 2 : 3;
      frequency <= 6;
      frequency++
    ) {
      const draft = generatePath(
        pathPreferences({ pathKey, frequency }),
        exercises,
      );
      for (const day of draft.days) {
        assert.ok(day.exercises.reduce((n, p) => n + p.sets, 0) <= 28);
        assert.ok(day.exercises.every((p) => p.reps <= (p.repMax ?? p.reps)));
      }
    }
  }
});

test("a fixed-target first-engine draft still validates without conversion", () => {
  const legacy = legacyPath(pathPreferences(), exercises);
  assert.ok(
    legacy.days.every((d) => d.exercises.every((p) => p.repMax == null)),
  );
  assert.deepEqual(validateDraft(legacy, exercises), legacy);
});

test("rep labels distinguish genuine ranges from fixed targets", () => {
  assert.equal(repRangeLabel({ reps: 6, repMax: 8 }), "6-8");
  assert.equal(repRangeLabel({ reps: 8 }), "8");
  assert.equal(repRangeLabel({ reps: 8, repMax: 8 }), "8");
});

const target: RepTarget = { min: 6, max: 8, sets: 3 };
function session(reps: number, effort: Partial<WorkoutSet> = {}): WorkoutSet[] {
  return Array.from({ length: 3 }, (_, position) => ({
    id: String(position),
    exerciseRowId: "row",
    position,
    weight: 50,
    reps,
    duration: 0,
    distance: 0,
    rpe: null,
    rir: null,
    kind: "working",
    completed: true,
    rest: 120,
    tempo: "",
    notes: "",
    side: "both",
    ...effort,
  }));
}

test("range progression first builds reps and only suggests an increase with reported manageable effort", () => {
  assert.equal(targetProgression([], target, 2.5).weight, null);
  assert.equal(targetProgression([session(7)], target, 2.5).weight, 50);
  assert.equal(
    targetProgression([session(8), session(8)], target, 2.5).weight,
    50,
  );
  assert.equal(
    targetProgression(
      [session(8, { rir: 2 }), session(8, { rpe: 8 })],
      target,
      2.5,
    ).weight,
    52.5,
  );
  assert.equal(
    targetProgression(
      [session(8, { rir: 2, rpe: 10 }), session(8, { rir: 2 })],
      target,
      2.5,
    ).weight,
    50,
  );
  // About one rep in reserve matches the Path effort target and progresses.
  assert.equal(
    targetProgression(
      [session(8, { rpe: 9 }), session(8, { rir: 1 })],
      target,
      2.5,
    ).weight,
    52.5,
  );
  // Sets taken to failure do not establish a manageable load.
  assert.equal(
    targetProgression(
      [session(8, { rir: 0 }), session(8, { rir: 0 })],
      target,
      2.5,
    ).weight,
    50,
  );
});

test("range progression requires complete comparable sets at the same load and never treats warmups as working sets", () => {
  const good = session(8, { rir: 3 });
  for (const invalid of [
    good.slice(1),
    session(8, { completed: false }),
    session(8, { kind: "warmup" }),
    session(8, { weight: 40 }),
    [good[0]!, { ...good[1]!, weight: 45 }, good[2]!],
  ]) {
    assert.equal(targetProgression([good, invalid], target, 2.5).weight, null);
  }
  assert.equal(
    targetProgression(
      [session(8, { weight: 0, rir: 3 }), session(8, { weight: 0, rir: 3 })],
      target,
      2.5,
    ).weight,
    null,
  );
});

test("repeated missed targets suggest optional regression, not an automatic load change", () => {
  const recommendation = targetProgression(
    [session(5), session(5)],
    target,
    2.5,
  );
  assert.equal(recommendation.weight, 45);
  assert.match(recommendation.reason, /optional guidance/);
});
