import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRANDED_PREFIX,
  brandedFood,
  servingNote,
  type BrandedProduct,
} from "../src/domain/branded";
import {
  amountText,
  choiceError,
  entryFromLibrary,
  portionLabel,
  servingOf,
  sourceLabel,
  totalAmount,
  totalGrams,
  valuesForAmount,
  type LibraryFood,
} from "../src/domain/food-library";
import {
  entryFromFood,
  foodChoices,
  foodFromEntry,
  foodKey,
  isDuplicateFood,
  mergeEntry,
  sourceMeta,
  totalsOf,
  withSourceEdits,
} from "../src/domain/nutrition";
import { validateJournal } from "../src/domain/validation";
import { hydrationData, totalMl } from "../src/domain/hydration";
import { pathRepository } from "./path-fixture";
import { localDate, type Journal } from "../src/domain/types";

// Phase 7.3E: branded products in the nutrition engine. Per 100 g and per
// 100 ml values, label servings, journal snapshots with brand, barcode and
// FDC ID, and every guarantee the generic library already has: history,
// edits, saved foods, backups and sync. Generic behaviour is pinned by
// food-library.test.ts, unchanged.

const today = localDate();
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

const questBar: BrandedProduct = {
  id: 1,
  fdcId: 2758974,
  name: "PROTEIN BAR, COOKIES & CREAM",
  brand: "QUEST",
  basis: "g",
  serving: 60,
  household: "1 BAR",
  servingLabel: "1 BAR",
  servingSource: "label",
  kcal: 350,
  protein: 35,
  carbs: 36.7,
  fat: 13.3,
  gtin: "00888849000708",
};
const milk: BrandedProduct = {
  id: 2,
  fdcId: 2626113,
  name: "WHOLE ULTRA-FILTERED MILK",
  brand: "FAIRLIFE",
  basis: "ml",
  serving: 240,
  household: "1 cup (240 mL)",
  servingLabel: "1 cup",
  servingSource: "measure",
  kcal: 62.5,
  protein: 5.42,
  carbs: 2.5,
  fat: 3.33,
};
const bar = brandedFood(questBar);
const shake = brandedFood(milk);
const CATALOG = "usda-branded-2026-04-30";

test("a branded product becomes a library food with its label serving in its own unit", () => {
  assert.equal(bar.id, `${BRANDED_PREFIX}:2758974`);
  assert.equal(bar.basis, "g");
  assert.equal(bar.brand, "QUEST");
  assert.equal(bar.barcode, "00888849000708");
  assert.deepEqual(bar.portions, [{ label: "1 BAR", grams: 60 }]);
  assert.equal(portionLabel(bar.portions[0]!), "1 BAR (60 g)");
  assert.equal(shake.basis, "ml");
  assert.deepEqual(shake.portions, [{ label: "1 cup", ml: 240 }]);
  assert.equal(portionLabel(shake.portions[0]!), "1 cup (240 ml)");
  assert.equal("barcode" in shake, false, "no barcode is invented");
  assert.equal(servingNote(bar), undefined, "a label name needs no note");
  assert.equal(sourceLabel(bar.id), "USDA Branded Foods · FDC 2758974");
});

test("per 100 g products are measured in grams", () => {
  const label = { kind: "portion", index: 0, count: 1 } as const;
  assert.deepEqual(servingOf(bar, label), {
    serving: "1 BAR (60 g)",
    grams: 60,
    quantity: 1,
  });
  const v = valuesForAmount(bar, 60);
  close(v.calories, 210);
  close(v.protein, 21);
  close(v.carbs, 22.02);
  close(v.fat, 7.98);
  assert.equal(totalAmount(bar, { kind: "portion", index: 0, count: 1.5 }), 90);
  assert.equal(totalGrams(bar, { kind: "grams", grams: 45 }), 45);
  assert.equal(choiceError(bar, { kind: "grams", grams: 45 }), undefined);
  assert.equal(
    choiceError(bar, { kind: "ml", ml: 45 }),
    "Measure this food in grams",
  );
});

test("per 100 ml products are measured in millilitres, never grams", () => {
  const cup = { kind: "portion", index: 0, count: 1 } as const;
  assert.deepEqual(servingOf(shake, cup), {
    serving: "1 cup (240 ml)",
    ml: 240,
    quantity: 1,
  });
  close(valuesForAmount(shake, 240).calories, 150);
  close(valuesForAmount(shake, 240).protein, 13.008);
  assert.deepEqual(servingOf(shake, { kind: "ml", ml: 330 }), {
    serving: "330 ml",
    ml: 330,
    quantity: 1,
  });
  assert.equal(
    totalAmount(shake, { kind: "portion", index: 0, count: 2 }),
    480,
  );
  assert.ok(Number.isNaN(totalGrams(shake, cup)), "no grams for a liquid");
  assert.equal(
    choiceError(shake, { kind: "grams", grams: 240 }),
    "Measure this food in millilitres",
  );
  for (const ml of [0, 0.05, 5000.5, Number.NaN])
    assert.ok(choiceError(shake, { kind: "ml", ml }), String(ml));
  assert.equal(choiceError(shake, { kind: "ml", ml: 5000 }), undefined);
  assert.equal(amountText(240, "ml"), "240 ml");
  // A portion that isn't in the food's unit is refused.
  const mixed: LibraryFood = {
    ...shake,
    portions: [{ label: "x", grams: 10 }],
  };
  assert.ok(choiceError(mixed, { kind: "portion", index: 0, count: 1 }));
});

