// Branded catalogue queries (Phase 7.3E): planning and SQL for searches and
// barcode lookups, against any SQLite runner (expo-sqlite in the app,
// node:sqlite in tests). Results are bounded pages: nothing here ever reads
// the whole catalogue.
import { gtin14, type Symbology } from "../domain/barcode";
import { catalogKey, type BrandedProduct } from "../domain/branded";

/** Runs SQL against the catalogue. */
export type Runner = {
  all<T>(sql: string, params: (string | number)[]): Promise<T[]>;
  get<T>(sql: string, params: (string | number)[]): Promise<T | null>;
};

/** Above this many matches, results are not scored one by one. */
export const BROAD = 1000;
/** Products per page. */
export const PAGE = 30;
/** Branded search starts at this many letters or digits. */
export const MIN_CHARS = 2;

const COLUMNS = `p.id, p.fdc_id AS fdcId, p.name, b.name AS brand, p.basis,
  p.serving, p.household, p.kcal, p.protein, p.carbs, p.fat, p.gtin`;
type Row = {
  id: number;
  fdcId: number;
  name: string;
  brand: string;
  basis: number;
  serving: number;
  household: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  gtin: number | null;
};
// Values are stored × 1000 as integers (lossless: no published value has
// more than three decimals).
const unscale = (n: number) => n / 1000;
function product(r: Row): BrandedProduct {
  return {
    id: r.id,
    fdcId: r.fdcId,
    name: r.name,
    brand: r.brand,
    basis: r.basis === 1 ? "ml" : "g",
    serving: unscale(r.serving),
    household: r.household,
    kcal: unscale(r.kcal),
    protein: unscale(r.protein),
    carbs: unscale(r.carbs),
    fat: unscale(r.fat),
    ...(r.gtin === null ? {} : { gtin: String(r.gtin).padStart(14, "0") }),
  };
}

export type Category = { id: number; key: string };
/** The category list (a few hundred rows): read once per open catalogue. */
export const loadCategories = (db: Runner) =>
  db.all<Category>("SELECT id, key FROM category", []);

export type Plan = {
  words: string[];
  match: string;
  exactBrands: number[];
  familyBrands: number[];
  prefixBrands: number[];
  categories: number[];
};

/** Every word as a quoted FTS5 prefix term: typed text is never FTS syntax. */
const ftsQuery = (words: string[]) => words.map((w) => `"${w}"*`).join(" ");
const ids = (list: number[]) => (list.length ? list.join(",") : "-1");

/**
 * What a query names, or null when it is too short to search. A brand is
 * "exact" when the query, or its first words, is the brand ("kind bar" names
 * KIND, not KINDER), and its "family" when that brand also has longer
 * variants ("quest" also names QUEST BAR). A single word still being typed
 * (4+ letters, not itself a brand's first word) names the brands it starts:
 * "fairl" names FAIRLIFE, but "chicken" never names CHICKEN OF THE SEA.
 * Categories are named by whole query words ("peanut butter" → Nut & Seed
 * Butters).
 */
export async function plan(
  db: Runner,
  query: string,
  categories: Category[],
): Promise<Plan | null> {
  const phrase = catalogKey(query);
  if (phrase.replace(/ /g, "").length < MIN_CHARS) return null;
  const words = phrase.split(" ");
  const leading = words.map((_, i) => words.slice(0, i + 1).join(" "));
  const exact = await db.all<{ id: number; key: string }>(
    `SELECT id, key FROM brand WHERE key IN (${leading.map(() => "?").join(",")})`,
    leading,
  );
  let family: { id: number }[] = [];
  if (exact.length) {
    const longest = exact.reduce((a, b) =>
      b.key.length > a.key.length ? b : a,
    ).key;
    family = await db.all<{ id: number }>(
      "SELECT id FROM brand WHERE key > ? AND key < ?",
      [`${longest} `, `${longest} {`],
    );
  }
  let prefix: { id: number }[] = [];
  if (!exact.length && words.length === 1 && phrase.length >= 4)
    prefix = (
      await db.all<{ id: number; key: string }>(
        "SELECT id, key FROM brand WHERE key >= ? AND key < ? LIMIT 200",
        [phrase, `${phrase}{`],
      )
    ).filter((b) => b.key.split(" ")[0] !== phrase);
  const named = new Set(words.filter((w) => w.length >= 3));
  const singular = (t: string) => t.replace(/s$/, "");
  return {
    words,
    match: ftsQuery(words),
    exactBrands: exact.map((b) => b.id),
    familyBrands: family.map((b) => b.id),
    prefixBrands: prefix.map((b) => b.id),
    categories: categories
      .filter((c) =>
        c.key.split(" ").some((t) => named.has(t) || named.has(singular(t))),
      )
      .map((c) => c.id),
  };
}

