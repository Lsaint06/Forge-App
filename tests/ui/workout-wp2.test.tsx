import React from "react";
import { Alert, BackHandler } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  act,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import { router } from "expo-router";
import WorkoutScreen from "../../src/screens/Workout";
import Train from "../../app/(tabs)/train";
import Templates from "../../app/templates";
import History from "../../src/screens/History";
import Dashboard from "../../src/screens/programs/Dashboard";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { programLibrary } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import { beginWorkoutEdit } from "../../src/data/workout-session";
import { lbToKg } from "../../src/domain/metrics";

// Phase 7B WP2: weight copy-forward, tappable previous results, the
// post-workout summary, reordering, one workout at a time, and read-only
// review with explicit editing.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: 0, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
const mockParams: { id?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));
jest.mock("../../src/platform/backup", () => ({
  shareBackup: jest.fn(async () => {}),
  saveBackupToFolder: jest.fn(async () => ({ saved: false })),
  canSaveToFolder: jest.fn(() => true),
  pickBackup: jest.fn(async () => null),
  downloadBackup: jest.fn(async () => {}),
  shareFile: jest.fn(async () => {}),
}));

type AlertButton = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const pressAlert = (title: string, button: string) => {
  const call = alert.mock.calls.filter(([t]) => t === title).at(-1);
  if (!call) throw new Error(`No "${title}" alert`);
  const choice = (call[2] as AlertButton[]).find((b) => b.text === button);
  if (!choice) throw new Error(`No "${button}" in "${title}"`);
  // Cancel-style buttons ("Keep editing") have no handler.
  choice.onPress?.();
};
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.id;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

type Repo = ReturnType<typeof pathRepository>["r"];
const weights = (r: Repo, rowId: string) =>
  r.sets(rowId).map((s) => Math.round(s.weight * 1000) / 1000);
const round = (kg: number) => Math.round(kg * 1000) / 1000;

/** Types a value one keystroke at a time, as on a phone keyboard. */
async function type(view: RenderResult, label: string, value: string) {
  const input = view.getByLabelText(label);
  await fireEvent(input, "focus");
  for (let i = 1; i <= value.length; i++)
    await fireEvent.changeText(input, value.slice(0, i));
  await fireEvent(input, "endEditing");
}

async function chooseMenuItem(view: RenderResult, menu: string, item: string) {
  await fireEvent.press(view.getByLabelText(menu));
  await fireEvent.press(view.getByRole("menuitem", { name: item }));
}

// ---- Weight copy-forward (C-03) -------------------------------------------------

test("a typed load fills the following empty sets, keeps typed loads and reps, in pounds", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, units: "lb" });
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    for (let i = 0; i < 4; i++) r.addSet(bench.id, { reps: 8 });
    const [, , third] = r.sets(bench.id);
    // Set 3 already holds 125 lb.
    r.editSet(third!.id, { weight: lbToKg(125) });
    const row = r.addExercise(w.id, "barbell-bent-over-row");
    r.addSet(row.id, { reps: 10 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await type(view, "Set 1 weight (lb)", "135");
    const sets = r.sets(bench.id);
    expect(weights(r, bench.id)).toEqual([
      round(lbToKg(135)),
      round(lbToKg(135)),
      round(lbToKg(125)),
      // Stops at set 3's own load.
      0,
    ]);
    // Reps, completion and the other exercise are untouched.
    expect(sets.map((s) => s.reps)).toEqual([8, 8, 8, 8]);
    expect(sets.some((s) => s.completed)).toBe(false);
    expect(weights(r, row.id)).toEqual([0]);
    expect(r.sets(row.id)[0]!.reps).toBe(10);
    // The copied value shows in the set (the store re-renders in the app).
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Set 2 weight (lb)").props.value).toBe("135");
  } finally {
    db.close();
  }
});

