import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEALS,
  canonicalMeal,
  defaultMeal,
  entriesOn,
  entryCalories,
  entryFromFood,
  foodChoices,
  foodFromEntry,
  groupByMeal,
  isDuplicateFood,
  mergeEntry,
  portionText,
  servingsText,
  targetsPersonalized,
  totalsOf,
} from "../src/domain/nutrition";
import { nutritionTotals } from "../src/domain/metrics";
import { decimalText } from "../src/domain/numbers";
import { dayTitle } from "../src/domain/calendar-dates";
import { defaults, type Journal } from "../src/domain/types";
import { pathRepository } from "./path-fixture";

// Phase 7B WP4A: nutrition day, meals, totals, foods, edits and targets.

let n = 0;
function entry(
  data: Journal["data"],
  date = "2026-10-23",
  kind: Journal["kind"] = "nutrition",
): Journal {
  n += 1;
  return { id: `e${n}`, kind, date, data, createdAt: n, updatedAt: n };
}
const oats = {
  name: "Oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 1,
  serving: "40 g",
};
const rice = {
  name: "Rice",
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
  quantity: 1.5,
  serving: "100 g",
};

test("a day holds only its own entries, in the order they were logged", () => {
  const a = entry({ ...oats, meal: "Breakfast" }, "2026-10-22");
  const b = entry({ ...oats, meal: "Breakfast" });
  const c = entry({ ...rice, meal: "Lunch" });
  assert.deepEqual(
    entriesOn([c, a, b], "2026-10-23").map((e) => e.id),
    [b.id, c.id],
  );
  assert.deepEqual(entriesOn([c, a, b], "2026-10-21"), []);
});

test("days read as Today, Yesterday or a date, across month ends", () => {
  assert.equal(dayTitle("2026-11-01", "2026-11-01"), "Today");
  assert.equal(dayTitle("2026-10-31", "2026-11-01"), "Yesterday");
  assert.match(dayTitle("2026-10-29", "2026-11-01"), /Oct/);
});

test("meals: four defaults in order, legacy spellings join them, nothing is lost", () => {
  const entries = [
    entry({ ...oats, meal: "breakfast" }),
    entry({ ...oats, meal: " Breakfast " }),
    entry({ ...rice, meal: "Lunch" }),
    entry({ ...rice, meal: "Snack" }),
    entry({ ...rice, meal: "Post-workout" }),
    entry({ ...rice, meal: "post-workout" }),
    entry({ ...oats }),
    entry({ ...oats, meal: "" }),
  ];
  const groups = groupByMeal(entries);
  assert.deepEqual(
    groups.map((g) => g.label),
    [...MEALS, "Post-workout", "Other"],
  );
  assert.equal(groups[0]!.entries.length, 2);
  assert.equal(groups[2]!.entries.length, 0);
  assert.equal(groups[3]!.entries.length, 1);
  assert.equal(groups[4]!.entries.length, 2);
  assert.equal(groups[5]!.entries.length, 2);
  // Every entry exactly once, and only the defaults accept new food.
  const ids = groups.flatMap((g) => g.entries.map((e) => e.id)).sort();
  assert.deepEqual(ids, entries.map((e) => e.id).sort());
  assert.deepEqual(
    groups.filter((g) => g.meal).map((g) => g.label),
    [...MEALS],
  );
  // Grouping is display only: stored meals are untouched.
  assert.equal(entries[0]!.data.meal, "breakfast");
  assert.equal(canonicalMeal("SNACKS"), "Snacks");
  assert.equal(canonicalMeal("Brunch"), undefined);
});

test("the default meal follows the time of day", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m).getTime();
  assert.equal(defaultMeal(at(7)), "Breakfast");
  assert.equal(defaultMeal(at(10, 29)), "Breakfast");
  assert.equal(defaultMeal(at(10, 30)), "Lunch");
  assert.equal(defaultMeal(at(14, 59)), "Lunch");
  assert.equal(defaultMeal(at(15)), "Dinner");
  assert.equal(defaultMeal(at(21)), "Snacks");
  assert.equal(defaultMeal(at(0, 30)), "Breakfast");
});

test("totals use the existing calculation on raw values", () => {
  const entries = [
    entry({ ...oats, calories: 100.4 }),
    entry({ ...oats, calories: 100.4 }),
    entry({ ...oats, calories: 100.4 }),
    entry({ ...rice }),
  ];
  const totals = totalsOf(entries);
  assert.deepEqual(
    totals,
    nutritionTotals(
      entries.map((e) => ({
        calories: Number(e.data.calories),
        protein: Number(e.data.protein),
        carbs: Number(e.data.carbs),
        fat: Number(e.data.fat),
        quantity: Number(e.data.quantity),
      })),
    ),
  );
  // Rows round on their own; the day total is not a sum of rounded rows.
  assert.equal(Math.round(totals.calories), Math.round(301.2 + 195));
  assert.equal(entryCalories(rice), 195);
  for (const g of groupByMeal(entries))
    assert.deepEqual(g.totals, totalsOf(g.entries));
});

test("portions read naturally", () => {
  assert.equal(portionText(oats), "40 g");
  assert.equal(portionText(rice), "1.5 × 100 g");
  assert.equal(
    portionText({ ...oats, serving: "", quantity: 2 }),
    "2 servings",
  );
  assert.equal(servingsText(1), "1 serving");
  assert.equal(servingsText(0.25), "0.25 servings");
});

