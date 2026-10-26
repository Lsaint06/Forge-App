import type { Exercise } from "../../domain/types";
import { muscleMap, primaryLabel } from "../../anatomy/mapping";

// Exercise detail (Phase 7.2C-3B) header rules. Read-only formatting of the
// catalogue's existing fields and the reviewed anatomy map.

const sentence = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const CATEGORY: Record<Exercise["category"], string> = {
  strength: "Strength",
  duration: "Timed",
  distance: "Distance",
};

type Fields = Pick<
  Exercise,
  "muscle" | "pattern" | "equipment" | "category" | "difficulty" | "unilateral"
>;

/**
 * "Chest · Horizontal push": what it trains and how it moves. The muscle
 * words are the anatomy legend's (7.2C-3D), so the heading never disagrees
 * with the figures, e.g. "Adductors" rather than the catalogue's "Glutes".
 */
export const exerciseOverline = (
  e: Pick<Exercise, "muscle" | "pattern"> &
    Partial<Pick<Exercise, "id" | "secondary">>,
) => {
  const map = muscleMap({ id: "", secondary: [], ...e });
  return [primaryLabel(map, e.muscle), sentence(e.pattern)]
    .filter(Boolean)
    .join(" · ");
};

/** "Intermediate · Both sides". */
export const exerciseMeta = (e: Fields) =>
  [e.difficulty, e.unilateral ? "One side at a time" : "Both sides"]
    .filter(Boolean)
    .join(" · ");

/**
 * The detail chips, always in this order: equipment, movement pattern and
 * how the exercise is measured (as in the approved prototype). An empty
 * field is left out rather than shown blank.
 */
export const exerciseChips = (e: Fields) =>
  [e.equipment, sentence(e.pattern), CATEGORY[e.category]].filter(
    (x): x is string => !!x,
  );
