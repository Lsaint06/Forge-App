import { exerciseStimulus } from "./stimulus";
import type { Exercise } from "../types";
import type { PathDraft } from "./generator";
import { structure } from "./generator";
import { weeklySessionBalance } from "./balance";

// Reviewed direct targets and assistance remain separate. A compound set may
// directly target two muscles, but total workout sets count it only once.
export function workloadReview(draft: PathDraft, catalog: Exercise[]) {
  const sets: Record<string, number> = {};
  const assistance: Record<string, number> = {};
  const patterns = new Set<string>();
  let total = 0;
  let unreviewed = false;
  for (const day of draft.days)
    for (const p of day.exercises) {
      const e = catalog.find((e) => e.id === p.exerciseId);
      if (!e) {
        unreviewed = true;
        total += p.sets;
        continue;
      }
      patterns.add(e.pattern);
      const stimulus = exerciseStimulus(e.id);
      total += p.sets;
      if (!stimulus.reviewed) unreviewed = true;
      for (const muscle of stimulus.direct)
        sets[muscle] = (sets[muscle] ?? 0) + p.sets;
      for (const muscle of stimulus.assistance)
        assistance[muscle] = (assistance[muscle] ?? 0) + p.sets;
    }
  const warnings: string[] = [];
  if (unreviewed)
    warnings.push(
      "Custom or unavailable movements have not been assessed for muscle coverage.",
    );
  if (draft.preferences.avoidPatterns.length)
    warnings.push(
      `Excluded movements: ${draft.preferences.avoidPatterns.join(", ")}. Unavailable slots are omitted rather than forcing these movements back into your plan. Working-set totals reflect the adapted plan.`,
    );
  if (draft.preferences.excluded.length)
    warnings.push(
      "Your exercise exclusions are respected. Where no distinct permitted alternative fits, the slot is omitted; review the resulting muscle coverage below.",
    );
  if (!sets.Quads)
    warnings.push(
      "This plan has no direct quadriceps work with your current choices. It is an adapted plan, not complete lower-body coverage.",
    );
  const bodybuilding = ["build-muscle", "advanced-physique"].includes(
    draft.preferences.pathKey,
  );
  if (bodybuilding && !patterns.has("vertical pull"))
    warnings.push(
      "No vertical pull is programmed with these choices. Rows and pulldowns serve different purposes; review your equipment or exclusions if you want both.",
    );
  if (
    bodybuilding &&
    !draft.days.some((d) =>
      d.exercises.some((e) => e.exerciseId === "seated-leg-curl"),
    )
  )
    warnings.push(
      "No knee-flexion hamstring curl is included. Hinges and bridges are not identical substitutes; a leg-curl machine expands your options.",
    );
  if (bodybuilding) {
    for (const target of ["Calves", "Side delts", "Biceps", "Triceps"])
      if (!sets[target])
        warnings.push(
          `${target} have no direct working sets with these choices. Compound assistance is not included in these counts.`,
        );
  }
  return {
    sets,
    warnings,
    total,
    assistance,
    balance: weeklySessionBalance(
      draft,
      catalog,
      (draft.engineVersion ?? 1) >= 6
        ? structure(draft.preferences, draft.engineVersion)
        : undefined,
    ),
  };
}
export function trainingGuidance(key: string) {
  if (key === "get-strong")
    return "Strength: practice repeatable lifts, take three minutes or more when needed, and stop with about two good repetitions left. Add the smallest load only after all sets meet the target cleanly.";
  if (key === "athlete-mode")
    return "Athletic foundation: controlled single-leg work, strength and trunk stability. Leave two to three good repetitions in reserve. This block is not a sport-specific power or conditioning plan.";
  if (key === "start-strong")
    return "Foundation: learn each movement, warm up, then complete the listed working sets with about three good repetitions left. Add repetitions or the smallest load when technique and recovery allow.";
  return "Choose a load that makes the listed repetitions challenging with about one to three good repetitions left. If a rep range is shown, build repetitions within it before adding load. After consistently reaching the upper target on every set with controlled technique and manageable effort, consider the smallest practical increase. Logged reps alone do not establish readiness. Keep rests longer when needed; warm-ups are additional. Reassess if performance or recovery declines.";
}
