import { kgToLb, VOLUME_MILESTONE_KG } from "../metrics";
import type { GoalView } from "../goals";

// Progress milestones and next goals (Phase 7.4F). Presentation only: the
// milestone thresholds (`milestoneList`) and goal evaluation (`evaluate`) are
// unchanged.

/**
 * A milestone's name in the lifter's units (PD-3): the volume milestone is
 * "10,000 kg lifted" in kilograms and "22,046 lb lifted" in pounds. The
 * threshold is the same 10,000 kg either way.
 */
export function milestoneName(
  m: { id: string; name: string },
  units: "kg" | "lb",
) {
  if (m.id !== "volume" || units === "kg") return m.name;
  return `${Math.round(kgToLb(VOLUME_MILESTONE_KG)).toLocaleString()} lb lifted`;
}

/**
 * Up to `max` active goals in the order Home picks its next target
 * (`nextTarget`, so the first is always Home's): measured target goals not
 * yet reached, closest to their target first; then other active goals with
 * a recorded value (a reached one waits to be marked achieved); ties to the
 * newest goal, then the greater id. Archived and achieved goals are left out.
 */
export function nextGoals(views: GoalView[], max = 3): GoalView[] {
  const newest = (a: GoalView, b: GoalView) =>
    b.goal.createdAt - a.goal.createdAt ||
    (a.goal.id < b.goal.id ? 1 : a.goal.id > b.goal.id ? -1 : 0);
  const active = views.filter((v) => v.status === "active");
  const measured = active
    .filter((v) => !v.habit && v.ratio !== undefined && !v.reached)
    .sort((a, b) => b.ratio! - a.ratio! || newest(a, b));
  const rest = active
    .filter((v) => !measured.includes(v) && v.current !== undefined)
    .sort(newest);
  return [...measured, ...rest].slice(0, max);
}