test("copying stops at completed sets and never overwrites a set the lifter typed", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    for (let i = 0; i < 3; i++) r.addSet(bench.id, { reps: 5 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await type(view, "Set 1 weight (kg)", "100");
    expect(weights(r, bench.id)).toEqual([100, 100, 100]);
    // Set 2 is now the lifter's own; set 3 follows set 2 (it was a copy).
    await type(view, "Set 2 weight (kg)", "105");
    expect(weights(r, bench.id)).toEqual([100, 105, 105]);
    // Editing set 1 again cannot reach past the typed set 2.
    await type(view, "Set 1 weight (kg)", "110");
    expect(weights(r, bench.id)).toEqual([110, 105, 105]);
    // A completed set is never changed.
    await fireEvent.press(view.getByLabelText("Complete set 3"));
    await type(view, "Set 2 weight (kg)", "90");
    expect(weights(r, bench.id)).toEqual([110, 90, 105]);
    expect(r.sets(bench.id)[2]!.completed).toBe(true);
  } finally {
    db.close();
  }
});

test("editing a finished workout never copies loads into history", async () => {
  const { r, db } = pathRepository();
  try {
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    r.editSet(r.addSet(bench.id).id, { weight: 60, reps: 5, completed: true });
    r.editSet(r.addSet(bench.id).id, { reps: 5 });
    r.finishWorkout(w.id);
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await type(view, "Set 1 weight (kg)", "70");
    expect(weights(r, bench.id)).toEqual([70, 0]);
  } finally {
    db.close();
  }
});

// ---- Previous results (C-03) ------------------------------------------------------

test("tapping the previous result fills only that set, converted, and never completes it", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, units: "lb" });
    const old = r.startWorkout("Push");
    const oldRow = r.addExercise(old.id, "barbell-bench-press");
    for (const reps of [8, 7])
      r.editSet(r.addSet(oldRow.id).id, {
        weight: lbToKg(135),
        reps,
        completed: true,
      });
    r.finishWorkout(old.id);
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    r.addSet(bench.id);
    r.addSet(bench.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(
      view.getByLabelText("Use previous 135 pounds for 8 reps"),
    );
    const [first, second] = r.sets(bench.id);
    expect(round(first!.weight)).toBe(round(lbToKg(135)));
    expect(first!.reps).toBe(8);
    expect(first!.completed).toBe(false);
    // The other set is untouched.
    expect(second).toMatchObject({ weight: 0, reps: 0, completed: false });
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Set 1 weight (lb)").props.value).toBe("135");
    // Set 2 uses its own previous result; typing set 1 later never
    // overwrites a set filled from Prev.
    await fireEvent.press(
      view.getByLabelText("Use previous 135 pounds for 7 reps"),
    );
    await type(view, "Set 1 weight (lb)", "140");
    expect(round(r.sets(bench.id)[1]!.weight)).toBe(round(lbToKg(135)));
    // Done sets show the previous result as plain text.
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Previous 135 lb × 8")).toBeTruthy();
    expect(
      view.queryByLabelText("Use previous 135 pounds for 8 reps"),
    ).toBeNull();
  } finally {
    db.close();
  }
});

// ---- Finish and summary (C-04, C-12, C-13) ------------------------------------------

function sessionWithHistory(r: Repo) {
  r.saveProfile({ onboarded: true });
  const old = r.startWorkout("Push");
  const oldRow = r.addExercise(old.id, "barbell-bench-press");
  r.editSet(r.addSet(oldRow.id).id, { weight: 60, reps: 5, completed: true });
  r.finishWorkout(old.id);
  const w = r.startWorkout("Push");
  const bench = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(bench.id).id, {
    weight: 40,
    reps: 8,
    kind: "warmup",
    completed: true,
  });
  r.editSet(r.addSet(bench.id).id, { weight: 70, reps: 5, completed: true });
  const forgot = r.addSet(bench.id);
  r.editSet(forgot.id, { weight: 72.5, reps: 4 });
  return { w, bench, forgot };
}

