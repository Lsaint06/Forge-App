import { restDayNames } from "../profile";
import type { CuratedProgram } from "../programs/model";
import { totalSessions } from "../programs/enrollment";
import { trainingWeekdays } from "../programs/schedule";
import { programWorkouts } from "../programs/presentation";

// How the Forge Path reveal (Phase 9.2) presents the program the engine
// recommended: in layers, each fact once, and in the athlete's words. Every
// value comes from the authored program or the athlete's own answers;
// nothing is reworded except the internal codes ("Forge Strength V2
// (I-S4)") that only Forge's authors need.

/** "Intermediate Strength · 4 Days" → "Intermediate Strength". */
export function revealTitle(program: Pick<CuratedProgram, "name">) {
  const family = program.name.split(" · ")[0]?.trim();
  return family || program.name;
}

const CODE_PREFIX = /^Forge [^:()]+\([A-Z]-[A-Z]\d\):\s*/;
const CODE_SENTENCE = /^Forge [^.]+ program [A-Z]-[A-Z]\d\.\s*/;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The authored summary without its internal code. */
export const plainSummary = (program: Pick<CuratedProgram, "summary">) =>
  capitalize(program.summary.replace(CODE_PREFIX, ""));

/** The authored description without its opening code sentence. */
export const plainDescription = (
  program: Pick<CuratedProgram, "description">,
) => program.description.replace(CODE_SENTENCE, "");

export type FitRow = { label: string; value: string };

/** Why it fits: one row for each of the athlete's answers. */
export function revealFit(
  program: Pick<CuratedProgram, "experience" | "goal" | "daysPerWeek">,
  restDay: number,
): FitRow[] {
  return [
    { label: "Experience", value: program.experience },
    {
      label: "Goal",
      value: program.goal === "Strength" ? "Strength" : "Muscle building",
    },
    { label: "Schedule", value: `${program.daysPerWeek} days a week` },
    { label: "Rest day", value: restDayNames[restDay] ?? "" },
  ];
}

export type RevealStat = { value: string; label: string };

/**
 * The program's shape in three numbers. Days a week is already in the
 * answers above, so it isn't repeated: a fixed program shows its weeks,
 * sessions and phases; an ongoing one its workouts and their size.
 */
export function revealStats(program: CuratedProgram): RevealStat[] {
  const total = totalSessions(program);
  if (program.durationWeeks !== undefined && total !== undefined)
    return [
      { value: String(program.durationWeeks), label: "Weeks" },
      { value: String(total), label: "Sessions" },
      ...(program.phases.length > 1
        ? [{ value: String(program.phases.length), label: "Phases" }]
        : []),
    ];
  const workouts = programWorkouts(program).workouts;
  const sizes = workouts.map((w) => w.session.exercises.length);
  const low = Math.min(...sizes);
  const high = Math.max(...sizes);
  return [
    { value: "Ongoing", label: "Length" },
    { value: String(workouts.length), label: "Workouts" },
    {
      value: low === high ? String(low) : `${low}–${high}`,
      label: "Exercises each",
    },
  ];
}

export type RevealDay = {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  /** The session it holds, in the order they run (1 = first). */
  session?: number;
  /** The rest day the athlete chose. */
  rest: boolean;
};

/** Monday to Sunday: which day holds which session, around the rest day. */
export function revealWeek(
  program: Pick<CuratedProgram, "weeklyPattern">,
  restDay: number,
): RevealDay[] {
  const order = trainingWeekdays(program.weeklyPattern, restDay);
  return restDayNames.map((_, day) => {
    const at = order.indexOf(day);
    return {
      day,
      ...(at >= 0 ? { session: at + 1 } : {}),
      rest: day === restDay,
    };
  });
}

/** The authored text, one sentence at a time; nothing reworded. */
export const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** What RIR means, for anyone meeting it for the first time. */
export const RIR_MEANING =
  "RIR means reps in reserve: how many more good reps you could still do when you end a set. 2–3 RIR stops two or three reps short of failure.";

/** The same, in one line under the phases. */
export const RIR_SHORT =
  "RIR is reps in reserve: how many good reps you leave in the tank. Lower is harder.";

/**
 * The progression as the sheet shows it: a short opening sentence as its
 * lead, then the rest one sentence at a time.
 */
export function progressionParts(text: string) {
  const all = sentences(text);
  const lead = all[0] && all[0].length <= 64 ? all[0] : undefined;
  return { lead, points: lead ? all.slice(1) : all };
}
