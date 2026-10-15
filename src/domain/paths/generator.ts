import type { Exercise, Prescription } from "../types";
import { prescriptionSchema } from "../validation";
import { forgePaths } from "./catalog";
import {
  pathPreferencesSchema,
  machineRequirement,
  type PathPreferences,
  type PathRole,
} from "./model";
import {
  compatibleMovements,
  estimatedMinutes,
  validateDraft as validateLegacy,
  type PathDay,
  type PathDraft,
} from "./legacyGenerator";
export {
  compatibleMovements,
  estimatedMinutes,
  roleReasons,
  scheduledDates,
} from "./legacyGenerator";
export type { PathDay, PathDraft } from "./legacyGenerator";

type Slot = {
  optional?: boolean;
  role: PathRole;
  patterns?: string[];
  preferred?: string[];
  isolation?: boolean;
};
const slot = (
  role: PathRole,
  patterns?: string[],
  preferred?: string[],
  isolation = false,
): Slot => ({ role, patterns, preferred, isolation });
const press = slot(
  "push",
  ["horizontal push"],
  ["barbell-bench-press", "dumbbell-bench-press", "machine-chest-press"],
);
const incline = slot(
  "push",
  ["horizontal push"],
  [
    "incline-dumbbell-bench-press",
    "standing-cable-fly",
    "dumbbell-floor-press",
  ],
);
const row = slot(
  "pull",
  ["horizontal pull"],
  ["seated-cable-row", "dumbbell-bent-over-row", "barbell-bent-over-row"],
);
const vertical: Slot = {
  ...slot("pull", ["vertical pull"], ["lat-pulldown", "pull-up"]),
  optional: true,
};
const squat = slot(
  "squat",
  ["squat"],
  ["back-squat", "goblet-squat", "leg-press"],
);
const unilateral = slot(
  "squat",
  ["squat"],
  ["bodyweight-split-squat", "goblet-squat"],
);
const quad = slot(
  "squat",
  ["squat"],
  ["leg-extension", "leg-press", "bodyweight-split-squat"],
  true,
);
const hinge = slot(
  "posterior",
  ["hinge"],
  ["romanian-deadlift", "dumbbell-romanian-deadlift", "kettlebell-deadlift"],
);
const curl = slot(
  "posterior",
  undefined,
  ["seated-leg-curl", "dumbbell-romanian-deadlift", "band-good-morning"],
  true,
);
const side = slot(
  "shoulder",
  ["shoulder isolation"],
  ["dumbbell-lateral-raise", "band-pull-apart"],
  true,
);
const rear = slot(
  "rear",
  ["shoulder isolation"],
  ["bent-over-reverse-fly", "cable-reverse-fly"],
  true,
);
const shoulderPress = slot(
  "shoulder",
  ["vertical push"],
  ["overhead-press", "dumbbell-shoulder-press"],
);
const bi = slot("biceps", undefined, undefined, true);
const tri = slot(
  "triceps",
  undefined,
  [
    "overhead-cable-triceps-extension",
    "two-hand-overhead-triceps-extension",
    "triceps-rope-pushdown",
  ],
  true,
);
const calf = slot("calf", undefined, undefined, true);
const core = slot("core", undefined, undefined, true);

