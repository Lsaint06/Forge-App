import type { Profile } from "../types";
import {
  experienceLevel,
  missingTrainingProfile,
  trainingGoal,
} from "../profile";
import { publishedPrograms, type CuratedProgram } from "./model";

export type Recommendation =
  | {
      kind: "incomplete";
      missing: ("experience" | "goal")[];
    }
  | { kind: "none"; experience: string; goal: string }
  | {
      kind: "match";
      program: CuratedProgram;
      reasons: string[];
      alternatives: CuratedProgram[];
    };

// Forge recommends; the lifter decides. Only published programs whose author-
// assigned experience and goal match the lifter's own selections are
// recommended. Nothing is generated to fill a gap in the library.
export function recommendProgram(
  profile: Pick<Profile, "experience" | "goal" | "restDay" | "frequency">,
  library: readonly CuratedProgram[],
): Recommendation {
  const experience = experienceLevel(profile);
  const goal = trainingGoal(profile);
  if (!experience || !goal)
    return {
      kind: "incomplete",
      missing: missingTrainingProfile(profile).filter(
        (m): m is "experience" | "goal" => m !== "restDay",
      ),
    };
  const matches = publishedPrograms(library)
    .filter((p) => p.experience === experience && p.goal === goal)
    // Prefer the weekly workout goal from settings, then fewer days.
    .sort(
      (a, b) =>
        Math.abs(a.daysPerWeek - profile.frequency) -
          Math.abs(b.daysPerWeek - profile.frequency) ||
        a.daysPerWeek - b.daysPerWeek,
    );
  const program = matches[0];
  if (!program) return { kind: "none", experience, goal };
  return {
    kind: "match",
    program,
    reasons: [
      `Written for ${experience.toLowerCase()} lifters — your training experience.`,
      `Built for ${goal === "Strength" ? "strength" : "muscle building"} — your training goal.`,
      ...(program.daysPerWeek === profile.frequency
        ? [
            `${program.daysPerWeek} sessions a week matches your weekly workout goal.`,
          ]
        : []),
    ],
    alternatives: matches.slice(1),
  };
}
