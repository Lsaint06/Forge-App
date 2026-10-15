import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import { generatePath, validateDraft } from "../src/domain/paths/generator";
import { estimateSession } from "../src/domain/paths/duration";
import { compoundRepRange } from "../src/domain/paths/repRanges";
import { repRangeLabel } from "../src/domain/prescriptions";
import { targetProgression } from "../src/domain/progression";
import type { RepTarget, WorkoutSet } from "../src/domain/types";
import { pathPreferences } from "./path-fixture";

test("hypertrophy compounds have role-based ranges, not arbitrary exercise variation", () => {
  const draft = generatePath(pathPreferences(), exercises);
  assert.equal(draft.engineVersion, 5);
  const upper = draft.days[0]!.exercises;
  const expected = [
    ["barbell-bench-press", 6, 8],
    ["seated-cable-row", 8, 10],
    ["lat-pulldown", 10, 12],
    ["incline-dumbbell-bench-press", 8, 12],
  ] as const;
  for (const [id, min, max] of expected) {
    const item = upper.find((p) => p.exerciseId === id)!;
    assert.equal(item.reps, min, id);
    assert.equal(item.repMax, max, id);
  }
  const alternate = compoundRepRange(
    pathPreferences(),
    exercises.find((e) => e.id === "dumbbell-bench-press")!,
    true,
  );
  assert.deepEqual(alternate, { reps: 6, repMax: 8 });
});

test("foundation, strength, athletic and recomposition prescriptions keep their existing fixed targets", () => {
  for (const pathKey of [
    "start-strong",
    "get-strong",
    "athlete-mode",
    "lean-strong",
  ] as const) {
    const draft = generatePath(
      pathPreferences({ pathKey, frequency: 3, duration: 90 }),
      exercises,
    );
    assert.ok(
      draft.days.every((d) => d.exercises.every((p) => p.repMax == null)),
    );
  }
  const beginner = generatePath(
    pathPreferences({ experience: "Beginner" }),
    exercises,
  );
  assert.ok(
    beginner.days.every((d) => d.exercises.every((p) => p.repMax == null)),
  );
});

test("duration uses the upper rep boundary, not the lower target", () => {
  const item = {
    exerciseId: "barbell-bench-press",
    sets: 4,
    reps: 6,
    repMax: 12,
    weight: 0,
    rest: 120,
  };
  const range = estimateSession([item], exercises);
  const fixedUpper = estimateSession(
    [{ ...item, reps: 12, repMax: undefined }],
    exercises,
  );
  const fixedLower = estimateSession(
    [{ ...item, repMax: undefined }],
    exercises,
  );
  assert.deepEqual(range, fixedUpper);
  assert.ok(range.expected > fixedLower.expected);
});

test("new ranges retain time and weekly safeguards across supported hypertrophy frequencies", () => {
  for (const pathKey of ["build-muscle", "advanced-physique"] as const) {
    for (
      let frequency = pathKey === "build-muscle" ? 2 : 3;
      frequency <= 6;
      frequency++
    ) {
      const draft = generatePath(
        pathPreferences({ pathKey, frequency, duration: 90 }),
        exercises,
      );
      for (const day of draft.days) {
        assert.ok(estimateSession(day.exercises, exercises).expected <= 90);
        assert.ok(day.exercises.reduce((n, p) => n + p.sets, 0) <= 28);
        assert.ok(day.exercises.every((p) => p.reps <= (p.repMax ?? p.reps)));
      }
    }
  }
});

test("a fixed-target Planner 4 draft still validates without conversion", () => {
  const current = generatePath(pathPreferences(), exercises);
  const fixed = {
    ...current,
    engineVersion: 4 as const,
    days: current.days.map((d) => ({
      ...d,
      exercises: d.exercises.map(({ repMax, ...p }) => {
        void repMax;
        return { ...p, reps: 8 };
      }),
    })),
  };
  assert.deepEqual(validateDraft(fixed, exercises), fixed);
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
  assert.equal(
    targetProgression(
      [session(8, { rpe: 9 }), session(8, { rpe: 9 })],
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
