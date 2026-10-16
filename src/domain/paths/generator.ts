import type { Exercise, Prescription } from "../types";
import { prescriptionSchema } from "../validation";
import { forgePaths } from "./catalog";
import { validateDraft as validateVersionTwo } from "./versionTwoGenerator";
import { exerciseStimulus } from "./stimulus";
import {
  assertBalancedWeek,
  effectiveSets,
  MAX_EXERCISE_SPREAD,
  MAX_SAME_TARGET_PER_DAY,
} from "./weekAudit";
import {
  directExposures,
  directSets,
  exerciseTier,
  generationCeiling,
  goalOf,
  isHeavyStrength,
  maxSetsPerExercise,
  muscleLoad,
  SECONDARY_WEIGHT,
  prescriptionPolicy,
  PULL_TO_PUSH,
  sessionExerciseCap,
  sessionMuscleCap,
  sessionSetLimit,
  weeklyVolumeTarget,
} from "./policy";
import { assessProgram } from "./programQuality";
import {
  pathPreferencesSchema,
  machineRequirement,
  defaultWeekdays,
  type PathPreferences,
  type PathRole,
} from "./model";
import {
  compatibleMovements,
  validateDraft as validateLegacy,
  type PathDay,
  type PathDraft,
} from "./legacyGenerator";
import {
  sessionSetCap,
  exerciseSetCap,
  isPriorityTarget,
  weeklyMuscleCap,
} from "./volume";
export {
  compatibleMovements,
  roleReasons,
  scheduledDates,
} from "./legacyGenerator";
export type { PathDay, PathDraft } from "./legacyGenerator";

// Version 8 derives every prescription from the central programming policy
// (purpose, goal and experience) and checks plans with the program-quality
// engine. Versions 3–7 remain readable so saved programs keep working.
export const ENGINE_VERSION = 8 as const;
const SUPPORTED_ENGINES = [3, 4, 5, 6, 7, ENGINE_VERSION];

