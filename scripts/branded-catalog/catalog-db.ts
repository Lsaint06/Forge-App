// Writes the branded catalogue SQLite file and computes its content digest.
// The digest covers every table's rows in a fixed order (not the file
// bytes, which differ between SQLite versions), so the same source and rules
// always give the same digest, on any machine or CI runner.
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { BRANDED_SCHEMA, catalogKey } from "../../src/domain/branded";
import { staticOrder, type Accepted } from "./rules";

/** The catalogue tables. Values are stored × 1000 as integers (lossless). */
export const SCHEMA_SQL = `
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE category(id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL);
CREATE TABLE brand(id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL);
CREATE INDEX brand_key ON brand(key);
-- id is the static order; basis 0 = per 100 g, 1 = per 100 ml.
CREATE TABLE product(id INTEGER PRIMARY KEY, fdc_id INTEGER NOT NULL,
  name TEXT NOT NULL, brand INTEGER NOT NULL, category INTEGER NOT NULL,
  basis INTEGER NOT NULL CHECK(basis IN (0, 1)),
  serving INTEGER NOT NULL CHECK(serving > 0), household TEXT NOT NULL,
  kcal INTEGER NOT NULL, protein INTEGER NOT NULL, carbs INTEGER NOT NULL,
  fat INTEGER NOT NULL, published INTEGER NOT NULL, gtin INTEGER);
CREATE TABLE barcode(gtin INTEGER PRIMARY KEY, product INTEGER NOT NULL);
CREATE VIEW product_text(id, name, brand) AS
  SELECT p.id, p.name, b.name FROM product p JOIN brand b ON b.id = p.brand;
CREATE VIRTUAL TABLE product_fts USING fts5(name, brand,
  content='product_text', content_rowid='id',
  tokenize="unicode61 remove_diacritics 2", detail=column);`;

const scaled = (v: number) => Math.round(v * 1000);

/** Every table's rows, canonically, hashed: the catalogue's identity. */
export function contentDigest(db: DatabaseSync) {
  const hash = createHash("sha256");
  const dump = (label: string, sql: string) => {
    hash.update(`#${label}\n`);
    for (const row of db.prepare(sql).iterate())
      hash.update(`${JSON.stringify(Object.values(row as object))}\n`);
  };
  dump(
    "meta",
    "SELECT key, value FROM meta WHERE key <> 'contentSha256' ORDER BY key",
  );
  dump("category", "SELECT * FROM category ORDER BY id");
  dump("brand", "SELECT * FROM brand ORDER BY id");
  dump("product", "SELECT * FROM product ORDER BY id");
  dump("barcode", "SELECT * FROM barcode ORDER BY gtin");
  return hash.digest("hex");
}

export type Meta = Record<string, string | number>;

/**
 * Writes the catalogue: products in the static order, brand and category
 * dictionaries, the barcode index and full-text index, then the metadata
 * (including the content digest). Returns the digest and table counts.
 */
export function writeCatalog(file: string, products: Accepted[], meta: Meta) {
  for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`])
    rmSync(f, { force: true });
  const rows = [...products].sort(staticOrder);
  const categories = [...new Set(rows.map((r) => r.category))].sort();
  const brands = [...new Set(rows.map((r) => r.brand))].sort();
  const categoryId = new Map(categories.map((c, i) => [c, i]));
  const brandId = new Map(brands.map((b, i) => [b, i]));
  const db = new DatabaseSync(file);
  try {
    // Rollback journal (never WAL): the shipped file opens read-only alone.
    db.exec(
      "PRAGMA page_size = 4096; PRAGMA journal_mode = DELETE; PRAGMA synchronous = OFF;",
    );
    db.exec(SCHEMA_SQL);
    db.exec("BEGIN");
    const addCategory = db.prepare("INSERT INTO category VALUES (?, ?, ?)");
    categories.forEach((c, i) => addCategory.run(i, c, catalogKey(c)));
    const addBrand = db.prepare("INSERT INTO brand VALUES (?, ?, ?)");
    brands.forEach((b, i) => addBrand.run(i, b, catalogKey(b)));
    const addProduct = db.prepare(
      "INSERT INTO product VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const addBarcode = db.prepare("INSERT INTO barcode VALUES (?, ?)");
    rows.forEach((r, i) => {
      const id = i + 1;
      const gtin = r.gtin ? Number(r.gtin) : null;
      addProduct.run(
        id,
        r.fdcId,
        r.name,
        brandId.get(r.brand)!,
        categoryId.get(r.category)!,
        r.basis === "ml" ? 1 : 0,
        scaled(r.serving),
        r.household,
        scaled(r.kcal),
        scaled(r.protein),
        scaled(r.carbs),
        scaled(r.fat),
        r.published,
        gtin,
      );
      if (gtin !== null) addBarcode.run(gtin, id);
    });
    db.exec(
      "INSERT INTO product_fts(product_fts) VALUES ('rebuild'); INSERT INTO product_fts(product_fts) VALUES ('optimize');",
    );
    const counts = {
      products: rows.length,
      barcodes: rows.filter((r) => r.gtin).length,
      brands: brands.length,
      categories: categories.length,
      perHundredMl: rows.filter((r) => r.basis === "ml").length,
    };
    const addMeta = db.prepare("INSERT INTO meta VALUES (?, ?)");
    for (const [k, v] of Object.entries({
      ...meta,
      ...counts,
      schema: BRANDED_SCHEMA,
    }))
      addMeta.run(k, String(v));
    db.exec("COMMIT");
    const digest = contentDigest(db);
    db.prepare("INSERT INTO meta VALUES ('contentSha256', ?)").run(digest);
    db.exec("VACUUM");
    const integrity = (
      db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }
    ).integrity_check;
    if (integrity !== "ok") throw new Error(`Integrity check: ${integrity}`);
    return { digest, ...counts };
  } finally {
    db.close();
  }
}

/** The stored metadata and a fresh digest of a catalogue file. */
export function inspectCatalog(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const meta = Object.fromEntries(
      (
        db.prepare("SELECT key, value FROM meta").all() as {
          key: string;
          value: string;
        }[]
      ).map((m) => [m.key, m.value]),
    );
    return { meta, digest: contentDigest(db) };
  } finally {
    db.close();
  }
}
