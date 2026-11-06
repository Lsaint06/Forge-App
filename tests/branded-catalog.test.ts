import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { writeCatalog } from "../scripts/branded-catalog/catalog-db";
import { judge, type Accepted } from "../scripts/branded-catalog/rules";
import {
  BROAD,
  PAGE,
  byBarcode,
  loadCategories,
  metaProblem,
  plan,
  readMeta,
  search,
  type Expected,
  type Runner,
} from "../src/data/branded-query";
import {
  BrandedCatalogError,
  installAndOpen,
  type Connection,
  type InstallDeps,
} from "../src/data/branded-install";
import { BRANDED_SCHEMA, catalogKey } from "../src/domain/branded";
import manifest from "../src/data/branded-catalog.manifest.json";

// Phase 7.3E: the bundled branded catalogue's data layer. Fixture
// catalogues are written by the real build code; the real catalogue (when
// built) runs the ranking acceptance set.

const connect = (file: string): Connection => {
  const db = new DatabaseSync(file);
  return {
    all: async (sql, p) => db.prepare(sql).all(...p) as never,
    get: async (sql, p) => (db.prepare(sql).get(...p) ?? null) as never,
    exec: async (sql) => {
      db.exec(sql);
    },
    close: async () => db.close(),
  };
};

/** A product as the build would accept it. */
function product(
  fdcId: number,
  name: string,
  brand: string,
  over: Record<string, unknown> = {},
): Accepted {
  const out = judge({
    fdcId,
    description: name,
    brandName: brand,
    marketCountry: "United States",
    servingSize: 60,
    servingSizeUnit: "g",
    householdServingFullText: "1 BAR",
    brandedFoodCategory: "Snack, Energy & Granola Bars",
    publicationDate: "4/30/2026",
    foodNutrients: [
      { nutrient: { id: 1008 }, amount: 350 },
      { nutrient: { id: 1003 }, amount: 35 },
      { nutrient: { id: 1005 }, amount: 36.7 },
      { nutrient: { id: 1004 }, amount: 13.3 },
    ],
    ...over,
  });
  assert.ok("product" in out, `${name}: ${JSON.stringify(out)}`);
  return out.product;
}

const FIXTURE = [
  product(1, "SEA QUEST EGG HUNT", "BEE", {
    brandedFoodCategory: "Candy",
    gtinUpc: "036000291452",
  }),
  product(2, "PROTEIN BAR, COOKIES & CREAM", "QUEST", {
    gtinUpc: "888849000708",
  }),
  product(3, "PROTEIN BAR, BIRTHDAY CAKE", "QUEST BAR"),
  product(4, "FRUIT & NUT BAR", "KIND"),
  product(5, "CHOCOLATE BAR", "KINDER", { brandedFoodCategory: "Candy" }),
  product(6, "SHRIMP", "CHICKEN OF THE SEA", {
    brandedFoodCategory: "Frozen Fish & Seafood",
  }),
  product(7, "CHICKEN BREAST", "WEGMANS", {
    brandedFoodCategory: "Poultry",
    householdServingFullText: "4 ONZ",
    servingSize: 112,
  }),
  product(8, "BANANA", "BETTER'N PEANUT BUTTER", {
    brandedFoodCategory: "Nut & Seed Butters",
  }),
  product(9, "PEANUT BUTTER", "TEDDIE", {
    brandedFoodCategory: "Nut & Seed Butters",
  }),
  product(10, "WHOLE ULTRA-FILTERED MILK", "FAIRLIFE", {
    brandedFoodCategory: "Milk",
    servingSizeUnit: "MLT",
    servingSize: 240,
    householdServingFullText: "1 cup (240 mL)",
    // Published as UPC-A; a scanner may read the same code as UPC-E.
    gtinUpc: "042100005264",
    foodNutrients: [
      { nutrient: { id: 1008 }, amount: 62.5 },
      { nutrient: { id: 1003 }, amount: 5.42 },
      { nutrient: { id: 1005 }, amount: 2.5 },
      { nutrient: { id: 1004 }, amount: 3.33 },
    ],
  }),
];

