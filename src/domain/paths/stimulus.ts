import { movementMenu } from "./catalog";
const reviewedIds = new Set(movementMenu.map((m) => m.id));
// Reviewed training targets; catalog movement labels alone are too broad for
// planning (for example, its leg extension is labeled "squat"). Assistance is
// reported separately, never converted into an exact fraction of a direct set.
export type Stimulus = {
  reviewed: boolean;
  direct: string[];
  assistance: string[];
  isolation: boolean;
  purpose: string;
};
const target = (
  direct: string[],
  assistance: string[],
  isolation: boolean,
  purpose: string,
): Stimulus => ({ reviewed: true, direct, assistance, isolation, purpose });
export function exerciseStimulus(id: string): Stimulus {
  const unknown: Stimulus = {
    reviewed: false,
    direct: [],
    assistance: [],
    isolation: false,
    purpose: "Custom movement · not included in reviewed coverage totals.",
  };
  if (!reviewedIds.has(id)) return unknown;
  if (/fly/.test(id) && !/reverse/.test(id))
    return target(
      ["Chest"],
      [],
      true,
      "Direct chest work with less triceps demand than pressing.",
    );
  if (/bench-press|floor-press|chest-press|push-up/.test(id))
    return target(
      ["Chest"],
      ["Triceps", "Front delts"],
      false,
      "Chest-focused pressing, with triceps and front-delt assistance.",
    );
  if (/reverse-fly|face-pull|pull-apart/.test(id))
    return target(
      ["Rear delts"],
      ["Back"],
      true,
      "Rear-delt and scapular work, complementing rows and pulldowns.",
    );
  if (/row|pulldown|pull-up/.test(id))
    return target(
      ["Back"],
      /row/.test(id) ? ["Biceps", "Rear delts"] : ["Biceps"],
      false,
      /row/.test(id)
        ? "Horizontal pulling for upper-back development."
        : "Vertical pulling for the lats and back.",
    );
  if (/leg-extension/.test(id))
    return target(
      ["Quads"],
      [],
      true,
      "Direct knee-extension work, complementing squats and presses.",
    );
  if (/squat|leg-press|lunge/.test(id))
    return target(
      ["Quads", "Glutes"],
      [],
      false,
      /split|lunge/.test(id)
        ? "Loadable single-leg strength and control; complete both sides."
        : "Knee-dominant leg strength for quads and glutes.",
    );
  if (/leg-curl/.test(id))
    return target(
      ["Hamstrings"],
      [],
      true,
      "Knee-flexion work for hamstrings, complementing hinges.",
    );
  if (/deadlift|good-morning/.test(id))
    return target(
      ["Hamstrings", "Glutes"],
      ["Back"],
      false,
      "Hip-hinge strength for hamstrings and glutes.",
    );
  if (/glute-bridge/.test(id))
    return target(
      ["Glutes"],
      [],
      false,
      "Hip extension for glutes; not a substitute for hamstring curls.",
    );
  if (/lateral-raise/.test(id))
    return target(
      ["Side delts"],
      [],
      true,
      "Direct side-delt work that pressing does not fully replace.",
    );
  if (/shoulder-press|overhead-press/.test(id))
    return target(
      ["Front delts"],
      ["Triceps", "Side delts"],
      false,
      "Overhead pressing strength and shoulder development.",
    );
  if (/triceps|pushdown/.test(id))
    return target(
      ["Triceps"],
      [],
      true,
      "Direct triceps work, complementing pressing.",
    );
  if (/curl/.test(id))
    return target(
      ["Biceps"],
      [],
      true,
      "Direct elbow-flexion work, complementing pulling.",
    );
  if (/calf/.test(id))
    return target(
      ["Calves"],
      [],
      true,
      "Direct calf loading through controlled ankle movement.",
    );
  if (["dead-bug", "bird-dog", "reverse-crunch"].includes(id))
    return target(
      ["Core"],
      [],
      true,
      "Controlled trunk work; use the target per side for alternating movements.",
    );
  return unknown;
}
