import { readFileSync } from "node:fs";
import { join } from "node:path";

// The authored Forge Muscle Building V3 tables, kept verbatim in
// tests/fixtures/forge-muscle-v3-tables.md, are the source of truth for the
// nine Muscle Building programs. This module parses them so tests can prove
// the bundled JSON matches them.

export type AuthoredRow = {
  name: string;
  sets: number;
  reps: { min: number; max: number };
  perSide: boolean;
};
export type AuthoredSession = {
  day: number;
  name: string;
  rows: AuthoredRow[];
};
export type AuthoredProgram = {
  code: string;
  experience: "Beginner" | "Intermediate" | "Advanced";
  days: 3 | 4 | 5;
  split: string;
  sessions: AuthoredSession[];
};

const tablesPath = join(__dirname, "fixtures", "forge-muscle-v3-tables.md");

// Table rows arrive concatenated as "<Name><sets><reps>", e.g.
// "Lat Pulldown26–8" = 2 sets of 6–8. Every authored set count is a single
// digit, so the first digit after the name is the set count.
const rowPattern =
  /([A-Z][A-Za-z\-/ ]*?[a-z)])(\d)(\d{1,2})(?:–(\d{1,2}))?(\/(?:side|leg|arm))?(?=[A-Z]|$)/g;

