import raw from "./exercises.json";
import type { Exercise, Prescription } from "../domain/types";
export const exercises = raw as Exercise[];
const rx = (
  exerciseId: string,
  sets = 3,
  reps = 10,
  rest = 90,
): Prescription => ({ exerciseId, sets, reps, rest, weight: 0 });
export const starterPrograms = [
  {
    id: "full-body",
    name: "Full Body 3-Day",
    weeks: 8,
    days: [
      {
        name: "Full body A",
        items: [
          rx("back-squat", 3, 5, 180),
          rx("barbell-bench-press"),
          rx("barbell-bent-over-row"),
        ],
      },
      {
        name: "Full body B",
        items: [
          rx("romanian-deadlift"),
          rx("overhead-press"),
          rx("lat-pulldown"),
        ],
      },
      {
        name: "Full body C",
        items: [
          rx("goblet-squat"),
          rx("dumbbell-bench-press"),
          rx("seated-cable-row"),
        ],
      },
    ],
  },
  {
    id: "upper-lower",
    name: "Upper/Lower 4-Day",
    weeks: 8,
    days: [
      {
        name: "Upper A",
        items: [
          rx("barbell-bench-press"),
          rx("barbell-bent-over-row"),
          rx("dumbbell-lateral-raise"),
        ],
      },
      {
        name: "Lower A",
        items: [
          rx("back-squat"),
          rx("romanian-deadlift"),
          rx("standing-calf-raise"),
        ],
      },
      {
        name: "Upper B",
        items: [rx("overhead-press"), rx("lat-pulldown"), rx("dumbbell-curl")],
      },
      {
        name: "Lower B",
        items: [
          rx("leg-press"),
          rx("seated-leg-curl"),
          rx("barbell-hip-thrust"),
        ],
      },
    ],
  },
  {
    id: "ppl",
    name: "Push/Pull/Legs 6-Day",
    weeks: 8,
    days: [
      {
        name: "Push A",
        items: [
          rx("barbell-bench-press"),
          rx("overhead-press"),
          rx("triceps-rope-pushdown"),
        ],
      },
      {
        name: "Pull A",
        items: [rx("pull-up"), rx("barbell-bent-over-row"), rx("hammer-curl")],
      },
      {
        name: "Legs A",
        items: [
          rx("back-squat"),
          rx("romanian-deadlift"),
          rx("standing-calf-raise"),
        ],
      },
      {
        name: "Push B",
        items: [
          rx("incline-dumbbell-bench-press"),
          rx("dumbbell-lateral-raise"),
          rx("dumbbell-skull-crusher"),
        ],
      },
      {
        name: "Pull B",
        items: [
          rx("lat-pulldown"),
          rx("seated-cable-row"),
          rx("dumbbell-curl"),
        ],
      },
      {
        name: "Legs B",
        items: [
          rx("leg-press"),
          rx("seated-leg-curl"),
          rx("barbell-hip-thrust"),
        ],
      },
    ],
  },
  {
    id: "beginner",
    name: "Beginner Strength",
    weeks: 6,
    days: [
      {
        name: "Strength A",
        items: [
          rx("goblet-squat", 3, 8),
          rx("dumbbell-bench-press", 3, 8),
          rx("seated-cable-row", 3, 8),
        ],
      },
      {
        name: "Strength B",
        items: [
          rx("dumbbell-romanian-deadlift", 3, 8),
          rx("dumbbell-shoulder-press", 3, 8),
          rx("lat-pulldown", 3, 8),
        ],
      },
      {
        name: "Strength C",
        items: [
          rx("leg-press", 3, 8),
          rx("push-up", 3, 8),
          rx("one-arm-dumbbell-row", 3, 8),
        ],
      },
    ],
  },
  {
    id: "hypertrophy",
    name: "Hypertrophy 4-Day",
    weeks: 8,
    days: [
      {
        name: "Torso A",
        items: [
          rx("incline-dumbbell-bench-press", 4, 12),
          rx("lat-pulldown", 4, 12),
          rx("cable-lateral-raise", 3, 15),
        ],
      },
      {
        name: "Limbs A",
        items: [
          rx("leg-press", 4, 12),
          rx("seated-leg-curl", 4, 12),
          rx("hammer-curl", 3, 12),
        ],
      },
      {
        name: "Torso B",
        items: [
          rx("machine-chest-press", 4, 12),
          rx("machine-row", 4, 12),
          rx("face-pull", 3, 15),
        ],
      },
      {
        name: "Limbs B",
        items: [
          rx("bulgarian-split-squat", 4, 10),
          rx("barbell-hip-thrust", 4, 12),
          rx("triceps-rope-pushdown", 3, 12),
        ],
      },
    ],
  },
  {
    id: "powerbuilding",
    name: "Powerbuilding",
    weeks: 8,
    days: [
      {
        name: "Squat + legs",
        items: [
          rx("back-squat", 4, 5, 180),
          rx("leg-press", 3, 12),
          rx("lying-leg-curl"),
        ],
      },
      {
        name: "Bench + upper",
        items: [
          rx("barbell-bench-press", 4, 5, 180),
          rx("dumbbell-fly", 3, 12),
          rx("barbell-bent-over-row"),
        ],
      },
      {
        name: "Deadlift + back",
        items: [
          rx("conventional-deadlift", 3, 5, 180),
          rx("pull-up"),
          rx("hammer-curl"),
        ],
      },
      {
        name: "Press + accessories",
        items: [
          rx("overhead-press", 4, 5, 180),
          rx("dumbbell-lateral-raise", 3, 15),
          rx("goblet-squat"),
        ],
      },
    ],
  },
  {
    id: "minimal",
    name: "Minimal Equipment",
    weeks: 6,
    days: [
      {
        name: "Bodyweight A",
        items: [
          rx("bodyweight-squat", 3, 15),
          rx("push-up", 3, 10),
          rx("reverse-crunch", 3, 15),
        ],
      },
      {
        name: "Bodyweight B",
        items: [
          rx("bodyweight-lunge", 3, 12),
          rx("incline-push-up", 3, 12),
          rx("bodyweight-glute-bridge", 3, 15),
        ],
      },
      {
        name: "Bodyweight C",
        items: [
          rx("bodyweight-split-squat", 3, 12),
          rx("pike-push-up", 3, 8),
          rx("bird-dog", 3, 12),
        ],
      },
    ],
  },
];
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