test("a logged branded food is a snapshot with its brand, barcode, FDC ID and amount", () => {
  const entry = entryFromLibrary(
    bar,
    { kind: "portion", index: 0, count: 2 },
    CATALOG,
    "Snacks",
  );
  assert.deepEqual(entry, {
    name: "PROTEIN BAR, COOKIES & CREAM",
    meal: "Snacks",
    calories: 210,
    protein: 21,
    carbs: 22.02,
    fat: 7.98,
    quantity: 2,
    serving: "1 BAR (60 g)",
    sourceId: "usda-branded:2758974",
    sourceCatalog: CATALOG,
    sourceGrams: 60,
    sourceBrand: "QUEST",
    sourceBarcode: "00888849000708",
  });
  validateJournal("nutrition", entry);
  const drink = entryFromLibrary(
    shake,
    { kind: "ml", ml: 330 },
    CATALOG,
    "Lunch",
  );
  assert.equal(drink.serving, "330 ml");
  assert.equal(drink.sourceMl, 330);
  assert.equal("sourceGrams" in drink, false, "millilitres are never grams");
  assert.equal("sourceBarcode" in drink, false);
  close(drink.calories as number, 206.25);
  validateJournal("nutrition", drink);
  const meta = sourceMeta(drink)!;
  assert.deepEqual(meta, {
    sourceId: "usda-branded:2626113",
    sourceCatalog: CATALOG,
    sourceMl: 330,
    sourceBrand: "FAIRLIFE",
  });
  // Totals use the existing calculation unchanged: per serving × servings.
  const totals = totalsOf([
    {
      id: "a",
      kind: "nutrition",
      date: today,
      data: entry,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "b",
      kind: "nutrition",
      date: today,
      data: drink,
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  close(totals.calories, 420 + 206.25);
  close(totals.protein, 42 + 17.886);
});

test("malformed branded provenance is ignored rather than trusted", () => {
  const plain = {
    name: "Bar",
    calories: 1,
    protein: 0,
    carbs: 0,
    fat: 0,
    quantity: 1,
  };
  assert.deepEqual(
    sourceMeta({
      ...plain,
      sourceId: "usda-branded:1",
      sourceMl: -5,
      sourceBarcode: "12345",
      sourceBrand: "  ",
    }),
    { sourceId: "usda-branded:1" },
  );
});

test("editing a branded entry marks edited values and drops an amount that no longer applies", () => {
  const drink = entryFromLibrary(
    shake,
    { kind: "ml", ml: 330 },
    CATALOG,
    "Lunch",
  );
  const servings = withSourceEdits(mergeEntry(drink, { quantity: 2 }), {
    quantity: 2,
  });
  assert.equal(servings.sourceMl, 330);
  assert.equal(servings.sourceBrand, "FAIRLIFE");
  const values = withSourceEdits(mergeEntry(drink, { calories: 100 }), {
    calories: 100,
  });
  assert.equal(values.sourceEdited, true);
  const serving = withSourceEdits(mergeEntry(drink, { serving: "1 bottle" }), {
    serving: "1 bottle",
  });
  assert.equal("sourceMl" in serving, false);
  assert.equal(serving.sourceBrand, "FAIRLIFE", "the brand stays");
});

test("saved and recent branded foods keep their provenance; brands keep look-alikes apart", () => {
  const entry = entryFromLibrary(
    bar,
    { kind: "portion", index: 0, count: 1 },
    CATALOG,
    "Snacks",
  );
  const saved = foodFromEntry(entry);
  assert.equal(saved.sourceBrand, "QUEST");
  assert.equal(saved.sourceBarcode, "00888849000708");
  assert.equal(saved.sourceGrams, 60);
  assert.equal("meal" in saved, false);
  const journal = (
    data: typeof entry,
    id: string,
    kind: Journal["kind"] = "nutrition",
  ): Journal => ({
    id,
    kind,
    date: today,
    data,
    createdAt: Number(id.length),
    updatedAt: 1,
  });
  const { recent } = foodChoices([journal(entry, "e1")], [], "quest");
  assert.equal(recent.length, 1, "found by its brand");
  const again = entryFromFood(recent[0]!, "Lunch", 1);
  for (const k of [
    "sourceId",
    "sourceBrand",
    "sourceBarcode",
    "sourceGrams",
    "calories",
  ])
    assert.equal(again[k], entry[k], k);
  // Two brands' identically named and valued products are different foods.
  const rival = { ...saved, sourceBrand: "RXBAR" };
  assert.notEqual(foodKey(saved), foodKey(rival));
  assert.equal(isDuplicateFood([journal(saved, "f1", "food")], rival), false);
  assert.equal(isDuplicateFood([journal(saved, "f1", "food")], saved), true);
  // Foods without a brand keep exactly their previous identity.
  const generic = {
    name: "Oats",
    serving: "40 g",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
  };
  assert.equal(foodKey(generic), "oats|40 g|150|5|27|3");
});

test("branded entries survive backup, restore and sync exactly; catalogue changes never touch them", () => {
  const a = pathRepository();
  const b = pathRepository();
  try {
    const entry = a.r.addJournal(
      "nutrition",
      entryFromLibrary(
        shake,
        { kind: "portion", index: 0, count: 1.5 },
        CATALOG,
        "Breakfast",
      ),
      today,
    );
    a.r.addJournal("food", foodFromEntry(entry.data));
    a.r.addJournal("hydration", hydrationData(500, "ml"), today);
    const before = JSON.stringify(a.r.journal("nutrition"));
    const totals = totalsOf(a.r.journal("nutrition"));
    // Queued for sync as an ordinary journal record, keys included.
    const queued = a.r.outbox().find((o) => o.id === entry.id);
    assert.equal(queued?.kind, "journal");
    assert.match(String(queued?.payload), /"sourceMl":240/);
    assert.match(String(queued?.payload), /"sourceBrand":"FAIRLIFE"/);
    // Backup and restore keep every key.
    b.r.importBackup(JSON.stringify(a.r.exportBackup()));
    assert.equal(JSON.stringify(b.r.journal("nutrition")), before);
    assert.deepEqual(
      b.r.journal("food")[0]!.data,
      a.r.journal("food")[0]!.data,
    );
    // A record arriving from another device keeps them too.
    const c = pathRepository();
    try {
      c.r.applyRemote(entry.id, "journal", entry, 1);
      assert.deepEqual(c.r.journal("nutrition")[0]!.data, entry.data);
    } finally {
      c.db.close();
    }
    // A later catalogue with different values (or none at all) changes nothing.
    const relabelled = brandedFood({ ...milk, kcal: 999 });
    void entryFromLibrary(
      relabelled,
      { kind: "ml", ml: 100 },
      "usda-branded-2027-04-30",
    );
    assert.equal(JSON.stringify(a.r.journal("nutrition")), before);
    assert.deepEqual(totalsOf(a.r.journal("nutrition")), totals);
    close(totals.calories, 225);
    // Hydration is separate: water never adds calories, and food never adds water.
    assert.equal(totalMl(a.r.journal("hydration")), 500);
    assert.deepEqual(totalsOf(a.r.journal("nutrition")), totals);
  } finally {
    a.db.close();
    b.db.close();
  }
});

test("smart servings: the catalogue's serving name, a whole package when offered, never a converted unit", () => {
  const stick = brandedFood({
    ...questBar,
    fdcId: 2365336,
    name: "MILD ORIGINAL BEEF STICK",
    brand: "CHOMPS",
    serving: 32,
    household: "1.15 oz",
    servingLabel: "1 package",
    servingSource: "package",
    kcal: 281,
    protein: 28.1,
    carbs: 0,
    fat: 18.8,
  });
  assert.deepEqual(stick.portions, [{ label: "1 package", grams: 32 }]);
  assert.equal(servingNote(stick), "The package holds one serving");
  const fallback = brandedFood({
    ...questBar,
    household: "1.15 oz",
    servingLabel: "1 serving",
    servingSource: "serving",
  });
  assert.equal(portionLabel(fallback.portions[0]!), "1 serving (60 g)");
  assert.equal(servingNote(fallback), "Label serving: 1.15 oz");
  const sibling = brandedFood({
    ...questBar,
    servingLabel: "1 Stick",
    servingSource: "sibling",
  });
  assert.match(servingNote(sibling)!, /another listing of this product/);
  // A 20 fl oz bottle of 240 ml servings also offers the whole bottle.
  const bottle = brandedFood({
    ...milk,
    serving: 240,
    servingLabel: "1 serving",
    servingSource: "serving",
    package: 591,
  });
  assert.deepEqual(bottle.portions, [
    { label: "1 serving", ml: 240 },
    { label: "whole package", ml: 591 },
  ]);
  assert.equal(bottle.servingInfo?.servingsPerPackage, 591 / 240);
  // Serving quantities: ½, 1, 1½ and 2 servings, and the whole package.
  for (const count of [0.5, 1, 1.5, 2]) {
    const e = entryFromLibrary(
      stick,
      { kind: "portion", index: 0, count },
      CATALOG,
    );
    assert.equal(e.serving, "1 package (32 g)");
    assert.equal(e.quantity, count);
    assert.equal(e.sourceGrams, 32);
    close(Number(e.calories) * count, 89.92 * count);
    close(Number(e.protein) * count, 8.992 * count);
  }
  const all = entryFromLibrary(
    bottle,
    { kind: "portion", index: 1, count: 1 },
    CATALOG,
  );
  assert.equal(all.serving, "whole package (591 ml)");
  assert.equal(all.sourceMl, 591);
  assert.equal("sourceGrams" in all, false);
  close(Number(all.calories), 369.375);
  assert.equal(
    totalAmount(bottle, { kind: "portion", index: 1, count: 2 }),
    1182,
  );
});