test("Save records the workout exactly once and the summary shows what was saved", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, forgot } = sessionWithHistory(r);
    jest.mocked(useRepo).mockReturnValue(r);
    const finish = jest.spyOn(r, "finishWorkout");
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    // The unticked set stays out unless switched on.
    expect(view.getByText("Not marked done")).toBeTruthy();
    const save = view.getByLabelText("Save workout");
    // Two taps in the same frame, before the sheet re-renders. (A second
    // fireEvent after the first is a no-op: the button is gone.)
    const { handler } = findEventHandler(save, "press", { bubbles: true });
    await act(async () => {
      handler!({ nativeEvent: {} });
      handler!({ nativeEvent: {} });
    });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(r.workouts().filter((x) => x.status === "completed")).toHaveLength(
      2,
    );
    expect(
      r.sets(r.workoutExercises(w.id)[0]!.id).find((s) => s.id === forgot.id)!
        .completed,
    ).toBe(false);
    // The summary reads back stored data: one working set, the warm-up and
    // the unticked set excluded.
    expect(view.getByText("Workout complete")).toBeTruthy();
    expect(view.getByLabelText("Set: 1")).toBeTruthy();
    expect(view.getByLabelText("Exercise: 1")).toBeTruthy();
    expect(view.getByLabelText("Volume: 350 kg")).toBeTruthy();
    // Under a minute: no duration shown.
    expect(view.queryByLabelText(/^Duration/)).toBeNull();
    // A new heaviest set, from the Progress records engine.
    expect(
      view.getByLabelText(
        "New record, Barbell Bench Press: Heaviest set 70 kg × 5",
      ),
    ).toBeTruthy();
    // The backup reminder appears once, inside the summary.
    expect(view.getAllByText("Back up your training")).toHaveLength(1);
    await fireEvent.press(view.getByLabelText("Done, back to training"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});

test("a first session sets a baseline: no records are claimed", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Legs");
    const squat = r.addExercise(w.id, "back-squat");
    r.editSet(r.addSet(squat.id).id, { weight: 100, reps: 5, completed: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Finish workout"));
    await fireEvent.press(view.getByLabelText("Save workout"));
    expect(view.getByText("Workout complete")).toBeTruthy();
    expect(view.queryByText(/New record/)).toBeNull();
    expect(view.getByLabelText("Volume: 500 kg")).toBeTruthy();
  } finally {
    db.close();
  }
});

// ---- Reordering (C-11) ------------------------------------------------------------

const eight = [
  "barbell-bench-press",
  "barbell-bent-over-row",
  "overhead-press",
  "lat-pulldown",
  "dumbbell-lateral-raise",
  "dumbbell-curl",
  "back-squat",
  "plank",
];

test("the reorder sheet moves the eighth exercise to the top in two taps, sets attached", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Long");
    const rows = eight.map((id, i) => {
      const row = r.addExercise(w.id, id);
      r.editSet(r.addSet(row.id).id, { weight: 10 + i, reps: 8 });
      return row;
    });
    const before = new Map(rows.map((row) => [row.id, r.sets(row.id)]));
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await chooseMenuItem(view, "Workout options", "Reorder exercises");
    await waitFor(() =>
      expect(
        view.getByRole("header", { name: "Reorder exercises" }),
      ).toBeTruthy(),
    );
    // Nothing selected yet: moves are unavailable.
    expect(
      view.getByRole("button", { name: "Move to top" }).props.accessibilityState
        .disabled,
    ).toBe(true);
    await fireEvent.press(view.getByLabelText("8. Plank"));
    await fireEvent.press(view.getByLabelText("Move Plank to top"));
    const after = r.workoutExercises(w.id);
    expect(after.map((e) => e.exerciseId)).toEqual([
      "plank",
      ...eight.slice(0, 7),
    ]);
    for (const row of after) expect(r.sets(row.id)).toEqual(before.get(row.id));
    expect(r.workoutSets(w.id)).toHaveLength(8);
    await view.rerender(<WorkoutScreen />);
    // The moved exercise stays selected for further moves.
    expect(
      view.getByRole("button", { name: "1. Plank", selected: true }),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Move Plank down"));
    expect(r.workoutExercises(w.id)[1]!.exerciseId).toBe("plank");
    await view.rerender(<WorkoutScreen />);
    // Screen readers can move a row directly.
    await fireEvent(
      view.getByLabelText("4. Overhead Press"),
      "accessibilityAction",
      {
        nativeEvent: { actionName: "top" },
      },
    );
    expect(r.workoutExercises(w.id)[0]!.exerciseId).toBe("overhead-press");
    await fireEvent.press(view.getByLabelText("Done reordering"));
    expect(
      view.queryByRole("header", { name: "Reorder exercises" }),
    ).toBeNull();
  } finally {
    db.close();
  }
});

