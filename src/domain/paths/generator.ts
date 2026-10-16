import type { Exercise, Prescription } from "../types";
import { prescriptionSchema } from "../validation";
import { forgePaths, menuMovement, type MovementKind } from "./catalog";
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

// Version 9 selects from the expanded reviewed movement menu by movement
// family, varies accessory work across the week and scales exercise count
// with experience. Version 8 introduced the central programming policy and
// program-quality engine; plans from engine 8 onward are validated by that
// engine rather than a fixed slot structure, so lifters may add, remove and
// reorder exercises. Versions 3–7 remain readable so saved programs work.
export const ENGINE_VERSION = 9 as const;
const SUPPORTED_ENGINES = [3, 4, 5, 6, 7, 8, ENGINE_VERSION];

type Slot = {
  optional?: boolean;
  role: PathRole;
  // Reviewed movement families (see movementMenu) this slot accepts, in
  // fallback order.
  kinds: MovementKind[];
  preferred?: string[];
  isolation?: boolean;
  // Substitutes for this slot must also be compound lifts.
  compound?: boolean;
  // Only externally loaded movements: an unloaded bodyweight drill is not a
  // useful second compound for a trained lifter.
  loaded?: boolean;
  // Rotate movement families across the week (arms, calves, trunk) rather
  // than repeating one exercise every session.
  vary?: boolean;
  // A strength main lift (engine 8+): heavy, low-rep, long-rest practice.
  main?: boolean;
  // Lowest experience level (0 Beginner, 1 Intermediate, 2 Advanced) that
  // receives this slot. Experienced lifters get more targeted exercises, not
  // more sets on the same lift.
  from?: number;
  // Highest experience level that receives this slot.
  to?: number;
};
const slot = (
  role: PathRole,
  kinds: MovementKind[],
  preferred?: string[],
  isolation = false,
): Slot => ({ role, kinds, preferred, isolation });
const press: Slot = {
  ...slot(
    "push",
    ["press"],
    [
      "barbell-bench-press",
      "dumbbell-bench-press",
      "machine-chest-press",
      "smith-machine-bench-press",
    ],
  ),
  compound: true,
};
const incline = slot(
  "push",
  ["incline-press", "fly"],
  [
    "incline-dumbbell-bench-press",
    "incline-barbell-bench-press",
    "incline-machine-chest-press",
    "smith-machine-incline-press",
    "standing-cable-fly",
    "pec-deck-fly",
  ],
);
const fly = slot(
  "push",
  ["fly"],
  ["pec-deck-fly", "standing-cable-fly", "low-to-high-cable-fly"],
  true,
);
const row = slot(
  "pull",
  ["row"],
  [
    "seated-cable-row",
    "dumbbell-bent-over-row",
    "barbell-bent-over-row",
    "chest-supported-machine-row",
  ],
);
// Second-day and second-slot pulls favour a different implement so the back
// meets a new stimulus within the week without in-session redundancy.
const rowAlt = slot(
  "pull",
  ["row"],
  [
    "chest-supported-dumbbell-row",
    "one-arm-dumbbell-row",
    "dumbbell-bent-over-row",
    "machine-row",
    "single-arm-cable-row",
    "kettlebell-row",
    "seated-cable-row",
    "barbell-bent-over-row",
    "inverted-row",
  ],
);
const vertical: Slot = {
  ...slot(
    "pull",
    ["vertical-pull"],
    ["lat-pulldown", "pull-up", "assisted-pull-up"],
  ),
  optional: true,
};
const verticalAlt = slot(
  "pull",
  ["vertical-pull"],
  [
    "pull-up",
    "neutral-grip-lat-pulldown",
    "chin-up",
    "assisted-pull-up",
    "lat-pulldown",
  ],
);
const latIso = slot(
  "pull",
  ["lat-isolation"],
  ["straight-arm-pulldown", "dumbbell-pullover"],
  true,
);
const squat: Slot = {
  ...slot(
    "squat",
    ["squat"],
    [
      "back-squat",
      "hack-squat",
      "leg-press",
      "smith-machine-squat",
      "goblet-squat",
    ],
  ),
  compound: true,
};
// Foundation and strength plans practise one free-weight squat pattern
// (barbell, or goblet before barbell lifts unlock) rather than machines.
const learnSquat: Slot = {
  ...squat,
  preferred: ["back-squat", "goblet-squat", "leg-press"],
};
const unilateral = slot(
  "squat",
  ["single-leg"],
  [
    "bulgarian-split-squat",
    "dumbbell-split-squat",
    "dumbbell-reverse-lunge",
    "dumbbell-walking-lunge",
    "dumbbell-step-up",
    "bodyweight-split-squat",
  ],
);
const quad: Slot = {
  ...slot(
    "squat",
    ["knee-extension", "squat"],
    ["leg-extension", "leg-press", "hack-squat"],
    true,
  ),
  loaded: true,
};
// A second knee-dominant compound for advanced quad days.
const quadAlt: Slot = {
  ...slot(
    "squat",
    ["squat"],
    ["hack-squat", "leg-press", "smith-machine-squat"],
  ),
  loaded: true,
};
// Without any hinge option (bodyweight only), a glute bridge keeps hip
// extension in the session.
const hinge = slot(
  "posterior",
  ["hinge", "hip-thrust"],
  [
    "romanian-deadlift",
    "single-leg-dumbbell-romanian-deadlift",
    "dumbbell-romanian-deadlift",
    "kettlebell-deadlift",
    "cable-pull-through",
    "band-good-morning",
  ],
);
// Strength plans train the conventional deadlift when a barbell is
// available; otherwise the day is named as a hinge day, never a deadlift.
const deadlift = slot(
  "posterior",
  ["deadlift", "hinge"],
  [
    "conventional-deadlift",
    "romanian-deadlift",
    "dumbbell-romanian-deadlift",
    "kettlebell-deadlift",
  ],
);
const hipThrust = slot(
  "posterior",
  ["hip-thrust", "hinge"],
  [
    "barbell-hip-thrust",
    "machine-hip-thrust",
    "dumbbell-hip-thrust",
    "cable-pull-through",
    "single-leg-glute-bridge",
    "bodyweight-glute-bridge",
  ],
);
const curl = slot(
  "posterior",
  ["knee-flexion"],
  ["seated-leg-curl", "lying-leg-curl", "sliding-leg-curl"],
  true,
);
const side = slot(
  "shoulder",
  ["lateral-raise"],
  [
    "dumbbell-lateral-raise",
    "cable-lateral-raise",
    "machine-lateral-raise",
    "seated-lateral-raise",
  ],
  true,
);
const rear = slot(
  "rear",
  ["rear-delt"],
  [
    "bent-over-reverse-fly",
    "cable-reverse-fly",
    "reverse-pec-deck",
    "face-pull",
    "chest-supported-reverse-fly",
  ],
  true,
);
const shoulderPress = slot(
  "shoulder",
  ["overhead-press"],
  [
    "overhead-press",
    "dumbbell-shoulder-press",
    "machine-shoulder-press",
    "seated-dumbbell-shoulder-press",
    "arnold-press",
  ],
);
const bi: Slot = {
  ...slot(
    "biceps",
    ["curl", "curl-lengthened", "curl-supported", "curl-neutral"],
    [
      "dumbbell-curl",
      "ez-bar-curl",
      "cable-curl",
      "incline-dumbbell-curl",
      "dumbbell-preacher-curl",
      "hammer-curl",
    ],
    true,
  ),
  vary: true,
};
// A complementary elbow flexor beside the main curl (advanced arm work).
const biAlt: Slot = {
  ...slot(
    "biceps",
    ["curl-neutral", "curl-supported", "curl-lengthened"],
    ["hammer-curl", "rope-hammer-curl", "dumbbell-preacher-curl"],
    true,
  ),
  vary: true,
};
const tri: Slot = {
  ...slot(
    "triceps",
    ["triceps-overhead", "triceps-pushdown", "triceps-lying"],
    [
      "overhead-cable-triceps-extension",
      "two-hand-overhead-triceps-extension",
      "triceps-rope-pushdown",
      "ez-bar-skull-crusher",
    ],
    true,
  ),
  vary: true,
};
const calf: Slot = {
  ...slot(
    "calf",
    ["calf", "calf-bent-knee"],
    [
      "standing-calf-raise",
      "dumbbell-calf-raise",
      "leg-press-calf-raise",
      "seated-calf-raise",
    ],
    true,
  ),
  vary: true,
};
// Foundation, strength and athletic plans favour bracing; hypertrophy plans
// favour loadable trunk flexion.
const brace: Slot = {
  ...slot("core", ["core-stability", "core-flexion"], undefined, true),
  vary: true,
};
const core: Slot = {
  ...slot(
    "core",
    ["core-flexion", "core-stability"],
    [
      "cable-crunch",
      "hanging-leg-raise",
      "hanging-knee-raise",
      "reverse-crunch",
      "pallof-press",
    ],
    true,
  ),
  vary: true,
};
// Pull days finish with hanging or cable trunk flexion, not floor drills.
const hangingCore = slot(
  "core",
  ["core-flexion"],
  ["hanging-leg-raise", "cable-crunch", "hanging-knee-raise", "reverse-crunch"],
  true,
);
const main = (s: Slot): Slot => ({ ...s, main: true });
// Experience tiers: intermediate-and-up and advanced-only slots.
const mid = (s: Slot): Slot => ({ ...s, from: 1 });
const adv = (s: Slot): Slot => ({ ...s, from: 2 });
const midOnly = (s: Slot): Slot => ({ ...s, from: 1, to: 1 });
const novice = (s: Slot): Slot => ({ ...s, to: 0 });

