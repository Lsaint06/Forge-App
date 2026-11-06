import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  MAX_PACKAGE_SERVINGS,
  agrees,
  packageAmount,
  planServing,
  readHousehold,
  servingName,
  statedAmounts,
} from "../src/domain/servings";
import { household, judge } from "../scripts/branded-catalog/rules";
import { planServings } from "../scripts/branded-catalog/catalog-db";
import {
  byBarcode,
  loadCategories,
  plan,
  search,
  type Runner,
} from "../src/data/branded-query";
import manifest from "../src/data/branded-catalog.manifest.json";

// Phase 7.3F.1: smart servings. Every case is a real household text from
// the USDA release (audit: docs/audits/PHASE_7_3F_1_SMART_SERVINGS.md).

/** A product as the build sees it, from published texts. */
function product(
  raw: string,
  serving: number,
  basis: "g" | "ml" = "g",
  packageText = "",
) {
  return {
    householdRaw: raw,
    household: household(raw).text,
    serving,
    basis,
    packageText,
  };
}
const read = (raw: string, serving: number, basis: "g" | "ml" = "g") =>
  readHousehold(raw, household(raw).text, serving, basis);

test("named units from the label are kept; their repeated amount is not", () => {
  assert.deepEqual(read("1 Stick", 32), { kind: "named", name: "1 Stick" });
  assert.deepEqual(read("1 stick (32g/1.15oz)", 32), {
    kind: "named",
    name: "1 stick",
  });
  assert.deepEqual(read("1 BAR", 60), { kind: "named", name: "1 bar" });
  assert.deepEqual(read("1 Can", 355, "ml"), { kind: "named", name: "1 Can" });
  assert.deepEqual(read("32 chips", 28), { kind: "named", name: "32 chips" });
  assert.deepEqual(read("1 bar (25g)", 25), { kind: "named", name: "1 bar" });
  assert.deepEqual(read("1 TEA BAG MAKES 8 FL OZ", 1), {
    kind: "named",
    name: "1 tea bag",
  });
  assert.deepEqual(read("3 CRACKERS, PER CONTAINER ABOUT", 15), {
    kind: "named",
    name: "3 crackers",
  });
});

test("household measures are kept as measures", () => {
  assert.deepEqual(read("0.25 cup", 28), { kind: "measure", name: "0.25 cup" });
  assert.deepEqual(read("2/3 cup", 30), { kind: "measure", name: "2/3 cup" });
  assert.deepEqual(read("1/4 cup (28g)", 28), {
    kind: "measure",
    name: "1/4 cup",
  });
  // A volume on a weight-based product is not checked (no density).
  assert.deepEqual(read("1 cup (240 mL)", 245), {
    kind: "measure",
    name: "1 cup",
  });
});

test("weight-only and volume-only texts are not names", () => {
  for (const [raw, serving, basis] of [
    ["1.15 ONZ", 32, "g"],
    ["1.15 oz", 32, "g"],
    ["0.5 ONZ", 14, "g"],
    ["8 OZA", 240, "ml"],
    ["38 GRM", 38, "g"],
    ["12 fl oz (360 mL)", 355, "ml"],
    ["1oz (28g)", 28, "g"],
    ["1 oz (28g/about 20 chips) Per serving", 28, "g"],
  ] as const)
    assert.equal(read(raw, serving, basis).kind, "metric", raw);
  for (const raw of [
    "AMOUNT PER SERVING",
    "1 serving",
    "about 2.5 servings per bag, unpopped",
  ])
    assert.equal(read(raw, 30).kind, "generic", raw);
  for (const raw of ["", "None", "Stick"])
    assert.equal(read(raw, 30).kind, "empty", raw);
});

test("a stated amount that contradicts the metric serving rejects the name", () => {
  assert.deepEqual(read("1.05 ONZ", 60), { kind: "conflict" });
  assert.deepEqual(read("3.52 ONZ", 30), { kind: "conflict" });
  assert.deepEqual(read("1 bar (40g)", 60), { kind: "conflict" });
  // Label rounding is allowed.
  assert.equal(read("1 stick (32g)", 32.5).kind, "named");
  assert.ok(agrees(28.35, 28) && agrees(354.9, 355) && !agrees(29.8, 60));
});

