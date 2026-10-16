import type { Exercise, Prescription } from "../types";
import type { PathPreferences } from "./model";
import { exerciseStimulus } from "./stimulus";

// Forge programming policy (engine 8). Every prescription is derived from the
// movement's purpose, the Path's goal and the lifter's experience. See
// docs/research/PROGRAMMING_SPEC_V2.md for the evidence behind each value.
// These are starting prescriptions, not per-person optima: progression and
// the user's response adjust them over time.

export type Tier = "strength" | "compound" | "machine" | "isolation" | "core";
export type Experience = PathPreferences["experience"];
export type Goal =
  "foundation" | "hypertrophy" | "strength" | "recomp" | "athletic";
export type Policy = {
  sets: number;
  reps: number;
  repMax?: number;
  rest: number;
  rir: [number, number];
};

export function goalOf(p: Pick<PathPreferences, "pathKey">): Goal {
  switch (p.pathKey) {
    case "start-strong":
      return "foundation";
    case "build-muscle":
    case "advanced-physique":
      return "hypertrophy";
    case "get-strong":
      return "strength";
    case "lean-strong":
      return "recomp";
    case "athlete-mode":
      return "athletic";
  }
}
const level = (p: Pick<PathPreferences, "experience" | "pathKey">) =>
  goalOf(p) === "foundation" || p.experience === "Beginner"
    ? 0
    : p.experience === "Intermediate"
      ? 1
      : 2;

// Stable, guided loading (machines, cables, leg press) tolerates closer
// proximity to failure and slightly higher reps than free-weight compounds.
function isMachine(exercise: Exercise | undefined) {
  return (
    !!exercise &&
    /cable|machine|leg press|smith/i.test(exercise.equipment + exercise.id)
  );
}

// Heavy main lifts are identified from their prescription so saved and edited
// plans classify the same way generation did.
export function isHeavyStrength(
  item: Pick<Prescription, "reps" | "repMax" | "rest" | "exerciseId">,
) {
  return (
    !exerciseStimulus(item.exerciseId).isolation &&
    (item.repMax ?? item.reps) <= 6 &&
    item.rest >= 180
  );
}

export function exerciseTier(
  exerciseId: string,
  catalog: Exercise[],
  mainStrength = false,
): Tier {
  const stimulus = exerciseStimulus(exerciseId);
  if (stimulus.direct.length && stimulus.direct.every((m) => m === "Core"))
    return "core";
  if (stimulus.isolation) return "isolation";
  if (mainStrength) return "strength";
  return isMachine(catalog.find((e) => e.id === exerciseId))
    ? "machine"
    : "compound";
}

type Row = [Policy, Policy, Policy];
const rx = (
  sets: number,
  reps: number,
  repMax: number | undefined,
  rest: number,
  rir: [number, number],
): Policy => ({
  sets,
  reps,
  ...(repMax && repMax !== reps ? { repMax } : {}),
  rest,
  rir,
});

