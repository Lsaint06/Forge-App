import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import {
  correctionDraft,
  correctionOf,
  displayBarcode,
  energyWarning,
  findPersonal,
  labelDraftForBarcode,
  labelDraftFrom,
  personalConflict,
  personalInfo,
  readLabelDraft,
  servingValues,
  type LabelDraft,
} from "../src/domain/personal-foods";
import {
  entryFromFood,
  foodChoices,
  savedChoice,
  totalsOf,
  type NutritionData,
} from "../src/domain/nutrition";
import { sourceLabel } from "../src/domain/food-library";
import { brandedFood } from "../src/domain/branded";
import { validateJournal } from "../src/domain/validation";
import type { Journal } from "../src/domain/types";
import { pathRepository } from "./path-fixture";

// Phase 7.3F.2 M2: personal barcode foods and corrections. They are ordinary
// saved foods with per-serving values; these tests pin the conversion, the
// validation, the identity rules and the lookup precedence.

const DR_PEPPER = "00078000082401";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

function drPepper(patch: Partial<LabelDraft> = {}): LabelDraft {
  return {
    ...labelDraftForBarcode(DR_PEPPER),
    name: "Dr Pepper",
    brand: "Dr Pepper",
    household: "1 can",
    unit: "ml",
    amount: "355",
    perServing: { calories: "150", protein: "0", carbs: "41", fat: "0" },
    ...patch,
  };
}
const saved = (draft: LabelDraft) => {
  const r = readLabelDraft(draft, { kind: "food" });
  if ("errors" in r) throw new Error(JSON.stringify(r.errors));
  return r.data;
};
let n = 0;
const journal = (data: NutritionData, at: Partial<Journal> = {}): Journal => ({
  id: `j${++n}`,
  kind: "food",
  date: "2026-10-26",
  data,
  createdAt: 1000,
  updatedAt: 1000,
  ...at,
});

const COKE = brandedFood({
  id: 7,
  fdcId: 2412345,
  name: "Coca-Cola Can, 12 fl oz",
  brand: "Coca-Cola",
  basis: "ml",
  serving: 355,
  household: "1 can",
  servingLabel: "1 can",
  servingSource: "label",
  kcal: 39.4,
  protein: 0,
  carbs: 10.98,
  fat: 0,
  gtin: "00049000006346",
});

test("a label read per serving is stored as one serving, exactly as typed", () => {
  const data = saved(drPepper());
  assert.deepEqual(data, {
    name: "Dr Pepper",
    calories: 150,
    protein: 0,
    carbs: 41,
    fat: 0,
    quantity: 1,
    serving: "1 can (355 ml)",
    personalKind: "food",
    servingName: "1 can",
    labelBasis: "serving",
    sourceId: `personal:${DR_PEPPER}`,
    sourceCatalog: "personal",
    sourceMl: 355,
    sourceBrand: "Dr Pepper",
    sourceBarcode: DR_PEPPER,
  });
  // Zero is a value, not a missing one.
  assert.equal(data.protein, 0);
  assert.equal(data.fat, 0);
  validateJournal("food", data);
});

test("per-100 values are converted once with the label's serving amount; g and ml never mix", () => {
  const ml = saved(
    drPepper({
      basis: "100",
      per100: { calories: "42", protein: "0", carbs: "11.5", fat: "0" },
    }),
  );
  close(Number(ml.calories), 149.1);
  close(Number(ml.carbs), 40.825);
  assert.equal(ml.labelBasis, "100");
  assert.equal(ml.sourceMl, 355);
  assert.equal("sourceGrams" in ml, false);
  const g = saved(
    drPepper({
      name: "Beef stick",
      household: "1 stick",
      unit: "g",
      amount: "32",
      basis: "100",
      per100: { calories: "281", protein: "28.1", carbs: "0", fat: "18.8" },
    }),
  );
  close(Number(g.calories), 89.92);
  close(Number(g.protein), 8.992);
  close(Number(g.fat), 6.016);
  assert.equal(g.sourceGrams, 32);
  assert.equal(g.serving, "1 stick (32 g)");
  // The per-serving values typed earlier are never reinterpreted.
  const both = drPepper({
    basis: "100",
    per100: { calories: "42", protein: "0", carbs: "11.5", fat: "0" },
  });
  assert.equal(both.perServing.calories, "150");
  close(servingValues(both)!.calories, 149.1);
  close(servingValues({ ...both, basis: "serving" })!.calories, 150);
});

