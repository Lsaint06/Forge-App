import type { RepTarget, WorkoutSet } from "./types";
import type { ProgramAdvice } from "./programs/progression";
import type { ProgramExercise } from "./programs/model";
import { kgToLb } from "./metrics";
import { repRangeLabel, restGuidanceLabel } from "./prescriptions";

// Presentation helpers for the workout logger. They only format and select
// existing data; progression and prescriptions are computed elsewhere.

type Units = "kg" | "lb";
type Range = { min: number; max: number };

const rounded = (n: number) => Math.round(n * 100) / 100;
export const loadIn = (kg: number, units: Units) =>
  rounded(units === "lb" ? kgToLb(kg) : kg);
export const loadLabel = (kg: number, units: Units) =>
  `${loadIn(kg, units)} ${units}`;
export const rirLabel = (r: Range) =>
  r.min === r.max ? `${r.min} RIR` : `${r.min}–${r.max} RIR`;

/**
 * The one-line target under an exercise, e.g.
 * "4 × 6-8 reps per side · 2–3 RIR · rest 3–5 min".
 */
export function targetSummary({
  target,
  item,
  rir,
  rest,
  workingSets,
}: {
  target: RepTarget | undefined;
  item?: Pick<ProgramExercise, "perSide" | "rest">;
  rir?: Range;
  rest: number;
  workingSets: number;
}) {
  if (!target)
    return `${workingSets} working ${workingSets === 1 ? "set" : "sets"} · ${rest}s rest`;
  const parts = [
    `${target.sets} × ${repRangeLabel({ reps: target.min, repMax: target.max })} reps${item?.perSide ? " per side" : ""}`,
  ];
  if (rir) parts.push(rirLabel(rir));
  parts.push(item?.rest ? restGuidanceLabel(item.rest) : `${rest}s rest`);
  return parts.join(" · ");
}

/** Sets a suggested load would change: unfinished (working) sets. */
export const plannedSets = (sets: WorkoutSet[], structured: boolean) =>
  sets.filter((s) => !s.completed && (!structured || s.kind === "working"));

export type InlineAdvice = {
  headline: string;
  // Suggested load in kg when applying it would change a planned set.
  apply?: number;
  // What the advice means, for its icon: never contradicts the headline.
  kind:
    | "up"
    | "down"
    | "hold"
    | "lower-fatigue"
    | "assess"
    | "establish"
    | "review";
};

/**
 * The advice row shown above the sets, only when it helps this session:
 * a load that differs from the planned sets, or session context (lower
 * fatigue, assessment, choosing a starting load). Full reasoning stays in
 * the Progression sheet.
 */
export function inlineAdvice(
  advice:
    | (Pick<ProgramAdvice, "weight"> &
        Partial<Pick<ProgramAdvice, "action" | "rir">>)
    | undefined,
  plannedWeights: number[],
  units: Units,
): InlineAdvice | undefined {
  if (!advice || !plannedWeights.length) return undefined;
  const { action, weight, rir } = advice;
  const apply =
    weight != null &&
    (action !== undefined || weight > 0) &&
    plannedWeights.some((w) => Math.abs(w - weight) > 1e-6)
      ? weight
      : undefined;
  const load = weight != null ? loadLabel(weight, units) : "";
  const direction = (w: number): InlineAdvice["kind"] =>
    w > Math.max(...plannedWeights)
      ? "up"
      : w < Math.min(...plannedWeights)
        ? "down"
        : "hold";
  switch (action) {
    case undefined:
      return apply !== undefined
        ? { headline: `Suggested ${load}`, apply, kind: direction(apply) }
        : undefined;
    case "increase":
      return apply !== undefined
        ? { headline: `Increase to ${load}`, apply, kind: "up" }
        : undefined;
    case "reduce":
      return apply !== undefined
        ? { headline: `Consider ${load}`, apply, kind: "down" }
        : undefined;
    case "hold":
      return apply !== undefined
        ? { headline: `Stay at ${load}`, apply, kind: "hold" }
        : undefined;
    case "lower-fatigue":
      return {
        headline: "Lower-fatigue session · no increase",
        apply,
        kind: "lower-fatigue",
      };
    case "assess":
      return {
        headline: "Performance check · no increase",
        apply,
        kind: "assess",
      };
    case "establish":
      return {
        headline: `Choose a starting load${rir ? ` at ${rirLabel(rir)}` : ""}`,
        kind: "establish",
      };
    case "review":
      return { headline: "Choose this session's load", kind: "review" };
    case "manual":
      return undefined;
  }
}

