import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import {
  ML_PER_OZ,
  PRESETS,
  amountError,
  entryText,
  fluidUnitOf,
  goalError,
  hydrationData,
  hydrationDay,
  hydrationOf,
  parseAmount,
  toMl,
  totalMl,
  volumeText,
} from "../src/domain/hydration";
import { profileSchema, validateJournal } from "../src/domain/validation";
import { entriesOn, totalsOf } from "../src/domain/nutrition";
import { goalSources } from "../src/data/goal-sources";
import { loggingStreak, quickAddFoods } from "../src/screens/nutrition/model";
import { defaults, localDate } from "../src/domain/types";

// Phase 7.3C: hydration data, conversions, validation, and its isolation from
// food, backups and sync (decisions H1–H9).

const today = localDate();
const oats = {
  name: "Oats",
  calories: 150,
  protein: 5,
  carbs: 27,
  fat: 3,
  quantity: 2,
  serving: "40 g",
  meal: "Breakfast",
};

test("US fluid ounces convert exactly and come back as typed", () => {
  assert.equal(ML_PER_OZ, 29.5735295625);
  assert.equal(toMl(250, "ml"), 250);
  assert.equal(toMl(12, "oz"), 354.882355);
  assert.equal(toMl(8, "oz"), 236.588237);
  for (const oz of [1, 8, 12, 16.5, 24, 100])
    assert.equal(volumeText(toMl(oz, "oz"), "oz"), `${Math.round(oz)} fl oz`);
  // The typed amount is kept with its unit and shown back exactly.
  const d = hydrationData(16.5, "oz");
  assert.deepEqual(d, { ml: 487.963238, amount: 16.5, unit: "oz" });
  assert.equal(entryText(d), "16.5 fl oz");
  assert.equal(entryText({ ml: 330 }), "330 mL");
  assert.deepEqual(PRESETS, { ml: [250, 500, 750], oz: [8, 16, 24] });
});

test("volumes display in whole mL, litres to one decimal, or whole fl oz", () => {
  assert.equal(volumeText(750, "ml"), "750 mL");
  assert.equal(volumeText(999.6, "ml"), "1.0 L");
  assert.equal(volumeText(2050, "ml"), "2.1 L");
  assert.equal(volumeText(3000, "ml"), "3.0 L");
  assert.equal(volumeText(2000, "oz"), "68 fl oz");
  assert.equal(fluidUnitOf({ units: "kg" }), "ml");
  assert.equal(fluidUnitOf({ units: "lb" }), "oz");
  assert.equal(fluidUnitOf({ units: "lb", fluidUnit: "ml" }), "ml");
});

test("typed amounts and goals are checked kindly", () => {
  assert.equal(parseAmount("1,5"), 1.5);
  assert.equal(parseAmount(" 250 "), 250);
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("")));
  assert.equal(amountError(250, "ml"), undefined);
  assert.equal(amountError(0, "ml"), "Enter 1 to 5,000 mL");
  assert.equal(amountError(6000, "ml"), "Enter 1 to 5,000 mL");
  assert.equal(amountError(12, "oz"), undefined);
  assert.equal(amountError(200, "oz"), "Enter 0.1 to 169 fl oz");
  assert.equal(goalError(3000, "ml"), undefined);
  assert.equal(goalError(100, "ml"), "Enter 500 to 10,000 mL");
  assert.equal(goalError(100, "oz"), undefined);
  assert.equal(goalError(10, "oz"), "Enter 17 to 338 fl oz");
});

test("without a goal there is no percentage or remainder (H9)", () => {
  const none = hydrationDay(1200, undefined, "ml");
  assert.deepEqual(
    [none.total, none.goal, none.percent, none.left, none.ratio],
    ["1.2 L", undefined, undefined, undefined, undefined],
  );
  assert.equal(none.spoken, "1.2 litres logged");
  const own = hydrationDay(2100, 3000, "ml");
  assert.deepEqual(
    [own.total, own.goal, own.percent, own.left],
    ["2.1 L", "3.0 L", 70, "900 mL to go"],
  );
  assert.equal(own.spoken, "2.1 litres of 3.0 litres, 70 percent");
  assert.equal(hydrationDay(3100, 3000, "ml").left, "Goal reached");
  assert.equal(
    totalMl([{ data: { ml: 250 } }, { data: { ml: 354.882355 } }]),
    604.882355,
  );
});

test("hydration records are validated and can never carry food values", () => {
  assert.doesNotThrow(() => validateJournal("hydration", { ml: 250 }));
  assert.doesNotThrow(() =>
    validateJournal("hydration", { ...hydrationData(12, "oz") }),
  );
  const bads: Record<string, string | number | boolean>[] = [
    { ml: 0 },
    { ml: 6000 },
    { ml: 250, calories: 0 },
    { ml: 250, protein: 1 },
    { ml: 250, unit: "ml" },
    { ml: 250, amount: 250 },
    { ml: 250, amount: 300, unit: "ml" },
    { ml: 250, amount: 250, unit: "cup" },
  ];
  for (const bad of bads)
    assert.throws(() => validateJournal("hydration", bad), JSON.stringify(bad));
  assert.equal(hydrationOf({ ml: "x" }), undefined);
  // Profile fields are optional; older profiles still parse.
  assert.doesNotThrow(() => profileSchema.parse(defaults));
  assert.doesNotThrow(() =>
    profileSchema.parse({ ...defaults, waterGoal: 3000, fluidUnit: "oz" }),
  );
  assert.throws(() => profileSchema.parse({ ...defaults, waterGoal: 100 }));
  assert.throws(() =>
    profileSchema.parse({ ...defaults, fluidUnit: "cup" as "ml" }),
  );
});

