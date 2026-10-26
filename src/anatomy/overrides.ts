import { ENTRY } from "./groups";
import type { MuscleEntry } from "./types";

// Exercise-specific display overrides (Phase 7.2C-3A). Presentation only:
// the exercise catalogue is unchanged. Each override either
//   - removes a listed muscle the movement does not train (the catalogue's
//     secondary muscles are per-pattern defaults), or
//   - narrows a broad group to the part the joint action trains,
// and never adds a muscle the catalogue does not list. Additions are
// proposed separately (docs/audits/PHASE_7_2C_3A_ANATOMY_FOUNDATION.md).
// Reasons cite joint actions per OpenStax Anatomy and Physiology 2e, ch. 11.

export type Override = {
  /** Replaces the catalogue's primary display when set. */
  primary?: MuscleEntry[];
  /** Replaces the catalogue's secondary display when set. */
  secondary?: MuscleEntry[];
  reason: string;
};

const group = (ids: string[], o: Override) =>
  Object.fromEntries(ids.map((id) => [id, o]));

export const OVERRIDES: Record<string, Override> = {
  // Chest flies: the elbow stays fixed, so the triceps only stabilise.
  ...group(
    [
      "cable-crossover",
      "decline-dumbbell-fly",
      "dumbbell-fly",
      "high-to-low-cable-fly",
      "incline-dumbbell-fly",
      "low-to-high-cable-fly",
      "pec-deck-fly",
      "single-arm-cable-fly",
      "standing-cable-fly",
    ],
    {
      secondary: [ENTRY.frontDeltoids],
      reason: "fly: horizontal adduction with a fixed elbow; no triceps work",
    },
  ),
  // Shoulder raises: no elbow extension; the raise direction names the head.
  ...group(
    [
      "alternating-front-raise",
      "barbell-front-raise",
      "cable-front-raise",
      "dumbbell-front-raise",
    ],
    {
      primary: [ENTRY.frontDeltoids],
      secondary: [],
      reason: "front raise: shoulder flexion (anterior deltoid); no triceps",
    },
  ),
  ...group(
    [
      "behind-back-cable-lateral-raise",
      "cable-lateral-raise",
      "dumbbell-lateral-raise",
      "leaning-lateral-raise",
      "machine-lateral-raise",
      "seated-lateral-raise",
      "wide-grip-upright-row",
    ],
    {
      primary: [ENTRY.sideDeltoids],
      secondary: [],
      reason:
        "lateral raise / upright row: shoulder abduction (lateral deltoid); no triceps",
    },
  ),
  ...group(
    [
      "bent-over-reverse-fly",
      "cable-reverse-fly",
      "chest-supported-reverse-fly",
      "band-pull-apart",
    ],
    {
      primary: [ENTRY.rearDeltoids],
      secondary: [],
      reason:
        "reverse fly: horizontal abduction (posterior deltoid); no triceps",
    },
  ),
  "reverse-pec-deck": {
    primary: [ENTRY.rearDeltoids],
    reason: "reverse fly: horizontal abduction (posterior deltoid)",
  },
  ...group(
    [
      "band-external-rotation",
      "cable-external-rotation",
      "dumbbell-cuban-rotation",
    ],
    {
      primary: [ENTRY.externalRotators],
      secondary: [],
      reason: "external rotation: infraspinatus and teres minor; no triceps",
    },
  ),
  "cable-internal-rotation": {
    primary: [ENTRY.internalRotators],
    secondary: [],
    reason: "internal rotation: subscapularis (not visible); no triceps",
  },
  ...group(["cable-y-raise", "dumbbell-scaption"], {
    secondary: [],
    reason: "raise: no elbow extension, so no triceps",
  }),
  "snatch-grip-high-pull": {
    primary: [ENTRY.deltoids],
    secondary: [],
    reason: "high pull: a pull, not a press; no triceps",
  },
  // Shrugs: scapular elevation; the elbows stay straight.
  ...group(["barbell-shrug", "cable-shrug", "dumbbell-shrug"], {
    secondary: [],
    reason: "shrug: scapular elevation; no elbow flexion",
  }),
  // Straight-arm lat work: shoulder extension with a fixed elbow.
  ...group(["straight-arm-pulldown", "cable-pullover", "scapular-pull-up"], {
    secondary: [],
    reason: "straight-arm pull: no elbow flexion, so no biceps",
  }),
  ...group(["dumbbell-pullover", "machine-pullover"], {
    primary: [ENTRY.lats],
    secondary: [],
    reason:
      "pullover: shoulder extension (latissimus dorsi), not a row; no biceps",
  }),
  // Knee flexion: the hamstrings bend the knee; the glutes only stabilise.
  ...group(
    [
      "assisted-nordic-curl",
      "glute-ham-raise",
      "lying-leg-curl",
      "nordic-hamstring-curl",
      "seated-leg-curl",
      "single-leg-lying-curl",
      "single-leg-seated-curl",
      "sliding-leg-curl",
      "standing-leg-curl",
      "swiss-ball-leg-curl",
    ],
    {
      secondary: [],
      reason: "leg curl: knee flexion; the glutes do not extend the hip",
    },
  ),
  // Knee extension only: no hip extension, so no glutes.
  ...group(
    [
      "leg-extension",
      "single-leg-leg-extension",
      "sissy-squat",
      "reverse-nordic-curl",
    ],
    {
      secondary: [],
      reason: "knee extension: quadriceps only; no hip extension",
    },
  ),
  // Hip adduction and abduction are different muscles from hip extension.
  ...group(["cable-hip-adduction", "machine-hip-adduction"], {
    primary: [ENTRY.adductors],
    reason: "hip adduction: adductor group, not the glutes",
  }),
  ...group(
    [
      "cable-hip-abduction",
      "machine-hip-abduction",
      "side-lying-hip-abduction",
      "band-lateral-walk",
      "monster-walk",
      "clamshell",
      "fire-hydrant",
    ],
    {
      primary: [ENTRY.gluteMedius],
      reason: "hip abduction: gluteus medius",
    },
  ),
  // Phase 7.2C-3D accuracy review.
  // Lifts from the floor and hip snaps: the gluteus maximus is a prime mover
  // of hip extension alongside the hamstrings, not a secondary. Romanian and
  // stiff-leg deadlifts and good mornings keep the hamstring emphasis.
  ...group(
    [
      "conventional-deadlift",
      "sumo-deadlift",
      "deficit-deadlift",
      "paused-deadlift",
      "trap-bar-deadlift",
      "snatch-grip-deadlift",
      "rack-pull",
      "dumbbell-deadlift",
      "kettlebell-deadlift",
    ],
    {
      primary: [ENTRY.hamstrings, ENTRY.glutes],
      secondary: [],
      reason:
        "deadlift: hip extension by the gluteus maximus and hamstrings together",
    },
  ),
  ...group(
    ["kettlebell-swing", "single-arm-kettlebell-swing", "cable-pull-through"],
    {
      primary: [ENTRY.glutes, ENTRY.hamstrings],
      secondary: [],
      reason: "hip snap: hip extension led by the gluteus maximus",
    },
  ),
  // Trunk rotation and side bending are oblique actions; flexion keeps both.
  ...group(
    [
      "russian-twist",
      "heel-touch",
      "cable-woodchop",
      "reverse-cable-woodchop",
      "medicine-ball-rotational-throw",
      "cable-side-bend",
      "dumbbell-side-bend",
      "side-plank",
      "side-plank-hip-lift",
    ],
    {
      primary: [ENTRY.obliques],
      reason: "rotation / lateral flexion: external and internal obliques",
    },
  ),
  // Bent-knee calf raises shorten the gastrocnemius, so the soleus leads
  // (Signorile et al., J Strength Cond Res 2002;16(3):433–439).
  ...group(["seated-calf-raise", "bent-knee-calf-raise"], {
    primary: [ENTRY.soleus],
    secondary: [ENTRY.gastrocnemius],
    reason: "bent-knee calf raise: soleus leads; gastrocnemius assists",
  }),
  // Pronated curls shift work to the brachioradialis (Kleiber et al.,
  // Front Physiol 2015;6:215). Neutral (hammer) grips are left unchanged.
  ...group(
    ["reverse-dumbbell-curl", "reverse-barbell-curl", "cable-reverse-curl"],
    {
      primary: [ENTRY.biceps, ENTRY.brachioradialis],
      reason: "pronated curl: brachioradialis works with the biceps",
    },
  ),
  // Protraction with straight elbows: no elbow extension or shoulder flexion.
  "scapular-push-up": {
    primary: [ENTRY.protractors],
    secondary: [],
    reason: "scapular protraction: serratus anterior and pectoralis minor",
  },
};
