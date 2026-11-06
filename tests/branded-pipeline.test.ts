import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  cleanName,
  deduplicate,
  household,
  judge,
  staticOrder,
  ymd,
  type Accepted,
} from "../scripts/branded-catalog/rules";
import {
  contentDigest,
  inspectCatalog,
  writeCatalog,
} from "../scripts/branded-catalog/catalog-db";
import { listZipFile, zipLines } from "../scripts/branded-catalog/zip-stream";
import manifest from "../src/data/branded-catalog.manifest.json";
import { BRANDED_SCHEMA } from "../src/domain/branded";

/** A complete, valid USDA Branded Foods record (Quest bar, per 100 g). */
function record(over: Record<string, unknown> = {}) {
  const n = (id: number, amount: number) => ({ nutrient: { id }, amount });
  return {
    fdcId: 1001,
    description: "PROTEIN BAR, COOKIES & CREAM",
    brandOwner: "Quest Nutrition, LLC",
    brandName: "QUEST",
    marketCountry: "United States",
    dataSource: "LI",
    gtinUpc: "888849000708",
    servingSize: 60,
    servingSizeUnit: "g",
    householdServingFullText: "1 BAR",
    brandedFoodCategory: "Snack, Energy & Granola Bars",
    publicationDate: "4/30/2026",
    modifiedDate: "3/1/2026",
    foodNutrients: [n(1008, 350), n(1003, 35), n(1005, 36.7), n(1004, 13.3)],
    ...over,
  };
}
const productOf = (r: ReturnType<typeof judge>) => {
  assert.ok("product" in r, JSON.stringify(r));
  return r.product;
};

test("a complete record is accepted exactly as published", () => {
  const p = productOf(judge(record()));
  assert.equal(p.name, "PROTEIN BAR, COOKIES & CREAM");
  assert.equal(p.brand, "QUEST");
  assert.equal(p.basis, "g");
  assert.equal(p.serving, 60);
  assert.equal(p.household, "1 BAR");
  assert.deepEqual([p.kcal, p.protein, p.carbs, p.fat], [350, 35, 36.7, 13.3]);
  assert.equal(p.gtin, "00888849000708");
  assert.equal(p.published, 20260430);
  assert.deepEqual(p.flags, []);
  // The brand owner stands in only when there is no brand name.
  assert.equal(
    productOf(judge(record({ brandName: "" }))).brand,
    "Quest Nutrition, LLC",
  );
});

test("each rule excludes with its own reason, in order", () => {
  const without = (id: number) =>
    record().foodNutrients.filter((n) => n.nutrient.id !== id);
  const cases: [Record<string, unknown>, string][] = [
    [{ marketCountry: "New Zealand" }, "market"],
    [{ dataSource: "Euromonitor" }, "euromonitor"],
    [{ discontinuedDate: "1/1/2025" }, "discontinued"],
    [{ description: "  " }, "noName"],
    [{ brandName: "", brandOwner: "" }, "noBrand"],
    [{ servingSizeUnit: "MG" }, "unit"],
    [{ servingSizeUnit: "IU" }, "unit"],
    [{ servingSize: 0 }, "noServing"],
    [{ servingSize: 2500 }, "bigServing"],
    [{ foodNutrients: without(1008) }, "noEnergy"],
    [{ foodNutrients: without(1003) }, "noMacro"],
    [{ foodNutrients: without(1005) }, "noMacro"],
    [{ foodNutrients: without(1004) }, "noMacro"],
    [
      {
        foodNutrients: [
          ...without(1004),
          { nutrient: { id: 1004 }, amount: -1 },
        ],
      },
      "negative",
    ],
    [
      {
        foodNutrients: [
          ...without(1008),
          { nutrient: { id: 1008 }, amount: 950 },
        ],
      },
      "impossible",
    ],
    [
      {
        foodNutrients: [
          ...without(1008),
          { nutrient: { id: 1008 }, amount: 40 },
        ],
      },
      "energy",
    ],
    [
      { householdServingFullText: "3/4 cup with 1/2 cup skim milk" },
      "prepared",
    ],
  ];
  for (const [over, reason] of cases)
    assert.deepEqual(judge(record(over)), { reason }, reason);
});

test("missing nutrients are never treated as zero; zero as published is kept", () => {
  const zeroFat = record({
    foodNutrients: [
      { nutrient: { id: 1008 }, amount: 0 },
      { nutrient: { id: 1003 }, amount: 0 },
      { nutrient: { id: 1005 }, amount: 0 },
      { nutrient: { id: 1004 }, amount: 0 },
    ],
  });
  assert.equal(productOf(judge(zeroFat)).kcal, 0);
  assert.deepEqual(judge(record({ foodNutrients: [] })), {
    reason: "noEnergy",
  });
});

