import { defaults, type Profile } from "../types";
import { profileSchema } from "../validation";
import {
  experienceLevel,
  trainingGoal,
  type ExperienceLevel,
  type TrainingGoal,
} from "../profile";
import {
  findProgramVersion,
  programKey,
  publishedPrograms,
  type CuratedProgram,
  type ProgramSession,
} from "../programs/model";
import { recommendProgram } from "../programs/recommend";
import { trainingWeekdays } from "../programs/schedule";
import { programWorkouts } from "../programs/presentation";

// First-time setup (Phase 9.2): About you, Your training, then the Forge
// Path the real engine recommends. What the athlete enters is saved to the
// profile the moment it is valid, as setup always has; this record only
// says where they are, whether they chose their days a week, and which
// program they were shown, so setup resumes exactly after a restart. It is a
// local setting: never synchronized, never in a backup, cleared once setup is
// done or when this phone's data is deleted. Nothing here enrolls, purchases
// or checks a membership.

/** The setting that holds where first-time setup is (JSON). */
export const ONBOARDING_KEY = "onboarding";
/** Set once this phone has left the brand intro (signed out, fresh phone). */
export const INTRO_KEY = "onboardingIntro";

export const STAGES = ["about", "training", "reveal"] as const;
export type Stage = (typeof STAGES)[number];

export type Progress = {
  stage: Stage;
  /** Days a week, once the athlete chose them (also the profile's frequency). */
  days?: number;
  /** The program shown at the reveal ("id@version"). */
  revealed?: string;
};

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*@[1-9]\d{0,5}$/;

/** The stored record; anything unreadable starts setup from About you. */
export function readProgress(raw: string | null | undefined): Progress {
  try {
    const p = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    if (
      p &&
      typeof p === "object" &&
      (STAGES as readonly unknown[]).includes(p.stage)
    )
      return {
        stage: p.stage as Stage,
        ...(Number.isInteger(p.days) ? { days: p.days as number } : {}),
        ...(typeof p.revealed === "string" && KEY.test(p.revealed)
          ? { revealed: p.revealed }
          : {}),
      };
  } catch {
    // Unreadable: start again from About you; the profile keeps its values.
  }
  return { stage: "about" };
}

export const writeProgress = (p: Progress) => JSON.stringify({ v: 1, ...p });

// ---- About you -----------------------------------------------------------------

export type AboutField = "name" | "height" | "weight" | "bodyFat";

/**
 * About you's fields that keep setup from continuing: the profile's own
 * rules (profileSchema), plus a height and a starting weight, which setup
 * has always required.
 */
export function aboutIssues(p: Profile): AboutField[] {
  const valid = (key: AboutField) =>
    profileSchema.shape[key].safeParse(p[key]).success;
  return [
    ...(valid("name") ? [] : ["name" as const]),
    ...(valid("height") && p.height > 0 ? [] : ["height" as const]),
    ...(valid("weight") && p.weight > 0 ? [] : ["weight" as const]),
    ...(valid("bodyFat") ? [] : ["bodyFat" as const]),
  ];
}

/** The name field starts empty while the profile holds the default name. */
export const nameInput = (p: Pick<Profile, "name">) =>
  p.name === defaults.name ? "" : p.name;
/** An empty name keeps the default, as setup always has. */
export const nameValue = (text: string) => text.trim() || defaults.name;

// ---- Your training ------------------------------------------------------------

/**
 * The days a week Forge Paths can offer: the published programs' own day
 * counts, for the chosen experience and goal (any, until they are chosen).
 * Nothing else is offered, so every answer has a program written for it.
 */
export function supportedDays(
  library: readonly CuratedProgram[],
  experience?: ExperienceLevel,
  goal?: TrainingGoal,
): number[] {
  const days = publishedPrograms(library)
    .filter(
      (p) =>
        (!experience || p.experience === experience) &&
        (!goal || p.goal === goal),
    )
    .map((p) => p.daysPerWeek);
  return [...new Set(days)].sort((a, b) => a - b);
}

export type TrainingAnswers = {
  experience?: ExperienceLevel;
  goal?: TrainingGoal;
  days?: number;
  restDay?: number;
};

/**
 * What the athlete has answered about their training. Days a week count
 * only once chosen here, still in the profile, and still offered for their
 * experience and goal (a new default never counts as a choice).
 */
export function trainingAnswers(
  p: Profile,
  progress: Progress,
  library: readonly CuratedProgram[],
): TrainingAnswers {
  const experience = experienceLevel(p);
  const goal = trainingGoal(p);
  const days =
    progress.days !== undefined &&
    progress.days === p.frequency &&
    supportedDays(library, experience, goal).includes(progress.days)
      ? progress.days
      : undefined;
  return { experience, goal, days, restDay: p.restDay };
}

export const trainingComplete = (a: TrainingAnswers) =>
  !!a.experience && !!a.goal && a.days !== undefined && a.restDay !== undefined;

/** What Your training still needs, in the order it is asked. */
export function trainingMissing(a: TrainingAnswers) {
  return [
    ...(a.experience ? [] : ["your experience"]),
    ...(a.goal ? [] : ["your goal"]),
    ...(a.days !== undefined ? [] : ["days a week"]),
    ...(a.restDay !== undefined ? [] : ["a rest day"]),
  ];
}

