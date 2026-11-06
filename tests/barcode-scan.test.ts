import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FOOD_BARCODES, gtin14, scannedCode } from "../src/domain/barcode";
import { byBarcode, type Runner } from "../src/data/branded-query";
import manifest from "../src/data/branded-catalog.manifest.json";

// Phase 7.3F: what the camera reports, turned into a catalogue lookup. iOS
// reports UPC-A as EAN-13 without its leading zero; UPC-E is expanded only
// when the scanner says UPC-E; nothing is ever repaired.

test("the scanner reads the food symbologies, nothing else", () => {
  assert.deepEqual([...FOOD_BARCODES], ["ean13", "ean8", "upc_a", "upc_e"]);
});

test("every way a camera reports a code gives the same GTIN", () => {
  // UPC-A as iOS reports it (ean13, leading zero stripped) and as Android does.
  assert.deepEqual(scannedCode("ean13", "049000006346"), {
    digits: "049000006346",
    symbology: undefined,
    gtin: "00049000006346",
  });
  assert.equal(scannedCode("upc_a", "049000006346").gtin, "00049000006346");
  assert.equal(scannedCode("ean13", "0049000006346").gtin, "00049000006346");
  // EAN-13 and EAN-8.
  assert.equal(scannedCode("ean13", "4006381333931").gtin, "04006381333931");
  assert.equal(scannedCode("ean8", "96385074").gtin, "00000096385074");
  // Typed with spaces, no scanner type.
  assert.equal(
    scannedCode(undefined, "0 49000 00634 6").gtin,
    "00049000006346",
  );
});

test("UPC-E is expanded only when the scanner says so, and only when complete", () => {
  assert.deepEqual(scannedCode("upc_e", "04252614"), {
    digits: "04252614",
    symbology: "upc_e",
    gtin: "00042100005264",
  });
  // Already expanded by the scanner: read as it is.
  assert.equal(scannedCode("upc_e", "042100005264").gtin, "00042100005264");
  // Without the number system or check digit: never completed by guessing.
  assert.equal(scannedCode("upc_e", "425261").gtin, null);
  assert.equal(scannedCode("upc_e", "4252614").gtin, null);
  // The same 8 digits as EAN-8 are a different (here invalid) code.
  assert.equal(scannedCode("ean8", "04252614").gtin, null);
  assert.equal(gtin14("04252614"), null);
});

test("invalid codes are refused, never repaired", () => {
  assert.equal(scannedCode("ean13", "049000006347").gtin, null, "check digit");
  assert.equal(scannedCode("ean8", "1234567").gtin, null, "too short");
  assert.equal(scannedCode("ean13", "ABC123").gtin, null);
  assert.equal(scannedCode("ean13", "").gtin, null);
});

const REAL = join("assets", "catalog", manifest.file);
test(
  "real catalogue: a Coca-Cola can scanned on iOS finds the product, offline",
  { skip: !existsSync(REAL) },
  async () => {
    const db = new DatabaseSync(REAL, { readOnly: true });
    const r: Runner = {
      all: async (sql, p) => db.prepare(sql).all(...p) as never,
      get: async (sql, p) => (db.prepare(sql).get(...p) ?? null) as never,
    };
    try {
      const scan = scannedCode("ean13", "049000006346");
      const can = await byBarcode(r, scan.digits, scan.symbology);
      assert.ok(can);
      assert.equal(can.gtin, "00049000006346");
      assert.match(can.brand, /coca-cola/i);
      assert.equal(can.basis, "ml");
      // A valid code that isn't in the catalogue is simply not found.
      assert.equal(await byBarcode(r, "09990000000005"), null);
    } finally {
      db.close();
    }
  },
);