test("what's missing or nonsensical is asked for, never filled in", () => {
  const errors = (d: LabelDraft) => {
    const r = readLabelDraft(d, { kind: "food" });
    assert.ok("errors" in r, "should be refused");
    return r.errors;
  };
  assert.equal(
    errors(
      drPepper({
        perServing: { calories: "", protein: "0", carbs: "41", fat: "0" },
      }),
    ).calories,
    "Enter a number (0 if none)",
  );
  assert.ok(
    errors(
      drPepper({
        perServing: { calories: "-5", protein: "0", carbs: "41", fat: "0" },
      }),
    ).calories,
  );
  assert.ok(errors(drPepper({ name: "  " })).name);
  // Per 100 needs the serving's amount to know what one serving is.
  assert.match(
    errors(
      drPepper({
        basis: "100",
        amount: "",
        per100: { calories: "42", protein: "0", carbs: "11", fat: "0" },
      }),
    ).amount!,
    /serving size in ml/,
  );
  assert.ok(errors(drPepper({ amount: "0" })).amount);
  assert.ok(errors(drPepper({ amount: "9000" })).amount);
  // Impossible per-100 values.
  assert.ok(
    errors(
      drPepper({
        basis: "100",
        per100: { calories: "950", protein: "0", carbs: "0", fat: "0" },
      }),
    ).calories,
  );
  assert.match(
    errors(
      drPepper({
        unit: "g",
        basis: "100",
        per100: { calories: "400", protein: "60", carbs: "40", fat: "20" },
      }),
    ).form!,
    /more than 100 g per 100 g/,
  );
  assert.ok(errors(drPepper({ household: "x".repeat(41) })).household);
  // A serving bigger than one entry can hold.
  assert.match(
    errors(
      drPepper({
        unit: "g",
        amount: "5000",
        basis: "100",
        per100: { calories: "900", protein: "0", carbs: "0", fat: "100" },
      }),
    ).form ?? "",
    /more than an entry can hold/,
  );
  // Comma decimals are read as typed on the label.
  close(
    Number(
      saved(
        drPepper({
          perServing: {
            calories: "150",
            protein: "0,5",
            carbs: "41",
            fat: "0",
          },
        }),
      ).protein,
    ),
    0.5,
  );
});

test("barcodes: the scanned GTIN is kept canonical; an invalid one is refused, never repaired", () => {
  const r = readLabelDraft(drPepper({ barcode: "00078000082402" }), {
    kind: "food",
  });
  assert.ok("errors" in r && r.errors.barcode);
  const none = readLabelDraft(drPepper({ barcode: "" }), { kind: "food" });
  assert.ok("errors" in none && none.errors.barcode);
  assert.equal(displayBarcode(DR_PEPPER), "078000082401");
  assert.equal(displayBarcode("04006381333931"), "4006381333931");
  assert.equal(displayBarcode("00000096385074"), "96385074");
  assert.equal(sourceLabel(`personal:${DR_PEPPER}`), "your package label");
});

test("a serving without a name or amount is plainly '1 serving'", () => {
  const data = saved(drPepper({ household: "", amount: "" }));
  assert.equal("serving" in data, false);
  assert.equal(data.servingName, "1 serving");
  const metric = saved(drPepper({ household: "" }));
  assert.equal(metric.serving, "1 serving (355 ml)");
  assert.equal(personalInfo(metric)?.amount, 355);
});

test("an energy figure far from its macros is flagged, not blocked", () => {
  assert.equal(
    energyWarning({ calories: 150, protein: 0, carbs: 41, fat: 0 }),
    undefined,
  );
  assert.match(
    String(energyWarning({ calories: 1500, protein: 0, carbs: 41, fat: 0 })),
    /Check the label/,
  );
  const r = readLabelDraft(
    drPepper({
      perServing: { calories: "1500", protein: "0", carbs: "41", fat: "0" },
    }),
    { kind: "food" },
  );
  assert.ok("data" in r && r.warning);
});

