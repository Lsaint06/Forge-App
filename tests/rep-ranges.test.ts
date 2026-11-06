import test from "node:test";
import assert from "node:assert/strict";
import { repRangeLabel } from "../src/domain/prescriptions";
import { targetProgression } from "../src/domain/progression";
import type { RepTarget, WorkoutSet } from "../src/domain/types";

// Shared rep-range labels and target progression, used by template and
// saved-Path workouts. (Generated-plan prescription tests were retired with
// the generator in Phase 6B.)

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
