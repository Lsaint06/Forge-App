import type { Exercise } from "../../domain/types";
import { muscleMap } from "../../anatomy/mapping";

// Exercise Library rows (Phase 7.2C-3C). Read-only formatting. The primary
// muscle is the catalogue group (what the Muscle filter uses); secondary
// muscles come from the reviewed anatomy map, so a row never lists a muscle
// the exercise's detail screen says it does not train (e.g. triceps on a
// fly).

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
  const secondary = [
    ...new Set(map.secondary.map((s) => s.label).filter((l) => l !== e.muscle)),
  ];
  const detail = [e.equipment, sentence(e.pattern)].filter(Boolean).join(" · ");
  const spoken = [
    e.muscle,
    secondary.length ? `also ${secondary.join(", ")}` : "",
    detail,
  ]
    .filter(Boolean)
    .join(" · ");
  return { primary: e.muscle, secondary, detail, spoken };
}