function fixture(extra: Accepted[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "branded-cat-"));
  const file = join(dir, "catalog.db");
  const written = writeCatalog(file, [...FIXTURE, ...extra], {
    release: "test",
  });
  const expected: Expected = {
    schema: BRANDED_SCHEMA,
    release: "test",
    contentSha256: written.digest,
    products: written.products,
  };
  return { dir, file, expected };
}

async function withCatalog(
  fn: (
    db: Runner,
    categories: Awaited<ReturnType<typeof loadCategories>>,
  ) => Promise<void>,
  extra: Accepted[] = [],
) {
  const { dir, file } = fixture(extra);
  const db = connect(file);
  try {
    await fn(db, await loadCategories(db));
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const names = (rows: { brand: string; name: string }[]) =>
  rows.map((r) => `${r.brand} | ${r.name}`);

test("the brand a query names leads: Quest above Sea Quest, KIND above KINDER", () =>
  withCatalog(async (db, cats) => {
    const quest = await search(db, (await plan(db, "quest", cats))!);
    assert.deepEqual(names(quest.products.slice(0, 2)), [
      "QUEST | PROTEIN BAR, COOKIES & CREAM",
      "QUEST BAR | PROTEIN BAR, BIRTHDAY CAKE",
    ]);
    assert.equal(quest.products.at(-1)?.brand, "BEE");
    const kind = await search(db, (await plan(db, "kind bar", cats))!);
    assert.equal(kind.products[0]?.brand, "KIND");
    const sea = await search(db, (await plan(db, "sea quest", cats))!);
    assert.equal(sea.products[0]?.brand, "BEE", "asking for it still finds it");
  }));

test("chicken never leads with Chicken of the Sea; a brand being typed does lead", () =>
  withCatalog(async (db, cats) => {
    const chicken = await search(db, (await plan(db, "chicken", cats))!);
    assert.equal(chicken.products[0]?.name, "CHICKEN BREAST");
    const fairl = await search(db, (await plan(db, "fairl", cats))!);
    assert.equal(fairl.products[0]?.brand, "FAIRLIFE");
  }));

test("products named with every word lead those matched only through their brand", () =>
  withCatalog(async (db, cats) => {
    const pb = await search(db, (await plan(db, "peanut butter", cats))!);
    assert.deepEqual(names(pb.products), [
      "TEDDIE | PEANUT BUTTER",
      "BETTER'N PEANUT BUTTER | BANANA",
    ]);
  }));

test("short queries and FTS syntax are inert", () =>
  withCatalog(async (db, cats) => {
    assert.equal(await plan(db, "c", cats), null);
    assert.equal(await plan(db, " - ", cats), null);
    const odd = await plan(db, 'quest" OR * NEAR(', cats);
    assert.ok(odd);
    const page = await search(db, odd);
    assert.ok(Array.isArray(page.products));
    assert.equal(catalogKey("Ben & Jerry’s"), "ben and jerrys");
  }));

test("values come back in the product's own unit, exactly as stored", () =>
  withCatalog(async (db, cats) => {
    const milk = (await search(db, (await plan(db, "fairlife", cats))!))
      .products[0]!;
    assert.equal(milk.basis, "ml");
    assert.equal(milk.serving, 240);
    assert.equal(milk.household, "1 cup (240 mL)");
    assert.deepEqual(
      [milk.kcal, milk.protein, milk.carbs, milk.fat],
      [62.5, 5.42, 2.5, 3.33],
    );
    const breast = (await search(db, (await plan(db, "chicken breast", cats))!))
      .products[0]!;
    assert.equal(breast.basis, "g");
    assert.equal(breast.household, "4 oz", "GS1 code in words");
  }));

test("pages are bounded and never repeat; broad counts stop at the cap", () => {
  const many = Array.from({ length: BROAD + 45 }, (_, i) =>
    product(1000 + i, `PRETZEL CRISPS NUMBER ${i}`, "SNACK CO", {
      gtinUpc: "",
    }),
  );
  return withCatalog(async (db, cats) => {
    const p = (await plan(db, "pretzel", cats))!;
    const first = await search(db, p);
    assert.equal(first.products.length, PAGE);
    assert.equal(first.broad, true);
    assert.equal(first.total, BROAD);
    const second = await search(db, p, PAGE, first.total);
    assert.equal(second.products.length, PAGE);
    const ids = new Set(
      [...first.products, ...second.products].map((x) => x.id),
    );
    assert.equal(ids.size, PAGE * 2);
    const last = await search(db, p, BROAD + 30, first.total);
    assert.equal(last.products.length, 15, "the final page holds the rest");
  }, many);
});

test("barcodes: every printed form finds the product; invalid codes find nothing", () =>
  withCatalog(async (db) => {
    for (const code of ["888849000708", "0888849000708", "00888849000708"])
      assert.equal((await byBarcode(db, code))?.fdcId, 2, code);
    assert.equal(await byBarcode(db, "888849000709"), null, "check digit");
    assert.equal(await byBarcode(db, "abc"), null);
    assert.equal(await byBarcode(db, "00012345678905"), null, "unknown");
    // UPC-E only when the scanner says so.
    assert.equal((await byBarcode(db, "04252614", "upc_e"))?.fdcId, 10);
    const quest = await byBarcode(db, "888849000708");
    assert.equal(quest?.gtin, "00888849000708");
    // Lookup is independent of search ranking: the lowest-ranked match.
    assert.equal((await byBarcode(db, "036000291452"))?.brand, "BEE");
  }));

test("metadata must be exactly this build's catalogue", () => {
  const expected: Expected = {
    schema: BRANDED_SCHEMA,
    release: "r",
    contentSha256: "abc",
    products: 2,
  };
  const ok = {
    schema: String(BRANDED_SCHEMA),
    release: "r",
    contentSha256: "abc",
    products: "2",
  };
  assert.equal(metaProblem(ok, expected), undefined);
  assert.match(metaProblem({ ...ok, schema: "2" }, expected)!, /schema 2/);
  assert.match(
    metaProblem({ ...ok, release: "old" }, expected)!,
    /release old/,
  );
  assert.match(
    metaProblem({ ...ok, contentSha256: "x" }, expected)!,
    /contents/,
  );
  assert.match(metaProblem({ ...ok, products: "1" }, expected)!, /1 products/);
  assert.match(metaProblem({}, expected)!, /missing/);
});

/** Install dependencies around a temporary folder and a source asset. */
function installer(asset: string, expected: Expected, dir: string) {
  const target = join(dir, "installed.db");
  const calls = { copies: 0, removes: 0, cleanUps: 0 };
  const deps: InstallDeps = {
    expected,
    bytesNeeded: statSync(asset).size,
    installed: () => ({
      exists: existsSync(target),
      size: existsSync(target) ? statSync(target).size : 0,
    }),
    freeBytes: () => 10 * 1024 ** 3,
    copyAsset: async () => {
      calls.copies++;
      copyFileSync(asset, target);
    },
    remove: async () => {
      calls.removes++;
      rmSync(target, { force: true });
    },
    cleanUp: async () => {
      calls.cleanUps++;
    },
    open: async () => connect(target),
  };
  return { deps, calls, target };
}

test("first use copies the catalogue once, checks it fully, and opens it read-only", async () => {
  const { dir, file, expected } = fixture();
  try {
    const { deps, calls } = installer(file, expected, dir);
    const first = await installAndOpen(deps);
    assert.equal(first.installed, true);
    assert.equal(calls.copies, 1);
    assert.equal(first.meta.release, "test");
    assert.ok(first.categories.length > 0);
    await assert.rejects(first.db.exec("DELETE FROM meta"), /readonly/);
    await first.db.close();
    // Later uses open the installed copy without copying again.
    const again = await installAndOpen(deps);
    assert.equal(again.installed, false);
    assert.equal(calls.copies, 1);
    assert.equal(calls.cleanUps, 2);
    await again.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a partial, corrupt or outdated copy is replaced from the asset once", async () => {
  const { dir, file, expected } = fixture();
  try {
    for (const damage of [
      (t: string) => truncateSync(t, statSync(t).size - 4096),
      (t: string) => writeFileSync(t, Buffer.alloc(8192, 7)),
      (t: string) => {
        // An earlier release's catalogue under the same name.
        const db = new DatabaseSync(t);
        db.exec(
          "PRAGMA query_only = OFF; UPDATE meta SET value = 'old' WHERE key = 'release'",
        );
        db.close();
      },
    ]) {
      const { deps, calls, target } = installer(file, expected, dir);
      copyFileSync(file, target);
      damage(target);
      const opened = await installAndOpen(deps);
      assert.equal(opened.installed, true);
      assert.equal(calls.removes, 1);
      assert.equal(calls.copies, 1);
      assert.deepEqual(readFileSync(target), readFileSync(file));
      await opened.db.close();
      rmSync(target, { force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bad asset, low storage or a failing device end in a clear error, never a loop", async () => {
  const { dir, file, expected } = fixture();
  try {
    const broken = join(dir, "broken.db");
    writeFileSync(broken, Buffer.alloc(8192, 3));
    const bad = installer(broken, { ...expected }, dir);
    await assert.rejects(installAndOpen(bad.deps), (e: unknown) => {
      assert.ok(e instanceof BrandedCatalogError);
      assert.equal(e.problem, "invalid");
      assert.match(e.message, /Your logs are safe/);
      return true;
    });
    assert.equal(
      bad.calls.copies,
      2,
      "installed once, replaced once, then stops",
    );
    rmSync(bad.target, { force: true });

    const full = installer(file, expected, dir);
    full.deps.freeBytes = () => 1024;
    await assert.rejects(installAndOpen(full.deps), (e: unknown) => {
      assert.ok(e instanceof BrandedCatalogError);
      assert.equal(e.problem, "storage");
      assert.match(e.message, /free space/);
      return true;
    });
    assert.equal(full.calls.copies, 0);

    const failing = installer(file, expected, dir);
    failing.deps.copyAsset = async () => {
      throw new Error("asset missing");
    };
    await assert.rejects(installAndOpen(failing.deps), (e: unknown) => {
      assert.ok(e instanceof BrandedCatalogError);
      assert.equal(e.problem, "unavailable");
      return true;
    });

    // A failed clean-up of old versions never blocks searching.
    const messy = installer(file, expected, dir);
    messy.deps.cleanUp = async () => {
      throw new Error("permission denied");
    };
    const opened = await installAndOpen(messy.deps);
    assert.equal((await readMeta(opened.db)).release, "test");
    await opened.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- The real catalogue (when built) --------------------------------------

const REAL = join("assets", "catalog", manifest.file);
const has = (s: string, ...w: string[]) =>
  w.every((x) => catalogKey(s).split(" ").includes(x));
/** The founder's ranking acceptance set (M1 §10): every top-N row must pass. */
const RANKING: {
  query: string;
  top: number;
  expect: (brand: string, name: string) => boolean;
}[] = [
  { query: "quest", top: 5, expect: (b) => catalogKey(b).startsWith("quest") },
  { query: "fairlife", top: 5, expect: (b) => catalogKey(b) === "fairlife" },
  {
    query: "oikos",
    top: 5,
    expect: (b, n) => has(b, "oikos") || has(n, "oikos"),
  },
  {
    query: "premier protein",
    top: 5,
    expect: (b) => catalogKey(b) === "premier protein",
  },
  {
    query: "cheerios",
    top: 5,
    expect: (b, n) => has(b, "cheerios") || has(n, "cheerios"),
  },
  { query: "kind bar", top: 3, expect: (b) => catalogKey(b) === "kind" },
  {
    query: "chobani",
    top: 5,
    expect: (b) => catalogKey(b).startsWith("chobani"),
  },
  { query: "rxbar", top: 3, expect: (b) => catalogKey(b) === "rxbar" },
  {
    query: "greek yogurt",
    top: 5,
    expect: (_, n) =>
      has(n, "greek") &&
      /yogurt|yoghurt/.test(catalogKey(n)) &&
      !/dressing|dip|coated|covered|pretzel|raisin|\bbar\b|chip|bites|melts|powder/.test(
        catalogKey(n),
      ),
  },
  {
    query: "protein bar",
    top: 5,
    expect: (_, n) => /\bbars?\b/.test(catalogKey(n)),
  },
  {
    query: "peanut butter",
    top: 5,
    expect: (_, n) =>
      has(n, "peanut", "butter") &&
      !/cup|cookie|candy|cracker|pretzel|\bbar|filled|chip|wafer|sandwich|bites|ice cream|crunch|egg|cereal|granola|puffs/.test(
        catalogKey(n),
      ),
  },
  {
    query: "chicken",
    top: 5,
    expect: (_, n) => /\bchicken\b/.test(catalogKey(n)),
  },
  {
    query: "chicken breast",
    top: 5,
    expect: (_, n) => has(n, "chicken") && /\bbreasts?\b/.test(catalogKey(n)),
  },
];

test(
  "real catalogue: ranking acceptance, barcode forms and bounded timings",
  { skip: !existsSync(REAL) },
  async () => {
    const db = connect(REAL);
    try {
      const meta = await readMeta(db);
      assert.equal(
        metaProblem(meta, {
          schema: manifest.schema,
          release: manifest.release,
          contentSha256: manifest.contentSha256,
          products: manifest.products,
        }),
        undefined,
      );
      const cats = await loadCategories(db);
      const failed: string[] = [];
      const timings: string[] = [];
      for (const c of RANKING) {
        const t = performance.now();
        const page = await search(db, (await plan(db, c.query, cats))!);
        timings.push(`${c.query} ${(performance.now() - t).toFixed(1)} ms`);
        const top = page.products.slice(0, c.top);
        if (!(
          top.length === c.top && top.every((x) => c.expect(x.brand, x.name))
        ))
          failed.push(`${c.query}: ${names(top).join(" || ")}`);
      }
      assert.deepEqual(failed, []);
      // The worst case (a two-letter prefix) stays bounded on a desktop.
      for (const q of ["ch", "gr", "pro"]) {
        const t = performance.now();
        await search(db, (await plan(db, q, cats))!);
        const ms = performance.now() - t;
        timings.push(`${q} ${ms.toFixed(1)} ms`);
        assert.ok(ms < 1500, `${q} took ${ms} ms`);
      }
      // Barcode forms of real products resolve to the same product.
      const sample = (await db.all<{ gtin: number }>(
        "SELECT gtin FROM barcode WHERE gtin BETWEEN 10000000000 AND 99999999999999 ORDER BY gtin LIMIT 5",
        [],
      )) as { gtin: number }[];
      for (const { gtin } of sample) {
        const g14 = String(gtin).padStart(14, "0");
        const a = await byBarcode(db, g14);
        assert.ok(a, g14);
        assert.equal(a.gtin, g14);
        assert.equal((await byBarcode(db, g14.slice(1)))?.id, a.id);
      }
      console.log(`  timings: ${timings.join(", ")}`);
    } finally {
      await db.close();
    }
  },
);

test("branded foods never touch the network: search and lookup are bundled and offline", () => {
  for (const file of [
    "src/data/branded-catalog.ts",
    "src/data/branded-query.ts",
    "src/data/branded-install.ts",
    "src/components/nutrition/useBrandedSearch.ts",
  ]) {
    const code = readFileSync(file, "utf8");
    assert.doesNotMatch(
      code,
      /\bfetch\s*\(|XMLHttpRequest|https?:\/\/|downloadFileAsync/,
      file,
    );
  }
});