/**
 * Where setup resumes: the stage the athlete was on, but never past one
 * whose answers are missing (a record from elsewhere can't skip a step).
 */
export function resumeStage(
  p: Profile,
  progress: Progress,
  library: readonly CuratedProgram[],
): Stage {
  if (progress.stage === "about" || aboutIssues(p).length) return "about";
  if (!trainingComplete(trainingAnswers(p, progress, library)))
    return "training";
  return progress.stage;
}

// ---- Your Forge Path -----------------------------------------------------------

export type Reveal = {
  program: CuratedProgram;
  /** The engine's own reasons, from the athlete's answers. */
  reasons: string[];
  /** The same family's other day counts. */
  alternatives: CuratedProgram[];
  /** Suggested training weekdays (0 = Monday), Monday first. */
  weekdays: number[];
  restDay: number;
};

/**
 * The Forge Path for the athlete's answers: `recommendProgram`'s own match,
 * written for exactly the days they chose. The version first shown stays
 * while it is still published and still fits (an app update can't change
 * the reveal under them); otherwise the current recommendation.
 */
export function revealFor(
  p: Profile,
  progress: Progress,
  library: readonly CuratedProgram[],
): Reveal | undefined {
  const a = trainingAnswers(p, progress, library);
  if (!trainingComplete(a)) return undefined;
  const rec = recommendProgram({ ...p, frequency: a.days! }, library);
  if (rec.kind !== "match" || rec.program.daysPerWeek !== a.days)
    return undefined;
  let program = rec.program;
  if (progress.revealed && progress.revealed !== programKey(program)) {
    const at = progress.revealed.lastIndexOf("@");
    const kept = findProgramVersion(
      library,
      progress.revealed.slice(0, at),
      Number(progress.revealed.slice(at + 1)),
    );
    if (
      kept?.id === program.id &&
      kept.experience === a.experience &&
      kept.goal === a.goal &&
      kept.daysPerWeek === a.days
    )
      program = kept;
  }
  return {
    program,
    reasons: rec.reasons,
    alternatives: rec.alternatives,
    weekdays: trainingWeekdays(program.weeklyPattern, a.restDay)
      .slice()
      .sort((x, y) => x - y),
    restDay: a.restDay!,
  };
}

export type RevealWorkout = {
  session: ProgramSession;
  /** Its place in each training week: sessions run in this order. */
  day: number;
  /** The phases (indexes) that use exactly this workout. */
  phases: number[];
};

/**
 * Every distinct workout once (`programWorkouts`), with its day of the
 * training week. A workout that changes between phases is listed for each
 * version, with its phases.
 */
export function revealWorkouts(program: CuratedProgram): RevealWorkout[] {
  return programWorkouts(program).workouts.map((w) => ({
    session: w.session,
    day:
      program.phases[w.phases[0]!]!.sessions.findIndex(
        (s) => s.id === w.session.id,
      ) + 1,
    phases: w.phases,
  }));
}

/**
 * What follows the reveal. Phase 9.2 has no membership step: setup ends and
 * Forge opens, with nothing started. The paywall (Phase 9.3) and, after a
 * verified purchase, the offer to start this Forge Path (decision F14) will
 * come here, once approved.
 */
export const afterReveal = () => "enterForge" as const;

// ---- After setup ---------------------------------------------------------------

/**
 * Set as setup ends: the Forge Path the athlete was shown, so Home can pick
 * up where the reveal left off. A local setting like the onboarding record
 * (never synchronized, never in a backup); it goes when the athlete closes
 * Home's card, and its card stays hidden while any plan is running.
 */
export const ARRIVAL_KEY = "onboardingArrival";

export const writeArrival = (program: string) =>
  JSON.stringify({ v: 1, program });

/** The program key ("id@version") Home should show, if any. */
export function readArrival(raw: string | null | undefined) {
  try {
    const a = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    if (a && typeof a.program === "string" && KEY.test(a.program))
      return a.program;
  } catch {
    // Unreadable: Home shows nothing.
  }
  return undefined;
}

/** "id@version" → that published program, if this Forge still has it. */
export function programForKey(
  library: readonly CuratedProgram[],
  key: string,
): CuratedProgram | undefined {
  const at = key.lastIndexOf("@");
  return findProgramVersion(
    library,
    key.slice(0, at),
    Number(key.slice(at + 1)),
  );
}

// ---- The brand intro (signed out) -------------------------------------------------

/**
 * Whether Welcome opens with the brand intro: only on a fresh phone (no
 * account's training, nothing synchronized) that hasn't left the intro yet,
 * and never over something Welcome must say (a sign-out, a deletion, a
 * workout to return to, an email link). Established athletes who sign out
 * go straight to their sign-in, as before.
 */
export function introDue(f: {
  signedOut: boolean;
  owner?: string;
  hasLocalData: boolean;
  syncHistory: boolean;
  seen: boolean;
  message: boolean;
}) {
  return (
    f.signedOut &&
    !f.owner &&
    !f.hasLocalData &&
    !f.syncHistory &&
    !f.seen &&
    !f.message
  );
}