// [Beginner, Intermediate, Advanced]. Advanced lifters receive the same or
// fewer sets per exercise with closer proximity to failure; added weekly work
// comes from exercise selection and frequency, not five-set defaults.
const table: Record<Goal, Record<Tier | "lead", Row>> = {
  foundation: {
    lead: [
      rx(2, 8, 12, 90, [2, 3]),
      rx(2, 8, 12, 90, [2, 3]),
      rx(2, 8, 12, 90, [2, 3]),
    ],
    strength: [
      rx(2, 8, 12, 90, [2, 3]),
      rx(2, 8, 12, 90, [2, 3]),
      rx(2, 8, 12, 90, [2, 3]),
    ],
    compound: [
      rx(2, 8, 12, 90, [2, 3]),
      rx(2, 8, 12, 90, [2, 3]),
      rx(2, 8, 12, 90, [2, 3]),
    ],
    machine: [
      rx(2, 10, 12, 90, [2, 3]),
      rx(2, 10, 12, 90, [2, 3]),
      rx(2, 10, 12, 90, [2, 3]),
    ],
    isolation: [
      rx(2, 12, 15, 75, [2, 3]),
      rx(2, 12, 15, 75, [2, 3]),
      rx(2, 12, 15, 75, [2, 3]),
    ],
    core: [
      rx(2, 8, 12, 60, [2, 3]),
      rx(2, 8, 12, 60, [2, 3]),
      rx(2, 8, 12, 60, [2, 3]),
    ],
  },
  hypertrophy: {
    lead: [
      rx(3, 8, 10, 150, [2, 3]),
      rx(3, 6, 8, 180, [1, 2]),
      rx(3, 6, 8, 180, [1, 2]),
    ],
    strength: [
      rx(3, 8, 10, 150, [2, 3]),
      rx(3, 6, 8, 180, [1, 2]),
      rx(3, 6, 8, 180, [1, 2]),
    ],
    compound: [
      rx(2, 8, 12, 120, [2, 3]),
      rx(3, 8, 10, 150, [1, 2]),
      rx(3, 8, 10, 150, [1, 2]),
    ],
    machine: [
      rx(2, 10, 12, 120, [2, 3]),
      rx(3, 8, 12, 120, [1, 2]),
      rx(3, 8, 12, 120, [0, 2]),
    ],
    isolation: [
      rx(2, 12, 15, 75, [2, 3]),
      rx(3, 10, 15, 90, [1, 2]),
      rx(3, 10, 15, 90, [0, 1]),
    ],
    core: [
      rx(2, 10, 12, 60, [2, 3]),
      rx(2, 10, 15, 60, [1, 2]),
      rx(2, 10, 15, 60, [1, 2]),
    ],
  },
  strength: {
    lead: [
      rx(3, 5, undefined, 180, [2, 3]),
      rx(4, 4, 6, 210, [1, 2]),
      rx(4, 3, 5, 240, [1, 2]),
    ],
    strength: [
      rx(3, 5, undefined, 180, [2, 3]),
      rx(3, 4, 6, 210, [1, 2]),
      rx(3, 3, 5, 240, [1, 2]),
    ],
    compound: [
      rx(2, 8, 10, 150, [2, 3]),
      rx(2, 6, 8, 150, [2, 3]),
      rx(2, 6, 8, 150, [1, 2]),
    ],
    machine: [
      rx(2, 8, 10, 120, [2, 3]),
      rx(2, 8, 10, 120, [2, 3]),
      rx(2, 8, 10, 120, [1, 2]),
    ],
    isolation: [
      rx(2, 10, 12, 90, [2, 3]),
      rx(2, 10, 12, 90, [1, 2]),
      rx(2, 10, 12, 90, [1, 2]),
    ],
    core: [
      rx(2, 8, 12, 60, [2, 3]),
      rx(2, 8, 12, 60, [2, 3]),
      rx(2, 8, 12, 60, [2, 3]),
    ],
  },
  recomp: {
    lead: [
      rx(3, 8, 10, 120, [2, 3]),
      rx(3, 6, 8, 150, [1, 2]),
      rx(3, 6, 8, 150, [1, 2]),
    ],
    strength: [
      rx(3, 8, 10, 120, [2, 3]),
      rx(3, 6, 8, 150, [1, 2]),
      rx(3, 6, 8, 150, [1, 2]),
    ],
    compound: [
      rx(2, 8, 12, 120, [2, 3]),
      rx(3, 8, 10, 120, [1, 2]),
      rx(3, 8, 10, 120, [1, 2]),
    ],
    machine: [
      rx(2, 10, 12, 90, [2, 3]),
      rx(3, 10, 12, 90, [1, 2]),
      rx(3, 10, 12, 90, [1, 2]),
    ],
    isolation: [
      rx(2, 12, 15, 75, [2, 3]),
      rx(2, 12, 15, 75, [1, 2]),
      rx(3, 12, 15, 75, [0, 1]),
    ],
    core: [
      rx(2, 8, 12, 60, [2, 3]),
      rx(2, 10, 12, 60, [1, 2]),
      rx(2, 10, 12, 60, [1, 2]),
    ],
  },
  athletic: {
    lead: [
      rx(3, 6, 8, 150, [2, 3]),
      rx(3, 5, 6, 180, [2, 3]),
      rx(3, 4, 6, 180, [1, 2]),
    ],
    strength: [
      rx(3, 6, 8, 150, [2, 3]),
      rx(3, 5, 6, 180, [2, 3]),
      rx(3, 4, 6, 180, [1, 2]),
    ],
    compound: [
      rx(2, 8, 10, 120, [2, 3]),
      rx(3, 6, 8, 150, [2, 3]),
      rx(3, 6, 8, 150, [1, 2]),
    ],
    machine: [
      rx(2, 8, 10, 120, [2, 3]),
      rx(3, 8, 10, 120, [2, 3]),
      rx(3, 8, 10, 120, [1, 2]),
    ],
    isolation: [
      rx(2, 10, 12, 75, [2, 3]),
      rx(2, 10, 12, 75, [1, 2]),
      rx(2, 10, 12, 75, [1, 2]),
    ],
    core: [
      rx(2, 8, 10, 60, [2, 3]),
      rx(3, 8, 10, 60, [2, 3]),
      rx(3, 8, 10, 60, [2, 3]),
    ],
  },
};

