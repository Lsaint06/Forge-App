import React from "react";
import { render } from "@testing-library/react-native";
import Progress from "../../app/(tabs)/progress";
import { useRepo } from "../../src/state";
import {
  defaults,
  type Workout,
  type WorkoutSet,
} from "../../src/domain/types";
test("earned lifetime PR achievement remains visible outside the selected chart range", async () => {
  const finished = Date.now() - 40 * 86400000;
  const w: Workout = {
    id: "old",
    name: "Old session",
    status: "completed",
    startedAt: finished - 600000,
    finishedAt: finished,
    pausedAt: null,
    pausedMs: 0,
    notes: "",
    templateId: null,
    updatedAt: finished,
  };
  const s: WorkoutSet = {
    id: "s",
    exerciseRowId: "e",
    position: 0,
    weight: 100,
    reps: 10,
    duration: 0,
    distance: 0,
    rpe: null,
    rir: null,
    kind: "working",
    completed: true,
    rest: 90,
    tempo: "",
    notes: "",
    side: "both",
  };
  jest.mocked(useRepo).mockReturnValue({
    profile: () => defaults,
    workouts: () => [w],
    workoutSets: () => [s],
    workoutExercises: () => [
      {
        id: "e",
        exerciseId: "bench",
        workoutId: w.id,
        position: 0,
        notes: "",
        rest: 90,
        groupId: "",
      },
    ],
    exercise: () => ({ name: "Bench", muscle: "Chest" }),
    sets: () => [s],
    journal: () => [],
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<Progress />);
  expect(view.getByText("✦ New territory · first PR")).toBeTruthy();
});