test("millilitre products keep their basis; units are never converted", () => {
  const milk = productOf(
    judge(
      record({
        servingSizeUnit: "MLT",
        servingSize: 240,
        householdServingFullText: "1 cup (240 mL)",
      }),
    ),
  );
  assert.equal(milk.basis, "ml");
  assert.equal(milk.serving, 240);
  assert.equal(productOf(judge(record({ servingSizeUnit: "GRM" }))).basis, "g");
  assert.equal(productOf(judge(record({ servingSizeUnit: "GM" }))).basis, "g");
});

test("loose energy and alcohol are kept with a flag, not excluded", () => {
  const fibre = productOf(
    judge(
      record({
        foodNutrients: [
          { nutrient: { id: 1008 }, amount: 200 },
          { nutrient: { id: 1003 }, amount: 20 },
          { nutrient: { id: 1005 }, amount: 40 },
          { nutrient: { id: 1004 }, amount: 2 },
        ],
      }),
    ),
  );
  assert.deepEqual(fibre.flags, ["energy-loose"]);
  const beer = productOf(
    judge(
      record({
        brandedFoodCategory: "Beer",
        foodNutrients: [
          { nutrient: { id: 1008 }, amount: 43 },
          { nutrient: { id: 1003 }, amount: 0.5 },
          { nutrient: { id: 1005 }, amount: 3.5 },
          { nutrient: { id: 1004 }, amount: 0 },
        ],
      }),
    ),
  );
  assert.deepEqual(beer.flags, ["alcohol-energy"]);
});

test("text is normalised without changing meaning", () => {
  assert.equal(
    cleanName("GRANOLA, CINNAMON, RAISIN, CINNAMON, RAISIN"),
    "GRANOLA, CINNAMON, RAISIN",
  );
  assert.deepEqual(household("4 OZA"), {
    text: "4 fl oz",
    flag: "household-gs1-code",
  });
  assert.deepEqual(household("1 BAR) | ("), {
    text: "",
    flag: "household-malformed",
  });
  assert.deepEqual(household("None"), { text: "", flag: "household-none" });
  assert.deepEqual(household("2/3 cup"), { text: "2/3 cup" });
  assert.equal(ymd("4/26/2020"), 20200426);
  assert.equal(ymd("2023-07-13"), 20230713);
  assert.equal(ymd(undefined), 0);
  const noisy = productOf(judge(record({ servingSize: 150.24969482421875 })));
  assert.equal(noisy.serving, 150.25);
  assert.ok(noisy.flags.includes("serving-float-noise"));
});

test("barcodes: printed spaces are ignored; bad check digits are kept out of the index, never repaired", () => {
  assert.equal(
    productOf(judge(record({ gtinUpc: "0 12546 61229 6" }))).gtin,
    "00012546612296",
  );
  const bad = productOf(judge(record({ gtinUpc: "888849000709" })));
  assert.equal(bad.gtin, null);
  assert.deepEqual(bad.flags, ["barcode-bad-check-digit"]);
  const short = productOf(judge(record({ gtinUpc: "03600029145" })));
  assert.equal(short.gtin, null, "11 digits missing a check digit");
});

test("one product per barcode, newest label kept; other products are never merged by name", () => {
  const p = (over: Partial<Accepted>): Accepted => ({
    ...productOf(judge(record())),
    ...over,
  });
  const old = p({ fdcId: 1, published: 20200101, protein: 13.3 });
  const relabel = p({ fdcId: 2, published: 20230101, protein: 6.67 });
  const sameValues = p({
    fdcId: 3,
    published: 20210101,
    gtin: "00036000291452",
  });
  const repeat = p({ fdcId: 4, published: 20220101, gtin: "00036000291452" });
  const twinA = p({ fdcId: 5, gtin: null, name: "OATS" });
  const twinB = p({ fdcId: 6, gtin: null, name: "OATS" });
  const otherSize = p({ fdcId: 7, gtin: null, name: "OATS", serving: 80 });
  const { products, superseded } = deduplicate([
    old,
    relabel,
    sameValues,
    repeat,
    twinA,
    twinB,
    otherSize,
  ]);
  assert.deepEqual(
    products.map((x) => x.fdcId).sort(),
    [2, 4, 6, 7],
    "newest per barcode; exact twins merged; a different serving kept",
  );
  assert.deepEqual(superseded, [
    { gtin: "00888849000708", kept: 2, superseded: 1, conflict: true },
    { gtin: "00036000291452", kept: 4, superseded: 3, conflict: false },
    { gtin: null, kept: 6, superseded: 5, conflict: false },
  ]);
});

test("the static order is total and puts usable, simpler listings first", () => {
  const p = (over: Partial<Accepted>): Accepted => ({
    ...productOf(judge(record())),
    ...over,
  });
  const rows = [
    p({ fdcId: 4, name: "A B C", household: "1 bar" }),
    p({ fdcId: 3, name: "A", household: "" }),
    p({ fdcId: 2, name: "A B", household: "1 bar", published: 20200101 }),
    p({ fdcId: 1, name: "A B", household: "1 bar", published: 20240101 }),
  ].sort(staticOrder);
  assert.deepEqual(
    rows.map((r) => r.fdcId),
    [1, 2, 4, 3],
  );
});

