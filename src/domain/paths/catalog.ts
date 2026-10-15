import type { PathDefinition, PathRole } from "./model";

export const forgePaths: PathDefinition[] = [
  {
    key: "start-strong",
    name: "START STRONG",
    subtitle: "Beginner Foundation",
    description:
      "Simple full-body practice. Learn a manageable set of movements and build a repeatable habit.",
    experience: "Beginner",
    objective: "Confidence & consistency",
    frequency: 3,
    minDays: 1,
    maxDays: 3,
    duration: 30,
    muscles: "Full body",
    benefits:
      "Two working sets, straightforward rep targets and spaced training days.",
    equipment:
      "Dumbbells or suitable gym equipment; pulling equipment required",
  },
  {
    key: "build-muscle",
    name: "BUILD MUSCLE",
    subtitle: "Hypertrophy",
    description:
      "Balanced muscle-building work, combining compound movements with focused accessories.",
    experience: "All levels",
    objective: "Muscle growth",
    frequency: 4,
    minDays: 2,
    maxDays: 6,
    duration: 75,
    muscles: "Full body, with optional emphasis",
    benefits:
      "Moderate repetitions, upper/lower or push/pull/legs splits as availability grows.",
    equipment: "Dumbbells, cables or full gym machines",
  },
  {
    key: "get-strong",
    name: "GET STRONG",
    subtitle: "Strength",
    description:
      "Practice measurable compound lifts with lower rep targets and longer rests.",
    experience: "All levels; technique first",
    objective: "Strength practice",
    frequency: 3,
    minDays: 2,
    maxDays: 4,
    duration: 75,
    muscles: "Legs, chest, back and shoulders",
    benefits:
      "Retained main lifts, fewer accessories and generous rest between working sets.",
    equipment: "Free weights; barbell work needs a suitable rack and bench",
  },
  {
    key: "lean-strong",
    name: "LEAN & STRONG",
    subtitle: "Body Recomposition",
    description:
      "Time-conscious resistance training to support muscle retention and development.",
    experience: "All levels",
    objective: "Consistent resistance training",
    frequency: 3,
    minDays: 2,
    maxDays: 4,
    duration: 60,
    muscles: "Full body & core",
    benefits:
      "Moderate-volume sessions and room for optional easy walking on rest days. No promised fat-loss result.",
    equipment: "Dumbbells or suitable gym equipment",
  },
  {
    key: "athlete-mode",
    name: "ATHLETE MODE",
    subtitle: "Athletic Performance",
    description:
      "Build a base of strength and controlled movement, with unilateral leg work and trunk control.",
    experience: "All levels; foundational block",
    objective: "Movement quality & strength",
    frequency: 3,
    minDays: 2,
    maxDays: 4,
    duration: 60,
    muscles: "Full body, single-leg control & core",
    benefits:
      "Controlled repetitions and movement practice. This foundation does not prescribe ballistic lifts or sport-specific conditioning.",
    equipment: "Dumbbells or kettlebells plus pulling equipment",
  },
  {
    key: "advanced-physique",
    name: "ADVANCED PHYSIQUE",
    subtitle: "Bodybuilding",
    description:
      "More targeted resistance training for experienced lifters, with selected muscle priorities.",
    experience: "Intermediate / Advanced",
    objective: "Targeted hypertrophy",
    frequency: 5,
    minDays: 3,
    maxDays: 6,
    duration: 90,
    muscles: "Full body, shoulders & arms",
    benefits:
      "Upper/lower or push/pull/legs structure, focused accessories and higher rep isolation work.",
    equipment: "Dumbbells, cables or full gym machines",
  },
];

