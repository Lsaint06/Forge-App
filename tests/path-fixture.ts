import { DatabaseSync } from "node:sqlite";
import { Repository } from "../src/data/repository";
import {
  equipmentOptions,
  defaultWeekdays,
  type PathPreferences,
} from "../src/domain/paths/model";

export function pathPreferences(
  patch: Partial<PathPreferences> = {},
): PathPreferences {
  return {
    pathKey: "build-muscle",
    experience: "Intermediate",
    frequency: 4,
    duration: 75,
    equipment: [...equipmentOptions],
    gymAccess: true,
    excluded: [],
    avoidPatterns: [],
    limitations: "",
    priorities: [],
    style: "Balanced",
    startDate: "2026-10-19",
    weekdays: defaultWeekdays(patch.frequency ?? 4),
    ...patch,
  };
}
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
