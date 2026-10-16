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
  if (/calf/.test(id))
    return target(
      ["Calves"],
      [],
      true,
      /seated/.test(id)
        ? "Bent-knee calf work, which shifts emphasis toward the soleus."
        : "Direct calf loading through controlled ankle movement.",
    );
  if (/fly/.test(id) && !/reverse/.test(id))
    return target(
      ["Chest"],
      [],
      true,
      "Direct chest work with less triceps demand than pressing.",
    );
  if (/triceps-dip/.test(id))
    return target(
      ["Triceps"],
      ["Chest", "Front delts"],
      false,
      "Bodyweight triceps compound; use a depth your shoulders tolerate.",
    );
  if (
    /bench-press|floor-press|chest-press|incline-press|push-up|chest-dip/.test(
      id,
    )
  )
    return target(
      ["Chest"],
      ["Triceps", "Front delts"],
      false,
      /incline/.test(id)
        ? "Incline pressing for the upper chest, with triceps and front-delt assistance."
        : "Chest-focused pressing, with triceps and front-delt assistance.",
    );
  if (/reverse-fly|reverse-pec-deck|face-pull|pull-apart/.test(id))
    return target(
      ["Rear delts"],
      ["Back"],
      true,
      "Rear-delt and scapular work, complementing rows and pulldowns.",
    );
  if (/straight-arm-pulldown|pullover/.test(id))
    return target(
      ["Back"],
      [],
      true,
      "Lat work with the elbows fixed; adds back volume without more biceps fatigue.",
    );
  if (/row|pulldown|pull-up|chin-up/.test(id))
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
  if (/squat|leg-press|lunge|step-up/.test(id))
    return target(
      ["Quads", "Glutes"],
      [],
      false,
      /split|lunge|step-up/.test(id)
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
  if (/pull-through/.test(id))
    return target(
      ["Glutes", "Hamstrings"],
      [],
      false,
      "Cable hip hinge for glutes and hamstrings with low spinal loading.",
    );
  if (/conventional-deadlift/.test(id))
    return target(
      ["Hamstrings", "Glutes"],
      ["Back", "Quads"],
      false,
      "Heavy pull from the floor for whole-body hip and back strength. A Romanian deadlift is a different, hamstring-focused lift.",
    );
  if (/deadlift|good-morning/.test(id))
    return target(
      ["Hamstrings", "Glutes"],
      ["Back"],
      false,
      "Hip-hinge strength for hamstrings and glutes.",
    );
  if (/glute-bridge|hip-thrust/.test(id))
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
  if (/shoulder-press|overhead-press|arnold-press/.test(id))
    return target(
      ["Front delts"],
      ["Triceps", "Side delts"],
      false,
      "Overhead pressing strength and shoulder development.",
    );
  if (/triceps|pushdown|skull-crusher|overhead-cable-extension/.test(id))
    return target(
      ["Triceps"],
      [],
      true,
      /overhead/.test(id)
        ? "Triceps work with the arm overhead, training the long head at long lengths."
        : "Direct triceps work, complementing pressing.",
    );
  if (/curl/.test(id))
    return target(
      ["Biceps"],
      [],
      true,
      /incline|behind-body/.test(id)
        ? "Biceps curl with the arm behind the body, emphasising the stretched position."
        : /preacher|spider|concentration/.test(id)
          ? "Supported biceps curl that removes body swing."
          : /hammer/.test(id)
            ? "Neutral-grip curl that also trains the brachialis and forearm."
            : "Direct elbow-flexion work, complementing pulling.",
    );
  if (
    [
      "dead-bug",
      "bird-dog",
      "reverse-crunch",
      "pallof-press",
      "side-plank-hip-lift",
      "cable-crunch",
      "hanging-knee-raise",
      "hanging-leg-raise",
    ].includes(id)
  )
    return target(
      ["Core"],
      [],
      true,
      "Controlled trunk work; use the target per side for alternating movements.",
    );
  return unknown;
}
