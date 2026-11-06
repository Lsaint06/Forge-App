import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayHeading,
  intake,
  loggingStreak,
  macroLine,
  mealSummary,
  quickAddFoods,
  quickPortion,
} from "../src/screens/nutrition/model";
import {
  groupByMeal,
  totalsOf,
  type NutritionData,
} from "../src/domain/nutrition";
import { addDays } from "../src/domain/paths/model";
import { mondayOf } from "../src/domain/progress/range";
import type { Journal } from "../src/domain/types";

// Phase 7.3B: the Nutrition dashboard's read-only view model.

let n = 0;
const entry = (
  data: NutritionData,
  date = "2026-10-22",
  kind: "nutrition" | "food" = "nutrition",
): Journal => ({
  id: `e${++n}`,
  kind,
  date,
  data,
  createdAt: n,
  updatedAt: n,
});
const oats = {
  name: "Oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 1,
  serving: "40 g",
};

test("intake uses the protected totals and only the lifter's own target", () => {
  const totals = totalsOf([
    entry({ ...oats, quantity: 2 }),
    entry({ ...oats, calories: 133.4 }),
  ]);
  // 300 + 133.4 = 433.4 → shown as 433.
  const own = intake(totals, 2400, true);
  assert.equal(own.kcal, 433);
  assert.equal(own.showGoal, true);
  assert.equal(own.percent, 18);
  assert.deepEqual(own.left, { value: "1,967", unit: "kcal left" });
  assert.equal(own.spoken, "433 of 2,400 calories, 1,967 left");
  // Eaten + left always adds up to the target shown.
  assert.equal(own.kcal + own.remaining, own.goal);
  const over = intake(
    totalsOf([entry({ ...oats, calories: 2600 })]),
    2400,
    true,
  );
  assert.equal(over.percent, 108);
  assert.deepEqual(over.left, { value: "200", unit: "kcal over" });
  assert.equal(over.spoken, "2,600 of 2,400 calories, 200 over");
  // Suggested defaults are never presented as targets.
  const suggested = intake(totals, 2000, false);
  assert.equal(suggested.showGoal, false);
  assert.equal(suggested.percent, undefined);
  assert.equal(suggested.spoken, "433 calories eaten");
  assert.equal(intake(totals, 0, true).showGoal, false);
});

test("headings name the day; macros are spoken in full", () => {
  const today = "2026-10-22";
  assert.equal(dayHeading(today, today, "nutrition"), "Today's nutrition");
  assert.equal(
    dayHeading(addDays(today, -1), today, "meals"),
    "Yesterday's meals",
  );
  assert.match(dayHeading(addDays(today, -3), today, "meals"), /^Meals · /);
  assert.deepEqual(macroLine({ protein: 35.4, carbs: 44.6, fat: 12 }), {
    text: "35P 45C 12F",
    spoken: "protein 35 g, carbs 45 g, fat 12 g",
  });
});

test("meal rows summarise every group, including legacy and unassigned", () => {
  const groups = groupByMeal([
    entry({ ...oats, meal: "Breakfast" }),
    entry({ ...oats, name: "Greek yogurt", calories: 100, meal: "breakfast" }),
    entry({ ...oats, name: "Shake", meal: "Post-workout" }),
    entry({ ...oats, name: "Banana" }),
  ]);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, mealSummary(g)]));
  assert.deepEqual(
    groups.map((g) => g.key),
    ["Breakfast", "Lunch", "Dinner", "Snacks", "custom:post-workout", "none"],
  );
  assert.equal(byKey.Breakfast!.icon, "sunny-outline");
  assert.equal(byKey.Breakfast!.foods, "Oats, Greek yogurt");
  assert.equal(byKey.Breakfast!.kcal, "250 kcal");
  assert.equal(byKey.Breakfast!.macros, "10P 54C 6F");
  assert.equal(
    byKey.Breakfast!.spoken,
    "Breakfast, 250 kcal, protein 10 g, carbs 54 g, fat 6 g, 2 foods: Oats, Greek yogurt",
  );
  assert.equal(byKey.Lunch!.foods, "Nothing logged");
  assert.equal(byKey.Lunch!.spoken, "Lunch, nothing logged");
  assert.equal(byKey.Dinner!.icon, "moon-outline");
  assert.equal(byKey["custom:post-workout"]!.icon, "restaurant-outline");
  assert.equal(byKey.none!.foods, "Banana");
});

test("the streak counts consecutive logged days and stays alive until today ends", () => {
  const today = "2026-10-22"; // a Thursday
  const days = (...offsets: number[]) =>
    offsets.map((o) => entry(oats, addDays(today, -o)));
  // Logged today and the two days before: 3.
  assert.equal(loggingStreak(days(0, 1, 2, 4), today).days, 3);
  // Nothing yet today: yesterday's run still counts.
  assert.equal(loggingStreak(days(1, 2), today).days, 2);
  // A gap before yesterday ends it.
  assert.equal(loggingStreak(days(2, 3), today).days, 0);
  // Several entries on one day count once; future-dated entries never count.
  assert.equal(
    loggingStreak([...days(0, 0, 0), entry(oats, addDays(today, 1))], today)
      .days,
    1,
  );
  const s = loggingStreak(days(1, 3), today);
  const monday = mondayOf(today);
  assert.deepEqual(
    s.week.map((d) => [d.date, d.state]),
    [
      [monday, "logged"],
      [addDays(monday, 1), "none"],
      [addDays(monday, 2), "logged"],
      [addDays(monday, 3), "open"],
      [addDays(monday, 4), "future"],
      [addDays(monday, 5), "future"],
      [addDays(monday, 6), "future"],
    ],
  );
  assert.equal(s.week.filter((d) => d.today).length, 1);
  assert.equal(
    s.spoken,
    "1 day logged in a row. This week, 2 of 4 days logged.",
  );
});

test("quick add offers the lifter's own foods with their stated portions", () => {
  assert.equal(quickPortion({ quantity: 1, serving: "1 medium" }), "1 medium");
  assert.equal(quickPortion({ quantity: 2, serving: "40 g" }), "2 × 40 g");
  assert.equal(quickPortion({ quantity: 1, serving: "" }), "1 serving");
  assert.equal(quickPortion({ quantity: 1.5, serving: "" }), "1.5 servings");
  const history = [
    entry({ ...oats, quantity: 2 }, "2026-10-20"),
    entry({ ...oats, name: "Rice", calories: 200 }, "2026-10-21"),
    entry({ ...oats, name: "Rice", calories: 200 }, "2026-10-22"),
  ];
  const saved = [
    entry(
      { ...oats, name: "Banana", calories: 105, serving: "1 medium" },
      "2026-10-01",
      "food",
    ),
    entry(
      { ...oats, name: "Apple", calories: 95, serving: "1 medium" },
      "2026-10-01",
      "food",
    ),
    entry({ ...oats, name: "Yogurt", calories: 90 }, "2026-10-01", "food"),
  ];
  const quick = quickAddFoods(history, saved);
  // Most recent first, each once, then saved foods alphabetically; four at most.
  assert.deepEqual(
    quick.map((q) => [q.food.name, q.portion, q.kcal]),
    [
      ["Rice", "40 g", "200 kcal"],
      ["Oats", "2 × 40 g", "300 kcal"],
      ["Apple", "1 medium", "95 kcal"],
      ["Banana", "1 medium", "105 kcal"],
    ],
  );
  assert.deepEqual(quickAddFoods([], []), []);
});
