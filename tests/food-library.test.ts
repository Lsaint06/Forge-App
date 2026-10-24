import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  curate,
  nearIdentical,
  readEnergy,
  readNutrient,
  readPer100,
  readPortions,
  serializeCatalog,
  type SourceSpec,
} from "../scripts/food-library/pipeline";
import { listZip, readZipEntry } from "../scripts/food-library/zip";
import { FEATURED } from "../scripts/food-library/featured";
import {
  DEFAULT_GRAMS,
  choiceError,
  decodeLibrary,
  entryFromLibrary,
  normalizeText,
  portionLabel,
  searchLibrary,
  servingOf,
  stem,
  totalGrams,
  valuesForGrams,
  type FoodLibrary,
} from "../src/domain/food-library";
import { loadFoodLibrary } from "../src/data/food-catalog";
import {
  entryFromFood,
  foodChoices,
  foodFromEntry,
  kcalText,
  mergeEntry,
  sourceMeta,
  totalsOf,
  withSourceEdits,
} from "../src/domain/nutrition";
import { nutritionTotals } from "../src/domain/metrics";
import { validateJournal } from "../src/domain/validation";
import type { Journal } from "../src/domain/types";
import { pathRepository } from "./path-fixture";
import { deflateRawSync, crc32 } from "node:zlib";

// Phase 7B WP4A.1: the built-in USDA food library. Pipeline rules on
// fixtures, the generated catalog's integrity, portions, search and the
// guarantee that logged history never depends on the catalog.

const root = join(__dirname, "..");
const catalogText = readFileSync(
  join(root, "src", "data", "food-library", "catalog.json"),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(
    join(root, "src", "data", "food-library", "manifest.json"),
    "utf8",
  ),
);
const sources = JSON.parse(
  readFileSync(join(root, "scripts", "food-library", "sources.json"), "utf8"),
) as { sources: SourceSpec[] };
const lib = loadFoodLibrary();
const food = (id: string) => {
  const f = lib.byId.get(id);
  assert.ok(f, `${id} is in the catalog`);
  return f!;
};
const named = (name: string) => {
  const f = lib.foods.find((x) => x.name === name);
  assert.ok(f, `"${name}" is in the catalog`);
  return f!;
};
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// ---- USDA record fixtures --------------------------------------------------

const fndds = sources.sources.find((s) => s.key === "fndds")!;
const sr = sources.sources.find((s) => s.key === "sr")!;
type N = [id: number, unit: string, amount: unknown];
const nutrients = (rows: N[]) =>
  rows.map(([id, unitName, amount]) => ({
    nutrient: { id, unitName },
    amount,
  }));
const standard = (kcal: unknown, p: unknown, c: unknown, f: unknown): N[] => [
  [1008, "kcal", kcal],
  [1003, "g", p],
  [1005, "g", c],
  [1004, "g", f],
];
const surveyFood = (
  fdcId: number,
  description: string,
  values: N[] = standard(100, 10, 10, 1),
  category = "Chicken, whole pieces",
  portions: unknown[] = [],
) => ({
  fdcId,
  dataType: "Survey (FNDDS)",
  description,
  wweiaFoodCategory: { wweiaFoodCategoryDescription: category },
  foodNutrients: nutrients(values),
  foodPortions: portions,
});
const legacyFood = (
  fdcId: number,
  description: string,
  values: N[] = standard(100, 10, 10, 1),
  portions: unknown[] = [],
) => ({
  fdcId,
  dataType: "SR Legacy",
  description,
  foodNutrients: nutrients(values),
  foodPortions: portions,
});

// ---- Source integrity --------------------------------------------------------