// `lead` is the first loaded compound of a session (or a strength main lift).
export function prescriptionPolicy(
  p: Pick<PathPreferences, "experience" | "pathKey">,
  tier: Tier,
  lead: boolean,
): Policy {
  const row =
    table[goalOf(p)][
      lead && tier !== "isolation" && tier !== "core" ? "lead" : tier
    ];
  return row[level(p)]!;
}

// --- Weekly and session volume ------------------------------------------------

const major = new Set(["Chest", "Back", "Quads", "Hamstrings", "Glutes"]);
const indirectlyCovered = new Set([
  "Front delts",
  "Rear delts",
  "Glutes",
  "Core",
]);
type Range = { min: number; max: number };
const weeklyTargets: Record<
  Goal,
  [[Range, Range], [Range, Range], [Range, Range]]
> = {
  // [level][major, small]
  foundation: [
    [
      { min: 4, max: 10 },
      { min: 0, max: 6 },
    ],
    [
      { min: 4, max: 10 },
      { min: 0, max: 6 },
    ],
    [
      { min: 4, max: 10 },
      { min: 0, max: 6 },
    ],
  ],
  hypertrophy: [
    [
      { min: 6, max: 12 },
      { min: 2, max: 8 },
    ],
    [
      { min: 10, max: 18 },
      { min: 6, max: 12 },
    ],
    [
      { min: 12, max: 22 },
      { min: 8, max: 16 },
    ],
  ],
  // Strength is intensity-led: lower floors keep assistance from outgrowing
  // the main lifts while ceilings still limit fatigue.
  strength: [
    [
      { min: 4, max: 12 },
      { min: 0, max: 6 },
    ],
    [
      { min: 6, max: 16 },
      { min: 0, max: 8 },
    ],
    [
      { min: 6, max: 16 },
      { min: 0, max: 10 },
    ],
  ],
  // Recomposition and athletic Paths are moderate-volume by design.
  recomp: [
    [
      { min: 6, max: 12 },
      { min: 0, max: 8 },
    ],
    [
      { min: 8, max: 16 },
      { min: 2, max: 10 },
    ],
    [
      { min: 8, max: 18 },
      { min: 4, max: 12 },
    ],
  ],
  athletic: [
    [
      { min: 6, max: 12 },
      { min: 0, max: 8 },
    ],
    [
      { min: 8, max: 16 },
      { min: 2, max: 10 },
    ],
    [
      { min: 8, max: 18 },
      { min: 2, max: 12 },
    ],
  ],
};
export const PRIORITY_BONUS = 4;
// Weekly pulling sets should reach at least this share of pressing sets.
export const PULL_TO_PUSH = 0.67;
const priorityMuscles: Record<string, string[]> = {
  Chest: ["Chest"],
  Back: ["Back"],
  Shoulders: ["Side delts", "Front delts", "Rear delts"],
  Quadriceps: ["Quads"],
  Hamstrings: ["Hamstrings"],
  Glutes: ["Glutes"],
  Arms: ["Biceps", "Triceps"],
  Core: ["Core"],
};
export function isPriorityMuscle(p: PathPreferences, muscle: string) {
  return p.priorities.some((name) => priorityMuscles[name]?.includes(muscle));
}