test("an exercise's menu opens the reorder sheet with that exercise selected", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Short");
    for (const id of eight.slice(0, 3)) r.addSet(r.addExercise(w.id, id).id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await chooseMenuItem(
      view,
      "Options for Overhead Press",
      "Reorder exercises",
    );
    await waitFor(() =>
      expect(
        view.getByRole("button", { name: "3. Overhead Press", selected: true }),
      ).toBeTruthy(),
    );
    await fireEvent.press(view.getByLabelText("Move Overhead Press up"));
    expect(r.workoutExercises(w.id).map((e) => e.exerciseId)).toEqual([
      eight[0],
      eight[2],
      eight[1],
    ]);
  } finally {
    db.close();
  }
});

// ---- One workout at a time (C-17) -------------------------------------------------

test("Train and its template sheet never start a second workout; they offer Resume", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const t = r.saveTemplate("Upper A", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 8,
        weight: 60,
        rest: 90,
      },
    ]);
    const active = r.startWorkout("Freestyle");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Train />);
    expect(
      view.getByLabelText(`Start ${t.name}`).props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(view.getByLabelText(`${t.name} details`));
    expect(view.queryByLabelText("Start workout")).toBeNull();
    expect(view.getByText(/already in progress/)).toBeTruthy();
    expect(view.getByLabelText("Resume current workout")).toBeTruthy();
    expect(r.workouts()).toHaveLength(1);
    expect(r.active()!.id).toBe(active.id);
  } finally {
    db.close();
  }
});

test("Repeat from History is blocked while training and offers Resume", async () => {
  const { r, db } = pathRepository();
  try {
    const done = r.startWorkout("Push");
    r.editSet(r.addSet(r.addExercise(done.id, "barbell-bench-press").id).id, {
      weight: 60,
      reps: 5,
      completed: true,
    });
    r.finishWorkout(done.id);
    r.startWorkout("Pull");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<History />);
    await fireEvent.press(view.getByLabelText(/^Options for Push, /));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Repeat workout" }),
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Workout in progress",
        "Finish or discard Pull before starting another workout.",
        expect.any(Array),
      ),
    );
    expect(r.workouts()).toHaveLength(2);
    pressAlert("Workout in progress", "Resume workout");
    expect(router.push).toHaveBeenCalledWith("/workout");
  } finally {
    db.close();
  }
});

test("the templates screen shows the workout in progress and disables starts", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveTemplate("Upper A", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 8,
        weight: 60,
        rest: 90,
      },
    ]);
    r.startWorkout("Freestyle");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Resume Freestyle"));
    expect(router.push).toHaveBeenCalledWith("/workout");
    expect(
      view.getByRole("button", { name: "Train" }).props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(r.workouts()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("a program session can't start over another workout; its own resumes", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    const program = programLibrary.find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    enrollProgram(r, program, "2026-10-19");
    r.startWorkout("Freestyle");
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Dashboard />);
    expect(view.queryByLabelText("Start session")).toBeNull();
    expect(view.getByText(/Freestyle is in progress/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Resume current workout"));
    expect(router.push).toHaveBeenCalledWith("/workout");
    expect(r.workouts()).toHaveLength(1);
  } finally {
    db.close();
  }
});

// ---- Read-only review and editing (C-18) --------------------------------------------

function finishedWorkout(r: Repo) {
  const w = r.startWorkout("Push");
  const bench = r.addExercise(w.id, "barbell-bench-press");
  for (let i = 0; i < 2; i++)
    r.editSet(r.addSet(bench.id).id, { weight: 60, reps: 5, completed: true });
  r.updateWorkout(w.id, { notes: "Felt strong" });
  r.finishWorkout(w.id);
  return { w, bench };
}

test("finished workouts open read-only, and viewing them changes nothing", async () => {
  const { r, db } = pathRepository();
  try {
    const { w } = finishedWorkout(r);
    const before = r.workoutSnapshot(w.id);
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByLabelText("Set 1 weight (kg): 60")).toBeTruthy();
    expect(view.getByLabelText("Set 1 done")).toBeTruthy();
    expect(view.getByLabelText("Workout notes: Felt strong")).toBeTruthy();
    // No inputs, completion buttons, set details, exercise menus or adding.
    expect(view.queryByLabelText("Set 1 weight (kg)")).toBeNull();
    expect(view.queryByLabelText("Mark set 1 incomplete")).toBeNull();
    expect(view.queryByLabelText("Set 1 details")).toBeNull();
    expect(view.queryByLabelText(/^Options for /)).toBeNull();
    expect(view.queryByLabelText("Add exercise")).toBeNull();
    expect(view.queryByLabelText("Add set")).toBeNull();
    await fireEvent.press(view.getByLabelText("Collapse Barbell Bench Press"));
    await fireEvent.press(view.getByLabelText("Expand Barbell Bench Press"));
    expect(r.workoutSnapshot(w.id)).toEqual(before);
  } finally {
    db.close();
  }
});

