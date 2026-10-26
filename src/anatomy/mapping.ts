import type { Exercise } from "../domain/types";
import { groupEntry } from "./groups";
import { OVERRIDES } from "./overrides";
import type { MuscleEntry, MuscleMap, RegionId } from "./types";

// Exercise → atlas (Phase 7.2C-3). Deterministic and presentation only:
// the catalogue's muscle groups, read in the context of the movement
// pattern, with reviewed exercise-specific overrides. Programs, progression
// and workout generation never read this.

type Source = Pick<Exercise, "id" | "muscle" | "secondary" | "pattern">;

const same = (a: MuscleEntry, b: MuscleEntry) =>
  a.label === b.label && a.regions.join() === b.regions.join();

export function muscleMap(exercise: Source): MuscleMap {
  const fullBody = exercise.muscle === "Full body";
  const override = OVERRIDES[exercise.id];
  const primary =
    override?.primary ??
    [groupEntry(exercise.muscle, exercise.pattern, "primary")].filter(
      (x): x is MuscleEntry => !!x,
    );
  const listed =
    override?.secondary ??
    exercise.secondary
      .map((g) => groupEntry(g, exercise.pattern, "secondary"))
      .filter((x): x is MuscleEntry => !!x);
  // A muscle is never both primary and secondary; regions lit as primary
  // stay primary.
  const lit = new Set(primary.flatMap((p) => p.regions));
  const secondary: MuscleEntry[] = [];
  for (const s of listed) {
    if (primary.some((p) => same(p, s)) || secondary.some((x) => same(x, s)))
      continue;
    secondary.push({ ...s, regions: s.regions.filter((r) => !lit.has(r)) });
  }
  return {
    primary,
    secondary,
    fullBody,
    ...(override ? { override: override.reason } : {}),
  };
}

/** Every region lit by a map, with its role. */
export function litRegions(map: MuscleMap) {
  const out = new Map<RegionId, "primary" | "secondary">();
  for (const s of map.secondary)
    for (const r of s.regions) out.set(r, "secondary");
  for (const p of map.primary) for (const r of p.regions) out.set(r, "primary");
  return out;
}

/**
 * The primary muscles in words ("Side deltoids", "Hamstrings · Glutes"),
 * shared by the library row, the detail heading and the legend so the three
 * never disagree. Falls back to the catalogue group when nothing is mapped.
 */
export function primaryLabel(map: MuscleMap, group: string) {
  if (map.fullBody || !map.primary.length) return group;
  return [...new Set(map.primary.map((p) => p.label))].join(" · ");
}

/** "Primary: Chest, pectoralis major. Secondary: …" for screen readers. */
export function spokenMuscles(map: MuscleMap) {
  if (map.fullBody)
    return "Full body conditioning: no single muscle group is highlighted.";
  const part = (title: string, entries: MuscleEntry[]) =>
    entries.length
      ? `${title}: ${entries
          .map((x) =>
            x.muscles.length
              ? `${x.label}, ${x.muscles.join(", ").toLowerCase()}`
              : x.label,
          )
          .join("; ")}.`
      : "";
  return [part("Primary", map.primary), part("Secondary", map.secondary)]
    .filter(Boolean)
    .join(" ");
}
