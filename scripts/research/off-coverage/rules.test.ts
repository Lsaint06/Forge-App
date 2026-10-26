// Unit tests for the M3.1 research rules (NOT part of the production suite):
//   npx tsx --test scripts/research/off-coverage/rules.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { bandFor, coreValues, judgeOff, sameValues } from "./rules";

type Rec = Record<string, unknown>;
const PHOTO = { images: { nutrition_en: { imgid: "2" } } };
/** A Dr Pepper-like can as OFF's new schema records it, per 100 ml. */
function can(patch: Rec = {}): Rec {
  return {
    code: "078000082401",
    product_name: "Dr Pepper",
    brands: "Dr Pepper, Keurig Dr Pepper",
    product_type: "food",
    serving_size: "1 can (355 ml)",
    serving_quantity: 355,
    serving_quantity_unit: "ml",
    countries_tags: ["en:united-states"],
    categories_tags: ["en:beverages", "en:carbonated-drinks", "en:sodas"],
    nutrition: {
      input_sets: [
        {
          source: "packaging",
          preparation: "as_sold",
          per: "100ml",
          per_unit: "ml",
          per_quantity: 100,
          nutrients: {
            "energy-kcal": { value: 42 },
            proteins: { value: 0 },
            carbohydrates: { value: 11 },
            fat: { value: 0 },
          },
        },
      ],
    },
    data_quality_errors_tags: [],
    data_quality_warnings_tags: [],
    creator: "someone",
    ...PHOTO,
    ...patch,
  };
}
const sets = (r: Rec) => (r.nutrition as { input_sets: Rec[] }).input_sets;

test("a well-evidenced label record is accepted with its basis and named serving", () => {
  const j = judgeOff(can());
  assert.equal(j.verdict, "accept", j.reasons.join("; "));
  assert.equal(j.candidate?.gtin, "00078000082401");
  assert.equal(j.candidate?.basis, "ml");
  assert.equal(j.candidate?.serving, 355);
  assert.equal(j.candidate?.servingLabel, "1 can");
  assert.equal(j.candidate?.kcal, 42);
  assert.equal(j.candidate?.brand, "Dr Pepper");
});

test("barcodes: invalid check digits are rejected (never repaired); in-store codes too", () => {
  assert.equal(judgeOff(can({ code: "078000082402" })).verdict, "reject");
  assert.match(
    judgeOff(can({ code: "078000082402" })).reasons[0]!,
    /never repaired/,
  );
  assert.equal(judgeOff(can({ code: "212345678903" })).verdict, "reject");
});

test("one input set only: per-serving values are scaled by that set's own serving; estimates never used", () => {
  const perServing = can();
  sets(perServing)[0] = {
    source: "packaging",
    preparation: "as_sold",
    per: "serving",
    per_unit: "ml",
    per_quantity: 355,
    nutrients: {
      "energy-kcal": { value: 150 },
      proteins: { value: 0 },
      carbohydrates: { value: 41 },
      fat: { value: 0 },
    },
  };
  const v = coreValues(perServing);
  assert.ok(Math.abs(v.kcal! - 42.2535) < 1e-3);
  assert.equal(v.serving, 355);
  assert.equal(v.basis, "ml");
  // A manufacturer set wins over a packaging set; values are never blended.
  const both = can();
  sets(both).push({
    source: "manufacturer",
    preparation: "as_sold",
    per: "100ml",
    per_unit: "ml",
    nutrients: {
      "energy-kcal": { value: 41 },
      proteins: { value: 0 },
      carbohydrates: { value: 10.9 },
      fat: { value: 0 },
    },
  });
  const m = coreValues(both);
  assert.equal(m.source, "manufacturer");
  assert.equal(m.kcal, 41);
  assert.equal(m.carbs, 10.9);
  // Estimates from ingredients are not label values.
  const estimate = can({
    nutrition: { input_sets: [{ ...sets(can())[0], source: "estimate" }] },
  });
  assert.equal(judgeOff(estimate).verdict, "reject");
});

test("grams and millilitres are never converted: missing or conflicting units go to review", () => {
  const legacy = {
    ...can({ nutrition: undefined, serving_quantity_unit: undefined }),
    nutriments: {
      "energy-kcal_100g": 42,
      proteins_100g: 0,
      carbohydrates_100g: 11,
      fat_100g: 0,
    },
  };
  const j = judgeOff(legacy);
  assert.equal(j.verdict, "review");
  assert.ok(j.reasons.includes("nutrition basis (g or ml) not stated"));
  const conflict = judgeOff({
    ...legacy,
    serving_quantity_unit: "ml",
    product_quantity_unit: "g",
  });
  assert.ok(
    conflict.reasons.includes("serving and package units disagree (g vs ml)"),
  );
  const servingG = can();
  sets(servingG)[0]!.per_unit = "g";
  sets(servingG)[0]!.per = "100g";
  const s = judgeOff(servingG);
  assert.equal(s.verdict, "review");
  assert.ok(s.reasons.includes("serving unit differs from nutrition basis"));
  assert.ok(s.reasons.includes("drink measured by weight"));
});

