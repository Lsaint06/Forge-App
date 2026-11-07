import type { CuratedProgram } from "../programs/model";
import { totalSessions } from "../programs/enrollment";
import { restDayNames } from "../profile";
import { revealSessions, revealTitle, type SessionDay } from "./reveal";

// What Forge Premium's step after the reveal (Phase 9.3) says about the
// athlete's own Forge Path: its structure, exactly as the reveal showed it,
// and never the program itself (founder rule: each training day's focus and
// number of exercises; no exercise, set or rep). Pure and plain: the
// membership screens are handed this and never reach the program library or
// the athlete's data themselves.

export type PremiumPath = {
  /** "Built for Jordan"; "Built for you" without a name. */
  builtFor: string;
  /** "Intermediate Strength": the program's family, as the reveal titles it. */
  title: string;
  /** "4 days a week · 32 sessions · Sunday rest". */
  meta: string;
  daysPerWeek: number;
  /** A fixed program's length; an ongoing program has none. */
  weeks?: number;
  /** The first week's training days: focus and exercise counts only. */
  days: SessionDay[];
};

export function premiumPath(
  program: CuratedProgram,
  name: string | undefined,
  restDay: number,
): PremiumPath {
  const sessions = totalSessions(program);
  const fixed = program.durationWeeks !== undefined && sessions !== undefined;
  const rest = restDayNames[restDay];
  return {
    builtFor: name?.trim() ? `Built for ${name.trim()}` : "Built for you",
    title: revealTitle(program),
    meta: [
      `${program.daysPerWeek} days a week`,
      ...(fixed ? [`${sessions} sessions`] : []),
      ...(rest ? [`${rest} rest`] : []),
    ].join(" · "),
    daysPerWeek: program.daysPerWeek,
    ...(program.durationWeeks !== undefined
      ? { weeks: program.durationWeeks }
      : {}),
    days: revealSessions(program, restDay),
  };
}

/** What Forge Premium's step says: its headline, and what it includes. */
export type Story = {
  /** The headline, a line each, no closing punctuation (Stage A's rule). */
  statement: [string, string];
  /** The words of the first line drawn in Forge's accent. */
  accent: string;
  /** One plain sentence under it. */
  support: string;
  /** What Forge Premium includes: a title and one sentence each. */
  nodes: { title: string; detail: string }[];
};

/**
 * What Forge Premium includes, in the founder's words (2026-11-07): what
 * Forge does today (Discover's four pages), and nothing it doesn't.
 */
export const PREMIUM_KEEPS = {
  plan: {
    title: "Personalized Training",
    detail: "Programs tailored to your goals, experience, and schedule.",
  },
  sets: {
    title: "Workout Tracking",
    detail: "Log sets, monitor performance, and track every workout.",
  },
  proof: {
    title: "Performance Analytics",
    detail:
      "Visualize strength progression, personal records, and training consistency.",
  },
  fuel: {
    title: "Nutrition Tracking",
    detail:
      "Track calories and macronutrients with an extensive food database.",
  },
};

/**
 * With the athlete's Forge Path, the headline is theirs: every week of it,
 * and all of Forge. Without one (You → Account) it says what the
 * membership is.
 */
export function premiumStory(path?: PremiumPath): Story {
  const k = PREMIUM_KEEPS;
  const nodes = [k.plan, k.sets, k.proof, k.fuel];
  if (!path)
    return {
      statement: ["One membership", "All of Forge"],
      accent: "One",
      support:
        "Every Forge Path, and everything that keeps it moving, in one membership.",
      nodes,
    };
  const weeks = path.weeks ? `${path.weeks} weeks` : undefined;
  return {
    statement: [weeks ? `All ${weeks}` : "Every week", "All of Forge"],
    accent: weeks ?? "Every week",
    support:
      "Your Forge Path is ready. Forge Premium carries it from the first set to the last.",
    nodes,
  };
}

/** The pass's last line: what the preview leaves for the membership. */
export const PASS_NOTE = "Every exercise, set and rep comes with Forge Premium";

/** The decision's heading and its one sentence. */
export const MEMBERSHIP_INTRO = {
  title: "Your membership",
  support:
    "Every Forge Path and every tool, in one plan. Cancel anytime. Your training always stays yours.",
};