test("the catalogue file is deterministic and its digest covers every row", () => {
  const dir = mkdtempSync(join(tmpdir(), "branded-"));
  try {
    const products = [
      productOf(judge(record())),
      productOf(
        judge(
          record({
            fdcId: 2002,
            description: "WHOLE ULTRA-FILTERED MILK",
            brandName: "FAIRLIFE",
            servingSizeUnit: "ml",
            servingSize: 240,
            gtinUpc: "",
          }),
        ),
      ),
    ];
    const meta = { release: "test", records: 2 };
    const a = writeCatalog(join(dir, "a.db"), products, meta);
    const b = writeCatalog(join(dir, "b.db"), [...products].reverse(), meta);
    assert.equal(a.digest, b.digest, "input order does not matter");
    assert.deepEqual(
      readFileSync(join(dir, "a.db")),
      readFileSync(join(dir, "b.db")),
    );
    assert.equal(a.products, 2);
    assert.equal(a.barcodes, 1);
    assert.equal(a.perHundredMl, 1);
    const { meta: stored, digest } = inspectCatalog(join(dir, "a.db"));
    assert.equal(stored.contentSha256, digest);
    assert.equal(stored.schema, String(BRANDED_SCHEMA));
    // Any change to a value changes the digest.
    const db = new DatabaseSync(join(dir, "a.db"));
    db.exec("UPDATE product SET kcal = kcal + 1 WHERE id = 1");
    assert.notEqual(contentDigest(db), digest);
    db.close();
    // Rollback journal, not WAL: the file opens read-only on its own.
    const header = readFileSync(join(dir, "b.db")).subarray(18, 20);
    assert.deepEqual([...header], [1, 1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A one-member ZIP (deflated), optionally with a wrong CRC. */
function zip(name: string, text: string, badCrc = false) {
  const data = Buffer.from(text);
  const packed = deflateRawSync(data);
  const crc = (crc32(data) ^ (badCrc ? 1 : 0)) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const nameBuf = Buffer.from(name);
  const dirOffset = 30 + name.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(dirOffset, 16);
  return Buffer.concat([local, nameBuf, packed, central, nameBuf, end]);
}

test("the archive is streamed line by line and its CRC is checked", async () => {
  const dir = mkdtempSync(join(tmpdir(), "branded-zip-"));
  try {
    const body = '{"BrandedFoods": [\n{"a":1},\n{"a":2}]}';
    const good = join(dir, "good.zip");
    writeFileSync(good, zip("foods.json", body));
    const [entry] = listZipFile(good);
    assert.equal(entry?.name, "foods.json");
    const lines: string[] = [];
    for await (const line of zipLines(good, entry!)) lines.push(line);
    assert.deepEqual(lines, ['{"BrandedFoods": [', '{"a":1},', '{"a":2}]}']);
    const bad = join(dir, "bad.zip");
    writeFileSync(bad, zip("foods.json", body, true));
    const [badEntry] = listZipFile(bad);
    await assert.rejects(async () => {
      for await (const line of zipLines(bad, badEntry!)) void line;
    }, /CRC-32 mismatch/);
    writeFileSync(join(dir, "evil.zip"), zip("../x.json", body));
    assert.throws(() => listZipFile(join(dir, "evil.zip")), /Unsafe ZIP path/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ASSET = join("assets", "catalog", manifest.file);
test(
  "the built catalogue matches the committed manifest",
  { skip: !existsSync(ASSET) },
  () => {
    const db = new DatabaseSync(ASSET, { readOnly: true });
    try {
      const meta = Object.fromEntries(
        (
          db.prepare("SELECT key, value FROM meta").all() as {
            key: string;
            value: string;
          }[]
        ).map((m) => [m.key, m.value]),
      );
      assert.equal(meta.contentSha256, manifest.contentSha256);
      assert.equal(meta.schema, String(BRANDED_SCHEMA));
      assert.equal(Number(meta.products), manifest.products);
      assert.equal(Number(meta.barcodes), manifest.barcodes);
      assert.equal(meta.release, manifest.release);
      assert.equal(meta.sourceSha256, manifest.source.sha256);
      const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
      assert.equal(count("SELECT count(*) n FROM product"), manifest.products);
      assert.equal(count("SELECT count(*) n FROM barcode"), manifest.barcodes);
      assert.equal(
        count("SELECT count(*) n FROM product WHERE gtin IS NOT NULL"),
        manifest.barcodes,
      );
      assert.equal(
        count("SELECT count(*) n FROM product WHERE basis = 1"),
        manifest.perHundredMl,
      );
    } finally {
      db.close();
    }
  },
);
