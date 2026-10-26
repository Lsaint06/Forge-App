// Phase 7.3F.2 M3.1 research prototype (NOT shipped): sizes, lookup and
// search timings (DESKTOP, node:sqlite; not phone measurements), and exact-
// barcode coverage for named brands, from the outputs of build.ts.
//   npx tsx scripts/research/off-coverage/bench.ts
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

const root = join(__dirname, "..", "..", "..");
const out = join(root, ".cache", "off-research");
const pin = JSON.parse(
  readFileSync(join(__dirname, "snapshot.json"), "utf8"),
) as { snapshot: string };
const offFile = join(out, `off-us-${pin.snapshot}.db`);
const reviewFile = join(out, `off-us-${pin.snapshot}-with-review.db`);
const usdaFile = join(root, "assets", "catalog", "usda-branded-2026-04-30.db");

const ms = (f: () => void) => {
  const t = process.hrtime.bigint();
  f();
  return Number(process.hrtime.bigint() - t) / 1e6;
};
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return (
    Math.round(
      s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! * 1000,
    ) / 1000
  );
};

function sizes(file: string) {
  const bytes = statSync(file).size;
  const gz = gzipSync(readFileSync(file), { level: 9 }).length;
  return { bytes, gzip: gz };
}

/** Barcode point lookups: hits from the table, misses that can't exist. */
function lookups(file: string, sql: string, gtins: number[]) {
  const db = new DatabaseSync(file, { readOnly: true });
  const q = db.prepare(sql);
  const cold = ms(() => q.get(gtins[0]!));
  const times = gtins.map((g) => ms(() => q.get(g)));
  const miss = Array.from(
    { length: 500 },
    (_, i) => 99_000_000_000_000 + i,
  ).map((g) => ms(() => q.get(g)));
  db.close();
  return {
    firstLookupMs: Math.round(cold * 1000) / 1000,
    hitP50: pct(times, 50),
    hitP95: pct(times, 95),
    missP50: pct(miss, 50),
    missP95: pct(miss, 95),
  };
}

