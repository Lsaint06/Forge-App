import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { useRepo, confirm } from "../../src/state";
import {
  defaults,
  type Workout,
  type WorkoutSet,
  type WorkoutExercise,
  type Exercise,
} from "../../src/domain/types";
import WorkoutExerciseCard, {
  SetRow,
} from "../../src/components/WorkoutExerciseCard";
import WorkoutScreen, { RestTimer } from "../../src/screens/Workout";
import Train from "../../app/(tabs)/train";
import Explore from "../../app/(tabs)/explore";
import {
  ExerciseVisual,
  IconButton,
  ProgressRing,
  ErrorState,
} from "../../src/components/design";
import {
  restNotification,
  cancelRestNotification,
} from "../../src/notifications";
import { router } from "expo-router";
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { profile: undefined }) => unknown) =>
      selector({ profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));
const exercise: Exercise = {
  id: "bench",
  name: "Bench press",
  muscle: "Chest",
  secondary: [],
  equipment: "Barbell",
  pattern: "Push",
  difficulty: "Intermediate",
  instructions: ["Brace and press."],
  mistakes: "Keep control.",
  safety: "Use a spotter.",
  unilateral: false,
  category: "strength",
  tracking: ["kg", "reps"],
};
const row: WorkoutExercise = {
  id: "row",
  workoutId: "w",
  exerciseId: "bench",
  position: 0,
  notes: "",
  rest: 90,
  groupId: "",
};
const set: WorkoutSet = {
  id: "set",
  exerciseRowId: "row",
  position: 0,
  weight: 20,
  reps: 8,
  duration: 0,
  distance: 0,
  rpe: null,
  rir: null,
  kind: "working",
  completed: false,
  rest: 90,
  tempo: "",
  notes: "",
  side: "both",
};
const workout: Workout = {
  id: "w",
  name: "Freestyle",
  status: "active",
  startedAt: Date.now(),
  finishedAt: null,
  pausedAt: null,
  pausedMs: 0,
  notes: "",
  templateId: null,
  updatedAt: Date.now(),
};
function repo(overrides: Record<string, unknown> = {}) {
  const data = {
    profile: () => ({ ...defaults, onboarded: true }),
    active: () => workout,
    workouts: () => [],
    templates: () => [],
    exercises: () => [exercise],
    favorites: () => [],
    history: () => [],
    journal: () => [],
    exercise: () => exercise,
    sets: () => [set],
    workoutSets: () => [set],
    workoutExercises: () => [row],
    setting: () => "0",
    setSetting: jest.fn(),
    toggleFavorite: jest.fn(),
    startWorkout: jest.fn(() => workout),
    editSet: jest.fn(),
    finishWorkout: jest.fn(),
    addExercise: jest.fn(() => row),
    addSet: jest.fn(),
    ...overrides,
  };
  jest
    .mocked(useRepo)
    .mockReturnValue(data as unknown as ReturnType<typeof useRepo>);
  return data;
}
beforeEach(() => jest.clearAllMocks());
test("compact set completion persists and starts rest without per-set detail controls", async () => {
  const edited = { ...set };
  const r = repo({
    sets: () => [edited],
    editSet: jest.fn((id: string, patch: Partial<WorkoutSet>) =>
      Object.assign(edited, patch),
    ),
  });
  const view = await render(<SetRow set={set} category="strength" />);
  expect(view.queryByLabelText("Set notes")).toBeNull();
  expect(view.queryByText("Effort & details")).toBeNull();
  expect(view.getByLabelText("Set 1 weight (kg)")).toBeTruthy();
  expect(view.getByLabelText("Set 1 reps")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Complete set 1"));
  expect(r.editSet).toHaveBeenCalledWith("set", { completed: true });
  expect(r.setSetting).toHaveBeenCalledWith("restDeadline", expect.any(String));
  expect(restNotification).toHaveBeenCalled();
  expect(view.queryByLabelText("RPE (1–10, optional)")).toBeNull();
});

test("exercise cards collapse logging but retain their summary and progress", async () => {
  repo();
  const view = await render(<WorkoutExerciseCard row={row} />);
  expect(view.getByText("1 working set · 90s rest")).toBeTruthy();
  expect(view.getByText("0 / 1 sets complete")).toBeTruthy();
  expect(view.queryByLabelText("Set 1 reps")).toBeNull();
  expect(view.queryByLabelText("Exercise options")).toBeNull();
  await fireEvent.press(
    view.getByRole("button", { name: "Expand Bench press", expanded: false }),
  );
  expect(view.getByLabelText("Set 1 reps")).toBeTruthy();
  expect(view.queryByText("Effort & details")).toBeNull();
  expect(view.queryByLabelText("Set notes")).toBeNull();
  expect(view.queryByLabelText("RIR (0–20, optional)")).toBeNull();
  await fireEvent.press(view.getByLabelText("Exercise options"));
  expect(view.getByLabelText("RIR (0–20, optional)")).toBeTruthy();
  expect(view.getByLabelText("Set notes")).toBeTruthy();
  await fireEvent.press(
    view.getByRole("button", {
      name: "Collapse Bench press",
      expanded: true,
    }),
  );
  expect(view.queryByLabelText("Set 1 reps")).toBeNull();
  expect(view.queryByLabelText("Set notes")).toBeNull();
});

test.each(["duration", "distance"])(
  "compact %s sets retain their category-specific logging controls",
  async (category) => {
    const r = repo();
    const view = await render(<SetRow set={set} category={category} />);
    expect(view.queryByLabelText("Set 1 reps")).toBeNull();
    await fireEvent.changeText(
      view.getByLabelText("Set 1 duration (seconds)"),
      "60",
    );
    expect(r.editSet).toHaveBeenCalledWith(set.id, { duration: 60 });
    if (category === "distance") {
      await fireEvent.changeText(
        view.getByLabelText("Set 1 distance (meters)"),
        "100",
      );
      expect(r.editSet).toHaveBeenCalledWith(set.id, { distance: 100 });
    } else expect(view.queryByLabelText("Set 1 distance (meters)")).toBeNull();
  },
);

test("the workout initially opens the first unfinished exercise without opening all the cards", async () => {
  const second = {
    ...row,
    id: "row2",
    exerciseId: "row-exercise",
    position: 1,
  };
  repo({
    workoutExercises: () => [row, second],
    sets: (id: string) => [
      { ...set, exerciseRowId: id, completed: id === row.id },
    ],
    exercise: (id: string) => ({
      ...exercise,
      id,
      name: id === "bench" ? "Bench press" : "Row",
    }),
  });
  const view = await render(<WorkoutScreen />);
  expect(
    view.getByRole("button", { name: "Expand Bench press", expanded: false }),
  ).toBeTruthy();
  expect(
    view.getByRole("button", { name: "Collapse Row", expanded: true }),
  ).toBeTruthy();
  expect(view.getAllByLabelText("Set 1 reps")).toHaveLength(1);
});
test("rest controls persist a deadline and skip cancels the reminder", async () => {
  const r = repo();
  const view = await render(<RestTimer />);
  await fireEvent.press(view.getByLabelText("Start rest"));
  expect(r.setSetting).toHaveBeenCalledWith("restDeadline", expect.any(String));
  repo({ setting: () => String(Date.now() + 90000), setSetting: r.setSetting });
  await view.rerender(<RestTimer />);
  await fireEvent.press(view.getByLabelText("Skip"));
  expect(r.setSetting).toHaveBeenCalledWith("restDeadline", "0");
  expect(cancelRestNotification).toHaveBeenCalled();
});
test("Train exposes resume and plans without creating a new session on resume", async () => {
  const r = repo();
  const view = await render(<Train />);
  await fireEvent.press(view.getByLabelText("Resume active workout"));
  expect(router.push).toHaveBeenCalledWith("/workout");
  expect(r.startWorkout).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Templates & programs"));
  expect(router.push).toHaveBeenCalledWith("/templates");
});
test("Explore forwards search to the repository and opens the real exercise", async () => {
  const exercises = jest.fn(() => [exercise]);
  repo({ exercises });
  const view = await render(<Explore />);
  await fireEvent.changeText(view.getByLabelText("Search exercises"), "bench");
  expect(exercises).toHaveBeenCalledWith("bench", "All", "All");
  await fireEvent.press(view.getByLabelText("View Bench press"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/exercise",
    params: { id: "bench" },
  });
});
test("fallback media is honestly identified and semantic controls remain accessible", async () => {
  repo();
  const retry = jest.fn();
  const view = await render(
    <>
      <ExerciseVisual exercise={exercise} large />
      <ProgressRing value={2} label="Weekly goal" />
      <IconButton icon="add" label="Add set" onPress={retry} />
      <ErrorState message="Unable to load" onRetry={retry} />
    </>,
  );
  expect(
    view.getByText("Muscle illustration · not a demonstration"),
  ).toBeTruthy();
  expect(view.getByLabelText("Weekly goal").props.accessibilityValue.now).toBe(
    100,
  );
  await fireEvent.press(view.getByLabelText("Try again"));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("workout adds an exercise and protects completion with confirmation", async () => {
  const r = repo({ workoutSets: () => [{ ...set, completed: true }] });
  const view = await render(<WorkoutScreen />);
  await fireEvent.press(view.getByLabelText("Add exercise"));
  await fireEvent.press(view.getByLabelText("Add Bench press"));
  expect(r.addExercise).toHaveBeenCalledWith("w", "bench");
  expect(r.addSet).toHaveBeenCalledWith("row");
  await fireEvent.press(view.getByLabelText("Finish workout"));
  expect(r.finishWorkout).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith(
    "Finish workout?",
    expect.any(String),
    expect.any(Function),
  );
  jest.mocked(confirm).mock.calls[0]![2]();
  expect(r.finishWorkout).toHaveBeenCalledWith("w");
  expect(router.back).toHaveBeenCalled();
});
test("freestyle starts through repository and completed history remains reviewable", async () => {
  const r = repo({
    active: () => undefined,
    workouts: () => [
      { ...workout, status: "completed", finishedAt: Date.now() },
    ],
  });
  const view = await render(<Train />);
  await fireEvent.press(view.getByLabelText("Start freestyle workout"));
  expect(r.startWorkout).toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Review / edit"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/workout",
    params: { id: "w" },
  });
});