test("recent foods come first, once each, at the servings last eaten", () => {
  const entries = [
    entry({ ...oats, meal: "Breakfast" }, "2026-10-20"),
    entry({ ...rice, meal: "Lunch" }, "2026-10-21"),
    entry({ ...oats, quantity: 2, meal: "Breakfast" }, "2026-10-22"),
  ];
  const foods = [
    entry({ ...oats }, "2026-10-01", "food"),
    entry(
      {
        name: "Banana",
        calories: 105,
        protein: 1.3,
        carbs: 27,
        fat: 0.4,
        quantity: 1,
        serving: "1 medium",
      },
      "2026-10-01",
      "food",
    ),
    entry(
      {
        name: "Apple",
        calories: 95,
        protein: 0.5,
        carbs: 25,
        fat: 0.3,
        quantity: 1,
      },
      "2026-10-01",
      "food",
    ),
  ];
  const { recent, saved } = foodChoices(entries, foods);
  assert.deepEqual(
    recent.map((c) => [c.name, c.quantity]),
    [
      ["Oats", 2],
      ["Rice", 1.5],
    ],
  );
  // Saved foods already shown as recent aren't repeated; the rest are A–Z.
  assert.deepEqual(
    saved.map((c) => c.name),
    ["Apple", "Banana"],
  );
  // Search looks at names and servings, across everything eaten before.
  assert.deepEqual(
    foodChoices(entries, foods, "medium").saved.map((c) => c.name),
    ["Banana"],
  );
  const many = Array.from({ length: 12 }, (_, i) =>
    entry({ ...oats, name: `Food ${i}` }),
  );
  assert.equal(foodChoices(many, []).recent.length, 8);
  assert.equal(foodChoices(many, [], "food").recent.length, 12);
});

test("logging a food copies its values into the chosen meal, without its notes", () => {
  const data = entryFromFood(
    {
      name: "Oats",
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      serving: "40 g",
    },
    "Breakfast",
    1.5,
  );
  assert.deepEqual(data, {
    name: "Oats",
    meal: "Breakfast",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    quantity: 1.5,
    serving: "40 g",
  });
  // Saving an entry as a food drops its meal and notes.
  assert.deepEqual(foodFromEntry({ ...data, notes: "post run" }), {
    name: "Oats",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    quantity: 1.5,
    serving: "40 g",
  });
});

test("duplicate foods are recognised by name, serving and values", () => {
  const foods = [entry({ ...oats }, "2026-10-01", "food")];
  assert.equal(
    isDuplicateFood(foods, { ...oats, name: " oats ", quantity: 3 }),
    true,
  );
  assert.equal(isDuplicateFood(foods, { ...oats, calories: 151 }), false);
  assert.equal(isDuplicateFood(foods, { ...oats, serving: "50 g" }), false);
});

test("an edit replaces only the changed fields and keeps everything else exactly", () => {
  const original = {
    ...oats,
    meal: "Post-workout",
    notes: "",
    custom: 7,
    flag: true,
  };
  const merged = mergeEntry(original, { quantity: 2, serving: "" });
  assert.deepEqual(merged, { ...original, quantity: 2, serving: "" });
  assert.equal(typeof merged.custom, "number");
  assert.equal(merged.flag, true);
  // Clearing an optional field that never existed doesn't add it.
  assert.equal("notes" in mergeEntry({ ...rice }, { notes: "" }), false);
});

test("comma decimals are read as decimals; nothing else changes meaning", () => {
  assert.equal(decimalText("1,5"), "1.5");
  assert.equal(decimalText("22,5"), "22.5");
  assert.equal(decimalText(",5"), ".5");
  assert.equal(decimalText("1.5"), "1.5");
  assert.equal(decimalText("135"), "135");
  // Ambiguous text is left alone, so it stays invalid.
  assert.equal(Number(decimalText("1.234,5")), NaN);
  assert.equal(Number(decimalText("1,2,3")), NaN);
  assert.equal(decimalText(""), "");
});

test("default targets are suggestions until changed or saved explicitly", () => {
  const p = {
    calories: defaults.calories,
    protein: defaults.protein,
    carbs: defaults.carbs,
    fat: defaults.fat,
  };
  assert.equal(targetsPersonalized(p, false), false);
  assert.equal(targetsPersonalized(p, true), true);
  assert.equal(targetsPersonalized({ ...p, calories: 2600 }, false), true);
  assert.equal(targetsPersonalized({ ...p, fat: 70 }, false), true);
  assert.deepEqual(
    [p.calories, p.protein, p.carbs, p.fat],
    [2000, 150, 200, 65],
  );
});

test("nutrition records, legacy shapes included, survive a backup unchanged", () => {
  const { r, db } = pathRepository();
  const target = pathRepository();
  try {
    r.addJournal("nutrition", { ...oats, meal: "Breakfast" }, "2026-10-22");
    r.addJournal("nutrition", { ...rice }, "2026-10-23");
    r.addJournal(
      "nutrition",
      { ...oats, meal: "lunch", notes: "x" },
      "2026-10-23",
    );
    r.addJournal("food", { ...oats, meal: "Lunch", notes: "from an entry" });
    const before = JSON.stringify(r.exportBackup().journals);
    target.r.importBackup(JSON.stringify(r.exportBackup()));
    assert.equal(JSON.stringify(target.r.exportBackup().journals), before);
  } finally {
    db.close();
    target.db.close();
  }
});