export function parseMuscleTables(
  text = readFileSync(tablesPath, "utf8"),
): AuthoredProgram[] {
  const programs: AuthoredProgram[] = [];
  for (const block of text.split(/^## (?=[BIA]-M\d)/m).slice(1)) {
    const head =
      /^([BIA]-M[345]) — (Beginner|Intermediate|Advanced) Muscle Building, ([345]) Days\n\*\*Split:\*\* (.+)/.exec(
        block,
      );
    if (!head)
      throw new Error(`Unrecognised program heading: ${block.slice(0, 60)}`);
    const sessions: AuthoredSession[] = [];
    const parts = block.split(/^### Day (\d) — (.+)$/m);
    for (let i = 1; i < parts.length; i += 3) {
      const line = /^ExerciseSetsReps(.+)$/m.exec(parts[i + 2]!);
      if (!line) throw new Error(`${head[1]} day ${parts[i]}: no table`);
      const body = line[1]!.trim();
      const matches = [...body.matchAll(rowPattern)];
      // Every character of the table must belong to a parsed row.
      if (matches.map((m) => m[0]).join("") !== body)
        throw new Error(
          `${head[1]} day ${parts[i]}: could not parse every row`,
        );
      sessions.push({
        day: Number(parts[i]),
        name: parts[i + 1]!.trim(),
        rows: matches.map((m) => ({
          name: m[1]!.trim(),
          sets: Number(m[2]),
          reps: { min: Number(m[3]), max: Number(m[4] ?? m[3]) },
          perSide: !!m[5],
        })),
      });
    }
    programs.push({
      code: head[1]!,
      experience: head[2] as AuthoredProgram["experience"],
      days: Number(head[3]) as AuthoredProgram["days"],
      split: head[4]!.trim(),
      sessions,
    });
  }
  return programs;
}

type Mapping = { id: string; notes?: string };

// Approved catalog mapping (2026-10-22 review; see docs/MUSCLE_BUILDING_V3.md).
// Nothing outside this table may be used.
export const approvedMapping: Record<string, Mapping> = {
  "Barbell Bench Press": { id: "barbell-bench-press" },
  "Cable Biceps Curl": { id: "cable-curl" },
  "Cable Crunch": { id: "cable-crunch" },
  "Cable Fly": { id: "standing-cable-fly" },
  "Cable Lateral Raise": { id: "cable-lateral-raise" },
  "Cable Triceps Pushdown": { id: "triceps-rope-pushdown" },
  "Chest-Supported Row": { id: "chest-supported-dumbbell-row" },
  "Dead Bug": { id: "dead-bug" },
  "Dumbbell Curl": { id: "dumbbell-curl" },
  "Dumbbell Lateral Raise": { id: "dumbbell-lateral-raise" },
  "Dumbbell Romanian Deadlift": { id: "dumbbell-romanian-deadlift" },
  "Flat Dumbbell Bench Press": { id: "dumbbell-bench-press" },
  "Flat Machine Chest Press": { id: "machine-chest-press" },
  "Hack Squat": { id: "hack-squat" },
  "Hammer Curl": { id: "hammer-curl" },
  "Hip Thrust Machine": { id: "machine-hip-thrust" },
  "Incline Dumbbell Bench Press": { id: "incline-dumbbell-bench-press" },
  "Incline Dumbbell Curl": { id: "incline-dumbbell-curl" },
  "Incline Smith Machine Press": { id: "smith-machine-incline-press" },
  "Lat Pulldown": { id: "lat-pulldown" },
  "Leg Extension": { id: "leg-extension" },
  "Leg Press": { id: "leg-press" },
  "Lying Leg Curl": { id: "lying-leg-curl" },
  "Machine Chest Press": { id: "machine-chest-press" },
  "Machine Shoulder Press": { id: "machine-shoulder-press" },
  "Neutral-Grip Lat Pulldown": { id: "neutral-grip-lat-pulldown" },
  "Overhead Cable Triceps Extension": {
    id: "overhead-cable-triceps-extension",
  },
  "Pallof Press": { id: "pallof-press" },
  "Preacher Curl": { id: "machine-preacher-curl" },
  "Reverse Pec Deck": { id: "reverse-pec-deck" },
  "Romanian Deadlift": { id: "romanian-deadlift" },
  "Seated Cable Row": { id: "seated-cable-row" },
  "Seated Calf Raise": { id: "seated-calf-raise" },
  "Seated Leg Curl": { id: "seated-leg-curl" },
  "Shoulder Press Machine": { id: "machine-shoulder-press" },
  "Single-Arm Cable Lat Pulldown": { id: "single-arm-lat-pulldown" },
  "Single-Arm Cable Pushdown": { id: "single-arm-pushdown" },
  "Single-Arm Lat Pulldown": { id: "single-arm-lat-pulldown" },
  "Smith Machine Romanian Deadlift": { id: "smith-machine-romanian-deadlift" },
  "Standing Cable Fly": { id: "standing-cable-fly" },
  "Standing Calf Raise": { id: "standing-calf-raise" },
  "Supported Bulgarian Split Squat": {
    id: "bulgarian-split-squat",
    notes:
      "Supported Bulgarian split squat: hold a stable support for balance.",
  },
  "Supported Split Squat": {
    id: "dumbbell-split-squat",
    notes:
      "Supported split squat: hold a stable support for balance. Dumbbells are optional when appropriate.",
  },
  "Wide-Grip Lat Pulldown": { id: "wide-grip-lat-pulldown" },
};

export type Role = "secondary" | "accessory";

// Approved Muscle Building classification: compounds are secondary, isolation
// and core work accessory. "primary" is unused. Roles only set rest guidance
// and effort targets; every exercise remains eligible for load progression.
export const compounds = new Set([
  "barbell-bench-press",
  "dumbbell-bench-press",
  "machine-chest-press",
  "incline-dumbbell-bench-press",
  "smith-machine-incline-press",
  "machine-shoulder-press",
  "lat-pulldown",
  "neutral-grip-lat-pulldown",
  "wide-grip-lat-pulldown",
  "single-arm-lat-pulldown",
  "chest-supported-dumbbell-row",
  "seated-cable-row",
  "leg-press",
  "hack-squat",
  "dumbbell-split-squat",
  "bulgarian-split-squat",
  "romanian-deadlift",
  "dumbbell-romanian-deadlift",
  "smith-machine-romanian-deadlift",
  "machine-hip-thrust",
]);
export const isolation = new Set([
  "standing-cable-fly",
  "reverse-pec-deck",
  "cable-lateral-raise",
  "dumbbell-lateral-raise",
  "overhead-cable-triceps-extension",
  "triceps-rope-pushdown",
  "single-arm-pushdown",
  "incline-dumbbell-curl",
  "dumbbell-curl",
  "cable-curl",
  "machine-preacher-curl",
  "hammer-curl",
  "leg-extension",
  "seated-leg-curl",
  "lying-leg-curl",
  "standing-calf-raise",
  "seated-calf-raise",
  "cable-crunch",
  "dead-bug",
  "pallof-press",
]);

export function roleFor(exerciseId: string): Role {
  if (compounds.has(exerciseId)) return "secondary";
  if (isolation.has(exerciseId)) return "accessory";
  throw new Error(`No approved role for ${exerciseId}`);
}

// Approved starting rest guidance (seconds); longer rest is always allowed.
export function restFor(
  role: Role,
  experience: AuthoredProgram["experience"],
): { min: number; max: number } {
  if (role === "accessory") return { min: 60, max: 120 };
  return experience === "Advanced"
    ? { min: 120, max: 240 }
    : { min: 120, max: 180 };
}

// Approved effort targets, the same for every role.
export const approvedRir = {
  Beginner: { min: 2, max: 3 },
  Intermediate: { min: 1, max: 3 },
  Advanced: { min: 1, max: 3 },
} as const;

export const approvedModel = {
  Beginner: "double-progression",
  Intermediate: "double-progression",
  Advanced: "autoregulated",
} as const;

// Shared with Strength V2: optional lower-fatigue sessions.
export const approvedLowerFatigue = {
  setReduction: 0.35,
  rir: { min: 3, max: 4 },
} as const;

export const approvedPatterns = {
  3: ["train", "rest", "train", "rest", "train", "rest", "rest"],
  4: ["train", "train", "rest", "train", "train", "rest", "rest"],
  5: ["train", "train", "train", "rest", "train", "train", "rest"],
} as const;