// This is a small, reviewed selection menu from the existing catalog, not a
// second exercise database. Extra requirements correct broad catalog labels:
// Bodyweight does not imply access to a dip station, bench or inverted-row bar.
export const movementMenu: {
  id: string;
  role: PathRole;
  needs: string[];
  level: number;
}[] = [
  {
    id: "barbell-bench-press",
    role: "push",
    needs: ["Barbell", "Bench", "Squat rack"],
    level: 1,
  },
  {
    id: "dumbbell-bench-press",
    role: "push",
    needs: ["Dumbbell", "Bench"],
    level: 0,
  },
  { id: "dumbbell-floor-press", role: "push", needs: ["Dumbbell"], level: 0 },
  {
    id: "machine-chest-press",
    role: "push",
    needs: ["Full gym machines"],
    level: 0,
  },
  { id: "push-up", role: "push", needs: [], level: 0 },
  { id: "knee-push-up", role: "push", needs: [], level: 0 },
  { id: "barbell-bent-over-row", role: "pull", needs: ["Barbell"], level: 1 },
  { id: "dumbbell-bent-over-row", role: "pull", needs: ["Dumbbell"], level: 0 },
  { id: "kettlebell-row", role: "pull", needs: ["Kettlebell"], level: 0 },
  { id: "seated-cable-row", role: "pull", needs: ["Cable"], level: 0 },
  { id: "lat-pulldown", role: "pull", needs: ["Cable"], level: 0 },
  { id: "pull-up", role: "pull", needs: ["Pull-up bar"], level: 1 },
  {
    id: "band-face-pull",
    role: "pull",
    needs: ["Resistance band", "Band anchor"],
    level: 0,
  },
  {
    id: "back-squat",
    role: "squat",
    needs: ["Barbell", "Squat rack"],
    level: 1,
  },
  { id: "goblet-squat", role: "squat", needs: ["Dumbbell"], level: 0 },
  { id: "leg-press", role: "squat", needs: ["Full gym machines"], level: 0 },
  { id: "bodyweight-split-squat", role: "squat", needs: [], level: 0 },
  { id: "bodyweight-squat", role: "squat", needs: [], level: 0 },
  { id: "romanian-deadlift", role: "posterior", needs: ["Barbell"], level: 1 },
  {
    id: "dumbbell-romanian-deadlift",
    role: "posterior",
    needs: ["Dumbbell"],
    level: 0,
  },
  {
    id: "kettlebell-deadlift",
    role: "posterior",
    needs: ["Kettlebell"],
    level: 0,
  },
  {
    id: "seated-leg-curl",
    role: "posterior",
    needs: ["Full gym machines"],
    level: 0,
  },
  {
    id: "band-good-morning",
    role: "posterior",
    needs: ["Resistance band"],
    level: 0,
  },
  { id: "bodyweight-glute-bridge", role: "posterior", needs: [], level: 0 },
  {
    id: "dumbbell-shoulder-press",
    role: "shoulder",
    needs: ["Dumbbell", "Bench"],
    level: 0,
  },
  {
    id: "overhead-press",
    role: "shoulder",
    needs: ["Barbell", "Squat rack"],
    level: 1,
  },
  {
    id: "dumbbell-lateral-raise",
    role: "shoulder",
    needs: ["Dumbbell"],
    level: 0,
  },
  {
    id: "band-pull-apart",
    role: "shoulder",
    needs: ["Resistance band"],
    level: 0,
  },
  { id: "dumbbell-curl", role: "biceps", needs: ["Dumbbell"], level: 0 },
  { id: "hammer-curl", role: "biceps", needs: ["Dumbbell"], level: 0 },
  {
    id: "band-biceps-curl",
    role: "biceps",
    needs: ["Resistance band"],
    level: 0,
  },
  { id: "triceps-rope-pushdown", role: "triceps", needs: ["Cable"], level: 0 },
  {
    id: "band-triceps-pushdown",
    role: "triceps",
    needs: ["Resistance band", "Band anchor"],
    level: 0,
  },
  {
    id: "incline-dumbbell-bench-press",
    role: "push",
    needs: ["Dumbbell", "Bench"],
    level: 0,
  },
  { id: "standing-cable-fly", role: "push", needs: ["Cable"], level: 0 },
  {
    id: "leg-extension",
    role: "squat",
    needs: ["Full gym machines"],
    level: 0,
  },
  {
    id: "bent-over-reverse-fly",
    role: "rear",
    needs: ["Dumbbell"],
    level: 0,
  },
  {
    id: "overhead-cable-triceps-extension",
    role: "triceps",
    needs: ["Cable"],
    level: 0,
  },
  {
    id: "two-hand-overhead-triceps-extension",
    role: "triceps",
    needs: ["Dumbbell"],
    level: 0,
  },
  { id: "dumbbell-calf-raise", role: "calf", needs: ["Dumbbell"], level: 0 },
  { id: "single-leg-calf-raise", role: "calf", needs: [], level: 0 },
  { id: "cable-reverse-fly", role: "rear", needs: ["Cable"], level: 0 },
  { id: "pec-deck-fly", role: "push", needs: ["Full gym machines"], level: 0 },
  { id: "machine-row", role: "pull", needs: ["Full gym machines"], level: 0 },
  { id: "dead-bug", role: "core", needs: [], level: 0 },
  { id: "bird-dog", role: "core", needs: [], level: 0 },
  { id: "reverse-crunch", role: "core", needs: [], level: 0 },
];
