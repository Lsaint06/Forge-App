import type { CuratedProgram, ProgramExercise, ProgramSession } from "./model";
import { reducedSets, sessionSetReduction } from "./progression";
import { restGuidanceLabel } from "../prescriptions";

// How Forge Paths presents curated programs (Design System 2.0, Phase 4).
// Read-only: nothing here changes, merges or adapts a program. Each of the
// published programs stays a distinct authored program; families only group
// them for browsing.

type Phase = CuratedProgram["phases"][number];
type Range = { min: number; max: number };

export const rangeText = (r: Range) =>
  r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;

export const durationText = (p: Pick<CuratedProgram, "durationWeeks">) =>
  p.durationWeeks ? `${p.durationWeeks} weeks` : "Ongoing";

/** "Intermediate · Strength · 4 days · 8 weeks" */
export const programFacts = (p: CuratedProgram) =>
  `${p.experience} · ${p.goal} · ${p.daysPerWeek} days · ${durationText(p)}`;

/**
 * A program name for headings: "4 Days" never wraps apart, so a long name
 * breaks at the "·" instead.
 */
export const programTitle = (name: string) =>
  name.replace(/ (\d+) Days$/, " $1\u00a0Days");

// ---- Families -------------------------------------------------------------

export type ProgramFamily = {
  key: string;
  name: string;
  experience: CuratedProgram["experience"];
  goal: CuratedProgram["goal"];
  /** The family's distinct programs, fewest days first. */
  programs: CuratedProgram[];
};

const experienceOrder = ["Beginner", "Intermediate", "Advanced"];
const goalOrder = ["Strength", "Muscle Building"];

export const familyKey = (p: Pick<CuratedProgram, "experience" | "goal">) =>
  `${p.experience}|${p.goal}`;
export const familyName = (p: Pick<CuratedProgram, "experience" | "goal">) =>
  `${p.experience} ${p.goal}`;

/** Groups programs by experience and goal (Strength first, then by level). */
export function programFamilies(
  programs: readonly CuratedProgram[],
): ProgramFamily[] {
  const map = new Map<string, ProgramFamily>();
  for (const p of programs) {
    const key = familyKey(p);
    const family = map.get(key) ?? {
      key,
      name: familyName(p),
      experience: p.experience,
      goal: p.goal,
      programs: [],
    };
    family.programs.push(p);
    map.set(key, family);
  }
  return [...map.values()]
    .map((f) => ({
      ...f,
      programs: [...f.programs].sort((a, b) => a.daysPerWeek - b.daysPerWeek),
    }))
    .sort(
      (a, b) =>
        goalOrder.indexOf(a.goal) - goalOrder.indexOf(b.goal) ||
        experienceOrder.indexOf(a.experience) -
          experienceOrder.indexOf(b.experience),
    );
}

/**
 * The variant to show first: the one closest to the lifter's weekly workout
 * goal, preferring fewer days on a tie (the recommendation's rule).
 */
export function preferredVariant(family: ProgramFamily, frequency: number) {
  return [...family.programs].sort(
    (a, b) =>
      Math.abs(a.daysPerWeek - frequency) -
        Math.abs(b.daysPerWeek - frequency) || a.daysPerWeek - b.daysPerWeek,
  )[0]!;
}

/** "3, 4 or 5 days · 8 weeks" */
export function familyFacts(family: ProgramFamily) {
  const days = family.programs.map((p) => p.daysPerWeek);
  const dayText =
    days.length === 1
      ? `${days[0]} days`
      : `${days.slice(0, -1).join(", ")} or ${days.at(-1)} days`;
  const durations = [...new Set(family.programs.map(durationText))];
  return `${dayText} · ${durations.join(" or ")}`;
}

// ---- Workouts ---------------------------------------------------------------

// Order-independent canonical text of a value, so two workouts compare equal
// only when every authored field matches.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

export type WorkoutVariant = {
  session: ProgramSession;
  /** Indexes of the phases that use exactly this workout. */
  phases: number[];
};

/**
 * Each distinct workout once, with the phases that use it. Workouts are
 * identical only when every authored field matches (exercises, order, sets,
 * reps, rest, roles, notes, loading, names); any difference in any phase is
 * kept as its own variant and shown with its phases, so nothing authored for
 * a phase is hidden. `uniform` is true when every workout is the same in
 * every phase.
 */
export function programWorkouts(program: CuratedProgram) {
  const byKey = new Map<string, WorkoutVariant>();
  const order: string[] = [];
  const idOrder: string[] = [];
  program.phases.forEach((phase, p) =>
    phase.sessions.forEach((session) => {
      const key = canonical(session);
      const found = byKey.get(key);
      if (found) found.phases.push(p);
      else {
        byKey.set(key, { session, phases: [p] });
        order.push(key);
      }
      if (!idOrder.includes(session.id)) idOrder.push(session.id);
    }),
  );
  // Variants of the same workout sit together, in first-appearance order.
  const workouts = idOrder.flatMap((id) =>
    order.map((k) => byKey.get(k)!).filter((v) => v.session.id === id),
  );
  const uniform = workouts.every(
    (w) => w.phases.length === program.phases.length,
  );
  return { workouts, uniform };
}

/** "4 × 3–5 reps per side · Primary · rest 3–5 min" */
export function prescriptionLine(item: ProgramExercise, setReduction?: number) {
  const sets =
    setReduction === undefined
      ? item.sets
      : reducedSets(item.sets, setReduction);
  return [
    `${sets} × ${rangeText(item.reps)} reps${item.perSide ? " per side" : ""}`,
    item.role && item.role.charAt(0).toUpperCase() + item.role.slice(1),
    item.rest ? restGuidanceLabel(item.rest) : `${item.restSeconds}s rest`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---- Phases -----------------------------------------------------------------

export type PhaseStep = {
  index: number;
  phase: Phase;
  name: string;
  /** "Weeks 1–3", "Week 8", or "Every week" for open-ended programs. */
  weeks: string;
  /** Primary-lift effort, e.g. "RIR 2–3". */
  effort?: string;
  /** Planned working-set reduction for this phase, as a fraction. */
  reduction?: number;
  lowerFatigue: boolean;
};

export function phaseTimeline(program: CuratedProgram): PhaseStep[] {
  let week = 1;
  return program.phases.map((phase, index) => {
    const start = week;
    week += phase.weeks ?? 0;
    const end = week - 1;
    const lowerFatigue = phase.block === "lower-fatigue";
    return {
      index,
      phase,
      name: phase.name,
      weeks: !phase.weeks
        ? "Every week"
        : start === end
          ? `Week ${start}`
          : `Weeks ${start}–${end}`,
      ...(phase.rir ? { effort: `RIR ${rangeText(phase.rir.primary)}` } : {}),
      ...(sessionSetReduction(program, phase, lowerFatigue) !== undefined
        ? { reduction: sessionSetReduction(program, phase, lowerFatigue) }
        : {}),
      lowerFatigue,
    };
  });
}

/** "RIR 2–3 · about 30% fewer working sets" */
export function phaseSummary(step: PhaseStep) {
  return [
    step.effort,
    step.reduction !== undefined &&
      `about ${Math.round(step.reduction * 100)}% fewer working sets`,
  ]
    .filter(Boolean)
    .join(" · ");
}
