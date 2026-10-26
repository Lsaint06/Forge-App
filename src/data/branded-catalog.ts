import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import type { Symbology } from "../domain/barcode";
import { brandedFood } from "../domain/branded";
import type { LibraryFood } from "../domain/food-library";
import { BRANDED_ASSET } from "./branded-asset";
import manifest from "./branded-catalog.manifest.json";
import {
  BrandedCatalogError,
  installAndOpen,
  type Connection,
  type OpenCatalog,
} from "./branded-install";
import { byBarcode, plan, search, type Runner } from "./branded-query";

// The bundled branded-food catalogue (Phase 7.3E): about 405,000 USDA
// branded products in a read-only SQLite file that ships with the app. It is
// opened on the first branded search or barcode lookup, never at launch, on
// its own connection: the lifter's database is never involved. Searches run
// on SQLite's thread and return one bounded page at a time.

/** The catalogue version recorded on logged entries. */
export const BRANDED_CATALOG = manifest.catalog;
/** The source citation shown with branded values. */
export const BRANDED_ATTRIBUTION = manifest.source.attribution;
export const BRANDED_RELEASE = manifest.release;

const NAME = manifest.file;

function databaseDirectory() {
  const dir = String(SQLite.defaultDatabaseDirectory).replace(/\/$/, "");
  return dir.startsWith("file://") ? dir : `file://${dir}`;
}
const installedFile = () => new File(`${databaseDirectory()}/${NAME}`);

function connection(db: SQLite.SQLiteDatabase): Connection {
  return {
    all: (sql, params) => db.getAllAsync(sql, params),
    get: (sql, params) => db.getFirstAsync(sql, params),
    exec: (sql) => db.execAsync(sql),
    close: () => db.closeAsync(),
  };
}

const STALE = /^usda-branded-.+\.db(-journal|-wal|-shm)?$/;

const deps = {
  expected: {
    schema: manifest.schema,
    release: manifest.release,
    contentSha256: manifest.contentSha256,
    products: manifest.products,
  },
  bytesNeeded: manifest.reference.bytes,
  installed() {
    const f = installedFile();
    return { exists: f.exists, size: f.exists ? (f.size ?? 0) : 0 };
  },
  freeBytes: () => Paths.availableDiskSpace,
  copyAsset: () =>
    SQLite.importDatabaseFromAssetAsync(NAME, {
      assetId: BRANDED_ASSET,
      forceOverwrite: true,
    }),
  remove: () => SQLite.deleteDatabaseAsync(NAME),
  async cleanUp() {
    // Earlier catalogue versions (an app update ships a new file name).
    for (const entry of new Directory(databaseDirectory()).list())
      if (
        entry instanceof File &&
        STALE.test(entry.name) &&
        !entry.name.startsWith(NAME)
      )
        entry.delete();
    // Android unpacks the asset to the cache before copying it: that
    // intermediate copy is no longer needed once installed.
    if (Platform.OS === "android")
      for (const entry of new Directory(Paths.cache).list())
        if (
          entry instanceof File &&
          entry.name.startsWith("ExponentAsset-") &&
          entry.name.endsWith(".db")
        )
          entry.delete();
  },
  async open() {
    return connection(
      await SQLite.openDatabaseAsync(NAME, { useNewConnection: true }),
    );
  },
};

let opening: Promise<OpenCatalog> | null = null;

/** The open catalogue (opened once, on first use; retried after a failure). */
function catalog() {
  opening ??= installAndOpen(deps).catch((e: unknown) => {
    opening = null;
    throw e;
  });
  return opening;
}

/** Whether the catalogue has been opened (for diagnostics). */
export const brandedOpened = () => opening !== null;

export type BrandedPage = {
  foods: LibraryFood[];
  /** Matches, counted up to 1,000 ("1,000+" beyond). */
  total: number;
  broad: boolean;
};

/**
 * One page of branded products for a query, best first, or null when the
 * query is too short (under two letters or digits). Pass the total from the
 * first page when loading more.
 */
export async function searchBranded(
  query: string,
  offset = 0,
  total?: number,
): Promise<BrandedPage | null> {
  const c = await catalog();
  const p = await plan(c.db, query, c.categories);
  if (!p) return null;
  const page = await search(c.db, p, offset, total);
  return {
    foods: page.products.map(brandedFood),
    total: page.total,
    broad: page.broad,
  };
}

/**
 * The branded product a scanned or typed barcode identifies, or null (no
 * such product, or not a valid GTIN). For Phase 7.3F's scanner: the result
 * opens the same food step as a search result.
 */
export async function brandedByBarcode(code: string, symbology?: Symbology) {
  const c = await catalog();
  const product = await byBarcode(c.db as Runner, code, symbology);
  return product ? brandedFood(product) : null;
}

/** The lifter-facing reason branded foods can't be searched. */
export function brandedProblem(e: unknown) {
  return e instanceof BrandedCatalogError
    ? e.message
    : "Branded foods couldn't be opened. Your logs are safe; try again.";
}