// Weekly range for one muscle. The floor applies to direct sets and is capped
// by what the muscle's sessions can productively hold (about three direct
// sets per full-body session, five per split session), so a three-day plan is
// judged as a three-day plan. Priorities widen the ceiling and raise the
// floor; they never remove the ceiling.
export function weeklyVolumeTarget(
  p: PathPreferences,
  muscle: string,
  exposures = Infinity,
): Range {
  const range = weeklyTargets[goalOf(p)][level(p)][major.has(muscle) ? 0 : 1];
  // Front and rear delts receive substantial pressing/rowing assistance,
  // glutes are trained mainly through squats and hinges, and the trunk works
  // in every loaded compound, so they have a ceiling but no direct-set floor.
  const base = indirectlyCovered.has(muscle) ? { ...range, min: 0 } : range;
  const priority = isPriorityMuscle(p, muscle) && goalOf(p) !== "foundation";
  const target = !priority
    ? base
    : { min: Math.min(base.min + 2, base.max), max: base.max + PRIORITY_BONUS };
  return {
    ...target,
    min: Math.min(
      target.min,
      exposures * (setsPerExposure(p) + (priority ? 1 : 0)),
    ),
  };
}
const setsPerExposure = (p: Pick<PathPreferences, "frequency">) =>
  p.frequency <= 3 ? 3 : 5;

// Generated plans stop at about 60% of a muscle's weekly range, so defaults
// favour the minimum effective workload. The full ceiling remains available
// for Evolution's added volume and for deliberate user choices.
export const DEFAULT_CEILING_SHARE = 0.6;
export function generationCeiling(p: PathPreferences, muscle: string) {
  const target = weeklyVolumeTarget(p, muscle);
  return Math.round(
    target.min + (target.max - target.min) * DEFAULT_CEILING_SHARE,
  );
}

// Direct sets: sets of exercises whose primary target is the muscle. These are
// the only sets compared with weekly floors.
export function directSets(
  items: Pick<Prescription, "exerciseId" | "sets">[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const primary = exerciseStimulus(item.exerciseId).direct[0];
    if (primary) totals[primary] = (totals[primary] ?? 0) + item.sets;
  }
  return totals;
}
// Secondary involvement: sets of compound exercises that also list the muscle
// as a target (for example glutes in a squat or an RDL). Unweighted counts.
export function secondarySets(
  items: Pick<Prescription, "exerciseId" | "sets">[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items)
    for (const muscle of exerciseStimulus(item.exerciseId).direct.slice(1))
      totals[muscle] = (totals[muscle] ?? 0) + item.sets;
  return totals;
}
// Heuristic weight for secondary involvement when estimating a muscle's total
// training load. A planning convention, not a measured conversion: no
// reviewed study establishes a universal fraction.
export const SECONDARY_WEIGHT = 0.5;
// Estimated load (direct + weighted secondary). Used only for ceilings and
// fatigue warnings, never to satisfy a floor.
export function muscleLoad(
  items: Pick<Prescription, "exerciseId" | "sets">[],
): Record<string, number> {
  const totals = directSets(items);
  for (const [muscle, sets] of Object.entries(secondarySets(items)))
    totals[muscle] = (totals[muscle] ?? 0) + sets * SECONDARY_WEIGHT;
  return totals;
}
// Number of sessions in which each muscle receives direct sets.
export function directExposures(
  days: { exercises: Pick<Prescription, "exerciseId" | "sets">[] }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const day of days)
    for (const muscle of Object.keys(directSets(day.exercises)))
      totals[muscle] = (totals[muscle] ?? 0) + 1;
  return totals;
}