type Session = { name: string; slots: Slot[]; focusRoles?: PathRole[] };
type Blueprint = { name: string; base: Slot[]; extras?: Slot[] };

// Engine 9 weekly blueprints. Each session lists its movements in training
// order; slots marked for intermediate or advanced lifters are included only
// at that level, and optional extras are added only while the level's
// exercise ceiling allows. Beginners get fewer, simpler sessions; experienced
// lifters get more targeted movements rather than more sets per lift.
function blueprint(p: PathPreferences): Session[] {
  const goal = goalOf(p);
  const level =
    p.experience === "Beginner" ? 0 : p.experience === "Intermediate" ? 1 : 2;
  const limit = Math.min(
    sessionExerciseCap(p),
    p.pathKey === "build-muscle" ? 7 : 8,
  );
  const build = (days: Blueprint[]): Session[] =>
    days.map((d) => {
      const slots = d.base.filter(
        (s) => (s.from ?? 0) <= level && level <= (s.to ?? 2),
      );
      // Over the ceiling, drop the most experience-specific slots first.
      while (slots.length > limit) {
        const tiers = slots.map((s) => s.from ?? 0);
        slots.splice(tiers.lastIndexOf(Math.max(...tiers)), 1);
      }
      return {
        name: d.name,
        slots: [
          ...slots,
          ...(d.extras ?? []).slice(0, Math.max(0, limit - slots.length)),
        ],
      };
    });
  const pick = <T>(items: T[]) => items.slice(0, p.frequency);
  if (goal === "foundation")
    return build(
      pick([
        {
          name: "Learn your foundations",
          base: [learnSquat, press, row, hinge, brace],
        },
        {
          name: "Build movement confidence",
          base: [unilateral, press, row, hinge, calf],
        },
        {
          name: "Practice & progress",
          base: [learnSquat, press, row, hinge, side],
        },
      ]),
    );
  if (goal === "strength") {
    if (p.frequency <= 3)
      return build(
        pick([
          {
            name: "Squat & bench strength",
            base: [main(learnSquat), main(press), row, curl, brace],
          },
          {
            name: "Deadlift & overhead strength",
            base: [
              main(deadlift),
              main(shoulderPress),
              vertical,
              unilateral,
              calf,
            ],
          },
          {
            name: "Bench & squat strength",
            base: [main(press), main(learnSquat), rowAlt, rear, brace],
          },
        ]),
      );
    return build([
      {
        name: "Upper body · bench strength",
        base: [main(press), row, shoulderPress, vertical, adv(tri)],
      },
      {
        name: "Lower body · squat strength",
        base: [main(learnSquat), curl, calf, brace],
      },
      {
        name: "Upper body · overhead strength",
        base: [main(shoulderPress), verticalAlt, press, rowAlt, adv(bi)],
      },
      {
        name: "Lower body · deadlift strength",
        base: [main(deadlift), unilateral, calf, brace],
      },
    ]);
  }
  if (goal === "athletic") {
    if (p.frequency <= 3)
      return build(
        pick([
          {
            name: "Single-leg strength & control",
            base: [unilateral, hinge, row, press, brace, calf],
            extras: [side],
          },
          {
            name: "Posterior chain & stability",
            base: [
              unilateral,
              novice(hinge),
              mid(hipThrust),
              vertical,
              press,
              brace,
              calf,
            ],
          },
          {
            name: "Whole-body movement practice",
            base: [unilateral, hinge, row, press, brace, calf],
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
        base: [unilateral, hinge, calf, brace],
      },
      {
        name: "Upper body · balanced capacity",
        base: [incline, vertical, row, side],
      },
      {
        name: "Lower body · posterior control",
        base: [hinge, unilateral, curl, calf, brace],
      },
    ]);
  }
  if (goal === "recomp") {
    if (p.frequency <= 3)
      return build(
        pick([
          {
            name: "Full body · strength retention",
            base: [squat, press, row, hinge, brace, side],
          },
          {
            name: "Full body · balanced resistance",
            base: [unilateral, incline, vertical, curl, brace, calf],
          },
          {
            name: "Full body · repeat quality",
            base: [squat, press, rowAlt, hinge, brace, side],
          },
        ]),
      );
    return build([
      {
        name: "Upper body · retain strength",
        base: [press, row, shoulderPress, vertical],
      },
      { name: "Lower body · quad focus", base: [squat, hinge, calf, brace] },
      {
        name: "Upper body · balanced capacity",
        base: [incline, vertical, row, side],
      },
      {
        name: "Lower body · posterior control",
        base: [hinge, unilateral, curl, calf, brace],
      },
    ]);
  }
  // Hypertrophy (Build Muscle, Advanced Physique). Beginners train the
  // essential movements (5–6 per session); intermediates add one targeted
  // movement and advanced lifters two, within the session ceiling (Build
  // Muscle 7, Advanced Physique 8). Advanced Physique's shoulders-and-arms
  // emphasis takes the optional full-body slots; Build Muscle uses them for
  // calves and trunk.
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
          name: "Full body · glutes & shoulders",
          base: [squat, press, rowAlt, novice(hinge), mid(hipThrust), side, bi],
          extras: physique ? [tri, rear] : [tri, calf],
        },
      ]),
    );
  // Advanced Physique spends its extra upper-body slots on arms rather than
  // more chest and back isolation.
  const upperA: Blueprint = {
    name: "Upper body · chest & back",
    base: physique
      ? [press, row, vertical, mid(fly), side, tri, bi, adv(biAlt)]
      : [press, row, vertical, mid(fly), side, adv(rear), tri, bi],
  };
  const upperB: Blueprint = {
    name: "Upper body · back & shoulders",
    base: physique
      ? [verticalAlt, incline, rowAlt, side, rear, bi, mid(tri), adv(tri)]
      : [verticalAlt, incline, rowAlt, adv(latIso), side, rear, bi, mid(tri)],
  };
  const lowerA: Blueprint = {
    name: "Legs · quad focus",
    base: [squat, hinge, adv(quadAlt), quad, curl, calf, mid(core)],
  };
  const lowerB: Blueprint = {
    name: "Legs · posterior focus",
    base: [hipThrust, mid(hinge), unilateral, curl, quad, calf, adv(core)],
  };
  const push: Blueprint = {
    name: "Chest, shoulders & triceps",
    base: [press, incline, shoulderPress, mid(fly), side, tri, adv(tri)],
  };
  // Pull days: vertical pull and row for everyone; intermediates add a
  // second row and a complementary curl; advanced lifters swap the second
  // row for lat isolation and add trunk work (at most three back movements).
  const pullSlots = (first: Slot, second: Slot, third: Slot) => [
    first,
    second,
    midOnly(third),
    adv(latIso),
    rear,
    bi,
    biAlt,
    adv(hangingCore),
  ];
  const pull: Blueprint = {
    name: "Back, rear delts & biceps",
    base: pullSlots(verticalAlt, rowAlt, row),
  };
  if (p.frequency === 4) return build([upperA, lowerA, upperB, lowerB]);
  if (p.frequency === 5)
    return build([
      {
        ...upperA,
        base: [press, row, vertical, side, adv(rear), tri, bi, mid(biAlt)],
      },
      lowerA,
      push,
      pull,
      lowerB,
    ]);
  return build([
    push,
    { ...pull, base: pullSlots(row, vertical, rowAlt) },
    lowerA,
    {
      ...push,
      name: "Chest & shoulder detail",
      base: [incline, press, shoulderPress, mid(fly), side, tri, adv(tri)],
    },
    {
      ...pull,
      name: "Back width & arm detail",
      base: pullSlots(verticalAlt, rowAlt, row),
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
// Movements already chosen this week, by exercise and movement family.
type Usage = { ids: Map<string, number>; kinds: Map<string, number> };
const bump = (map: Map<string, number>, key: string | undefined) => {
  if (key) map.set(key, (map.get(key) ?? 0) + 1);
};
// A slot only accepts its reviewed movement families; nothing is invented
// when equipment cannot support it. Alternatives remain visible in the
// workload review rather than masquerading as equivalent coverage. With week
// usage, accessory slots prefer a movement (and for arms, calves and trunk a
// movement family) not yet used this week, so variety comes from distinct
// stimuli rather than random swaps. Main lifts and the beginner foundation
// Path stay consistent for practice and progressive overload.
export function slotMovements(
  p: PathPreferences,
  dayIndex: number,
  index: number,
  catalog: Exercise[],
  usage?: Usage,
) {
  const target = sessions(p)[dayIndex]?.slots[index];
  return target ? rankSlot(p, target, catalog, usage) : [];
}
function rankSlot(
  p: PathPreferences,
  target: Slot,
  catalog: Exercise[],
  usage?: Usage,
) {
  const choices = compatibleMovements(p, target.role, catalog);
  const available = choices.filter(
    (m) => target.kinds.includes(m.kind) && (!target.loaded || m.needs.length),
  );
  const varied =
    !!usage &&
    goalOf(p) !== "foundation" &&
    !target.main &&
    (p.experience !== "Beginner" || !!target.isolation);
  return [...available].sort((a, b) => {
    const family = (m: (typeof available)[number]) =>
      target.vary ? 0 : target.kinds.indexOf(m.kind);
    const rank = (id: string) => {
      const i = target.preferred?.indexOf(id) ?? -1;
      return i < 0 ? 100 : i;
    };
    // Keep explicit machine/free-weight preferences ahead of the default examples.
    const style = (m: (typeof available)[number]) =>
      p.style === "Machines"
        ? Number(m.needs.some((n) => n === "Cable" || machineRequirement(n)))
        : p.style === "Free weights"
          ? Number(
              m.needs.some((n) =>
                ["Barbell", "Dumbbell", "Kettlebell"].includes(n),
              ),
            )
          : 0;
    const repeat = (m: (typeof available)[number]) =>
      varied
        ? (usage.ids.get(m.id) ?? 0) * 10 +
          (target.vary ? (usage.kinds.get(m.kind) ?? 0) : 0)
        : 0;
    return (
      family(a) - family(b) ||
      style(b) - style(a) ||
      repeat(a) - repeat(b) ||
      rank(a.id) - rank(b.id)
    );
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
const MAX_SAME_FAMILY_PER_DAY = 2;
class WeekBalanceError extends Error {}

// Plans the whole week before any prescriptions are written: every day takes
// its reviewed slot choices, then the week is compared as one split. Short days
// first receive a same-role alternative for a planned slot their equipment
// could not fill; otherwise the longest days lose their least essential
// movement. Nothing is added beyond the session's designed slots.
function planWeek(p: PathPreferences, catalog: Exercise[]): Pick[][] {
  const specs = sessions(p);
  const offsets = dates(p);
  const usage: Usage = { ids: new Map(), kinds: new Map() };
  // At most two movements from one family per session (three squats or
  // three flat presses add overlap, not stimulus).
  const room = (picks: Pick[], id: string) =>
    picks.filter((x) => menuMovement(x.id)?.kind === menuMovement(id)?.kind)
      .length < MAX_SAME_FAMILY_PER_DAY;
  const plan = specs.map((s) => {
    const picks: Pick[] = [];
    for (const [j, target] of s.slots.entries()) {
      const choice = rankSlot(p, target, catalog, usage).find(
        (m) => !picks.some((x) => x.id === m.id) && room(picks, m.id),
      );
      if (!choice) continue;
      picks.push({ slot: j, id: choice.id });
      bump(usage.ids, choice.id);
      bump(usage.kinds, choice.kind);
    }
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
      const pattern = (id: string) => {
        const kind = menuMovement(id)?.kind;
        return !!kind && target.kinds.includes(kind);
      };
      const options = compatibleMovements(p, target.role, catalog)
        .filter((m) => !picks.some((x) => x.id === m.id))
        .filter((m) => !target.compound || !exerciseStimulus(m.id).isolation)
        .filter((m) => !target.loaded || m.needs.length)
        .filter((m) => room(picks, m.id))
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

// Days whose planned movements equipment could not supply are named for what
// they actually train: the first three distinct targets, in session order.
function adaptedName(roles: PathRole[]) {
  const labels: Record<PathRole, string> = {
    push: "chest",
    pull: "back",
    squat: "quads",
    posterior: "posterior chain",
    shoulder: "shoulders",
    rear: "rear delts",
    biceps: "biceps",
    triceps: "triceps",
    calf: "calves",
    core: "core",
  };
  const names = [...new Set(roles.map((role) => labels[role]))].slice(0, 3);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
      : (names[0] ?? "");
  return `Adapted · ${list}`;
}

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
    // Only a conventional deadlift is presented as a deadlift.
    const name = picks.some((x) => menuMovement(x.id)?.kind === "deadlift")
      ? s.name
      : s.name.replace("Deadlift", "Hinge").replace("deadlift", "hinge");
    return {
      key: `day-${i}`,
      name: adapted ? adaptedName(roles) : name,
      offset: offsets[i]!,
      roles,
      exercises,
    };
  });
  adjustWeeklyVolume(days, p);
  balancePushPull(days, p, catalog);
  balanceVolume(days, p);
  recovery(days);
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
  if ((draft.engineVersion ?? 1) < 8) return days;
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
  // Engine 8+ plans are judged by the program-quality engine (equipment,
  // prescriptions, balance, volume and recovery) rather than a fixed slot
  // order, so customized plans validate on their merits.
  const current = (draft.engineVersion ?? 1) >= 8;
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
    if (!current && !matches(0, 0))
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
  // Generated weeks never repeat demanding movement groups on adjacent days;
  // engine 8+ plans report it as a program-quality finding instead, so a
  // lifter's own changes are reviewed rather than silently rejected.
  if (!current) recovery(draft.days);
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
