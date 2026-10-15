import * as SQLite from "expo-sqlite";
import { Repository } from "./repository";

let instance: Repository | undefined;
let initializing: Promise<void> | undefined;

export function initializeRepository(): Promise<void> {
  if (instance) return Promise.resolve();
  initializing ??= (async () => {
    if (!globalThis.crossOriginIsolated) {
      throw new Error(
        "Browser storage needs cross-origin isolation. Restart with npm run web, then reload. Hosted copies need the headers documented in docs/WEB.md.",
      );
    }
    // Warm up the worker/WASM asynchronously before the existing synchronous
    // repository runs. This avoids blocking worker startup on the browser UI.
    const db = await SQLite.openDatabaseAsync("forge.db");
    try {
      await db.execAsync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
      const r = new Repository({
        exec: (sql) => db.execSync(sql),
        run: (sql, params = []) => {
          db.runSync(sql, params);
        },
        all: <T>(sql: string, params: (string | number | null)[] = []) =>
          db.getAllSync<T>(sql, params),
      });
      r.migrate();
      instance = r;
    } catch (error) {
      await db.closeAsync();
      throw error;
    }
  })().catch((error) => {
    initializing = undefined;
    throw error;
  });
  return initializing;
}

export function repository(): Repository {
  if (!instance) throw new Error("Browser database is still starting.");
  return instance;
}