/** Simplified FTS prefix search (static order), the same SQL on both files. */
function searches(file: string, queries: string[]) {
  const db = new DatabaseSync(file, { readOnly: true });
  const page = db.prepare(
    "SELECT p.id, p.name FROM product_fts f JOIN product p ON p.id = f.rowid WHERE product_fts MATCH ? ORDER BY p.id LIMIT 30",
  );
  const count = db.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT rowid FROM product_fts WHERE product_fts MATCH ? LIMIT 1000)",
  );
  const result: Record<
    string,
    { coldMs: number; warmMs: number; matches: number }
  > = {};
  for (const q of queries) {
    const match = q
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w.replace(/"/g, "")}"*`)
      .join(" ");
    const coldMs = ms(() => page.all(match));
    const warm = Array.from({ length: 5 }, () => ms(() => page.all(match)));
    result[q] = {
      coldMs: Math.round(coldMs * 100) / 100,
      warmMs: pct(warm, 50),
      matches: Number((count.get(match) as { n: number }).n),
    };
  }
  db.close();
  return result;
}

function sample(file: string, sql: string, n: number) {
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db.prepare(sql).all(n) as { g: number }[];
  db.close();
  return rows.map((r) => r.g);
}

/** Exact-barcode coverage of named brands among what OFF users scan most. */
function probe() {
  const lines = readFileSync(join(out, "candidates.tsv"), "utf8")
    .split("\n")
    .slice(1)
    .filter(Boolean);
  type Row = {
    gtin: string;
    verdict: string;
    name: string;
    brand: string;
    scans: number;
    reasons: string;
  };
  const rows: Row[] = lines.map((l) => {
    const c = l.split("\t");
    return {
      gtin: c[0]!,
      verdict: c[2]!,
      reasons: c[3]!,
      name: c[4]!,
      brand: c[5]!,
      scans: Number(c[16]) || 0,
    };
  });
  const families: [string, RegExp][] = [
    ["Dr Pepper", /dr\.? ?pepper/i],
    ["Chomps", /chomps/i],
    ["Fairlife / Core Power", /fairlife|core power/i],
    ["Celsius", /celsius/i],
    ["Ghost", /^ghost/i],
    ["Barebells", /barebells/i],
    ["Prime", /^prime\b/i],
    ["Quest", /^quest/i],
    ["Premier Protein", /premier protein/i],
    ["Optimum Nutrition", /optimum nutrition/i],
    ["Kirkland", /kirkland/i],
    ["Great Value", /great value/i],
  ];
  const bucket = (v: string) => (v === "in-usda" ? "usda" : v);
  const brands: Record<string, Record<string, number>> = {};
  for (const [label, re] of families) {
    const all = rows.filter((r) => re.test(r.brand) || re.test(r.name));
    const t: Record<string, number> = {
      known: all.length,
      usda: 0,
      accept: 0,
      review: 0,
      reject: 0,
    };
    for (const r of all) t[bucket(r.verdict)] = (t[bucket(r.verdict)] ?? 0) + 1;
    // The 20 most-scanned barcodes of the brand: what a shopper would scan.
    const top = [...all]
      .sort((a, b) => b.scans - a.scans || (a.gtin < b.gtin ? -1 : 1))
      .slice(0, 20);
    t.top20_usda = top.filter((r) => r.verdict === "in-usda").length;
    t.top20_accept = top.filter((r) => r.verdict === "accept").length;
    t.top20_review = top.filter((r) => r.verdict === "review").length;
    brands[label] = t;
  }
  // The 200 most-scanned US/Canada products overall: a "supermarket" probe.
  const top = [...rows]
    .sort((a, b) => b.scans - a.scans || (a.gtin < b.gtin ? -1 : 1))
    .slice(0, 200);
  const supermarket: Record<string, number> = {};
  for (const r of top)
    supermarket[bucket(r.verdict)] = (supermarket[bucket(r.verdict)] ?? 0) + 1;
  const drPepper = rows
    .filter((r) => /^0007800008/.test(r.gtin) || /^000780000[34]/.test(r.gtin))
    .filter((r) => /pepper/i.test(r.name))
    .map(
      (r) =>
        `${r.gtin} ${bucket(r.verdict)} ${r.name}${r.verdict === "review" || r.verdict === "reject" ? ` [${r.reasons.split(";")[0]}]` : ""}`,
    );
  return { brands, supermarketTop200: supermarket, drPepper };
}

const usdaHits = sample(
  usdaFile,
  "SELECT gtin AS g FROM barcode ORDER BY (gtin % 1000003), gtin LIMIT ?",
  2000,
);
const offHits = sample(
  offFile,
  "SELECT gtin AS g FROM product ORDER BY (gtin % 1000003), gtin LIMIT ?",
  2000,
);
const queries = [
  "quest",
  "chomps",
  "fairlife",
  "celsius",
  "ghost",
  "barebells",
  "prime",
  "dr pepper",
  "chicken",
  "ch",
  "protein bar",
  "greek yogurt",
];
const result = {
  note: "Desktop timings (node:sqlite on Windows, NVMe); NOT iPhone measurements. Search uses a simplified FTS prefix query on both files, not the app's ranked plan.",
  sizes: {
    usda: sizes(usdaFile),
    offAccept: sizes(offFile),
    offAcceptPlusReview: sizes(reviewFile),
  },
  barcode: {
    usda: lookups(
      usdaFile,
      "SELECT product FROM barcode WHERE gtin = ?",
      usdaHits,
    ),
    offAccept: lookups(
      offFile,
      "SELECT id FROM product WHERE gtin = ?",
      offHits,
    ),
  },
  search: {
    usda: searches(usdaFile, queries),
    offAccept: searches(offFile, queries),
  },
  probe: probe(),
};
console.log(JSON.stringify(result, null, 1));
