// Builds the bundled branded-food catalogue from the pinned USDA release.
//
//   npm run branded:build             download if needed, verify, build the
//                                     catalogue, the manifest and the report
//   npm run branded:build -- --offline   use the cached archive only
//   npm run branded:check             rebuild into a temporary file and fail
//                                     unless its content digest matches the
//                                     committed manifest (writes nothing)
//   npm run branded:ensure            make sure the app's catalogue asset is
//                                     present and matches the manifest;
//                                     builds it only when it isn't (run
//                                     before start, export and EAS builds)
//
// The USDA archive is cached in .cache/branded-catalog (gitignored) and
// checked against the size and SHA-256 pinned in sources.json. The 59 MB
// catalogue (assets/catalog, gitignored) is generated, never committed: the
// committed manifest pins its content digest, which is the same on every
// machine (file bytes may differ between SQLite versions; contents can't).
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import {
  BRANDED_SCHEMA,
  brandedCatalogVersion,
} from "../../src/domain/branded";
import { writeCatalog } from "./catalog-db";
import {
  REASONS,
  deduplicate,
  judge,
  type Accepted,
  type Flag,
  type Reason,
} from "./rules";
import { listZipFile, zipLines } from "./zip-stream";

const root = join(__dirname, "..", "..");
const cache = join(root, ".cache", "branded-catalog");
const assetDir = join(root, "assets", "catalog");
const manifestFile = join(root, "src", "data", "branded-catalog.manifest.json");
const reportDir = join(root, "docs", "branded-catalog");
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const check = args.includes("--check");
const ensure = args.includes("--ensure");

type Source = {
  release: string;
  label: string;
  url: string;
  bytes: number;
  sha256: string;
  member: string;
  root: string;
  attribution: string;
};
const source = JSON.parse(
  readFileSync(join(__dirname, "sources.json"), "utf8"),
) as Source;
const assetName = `usda-branded-${source.release}.db`;
const assetFile = join(assetDir, assetName);

export type Manifest = {
  generatedBy: string;
  schema: number;
  release: string;
  catalog: string;
  file: string;
  contentSha256: string;
  products: number;
  barcodes: number;
  brands: number;
  categories: number;
  perHundredMl: number;
  /** Smart servings (Phase 7.3F.1): where each serving name comes from. */
  servings: {
    sources: Record<string, number>;
    householdKinds: Record<string, number>;
    labels: number;
    wholePackage: number;
  };
  source: Omit<Source, "member" | "root"> & { records: number };
  reference: { bytes: number; sha256: string; sqlite: string; node: string };
};

async function fileSha256(file: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function archive() {
  const file = join(cache, basename(new URL(source.url).pathname));
  if (!existsSync(file)) {
    if (offline) throw new Error(`Not cached: ${file} (run without --offline)`);
    console.log(`Downloading ${source.url} (${source.bytes} bytes)`);
    const res = await fetch(source.url);
    if (!res.ok || !res.body)
      throw new Error(`${source.url}: HTTP ${res.status}`);
    mkdirSync(cache, { recursive: true });
    const partial = `${file}.partial`;
    await pipeline(
      Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(partial),
    );
    renameSync(partial, file);
  }
  const size = statSync(file).size;
  if (size !== source.bytes)
    throw new Error(`${file}: ${size} bytes, pinned ${source.bytes}`);
  const hash = await fileSha256(file);
  if (hash !== source.sha256)
    throw new Error(`${file}: SHA-256 ${hash} does not match the pin`);
  const entries = listZipFile(file);
  if (entries.length !== 1 || entries[0]!.name !== source.member)
    throw new Error(
      `Unexpected archive members: ${entries.map((e) => e.name).join(", ")}`,
    );
  return { file, entry: entries[0]! };
}

/** Streams every record through the rules. */
async function curate() {
  const { file, entry } = await archive();
  const accepted: Accepted[] = [];
  const excluded: { fdcId: number; reason: Reason }[] = [];
  let records = 0;
  let sawRoot = false;
  for await (const raw of zipLines(file, entry)) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith(`{"${source.root}"`)) {
      sawRoot = true;
      continue;
    }
    if (line === "]}" || line === "]" || line === "}") continue;
    // Each product is one line; the last one shares its line with "]}".
    if (line.endsWith(",")) line = line.slice(0, -1);
    else if (line.endsWith("}]}")) line = line.slice(0, -2);
    records++;
    const f = JSON.parse(line) as Record<string, unknown>;
    const out = judge(f);
    if ("reason" in out)
      excluded.push({ fdcId: Number(f.fdcId), reason: out.reason });
    else accepted.push(out.product);
  }
  if (!sawRoot) throw new Error(`Root "${source.root}" not found`);
  return { records, accepted, excluded };
}

