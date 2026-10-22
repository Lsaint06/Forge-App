import { DatabaseSync } from "node:sqlite";
import { Repository } from "../src/data/repository";

export function pathRepository(filename = ":memory:") {
  const db = new DatabaseSync(filename);
  const r = new Repository({
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  });
  r.migrate();
  return { r, db };
}
