import type { RepTarget, WorkoutSet } from "./types";

export function targetProgression(
  history: WorkoutSet[][],
  target: RepTarget,
  increment: number,
): { weight: number | null; reason: string } {
  const recent = history.slice(0, 2);
  const last = recent[0];
  if (!last?.length)
    return {
      weight: null,
      reason:
        "Log a complete session at this prescription to establish a load. Choose technique and effort deliberately.",
    };
  const weight = last[0]!.weight;
  const complete = (sets: WorkoutSet[]) =>
    sets.length === target.sets &&
    sets.every((s) => s.completed && s.kind === "working");
  if (
    !recent.every(complete) ||
    !recent.every((h) => h.every((s) => s.weight === weight))
  )
    return {
      weight: null,
      reason:
        "Loads or working sets differ. Review the logged sets and choose your next load manually.",
    };
  if (weight === 0)
    return {
      weight: null,
      reason:
        "Choose added load manually for bodyweight or unloaded work; repetitions alone do not establish readiness.",
    };
  const hold = {
    weight,
    reason: `Build repetitions toward ${target.max} on every working set before increasing load. Keep technique controlled; an effort entry cannot verify technique.`,
  };
  if (recent.length < 2) return hold;
  // Matches Path effort targets (about one to two reps in reserve). Sets taken
  // to failure do not establish that the load is manageable.
  const effortSupported = (s: WorkoutSet) =>
    (s.rpe != null || s.rir != null) &&
    (s.rpe == null || s.rpe <= 9) &&
    (s.rir == null || s.rir >= 1);
  if (recent.every((h) => h.every((s) => s.reps >= target.max))) {
    if (!recent.every((h) => h.every(effortSupported)))
      return {
        weight,
        reason:
          "Upper reps reached, but manageable effort is not established on every set. Hold or review the load; reps alone do not establish readiness.",
      };
    return {
      weight: Math.round((weight + increment) * 1000) / 1000,
      reason:
        "Two complete sessions reached the upper target at the same load with reported manageable effort. If technique and recovery also allow, consider one increment and rebuild within the range.",
    };
  }
  if (recent.every((h) => h.some((s) => s.reps < target.min)))
    return {
      weight: Math.round(weight * 0.9 * 1000) / 1000,
      reason:
        "Targets were missed in two complete sessions at the same load. Consider a 10% reduction and review technique and recovery; this is optional guidance.",
    };
  return hold;
}