type Slot = {
  optional?: boolean;
  role: PathRole;
  patterns?: string[];
  preferred?: string[];
  isolation?: boolean;
  ids?: string[];
  // A strength main lift (engine 8): heavy, low-rep, long-rest practice.
  main?: boolean;
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
const incline: Slot = {
  ...slot(
    "push",
    ["horizontal push"],
    ["incline-dumbbell-bench-press", "standing-cable-fly", "pec-deck-fly"],
  ),
  ids: ["incline-dumbbell-bench-press", "standing-cable-fly", "pec-deck-fly"],
};
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
const unilateral: Slot = {
  ...slot(
    "squat",
    ["squat"],
    ["dumbbell-split-squat", "bodyweight-split-squat"],
  ),
  ids: ["dumbbell-split-squat", "bodyweight-split-squat"],
};
const quad: Slot = {
  ...slot("squat", ["squat"], ["leg-extension", "leg-press"], true),
  ids: ["leg-extension", "leg-press"],
};
const hinge = slot(
  "posterior",
  ["hinge"],
  ["romanian-deadlift", "dumbbell-romanian-deadlift", "kettlebell-deadlift"],
);
const curl = slot("posterior", ["knee flexion"], ["seated-leg-curl"], true);
const side: Slot = {
  ...slot("shoulder", ["shoulder isolation"], ["dumbbell-lateral-raise"], true),
  ids: ["dumbbell-lateral-raise"],
};
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
// Engine 8 variants: second-day pulls favour a different implement so a
// muscle meets a new stimulus within the week without in-session redundancy.
const rowAlt = slot(
  "pull",
  ["horizontal pull"],
  [
    "dumbbell-bent-over-row",
    "machine-row",
    "kettlebell-row",
    "seated-cable-row",
    "barbell-bent-over-row",
  ],
);
const verticalAlt = slot(
  "pull",
  ["vertical pull"],
  ["pull-up", "lat-pulldown"],
);
const fly: Slot = {
  ...slot(
    "push",
    ["horizontal push"],
    ["pec-deck-fly", "standing-cable-fly"],
    true,
  ),
  ids: ["pec-deck-fly", "standing-cable-fly"],
};
const main = (s: Slot): Slot => ({ ...s, main: true });

type Session = { name: string; slots: Slot[]; focusRoles?: PathRole[] };
type Blueprint = { name: string; base: Slot[]; extras?: Slot[] };

// Engine 8 weekly blueprints. Each session lists its essential movements and
// optional extras; extras are only added while the experience level's
// exercise ceiling allows, so beginners get fewer, simpler sessions and
// advanced lifters get targeted detail work rather than more sets per lift.
function blueprint(p: PathPreferences): Session[] {
  const goal = goalOf(p);
  const limit = Math.min(
    sessionExerciseCap(p),
    p.pathKey === "build-muscle" ? 7 : 8,
  );
  const build = (days: Blueprint[]): Session[] =>
    days.map((d) => ({
      name: d.name,
      slots: [
        ...d.base,
        ...(d.extras ?? []).slice(0, Math.max(0, limit - d.base.length)),
      ],
    }));
  const pick = <T>(items: T[]) => items.slice(0, p.frequency);
  if (goal === "foundation")
    return build(
      pick([
        {
          name: "Learn your foundations",
          base: [squat, press, row, hinge, core],
        },
        {
          name: "Build movement confidence",
          base: [unilateral, press, row, hinge, calf],
        },
        { name: "Practice & progress", base: [squat, press, row, hinge, side] },
      ]),
    );
  if (goal === "strength") {
    if (p.frequency <= 3)
      return build(
        pick([
          {
            name: "Squat & bench strength",
            base: [main(squat), main(press), row, curl, core],
          },
          {
            name: "Deadlift & overhead strength",
            base: [
              main(hinge),
              main(shoulderPress),
              vertical,
              unilateral,
              calf,
            ],
          },
          {
            name: "Bench & squat strength",
            base: [main(press), main(squat), rowAlt, rear, core],
          },
        ]),
      );
    return build([
      {
        name: "Upper body · bench strength",
        base: [main(press), row, shoulderPress, vertical],
      },
      {
        name: "Lower body · squat strength",
        base: [main(squat), curl, calf, core],
      },
      {
        name: "Upper body · overhead strength",
        base: [main(shoulderPress), verticalAlt, press, rowAlt],
      },
      {
        name: "Lower body · deadlift strength",
        base: [main(hinge), unilateral, calf, core],
      },
    ]);
  }
  if (goal === "athletic") {
    if (p.frequency <= 3)
      return build(
        pick([
          {
            name: "Single-leg strength & control",
            base: [unilateral, hinge, row, press, core, calf],
            extras: [side],
          },
          {
            name: "Posterior chain & stability",
            base: [unilateral, hinge, vertical, press, core, calf],
          },
          {
            name: "Whole-body movement practice",
            base: [unilateral, hinge, row, press, core, calf],
            extras: [side],
          },
        ]),
      );
    // Trunk work sits on the lower-body days only, rather than repeating the
    // same core exercise in every session.
    return build([
      {
        name: "Upper body · controlled force",
        base: [press, row, shoulderPress, vertical],
      },
      {
        name: "Lower body · single-leg control",
        base: [unilateral, hinge, calf, core],
      },
      {
        name: "Upper body · balanced capacity",
        base: [incline, vertical, row, side],
      },
      {
        name: "Lower body · posterior control",
        base: [hinge, unilateral, curl, calf, core],
      },
    ]);
  }
  if (goal === "recomp") {
    if (p.frequency <= 3)
      return build(
        pick([
          {
            name: "Full body · strength retention",
            base: [squat, press, row, hinge, core, side],
          },
          {
            name: "Full body · balanced resistance",
            base: [unilateral, incline, vertical, curl, core, calf],
          },
          {
            name: "Full body · repeat quality",
            base: [squat, press, rowAlt, hinge, core, side],
          },
        ]),
      );
    return build([
      {
        name: "Upper body · retain strength",
        base: [press, row, shoulderPress, vertical],
      },
      { name: "Lower body · quad focus", base: [squat, hinge, calf, core] },
      {
        name: "Upper body · balanced capacity",
        base: [incline, vertical, row, side],
      },
      {
        name: "Lower body · posterior control",
        base: [hinge, unilateral, curl, calf, core],
      },
    ]);
  }
  // Hypertrophy (Build Muscle, Advanced Physique). Advanced Physique's
  // shoulders-and-arms emphasis takes the optional full-body slots; Build
  // Muscle uses them for calves and trunk.
  const physique = p.pathKey === "advanced-physique";
  if (p.frequency <= 3)
    return build(
      pick([
        {
          name: "Full body · chest & quads",
          base: [squat, press, row, hinge, side, tri],
          extras: physique ? [bi, calf] : [calf, core],
        },
        {
          name: "Full body · back & hamstrings",
          base: [vertical, unilateral, incline, curl, rear, bi],
          extras: physique ? [tri, side] : [calf, side],
        },
        {
          name: "Full body · balanced growth",
          base: [squat, press, rowAlt, hinge, side, bi],
          extras: physique ? [tri, rear] : [tri, calf],
        },
      ]),
    );
  const upperA: Blueprint = {
    name: "Upper body · chest & back",
    base: [press, row, vertical, side, tri, bi],
    extras: [fly],
  };
  const upperB: Blueprint = {
    name: "Upper body · back & shoulders",
    base: [verticalAlt, incline, rowAlt, side, rear, bi],
    extras: [tri],
  };
  const lowerA: Blueprint = {
    name: "Legs · quad focus",
    base: [squat, hinge, quad, curl, calf],
    extras: [core],
  };
  const lowerB: Blueprint = {
    name: "Legs · posterior focus",
    base: [hinge, unilateral, curl, quad, calf],
    extras: [core],
  };
  const push: Blueprint = {
    name: "Chest, shoulders & triceps",
    base: [press, incline, shoulderPress, side, tri],
    extras: [fly],
  };
  const pull: Blueprint = {
    name: "Back, rear delts & biceps",
    base: [row, vertical, rear, bi, core],
  };
  if (p.frequency === 4) return build([upperA, lowerA, upperB, lowerB]);
  if (p.frequency === 5)
    return build([
      { ...upperA, extras: [] },
      lowerA,
      push,
      { ...pull, base: [verticalAlt, rowAlt, rear, bi, core] },
      lowerB,
    ]);
  return build([
    push,
    { ...pull, base: [row, vertical, rowAlt, rear, bi] },
    lowerA,
    {
      ...push,
      name: "Chest & shoulder detail",
      base: [incline, press, shoulderPress, side, tri],
    },
    {
      ...pull,
      name: "Back width & arm detail",
      base: [verticalAlt, rowAlt, row, rear, bi],
    },
    lowerB,
  ]);
}

function sessions(
  p: PathPreferences,
  version: number = ENGINE_VERSION,
): Session[] {
  return version >= 8 ? blueprint(p) : legacySessions(p, version);
}

// Engine 3–7 session structures, retained so saved plans keep validating.
function legacySessions(p: PathPreferences, version: number): Session[] {
  const novice = p.pathKey === "start-strong";
  const strength = p.pathKey === "get-strong";
  const athlete = p.pathKey === "athlete-mode";
  const lean = p.pathKey === "lean-strong";
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
    focusRoles: ["push", "pull"],
  });
  const lower = (second: boolean): Session => ({
    name: second ? "Legs · posterior focus" : "Legs · quad focus",
    slots: second
      ? [hinge, unilateral, curl, quad, calf, core]
      : [squat, hinge, quad, curl, calf, core],
    focusRoles: [second ? "posterior" : "squat"],
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
          slots: [
            i === 1 ? unilateral : squat,
            press,
            row,
            hinge,
            i === 0 ? core : i === 1 ? calf : side,
          ],
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
              ? [hinge, shoulderPress, row, unilateral, calf]
              : [squat, press, row, hinge, core],
        };
      if (athlete)
        return {
          name: [
            "Single-leg strength & control",
            "Posterior chain & stability",
            "Whole-body movement practice",
          ][i]!,
          slots: [
            unilateral,
            hinge,
            i === 1 ? vertical : row,
            press,
            core,
            calf,
            ...(i === 1 ? [] : [side]),
          ],
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
        focusRoles:
          i === 0 ? ["push", "squat"] : i === 1 ? ["pull", "posterior"] : [],
        slots:
          i === 1
            ? [unilateral, incline, vertical, curl, rear, bi, calf, core]
            : i === 0
              ? [squat, press, row, hinge, side, tri, calf, core]
              : [squat, press, row, hinge, side, bi, tri, calf],
      };
    });
  if (strength)
    return [
      {
        name: "Upper body · press strength",
        slots: [press, row, shoulderPress, vertical],
      },
      {
        name: "Lower body · squat strength",
        slots: [squat, hinge, calf, core],
      },
      {
        name: "Upper body · overhead strength",
        slots: [shoulderPress, vertical, press, row],
      },
      {
        name: "Lower body · hinge strength",
        slots: [hinge, unilateral, calf, core],
      },
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
    return [
      // Chest/shoulder and back days carry incline and rear-delt work, so the
      // opening upper day stays within the week's exercise-count spread.
      version >= 7
        ? {
            ...upper(false),
            slots: [press, row, vertical, side, bi, tri],
          }
        : upper(false),
      lower(false),
      chest,
      back,
      lower(true),
    ];
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

export function structure(
  p: PathPreferences,
  version: number = ENGINE_VERSION,
) {
  return sessions(p, version).map((s) => ({
    name: s.name,
    roles: s.slots.map((s) => s.role),
    focusRoles: s.focusRoles ?? [],
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
  const available = choices.filter(
    (m) =>
      (!target.patterns ||
        target.patterns.includes(
          catalog.find((e) => e.id === m.id)!.pattern,
        )) &&
      (!target.ids || target.ids.includes(m.id)) &&
      (target !== row || exerciseStimulus(m.id).direct.includes("Back")) &&
      ((target !== press && target !== squat) ||
        !exerciseStimulus(m.id).isolation),
  );
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
type Pick = { slot: number; id: string; substituted?: boolean };
// Balancing never trims a lifting day below this many exercises; if that
// would be required, the week is rejected with guidance instead.
const TRIM_FLOOR = 3;
class WeekBalanceError extends Error {}

// Plans the whole week before any prescriptions are written: every day takes
// its reviewed slot choices, then the week is compared as one split. Short days
// first receive a same-role alternative for a planned slot their equipment
// could not fill; otherwise the longest days lose their least essential
// movement. Nothing is added beyond the session's designed slots.
function planWeek(p: PathPreferences, catalog: Exercise[]): Pick[][] {
  const specs = sessions(p);
  const offsets = dates(p);
  const plan = specs.map((s, i) => {
    const picks: Pick[] = [];
    s.slots.forEach((_, j) => {
      const choice = slotMovements(p, i, j, catalog).find(
        (m) => !picks.some((x) => x.id === m.id),
      );
      if (choice) picks.push({ slot: j, id: choice.id });
    });
    return picks;
  });
  const primary = (id: string) => exerciseStimulus(id).direct[0];
  const roleAt = (i: number, pick: Pick) => specs[i]!.slots[pick.slot]!.role;
  const recoverable = () => {
    try {
      recovery(
        plan.map((picks, i) => ({
          key: `day-${i}`,
          name: specs[i]!.name,
          offset: offsets[i]!,
          roles: picks.map((x) => roleAt(i, x)),
          exercises: [],
        })),
      );
      return true;
    } catch {
      return false;
    }
  };
  const lifting = () => plan.map((_, i) => i);
  const range = () => {
    const counts = lifting().map((i) => plan[i]!.length);
    return { low: Math.min(...counts), high: Math.max(...counts), counts };
  };
  const imbalanced = () => {
    const { low, high, counts } = range();
    return (
      counts.length > 1 && (high >= 2 * low || high - low > MAX_EXERCISE_SPREAD)
    );
  };
  const substitute = (i: number) => {
    const picks = plan[i]!;
    for (const [j, target] of specs[i]!.slots.entries()) {
      if (picks.some((x) => x.slot === j)) continue;
      const pattern = (id: string) =>
        !!target.patterns?.includes(
          catalog.find((e) => e.id === id)?.pattern ?? "",
        );
      const options = compatibleMovements(p, target.role, catalog)
        .filter((m) => !picks.some((x) => x.id === m.id))
        .filter(
          (m) =>
            (target !== press && target !== squat) ||
            !exerciseStimulus(m.id).isolation,
        )
        .filter((m) => {
          const muscle = primary(m.id);
          return (
            !muscle ||
            picks.filter((x) => primary(x.id) === muscle).length <
              MAX_SAME_TARGET_PER_DAY
          );
        })
        .sort((a, b) => Number(pattern(b.id)) - Number(pattern(a.id)));
      for (const option of options) {
        const pick: Pick = { slot: j, id: option.id, substituted: true };
        const at = picks.findIndex((x) => x.slot > j);
        picks.splice(at < 0 ? picks.length : at, 0, pick);
        if (recoverable()) return true;
        picks.splice(picks.indexOf(pick), 1);
      }
    }
    return false;
  };
  const trim = (i: number) => {
    const picks = plan[i]!;
    if (picks.length <= TRIM_FLOOR) return false;
    const focus = specs[i]!.focusRoles ?? [];
    const elsewhere = (id: string) =>
      plan.some(
        (other, k) =>
          k !== i && other.some((x) => primary(x.id) === primary(id)),
      );
    const victim = picks
      .map((pick, index) => ({ pick, index }))
      .filter(
        ({ pick }) =>
          pick.slot >= 2 &&
          !focus.includes(roleAt(i, pick)) &&
          !isPriorityTarget(
            p,
            roleAt(i, pick),
            catalog.find((e) => e.id === pick.id),
          ),
      )
      .sort(
        (a, b) =>
          Number(elsewhere(b.pick.id)) - Number(elsewhere(a.pick.id)) ||
          Number(exerciseStimulus(b.pick.id).isolation) -
            Number(exerciseStimulus(a.pick.id).isolation) ||
          b.index - a.index,
      )[0];
    if (!victim) return false;
    picks.splice(victim.index, 1);
    return true;
  };
  for (let guard = 0; guard < 64 && imbalanced(); guard++) {
    const { low, high } = range();
    const days = lifting();
    if (days.filter((i) => plan[i]!.length === low).some(substitute)) continue;
    if (days.filter((i) => plan[i]!.length === high).some(trim)) continue;
    break;
  }
  if (imbalanced()) {
    const { low, high } = range();
    const short = lifting().find((i) => plan[i]!.length === low)!;
    const long = lifting().find((i) => plan[i]!.length === high)!;
    throw new WeekBalanceError(
      `With your equipment and exclusions, ${specs[short]!.name} can only include ${low} exercise${low === 1 ? "" : "s"} while ${specs[long]!.name} needs ${high}. Forge will not assign unbalanced training days.`,
    );
  }
  return plan;
}

export function generatePath(
  input: PathPreferences,
  catalog: Exercise[],
): PathDraft {
  const p = pathPreferencesSchema.parse(input);
  checkPreferences(p);
  try {
    return buildPath(p, catalog);
  } catch (error) {
    if (!(error instanceof WeekBalanceError)) throw error;
    const builds = (q: PathPreferences) => {
      try {
        buildPath(q, catalog);
        return true;
      } catch {
        return false;
      }
    };
    const path = forgePaths.find((x) => x.key === p.pathKey)!;
    const balanced: number[] = [];
    for (let f = path.minDays; f <= path.maxDays; f++)
      if (
        f !== p.frequency &&
        builds({ ...p, frequency: f, weekdays: defaultWeekdays(f) })
      )
        balanced.push(f);
    const list = (items: (string | number)[]) =>
      items.length > 1
        ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`
        : String(items[0]);
    // Without any permitted pull, upper-body days cannot be balanced. Only
    // affordable home equipment that actually resolves this week is suggested.
    if (!compatibleMovements(p, "pull", catalog).length) {
      const fixes = PULL_EQUIPMENT.filter(
        ({ needs }) =>
          !needs.every((n) => p.equipment.includes(n)) &&
          builds({ ...p, equipment: [...new Set([...p.equipment, ...needs])] }),
      ).map(({ label }) => label);
      const choices = [
        ...(balanced.length ? [`choose ${list(balanced)} training days`] : []),
        ...(fixes.length
          ? [`add ${list(fixes)} to train ${p.frequency} days a week`]
          : []),
      ];
      const next = choices.length
        ? ` ${choices.join(", or ").replace(/^./, (c) => c.toUpperCase())}.`
        : " Adjust your equipment or exclusions to allow a pulling exercise.";
      throw new Error(
        `Your upper-body days need a pulling exercise to stay balanced, and none is possible with your current equipment and exclusions.${next}`,
      );
    }
    const options = balanced.length
      ? ` A balanced week is available at ${list(balanced)} training days per week.`
      : "";
    throw new Error(
      `${error.message}${options} Adding equipment or removing exclusions also widens your movement choices.`,
    );
  }
}

const PULL_EQUIPMENT: {
  label: string;
  needs: PathPreferences["equipment"];
}[] = [
  {
    label: "a resistance band with a door anchor",
    needs: ["Resistance band", "Band anchor"],
  },
  { label: "a doorway pull-up bar", needs: ["Pull-up bar"] },
];

function buildPath(p: PathPreferences, catalog: Exercise[]): PathDraft {
  const offsets = dates(p);
  const goal = goalOf(p);
  const plan = planWeek(p, catalog);
  const days = sessions(p).map((s, i): PathDay => {
    const exercises: Prescription[] = [];
    const roles: PathRole[] = [];
    const picks = plan[i]!;
    let anchored = false;
    for (const { slot: j, id } of picks) {
      const target = s.slots[j]!;
      const stimulus = exerciseStimulus(id);
      if (!stimulus.reviewed)
        throw new Error(
          "A selected movement needs a reviewed training purpose.",
        );
      const mainLift =
        goal === "strength" && !!target.main && !stimulus.isolation;
      const tier = exerciseTier(id, catalog, mainLift);
      // The session's first loaded compound is its heavy anchor. On strength
      // days only a designated main lift can take that role; the second main
      // lift and assistance work follow at lower volume.
      const loaded = tier !== "isolation" && tier !== "core";
      const lead = loaded && !anchored && (goal !== "strength" || mainLift);
      if (lead) anchored = true;
      const policy = prescriptionPolicy(p, tier, lead);
      // Heavy targets are reserved for lifts that can be loaded precisely.
      // Dumbbell, kettlebell and bodyweight lifts are limited by grip,
      // stability and setup rather than the target muscles, so they keep six
      // or more reps; hip hinges keep five or more for technique and
      // lower-back fatigue.
      const exercise = catalog.find((e) => e.id === id);
      const heavyAllowed = /barbell|machine|cable|smith|leg press/i.test(
        `${exercise?.equipment ?? ""} ${id}`,
      );
      const floor =
        (lead || mainLift) && !stimulus.isolation
          ? !heavyAllowed
            ? 6
            : exercise?.pattern === "hinge"
              ? 5
              : 0
          : 0;
      const reps = Math.max(policy.reps, floor);
      const repMax =
        floor > policy.reps
          ? Math.max(policy.repMax ?? policy.reps, reps + (floor >= 6 ? 2 : 1))
          : policy.repMax;
      exercises.push({
        exerciseId: id,
        sets: policy.sets,
        reps,
        ...(repMax ? { repMax } : {}),
        weight: 0,
        rest: policy.rest,
      });
      roles.push(target.role);
    }
    if (!exercises.length)
      throw new Error(
        "No exercises match your choices for this session. Try another Path, fewer training days or different equipment. Excluded movements will not be added back.",
      );
    const adapted =
      picks.length !== s.slots.length || picks.some((x) => x.substituted);
    return {
      key: `day-${i}`,
      name: adapted
        ? `Adapted · ${[...new Set(roles)].map((role) => ({ push: "chest", pull: "back", squat: "quads", posterior: "posterior chain", shoulder: "shoulders", rear: "rear delts", biceps: "biceps", triceps: "triceps", calf: "calves", core: "core" })[role]).join(" & ")}`.slice(
            0,
            80,
          )
        : s.name,
      offset: offsets[i]!,
      roles,
      exercises,
    };
  });
  adjustWeeklyVolume(days, p);
  balancePushPull(days, p, catalog);
  balanceVolume(days, p);
  return validateDraft(
    { engineVersion: ENGINE_VERSION, preferences: p, days },
    catalog,
  );
}

// Evolution (weeks 5–8) keeps every Foundation exercise, its order and rest so
// performance stays directly comparable. Beginners and the foundation Path
// keep the same prescription and progress through reps and load. Experienced
// hypertrophy, recomposition and athletic plans add one set to accessory
// (isolation or machine) work, limited to about 15% more weekly sets and every
// ceiling. Experienced strength plans move main lifts one rep heavier. If the
// result would break any integrity rule, Evolution repeats Foundation.
export const EVOLUTION_VOLUME_INCREASE = 0.15;
export function evolutionDays(
  draft: PathDraft,
  catalog: Exercise[],
): PathDay[] {
  const p = draft.preferences;
  const days = draft.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  }));
  if (draft.engineVersion !== ENGINE_VERSION) return days;
  const goal = goalOf(p);
  if (goal === "foundation" || p.experience === "Beginner") return days;
  if (goal === "strength") {
    for (const item of days.flatMap((d) => d.exercises)) {
      if (!isHeavyStrength(item) || item.repMax == null) continue;
      const hinge =
        catalog.find((e) => e.id === item.exerciseId)?.pattern === "hinge";
      if (hinge) continue;
      item.reps = Math.max(3, item.reps - 1);
      item.repMax = Math.max(item.reps + 1, item.repMax - 1);
    }
  } else {
    const budget = Math.floor(
      days.reduce((n, d) => n + sessionSets(d), 0) * EVOLUTION_VOLUME_INCREASE,
    );
    let added = 0;
    for (const day of days) {
      const seen = new Set<string>();
      for (const item of day.exercises) {
        if (added >= budget) break;
        const tier = exerciseTier(item.exerciseId, catalog);
        const muscle = exerciseStimulus(item.exerciseId).direct[0];
        if ((tier !== "isolation" && tier !== "machine") || !muscle) continue;
        if (seen.has(muscle) || !canAddSet(days, day, item, p, "full"))
          continue;
        seen.add(muscle);
        item.sets++;
        added++;
      }
    }
  }
  return assessProgram({ preferences: p, days }, catalog).some(
    (f) => f.severity === "error",
  )
    ? draft.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => ({ ...e })),
      }))
    : days;
}

function sessionSets(day: PathDay): number {
  return day.exercises.reduce((n, e) => n + e.sets, 0);
}

// Pulling should keep pace with pressing (at least two thirds of its sets).
// Adds sets to existing pulls within every limit; never adds exercises.
function balancePushPull(
  days: PathDay[],
  p: PathPreferences,
  catalog: Exercise[],
) {
  const pattern = (item: Prescription) =>
    catalog.find((e) => e.id === item.exerciseId)?.pattern ?? "";
  const pressing = (item: Prescription) =>
    ["horizontal push", "vertical push"].includes(pattern(item));
  const pulling = (item: Prescription) =>
    ["horizontal pull", "vertical pull"].includes(pattern(item));
  const total = (test: (item: Prescription) => boolean) =>
    days
      .flatMap((d) => d.exercises)
      .filter(test)
      .reduce((n, e) => n + e.sets, 0);
  for (let guard = 0; guard < 100; guard++) {
    if (total(pulling) >= total(pressing) * PULL_TO_PUSH) return;
    const choice = days
      .flatMap((day) => day.exercises.map((item) => ({ day, item })))
      .filter(({ day, item }) => pulling(item) && canAddSet(days, day, item, p))
      .sort((a, b) => a.item.sets - b.item.sets)[0];
    if (!choice) return;
    choice.item.sets++;
  }
}

// Would one more set on `item` keep every muscle it trains within its weekly
// ceiling and the session's per-muscle and set limits? Ceilings use the
// estimated load (direct plus weighted secondary involvement). Generated
// defaults stop at the default ceiling; Evolution may use the full ceiling.
function canAddSet(
  days: PathDay[],
  day: PathDay,
  item: Prescription,
  p: PathPreferences,
  ceiling: "default" | "full" = "default",
) {
  if (item.sets >= maxSetsPerExercise(p, true)) return false;
  if (sessionSets(day) >= sessionSetLimit(p)) return false;
  const weekly = muscleLoad(days.flatMap((d) => d.exercises));
  const session = muscleLoad(day.exercises);
  const [primary, ...secondary] = exerciseStimulus(item.exerciseId).direct;
  return [primary, ...secondary].every((muscle, index) => {
    if (!muscle) return true;
    const step = index === 0 ? 1 : SECONDARY_WEIGHT;
    const limit =
      ceiling === "full"
        ? weeklyVolumeTarget(p, muscle).max
        : generationCeiling(p, muscle);
    return (
      (weekly[muscle] ?? 0) + step <= limit &&
      (session[muscle] ?? 0) + step <= sessionMuscleCap(p)
    );
  });
}

// Brings each trained muscle into its weekly range for this Path and level:
// trims accessory sets where a muscle's estimated load is over its ceiling,
// then (except for the fixed-dose foundation Path) adds sets to that muscle's
// own exercises where its direct sets are under its floor. Floors are capped
// by how many sessions train the muscle. Priorities shift the range; they
// never remove the ceiling. No exercises are added or removed here.
function adjustWeeklyVolume(days: PathDay[], p: PathPreferences) {
  const all = () => days.flatMap((d) => d.exercises);
  const primary = (item: Prescription) =>
    exerciseStimulus(item.exerciseId).direct[0];
  const isolation = (item: Prescription) =>
    exerciseStimulus(item.exerciseId).isolation;
  for (let guard = 0; guard < 400; guard++) {
    const totals = muscleLoad(all());
    const over = Object.keys(totals).find(
      (m) => totals[m]! > generationCeiling(p, m),
    );
    if (!over) break;
    const donor = all()
      .filter(
        (e) =>
          exerciseStimulus(e.exerciseId).direct.includes(over) && e.sets > 1,
      )
      .sort(
        (a, b) =>
          Number(primary(b) === over) - Number(primary(a) === over) ||
          Number(b.sets > 2) - Number(a.sets > 2) ||
          Number(isolation(b)) - Number(isolation(a)) ||
          b.sets - a.sets,
      )[0];
    if (!donor) break;
    donor.sets--;
  }
  if (goalOf(p) === "foundation") return;
  for (let guard = 0; guard < 400; guard++) {
    const totals = directSets(all());
    const exposures = directExposures(days);
    let added = false;
    for (const muscle of Object.keys(totals)) {
      if (
        totals[muscle]! >= weeklyVolumeTarget(p, muscle, exposures[muscle]).min
      )
        continue;
      const choice = days
        .flatMap((day) => day.exercises.map((item) => ({ day, item })))
        .filter(
          ({ day, item }) =>
            primary(item) === muscle && canAddSet(days, day, item, p),
        )
        .sort(
          (a, b) =>
            Number(isolation(b.item)) - Number(isolation(a.item)) ||
            a.item.sets - b.item.sets,
        )[0];
      if (!choice) continue;
      choice.item.sets++;
      added = true;
      break;
    }
    if (!added) break;
  }
}

// Keeps weekly working-set load evenly spread: the lightest day gains a set on
// its least-loaded movement within every limit, otherwise the heaviest day
// gives up a set from its most-loaded movement (never below two sets).
function balanceVolume(days: PathDay[], p: PathPreferences) {
  if (days.length < 2) return;
  for (let guard = 0; guard < 200; guard++) {
    const sorted = [...days].sort(
      (a, b) => effectiveSets(a) - effectiveSets(b),
    );
    const low = sorted[0]!,
      high = sorted[sorted.length - 1]!;
    if (!effectiveSets(low) || effectiveSets(high) < 2 * effectiveSets(low))
      return;
    const receiver = low.exercises
      .filter((item) => canAddSet(days, low, item, p))
      .sort((a, b) => a.sets - b.sets)[0];
    if (receiver) {
      receiver.sets++;
      continue;
    }
    const donor = [...high.exercises].sort((a, b) => b.sets - a.sets)[0];
    if (!donor || donor.sets <= 2) return;
    donor.sets--;
  }
}

export function validateDraft(
  draft: PathDraft,
  catalog: Exercise[],
): PathDraft {
  if ((draft.engineVersion ?? 1) === 1) return validateLegacy(draft, catalog);
  if (draft.engineVersion === 2) return validateVersionTwo(draft, catalog);
  if (!SUPPORTED_ENGINES.includes(draft.engineVersion ?? 1))
    throw new Error("Unsupported programming version.");
  const p = pathPreferencesSchema.parse(draft.preferences);
  checkPreferences(p);
  if (draft.days.length !== p.frequency)
    throw new Error("Plan days do not match your weekly availability.");
  const offsets = dates(p);
  const specs = sessions(p, draft.engineVersion);
  // Engine 8 prescription and volume rules live in the program-quality engine.
  const current = draft.engineVersion === ENGINE_VERSION;
  const volumeRules = (draft.engineVersion ?? 1) >= 6 && !current;
  const weekly: Record<string, number> = {};
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
      day.roles.length < 1 ||
      day.roles.length > 8 ||
      new Set(day.exercises.map((e) => e.exerciseId)).size !==
        day.exercises.length
    )
      throw new Error(
        "Keep distinct exercises and one to eight movement slots.",
      );
    // Retained slots keep their order; every slot may be omitted.
    const matches = (slotIndex: number, roleIndex: number): boolean => {
      if (slotIndex === specs[i]!.slots.length)
        return roleIndex === day.roles.length;
      const target = specs[i]!.slots[slotIndex]!;
      return (
        (roleIndex < day.roles.length &&
          day.roles[roleIndex] === target.role &&
          matches(slotIndex + 1, roleIndex + 1)) ||
        matches(slotIndex + 1, roleIndex)
      );
    };
    if (!matches(0, 0))
      throw new Error("Keep the balanced movement structure of this Path.");
    day.exercises.forEach((raw, j) => {
      const item = prescriptionSchema.parse(raw);
      if (current) return;
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
        (item.repMax ?? item.reps) > 20 ||
        item.rest < 45
      )
        throw new Error(
          "Use 1–3 sets for beginners (1–5 for experienced lifters), 1–20 reps and at least 45 seconds rest.",
        );
      if (volumeRules) {
        const ex = catalog.find((e) => e.id === item.exerciseId);
        const mainStrength =
          p.pathKey === "get-strong" &&
          item.reps <= 6 &&
          item.rest >= 180 &&
          !(ex && exerciseStimulus(ex.id).isolation);
        if (item.sets > exerciseSetCap(p, ex, mainStrength))
          throw new Error(
            "This exercise exceeds its goal-specific working-set limit.",
          );
        const muscle = exerciseStimulus(item.exerciseId).direct[0];
        if (muscle) weekly[muscle] = (weekly[muscle] ?? 0) + item.sets;
      }
    });
    if (
      !current &&
      day.exercises.reduce((n, e) => n + e.sets, 0) >
        (volumeRules ? sessionSetCap(p) : 28)
    )
      throw new Error("Keep working sets within this Path's session limit.");
  });
  if (volumeRules)
    for (const [muscle, sets] of Object.entries(weekly))
      if (sets > weeklyMuscleCap(p, muscle))
        throw new Error(
          `${muscle} exceeds this Path's weekly primary-target set ceiling.`,
        );
  recovery(draft.days);
  // Saved plans from earlier engines stay usable; the review flags imbalance
  // and offers a rebuild instead of blocking recorded training.
  if (draft.engineVersion === 7) assertBalancedWeek(draft.days);
  if (current) {
    const error = assessProgram(draft, catalog).find(
      (f) => f.severity === "error",
    );
    if (error) throw new Error(error.message);
  }
  return JSON.parse(JSON.stringify(draft)) as PathDraft;
}
