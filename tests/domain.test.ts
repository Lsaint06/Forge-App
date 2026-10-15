import { test } from "node:test";
import assert from "node:assert/strict";
import {
  volume,
  estimatedMax,
  overload,
  kgToLb,
  lbToKg,
  elapsedSeconds,
  readiness,
  nutritionTotals,
  achievements,
  resolveRevision,
} from "../src/domain/metrics";
import { backupSchema } from "../src/domain/validation";
const sets = [
  { weight: 100, reps: 10, completed: true, kind: "working", rpe: 8 },
  { weight: 20, reps: 5, completed: true, kind: "warmup" },
  { weight: 100, reps: 8, completed: false, kind: "working" },
];
test("volume excludes incomplete sets and warmups", () =>
  assert.equal(volume(sets), 1000));
test("Epley estimate excludes invalid reps and preserves single rep", () => {
  assert.equal(estimatedMax(100, 1), 100);
  assert.equal(estimatedMax(100, 10), 133.33333333333331);
  assert.equal(estimatedMax(100, 0), 0);
});
test("unit conversion is reversible", () =>
  assert.ok(Math.abs(lbToKg(kgToLb(80)) - 80) < 1e-9));
test("timestamp timer subtracts paused time", () =>
  assert.equal(elapsedSeconds(1000, 11000, 2000), 8));
test("overload raises after two successful sessions and explains decision", () => {
  const r = overload([[sets[0]!], [sets[0]!]], {
    min: 8,
    max: 10,
    increment: 2.5,
  });
  assert.equal(r.weight, 102.5);
  assert.match(r.reason, /upper/i);
});
test("overload holds below target and reduces repeated regression", () => {
  assert.equal(
    overload([[{ ...sets[0]!, reps: 9 }]], { min: 8, max: 10, increment: 2.5 })
      .weight,
    100,
  );
  assert.equal(
    overload([[{ ...sets[0]!, reps: 4 }], [{ ...sets[0]!, reps: 5 }]], {
      min: 8,
      max: 10,
      increment: 2.5,
    }).weight,
    90,
  );
});
test("Path progression uses the prescribed rep target, not the generic range", () => {
  // A Path drives progression against its exact prescribed reps (min === max).
  const target = { min: 5, max: 5, increment: 2.5 };
  const hit = {
    weight: 100,
    reps: 5,
    completed: true,
    kind: "working",
    rpe: 7,
  };
  // Two sessions hitting the prescribed reps with manageable effort: increment.
  assert.equal(overload([[hit], [hit]], target).weight, 102.5);
  // A single qualifying session holds the load (no premature increase).
  assert.equal(overload([[hit]], target).weight, 100);
  // Two sessions below the prescribed reps: reduce and review recovery.
  const miss = { weight: 100, reps: 4, completed: true, kind: "working" };
  assert.equal(overload([[miss], [miss]], target).weight, 90);
});
test("nutrition totals scale serving quantities", () =>
  assert.deepEqual(
    nutritionTotals([
      { calories: 200, protein: 20, carbs: 10, fat: 5, quantity: 2 },
    ]),
    { calories: 400, protein: 40, carbs: 20, fat: 10 },
  ));
test("readiness has transparent bounded score", () => {
  assert.equal(
    readiness({ sleep: 8, quality: 5, soreness: 1, energy: 5, stress: 1 })
      .score,
    100,
  );
  assert.equal(
    readiness({ sleep: 0, quality: 1, soreness: 5, energy: 1, stress: 5 })
      .score,
    0,
  );
});
test("achievements require recorded events", () => {
  assert.equal(achievements(0, 0, 0).length, 0);
  assert.ok(achievements(10, 10000, 1).some((x) => x.id === "ten"));
});
test("remote changes are conflicts, never last-write-wins", () => {
  assert.equal(resolveRevision(2, 3), "conflict");
  assert.equal(resolveRevision(2, 2), "upload");
});
test("malformed backup rejects before mutation", () => {
  assert.equal(
    backupSchema.safeParse({ version: 1, workouts: [{}] }).success,
    false,
  );
});
test("measurement units convert safely to explicit canonical storage", async () => {
  const { canonicalMeasurement, displayMeasurement } =
    await import("../src/domain/metrics");
  assert.deepEqual(canonicalMeasurement(2.2046226218487757, "lb"), {
    value: 1,
    unit: "kg",
  });
  assert.deepEqual(canonicalMeasurement(10, "in"), { value: 25.4, unit: "cm" });
  assert.deepEqual(displayMeasurement(25.4, "cm", "lb"), {
    value: 10,
    unit: "in",
  });
  assert.throws(() => canonicalMeasurement(Infinity, "kg"));
});
