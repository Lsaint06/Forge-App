import type { Profile } from "./types";

// Training-profile vocabulary shared by onboarding, settings and curated
// program recommendations. Users choose these themselves; Forge never assigns
// or overrides them.
export const experienceLevels = [
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;
export type ExperienceLevel = (typeof experienceLevels)[number];
export const trainingGoals = ["Strength", "Muscle Building"] as const;
export type TrainingGoal = (typeof trainingGoals)[number];

export const experienceChoices: {
  value: ExperienceLevel;
  detail: string;
}[] = [
  {
    value: "Beginner",
    detail: "Building my foundation in resistance training.",
  },
  { value: "Intermediate", detail: "Consistently training and progressing." },
  {
    value: "Advanced",
    detail: "Experienced with structured resistance training.",
  },
];
export const goalChoices: { value: TrainingGoal; detail: string }[] = [
  {
    value: "Strength",
    detail: "Prioritizing increases in strength and performance.",
  },
  {
    value: "Muscle Building",
    detail: "Prioritizing muscular hypertrophy and physique development.",
  },
];

// Index 0 is Monday, matching the weekday numbering used by Path schedules.
export const restDayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function experienceLevel(
  p: Pick<Profile, "experience">,
): ExperienceLevel | undefined {
  return experienceLevels.find((level) => level === p.experience);
}

// Earlier profiles stored "Build strength" / "Build muscle", which name the
// same goals. "Improve fitness" and "Manage weight" have no honest
// equivalent, so they read as not set until the user chooses.
export function trainingGoal(
  p: Pick<Profile, "goal">,
): TrainingGoal | undefined {
  if (p.goal === "Strength" || p.goal === "Build strength") return "Strength";
  if (p.goal === "Muscle Building" || p.goal === "Build muscle")
    return "Muscle Building";
  return undefined;
}

export function restDayName(p: Pick<Profile, "restDay">) {
  return p.restDay === undefined ? undefined : restDayNames[p.restDay];
}

export function missingTrainingProfile(
  p: Pick<Profile, "experience" | "goal" | "restDay">,
) {
  return [
    ...(experienceLevel(p) ? [] : ["experience" as const]),
    ...(trainingGoal(p) ? [] : ["goal" as const]),
    ...(p.restDay === undefined ? ["restDay" as const] : []),
  ];
}
