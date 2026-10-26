import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choicePortion,
  choiceResult,
  libraryResult,
} from "../src/components/nutrition/results";
import { foodChoices } from "../src/domain/nutrition";
import { loadFoodLibrary } from "../src/data/food-catalog";
import type { Journal } from "../src/domain/types";

// Phase 7.3D: the food-discovery result model shared by every source.

const entry = (data: Journal["data"], n = 1): Journal => ({
  id: `e${n}`,
  kind: "nutrition",
  date: "2026-10-26",
  data,
  createdAt: n,
  updatedAt: n,
});

test("own foods show their usual portion and energy; labels stay stable", () => {
  const { recent } = foodChoices(
    [
      entry({
        name: "Oats",
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
        quantity: 2,
        serving: "40 g",
      }),
    ],
    [],
  );
  const r = choiceResult(recent[0]!);
  assert.deepEqual(r, {
    key: `recent:${recent[0]!.key}`,
    source: "recent",
    title: "Oats",
    detail: "2 × 40 g · 300 kcal",
    provenance: undefined,
    label: "Oats, 2 × 40 g, 300 kcal",
    addLabel: "Add Oats",
    undoLabel: "Undo adding Oats",
    hint: "Choose servings and meal before adding",
  });
  assert.equal(choicePortion({ quantity: 1, serving: "" }), "1 serving");
  assert.equal(choicePortion({ quantity: 1.5, serving: "" }), "1.5 servings");
});

test("foods first logged from the library keep their USDA provenance", () => {
  const data = {
    name: "Banana, raw",
    calories: 89,
    protein: 1.1,
    carbs: 23,
    fat: 0.3,
    quantity: 1,
    serving: "100 g",
    sourceId: "fndds:2709224",
    sourceCatalog: "2026.1",
    sourceGrams: 100,
  };
  const [plain] = foodChoices([entry(data)], []).recent;
  assert.equal(choiceResult(plain!).provenance, "USDA");
  const [edited] = foodChoices(
    [entry({ ...data, sourceEdited: true })],
    [],
  ).recent;
  assert.equal(choiceResult(edited!).provenance, "Based on USDA");
});

test("library foods read per 100 g as published; nothing is invented", () => {
  const lib = loadFoodLibrary();
  for (const food of lib.foods.slice(0, 200)) {
    const r = libraryResult(food);
    assert.equal(r.source, "library");
    assert.equal(r.key, `lib:${food.id}`);
    assert.equal(r.title, food.name);
    assert.equal(r.provenance, "USDA");
    assert.match(r.detail, /^100 g · /);
    assert.equal(r.addLabel, `Add 100 g of ${food.name}`);
    // The generic library has no brands or barcodes: none are made up.
    assert.equal(r.brand, undefined);
    assert.equal(r.barcode, undefined);
  }
});
