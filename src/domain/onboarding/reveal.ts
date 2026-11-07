import { restDayNames } from "../profile";
import type { CuratedProgram } from "../programs/model";
import { totalSessions } from "../programs/enrollment";
import { trainingWeekdays } from "../programs/schedule";
import { programWorkouts } from "../programs/presentation";

// How the Forge Path reveal (Phase 9.2) presents the program the engine
// recommended: in layers, each fact once, and in the athlete's words. Every
// value comes from the authored program or the athlete's own answers.
//
// Before a membership the reveal is a preview (Phase 9.3, founder rule): it
// shows the path's structure and how it was personalized, never the program
// itself. Each training day says its focus and how many exercises it holds;
// no exercise, set, rep, effort or progression appears.

/** "Intermediate Strength · 4 Days" → "Intermediate Strength". */
export function revealTitle(program: Pick<CuratedProgram, "name">) {
  const family = program.name.split(" · ")[0]?.trim();
  return family || program.name;
}

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

export type SessionDay = {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  /** "Upper A": the session's name, before the emphasis in brackets. */
  title: string;
  /** "Chest & Back": the emphasis the name gives, when it gives one. */
  focus?: string;
  /** How many exercises the session holds; never which. */
  exercises: number;
};

/** "Upper A (Chest & Back)" → "Upper A" and "Chest & Back". */
export function sessionLabel(name: string): { title: string; focus?: string } {
  const named = name.trim();
  const m = named.match(/^(.+?)\s*\(([^()]+)\)$/);
  return m ? { title: m[1]!, focus: m[2]!.trim() } : { title: named };
}

/**
 * The athlete's training days in their first week, around their rest day:
 * each day's session by its name and focus, and how many exercises it
 * holds. This is all the preview shows of the program.
 */
export function revealSessions(
  program: Pick<CuratedProgram, "weeklyPattern" | "phases">,
  restDay: number,
): SessionDay[] {
  const sessions = program.phases[0]?.sessions ?? [];
  return revealWeek(program, restDay).flatMap((d) => {
    const s = d.session === undefined ? undefined : sessions[d.session - 1];
    return s
      ? [{ day: d.day, ...sessionLabel(s.name), exercises: s.exercises.length }]
      : [];
  });
}