test("Edit unlocks the controls; Cancel asks, then restores the workout", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, bench } = finishedWorkout(r);
    const before = r.workoutSnapshot(w.id);
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Edit workout"));
    expect(view.getByText(/^Editing · /)).toBeTruthy();
    await type(view, "Set 1 weight (kg)", "65");
    await fireEvent.press(view.getByLabelText("Add set"));
    expect(r.sets(bench.id)).toHaveLength(3);
    await fireEvent.press(view.getByLabelText("Cancel editing"));
    // Asks first, and keeping editing changes nothing.
    pressAlert("Discard changes?", "Keep editing");
    expect(r.sets(bench.id)[0]!.weight).toBe(65);
    await fireEvent.press(view.getByLabelText("Cancel editing"));
    pressAlert("Discard changes?", "Discard");
    await waitFor(() =>
      expect(view.getByLabelText("Edit workout")).toBeTruthy(),
    );
    const after = r.workoutSnapshot(w.id);
    expect(after.sets).toEqual(before.sets);
    expect(after.exercises).toEqual(before.exercises);
    expect(after.workout.id).toBe(w.id);
    expect(r.setting(`workoutEdit:${w.id}`)).toBe("");
  } finally {
    db.close();
  }
});

test("Save keeps only the intended change; cancelling without changes doesn't ask", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, bench } = finishedWorkout(r);
    const before = r.workoutSnapshot(w.id);
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await fireEvent.press(view.getByLabelText("Cancel editing"));
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await type(view, "Set 2 reps", "6");
    await fireEvent.press(view.getByLabelText("Save changes"));
    expect(view.getByLabelText("Edit workout")).toBeTruthy();
    const [first, second] = r.sets(bench.id);
    expect(first).toEqual(before.sets[0]);
    expect(second).toEqual({ ...before.sets[1], reps: 6 });
    expect(r.workout(w.id)!.status).toBe("completed");
    expect(r.workouts()).toHaveLength(1);
    expect(r.setting(`workoutEdit:${w.id}`)).toBe("");
  } finally {
    db.close();
  }
});

test("leaving mid-edit (back button or Android back) asks before discarding", async () => {
  const { r, db } = pathRepository();
  const handlers: (() => boolean)[] = [];
  const listen = jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
  try {
    const { w, bench } = finishedWorkout(r);
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await type(view, "Set 1 reps", "9");
    // Android back is handled while editing.
    expect(handlers.at(-1)!()).toBe(true);
    pressAlert("Discard changes?", "Keep editing");
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Back to training"));
    pressAlert("Discard changes?", "Discard");
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(r.sets(bench.id)[0]!.reps).toBe(5);
  } finally {
    listen.mockRestore();
    db.close();
  }
});

test("an edit interrupted by FORGE closing reopens in edit mode", async () => {
  const { r, db } = pathRepository();
  try {
    const { w, bench } = finishedWorkout(r);
    beginWorkoutEdit(r, w.id);
    r.editSet(r.sets(bench.id)[0]!.id, { weight: 61 });
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByLabelText("Save changes")).toBeTruthy();
    expect(view.getByText(/^Editing · /)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Cancel editing"));
    pressAlert("Discard changes?", "Discard");
    await waitFor(() => expect(r.sets(bench.id)[0]!.weight).toBe(60));
  } finally {
    db.close();
  }
});
