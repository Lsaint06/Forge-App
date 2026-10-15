import type { Exercise } from "../types";
import type { PathDraft } from "./generator";

// Reviewed primary targets only: compound assistance is deliberately not counted
// as a second full set. These are planning counts, not a physiological dose model.
export function workloadReview(draft: PathDraft, catalog: Exercise[]) {
  const sets: Record<string, number> = {};
  const patterns = new Set<string>();
  for (const day of draft.days)
    day.exercises.forEach((p, i) => {
      const e = catalog.find((e) => e.id === p.exerciseId);
      if (!e) return;
      patterns.add(e.pattern);
      const role = day.roles[i]!;
      const target =
        role === "push"
          ? "Chest"
          : role === "pull"
            ? e.pattern === "shoulder isolation"
              ? "Rear delts"
              : "Back"
            : role === "squat"
              ? "Quads"
              : role === "posterior"
                ? e.pattern === "hip extension"
                  ? "Glutes"
                  : "Hamstrings"
                : role === "shoulder"
                  ? e.id === "dumbbell-lateral-raise"
                    ? "Side delts"
                    : /reverse-fly|pull-apart/.test(e.id)
                      ? "Rear delts"
                      : "Front delts"
                  : role === "rear"
                    ? "Rear delts"
                    : role === "calf"
                      ? "Calves"
                      : role === "biceps"
                        ? "Biceps"
                        : role === "triceps"
                          ? "Triceps"
                          : "Core";
      sets[target] = (sets[target] ?? 0) + p.sets;
    });
  const warnings: string[] = [];
  if (!patterns.has("vertical pull"))
    warnings.push(
      "No vertical pull fits this plan. Back work relies on rows; add suitable pulling equipment or review your exclusions for more variety.",
    );
  if (
    !draft.days.some((d) =>
      d.exercises.some((e) => e.exerciseId === "seated-leg-curl"),
    )
  )
    warnings.push(
      "No knee-flexion hamstring curl is included. Hinges and bridges are not identical substitutes; a leg-curl machine expands your options.",
    );
  if (
    ["build-muscle", "advanced-physique"].includes(draft.preferences.pathKey)
  ) {
    for (const target of ["Calves", "Side delts", "Biceps", "Triceps"])
      if (!sets[target])
        warnings.push(
          `${target} have no direct working sets with these choices. Compound assistance is not included in these counts.`,
        );
  }
  return {
    sets,
    warnings,
    total: Object.values(sets).reduce((a, b) => a + b, 0),
  };
}
export function trainingGuidance(key: string) {
  if (key === "get-strong")
    return "Strength: practice repeatable lifts, take three minutes or more when needed, and stop with about two good repetitions left. Add the smallest load only after all sets meet the target cleanly.";
  if (key === "athlete-mode")
    return "Athletic foundation: controlled single-leg work, strength and trunk stability. Leave two to three good repetitions in reserve. This block is not a sport-specific power or conditioning plan.";
  if (key === "start-strong")
    return "Foundation: learn each movement, warm up, then complete the listed working sets with about three good repetitions left. Add repetitions or the smallest load when technique and recovery allow.";
  return "Choose a load that makes the listed repetitions challenging with about one to three good repetitions left. When all sets meet their targets with control, add the smallest load next time. Keep rests longer when needed; warm-ups are additional. Reassess if performance or recovery declines.";
}