test("the sources are pinned official USDA releases, and the manifest matches them", () => {
  assert.deepEqual(
    sources.sources.map((s) => [s.key, s.release]),
    [
      ["fndds", "2024-10-31"],
      ["sr", "2018-04"],
    ],
  );
  for (const s of sources.sources) {
    assert.match(s.url, /^https:\/\/fdc\.nal\.usda\.gov\/fdc-datasets\//);
    assert.match(s.sha256, /^[0-9a-f]{64}$/);
    const m = manifest.sources.find((x: { key: string }) => x.key === s.key);
    assert.equal(m.sha256, s.sha256);
    assert.equal(m.url, s.url);
    assert.deepEqual(m.energyNutrientIds, [1008]);
  }
  assert.equal(
    fndds.sha256,
    "dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb",
  );
  assert.equal(
    sr.sha256,
    "0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef",
  );
});

test("the bundled catalog is the one the manifest describes, byte for byte", () => {
  assert.equal(
    createHash("sha256").update(catalogText).digest("hex"),
    manifest.catalog.sha256,
  );
  // The app bundles the same JSON as one string (catalog.js).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundled = require("../src/data/food-library/catalog.js") as string;
  assert.equal(bundled, catalogText);
  assert.equal(Buffer.byteLength(catalogText), manifest.catalog.bytes);
  assert.equal(lib.foods.length, manifest.catalog.foods);
  assert.equal(lib.version, manifest.catalogVersion);
  const bySource = (k: string) =>
    lib.foods.filter((f) => f.id.startsWith(`${k}:`)).length;
  for (const s of manifest.sources) assert.equal(bySource(s.key), s.included);
  assert.ok(lib.foods.length >= 1000, "at least 1,000 foods");
});

test("the ZIP reader verifies sizes and CRC-32 and refuses unsafe archives", () => {
  const zip = (name: string, data: Buffer, crc = crc32(data)) => {
    const packed = deflateRawSync(data);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(0, 42);
    const body = Buffer.concat([local, n, packed]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(46 + n.length, 12);
    end.writeUInt32LE(body.length, 16);
    return Buffer.concat([body, central, n, end]);
  };
  const data = Buffer.from('{"SurveyFoods":[]}');
  const good = zip("surveyDownload.json", data);
  const [entry] = listZip(good);
  assert.equal(entry!.name, "surveyDownload.json");
  assert.deepEqual(readZipEntry(good, entry!, 1000), data);
  assert.throws(() => readZipEntry(good, entry!, 5), /limit/);
  const bad = zip("surveyDownload.json", data, 1234);
  assert.throws(() => readZipEntry(bad, listZip(bad)[0]!, 1000), /CRC-32/);
  assert.throws(() => listZip(zip("../evil.json", data)), /Unsafe/);
  assert.throws(() => listZip(Buffer.from("not a zip")), /Not a ZIP/);
});

// ---- Nutrient extraction -----------------------------------------------------

test("a recorded zero is kept; missing, invalid, wrong-unit and conflicting values are refused", () => {
  const read = (rows: N[]) =>
    readNutrient({ foodNutrients: nutrients(rows) }, 1003, "g", "protein");
  assert.deepEqual(read([[1003, "g", 0]]), { ok: true, value: 0 });
  assert.deepEqual(read([[1003, "G", 12.4]]), { ok: true, value: 12.4 });
  assert.deepEqual(read([]), { ok: false, reason: "missing-protein" });
  assert.deepEqual(read([[1003, "g", null]]), {
    ok: false,
    reason: "missing-protein",
  });
  for (const bad of [-1, Number.NaN, Infinity, "12", true])
    assert.deepEqual(read([[1003, "g", bad]]), {
      ok: false,
      reason: "invalid-protein",
    });
  assert.deepEqual(read([[1003, "mg", 5]]), {
    ok: false,
    reason: "wrong-unit-protein",
  });
  assert.deepEqual(
    read([
      [1003, "g", 5],
      [1003, "g", 6],
    ]),
    {
      ok: false,
      reason: "conflicting-protein",
    },
  );
  assert.deepEqual(
    read([
      [1003, "g", 5],
      [1003, "g", 5],
    ]),
    { ok: true, value: 5 },
  );
});

test("energy comes from the permitted kcal field only; never kJ, never a formula", () => {
  const energy = (rows: N[], ids: number[]) =>
    readEnergy({ foodNutrients: nutrients(rows) }, ids);
  assert.deepEqual(energy([[1008, "kcal", 143]], [1008]), {
    ok: true,
    value: { kcal: 143, id: 1008 },
  });
  // Foundation-style policy order: specific Atwater first, then general.
  assert.deepEqual(
    energy(
      [
        [2047, "kcal", 106],
        [2048, "kcal", 112],
      ],
      [2048, 2047, 1008],
    ),
    { ok: true, value: { kcal: 112, id: 2048 } },
  );
  // A present but unusable preferred value is refused, not skipped.
  assert.deepEqual(
    energy(
      [
        [2048, "kcal", null],
        [2047, "kcal", 106],
      ],
      [2048, 2047],
    ),
    { ok: false, reason: "missing-energy" },
  );
  assert.deepEqual(energy([[1062, "kJ", 251]], [1008]), {
    ok: false,
    reason: "energy-kj-only",
  });
  assert.deepEqual(energy([[1008, "kJ", 251]], [1008]), {
    ok: false,
    reason: "wrong-unit-energy",
  });
  assert.deepEqual(energy([[1003, "g", 1]], [1008]), {
    ok: false,
    reason: "missing-energy",
  });
  // Macros alone never produce energy.
  const values = readPer100(
    {
      foodNutrients: nutrients([
        [1003, "g", 20],
        [1005, "g", 0],
        [1004, "g", 10],
      ]),
    },
    [1008],
  );
  assert.deepEqual(values, { ok: false, reason: "missing-energy" });
  assert.deepEqual(
    readPer100({ foodNutrients: nutrients(standard(50, 60, 40, 10)) }, [1008]),
    { ok: false, reason: "implausible-values" },
  );
});

// ---- Portions ---------------------------------------------------------------

test("household portions keep their documented weights; non-consumer portions are dropped", () => {
  const survey = readPortions(
    {
      foodPortions: [
        {
          id: 3,
          sequenceNumber: 3,
          portionDescription: "1 slice",
          gramWeight: 5,
        },
        {
          id: 1,
          sequenceNumber: 1,
          portionDescription: "1 egg",
          gramWeight: 50,
        },
        {
          id: 9,
          sequenceNumber: 9,
          portionDescription: "Quantity not specified",
          gramWeight: 50,
        },
        {
          id: 8,
          sequenceNumber: 8,
          portionDescription: "Guideline amount per cup",
          gramWeight: 61,
        },
        {
          id: 7,
          sequenceNumber: 7,
          portionDescription: "1 fry, NS as to shape",
          gramWeight: 5,
        },
        {
          id: 6,
          sequenceNumber: 6,
          portionDescription: "1 school container",
          gramWeight: 244,
        },
        {
          id: 2,
          sequenceNumber: 2,
          portionDescription: "1 cup",
          gramWeight: 135,
        },
        {
          id: 4,
          sequenceNumber: 4,
          portionDescription: "1 cup",
          gramWeight: 140,
        },
        {
          id: 5,
          sequenceNumber: 5,
          portionDescription: "1 huge",
          gramWeight: 0,
        },
      ],
    },
    "fndds",
  );
  assert.deepEqual(survey, [
    { label: "1 egg", grams: 50 },
    { label: "1 cup", grams: 135 },
    { label: "1 slice", grams: 5 },
  ]);
  const legacy = readPortions(
    {
      foodPortions: [
        {
          id: 1,
          sequenceNumber: 1,
          amount: 4,
          modifier: "oz",
          measureUnit: { name: "undetermined" },
          gramWeight: 113,
        },
        {
          id: 2,
          sequenceNumber: 2,
          amount: 0.5,
          modifier: "breast",
          measureUnit: { name: "undetermined" },
          gramWeight: 118,
        },
        {
          id: 3,
          sequenceNumber: 3,
          amount: 1,
          modifier: "chopped",
          measureUnit: { name: "cup" },
          gramWeight: 140,
        },
        {
          id: 4,
          sequenceNumber: 4,
          modifier: "piece",
          measureUnit: { name: "undetermined" },
          gramWeight: 30,
        },
        {
          id: 5,
          sequenceNumber: 5,
          amount: 1,
          modifier: "10205",
          measureUnit: { name: "undetermined" },
          gramWeight: 30,
        },
      ],
    },
    "sr",
  );
  assert.deepEqual(legacy, [
    { label: "4 oz", grams: 113 },
    { label: "0.5 breast", grams: 118 },
    { label: "1 cup, chopped", grams: 140 },
  ]);
});

// ---- Curation ---------------------------------------------------------------

const fixture = () => [
  {
    spec: fndds,
    records: [
      surveyFood(
        1,
        "Chicken breast, baked, broiled, or roasted, skin not eaten, from raw",
        standard(161, 30.2, 0, 3.52),
      ),
      surveyFood(
        2,
        "Chicken breast, fried, coated, skin / coating eaten, from raw",
        standard(229, 22, 8, 11),
      ),
      surveyFood(3, "Chicken breast, NFS"),
      surveyFood(
        4,
        "Milk, whole",
        standard(61, 3.27, 4.63, 3.2),
        "Milk, whole",
      ),
      surveyFood(
        5,
        "Milk, fat free (skim)",
        standard(34, 3.43, 4.92, 0.08),
        "Milk, nonfat",
      ),
      surveyFood(
        6,
        "Almond milk, sweetened",
        standard(30, 0.53, 4.31, 1.18),
        "Plant-based milk",
      ),
      surveyFood(
        7,
        "Almond milk, unsweetened",
        standard(15, 0.55, 0.34, 1.22),
        "Plant-based milk",
      ),
      surveyFood(8, "Coffee, brewed", standard(1, 0.12, 0, 0.02), "Coffee"),
      surveyFood(
        9,
        "Coffee, brewed, decaffeinated",
        standard(0, 0.1, 0, 0),
        "Coffee",
      ),
      surveyFood(10, "Coffee, Latte", standard(53, 3, 4.5, 2.5), "Coffee"),
      surveyFood(
        11,
        "Coffee, Latte, decaffeinated",
        standard(80, 3, 9, 3.5),
        "Coffee",
      ),
      surveyFood(12, "Milk, human", [[1003, "g", 1]], "Human milk"),
      surveyFood(
        13,
        "Cheeseburger (McDonalds)",
        standard(260, 13, 25, 12),
        "Burgers",
      ),
      surveyFood(
        14,
        "Rice, white, cooked, no added fat",
        standard(129, 2.67, 28, 0.28),
        "Rice",
        [
          {
            id: 1,
            sequenceNumber: 1,
            portionDescription: "1 cup, cooked",
            gramWeight: 158,
          },
        ],
      ),
      surveyFood(
        15,
        "Tempeh",
        standard(195, 20, 7.6, 11),
        "Soy and meat-alternative products",
      ),
      null,
    ],
  },
  {
    spec: sr,
    records: [
      legacyFood(
        174030,
        "Beef, ground, 90% lean meat / 10% fat, raw",
        standard(176, 20, 0, 10),
      ),
      legacyFood(
        171796,
        "Beef, ground, 85% lean meat / 15% fat, raw (Includes foods for USDA's Food Distribution Program)",
        standard(215, 18.6, 0, 15),
      ),
      legacyFood(
        168877,
        "Rice, white, long-grain, regular, raw, enriched",
        standard(365, 7.13, 80, 0.66),
      ),
      legacyFood(
        171077,
        "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw",
        standard(120, 22.5, 0, 2.62),
      ),
      legacyFood(167639, "Fish, salmon, coho (silver), raw (Alaska Native)"),
      legacyFood(174272, "Tempeh", standard(192, 20.3, 7.64, 10.8)),
      legacyFood(170000, "Babyfood, cereal, rice"),
      legacyFood(173177, "Beverages, Whey protein powder isolate", [
        [1008, "kcal", 359],
        [1003, "g", 58.1],
        [1005, "g", 29.1],
      ]),
    ],
  },
];

test("curation keeps distinct foods apart and records why everything else was left out", () => {
  const { foods, exclusions, inputs } = curate(fixture());
  const ids = foods.map((f) => f.id);
  const reason = (id: string) => exclusions.find((e) => e.id === id)?.reason;
  assert.deepEqual(inputs, { fndds: 16, sr: 8 });
  // Materially different foods all stay.
  for (const id of [
    "fndds:1",
    "fndds:2", // baked vs fried
    "fndds:4",
    "fndds:5", // whole vs skim
    "fndds:6",
    "fndds:7", // sweetened vs unsweetened
    "sr:174030",
    "sr:171796", // 90/10 vs 85/15
    "sr:168877",
    "fndds:14", // dry vs cooked rice
    "sr:171077", // raw chicken next to cooked
    "fndds:11", // decaf latte whose values differ from the regular one
  ])
    assert.ok(ids.includes(id), id);
  assert.equal(reason("fndds:3"), "unspecified-type (NFS)");
  assert.equal(reason("fndds:9"), "equivalent-variant (decaffeinated)");
  assert.equal(reason("fndds:12"), "category-not-curated: Human milk");
  assert.equal(reason("fndds:13"), "brand-named-product");
  assert.equal(reason("fndds:#15"), "null-record");
  assert.equal(reason("sr:167639"), "sr-regional-or-variant");
  assert.equal(reason("sr:170000"), "sr-not-in-allowlist");
  assert.equal(reason("sr:174272"), "duplicate-name (FNDDS preferred)");
  assert.equal(reason("sr:173177"), "missing-fat");
  // Readable names, original descriptions kept.
  const beef = foods.find((f) => f.id === "sr:171796")!;
  assert.equal(beef.name, "Ground beef, 85% lean / 15% fat, raw");
  assert.match(
    beef.description,
    /^Beef, ground, 85% lean meat \/ 15% fat, raw/,
  );
  assert.equal(
    foods.find((f) => f.id === "sr:168877")!.name,
    "Rice, white, long-grain, regular, enriched, dry (uncooked)",
  );
  assert.equal(
    foods.find((f) => f.id === "sr:171077")!.name,
    "Chicken breast, skinless, boneless, meat only, raw",
  );
  // Values are copied, never altered.
  assert.deepEqual(foods.find((f) => f.id === "sr:174030")!.per100, {
    kcal: 176,
    protein: 20,
    carbs: 0,
    fat: 10,
  });
  assert.deepEqual(foods.find((f) => f.id === "fndds:14")!.portions, [
    { label: "1 cup, cooked", grams: 158 },
  ]);
});

test("curation is deterministic: input order never changes the catalog bytes", () => {
  const a = curate(fixture());
  const shuffled = fixture().map((s) => ({
    ...s,
    records: [...s.records].reverse(),
  }));
  const b = curate(shuffled);
  const out = (r: ReturnType<typeof curate>) =>
    serializeCatalog("test", { fndds: "f", sr: "s" }, r.foods, []);
  assert.equal(out(a), out(b));
  assert.deepEqual(
    a.foods.map((f) => f.id),
    [...a.foods.map((f) => f.id)].sort(),
  );
  assert.throws(
    () =>
      curate([
        {
          spec: fndds,
          records: [
            surveyFood(1, "Egg, whole, raw"),
            surveyFood(1, "Egg, whole, raw"),
          ],
        },
      ]),
    /Duplicate source identifier/,
  );
});

test("near-identical means within 10 kcal or 5 %, and 1 g or 10 % per macronutrient", () => {
  const base = { kcal: 100, protein: 10, carbs: 10, fat: 5 };
  assert.ok(nearIdentical(base, { ...base, kcal: 108 }));
  assert.ok(!nearIdentical(base, { ...base, kcal: 112 }));
  assert.ok(!nearIdentical(base, { ...base, fat: 6.5 }));
  assert.ok(
    nearIdentical(
      { kcal: 500, protein: 1, carbs: 1, fat: 1 },
      { kcal: 524, protein: 1, carbs: 1, fat: 1 },
    ),
  );
});

// ---- The generated catalog ---------------------------------------------------

test("every catalog food has complete, finite, non-negative values per 100 g and stable IDs", () => {
  const seen = new Set<string>();
  for (const f of lib.foods) {
    assert.match(f.id, /^(fndds|sr):\d+$/);
    assert.ok(!seen.has(f.id));
    seen.add(f.id);
    for (const v of [f.kcal, f.protein, f.carbs, f.fat])
      assert.ok(Number.isFinite(v) && v >= 0, f.id);
    assert.ok(f.protein + f.carbs + f.fat <= 101, f.id);
    for (const p of f.portions) assert.ok(p.grams > 0 && p.grams <= 5000, f.id);
  }
  assert.deepEqual(
    lib.featured.map((f) => f.id),
    FEATURED,
  );
  // Records cross-checked against the downloaded USDA releases.
  const expect = (id: string, values: [number, number, number, number]) => {
    const f = food(id);
    assert.deepEqual([f.kcal, f.protein, f.carbs, f.fat], values, id);
  };
  expect("sr:168877", [365, 7.13, 80, 0.66]);
  expect("sr:174030", [176, 20, 0, 10]);
  expect("sr:171796", [215, 18.6, 0, 15]);
  expect("sr:171077", [120, 22.5, 0, 2.62]);
  expect("fndds:2705385", [61, 3.27, 4.63, 3.2]);
  expect("fndds:2707154", [143, 12.4, 0.96, 9.96]);
  expect("fndds:2708408", [129, 2.67, 28, 0.28]);
  assert.deepEqual(food("fndds:2707154").portions[0], {
    label: "1 egg",
    grams: 50,
  });
});

test("the catalog offers both sides of every important distinction", () => {
  const pairs: [string, string][] = [
    [
      "Chicken breast, skinless, boneless, meat only, raw",
      "Chicken breast, baked, broiled, or roasted, skin not eaten, from raw",
    ],
    [
      "Rice, white, long-grain, regular, enriched, dry (uncooked)",
      "Rice, white, cooked, no added fat",
    ],
    [
      "Ground beef, 90% lean / 10% fat, raw",
      "Ground beef, 85% lean / 15% fat, raw",
    ],
    ["Milk, whole", "Milk, fat free (skim)"],
    ["Almond milk, sweetened", "Almond milk, unsweetened"],
    [
      "Chicken breast, fried, coated, skin / coating eaten, from raw",
      "Chicken breast, baked, coated, skin / coating eaten",
    ],
  ];
  for (const [a, b] of pairs) {
    const x = named(a);
    const y = named(b);
    assert.notEqual(x.id, y.id);
    assert.notDeepEqual(
      [x.kcal, x.protein, x.carbs, x.fat],
      [y.kcal, y.protein, y.carbs, y.fat],
      `${a} / ${b}`,
    );
  }
  // Names stay unique, so no two foods look the same.
  const names = lib.foods.map((f) => f.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test("a damaged catalog is refused as a whole", () => {
  const raw = JSON.parse(catalogText);
  const broken = (mutate: (r: { foods: unknown[][] }) => void) => {
    const copy = JSON.parse(JSON.stringify(raw));
    mutate(copy);
    return () => decodeLibrary(copy);
  };
  assert.throws(
    broken((r) => (r.foods[0]![4] = -1)),
    /damaged/,
  );
  assert.throws(
    broken((r) => (r.foods[0]![4] = null)),
    /damaged/,
  );
  assert.throws(
    broken((r) => (r.foods[1]![0] = r.foods[0]![0])),
    /duplicate/,
  );
  assert.throws(
    broken((r) => (r.foods[0]![8] = [["1 cup", 0]])),
    /portion/,
  );
  assert.throws(
    broken((r) => (r.foods[0]![0] = "journal-id")),
    /id/,
  );
  assert.throws(() => decodeLibrary({ ...raw, formatVersion: 2 }), /format/);
});

// ---- Portions ---------------------------------------------------------------

test("grams scale the values per 100 g exactly; nothing is rounded until display", () => {
  const chicken = food("fndds:2705956"); // 161 kcal, P 30.2, F 3.52 per 100 g
  const v = valuesForGrams(chicken, 150);
  close(v.calories, 241.5);
  close(v.protein, 45.3);
  close(v.fat, 5.28);
  assert.equal(v.carbs, 0);
  const rice = food("fndds:2708408");
  close(valuesForGrams(rice, 200).calories, 258);
  close(valuesForGrams(rice, 12.5).calories, 16.125);
  assert.equal(
    kcalText(valuesForGrams(food("sr:174030"), 150).calories),
    "264 kcal",
  );
  assert.equal(kcalText(valuesForGrams(chicken, 150).calories), "242 kcal");
});

test("household portions use their own documented weight, never a generic one", () => {
  const egg = food("fndds:2707154");
  const one = servingOf(egg, { kind: "portion", index: 0, count: 2 });
  assert.deepEqual(one, { serving: "1 egg (50 g)", grams: 50, quantity: 2 });
  assert.equal(totalGrams(egg, { kind: "portion", index: 0, count: 2 }), 100);
  close(valuesForGrams(egg, one.grams).calories * one.quantity, 143);
  // A cup of cooked rice and a cup of egg weigh what their sources say.
  assert.equal(food("fndds:2708408").portions[0]!.grams, 158);
  assert.equal(egg.portions[1]!.grams, 135);
  assert.equal(
    portionLabel({ label: "1 cup, cooked", grams: 158 }),
    "1 cup, cooked (158 g)",
  );
  // Half a cup.
  close(
    totalGrams(food("fndds:2708408"), {
      kind: "portion",
      index: 0,
      count: 0.5,
    }),
    79,
  );
});

test("amounts outside the allowed range, or too large for one entry, are refused", () => {
  const rice = food("fndds:2708408");
  for (const grams of [0, 0.05, -10, 5000.5, Number.NaN])
    assert.ok(choiceError(rice, { kind: "grams", grams }), String(grams));
  for (const grams of [0.1, 1, 150, 5000])
    assert.equal(choiceError(rice, { kind: "grams", grams }), undefined);
  for (const count of [0, 100.5, Number.NaN])
    assert.ok(choiceError(rice, { kind: "portion", index: 0, count }));
  assert.ok(choiceError(rice, { kind: "portion", index: 7, count: 1 }));
  // 5 kg of oil would exceed a journal entry's 20,000 kcal limit.
  assert.match(
    choiceError(named("Olive oil"), { kind: "grams", grams: 5000 })!,
    /smaller parts/,
  );
});

test("a logged library food is an ordinary, valid journal snapshot of what was eaten", () => {
  const rice = food("fndds:2708408");
  const grams = entryFromLibrary(
    rice,
    { kind: "grams", grams: 150 },
    "2026.1",
    "Lunch",
  );
  assert.deepEqual(grams, {
    name: "Rice, white, cooked, no added fat",
    meal: "Lunch",
    calories: 193.5,
    protein: 4.005,
    carbs: 42,
    fat: 0.42,
    quantity: 1,
    serving: "150 g",
    sourceId: "fndds:2708408",
    sourceCatalog: "2026.1",
    sourceGrams: 150,
  });
  validateJournal("nutrition", grams);
  const eggs = entryFromLibrary(
    food("fndds:2707154"),
    { kind: "portion", index: 0, count: 2 },
    "2026.1",
    "Breakfast",
  );
  assert.equal(eggs.serving, "1 egg (50 g)");
  assert.equal(eggs.quantity, 2);
  close(eggs.calories as number, 71.5);
  validateJournal("nutrition", eggs);
  // Totals use the existing calculation unchanged.
  const t = nutritionTotals([
    {
      calories: eggs.calories as number,
      protein: eggs.protein as number,
      carbs: eggs.carbs as number,
      fat: eggs.fat as number,
      quantity: 2,
    },
  ]);
  close(t.calories, 143);
});

test("repeating, copying or saving a library food never scales it twice", () => {
  const entry = entryFromLibrary(
    food("sr:174030"),
    { kind: "grams", grams: 150 },
    "2026.1",
    "Dinner",
  );
  const journal: Journal = {
    id: "j1",
    kind: "nutrition",
    date: "2026-10-23",
    data: entry,
    createdAt: 1,
    updatedAt: 1,
  };
  const { recent } = foodChoices([journal], []);
  assert.equal(recent.length, 1);
  const again = entryFromFood(recent[0]!, "Lunch", recent[0]!.quantity);
  for (const k of [
    "calories",
    "protein",
    "carbs",
    "fat",
    "quantity",
    "serving",
    "sourceId",
    "sourceGrams",
  ])
    assert.equal(again[k], entry[k], k);
  const saved = foodFromEntry(entry);
  assert.deepEqual(
    { ...saved },
    {
      name: entry.name,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      quantity: 1,
      serving: "150 g",
      sourceId: "sr:174030",
      sourceCatalog: "2026.1",
      sourceGrams: 150,
    },
  );
  close(totalsOf([journal]).calories, 264);
});

test("editing a library entry marks changed values and drops a weight that no longer applies", () => {
  const entry = entryFromLibrary(
    food("fndds:2707154"),
    { kind: "portion", index: 0, count: 2 },
    "2026.1",
    "Breakfast",
  );
  const quantityOnly = withSourceEdits(mergeEntry(entry, { quantity: 3 }), {
    quantity: 3,
  });
  assert.deepEqual(sourceMeta(quantityOnly), {
    sourceId: "fndds:2707154",
    sourceCatalog: "2026.1",
    sourceGrams: 50,
  });
  const valuesChanged = withSourceEdits(mergeEntry(entry, { calories: 80 }), {
    calories: 80,
  });
  assert.equal(valuesChanged.sourceEdited, true);
  const servingChanged = withSourceEdits(
    mergeEntry(entry, { serving: "1 large egg" }),
    { serving: "1 large egg" },
  );
  assert.equal("sourceGrams" in servingChanged, false);
  // Entries without provenance are untouched.
  const plain = {
    name: "Oats",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    quantity: 1,
  };
  assert.equal(withSourceEdits(plain, { calories: 10 }), plain);
  // Malformed provenance is ignored rather than trusted.
  assert.equal(sourceMeta({ ...plain, sourceId: 5 }), undefined);
  assert.deepEqual(
    sourceMeta({
      ...plain,
      sourceId: "sr:1",
      sourceGrams: -2,
      sourceEdited: "yes",
    }),
    { sourceId: "sr:1" },
  );
});

// ---- History -----------------------------------------------------------------

test("history never changes when the catalog changes, and survives backup and deletion of saved copies", () => {
  const { r, db } = pathRepository();
  const target = pathRepository();
  try {
    const v1 = food("sr:174030");
    const e = r.addJournal(
      "nutrition",
      entryFromLibrary(v1, { kind: "grams", grams: 150 }, "2026.1", "Dinner"),
      "2026-10-23",
    );
    const copy = r.addJournal("food", foodFromEntry(e.data));
    assert.notEqual(e.id, v1.id);
    assert.notEqual(copy.id, v1.id);
    const before = JSON.stringify(r.journal("nutrition"));
    const totals = totalsOf(r.journal("nutrition"));
    // A future catalog with different values for the same food.
    const raw = JSON.parse(catalogText);
    const row = raw.foods.find((x: unknown[]) => x[0] === "sr:174030");
    row[4] = 999;
    row[5] = 1;
    const v2: FoodLibrary = decodeLibrary(raw);
    assert.equal(v2.byId.get("sr:174030")!.kcal, 999);
    assert.equal(JSON.stringify(r.journal("nutrition")), before);
    assert.deepEqual(totalsOf(r.journal("nutrition")), totals);
    // Deleting the saved copy leaves the meal.
    r.deleteJournal(copy.id);
    assert.equal(r.journal("nutrition").length, 1);
    assert.equal(r.journal("food").length, 0);
    // Backup and restore keep the snapshot and its provenance exactly.
    target.r.importBackup(JSON.stringify(r.exportBackup()));
    assert.equal(JSON.stringify(target.r.journal("nutrition")), before);
    // The catalog never wrote anything to the user's database.
    assert.ok(r.journal().every((j) => !/^(fndds|sr):/.test(j.id)));
  } finally {
    db.close();
    target.db.close();
  }
});

// ---- Search ------------------------------------------------------------------

test("recent and saved foods are searched by every word, in any order", () => {
  const saved: Journal = {
    id: "f1",
    kind: "food",
    date: "2026-10-23",
    data: {
      name: "Oats, rolled or quick, dry (uncooked)",
      calories: 151.6,
      protein: 5.28,
      carbs: 27.08,
      fat: 2.608,
      quantity: 1,
      serving: "40 g",
    },
    createdAt: 1,
    updatedAt: 1,
  };
  for (const q of ["oats dry", "DRY oats", "40 g oats", "rolled"])
    assert.equal(foodChoices([], [saved], q).saved.length, 1, q);
  for (const q of ["oats cooked", "steel"])
    assert.equal(foodChoices([], [saved], q).saved.length, 0, q);
});

const top = (q: string, n = 5) => searchLibrary(lib, q, n).map((f) => f.name);

test("search ignores case, accents, punctuation, plurals and word order", () => {
  assert.equal(normalizeText("Crème Brûlée, 90%/10%!"), "creme brulee 90 10");
  assert.equal(stem("berries"), "berry");
  assert.equal(stem("potatoes"), "potato");
  assert.equal(stem("eggs"), "egg");
  assert.equal(stem("hummus"), "hummus");
  assert.deepEqual(top("CHICKEN BREAST"), top("breast chicken"));
  assert.deepEqual(top("eggs", 1), top("egg", 1));
  assert.equal(top("chick brea", 1)[0], top("chicken breast", 1)[0]);
});

test("search ranks everyday foods first for common queries", () => {
  const cases: [string, RegExp][] = [
    [
      "chicken breast",
      /^Chicken breast, baked, broiled, or roasted, skin not eaten/,
    ],
    ["raw chicken breast", /^Chicken breast.*raw$/],
    ["cooked chicken breast", /^Chicken breast, baked/],
    ["egg", /^Egg, whole, boiled or poached$/],
    ["rice", /^Rice, white, cooked, no added fat$/],
    ["white rice cooked", /^Rice, white, cooked, no added fat$/],
    ["rice uncooked", /dry \(uncooked\)$/],
    ["oats", /^Oats/],
    ["banana", /^Banana, raw$/],
    ["apple", /^Apple, raw$/],
    ["milk", /^Milk, (whole|reduced fat \(2%\))$/],
    ["skim milk", /^Milk, fat free \(skim\)$/],
    ["greek yogurt", /^Yogurt, Greek/],
    ["salmon", /^Salmon, Atlantic, farmed, cooked/],
    ["ground beef", /^Ground beef/],
    ["90/10 beef", /^Ground beef, 90% lean \/ 10% fat/],
    ["broccoli", /^Broccoli, raw$/],
    ["peanut butter", /^Peanut butter$/],
    ["olive oil", /^Olive oil$/],
    ["whey", /^Whey protein powder isolate$/],
    ["avocado", /^Avocado, raw$/],
    ["bread", /^Bread, whole wheat$/],
    ["bagel", /^Bagel$/],
    ["beer", /^Beer$/],
    ["coffee", /^Coffee/],
    ["tofu", /^Tofu/],
    ["unsweetened almond milk", /^Almond milk, unsweetened$/],
    ["black beans", /^Black beans/],
    ["sweet potato", /^Sweet potato, baked, no added fat$/],
  ];
  const misses = cases.filter(([q, re]) => !re.test(top(q, 1)[0] ?? ""));
  assert.deepEqual(
    misses.map(([q]) => `${q} → ${top(q, 1)[0]}`),
    [],
  );
});

test("ordinary foods are found in the first five results (relevance set)", () => {
  // ≥ 60 everyday queries; at least 95 % must find a matching food in the top 5.
  const cases: [string, RegExp][] = [
    ["turkey", /^Turkey/],
    ["ground turkey", /^Ground turkey/],
    ["bacon", /bacon/i],
    ["ham", /^Ham/],
    ["pork chop", /pork.*chop|chop.*pork/i],
    ["pork tenderloin", /^Pork tenderloin/],
    ["sirloin", /sirloin/i],
    ["steak", /steak/i],
    ["shrimp", /^Shrimp/],
    ["tuna", /^Tuna/],
    ["canned tuna", /^Tuna, .*canned/],
    ["cod", /^Cod/],
    ["tilapia", /^Tilapia/],
    ["sardines", /^Sardine/],
    ["eggs scrambled", /scrambled/i],
    ["egg white", /^Egg, white/],
    ["cheddar", /Cheddar/],
    ["cottage cheese", /ottage/],
    ["mozzarella", /ozzarella/],
    ["butter", /^Butter/],
    ["cream cheese", /^Cream cheese/],
    ["almond milk", /^Almond milk/],
    ["oat milk", /^Oat milk/],
    ["soy milk", /^Soy milk/],
    ["yogurt", /^Yogurt/],
    ["quinoa", /^Quinoa/],
    ["pasta", /^Pasta/],
    ["spaghetti", /paghetti/],
    ["tortilla", /^Tortilla/],
    ["english muffin", /^English muffin/],
    ["pancakes", /^Pancake/],
    ["granola", /ranola/],
    ["corn flakes", /orn flakes/],
    ["strawberries", /^Strawberries/],
    ["blueberries", /^Blueberries/],
    ["orange", /^Orange/],
    ["grapes", /^Grapes/],
    ["pineapple", /^Pineapple/],
    ["mango", /^Mango/],
    ["watermelon", /^Watermelon/],
    ["spinach", /^Spinach/],
    ["carrots", /^Carrots/],
    ["tomato", /^Tomato/],
    ["lettuce", /^Lettuce/],
    ["cucumber", /^Cucumber/],
    ["onion", /^Onion/],
    ["green beans", /^Green beans|^String beans/],
    ["corn", /^Corn/],
    ["potato", /^Potato/],
    ["lentils", /^Lentils/],
    ["chickpeas", /^Chickpeas/],
    ["garbanzo", /^Chickpeas/],
    ["hummus", /^Hummus/],
    ["kidney beans", /^Kidney beans/],
    ["edamame", /damame/],
    ["almonds", /^Almonds/],
    ["walnuts", /^Walnuts/],
    ["cashews", /^Cashew/],
    ["chia seeds", /^Chia/],
    ["coconut oil", /^Coconut oil/],
    ["mayonnaise", /^Mayonnaise/],
    ["honey", /^Honey/],
    ["orange juice", /^Orange juice/],
    ["wine", /^Wine/],
    ["pizza", /^Pizza/],
    ["burger", /burger/i],
    ["french fries", /french fries/i],
    ["sushi", /^Sushi/],
    ["burrito", /^Burrito/],
    ["popcorn", /^Popcorn/],
    ["dark chocolate", /chocolate/i],
    ["ice cream", /^Ice cream/],
    ["protein powder", /^Protein powder|^Whey/],
    ["prawn", /^Shrimp/],
    ["yoghurt", /^Yogurt/],
    ["courgette", /ucchini/],
  ];
  assert.ok(cases.length >= 60);
  const misses = cases.filter(([q, re]) => !top(q).some((n) => re.test(n)));
  assert.ok(
    misses.length / cases.length <= 0.05,
    `missed: ${misses.map(([q]) => `${q} → ${top(q).join(" | ")}`).join("\n")}`,
  );
});

test("preparation and fat words are strict filters, never loose matches", () => {
  for (const name of top("cooked rice", 50))
    assert.doesNotMatch(name, /uncooked/);
  for (const name of top("uncooked rice", 50)) assert.match(name, /uncooked/);
  for (const name of top("sweetened", 50))
    assert.doesNotMatch(name, /unsweetened/i);
  for (const name of top("unsweetened", 50)) assert.match(name, /unsweetened/i);
  for (const name of top("90/10 ground beef", 50))
    assert.match(name, /90% lean \/ 10% fat/);
  for (const name of top("raw chicken", 50)) assert.match(name, /raw/i);
});

test("an empty or unmatched search returns nothing; results are bounded", () => {
  assert.deepEqual(searchLibrary(lib, ""), []);
  assert.deepEqual(searchLibrary(lib, "   "), []);
  assert.deepEqual(searchLibrary(lib, "the and of"), []);
  assert.deepEqual(searchLibrary(lib, "zzqxv"), []);
  assert.deepEqual(searchLibrary(lib, "grandma's stew"), []);
  assert.ok(searchLibrary(lib, "c").length <= 200);
  assert.equal(searchLibrary(lib, "c", 30).length, 30);
});

test("search is fast enough on the full catalog (desktop benchmark, not a device measurement)", () => {
  const queries = [
    "chicken breast",
    "c",
    "rice cooked",
    "milk",
    "egg",
    "greek yogurt",
    "tofu",
    "lentil",
    "banana",
    "salmon",
    "oats",
    "peanut butter",
    "beef 90",
    "unsweetened",
    "zzzz",
  ];
  const times: number[] = [];
  for (let i = 0; i < 20; i++)
    for (const q of queries) {
      const t = performance.now();
      searchLibrary(lib, q);
      times.push(performance.now() - t);
    }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)]!;
  assert.ok(p95 < 20, `p95 ${p95.toFixed(2)} ms`);
  const start = performance.now();
  decodeLibrary(JSON.parse(catalogText));
  assert.ok(performance.now() - start < 500);
});

test("the library works with no network access at all", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("offline");
  }) as typeof fetch;
  try {
    const offline = decodeLibrary(JSON.parse(catalogText));
    assert.ok(searchLibrary(offline, "chicken").length > 0);
    const entry = entryFromLibrary(
      offline.byId.get("fndds:2707154")!,
      { kind: "grams", grams: DEFAULT_GRAMS },
      offline.version,
      "Lunch",
    );
    validateJournal("nutrition", entry);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