type Limits = Pick<PathPreferences, "experience" | "pathKey"> &
  Partial<Pick<PathPreferences, "frequency">>;
const fullBody = (p: Limits) =>
  (p.frequency ?? 4) <= 3 && goalOf(p) !== "foundation";

export function sessionMuscleCap(p: Limits) {
  return [8, 10, 12][level(p)]!;
}
// Full-body weeks spread every muscle across each session, so they use fewer
// exercises and sets per session than split weeks.
export function sessionExerciseCap(p: Limits) {
  return Math.min([6, 7, 8][level(p)]!, fullBody(p) ? 7 : 8);
}
export function sessionSetLimit(p: Limits) {
  return fullBody(p) ? [18, 21, 22][level(p)]! : [18, 22, 26][level(p)]!;
}
// Generation never exceeds four sets on one exercise; users may choose five.
export const GENERATED_SET_LIMIT = 4;
export const EDITABLE_SET_LIMIT = 5;
// Beginners keep a lower per-exercise ceiling while technique develops.
export function maxSetsPerExercise(
  p: Pick<PathPreferences, "experience" | "pathKey">,
  generated: boolean,
) {
  return level(p) === 0
    ? generated
      ? 3
      : 4
    : generated
      ? GENERATED_SET_LIMIT
      : EDITABLE_SET_LIMIT;
}

// --- Guidance shown with each prescription -------------------------------------

export function effortLabel(rir: [number, number]) {
  return rir[0] === rir[1]
    ? `${rir[0]} rep${rir[0] === 1 ? "" : "s"} in reserve`
    : `${rir[0]}–${rir[1]} reps in reserve`;
}

export function prescriptionGuidance(
  p: Pick<PathPreferences, "experience" | "pathKey">,
  item: Prescription,
  catalog: Exercise[],
  lead = false,
) {
  const tier = exerciseTier(
    item.exerciseId,
    catalog,
    goalOf(p) === "strength" && isHeavyStrength(item),
  );
  const policy = prescriptionPolicy(p, tier, lead);
  const effort = effortLabel(policy.rir);
  // Foundation settles loads at the easier end of the effort range; Evolution
  // works toward the harder end once technique and loads are established.
  const phases =
    policy.rir[0] === policy.rir[1]
      ? undefined
      : {
          foundation: `Weeks 1–4: about ${effortLabel([policy.rir[1], policy.rir[1]])} while you settle your loads.`,
          evolution: `Weeks 5–8: work toward about ${effortLabel([policy.rir[0], policy.rir[0]])}.`,
        };
  const top = item.repMax ?? item.reps;
  const progression =
    tier === "core"
      ? `Add reps toward ${top}, then slow the tempo or add load. Keep the trunk position strict.`
      : item.repMax == null || item.repMax === item.reps
        ? `Keep one load for all ${item.sets} sets. When every set reaches ${item.reps} reps with about ${effort}, add the smallest available load next session.`
        : `Keep one load for all ${item.sets} sets and add reps within ${item.reps}\u2060–\u2060${top}. When every set reaches ${top} with about ${effort}, add the smallest available load and build back up from ${item.reps}.`;
  return { tier, effort, progression, phases };
}

export const stallGuidance =
  "If you miss the bottom of the rep target on the same lift for two sessions in a row, reduce that load by about 10% and build back up. If several lifts stall together or joints ache, take a lighter week: same exercises, about half the sets, 3–4 reps in reserve.";
