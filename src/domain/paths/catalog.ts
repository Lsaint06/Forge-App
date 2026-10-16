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
    muscles: "Full body, with optional emphasis",
    benefits:
      "Moderate repetitions, upper/lower or push/pull/legs splits as availability grows.",
    equipment: "Dumbbells, cable stations or compatible machines",
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
      "Efficient full-body resistance training to support muscle retention and development.",
    experience: "All levels",
    objective: "Consistent resistance training",
    frequency: 3,
    minDays: 2,
    maxDays: 4,
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
    muscles: "Full body, shoulders & arms",
    benefits:
      "Upper/lower or push/pull/legs structure, focused accessories and higher rep isolation work.",
    equipment: "Dumbbells, cable stations or compatible machines",
  },
];

// Reviewed selection menu drawn from the exercise catalog (not a second
// database). Each entry records what the movement needs, the lowest experience
// level it is offered at and its \`kind\`: a reviewed movement family used to
// fill slots, add week-level variety and rank substitutes. Extra requirements
// correct broad catalog labels: Bodyweight does not imply a dip station, bench
// or bar. Existing entries keep their role, needs and level so saved plans stay
// valid.
export const movementKinds = [
  "press",
  "incline-press",
  "fly",
  "row",
  "vertical-pull",
  "lat-isolation",
  "overhead-press",
  "lateral-raise",
  "rear-delt",
  "curl",
  "curl-lengthened",
  "curl-supported",
  "curl-neutral",
  "triceps-overhead",
  "triceps-pushdown",
  "triceps-lying",
  "triceps-compound",
  "squat",
  "single-leg",
  "knee-extension",
  "hinge",
  "deadlift",
  "hip-thrust",
  "knee-flexion",
  "calf",
  "calf-bent-knee",
  "core-stability",
  "core-flexion",
] as const;
export type MovementKind = (typeof movementKinds)[number];
export type MenuMovement = {
  id: string;
  role: PathRole;
  kind: MovementKind;
  needs: string[];
  level: number;
};
const m = (
  id: string,
  role: PathRole,
  kind: MovementKind,
  needs: string[] = [],
  level = 0,
): MenuMovement => ({ id, role, kind, needs, level });