type Session = { name: string; slots: Slot[] };
function sessions(p: PathPreferences): Session[] {
  const novice = p.pathKey === "start-strong";
  const strength = p.pathKey === "get-strong";
  const athlete = p.pathKey === "athlete-mode";
  const lean = p.pathKey === "lean-strong";
  const physique = p.pathKey === "advanced-physique";
  const upper = (second: boolean): Session => ({
    name: second ? "Upper body · angles & detail" : "Upper body · chest & back",
    slots: [
      second ? incline : press,
      second ? vertical : row,
      second ? row : vertical,
      second ? press : incline,
      side,
      rear,
      bi,
      tri,
    ],
  });
  const lower = (second: boolean): Session => ({
    name: second ? "Legs · posterior focus" : "Legs · quad focus",
    slots: second
      ? [hinge, unilateral, curl, quad, calf, core]
      : [squat, hinge, quad, curl, calf, core],
  });
  if (p.frequency <= 3)
    return Array.from({ length: p.frequency }, (_, i) => {
      if (novice)
        return {
          name: [
            "Learn your foundations",
            "Build movement confidence",
            "Practice & progress",
          ][i]!,
          slots: [i === 1 ? unilateral : squat, press, row, hinge],
        };
      if (strength)
        return {
          name: [
            "Squat & press strength",
            "Hinge & overhead strength",
            "Press & squat practice",
          ][i]!,
          slots:
            i === 1
              ? [hinge, shoulderPress, row, unilateral]
              : [squat, press, row, hinge],
        };
      if (athlete)
        return {
          name: [
            "Single-leg strength & control",
            "Posterior chain & stability",
            "Whole-body movement practice",
          ][i]!,
          slots: [unilateral, hinge, i === 1 ? vertical : row, press, core],
        };
      if (lean)
        return {
          name: [
            "Full body · strength retention",
            "Full body · balanced resistance",
            "Full body · repeat quality",
          ][i]!,
          slots: [
            i === 1 ? unilateral : squat,
            i === 1 ? incline : press,
            i === 1 ? vertical : row,
            i === 1 ? curl : hinge,
            core,
            i === 1 ? calf : side,
          ],
        };
      return {
        name: [
          "Full body · chest & quads",
          "Full body · back & hamstrings",
          "Full body · balanced growth",
        ][i]!,
        slots: [
          i === 1 ? unilateral : squat,
          i === 1 ? incline : press,
          i === 1 ? vertical : row,
          i === 1 ? curl : hinge,
          side,
          i === 1 ? tri : bi,
          calf,
          ...(physique ? [i === 1 ? bi : tri] : []),
        ],
      };
    });
  if (strength)
    return [
      {
        name: "Upper body · press strength",
        slots: [press, row, shoulderPress, vertical],
      },
      { name: "Lower body · squat strength", slots: [squat, hinge, core] },
      {
        name: "Upper body · overhead strength",
        slots: [shoulderPress, vertical, press, row],
      },
      { name: "Lower body · hinge strength", slots: [hinge, unilateral, core] },
    ];
  if (athlete || lean)
    return [
      {
        name: athlete
          ? "Upper body · controlled force"
          : "Upper body · retain strength",
        slots: [press, row, shoulderPress, vertical, core],
      },
      {
        name: athlete
          ? "Lower body · single-leg control"
          : "Lower body · quad focus",
        slots: [athlete ? unilateral : squat, hinge, calf, core],
      },
      {
        name: "Upper body · balanced capacity",
        slots: [incline, vertical, row, side, core],
      },
      {
        name: "Lower body · posterior control",
        slots: [hinge, unilateral, curl, calf, core],
      },
    ];
  if (p.frequency === 4)
    return [upper(false), lower(false), upper(true), lower(true)];
  const chest: Session = {
    name: "Chest, shoulders & triceps",
    slots: [press, incline, shoulderPress, side, tri],
  };
  const back: Session = {
    name: "Back, rear delts & biceps",
    slots: [row, vertical, rear, bi, core],
  };
  if (p.frequency === 5)
    return [upper(false), lower(false), chest, back, lower(true)];
  return [
    chest,
    back,
    lower(false),
    {
      ...chest,
      name: "Chest & shoulder detail",
      slots: [incline, press, shoulderPress, side, tri],
    },
    {
      ...back,
      name: "Back width & arm detail",
      slots: [vertical, row, rear, bi, core],
    },
    lower(true),
  ];
}