test("water never changes food totals, goals, quick add or the nutrition streak", () => {
  const { r, db } = pathRepository();
  try {
    r.addJournal("nutrition", oats, today);
    r.addJournal("food", { ...oats, name: "Banana", meal: "" });
    const snapshot = () => ({
      totals: totalsOf(entriesOn(r.journal("nutrition"), today)),
      calories: [...goalSources(r, today, "kg").calories],
      quick: quickAddFoods(r.journal("nutrition"), r.journal("food")).map(
        (q) => [q.food.name, q.kcal],
      ),
      streak: loggingStreak(r.journal("nutrition"), today).days,
      foods: r.journal("food").length,
    });
    const before = snapshot();
    r.addJournal("hydration", hydrationData(500, "ml"), today);
    r.addJournal("hydration", hydrationData(16, "oz"), today);
    assert.deepEqual(snapshot(), before);
    assert.equal(r.journal("hydration").length, 2);
    assert.equal(r.journal("nutrition").length, 1);
  } finally {
    db.close();
  }
});

test("existing data is untouched, and hydration works offline with sync queued", () => {
  const { r, db } = pathRepository();
  try {
    const food = r.addJournal("nutrition", oats, today);
    const water = r.addJournal("hydration", hydrationData(500, "ml"), today);
    // Every write is queued for the next sync, as a journal record.
    const queued = (id: string) => r.outbox().find((o) => o.id === id);
    assert.equal(queued(water.id)?.kind, "journal");
    r.updateJournal(water.id, hydrationData(330, "ml"));
    assert.equal(r.journal("hydration")[0]!.data.ml, 330);
    r.deleteJournal(water.id);
    assert.equal(r.journal("hydration").length, 0);
    // Deletion is queued as a journal tombstone.
    assert.equal(queued(water.id)?.deleted, 1);
    assert.deepEqual(r.journal("nutrition")[0], food);
    // A profile saved before 7.3C (no hydration fields) still loads.
    assert.equal(r.profile().waterGoal, undefined);
    r.saveProfile({ waterGoal: 3000, fluidUnit: "oz" });
    assert.equal(r.profile().waterGoal, 3000);
    r.saveProfile({ waterGoal: undefined });
    assert.equal(r.profile().waterGoal, undefined);
    assert.equal(r.profile().fluidUnit, "oz");
  } finally {
    db.close();
  }
});

test("backups carry hydration and keep unknown future record kinds", () => {
  const a = pathRepository();
  const b = pathRepository();
  try {
    a.r.saveProfile({ waterGoal: 2500, fluidUnit: "oz" });
    a.r.addJournal("nutrition", oats, today);
    a.r.addJournal("hydration", hydrationData(12, "oz"), today);
    const backup = a.r.exportBackup();
    // A record kind written by a newer FORGE travels in the same backup.
    const future = {
      id: "future-1",
      kind: "sleep-log",
      date: today,
      data: { hours: 7.5, note: "from a newer build" },
      createdAt: 1,
      updatedAt: 1,
    };
    backup.journals.push(future);
    b.r.importBackup(JSON.stringify(backup));
    assert.equal(b.r.profile().waterGoal, 2500);
    assert.equal(b.r.profile().fluidUnit, "oz");
    assert.deepEqual(
      b.r.journal("hydration").map((j) => j.data),
      [{ ml: 354.882355, amount: 12, unit: "oz" }],
    );
    assert.deepEqual(
      totalsOf(b.r.journal("nutrition")),
      totalsOf(a.r.journal("nutrition")),
    );
    // Not discarded: stored and exported again unchanged.
    const kept = b.r.exportBackup().journals.find((j) => j.id === "future-1");
    assert.deepEqual(kept, future);
    // A malformed kind is still refused, and so is the whole restore.
    const bad = { ...backup, journals: [{ ...future, kind: "Bad Kind!" }] };
    assert.throws(() => b.r.importBackup(JSON.stringify(bad)));
    assert.ok(b.r.exportBackup().journals.some((j) => j.id === "future-1"));
  } finally {
    a.db.close();
    b.db.close();
  }
});

test("sync applies hydration and unknown kinds, propagates deletions, refuses bad water", () => {
  const { r, db } = pathRepository();
  try {
    const water = {
      id: "w-1",
      kind: "hydration",
      date: today,
      data: { ml: 500, amount: 500, unit: "ml" },
      createdAt: 1,
      updatedAt: 1,
    };
    r.applyRemote("w-1", "journal", water, 1);
    assert.equal(r.journal("hydration")[0]!.data.ml, 500);
    // A deletion from another device removes it.
    r.applyRemote("w-1", "journal", {}, 2, true);
    assert.equal(r.journal("hydration").length, 0);
    // A kind from a newer build is kept, not dropped.
    r.applyRemote(
      "f-1",
      "journal",
      { ...water, id: "f-1", kind: "sleep-log", data: { hours: 8 } },
      1,
    );
    assert.ok(r.journal().some((j) => j.id === "f-1"));
    // Water claiming food values is rejected, never stored.
    assert.throws(() =>
      r.applyRemote(
        "w-2",
        "journal",
        { ...water, id: "w-2", data: { ml: 500, calories: 100 } },
        1,
      ),
    );
    assert.equal(r.journal("hydration").length, 0);
  } finally {
    db.close();
  }
});