test("'N UNITS | ABOUT' is recovered; other malformed text is not", () => {
  assert.deepEqual(read("15 CHIPS | ABOUT", 28), {
    kind: "about",
    name: "about 15 chips",
  });
  assert.deepEqual(read("0.25 CUP | ABOUT", 30), {
    kind: "about",
    name: "about 0.25 cup",
  });
  assert.equal(read("28 G | ABOUT", 28).kind, "empty");
  assert.equal(read("1 BAR) | (", 40).kind, "empty");
});

test("text and amounts are read without converting grams and millilitres", () => {
  assert.deepEqual(
    statedAmounts("1.15 oz/32 g").map((a) => [a.unit, Math.round(a.value)]),
    [
      ["g", 33],
      ["g", 32],
    ],
  );
  assert.deepEqual(
    statedAmounts("8 fl oz (240 mL)").map((a) => a.unit),
    ["ml", "ml"],
  );
  assert.equal(servingName("1 STICK (32g/1.15oz)"), "1 stick");
  assert.equal(servingName("2 cookies"), "2 cookies");
});

test("package size: single servings, a few servings, and anything unclear", () => {
  assert.equal(packageAmount("1.15 OZ/32 G", "g"), 32);
  assert.equal(packageAmount("20 fl oz/591 mL", "ml"), 591);
  assert.equal(packageAmount("12 x 12 fl oz", "ml"), undefined, "multipack");
  assert.equal(packageAmount("6 ct", "g"), undefined);
  assert.equal(packageAmount("5 lbs/2.26 g", "g"), undefined, "disagrees");
  assert.equal(packageAmount("8.4 fl oz", "g"), undefined, "other unit");
  assert.equal(packageAmount("", "g"), undefined);
});

test("the serving ladder: label, measure, about, same product, package, then 1 serving", () => {
  assert.deepEqual(planServing(product("1 Stick", 32)), {
    label: "1 Stick",
    source: "label",
    kind: "named",
  });
  assert.equal(planServing(product("2 Tbsp", 30)).source, "measure");
  assert.equal(
    planServing(product("15 CHIPS | ABOUT", 28)).label,
    "about 15 chips",
  );
  // Chomps: a weight-only text and a package of one stick.
  assert.deepEqual(planServing(product("1.15 ONZ", 32, "g", "1.15 OZ/32 G")), {
    label: "1 package",
    source: "package",
    kind: "metric",
  });
  // The same product's other listing names it: that wins over the package.
  assert.deepEqual(
    planServing(product("1.15 ONZ", 32, "g", "1.15 OZ/32 G"), "1 Stick"),
    { label: "1 Stick", source: "sibling", kind: "metric" },
  );
  // A 24-stick box is neither one serving nor a few.
  assert.deepEqual(planServing(product("1.15 ONZ", 32, "g", "27.6 oz/768 g")), {
    label: "1 serving",
    source: "serving",
    kind: "metric",
  });
  // A conflicting text trusts only the metric serving, whatever else is known.
  assert.deepEqual(
    planServing(product("1.05 ONZ", 60, "g", "2.1 oz/60 g"), "1 cube"),
    {
      label: "1 serving",
      source: "serving",
      kind: "conflict",
    },
  );
  // A 20 fl oz bottle with 8 fl oz servings offers the whole bottle too.
  assert.deepEqual(
    planServing(product("8 OZA", 240, "ml", "20 fl oz/591 mL")),
    {
      label: "1 serving",
      source: "serving",
      kind: "metric",
      whole: 591,
    },
  );
  // Too many servings for "whole package" (a family pack, a multipack).
  const family = planServing(product("1 oz", 28, "g", "8 oz/227 g"));
  assert.ok(227 / 28 > MAX_PACKAGE_SERVINGS);
  assert.equal(family.whole, undefined);
});