export function structure(p: PathPreferences) {
  return sessions(p).map((s) => ({
    name: s.name,
    roles: s.slots.map((s) => s.role),
  }));
}
// A matching pattern is preferred, never invented when equipment cannot support it.
// Alternatives remain visible in the workload review rather than masquerading as equivalent coverage.
export function slotMovements(
  p: PathPreferences,
  dayIndex: number,
  index: number,
  catalog: Exercise[],
) {
  const target = sessions(p)[dayIndex]?.slots[index];
  if (!target) return [];
  const choices = compatibleMovements(p, target.role, catalog);
  const exact = target.patterns
    ? choices.filter((m) =>
        target.patterns!.includes(catalog.find((e) => e.id === m.id)!.pattern),
      )
    : choices;
  const hasAnotherPull = sessions(p)[dayIndex]!.slots.some(
    (s) => s !== target && s.role === "pull",
  );
  const available = exact.length
    ? exact
    : target === vertical && hasAnotherPull
      ? []
      : choices;
  return [...available].sort((a, b) => {
    const rank = (id: string) => {
      const i = target.preferred?.indexOf(id) ?? -1;
      return i < 0 ? 100 : i;
    };
    // Keep explicit machine/free-weight preferences ahead of the default examples.
    const style = (id: string) => {
      const e = choices.find((c) => c.id === id)!;
      return p.style === "Machines"
        ? Number(e.needs.some((n) => n === "Cable" || machineRequirement(n)))
        : p.style === "Free weights"
          ? Number(
              e.needs.some((n) =>
                ["Barbell", "Dumbbell", "Kettlebell"].includes(n),
              ),
            )
          : 0;
    };
    return style(b.id) - style(a.id) || rank(a.id) - rank(b.id);
  });
}
function checkPreferences(p: PathPreferences) {
  const path = forgePaths.find((x) => x.key === p.pathKey)!;
  if (p.frequency < path.minDays || p.frequency > path.maxDays)
    throw new Error(
      `${path.name} supports ${path.minDays}–${path.maxDays} training days per week.`,
    );
  if (p.pathKey === "advanced-physique" && p.experience === "Beginner")
    throw new Error(
      "Advanced Physique is for experienced lifters. Build your foundation with another Path first.",
    );
}
function dates(p: PathPreferences) {
  const start = (new Date(`${p.startDate}T12:00:00`).getDay() + 6) % 7;
  return p.weekdays.map((d) => (d - start + 7) % 7).sort((a, b) => a - b);
}
function recovery(days: PathDay[]) {
  for (let i = 0; i < days.length; i++) {
    const a = days[i]!,
      b = days[(i + 1) % days.length]!;
    if (
      ((b.offset - a.offset + 7) % 7 || 7) < 2 &&
      a.roles.some(
        (role) => !["core", "calf"].includes(role) && b.roles.includes(role),
      )
    )
      throw new Error(
        "These weekdays repeat demanding movements on adjacent days. Spread the sessions out or select fewer training days.",
      );
  }
}
export function generatePath(
  input: PathPreferences,
  catalog: Exercise[],
): PathDraft {
  const p = pathPreferencesSchema.parse(input);
  checkPreferences(p);
  const offsets = dates(p);
  const physique = p.pathKey === "advanced-physique",
    strength = p.pathKey === "get-strong",
    novice = p.pathKey === "start-strong";
  const days = sessions(p).map((s, i): PathDay => {
    const exercises: Prescription[] = [];
    const roles: PathRole[] = [];
    s.slots.forEach((target, j) => {
      const choices = slotMovements(p, i, j, catalog).filter(
        (m) => !exercises.some((e) => e.exerciseId === m.id),
      );
      // Optional isolation coverage may be unavailable at home. Required foundational slots cannot disappear.
      if (!choices.length) {
        if (target.isolation || target.optional) return;
        throw new Error(
          `No compatible ${target.role} movement is available. Review equipment and movement exclusions.`,
        );
      }
      const strengthAssistance = strength && j >= 2;
      const sets = strengthAssistance
        ? 2
        : novice
          ? 2
          : target.isolation
            ? physique
              ? 3
              : 2
            : p.experience === "Beginner"
              ? 3
              : physique || strength
                ? 4
                : 3;
      exercises.push({
        exerciseId: choices[0]!.id,
        sets,
        reps:
          target.role === "core"
            ? 8
            : strengthAssistance
              ? 8
              : strength
                ? p.experience === "Beginner"
                  ? 6
                  : 5
                : target.isolation
                  ? 12
                  : p.pathKey === "athlete-mode"
                    ? 6
                    : novice
                      ? 10
                      : 8,
        weight: 0,
        rest: strengthAssistance
          ? 120
          : strength
            ? 180
            : target.isolation
              ? 75
              : novice
                ? 75
                : 120,
      });
      roles.push(target.role);
    });
    if (estimatedMinutes(exercises) > p.duration)
      throw new Error(
        `${s.name} needs about ${estimatedMinutes(exercises)} minutes with its working sets and rests. Choose a longer duration or a different training frequency; Forge will not silently cut your workload.`,
      );
    return {
      key: `day-${i}`,
      name: s.name,
      offset: offsets[i]!,
      roles,
      exercises,
    };
  });
  // Priorities redistribute a fixed session set budget rather than increasing everything.
  const priority: Record<string, PathRole[]> = {
    Chest: ["push"],
    Back: ["pull"],
    Shoulders: ["shoulder"],
    Quadriceps: ["squat"],
    Hamstrings: ["posterior"],
    Glutes: ["posterior"],
    Arms: ["biceps", "triceps"],
    Core: ["core"],
  };
  for (const [dayIndex, day] of days.entries()) {
    const isTarget = (role: PathRole, index: number) => {
      const exercise = catalog.find(
        (e) => e.id === day.exercises[index]!.exerciseId,
      )!;
      return p.priorities.some((priorityName) =>
        priorityName === "Glutes"
          ? ["squat", "hinge", "hip extension"].includes(exercise.pattern)
          : priorityName === "Hamstrings"
            ? role === "posterior" && exercise.pattern !== "hip extension"
            : (priority[priorityName] ?? []).includes(role),
      );
    };
    const candidates = day.roles
      .map((role, index) => (isTarget(role, index) ? index : -1))
      .filter((index) => index >= 0);
    const targetIndex =
      candidates[dayIndex % Math.max(1, candidates.length)] ?? -1;
    const donor = day.exercises.findIndex(
      (e, i) => !isTarget(day.roles[i]!, i) && e.sets > 2,
    );
    if (
      targetIndex >= 0 &&
      donor >= 0 &&
      day.exercises[targetIndex]!.sets < (p.experience === "Beginner" ? 3 : 5)
    ) {
      const before = day.exercises.map((e) => ({ ...e }));
      day.exercises[targetIndex]!.sets++;
      day.exercises[donor]!.sets--;
      if (estimatedMinutes(day.exercises) > p.duration) day.exercises = before;
    }
  }
  return validateDraft({ engineVersion: 2, preferences: p, days }, catalog);
}
export function validateDraft(
  draft: PathDraft,
  catalog: Exercise[],
): PathDraft {
  if ((draft.engineVersion ?? 1) === 1) return validateLegacy(draft, catalog);
  if (draft.engineVersion !== 2)
    throw new Error("Unsupported programming version.");
  const p = pathPreferencesSchema.parse(draft.preferences);
  checkPreferences(p);
  if (draft.days.length !== p.frequency)
    throw new Error("Plan days do not match your weekly availability.");
  const offsets = dates(p);
  const specs = sessions(p);
  draft.days.forEach((day, i) => {
    if (
      day.key !== `day-${i}` ||
      day.offset !== offsets[i] ||
      !day.name.trim() ||
      day.name.length > 80
    )
      throw new Error("Training day names, dates or identities are invalid.");
    if (
      day.exercises.length !== day.roles.length ||
      day.roles.length < 2 ||
      day.roles.length > 8 ||
      new Set(day.exercises.map((e) => e.exerciseId)).size !==
        day.exercises.length
    )
      throw new Error(
        "Keep distinct exercises and two to eight movement slots.",
      );
    // Required slots retain order; optional unavailable isolation slots may be omitted.
    const matches = (slotIndex: number, roleIndex: number): boolean => {
      if (slotIndex === specs[i]!.slots.length)
        return roleIndex === day.roles.length;
      const target = specs[i]!.slots[slotIndex]!;
      return (
        (roleIndex < day.roles.length &&
          day.roles[roleIndex] === target.role &&
          matches(slotIndex + 1, roleIndex + 1)) ||
        (!!(target.isolation || target.optional) &&
          matches(slotIndex + 1, roleIndex))
      );
    };
    if (!matches(0, 0))
      throw new Error("Keep the balanced movement structure of this Path.");
    day.exercises.forEach((raw, j) => {
      const item = prescriptionSchema.parse(raw);
      if (
        !compatibleMovements(p, day.roles[j]!, catalog).some(
          (e) => e.id === item.exerciseId,
        )
      )
        throw new Error(
          "An exercise conflicts with the plan's equipment, movement or experience restrictions.",
        );
      if (
        item.sets < 1 ||
        item.sets > (p.experience === "Beginner" ? 3 : 5) ||
        item.reps < 1 ||
        item.reps > 20 ||
        item.rest < 45
      )
        throw new Error(
          "Use 1–3 sets for beginners (1–5 for experienced lifters), 1–20 reps and at least 45 seconds rest.",
        );
    });
    if (day.exercises.reduce((n, e) => n + e.sets, 0) > 28)
      throw new Error("Keep working sets within this Path's session limit.");
    if (estimatedMinutes(day.exercises) > p.duration)
      throw new Error(
        "This edit exceeds your preferred session duration. Reduce sets or increase duration in setup.",
      );
  });
  recovery(draft.days);
  return JSON.parse(JSON.stringify(draft)) as PathDraft;
}
