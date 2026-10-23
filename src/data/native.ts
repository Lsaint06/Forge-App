import * as SQLite from "expo-sqlite";
import { Repository, type SqlDatabase } from "./repository";

// The only module that opens SQLite. Tests replace it.

const NAME = "forge.db";
let instance: Repository | undefined;

function adapter(db: SQLite.SQLiteDatabase): SqlDatabase {
  return {
    exec: (s) => db.execSync(s),
    run: (s, p = []) => {
      db.runSync(s, p);
    },
    all: <T>(s: string, p: (string | number | null)[] = []) =>
      db.getAllSync<T>(s, p),
  };
}

export async function initializeRepository() {
  repository();
}
export function repository() {
  if (!instance) {
    const db = SQLite.openDatabaseSync(NAME);
    try {
      db.execSync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
      const r = new Repository(adapter(db));
      r.migrate();
      instance = r;
    } catch (e) {
      // SQLite caches connections by name: close a failed one so trying
      // again opens the file afresh instead of reusing the broken handle.
      try {
        db.closeSync();
      } catch {
        // Already unusable; the original error is what matters.
      }
      throw e;
    }
  }
  return instance;
}

/**
 * Recovery access through a separate, short-lived connection that runs no
 * migrations, so it works even when the app's repository failed to start.
 * It never shares (or closes) the app's own connection. `serialize` returns
 * the whole database, including the write-ahead log.
 */
export function readForRescue<T>(
  read: (r: Repository, serialize: () => Uint8Array) => T,
): T {
  const db = SQLite.openDatabaseSync(NAME, { useNewConnection: true });
  try {
    return read(new Repository(adapter(db)), () => db.serializeSync());
  } finally {
    try {
      db.closeSync();
    } catch {
      // The copy is already taken; closing is best effort.
    }
  }
}

/** The database file on disk, for a last-resort raw copy. */
export function databaseFileUri() {
  const dir = String(SQLite.defaultDatabaseDirectory).replace(/\/$/, "");
  return `${dir.startsWith("file://") ? dir : `file://${dir}`}/${NAME}`;
}