const sortedRecord = (r: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(r).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );

const tally = <T>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
};

function report(
  manifest: Manifest,
  passed: number,
  excluded: { fdcId: number; reason: Reason }[],
  superseded: ReturnType<typeof deduplicate>["superseded"],
  flags: [string, number][],
) {
  const byGtin = superseded.filter((s) => s.gtin).length;
  const md = [
    "# FORGE branded-food catalogue: build report",
    "",
    "_Generated by `npm run branded:build`. Do not edit by hand._",
    "",
    `Source: ${source.label}, release **${source.release}** (${source.bytes.toLocaleString("en-US")} bytes, SHA-256 \`${source.sha256}\`).`,
    "",
    "| Step | Records |",
    "| --- | ---: |",
    `| Products in the release | ${manifest.source.records.toLocaleString("en-US")} |`,
    `| Excluded by the rules | ${excluded.length.toLocaleString("en-US")} |`,
    `| Passed the rules | ${passed.toLocaleString("en-US")} |`,
    `| Older version of the same barcode | ${byGtin.toLocaleString("en-US")} |`,
    `| Exact duplicate without a barcode | ${(superseded.length - byGtin).toLocaleString("en-US")} |`,
    `| **Catalogue products** | **${manifest.products.toLocaleString("en-US")}** |`,
    `| … with a barcode | ${manifest.barcodes.toLocaleString("en-US")} |`,
    `| … per 100 ml | ${manifest.perHundredMl.toLocaleString("en-US")} |`,
    "",
    "## Exclusions by reason",
    "",
    "| Reason | Records |",
    "| --- | ---: |",
    ...tally(excluded, (e) => e.reason).map(
      ([r, n]) => `| ${REASONS[r as Reason]} | ${n.toLocaleString("en-US")} |`,
    ),
    "",
    "Every excluded FDC ID is listed with its reason in [excluded.tsv](excluded.tsv); every superseded record with the product kept in [superseded.tsv](superseded.tsv).",
    "",
    "## Flags on accepted records",
    "",
    "| Flag | Records |",
    "| --- | ---: |",
    ...flags.map(([f, n]) => `| ${f} | ${n.toLocaleString("en-US")} |`),
    "",
    `Barcode versions whose values conflicted (newest kept): ${superseded.filter((s) => s.conflict).length.toLocaleString("en-US")}.`,
    "",
    "## Servings (Phase 7.3F.1)",
    "",
    "Every product offers one manufacturer serving (its metric serving). Its name comes from:",
    "",
    "| Source | Products | Share |",
    "| --- | ---: | ---: |",
    ...Object.entries(manifest.servings.sources).map(
      ([k, n]) =>
        `| ${SOURCE_NAMES[k] ?? k} | ${n.toLocaleString("en-US")} | ${((100 * n) / manifest.products).toFixed(1)}% |`,
    ),
    "",
    `Whole-package option (a package of 1.1–4.5 servings): ${manifest.servings.wholePackage.toLocaleString("en-US")} products. Distinct serving names: ${manifest.servings.labels.toLocaleString("en-US")}.`,
    "",
    "How the household text read:",
    "",
    "| Household text | Products |",
    "| --- | ---: |",
    ...Object.entries(manifest.servings.householdKinds).map(
      ([k, n]) => `| ${k} | ${n.toLocaleString("en-US")} |`,
    ),
    "",
    "## Identity",
    "",
    `- Content digest (all rows, any SQLite version): \`${manifest.contentSha256}\``,
    `- Reference file: ${manifest.reference.bytes.toLocaleString("en-US")} bytes, SHA-256 \`${manifest.reference.sha256}\` (SQLite ${manifest.reference.sqlite}, Node ${manifest.reference.node})`,
    `- Brands ${manifest.brands.toLocaleString("en-US")}, categories ${manifest.categories}, schema ${manifest.schema}`,
    "",
  ].join("\n");
  const excludedTsv = [
    "fdc_id\treason",
    ...[...excluded]
      .sort((a, b) => a.fdcId - b.fdcId)
      .map((e) => `${e.fdcId}\t${e.reason}`),
  ].join("\n");
  const supersededTsv = [
    "superseded_fdc_id\tkept_fdc_id\tgtin\tvalues_conflict",
    ...superseded.map(
      (s) =>
        `${s.superseded}\t${s.kept}\t${s.gtin ?? ""}\t${s.conflict ? 1 : 0}`,
    ),
  ].join("\n");
  return {
    md,
    excludedTsv: `${excludedTsv}\n`,
    supersededTsv: `${supersededTsv}\n`,
  };
}

