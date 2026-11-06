import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCounts,
  inFilter,
  savedFoodRow,
  shownFoods,
} from "../src/screens/nutrition/saved-foods";
import type { Journal } from "../src/domain/types";

// Phase 7.3G G1: Saved foods presentation rules (read-only).

let n = 0;
const food = (data: Journal["data"]): Journal => ({
  id: `f${++n}`,
  kind: "food",
  date: "2026-10-26",
  data,
  createdAt: n,
  updatedAt: n,
});
const plain = food({
  name: "Crème fraîche",
  calories: 200,
  protein: 2,
  carbs: 3,
  fat: 20,
  quantity: 1,
  serving: "2 tbsp",
});
const oats = food({
  name: "oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 1,
});
const label = food({
  name: "Dr Pepper",
  calories: 150,
  protein: 0,
  carbs: 41,
  fat: 0,
  quantity: 1,
  serving: "1 can (355 ml)",
  personalKind: "food",
  servingName: "1 can",
  sourceId: "personal:00078000082401",
  sourceCatalog: "personal",
  sourceBarcode: "00078000082401",
  sourceBrand: "Keurig Dr Pepper",
  sourceMl: 355,
});
const correction = food({
  name: "Coca-Cola Can",
  calories: 150,
  protein: 0,
  carbs: 41,
  fat: 0,
  quantity: 1,
  personalKind: "correction",
  sourceId: "usda-branded:2412345",
  sourceBarcode: "00049000006346",
  sourceEdited: true,
});
// A plain saved copy of a USDA product is not a correction.
const copy = food({
  name: "Coke",
  calories: 140,
  protein: 0,
  carbs: 39,
  fat: 0,
  quantity: 1,
  sourceId: "usda-branded:2412345",
  sourceBarcode: "00049000006346",
});
const all = [plain, oats, label, correction, copy];

test("filters: label foods and corrections only; every food under All", () => {
  assert.deepEqual(filterCounts(all), { all: 5, labels: 1, corrections: 1 });
  assert.equal(inFilter(copy, "corrections"), false);
  assert.deepEqual(
    shownFoods(all, "", "labels").map((f) => f.id),
    [label.id],
  );
  assert.deepEqual(
    shownFoods(all, "", "corrections").map((f) => f.id),
    [correction.id],
  );
});

test("search: every word, any order, accents and case ignored, over name, brand and serving; name order", () => {
  assert.deepEqual(
    shownFoods(all, "", "all").map((f) => String(f.data.name)),
    ["Coca-Cola Can", "Coke", "Crème fraîche", "Dr Pepper", "oats"],
  );
  assert.deepEqual(
    shownFoods(all, "CREME", "all").map((f) => f.id),
    [plain.id],
  );
  assert.deepEqual(
    shownFoods(all, "keurig can", "all").map((f) => f.id),
    [label.id],
  );
  assert.deepEqual(
    shownFoods(all, "tbsp", "all").map((f) => f.id),
    [plain.id],
  );
  assert.deepEqual(shownFoods(all, "pepper", "corrections"), []);
});

test("rows show values as saved, per serving, with a source only for the lifter's own label values", () => {
  const row = savedFoodRow(label);
  assert.equal(row.serving, "1 can (355 ml)");
  assert.equal(row.kcal, "150 kcal");
  assert.equal(
    row.macros,
    "P\u00a00\u00a0g · C\u00a041\u00a0g · F\u00a00\u00a0g",
  );
  assert.equal(row.source, "Your label");
  assert.equal(row.brand, "Keurig Dr Pepper");
  assert.equal(savedFoodRow(correction).source, "Your correction");
  assert.equal(savedFoodRow(copy).source, undefined);
  assert.equal(savedFoodRow(oats).serving, "1 serving");
});
