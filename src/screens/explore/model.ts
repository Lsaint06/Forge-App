import type { Exercise } from "../../domain/types";
import { muscleMap, primaryLabel } from "../../anatomy/mapping";

// Exercise Library rows (Phase 7.2C-3C). Read-only formatting. The primary
// and secondary muscles are the anatomy map's own words (7.2C-3D), so a row
// never contradicts the exercise's detail screen (e.g. triceps on a fly,
// glutes on hip adduction). The Muscle filter still uses the catalogue group.

const sentence = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export type ExerciseRowText = {
  primary: string;
  secondary: string[];
  /** "Barbell · Horizontal push". */
  detail: string;
  /** Everything above, for screen readers. */
  spoken: string;
};

export function exerciseRowText(
  e: Pick<Exercise, "id" | "muscle" | "secondary" | "pattern" | "equipment">,
): ExerciseRowText {
  const map = muscleMap(e);
  const primary = primaryLabel(map, e.muscle);
  const shown = new Set(map.primary.map((p) => p.label));
  const secondary = [
    ...new Set(map.secondary.map((s) => s.label).filter((l) => !shown.has(l))),
  ];
  const detail = [e.equipment, sentence(e.pattern)].filter(Boolean).join(" · ");
  const spoken = [
    primary,
    secondary.length ? `also ${secondary.join(", ")}` : "",
    detail,
  ]
    .filter(Boolean)
    .join(" · ");
  return { primary, secondary, detail, spoken };
}