const SOURCE_NAMES: Record<string, string> = {
  label: 'Named unit from the label ("1 stick")',
  measure: 'Household measure from the label ("1/2 cup")',
  about: 'Recovered "about N units"',
  sibling: "Named unit from another listing of the same product",
  package: 'Single-serve package ("1 package")',
  serving: '"1 serving" (metric serving only)',
};

function readManifest() {
  return existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest)
    : undefined;
}

/** Whether a catalogue file is complete and has the manifest's contents. */
function matches(file: string, manifest: Manifest) {
  if (!existsSync(file)) return "missing";
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const pages = db.prepare("PRAGMA page_count").get() as {
        page_count: number;
      };
      const size = db.prepare("PRAGMA page_size").get() as {
        page_size: number;
      };
      if (pages.page_count * size.page_size !== statSync(file).size)
        return "incomplete";
      const stored = db
        .prepare("SELECT value FROM meta WHERE key = 'contentSha256'")
        .get() as { value: string } | undefined;
      return stored?.value === manifest.contentSha256 ? "ok" : "different";
    } finally {
      db.close();
    }
  } catch {
    return "unreadable";
  }
}

async function main() {
  const committed = readManifest();
  if (ensure) {
    if (!committed) throw new Error(`No manifest at ${manifestFile}`);
    const state = matches(assetFile, committed);
    if (state === "ok") {
      console.log(`Branded catalogue ready: ${assetName}`);
      return;
    }
    console.log(`Branded catalogue ${state}; building ${assetName}`);
  }
  const started = Date.now();
  const { records, accepted, excluded } = await curate();
  const { products, superseded } = deduplicate(accepted);
  const flags = tally(
    products.flatMap((p) => p.flags),
    (f: Flag) => f,
  );
  const out = check
    ? join(tmpdir(), `branded-check-${process.pid}.db`)
    : assetFile;
  mkdirSync(join(out, ".."), { recursive: true });
  const written = writeCatalog(out, products, {
    release: source.release,
    catalog: brandedCatalogVersion(source.release),
    source: source.label,
    sourceUrl: source.url,
    sourceSha256: source.sha256,
    records,
  });
  const reference = {
    bytes: statSync(out).size,
    sha256: await fileSha256(out),
    sqlite: String(process.versions.sqlite),
    node: process.versions.node,
  };
  const manifest: Manifest = {
    generatedBy: "scripts/branded-catalog/build.ts",
    schema: BRANDED_SCHEMA,
    release: source.release,
    catalog: brandedCatalogVersion(source.release),
    file: assetName,
    contentSha256: written.digest,
    products: written.products,
    barcodes: written.barcodes,
    brands: written.brands,
    categories: written.categories,
    perHundredMl: written.perHundredMl,
    servings: {
      sources: sortedRecord(written.servingSources),
      householdKinds: sortedRecord(written.householdKinds),
      labels: written.servingLabels,
      wholePackage: written.wholePackage,
    },
    source: {
      release: source.release,
      label: source.label,
      url: source.url,
      bytes: source.bytes,
      sha256: source.sha256,
      attribution: source.attribution,
      records,
    },
    reference,
  };
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (check || ensure) {
    if (check) rmSync(out, { force: true });
    if (!committed) throw new Error("No committed manifest to compare with");
    if (written.digest !== committed.contentSha256) {
      if (ensure) rmSync(out, { force: true });
      throw new Error(
        `Content digest ${written.digest} differs from the manifest (${committed.contentSha256})`,
      );
    }
    const same = reference.sha256 === committed.reference.sha256;
    console.log(
      `Branded catalogue reproduced in ${seconds}s: ${written.products} products, ${written.barcodes} barcodes, content ${written.digest}; file ${same ? "byte-identical to the reference" : `differs from the reference bytes (SQLite ${reference.sqlite} vs ${committed.reference.sqlite}), contents identical`}.`,
    );
    return;
  }
  const { md, excludedTsv, supersededTsv } = report(
    manifest,
    accepted.length,
    excluded,
    superseded,
    flags,
  );
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(reportDir, "BUILD_REPORT.md"), md);
  writeFileSync(join(reportDir, "excluded.tsv"), excludedTsv);
  writeFileSync(join(reportDir, "superseded.tsv"), supersededTsv);
  console.log(
    `Built ${assetName} in ${seconds}s: ${written.products} products, ${written.barcodes} barcodes, ${reference.bytes} bytes, content ${written.digest}.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
