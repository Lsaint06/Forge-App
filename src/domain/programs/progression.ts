import type { WorkoutSet } from "../types";
import type {
  CuratedProgram,
  ExerciseRole,
  PhaseBlock,
  ProgramExercise,
} from "./model";

// Forge Strength V2 progression (docs/STRENGTH_V2.md). Pure and deterministic:
// advice comes only from the authored prescription and the lifter's recorded
// sets. RIR is treated as an estimated effort target; it is never inferred
// from repetitions, and a set without logged effort never counts as meeting
// the target.

type Range = { min: number; max: number };

// One earlier completed session of the same program session slot.
export type ProgramSessionEvidence = {
  week: number;
  block: PhaseBlock | undefined;
  lowerFatigue: boolean;
  sets: WorkoutSet[];
};

export type ProgramAdvice = {
  action:
    | "establish"
    | "increase"
    | "hold"
    | "reduce"
    | "lower-fatigue"
    | "assess"
    | "manual"
    | "review";
  // Suggested working load in kg; null when Forge cannot suggest one.
  weight: number | null;
  // Working sets for this session (reduced in a lower-fatigue session).
  sets: number;
  rir: Range | undefined;
  reason: string;
  // Two sessions at the same load without added reps.
  stalled: boolean;
};

// Working sets after a reduction, rounded, keeping at least one set.
export const reducedSets = (sets: number, reduction: number) =>
  Math.max(1, Math.round(sets * (1 - reduction)));

// The set reduction that applies to a session: a lower-fatigue session uses
// the program's lower-fatigue setting; otherwise the phase default (e.g. the
// reduced-volume assessment week), if any.
export function sessionSetReduction(
  program: CuratedProgram,
  phase: CuratedProgram["phases"][number],
  lowerFatigue: boolean,
): number | undefined {
  if (lowerFatigue && program.lowerFatigue)
    return program.lowerFatigue.setReduction;
  return phase.setReduction;
}

export function rirTarget(
  program: CuratedProgram,
  phase: CuratedProgram["phases"][number],
  item: ProgramExercise,
  lowerFatigue: boolean,
): Range | undefined {
  if (lowerFatigue && program.lowerFatigue) return program.lowerFatigue.rir;
  return phase.rir?.[(item.role ?? "accessory") as ExerciseRole];
}

const rirLabel = (r: Range | undefined) =>
  !r
    ? "your target effort"
    : r.min === r.max
      ? `${r.min} RIR`
      : `${r.min}–${r.max} RIR`;
const repLabel = (r: Range) =>
  r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;

// Estimated reps in reserve for one set: logged RIR, else 10 − RPE.
const effort = (s: WorkoutSet) =>
  s.rir != null ? s.rir : s.rpe != null ? 10 - s.rpe : null;

function summarize(h: ProgramSessionEvidence, item: ProgramExercise) {
  const done = h.sets.filter((s) => s.kind === "working" && s.completed);
  const loads = new Set(done.map((s) => s.weight));
  const efforts = done.map(effort);
  return {
    done,
    load: loads.size === 1 ? done[0]!.weight : null,
    complete: done.length >= item.sets,
    allTop: done.length > 0 && done.every((s) => s.reps >= item.reps.max),
    belowMin: done.some((s) => s.reps < item.reps.min),
    effortKnown: done.length > 0 && efforts.every((e) => e != null),
    minRir: Math.min(...efforts.map((e) => e ?? Infinity)),
    totalReps: done.reduce((n, s) => n + s.reps, 0),
  };
}

const roundTo = (n: number) => Math.round(n * 1000) / 1000;
function reduced(weight: number, increment: number) {
  const target = weight * 0.9;
  return increment > 0
    ? roundTo(Math.floor(target / increment) * increment)
    : roundTo(target);
}

