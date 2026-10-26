import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exerciseChips,
  exerciseMeta,
  exerciseOverline,
} from "../src/screens/exercise/model";
import { pathRepository } from "./path-fixture";

// Phase 7.2C-3B: exercise detail header and chips.

const { r, db } = pathRepository();
const catalog = r.exercises();
db.close();
const find = (id: string) => catalog.find((e) => e.id === id)!;

test("the approved prototypes' header reads as designed", () => {
  const bench = find("barbell-bench-press");
  assert.equal(exerciseOverline(bench), "Chest · Horizontal push");
  assert.deepEqual(exerciseChips(bench), [
    "Barbell",
    "Horizontal push",
    "Strength",
  ]);
  assert.equal(
    exerciseMeta(bench),
    `${bench.difficulty} · ${bench.unilateral ? "One side at a time" : "Both sides"}`,
  );
  assert.deepEqual(exerciseChips(find("lat-pulldown")), [
    "Cable",
    "Vertical pull",
    "Strength",
  ]);
  assert.deepEqual(exerciseChips(find("back-squat")), [
    "Barbell",
    "Squat",
    "Strength",
  ]);
});

test("every catalogue exercise has the same three chips, in the same order", () => {
  const measures = new Set(["Strength", "Timed", "Distance"]);
  for (const e of catalog) {
    const chips = exerciseChips(e);
    assert.equal(chips.length, 3, e.id);
    assert.equal(chips[0], e.equipment, e.id);
    assert.equal(chips[1]!.toLowerCase(), e.pattern.toLowerCase(), e.id);
    assert.ok(measures.has(chips[2]!), `${e.id}: ${chips[2]}`);
  }
  for (const [category, chip] of [
    ["strength", "Strength"],
    ["duration", "Timed"],
    ["distance", "Distance"],
  ] as const) {
    const example = catalog.find((e) => e.category === category)!;
    assert.equal(exerciseChips(example)[2], chip, example.id);
  }
});

test("blank fields are left out rather than shown empty", () => {
  const legacy = {
    muscle: "",
    pattern: "",
    equipment: "",
    category: "duration" as const,
    difficulty: "",
    unilateral: true,
  };
  assert.deepEqual(exerciseChips(legacy), ["Timed"]);
  assert.equal(exerciseOverline(legacy), "");
  assert.equal(exerciseMeta(legacy), "One side at a time");
});