test("category plausibility: a 382 kcal/100 ml soda is held for review; syrups and oils are not", () => {
  const sugary = can();
  sets(sugary)[0]!.nutrients = {
    "energy-kcal": { value: 382 },
    proteins: { value: 0 },
    carbohydrates: { value: 95.5 },
    fat: { value: 0 },
  };
  const j = judgeOff(sugary);
  assert.equal(j.verdict, "review");
  assert.match(j.reasons.join(";"), /outside the soda range/);
  assert.equal(bandFor(["en:beverages", "en:sodas", "en:syrups"]), undefined);
  assert.equal(bandFor(["en:olive-oils"])?.name, "vegetable oil");
  // Legitimately dense: 884 kcal oil passes the band.
  const oil = can({
    categories_tags: ["en:olive-oils"],
    serving_quantity: 15,
    serving_quantity_unit: "ml",
  });
  sets(oil)[0]!.nutrients = {
    "energy-kcal": { value: 820 },
    proteins: { value: 0 },
    carbohydrates: { value: 0 },
    fat: { value: 91 },
  };
  assert.equal(
    judgeOff(oil).verdict,
    "accept",
    judgeOff(oil).reasons.join(";"),
  );
});

test("zero is a value; missing is not", () => {
  const diet = can({ categories_tags: ["en:beverages", "en:diet-sodas"] });
  sets(diet)[0]!.nutrients = {
    "energy-kcal": { value: 0 },
    proteins: { value: 0 },
    carbohydrates: { value: 0 },
    fat: { value: 0 },
  };
  assert.equal(judgeOff(diet).verdict, "accept");
  const missing = can();
  delete (sets(missing)[0]!.nutrients as Rec).fat;
  assert.equal(judgeOff(missing).verdict, "reject");
});

test("evidence, provenance and OFF's own quality flags", () => {
  assert.ok(
    judgeOff(can({ images: {} })).reasons.includes(
      "no nutrition-label photo or manufacturer source",
    ),
  );
  assert.equal(
    judgeOff(can({ images: {}, owner: "org-keurig" })).verdict,
    "accept",
  );
  assert.ok(
    judgeOff(can({ creator: "usda-ndb-import" })).reasons.includes(
      "2017 USDA import copy",
    ),
  );
  assert.equal(
    judgeOff(
      can({ data_quality_errors_tags: ["en:nutrition-value-total-over-105"] }),
    ).verdict,
    "reject",
  );
  const nonCore = judgeOff(
    can({
      data_quality_errors_tags: ["en:nutrition-salt-does-not-match-sodium"],
    }),
  );
  assert.equal(nonCore.verdict, "review");
  assert.equal(
    judgeOff(
      can({
        data_quality_warnings_tags: [
          "en:nutrition-value-very-high-for-category-sugars",
        ],
      }),
    ).verdict,
    "review",
  );
  assert.equal(
    judgeOff(
      can({
        data_quality_warnings_tags: [
          "en:serving-quantity-defined-but-quantity-undefined",
        ],
      }),
    ).verdict,
    "accept",
  );
  assert.equal(judgeOff(can(), "excluded:energy").verdict, "review");
  assert.equal(judgeOff(can({ obsolete: "on" })).verdict, "reject");
  assert.equal(judgeOff(can({ brands: "" })).verdict, "reject");
});

test("energy that contradicts the macros is rejected; a loose match is reviewed", () => {
  const off = can();
  sets(off)[0]!.nutrients = {
    "energy-kcal": { value: 400 },
    proteins: { value: 0 },
    carbohydrates: { value: 11 },
    fat: { value: 0 },
  };
  assert.equal(judgeOff(off).verdict, "reject");
});

test("OFF's kcal cross-check is replaced by the 4/4/9 check: correct US labels pass", () => {
  // Steel-cut oats: 375 kcal, P 12.5, C 67.5, F 6.25 (4/4/9 gives 376).
  const oats = can({
    categories_tags: ["en:breakfast-cereals"],
    serving_quantity: 40,
    serving_quantity_unit: "g",
    data_quality_errors_tags: [
      "en:energy-value-in-kcal-does-not-match-value-computed-from-other-nutrients",
    ],
    data_quality_warnings_tags: [
      "en:nutrition-energy-value-in-kcal-does-not-match-value-in-kj",
    ],
  });
  sets(oats)[0] = {
    source: "packaging",
    preparation: "as_sold",
    per: "100g",
    per_unit: "g",
    nutrients: {
      "energy-kcal": { value: 375 },
      proteins: { value: 12.5 },
      carbohydrates: { value: 67.5 },
      fat: { value: 6.25 },
    },
  };
  const j = judgeOff(oats);
  assert.equal(j.verdict, "accept", j.reasons.join("; "));
  // A kcal/kJ swap is still an error.
  assert.equal(
    judgeOff(
      can({
        data_quality_errors_tags: [
          "en:nutrition-energy-value-in-kcal-and-kj-are-reversed",
        ],
      }),
    ).verdict,
    "reject",
  );
});

test("duplicate records agree only within label rounding and on the same basis", () => {
  const a = judgeOff(can()).candidate!;
  assert.ok(sameValues(a, { ...a, kcal: 43 }));
  assert.ok(!sameValues(a, { ...a, kcal: 60 }));
  assert.ok(!sameValues(a, { ...a, basis: "g" }));
});
