import type { CuratedProgram } from "./model";

// Maps the author's weekly train/rest pattern onto weekdays (0 = Monday …
// 6 = Sunday). The pattern keeps its authored order and spacing; only its
// starting weekday rotates so the preferred rest day lands on a rest slot.
// Without a preference the program week starts on Monday. This is a
// suggestion: the lifter can still train or reschedule on any day.
export function trainingWeekdays(
  pattern: CuratedProgram["weeklyPattern"],
  restDay?: number,
): number[] {
  let start = 0;
  if (restDay !== undefined) {
    // Prefer starting the program week the day after the rest day.
    for (let k = 1; k <= 7; k++) {
      const candidate = (restDay + k) % 7;
      if (pattern[(restDay - candidate + 7) % 7] === "rest") {
        start = candidate;
        break;
      }
    }
  }
  return pattern.flatMap((day, i) =>
    day === "train" ? [(start + i) % 7] : [],
  );
}