test("same-product names need the exact brand, name, serving and basis", () => {
  const base = judge({
    fdcId: 1,
    description: "ORIGINAL BEEF STICKS, ORIGINAL",
    brandName: "CHOMPS",
    marketCountry: "United States",
    servingSize: 32,
    servingSizeUnit: "GRM",
    householdServingFullText: "1 Stick",
    packageWeight: "13.8 oz/384 g",
    foodNutrients: [
      { nutrient: { id: 1008 }, amount: 281 },
      { nutrient: { id: 1003 }, amount: 28.1 },
      { nutrient: { id: 1005 }, amount: 0 },
      { nutrient: { id: 1004 }, amount: 18.8 },
    ],
  });
  assert.ok("product" in base);
  const named = base.product;
  const weightOnly = {
    ...named,
    fdcId: 2,
    household: "1.15 oz",
    householdRaw: "1.15 ONZ",
    packageText: "27.6 oz/768 g",
  };
  const otherSize = { ...weightOnly, fdcId: 3, serving: 14 };
  const otherName = {
    ...weightOnly,
    fdcId: 4,
    name: "ORIGINAL BEEF STICKS, SPICY",
  };
  const plans = planServings([named, weightOnly, otherSize, otherName]);
  assert.equal(plans.get(named)!.source, "label");
  assert.deepEqual(
    [plans.get(weightOnly)!.label, plans.get(weightOnly)!.source],
    ["1 Stick", "sibling"],
  );
  assert.equal(plans.get(otherSize)!.source, "serving", "different serving");
  assert.equal(plans.get(otherName)!.source, "serving", "different name");
});

const REAL = join("assets", "catalog", manifest.file);
test(
  "real catalogue: Chomps, Coca-Cola and Quest servings; counts match the manifest",
  { skip: !existsSync(REAL) },
  async () => {
    const db = new DatabaseSync(REAL, { readOnly: true });
    const r: Runner = {
      all: async (sql, p) => db.prepare(sql).all(...p) as never,
      get: async (sql, p) => (db.prepare(sql).get(...p) ?? null) as never,
    };
    try {
      const at = async (code: string) => (await byBarcode(r, code))!;
      const chomps = await at("856584004183");
      assert.deepEqual(
        [
          chomps.servingLabel,
          chomps.servingSource,
          chomps.serving,
          chomps.basis,
        ],
        ["1 package", "package", 32, "g"],
      );
      const can = await at("049000006346");
      assert.deepEqual(
        [can.servingLabel, can.serving, can.basis],
        ["1 Can", 355, "ml"],
      );
      const quest = await at("888849000708");
      assert.deepEqual([quest.servingLabel, quest.serving], ["1 Bar", 60]);
      // Chomps listings whose own text is a weight take "1 Stick" from the
      // same product's other listing.
      const sticks = db
        .prepare(
          "SELECT sl.name label, p.serving_source s FROM product p JOIN brand b ON b.id = p.brand JOIN serving_label sl ON sl.id = p.serving_label WHERE b.key = 'chomps' AND p.name = 'ORIGINAL BEEF STICKS, ORIGINAL'",
        )
        .all() as { label: string; s: number }[];
      assert.ok(sticks.length >= 4);
      assert.ok(sticks.every((x) => x.label === "1 Stick"));
      // Every product has a serving name, and the counts are the manifest's.
      const counts = db
        .prepare("SELECT serving_source s, count(*) n FROM product GROUP BY s")
        .all() as { s: number; n: number }[];
      const total = counts.reduce((a, c) => a + c.n, 0);
      assert.equal(total, manifest.products);
      assert.equal(
        (
          db
            .prepare("SELECT count(*) n FROM product WHERE package IS NOT NULL")
            .get() as { n: number }
        ).n,
        manifest.servings.wholePackage,
      );
      // Search returns the same serving names (search and scan agree).
      const cats = await loadCategories(r);
      const page = await search(
        r,
        (await plan(r, "chomps original beef sticks", cats))!,
      );
      const listed = page.products.find((p) => p.fdcId === 2652237);
      assert.equal(listed?.servingLabel, "1 Stick");
    } finally {
      db.close();
    }
  },
);
