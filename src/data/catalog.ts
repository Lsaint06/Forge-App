import raw from "./exercises.json";
import type { Exercise } from "../domain/types";
export const exercises = raw as Exercise[];
export function searchExercises(
  list: Exercise[],
  query: string,
  muscle = "All",
  equipment = "All",
) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return list
    .filter(
      (e) =>
        (muscle === "All" || e.muscle === muscle) &&
        (equipment === "All" || e.equipment === equipment) &&
        words.every((w) =>
          `${e.name} ${e.muscle} ${e.equipment} ${e.pattern}`
            .toLowerCase()
            .includes(w),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
