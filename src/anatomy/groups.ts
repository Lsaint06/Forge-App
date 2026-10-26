import type { MuscleEntry } from "./types";

// What each catalogue muscle group shows on the atlas (Phase 7.2C-3).
// Muscle actions follow OpenStax Anatomy and Physiology 2e, ch. 11
// (CC BY 4.0), the same source as the atlas drawing.

const e = (
  label: string,
  muscles: string[],
  regions: MuscleEntry["regions"],
): MuscleEntry => ({ label, muscles, regions });

export const ENTRY = {
  chest: e("Chest", ["Pectoralis major"], ["front.pectoralis-major"]),
  // One deltoid shape per view: the front view shows the anterior and
  // lateral heads, the back view the posterior and lateral heads.
  deltoids: e("Shoulders", ["Deltoid"], ["front.deltoid", "back.deltoid"]),
  pressDeltoids: e(
    "Shoulders",
    ["Anterior deltoid", "Lateral deltoid"],
    ["front.deltoid"],
  ),
  frontDeltoids: e("Front deltoids", ["Anterior deltoid"], ["front.deltoid"]),
  sideDeltoids: e(
    "Side deltoids",
    ["Lateral deltoid"],
    ["front.deltoid", "back.deltoid"],
  ),
  rearDeltoids: e("Rear deltoids", ["Posterior deltoid"], ["back.deltoid"]),
  externalRotators: e(
    "Rotator cuff",
    ["Infraspinatus", "Teres minor"],
    ["back.infraspinatus"],
  ),
  // Lies under the chest and shoulder blade: named, never drawn.
  internalRotators: e("Rotator cuff", ["Subscapularis"], []),
  lats: e("Back", ["Latissimus dorsi"], ["back.latissimus-dorsi"]),
  // Rows: shoulder extension (lats) and scapular retraction (trapezius,
  // rhomboids; the rhomboids lie under the trapezius and are not drawn).
  upperBack: e(
    "Back",
    ["Latissimus dorsi", "Trapezius", "Rhomboids"],
    ["back.latissimus-dorsi", "back.trapezius"],
  ),
  retractors: e("Upper back", ["Trapezius", "Rhomboids"], ["back.trapezius"]),
  traps: e(
    "Trapezius",
    ["Upper trapezius"],
    ["front.trapezius", "back.trapezius"],
  ),
  biceps: e("Biceps", ["Biceps brachii"], ["front.biceps"]),
  triceps: e("Triceps", ["Triceps brachii"], ["back.triceps"]),
  core: e(
    "Core",
    ["Rectus abdominis", "Obliques"],
    ["front.rectus-abdominis", "front.obliques", "back.obliques"],
  ),
  quadriceps: e(
    "Quadriceps",
    ["Rectus femoris", "Vastus lateralis", "Vastus medialis"],
    ["front.quadriceps"],
  ),
  hamstrings: e(
    "Hamstrings",
    ["Biceps femoris", "Semitendinosus", "Semimembranosus"],
    ["back.hamstrings"],
  ),
  glutes: e("Glutes", ["Gluteus maximus"], ["back.gluteus-maximus"]),
  gluteMedius: e("Glutes", ["Gluteus medius"], ["back.gluteus-medius"]),
  adductors: e("Adductors", ["Adductor group"], ["front.adductors"]),
  calves: e(
    "Calves",
    ["Gastrocnemius", "Soleus"],
    ["back.gastrocnemius", "back.soleus"],
  ),
  tibialis: e("Tibialis", ["Tibialis anterior"], ["front.tibialis-anterior"]),
} as const satisfies Record<string, MuscleEntry>;

const PRESSES = new Set(["horizontal push", "vertical push"]);

/**
 * A catalogue muscle group in the context of the movement: the movement
 * pattern narrows a broad group only where the joint action is unambiguous.
 * Unknown groups (e.g. a custom exercise's free choice) are named, not drawn.
 */
export function groupEntry(
  group: string,
  pattern: string,
  role: "primary" | "secondary",
): MuscleEntry | undefined {
  switch (group) {
    case "Chest":
      return ENTRY.chest;
    case "Shoulders":
      if (pattern === "horizontal pull") return ENTRY.rearDeltoids;
      if (PRESSES.has(pattern))
        return role === "primary" ? ENTRY.pressDeltoids : ENTRY.frontDeltoids;
      return ENTRY.deltoids;
    case "Back":
      if (role === "secondary") return ENTRY.retractors;
      if (pattern === "vertical pull") return ENTRY.lats;
      if (pattern === "scapular elevation") return ENTRY.traps;
      return ENTRY.upperBack;
    case "Biceps":
      return ENTRY.biceps;
    case "Triceps":
      return ENTRY.triceps;
    case "Core":
      return ENTRY.core;
    case "Quadriceps":
      return ENTRY.quadriceps;
    case "Hamstrings":
      return ENTRY.hamstrings;
    case "Glutes":
      return ENTRY.glutes;
    case "Calves":
      return ENTRY.calves;
    case "Tibialis":
      return ENTRY.tibialis;
    case "Full body":
      return undefined;
    default:
      return group.trim()
        ? { label: group, muscles: [], regions: [] }
        : undefined;
  }
}