test("logging a personal food: per-serving values × servings, with its provenance", () => {
  const food = journal(saved(drPepper()));
  const choice = savedChoice(food);
  assert.equal(choice.id, food.id);
  assert.equal(choice.personal?.servingName, "1 can");
  const entry = entryFromFood(choice, "Lunch", 1.5);
  assert.deepEqual(entry, {
    name: "Dr Pepper",
    meal: "Lunch",
    calories: 150,
    protein: 0,
    carbs: 41,
    fat: 0,
    quantity: 1.5,
    serving: "1 can (355 ml)",
    sourceId: `personal:${DR_PEPPER}`,
    sourceCatalog: "personal",
    sourceMl: 355,
    sourceBarcode: DR_PEPPER,
    sourceBrand: "Dr Pepper",
  });
  // Totals use the stored values: no conversion on the way.
  const totals = totalsOf([{ ...food, kind: "nutrition", data: entry }]);
  close(totals.calories, 225);
  close(totals.carbs, 61.5);
  // Eaten before, it opens as the personal food from Recent too.
  const { recent } = foodChoices(
    [{ ...food, id: "e1", kind: "nutrition", data: entry }],
    [food],
  );
  assert.equal(recent[0]?.id, food.id);
  assert.equal(recent[0]?.personal?.kind, "food");
});

