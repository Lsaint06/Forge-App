import { test } from "node:test";
import assert from "node:assert/strict";
import { exercises, searchExercises } from "../src/data/catalog";
import { exerciseSchema } from "../src/domain/validation";
test("catalog has at least 250 unique named exercises with validated metadata", () => {
  assert.ok(exercises.length >= 250);
  assert.equal(new Set(exercises.map((e) => e.id)).size, exercises.length);
  assert.equal(
    new Set(exercises.map((e) => e.name.toLowerCase())).size,
    exercises.length,
  );
  exercises.forEach((e) => exerciseSchema.parse(e));
});
test("exercise search applies every query token and equipment/muscle filters", () => {
  assert.ok(
    searchExercises(exercises, "bench barbell", "Chest", "Barbell").some(
      (e) => e.id === "barbell-bench-press",
    ),
  );
  assert.equal(searchExercises(exercises, "bench", "Calves").length, 0);
});