/** The first sentence of an explanation (the rest stays one tap away). */
export function firstSentence(text: string) {
  const match = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return match ? match[0] : text.trim();
}

/**
 * The Progression sheet's lead: what to do this session, the load if there
 * is one, and the first sentence of the engine's reason. Wording only; the
 * advice itself comes unchanged from the progression engine.
 */
export function adviceSummary(
  advice:
    | (Pick<ProgramAdvice, "weight" | "reason"> &
        Partial<Pick<ProgramAdvice, "action">>)
    | undefined,
  units: Units,
):
  | { headline: string; load?: string; detail: string; more: boolean }
  | undefined {
  if (!advice) return undefined;
  const { action, weight, reason } = advice;
  const load = weight != null ? loadLabel(weight, units) : undefined;
  const headline = (() => {
    switch (action) {
      case "increase":
        return "Increase the load";
      case "reduce":
        return "Consider a lighter load";
      case "hold":
        return load ? "Stay at this load" : "Keep the same load";
      case "lower-fatigue":
        return "Lower-fatigue session";
      case "assess":
        return "Performance check";
      case "establish":
        return "Choose a starting load";
      case "review":
        return "Choose this session's load";
      case "manual":
        return "Set the load yourself";
      default:
        return load ? "Suggested load" : "No load suggestion yet";
    }
  })();
  const detail = firstSentence(reason);
  return { headline, load, detail, more: detail !== reason.trim() };
}
/**
 * Workout timer text: "4:05", "24:00", "1:04:00". Minutes are not padded
 * below an hour, and hours appear only when needed.
 */
export function timer(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Program and Path workouts are named "Program · Session"; the header leads
 * with the session (the part that changes) and keeps the full name for the
 * menu and screen readers.
 */
export function workoutTitle(name: string) {
  const parts = name.split(" · ");
  return parts.length > 1 ? parts[parts.length - 1]! : name;
}

/**
 * Keeps each " · " segment of a summary line together when it wraps: spaces
 * become non-breaking and word joiners stop breaks after "-" or "–" (so
 * "rest 3–5 min" never splits as "rest 3–" / "5 min").
 */
export const keepSegmentsTogether = (text: string) =>
  text
    .split(" · ")
    .map((part) =>
      part.replace(/ /g, "\u00a0").replace(/([–-])/g, "\u2060$1\u2060"),
    )
    .join(" · ");

/**
 * Pairs each set with the same-type set from the previous session (first
 * working set with first working set, first warm-up with first warm-up).
 */
export function previousBySet(
  current: WorkoutSet[],
  previous: WorkoutSet[] | undefined,
): (WorkoutSet | undefined)[] {
  const done = (previous ?? []).filter((s) => s.completed);
  const seen = new Map<WorkoutSet["kind"], number>();
  return current.map((s) => {
    const index = seen.get(s.kind) ?? 0;
    seen.set(s.kind, index + 1);
    return done.filter((p) => p.kind === s.kind)[index];
  });
}

/** Compact previous-set text for the set grid, plus a spoken version. */
export function previousText(
  s: WorkoutSet | undefined,
  category: string,
  units: Units,
): { text: string; spoken: string } {
  if (!s) return { text: "—", spoken: "No previous set" };
  if (category === "duration")
    return { text: `${s.duration}s`, spoken: `Previous ${s.duration} seconds` };
  if (category === "distance")
    return {
      text: `${s.distance} m`,
      spoken: `Previous ${s.distance} meters in ${s.duration} seconds`,
    };
  if (s.weight === 0)
    return { text: `${s.reps} reps`, spoken: `Previous ${s.reps} reps` };
  const load = Math.round(loadIn(s.weight, units) * 10) / 10;
  return {
    text: `${load}×${s.reps}`,
    spoken: `Previous ${load} ${units} × ${s.reps}`,
  };
}