export type Page = {
  products: BrandedProduct[];
  /** Matches, counted up to BROAD. */
  total: number;
  /** True when there are BROAD or more matches. */
  broad: boolean;
};

/**
 * One page of branded results. Up to 1,000 matches are ranked: the brand the
 * query names first, then its family, then products whose own name has every
 * word, then FTS relevance (name above brand) helped by a named category,
 * then the static order. Beyond that, matches are read in a bounded order
 * without scoring each one: a named brand's products, or (with no brand
 * named) only products whose name has every word, by named category and the
 * static order. Pass the total from the first page to skip recounting.
 */
export async function search(
  db: Runner,
  p: Plan,
  offset = 0,
  knownTotal?: number,
): Promise<Page> {
  let total = knownTotal;
  if (total === undefined) {
    const counted = await db.get<{ n: number }>(
      `SELECT count(*) AS n FROM (SELECT rowid FROM product_fts WHERE product_fts MATCH ? LIMIT ${BROAD})`,
      [p.match],
    );
    total = counted?.n ?? 0;
  }
  const broad = total >= BROAD;
  const brandBoost = `CASE WHEN p.brand IN (${ids(p.exactBrands)}) THEN 0
    WHEN p.brand IN (${ids(p.familyBrands)}) THEN 1
    WHEN p.brand IN (${ids(p.prefixBrands)}) THEN 2 ELSE 3 END`;
  const catBoost = `CASE WHEN p.category IN (${ids(p.categories)}) THEN 0 ELSE 1 END`;
  let sql: string;
  let params: (string | number)[];
  if (broad) {
    const branded = p.exactBrands.length + p.familyBrands.length > 0;
    sql = `SELECT ${COLUMNS} FROM product_fts f JOIN product p ON p.id = f.rowid
      JOIN brand b ON b.id = p.brand WHERE product_fts MATCH ?
      ORDER BY ${branded ? `${brandBoost}, ` : ""}${catBoost}, p.id
      LIMIT ${PAGE} OFFSET ?`;
    params = [branded ? p.match : `{name} : (${p.match})`, offset];
  } else {
    const nameHit = `CASE WHEN ${p.words.map(() => "instr(lower(p.name), ?) > 0").join(" AND ")} THEN 0 ELSE 1 END`;
    sql = `SELECT ${COLUMNS} FROM product_fts f JOIN product p ON p.id = f.rowid
      JOIN brand b ON b.id = p.brand WHERE product_fts MATCH ?
      ORDER BY ${brandBoost}, ${nameHit},
        bm25(product_fts, 4.0, 1.0) + ${catBoost} * 2.0, p.id
      LIMIT ${PAGE} OFFSET ?`;
    params = [p.match, ...p.words, offset];
  }
  const rows = await db.all<Row>(sql, params);
  return { products: rows.map(product), total, broad };
}

/**
 * The product a scanned or typed code identifies, or null when there is no
 * such product or the code is not a valid GTIN. Exact and indexed: one
 * product per barcode (resolved when the catalogue is built).
 */
export async function byBarcode(
  db: Runner,
  code: string,
  symbology?: Symbology,
): Promise<BrandedProduct | null> {
  const g = gtin14(code, symbology);
  if (!g) return null;
  const row = await db.get<Row>(
    `SELECT ${COLUMNS} FROM barcode c JOIN product p ON p.id = c.product
      JOIN brand b ON b.id = p.brand WHERE c.gtin = ?`,
    [Number(g)],
  );
  return row ? product(row) : null;
}

/** The catalogue's metadata table. */
export async function readMeta(db: Runner) {
  const rows = await db.all<{ key: string; value: string }>(
    "SELECT key, value FROM meta",
    [],
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** What a catalogue file must be for this build to use it. */
export type Expected = {
  schema: number;
  release: string;
  contentSha256: string;
  products: number;
};

/** Why a catalogue's metadata is not the one this build ships, or undefined. */
export function metaProblem(meta: Record<string, string>, expected: Expected) {
  if (Number(meta.schema) !== expected.schema)
    return `schema ${meta.schema ?? "missing"}, expected ${expected.schema}`;
  if (meta.release !== expected.release)
    return `release ${meta.release ?? "missing"}, expected ${expected.release}`;
  if (meta.contentSha256 !== expected.contentSha256)
    return "contents differ from this build's catalogue";
  if (Number(meta.products) !== expected.products)
    return `${meta.products ?? "no"} products, expected ${expected.products}`;
  return undefined;
}
