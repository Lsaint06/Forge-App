// Phase 7.3F.2 M3.1 research prototype (NOT shipped). Builds a standalone,
// Open Food Facts-only SQLite catalogue of US/Canada products the bundled
// USDA catalogue lacks, under scripts/research/off-coverage/rules.ts, and a
// reproducible coverage report. Everything is written to
// .cache/off-research/ (gitignored); nothing is read by the app, and the
// USDA catalogue is only read.
//
//   npx tsx scripts/research/off-coverage/build.ts [--limit N]
//
// Inputs: the pinned OFF snapshot (snapshot.json, verified by SHA-256 while
// streaming), the cached USDA release (scripts/branded-catalog/sources.json)
// and the built USDA catalogue (assets/catalog/*.db).
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { createGunzip } from "node:zlib";
import { catalogKey } from "../../../src/domain/branded";
import { deduplicate, judge } from "../../branded-catalog/rules";
import { listZipFile, zipLines } from "../../branded-catalog/zip-stream";
import {
  RULES_VERSION,
  judgeOff,
  sameValues,
  usCanadaGtin,
  type Candidate,
  type Judgement,
  type Verdict,
} from "./rules";
import { gtin14 } from "../../../src/domain/barcode";

const root = join(__dirname, "..", "..", "..");
const out = join(root, ".cache", "off-research");
const pin = JSON.parse(
  readFileSync(join(__dirname, "snapshot.json"), "utf8"),
) as {
  url: string;
  file: string;
  lastModified: string;
  snapshot: string;
  bytes: number;
  sha256: string;
  license: string;
  contentsLicense: string;
  attribution: string;
};
const usdaSource = JSON.parse(
  readFileSync(
    join(root, "scripts", "branded-catalog", "sources.json"),
    "utf8",
  ),
) as { release: string; member: string; url: string };
const usdaZip = join(
  root,
  ".cache",
  "branded-catalog",
  usdaSource.url.split("/").pop()!,
);
const usdaDb = join(
  root,
  "assets",
  "catalog",
  `usda-branded-${usdaSource.release}.db`,
);
const limitArg = process.argv.indexOf("--limit");
const limit =
  limitArg > 0 ? Number(process.argv[limitArg + 1]) : Number.POSITIVE_INFINITY;

type Tally = Map<string, number>;
const tally = () => new Map<string, number>();
const inc = (t: Tally, k: string, n = 1) => t.set(k, (t.get(k) ?? 0) + n);
const sorted = (t: Tally) =>
  Object.fromEntries(
    [...t].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
  );

/** USDA's fate for every valid GTIN in the pinned release (production rules). */
async function usdaStatus() {
  const [entry] = listZipFile(usdaZip);
  const status = new Map<string, string>();
  const accepted = [];
  for await (const raw of zipLines(usdaZip, entry!)) {
    let line = raw.trim();
    if (!line || line.startsWith('{"BrandedFoods"') || /^[\]}]+$/.test(line))
      continue;
    if (line.endsWith(",")) line = line.slice(0, -1);
    else if (line.endsWith("}]}")) line = line.slice(0, -2);
    const f = JSON.parse(line) as Record<string, unknown>;
    const r = judge(f);
    if ("reason" in r) {
      const g = gtin14(String(f.gtinUpc ?? "").trim());
      if (g && !status.has(g)) status.set(g, `excluded:${r.reason}`);
    } else accepted.push(r.product);
  }
  for (const p of deduplicate(accepted).products)
    if (p.gtin) status.set(p.gtin, "catalog");
  return status;
}

/** USDA catalogue values per 100 for overlap agreement (read-only). */
function usdaValues() {
  const db = new DatabaseSync(usdaDb, { readOnly: true });
  const values = new Map<string, [number, number, number, number, number]>();
  for (const r of db
    .prepare(
      "SELECT b.gtin AS g, p.basis, p.kcal, p.protein, p.carbs, p.fat FROM barcode b JOIN product p ON p.id = b.product",
    )
    .iterate() as Iterable<Record<string, number>>)
    values.set(String(r.g).padStart(14, "0"), [
      r.basis!,
      r.kcal! / 1000,
      r.protein! / 1000,
      r.carbs! / 1000,
      r.fat! / 1000,
    ]);
  db.close();
  return values;
}

