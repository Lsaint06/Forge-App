import type { ExperienceLevel, TrainingGoal } from "../../domain/profile";

// The You tab's athlete identity (Phase 7.5B): the words and the monogram
// drawn from the saved profile. Nothing here is stored or invented.

/** The saved display name, or "Athlete" (the profile's own default). */
export function displayName(name: string | undefined) {
  return name?.trim().replace(/\s+/g, " ") || "Athlete";
}

/**
 * Up to two initials from the display name: "Alex Carter" → "AC",
 * "alex" → "A", "Åsa Öberg" → "ÅÖ". Whole characters, so letters outside
 * the basic plane (and emoji) are never split.
 */
export function monogram(name: string | undefined) {
  return (
    displayName(name)
      .split(" ")
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toLocaleUpperCase() || "A"
  );
}

/** "Strength focus", "Muscle building focus". */
export function focusText(goal: TrainingGoal | undefined) {
  if (!goal) return undefined;
  return goal === "Strength" ? "Strength focus" : "Muscle building focus";
}

/** "Intermediate lifter". */
export function experienceText(level: ExperienceLevel | undefined) {
  return level ? `${level} lifter` : undefined;
}

/** "Training since Oct 2026" from the first finished workout. */
export function trainingSince(first: number | undefined) {
  if (first === undefined) return undefined;
  return `Training since ${new Date(first).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  })}`;
}
