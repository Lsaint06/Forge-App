import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathRepository } from "./path-fixture";

// A real backup exported by the pre-Phase-6 app (generator still present):
// an archived engine-1 generated Path, an active current-engine generated
// Path with completed, skipped and pending sessions, a standalone template
// workout, a custom exercise, a favourite, a measurement and an older-style
// profile. It stands in for an existing user upgrading to curated-only Forge
// Paths, and never needs the generator to load.
export const legacyBackupText = readFileSync(
  join(__dirname, "fixtures", "legacy-user-backup.json"),
  "utf8",
);
export const legacyBackup = JSON.parse(legacyBackupText) as {
  profile: Record<string, unknown>;
  workouts: { id: string; status: string; templateId: string | null }[];
  workoutExercises: { id: string; workoutId: string; exerciseId: string }[];
  sets: { id: string; weight: number; reps: number }[];
  templates: { id: string }[];
  journals: {
    id: string;
    kind: string;
    date: string;
    data: Record<string, unknown>;
  }[];
  customExercises: { id: string }[];
  favorites: string[];
};

export function legacyUserRepository(filename?: string) {
  const fixture = pathRepository(filename);
  fixture.r.importBackup(legacyBackupText);
  return fixture;
}

// A freshly accepted current-engine generated Path (8 weeks, 4 days a week,
// starting 2026-10-19) with nothing logged, exported by the pre-Phase-6 app.
export const freshPathBackupText = readFileSync(
  join(__dirname, "fixtures", "legacy-fresh-path-backup.json"),
  "utf8",
);
export function freshPathRepository(filename?: string) {
  const fixture = pathRepository(filename);
  fixture.r.importBackup(freshPathBackupText);
  return fixture;
}