export const movementMenu: MenuMovement[] = [
  // Chest
  m(
    "barbell-bench-press",
    "push",
    "press",
    ["Barbell", "Bench", "Squat rack"],
    1,
  ),
  m("dumbbell-bench-press", "push", "press", ["Dumbbell", "Bench"]),
  m("dumbbell-floor-press", "push", "press", ["Dumbbell"]),
  m("machine-chest-press", "push", "press", ["Chest press machine"]),
  m("smith-machine-bench-press", "push", "press", ["Smith machine", "Bench"]),
  m("push-up", "push", "press"),
  m("knee-push-up", "push", "press"),
  m("chest-dip", "push", "press", ["Dip station"], 1),
  m("incline-dumbbell-bench-press", "push", "incline-press", [
    "Dumbbell",
    "Bench",
  ]),
  m(
    "incline-barbell-bench-press",
    "push",
    "incline-press",
    ["Barbell", "Bench", "Squat rack"],
    1,
  ),
  m("incline-machine-chest-press", "push", "incline-press", [
    "Chest press machine",
  ]),
  m("smith-machine-incline-press", "push", "incline-press", [
    "Smith machine",
    "Bench",
  ]),
  m("standing-cable-fly", "push", "fly", ["Cable"]),
  m("low-to-high-cable-fly", "push", "fly", ["Cable"]),
  m("pec-deck-fly", "push", "fly", ["Chest fly machine"]),
  m("dumbbell-fly", "push", "fly", ["Dumbbell", "Bench"], 1),
  // Back
  m("barbell-bent-over-row", "pull", "row", ["Barbell"], 1),
  m("pendlay-row", "pull", "row", ["Barbell"], 1),
  m("dumbbell-bent-over-row", "pull", "row", ["Dumbbell"]),
  m("one-arm-dumbbell-row", "pull", "row", ["Dumbbell", "Bench"]),
  m("chest-supported-dumbbell-row", "pull", "row", ["Dumbbell", "Bench"]),
  m("kettlebell-row", "pull", "row", ["Kettlebell"]),
  m("seated-cable-row", "pull", "row", ["Cable"]),
  m("single-arm-cable-row", "pull", "row", ["Cable"]),
  m("machine-row", "pull", "row", ["Seated row machine"]),
  m("chest-supported-machine-row", "pull", "row", ["Seated row machine"]),
  m("inverted-row", "pull", "row", ["Barbell", "Squat rack"]),
  m("lat-pulldown", "pull", "vertical-pull", ["Cable"]),
  m("neutral-grip-lat-pulldown", "pull", "vertical-pull", ["Cable"]),
  m("single-arm-lat-pulldown", "pull", "vertical-pull", ["Cable"], 1),
  m("assisted-pull-up", "pull", "vertical-pull", ["Assisted pull-up machine"]),
  m("pull-up", "pull", "vertical-pull", ["Pull-up bar"], 1),
  m("chin-up", "pull", "vertical-pull", ["Pull-up bar"], 1),
  m("neutral-grip-pull-up", "pull", "vertical-pull", ["Pull-up bar"], 1),
  m("straight-arm-pulldown", "pull", "lat-isolation", ["Cable"], 1),
  m("dumbbell-pullover", "pull", "lat-isolation", ["Dumbbell", "Bench"], 1),
  m("band-face-pull", "pull", "rear-delt", ["Resistance band", "Band anchor"]),
  // Shoulders
  m("dumbbell-shoulder-press", "shoulder", "overhead-press", [
    "Dumbbell",
    "Bench",
  ]),
  m("seated-dumbbell-shoulder-press", "shoulder", "overhead-press", [
    "Dumbbell",
    "Bench",
  ]),
  m(
    "overhead-press",
    "shoulder",
    "overhead-press",
    ["Barbell", "Squat rack"],
    1,
  ),
  m("machine-shoulder-press", "shoulder", "overhead-press", [
    "Shoulder press machine",
  ]),
  m("arnold-press", "shoulder", "overhead-press", ["Dumbbell", "Bench"], 1),
  m("dumbbell-lateral-raise", "shoulder", "lateral-raise", ["Dumbbell"]),
  m("seated-lateral-raise", "shoulder", "lateral-raise", ["Dumbbell", "Bench"]),
  m("cable-lateral-raise", "shoulder", "lateral-raise", ["Cable"]),
  m("machine-lateral-raise", "shoulder", "lateral-raise", [
    "Lateral raise machine",
  ]),
  m("band-pull-apart", "shoulder", "rear-delt", ["Resistance band"]),
  m("bent-over-reverse-fly", "rear", "rear-delt", ["Dumbbell"]),
  m("chest-supported-reverse-fly", "rear", "rear-delt", ["Dumbbell", "Bench"]),
  m("cable-reverse-fly", "rear", "rear-delt", ["Cable"]),
  m("reverse-pec-deck", "rear", "rear-delt", ["Chest fly machine"]),
  m("face-pull", "rear", "rear-delt", ["Cable"]),
  // Arms
  m("dumbbell-curl", "biceps", "curl", ["Dumbbell"]),
  m("ez-bar-curl", "biceps", "curl", ["EZ bar"]),
  m("barbell-curl", "biceps", "curl", ["Barbell"], 1),
  m("cable-curl", "biceps", "curl", ["Cable"]),
  m("band-biceps-curl", "biceps", "curl", ["Resistance band"]),
  m("incline-dumbbell-curl", "biceps", "curl-lengthened", [
    "Dumbbell",
    "Bench",
  ]),
  m("behind-body-cable-curl", "biceps", "curl-lengthened", ["Cable"], 1),
  m("dumbbell-preacher-curl", "biceps", "curl-supported", [
    "Dumbbell",
    "Preacher curl bench",
  ]),
  m("barbell-preacher-curl", "biceps", "curl-supported", [
    "EZ bar",
    "Preacher curl bench",
  ]),
  m("spider-curl", "biceps", "curl-supported", ["Dumbbell", "Bench"]),
  m("concentration-curl", "biceps", "curl-supported", ["Dumbbell", "Bench"]),
  m("hammer-curl", "biceps", "curl-neutral", ["Dumbbell"]),
  m("rope-hammer-curl", "biceps", "curl-neutral", ["Cable"]),
  m("cross-body-hammer-curl", "biceps", "curl-neutral", ["Dumbbell"]),
  m("triceps-rope-pushdown", "triceps", "triceps-pushdown", ["Cable"]),
  m("v-bar-pushdown", "triceps", "triceps-pushdown", ["Cable"]),
  m("band-triceps-pushdown", "triceps", "triceps-pushdown", [
    "Resistance band",
    "Band anchor",
  ]),
  m("overhead-cable-triceps-extension", "triceps", "triceps-overhead", [
    "Cable",
  ]),
  m("single-arm-overhead-cable-extension", "triceps", "triceps-overhead", [
    "Cable",
  ]),
  m("two-hand-overhead-triceps-extension", "triceps", "triceps-overhead", [
    "Dumbbell",
  ]),
  m("ez-bar-skull-crusher", "triceps", "triceps-lying", ["EZ bar", "Bench"]),
  m("dumbbell-skull-crusher", "triceps", "triceps-lying", [
    "Dumbbell",
    "Bench",
  ]),
  m("triceps-dip", "triceps", "triceps-compound", ["Dip station"], 1),
  // Legs
  m("back-squat", "squat", "squat", ["Barbell", "Squat rack"], 1),
  m("front-squat", "squat", "squat", ["Barbell", "Squat rack"], 2),
  m("goblet-squat", "squat", "squat", ["Dumbbell"]),
  m("leg-press", "squat", "squat", ["Leg press machine"]),
  m("hack-squat", "squat", "squat", ["Hack squat machine"]),
  m("smith-machine-squat", "squat", "squat", ["Smith machine"]),
  m("bodyweight-squat", "squat", "squat"),
  m("dumbbell-split-squat", "squat", "single-leg", ["Dumbbell"]),
  m("bodyweight-split-squat", "squat", "single-leg"),
  m("bulgarian-split-squat", "squat", "single-leg", ["Dumbbell", "Bench"], 1),
  m("dumbbell-reverse-lunge", "squat", "single-leg", ["Dumbbell"]),
  m("dumbbell-walking-lunge", "squat", "single-leg", ["Dumbbell"], 1),
  m("dumbbell-step-up", "squat", "single-leg", ["Dumbbell", "Bench"]),
  m("leg-extension", "squat", "knee-extension", ["Leg extension machine"]),
  m("romanian-deadlift", "posterior", "hinge", ["Barbell"], 1),
  m("dumbbell-romanian-deadlift", "posterior", "hinge", ["Dumbbell"]),
  m(
    "single-leg-dumbbell-romanian-deadlift",
    "posterior",
    "hinge",
    ["Dumbbell"],
    1,
  ),
  m("kettlebell-deadlift", "posterior", "hinge", ["Kettlebell"]),
  m("band-good-morning", "posterior", "hinge", ["Resistance band"]),
  m("cable-pull-through", "posterior", "hinge", ["Cable"]),
  m("conventional-deadlift", "posterior", "deadlift", ["Barbell"], 1),
  m("bodyweight-glute-bridge", "posterior", "hip-thrust"),
  m("single-leg-glute-bridge", "posterior", "hip-thrust"),
  m("barbell-hip-thrust", "posterior", "hip-thrust", ["Barbell", "Bench"], 1),
  m("dumbbell-hip-thrust", "posterior", "hip-thrust", ["Dumbbell", "Bench"]),
  m("machine-hip-thrust", "posterior", "hip-thrust", ["Hip thrust machine"]),
  m("seated-leg-curl", "posterior", "knee-flexion", ["Leg curl machine"]),
  m("lying-leg-curl", "posterior", "knee-flexion", ["Leg curl machine"]),
  m("sliding-leg-curl", "posterior", "knee-flexion", [], 1),
  m("dumbbell-calf-raise", "calf", "calf", ["Dumbbell"]),
  m("single-leg-calf-raise", "calf", "calf"),
  m("standing-calf-raise", "calf", "calf", ["Calf raise machine"]),
  m("leg-press-calf-raise", "calf", "calf", ["Leg press machine"]),
  m("smith-machine-calf-raise", "calf", "calf", ["Smith machine"]),
  m("seated-calf-raise", "calf", "calf-bent-knee", ["Calf raise machine"]),
  // Trunk
  m("dead-bug", "core", "core-stability"),
  m("bird-dog", "core", "core-stability"),
  m("pallof-press", "core", "core-stability", ["Cable"]),
  m("side-plank-hip-lift", "core", "core-stability"),
  m("reverse-crunch", "core", "core-flexion"),
  m("cable-crunch", "core", "core-flexion", ["Cable"]),
  m("hanging-knee-raise", "core", "core-flexion", ["Pull-up bar"]),
  m("hanging-leg-raise", "core", "core-flexion", ["Pull-up bar"], 1),
];
export const menuMovement = (id: string) =>
  movementMenu.find((x) => x.id === id);
