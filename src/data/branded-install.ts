// Installing and opening the bundled branded catalogue (Phase 7.3E). The
// catalogue ships inside the app as an asset; SQLite opens it from the app's
// database folder, so the first use copies it there once (on iOS an APFS
// clone: no extra space). Every later use opens the installed copy after
// checking it is complete and is exactly this build's catalogue. A missing,
// partial, outdated or corrupt copy is replaced from the asset once; the
// user's own database is never touched. Platform work is injected, so the
// rules here are tested without a device.
import {
  loadCategories,
  metaProblem,
  readMeta,
  type Category,
  type Expected,
  type Runner,
} from "./branded-query";

/** An open, read-only connection to the catalogue. */
export type Connection = Runner & {
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
};

export type InstallDeps = {
  expected: Expected;
  /** Space the copy may need (the asset's size), checked before copying. */
  bytesNeeded: number;
  /** The installed file: whether it exists and its size. */
  installed(): { exists: boolean; size: number };
  freeBytes(): number;
  /** Copies the bundled asset over the installed file. */
  copyAsset(): Promise<void>;
  /** Deletes the installed file (and any SQLite side files). */
  remove(): Promise<void>;
  /** Deletes earlier catalogue versions and leftover copies (best effort). */
  cleanUp(): Promise<void>;
  open(): Promise<Connection>;
};

export type CatalogProblem = "storage" | "invalid" | "unavailable";

/** Why branded foods can't be used right now, in words for the lifter. */
export class BrandedCatalogError extends Error {
  constructor(
    readonly problem: CatalogProblem,
    readonly detail: string,
  ) {
    super(
      problem === "storage"
        ? "Branded foods need about 65 MB of free space. Free some space, then try again."
        : "Branded foods couldn't be opened. Your logs are safe; try again.",
    );
    this.name = "BrandedCatalogError";
  }
}

export type OpenCatalog = {
  db: Connection;
  meta: Record<string, string>;
  categories: Category[];
  /** True when the asset was copied into place by this call. */
  installed: boolean;
};

/** Headroom kept free beyond the catalogue itself. */
export const SPARE_BYTES = 20 * 1024 * 1024;

async function check(db: Connection, deps: InstallDeps, fresh: boolean) {
  const meta = await readMeta(db);
  const problem = metaProblem(meta, deps.expected);
  if (problem) throw new Error(problem);
  // A copy cut short (app closed while copying) is smaller than its pages.
  const pages = await db.get<{ page_count: number }>("PRAGMA page_count", []);
  const size = await db.get<{ page_size: number }>("PRAGMA page_size", []);
  const bytes = (pages?.page_count ?? 0) * (size?.page_size ?? 0);
  if (!bytes || bytes !== deps.installed().size)
    throw new Error(
      `incomplete file (${deps.installed().size} of ${bytes} bytes)`,
    );
  // A fresh copy is read in full once, so a damaged page is found now
  // rather than in the middle of a search.
  if (fresh) {
    const quick = await db.get<{ quick_check: string }>(
      "PRAGMA quick_check",
      [],
    );
    if (quick?.quick_check !== "ok")
      throw new Error(`integrity: ${quick?.quick_check ?? "unknown"}`);
  }
  return meta;
}

async function install(deps: InstallDeps) {
  if (deps.freeBytes() < deps.bytesNeeded + SPARE_BYTES)
    throw new BrandedCatalogError("storage", "not enough free space");
  await deps.copyAsset();
}

async function openChecked(deps: InstallDeps, fresh: boolean) {
  const db = await deps.open();
  try {
    await db.exec("PRAGMA query_only = ON");
    const meta = await check(db, deps, fresh);
    return { db, meta };
  } catch (e) {
    await db.close().catch(() => {});
    throw e;
  }
}

/**
 * The catalogue, ready to search: installed if needed, checked, read-only.
 * Replaces a bad copy from the asset once; then gives up with a
 * BrandedCatalogError (nothing is retried in a loop).
 */
export async function installAndOpen(deps: InstallDeps): Promise<OpenCatalog> {
  try {
    return await attempt(deps);
  } catch (e) {
    if (e instanceof BrandedCatalogError) throw e;
    throw new BrandedCatalogError(
      "unavailable",
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function attempt(deps: InstallDeps): Promise<OpenCatalog> {
  let fresh = false;
  if (!deps.installed().exists) {
    await install(deps);
    fresh = true;
  }
  let opened: { db: Connection; meta: Record<string, string> };
  try {
    opened = await openChecked(deps, fresh);
  } catch (first) {
    if (first instanceof BrandedCatalogError) throw first;
    try {
      await deps.remove();
      await install(deps);
      fresh = true;
      opened = await openChecked(deps, true);
    } catch (second) {
      if (second instanceof BrandedCatalogError) throw second;
      throw new BrandedCatalogError(
        "invalid",
        `${String(first instanceof Error ? first.message : first)}; after reinstall: ${String(second instanceof Error ? second.message : second)}`,
      );
    }
  }
  await deps.cleanUp().catch(() => {});
  const categories = await loadCategories(opened.db);
  return { ...opened, categories, installed: fresh };
}
