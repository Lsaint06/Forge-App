import { readFileSync } from "node:fs";
import { join } from "node:path";

// The authored Forge Strength V2 tables, kept verbatim in
// tests/fixtures/forge-strength-v2-tables.md, are the source of truth for the
// nine Strength programs. This module parses them and holds the approved
// name → catalog mapping so tests can prove the bundled JSON matches them.

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
  sessions: AuthoredSession[];
};

const tablesPath = join(__dirname, "fixtures", "forge-strength-v2-tables.md");

// Table rows arrive concatenated as "<Name><sets><reps>", e.g.
// "Goblet Squat38–10" = 3 sets of 8–10. Every authored set count is a single
// digit, so the first digit after the name is the set count.
const rowPattern =
  /([A-Z][A-Za-z\-/ ]*?[a-z)])(\d)(\d{1,2})(?:–(\d{1,2}))?(\/(?:side|leg))?(?=[A-Z*\n]|$)/g;

export function parseStrengthTables(
  text = readFileSync(tablesPath, "utf8"),
): AuthoredProgram[] {
  const programs: AuthoredProgram[] = [];
  const blocks = text.split(/^### /m).slice(1);
  for (const block of blocks) {
    const head =
      /^([BIA]-S[345]) — (Beginner|Intermediate|Advanced) Strength, ([345]) Days/.exec(
        block,
      );
    if (!head)
      throw new Error(`Unrecognised program heading: ${block.slice(0, 60)}`);
    const sessions: AuthoredSession[] = [];
    const parts = block.split(/\*\*Day (\d) — (.+?)\*\*/);
    for (let i = 1; i < parts.length; i += 3) {
      const body = parts[i + 2]!.split(/\n---|\n# /)[0]!.replace(
        /^\s*ExerciseSetsReps/,
        "",
      );
      const matches = [...body.trim().matchAll(rowPattern)];
      // Every character of the table must belong to a parsed row.
      if (matches.map((m) => m[0]).join("") !== body.trim())
        throw new Error(
          `${head[1]} day ${parts[i]}: could not parse every row`,
        );
      const rows = matches.map((m): AuthoredRow => ({
        name: m[1]!.trim(),
        sets: Number(m[2]),
        reps: { min: Number(m[3]), max: Number(m[4] ?? m[3]) },
        perSide: !!m[5],
      }));
      sessions.push({ day: Number(parts[i]), name: parts[i + 1]!, rows });
    }
    programs.push({
      code: head[1]!,
      experience: head[2] as AuthoredProgram["experience"],
      days: Number(head[3]) as AuthoredProgram["days"],
      sessions,
    });
  }
  return programs;
}

type Mapping = {
  id: string;
  notes?: string;
  loading?: "bodyweight-or-assisted" | "added-load";
};

// Approved catalog mapping. Exact-name matches plus the reviewed decisions
// recorded in docs/STRENGTH_V2.md. Nothing outside this table may be used.
export const approvedMapping: Record<string, Mapping> = {
  "Goblet Squat": { id: "goblet-squat" },
  "Barbell Bench Press": { id: "barbell-bench-press" },
  "Chest-Supported Row": { id: "chest-supported-dumbbell-row" },
  "Seated Leg Curl": { id: "seated-leg-curl" },
  "Standing Calf Raise": { id: "standing-calf-raise" },
  "Trap-Bar Deadlift": { id: "trap-bar-deadlift" },
  "Machine Shoulder Press": { id: "machine-shoulder-press" },
  "Lat Pulldown": { id: "lat-pulldown" },
  "Leg Extension": { id: "leg-extension" },
  "Cable Triceps Pushdown": { id: "triceps-rope-pushdown" },
  "Leg Press": { id: "leg-press" },
  "Dumbbell Romanian Deadlift": { id: "dumbbell-romanian-deadlift" },
  "Seated Cable Row": { id: "seated-cable-row" },
  "Dumbbell Biceps Curl": { id: "dumbbell-curl" },
  "Cable Crunch": { id: "cable-crunch" },
  "Dumbbell Shoulder Press": { id: "dumbbell-shoulder-press" },
  "Neutral-Grip Lat Pulldown": { id: "neutral-grip-lat-pulldown" },
  "Seated Calf Raise": { id: "seated-calf-raise" },
  "Dead Bug": { id: "dead-bug" },
  "Reverse Pec Deck": { id: "reverse-pec-deck" },
  "Incline Dumbbell Curl": { id: "incline-dumbbell-curl" },
  "Face Pull": { id: "face-pull" },
  "Machine Chest Press": { id: "machine-chest-press" },
  "Cable Lateral Raise": { id: "cable-lateral-raise" },
  "Overhead Cable Triceps Extension": {
    id: "overhead-cable-triceps-extension",
  },
  "Supported Split Squat": {
    id: "dumbbell-split-squat",
    notes:
      "Supported split squat: hold a stable support for balance. Dumbbells are optional when appropriate.",
  },
  "Barbell Back Squat": { id: "back-squat" },
  "Conventional Deadlift": { id: "conventional-deadlift" },
  "Standing Barbell Overhead Press": { id: "overhead-press" },
  "Pull-Up / Assisted Pull-Up": {
    id: "pull-up",
    notes: "Pull-up or assisted pull-up: use assistance as needed.",
    loading: "bodyweight-or-assisted",
  },
  "Paused Back Squat": {
    id: "paused-squat",
    notes: "Paused barbell back squat.",
  },
  "Dumbbell Lateral Raise": { id: "dumbbell-lateral-raise" },
  "Romanian Deadlift": { id: "romanian-deadlift" },
  "Barbell Overhead Press": { id: "overhead-press" },
  "Pallof Press": { id: "pallof-press" },
  "Incline Dumbbell Bench Press": { id: "incline-dumbbell-bench-press" },
  "Seated Dumbbell Shoulder Press": { id: "seated-dumbbell-shoulder-press" },
  "Standing Cable Fly": { id: "standing-cable-fly" },
  "Hip Thrust": { id: "barbell-hip-thrust" },
  "Weighted Pull-Up": {
    id: "pull-up",
    notes: "Weighted pull-up: add external load when appropriate.",
    loading: "added-load",
  },
  "Paused Bench Press": { id: "paused-bench-press" },
  "Barbell Row": { id: "barbell-bent-over-row" },
  "Close-Grip Bench Press": { id: "close-grip-bench-press" },
  "Front Squat": { id: "front-squat" },
  "Weighted Chin-Up": {
    id: "chin-up",
    notes: "Weighted chin-up: add external load.",
    loading: "added-load",
  },
  "Hammer Curl": { id: "hammer-curl" },
  "High-Bar Back Squat": { id: "high-bar-back-squat" },
  "Hack Squat": { id: "hack-squat" },
  "Lying Leg Curl": { id: "lying-leg-curl" },
};

export type Role = "primary" | "secondary" | "accessory";

// Approved classification rules (docs/STRENGTH_V2.md §3). Primary: the major
// strength lifts prioritised in a session. Secondary: technique variations,
// supporting barbell pressing, major compound pulls and the approved
// supporting compounds. Accessory: isolation and trunk work. Roles are
// assigned per session entry.
const primary = new Set([
  "back-squat",
  "barbell-bench-press",
  "conventional-deadlift",
  "goblet-squat",
  "trap-bar-deadlift",
]);
const secondary = new Set([
  "paused-squat",
  "paused-bench-press",
  "close-grip-bench-press",
  "front-squat",
  "high-bar-back-squat",
  "overhead-press",
  "chest-supported-dumbbell-row",
  "barbell-bent-over-row",
  "pull-up",
  "chin-up",
  "lat-pulldown",
  "neutral-grip-lat-pulldown",
  "seated-cable-row",
  "romanian-deadlift",
  // Supporting compounds, approved as secondary (2026-10-22 review).
  "leg-press",
  "dumbbell-romanian-deadlift",
  "machine-shoulder-press",
  "dumbbell-shoulder-press",
  "seated-dumbbell-shoulder-press",
  "incline-dumbbell-bench-press",
  "machine-chest-press",
  "barbell-hip-thrust",
  "dumbbell-split-squat",
  "hack-squat",
]);
const accessory = new Set([
  "seated-leg-curl",
  "lying-leg-curl",
  "standing-calf-raise",
  "seated-calf-raise",
  "leg-extension",
  "triceps-rope-pushdown",
  "overhead-cable-triceps-extension",
  "dumbbell-curl",
  "incline-dumbbell-curl",
  "hammer-curl",
  "cable-crunch",
  "dead-bug",
  "pallof-press",
  "reverse-pec-deck",
  "face-pull",
  "cable-lateral-raise",
  "dumbbell-lateral-raise",
  "standing-cable-fly",
]);

// The barbell overhead press is primary when the session explicitly
// prioritises pressing or upper-body strength (e.g. "Deadlift + Upper
// Strength", "Deadlift + Press"); otherwise it supports the session.
export const pressPrioritised = (sessionName: string) =>
  /\bUpper Strength\b|\bPress\b/.test(sessionName);

export function roleFor(exerciseId: string, sessionName: string): Role {
  if (exerciseId === "overhead-press" && pressPrioritised(sessionName))
    return "primary";
  if (primary.has(exerciseId)) return "primary";
  if (secondary.has(exerciseId)) return "secondary";
  if (accessory.has(exerciseId)) return "accessory";
  throw new Error(`No approved role for ${exerciseId}`);
}

// Approved rest guidance by role: heavy compound 3–5 min, moderate compound
// 2–3 min, isolation 1–2 min. The timer default is the lower bound.
export const restFor: Record<Role, { min: number; max: number }> = {
  primary: { min: 180, max: 300 },
  secondary: { min: 120, max: 180 },
  accessory: { min: 60, max: 120 },
};

type Range = { min: number; max: number };
const r = (min: number, max = min): Range => ({ min, max });
export type RirTargets = { primary: Range; secondary: Range; accessory: Range };

// Approved RIR framework (author review, 2026-10-22).
export const approvedRir = {
  Beginner: {
    standard: { primary: r(2, 3), secondary: r(2, 3), accessory: r(2, 3) },
  },
  Intermediate: {
    accumulation: { primary: r(2, 3), secondary: r(3), accessory: r(2, 3) },
    "lower-fatigue": {
      primary: r(3, 4),
      secondary: r(3, 4),
      accessory: r(3, 4),
    },
    intensification: { primary: r(1, 2), secondary: r(3), accessory: r(1, 3) },
    assessment: { primary: r(1, 3), secondary: r(3), accessory: r(2, 3) },
  },
  Advanced: {
    accumulation: { primary: r(2, 3), secondary: r(3, 4), accessory: r(2, 3) },
    "lower-fatigue": {
      primary: r(3, 4),
      secondary: r(3, 4),
      accessory: r(3, 4),
    },
    intensification: {
      primary: r(1, 2),
      secondary: r(2, 3),
      accessory: r(1, 3),
    },
    assessment: { primary: r(1, 3), secondary: r(2, 3), accessory: r(2, 3) },
  },
} as const;

// Approved weekly train/rest patterns.
export const approvedPatterns = {
  3: ["train", "rest", "train", "rest", "train", "rest", "rest"],
  4: ["train", "train", "rest", "train", "train", "rest", "rest"],
  5: ["train", "train", "train", "rest", "train", "train", "rest"],
} as const;

// Approved initial deload: about 30–40% fewer working sets.
export const approvedSetReduction = 0.35;
// Approved Week 8 assessment default: about 30% fewer working sets.
export const approvedAssessmentReduction = 0.3;