export function programProgression({
  program,
  phase,
  item,
  history,
  increment,
  lowerFatigue,
}: {
  program: CuratedProgram;
  phase: CuratedProgram["phases"][number];
  item: ProgramExercise;
  // Earlier sessions of the same program session slot, newest first.
  history: readonly ProgramSessionEvidence[];
  increment: number;
  lowerFatigue: boolean;
}): ProgramAdvice {
  const rir = rirTarget(program, phase, item, lowerFatigue);
  const reduction = sessionSetReduction(program, phase, lowerFatigue);
  const sets =
    reduction === undefined ? item.sets : reducedSets(item.sets, reduction);
  const range = `${repLabel(item.reps)}${item.perSide ? " per side" : ""}`;
  const advice = (
    action: ProgramAdvice["action"],
    weight: number | null,
    reason: string,
    stalled = false,
  ): ProgramAdvice => ({ action, weight, sets, rir, reason, stalled });

  if (item.loading)
    return advice(
      "manual",
      null,
      `Forge cannot yet tell assistance from added load in logged sets, so it will not suggest a load here. Build reps within ${range} at ${rirLabel(rir)}, then adjust assistance or added load yourself.`,
    );

  // Lower-fatigue and assessment sessions are not evidence for load changes.
  const evidence = history
    .filter((h) => !h.lowerFatigue && h.block !== "assessment")
    .map((h) => summarize(h, item))
    .filter((h) => h.done.length > 0);
  const last = evidence[0];
  const prev = evidence[1];

  if (lowerFatigue)
    return advice(
      "lower-fatigue",
      last?.load ?? null,
      `Lower-fatigue session: ${sets} working ${sets === 1 ? "set" : "sets"} at ${rirLabel(rir)}. Keep the load from your last full session or reduce it. No increase this session.`,
    );
  if (phase.block === "assessment")
    return advice(
      "assess",
      last?.load ?? null,
      `Performance check at ${rirLabel(rir)}: ${sets} working ${sets === 1 ? "set" : "sets"}, starting from your last earned load and adjusting by readiness. No maximal attempts or grinding reps, and no load increase this week. Your logged sets are the result.`,
    );
  if (!last)
    return advice(
      "establish",
      null,
      `Choose a load you can lift for ${range} reps on every working set at about ${rirLabel(rir)}. Warm-up sets are separate. Forge builds from what you record.`,
    );
  if (last.load === null)
    return advice(
      "review",
      null,
      "Working-set loads differed last time. Choose this session's load manually.",
    );
  if (last.load === 0)
    return advice(
      "manual",
      null,
      "No external load was logged last time. Choose any added load manually.",
    );
  if (!last.complete || last.belowMin) {
    if (prev && (!prev.complete || prev.belowMin) && prev.load === last.load)
      return advice(
        "reduce",
        reduced(last.load, increment),
        `Prescribed work was missed in your last two sessions at the same load. Consider about 10% less load, or keep it if recovery was the cause. Your history is unchanged.`,
      );
    return advice(
      "hold",
      last.load,
      `Last session fell short of ${item.sets} × ${range}. Keep the same load or reduce it if recovery is poor. No increase until every working set reaches the range.`,
    );
  }
  const eligible = () =>
    advice(
      "increase",
      roundTo(last.load! + increment),
      `Every working set reached ${item.reps.max} reps at ${rirLabel(rir)} or easier. Add one load increment and build back up through the range, if technique and recovery allow.`,
    );
  if (last.allTop) {
    if (!last.effortKnown)
      return advice(
        "hold",
        last.load,
        `Every set reached ${item.reps.max} reps, but effort (RIR or RPE) was not logged on every set. Log effort to qualify for an increase; Forge does not assume the target was met.`,
      );
    if (rir && last.minRir < rir.min)
      return advice(
        "hold",
        last.load,
        `Reps reached the top of the range, but effort was harder than ${rirLabel(rir)}. Keep the same load until that work meets the target.`,
      );
    return eligible();
  }
  // Advanced autoregulation: load that was clearly easier than the target on
  // every set may rise before reps reach the top of the range.
  if (
    program.progressionModel === "autoregulated" &&
    rir &&
    last.effortKnown &&
    last.minRir > rir.max
  )
    return advice(
      "increase",
      roundTo(last.load + increment),
      `Every working set was easier than ${rirLabel(rir)}. Add one load increment and keep reps within ${range}.`,
    );
  const stalled =
    !!prev &&
    prev.complete &&
    !prev.belowMin &&
    prev.load === last.load &&
    last.totalReps <= prev.totalReps;
  return advice(
    "hold",
    last.load,
    `Keep the same load and build reps toward ${item.reps.max} on every working set at ${rirLabel(rir)}.${
      stalled
        ? " Reps have not improved over your last two sessions at this load. If you feel run down, choose a lower-fatigue session."
        : ""
    }`,
    stalled,
  );
}
