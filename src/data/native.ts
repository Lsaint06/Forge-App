import * as SQLite from "expo-sqlite";
import { Repository } from "./repository";
let instance: Repository | undefined;
export async function initializeRepository() {
  repository();
}
export function repository() {
  if (!instance) {
    const db = SQLite.openDatabaseSync("forge.db");
    db.execSync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    const r = new Repository({
      exec: (s) => db.execSync(s),
      run: (s, p = []) => {
        db.runSync(s, p);
      },
      all: <T>(s: string, p: (string | number | null)[] = []) =>
        db.getAllSync<T>(s, p),
    });
    r.migrate();
    instance = r;
  }
  return instance;
}