type Kept = { j: Judgement; records: number; conflict: boolean; scans: number };

async function main() {
  mkdirSync(out, { recursive: true });
  const snapshot = join(out, pin.file);
  if (!existsSync(snapshot))
    throw new Error(`Missing snapshot ${snapshot}; download ${pin.url}`);
  const started = Date.now();
  console.log("USDA: classifying the pinned release…");
  const usda = await usdaStatus();
  const usdaVals = usdaValues();
  console.log(`USDA: ${usda.size} GTINs; streaming OFF ${pin.snapshot}…`);

  const hash = createHash("sha256");
  let bytes = 0;
  let reading = true;
  const raw = createReadStream(snapshot, { highWaterMark: 1 << 22 });
  raw.on("data", (c) => {
    if (!reading) return;
    hash.update(c as Buffer);
    bytes += (c as Buffer).length;
  });
  const lines = createInterface({
    input: raw.pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  const T = {
    scope: tally(),
    verdict: tally(),
    firstReason: tally(),
    anyReason: tally(),
    acceptSource: tally(),
    agreement: tally(),
    scans: tally(),
    basis: tally(),
    servingLabel: tally(),
  };
  const kept = new Map<string, Kept>();
  let records = 0;
  let us = 0;
  for await (const line of lines) {
    if (++records > limit) break;
    if (!line.includes('"en:united-states"')) continue;
    let p: Record<string, unknown>;
    try {
      p = JSON.parse(line) as Record<string, unknown>;
    } catch {
      inc(T.scope, "malformed JSON");
      continue;
    }
    if (!((p.countries_tags ?? []) as string[]).includes("en:united-states"))
      continue;
    us++;
    const g = gtin14(String(p.code ?? ""));
    if (!g) {
      inc(T.scope, "invalid GTIN");
      continue;
    }
    if (!usCanadaGtin(g)) {
      inc(T.scope, "outside US/Canada GS1 prefixes");
      continue;
    }
    const status = usda.get(g);
    const j = judgeOff(p, status);
    const scans = Number(p.unique_scans_n) || 0;
    const prev = kept.get(g);
    if (!prev) {
      kept.set(g, { j, records: 1, conflict: false, scans });
      continue;
    }
    // One record per barcode: the newest wins; disagreeing values → review.
    prev.records++;
    prev.scans += scans;
    const a = prev.j.candidate;
    const b = j.candidate;
    if (a && b && !sameValues(a, b)) prev.conflict = true;
    if ((b?.modified ?? 0) > (a?.modified ?? 0)) prev.j = j;
  }
  reading = false;
  raw.destroy();
  if (Number.isFinite(limit) === false && bytes !== pin.bytes)
    throw new Error(`Snapshot size ${bytes} ≠ pinned ${pin.bytes}`);
  const sha = hash.digest("hex");
  const verified = Number.isFinite(limit)
    ? "partial read (--limit)"
    : sha === pin.sha256
      ? "verified"
      : "MISMATCH";
  if (verified === "MISMATCH")
    throw new Error(`Snapshot SHA-256 ${sha} ≠ pinned ${pin.sha256}`);

  // Final verdicts, overlap agreement and popularity weighting.
  const accepted: Candidate[] = [];
  const reviewed: Candidate[] = [];
  const rows = createWriteStream(join(out, "candidates.tsv"));
  rows.write(
    "gtin\tusda\tverdict\treasons\tname\tbrand\tbasis\tserving\tserving_label\tkcal\tprotein\tcarbs\tfat\tsource\tphoto\tproducer\tscans\trecords\n",
  );
  for (const [g, k] of [...kept].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const status = usda.get(g);
    let verdict: Verdict = k.j.verdict;
    const reasons = [...k.j.reasons];
    if (k.conflict && verdict !== "reject") {
      verdict = "review";
      reasons.push("conflicting duplicate OFF records");
    }
    const c = k.j.candidate;
    const row = (verdict: string, reasons: string[]) =>
      rows.write(
        [
          g,
          status ?? "",
          verdict,
          reasons.join("; "),
          c?.name ?? "",
          c?.brand ?? "",
          c?.basis ?? "",
          c?.serving ?? "",
          c?.servingLabel ?? "",
          c ? c.kcal.toFixed(2) : "",
          c ? c.protein : "",
          c ? c.carbs : "",
          c ? c.fat : "",
          c?.valueSource ?? "",
          c?.photo ? 1 : 0,
          c?.producer ? 1 : 0,
          k.scans,
          k.records,
        ]
          .map((v) => String(v).replace(/[\t\r\n]+/g, " "))
          .join("\t") + "\n",
      );
    if (status === "catalog") {
      row("in-usda", [`policy: ${verdict}`]);
      // Already in Forge: not added. How would the policy have done?
      inc(T.scope, "already in USDA catalogue");
      inc(T.scans, "usda", k.scans);
      const u = usdaVals.get(g);
      if (c && u && verdict !== "reject") {
        const near = (x: number, y: number, floor: number) =>
          Math.abs(x - y) <= Math.max(floor, 0.1 * Math.max(x, y));
        const basis = u[0] === 1 ? "ml" : "g";
        const agree =
          basis === c.basis &&
          near(u[1], c.kcal, 5) &&
          near(u[2], c.protein, 1) &&
          near(u[3], c.carbs, 1) &&
          near(u[4], c.fat, 1);
        const gross =
          Math.abs(u[1] - c.kcal) > Math.max(20, 0.33 * Math.max(u[1], c.kcal));
        inc(
          T.agreement,
          `${verdict}:${agree ? "agree" : gross ? "gross" : "differs"}`,
        );
        if (basis !== c.basis) inc(T.agreement, `${verdict}:basis-differs`);
      }
      continue;
    }
    inc(T.scope, "not in USDA catalogue");
    inc(T.verdict, verdict);
    inc(T.scans, verdict, k.scans);
    if (reasons.length)
      inc(T.firstReason, `${verdict}: ${reasons[0]!.replace(/: en:.*$/, "")}`);
    for (const r of new Set(reasons.map((x) => x.replace(/: en:.*$/, ""))))
      inc(T.anyReason, `${verdict}: ${r}`);
    if (c && verdict === "accept") {
      accepted.push(c);
      inc(
        T.acceptSource,
        `${c.valueSource}${c.photo ? "+photo" : ""}${c.producer ? "+producer" : ""}`,
      );
      inc(T.basis, c.basis);
      inc(
        T.servingLabel,
        c.servingLabel === "1 serving" ? "1 serving" : "named",
      );
    }
    if (c && verdict === "review") reviewed.push(c);
    row(verdict, reasons);
  }
  rows.end();
  await new Promise<void>((ok) => rows.on("finish", () => ok()));

  const meta = {
    source: "Open Food Facts",
    url: pin.url,
    snapshot: pin.snapshot,
    snapshotLastModified: pin.lastModified,
    snapshotSha256: pin.sha256,
    license: pin.license,
    contentsLicense: pin.contentsLicense,
    attribution: pin.attribution,
    rules: RULES_VERSION,
    usdaRelease: usdaSource.release,
    scope:
      "US-tagged products with US/Canada GS1 prefixes, absent from the USDA catalogue",
  };
  const acceptDb = writeDb(join(out, `off-us-${pin.snapshot}.db`), accepted, {
    ...meta,
    tier: "accept",
  });
  const reviewDb = writeDb(
    join(out, `off-us-${pin.snapshot}-with-review.db`),
    [...accepted, ...reviewed],
    { ...meta, tier: "accept+review (size estimate only)" },
  );
  const report = {
    meta,
    snapshotRead: verified,
    records,
    usTagged: us,
    uniqueInScopeGtins: kept.size,
    scope: sorted(T.scope),
    verdict: sorted(T.verdict),
    firstReason: sorted(T.firstReason),
    anyReason: sorted(T.anyReason),
    acceptSource: sorted(T.acceptSource),
    acceptBasis: sorted(T.basis),
    acceptServingLabel: sorted(T.servingLabel),
    overlapAgreementWithUsda: sorted(T.agreement),
    scanWeight: sorted(T.scans),
    databases: { accept: acceptDb, acceptPlusReview: reviewDb },
    usdaCatalogueBytes: statSync(usdaDb).size,
  };
  const reportFile = join(out, "report.json");
  createWriteStream(reportFile).end(JSON.stringify(report, null, 1));
  console.log(
    JSON.stringify(
      { ...report, firstReason: undefined, anyReason: undefined },
      null,
      1,
    ),
  );
  console.log(
    `Done in ${Math.round((Date.now() - started) / 1000)} s → ${reportFile}`,
  );
}

const scaled = (v: number) => Math.round(v * 1000);

/** A standalone catalogue: schema "off-research-1", deterministic order. */
function writeDb(
  file: string,
  products: Candidate[],
  meta: Record<string, string>,
) {
  for (const f of [file, `${file}-journal`]) if (existsSync(f)) rmSync(f);
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE brand(id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL);
CREATE INDEX brand_key ON brand(key);
CREATE TABLE serving_label(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
-- basis 0 = per 100 g, 1 = per 100 ml; values ×1000; serving NULL when unstated.
-- source 0 manufacturer, 1 packaging, 2 legacy; evidence bit 1 photo, bit 2 producer.
CREATE TABLE product(id INTEGER PRIMARY KEY, gtin INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL, brand INTEGER NOT NULL, basis INTEGER NOT NULL,
  serving INTEGER, serving_label INTEGER NOT NULL, kcal INTEGER NOT NULL,
  protein INTEGER NOT NULL, carbs INTEGER NOT NULL, fat INTEGER NOT NULL,
  source INTEGER NOT NULL, evidence INTEGER NOT NULL, modified INTEGER NOT NULL);
CREATE VIEW product_text(id, name, brand) AS
  SELECT p.id, p.name, b.name FROM product p JOIN brand b ON b.id = p.brand;
CREATE VIRTUAL TABLE product_fts USING fts5(name, brand, content='product_text',
  content_rowid='id', tokenize="unicode61 remove_diacritics 2", detail=column);`);
  const order = [...products].sort(
    (a, b) =>
      (a.servingLabel === "1 serving" ? 1 : 0) -
        (b.servingLabel === "1 serving" ? 1 : 0) ||
      a.name.split(/\s+/).length - b.name.split(/\s+/).length ||
      (a.gtin < b.gtin ? -1 : 1),
  );
  const brands = new Map<string, number>();
  const labels = new Map<string, number>();
  const id = (m: Map<string, number>, k: string) => {
    if (!m.has(k)) m.set(k, m.size + 1);
    return m.get(k)!;
  };
  db.exec("BEGIN");
  const put = db.prepare(
    "INSERT INTO product VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  order.forEach((p, i) =>
    put.run(
      i + 1,
      Number(p.gtin),
      p.name,
      id(brands, p.brand),
      p.basis === "ml" ? 1 : 0,
      p.serving === undefined ? null : scaled(p.serving),
      id(labels, p.servingLabel),
      scaled(p.kcal),
      scaled(p.protein),
      scaled(p.carbs),
      scaled(p.fat),
      p.valueSource === "manufacturer"
        ? 0
        : p.valueSource === "packaging"
          ? 1
          : 2,
      (p.photo ? 1 : 0) | (p.producer ? 2 : 0),
      p.modified,
    ),
  );
  const putBrand = db.prepare("INSERT INTO brand VALUES(?,?,?)");
  for (const [name, i] of brands) putBrand.run(i, name, catalogKey(name));
  const putLabel = db.prepare("INSERT INTO serving_label VALUES(?,?)");
  for (const [name, i] of labels) putLabel.run(i, name);
  db.exec("INSERT INTO product_fts(product_fts) VALUES('rebuild')");
  // Content digest: every row, canonically (as the USDA catalogue does).
  const hash = createHash("sha256");
  for (const t of ["brand", "serving_label", "product"])
    for (const row of db.prepare(`SELECT * FROM ${t} ORDER BY id`).iterate())
      hash.update(`${JSON.stringify(Object.values(row as object))}\n`);
  const digest = hash.digest("hex");
  const putMeta = db.prepare("INSERT INTO meta VALUES(?,?)");
  for (const [k, v] of Object.entries({
    ...meta,
    products: String(products.length),
    contentSha256: digest,
  }))
    putMeta.run(k, v);
  db.exec("COMMIT");
  db.exec("VACUUM");
  db.close();
  return {
    file,
    products: products.length,
    bytes: statSync(file).size,
    contentSha256: digest,
  };
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