test("corrections keep the product's identity, are marked edited, and refuse a no-op", () => {
  const draft = correctionDraft(COKE);
  assert.equal(draft.barcode, "00049000006346");
  assert.equal(draft.household, "1 can");
  assert.equal(draft.amount, "355");
  assert.equal(draft.unit, "ml");
  assert.equal(draft.perServing.calories, "139.87");
  const of = correctionOf(COKE, "usda-branded-2026-04-30");
  const same = readLabelDraft(draft, { kind: "correction", of });
  assert.ok("errors" in same && /USDA's values/.test(same.errors.form ?? ""));
  const fixed = readLabelDraft(
    {
      ...draft,
      perServing: { ...draft.perServing, calories: "140", carbs: "39" },
    },
    { kind: "correction", of },
  );
  assert.ok("data" in fixed);
  assert.deepEqual(fixed.data, {
    name: "Coca-Cola Can, 12 fl oz",
    calories: 140,
    protein: 0,
    carbs: 39,
    fat: 0,
    quantity: 1,
    serving: "1 can (355 ml)",
    personalKind: "correction",
    servingName: "1 can",
    labelBasis: "serving",
    sourceId: "usda-branded:2412345",
    sourceCatalog: "usda-branded-2026-04-30",
    sourceEdited: true,
    sourceMl: 355,
    sourceBrand: "Coca-Cola",
    sourceBarcode: "00049000006346",
  });
  // Renaming the serving alone is a real correction.
  assert.ok(
    "data" in
      readLabelDraft(
        { ...draft, household: "1 can (12 fl oz)" },
        { kind: "correction", of },
      ),
  );
  validateJournal("food", fixed.data);
  // Editing reopens per serving, with the stored values exactly.
  const again = labelDraftFrom(fixed.data);
  assert.equal(again.perServing.calories, "140");
  assert.equal(again.household, "1 can");
  assert.equal(again.amount, "355");
});

test("lookup precedence: the lifter's own record wins, deterministically", () => {
  const mine = journal(saved(drPepper()), { updatedAt: 2000 });
  // A plain saved copy of a USDA product never hijacks a scan.
  const copy = journal({
    name: "Coke",
    calories: 140,
    protein: 0,
    carbs: 39,
    fat: 0,
    quantity: 1,
    sourceId: "usda-branded:2412345",
    sourceBarcode: "00049000006346",
  });
  const fix = readLabelDraft(
    {
      ...correctionDraft(COKE),
      perServing: { calories: "140", protein: "0", carbs: "39", fat: "0" },
    },
    { kind: "correction", of: correctionOf(COKE, "usda-branded-2026-04-30") },
  );
  assert.ok("data" in fix);
  const correction = journal(fix.data);
  const foods = [copy, mine, correction];
  assert.equal(findPersonal(foods, { barcode: DR_PEPPER })?.food.id, mine.id);
  assert.equal(
    findPersonal(foods, { barcode: "00049000006346" })?.food.id,
    correction.id,
  );
  // A correction is also found by its product (searching, or no barcode).
  assert.equal(
    findPersonal(foods, { sourceId: "usda-branded:2412345" })?.food.id,
    correction.id,
  );
  assert.equal(findPersonal([copy], { barcode: "00049000006346" }), undefined);
  // Two devices each saved one: newest update, then earliest made, then ID.
  const older = journal(saved(drPepper({ name: "Dr Pepper (old)" })), {
    updatedAt: 1500,
  });
  const tieA = journal(saved(drPepper({ name: "A" })), {
    id: "zz",
    updatedAt: 2000,
    createdAt: 900,
  });
  const hit = findPersonal([older, mine, tieA], { barcode: DR_PEPPER });
  assert.equal(hit?.food.id, "zz");
  assert.equal(hit?.count, 3);
  assert.equal(
    findPersonal([tieA, mine, older], { barcode: DR_PEPPER })?.food.id,
    "zz",
  );
  // A second record for the same barcode is a conflict; its own edit is not.
  assert.equal(
    personalConflict(foods, saved(drPepper({ name: "Again" })))?.id,
    mine.id,
  );
  assert.equal(personalConflict(foods, mine.data, mine.id), undefined);
});

test("existing saved foods are untouched: no personal keys, no personal behaviour", () => {
  const plain = {
    name: "Greek yogurt",
    calories: 100,
    protein: 17,
    carbs: 6,
    fat: 0,
    quantity: 1,
    serving: "170 g",
  };
  assert.equal(personalInfo(plain), undefined);
  assert.equal(savedChoice(journal(plain)).personal, undefined);
  validateJournal("food", plain);
  // A record claiming to be a personal food needs a valid barcode.
  assert.throws(
    () => validateJournal("food", { ...plain, personalKind: "food" }),
    /GTIN-14/,
  );
  assert.throws(
    () =>
      validateJournal("food", {
        ...plain,
        personalKind: "food",
        sourceBarcode: "00078000082402",
      }),
    /GTIN-14/,
  );
  // A kind a newer FORGE adds is kept as recorded.
  validateJournal("food", { ...plain, personalKind: "shared" });
  assert.equal(personalInfo({ ...plain, personalKind: "shared" }), undefined);
});

test("personal foods survive restart, backup, restore and sync; entries keep their values after edits", () => {
  const file = `${process.env.TEMP ?? "/tmp"}/forge-personal-${process.pid}.db`;
  const a = pathRepository(file);
  const b = pathRepository();
  const c = pathRepository();
  try {
    const food = a.r.addJournal("food", saved(drPepper()));
    const entry = a.r.addJournal(
      "nutrition",
      entryFromFood(savedChoice(food), "Lunch", 1),
      "2026-10-26",
    );
    const before = JSON.stringify(a.r.journal("nutrition"));
    // Restarting (a new connection to the same file) keeps the association.
    a.db.close();
    const reopened = pathRepository(file);
    try {
      assert.equal(
        findPersonal(reopened.r.journal("food"), { barcode: DR_PEPPER })?.food
          .id,
        food.id,
      );
      // Queued for sync with every key.
      const queued = reopened.r.outbox().find((o) => o.id === food.id);
      assert.match(String(queued?.payload), /"personalKind":"food"/);
      assert.match(String(queued?.payload), /"sourceBarcode":"00078000082401"/);
      // Backup and restore.
      b.r.importBackup(JSON.stringify(reopened.r.exportBackup()));
      assert.deepEqual(b.r.journal("food")[0]!.data, food.data);
      // Another device receives it.
      c.r.applyRemote(food.id, "journal", food, 1);
      assert.equal(
        findPersonal(c.r.journal("food"), { barcode: DR_PEPPER })?.food.id,
        food.id,
      );
      // Editing the food never rewrites what was logged.
      reopened.r.updateJournal(
        food.id,
        saved(
          drPepper({
            perServing: {
              calories: "160",
              protein: "0",
              carbs: "44",
              fat: "0",
            },
          }),
        ),
      );
      assert.equal(JSON.stringify(reopened.r.journal("nutrition")), before);
      // Deleting it neither.
      reopened.r.deleteJournal(food.id);
      assert.equal(JSON.stringify(reopened.r.journal("nutrition")), before);
      assert.equal(
        findPersonal(reopened.r.journal("food"), { barcode: DR_PEPPER }),
        undefined,
      );
      assert.equal(entry.data.calories, 150);
    } finally {
      reopened.db.close();
    }
  } finally {
    b.db.close();
    c.db.close();
    try {
      rmSync(file);
    } catch {
      // already removed
    }
  }
});
