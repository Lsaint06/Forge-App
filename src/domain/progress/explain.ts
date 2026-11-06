// Plain-language explanations of how Progress counts, shown in information
// sheets. Kept in one place so every screen explains the same rules.

export const strengthInfo = [
  "Estimated 1RM uses the Epley formula: weight × (1 + reps ÷ 30) for working sets of 2–12 reps; a single rep counts as its weight. Warm-ups, incomplete sets and sets over 12 reps are not used. It is an estimate, not a tested maximum.",
  "Weights are compared directly only at the same reps. With different reps, the estimate is compared instead, so a heavier triple and a lighter set of ten are never treated as the same thing.",
  "Bodyweight and assisted movements: Forge can't tell assistance from added weight in your logs, so it tracks your most reps instead of load.",
];
export const recordInfo = [
  "A record is set when a working set beats your previous best for that exercise: your heaviest set, your estimated 1RM, or more reps at a weight you've lifted before (most reps for bodyweight movements).",
  "Your first session with an exercise sets the baseline, and matching a best isn't a new record.",
  "Records are recalculated from your history every time, so editing or deleting a workout updates them.",
];
export const consistencyInfo = [
  "Planned sessions come from your program's suggested training days, your Path's dates and workouts you've scheduled. Program sessions count for the week they're done in, whichever day you train.",
  "The current week only counts sessions already done or skipped. Without a plan, Forge shows the workouts you completed and never counts anything as missed. Rest days never count against you.",
];
export const volumeInfo = [
  "Working sets: completed sets with at least one rep, excluding warm-ups.",
  "Volume: weight × reps of those sets, for exercises where the logged weight is external load. Bodyweight and assisted movements are left out because their logged weight may be assistance.",
  "Muscles: each working set counts once, for the exercise's primary muscle. Secondary muscles aren't credited, so compound lifts are under-counted rather than over-counted.",
];
