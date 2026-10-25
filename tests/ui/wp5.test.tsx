import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { z } from "zod";
import { pathRepository } from "../path-fixture";

// Phase 7B WP5: secondary-screen consistency. Batch A: destructive
// confirmations name their action; save errors are friendly while details
// stay in the developer log; guest mode hides the sync count only.

const fixture: { r?: ReturnType<typeof pathRepository>["r"] } = {};
// The shared setup mocks the state module; these tests need the real one.
jest.mock("../../src/state", () => jest.requireActual("../../src/state"));
jest.mock("../../src/data/native", () => ({
  repository: () => fixture.r,
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
const mockParams: Record<string, string> = {};
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));
const mockPick = jest.fn<Promise<string | null>, []>();
jest.mock("../../src/platform/backup", () => ({
  ...jest.requireActual("../../src/platform/backup"),
  pickBackup: () => mockPick(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const state = require("../../src/state") as typeof import("../../src/state");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const You = require("../../src/screens/You").default as React.FC;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExerciseScreen = require("../../app/exercise").default as React.FC;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Explore = require("../../app/explore").default as React.FC;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Account = require("../../app/account").default as React.FC;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const History = require("../../src/screens/History").default as React.FC;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NotFound = require("../../app/+not-found").default as React.FC;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router } = require("expo-router") as typeof import("expo-router");
const { ExercisePicker } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../src/components/ExercisePicker") as typeof import("../../src/components/ExercisePicker");

type Button = { text: string; style?: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
const last = (title: string) => {
  const call = alert.mock.calls.filter(([t]) => t === title).at(-1);
  if (!call) throw new Error(`No "${title}" alert`);
  return { message: call[1] as string, buttons: call[2] as Button[] };
};
beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
});

test("schema errors become a plain sentence; details stay in the developer log", () => {
  const schemaError = (() => {
    try {
      z.object({ muscle: z.string().min(1) }).parse({ muscle: "" });
    } catch (e) {
      return e;
    }
  })();
  expect(state.saveErrorMessage(schemaError)).toBe(
    "Some values couldn't be saved. Check the form and try again. Your existing data is unchanged.",
  );
  expect(
    state.saveErrorMessage(new Error("Choose today or a future date.")),
  ).toBe("Choose today or a future date.");
  const result = state.mutate(() => {
    throw schemaError;
  });
  expect(result).toBeUndefined();
  const shown = last("Could not save").message;
  expect(shown).not.toMatch(/[{}]|"code"|expected|too_small/);
  expect(warn).toHaveBeenCalledWith(
    "[FORGE] Save rejected by validation",
    schemaError,
  );
});

test("confirmations name their action; the default stays Confirm", () => {
  const run = jest.fn();
  state.confirm("Delete workout?", "Gone for good.", run, {
    action: "Delete workout",
  });
  let { buttons } = last("Delete workout?");
  expect(buttons.map((b) => [b.text, b.style])).toEqual([
    ["Cancel", "cancel"],
    ["Delete workout", "destructive"],
  ]);
  state.confirm("Pause?", "Later.", run, {
    action: "Pause Path",
    destructive: false,
  });
  ({ buttons } = last("Pause?"));
  expect(buttons[1]).toMatchObject({ text: "Pause Path", style: "default" });
  state.confirm("Old?", "Unchanged callers.", run);
  ({ buttons } = last("Old?"));
  expect(buttons[1]).toMatchObject({ text: "Confirm", style: "destructive" });
});

test("You: delete-all and backup replacement say exactly what happens", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    r.saveProfile({ onboarded: true, name: "Alex" });
    r.addJournal("measurement", { name: "Bodyweight", value: 80, unit: "kg" });
    const view = await render(<You />);
    await fireEvent.press(view.getByLabelText("Delete all local data"));
    const del = last("Delete all local data?");
    expect(del.message).toMatch(/can't be undone/);
    expect(del.message).toMatch(/cloud records are not deleted/);
    expect(del.buttons[1]).toMatchObject({
      text: "Delete everything",
      style: "destructive",
    });
    // Replacing from an unreadable file: a plain message; nothing changes.
    mockPick.mockResolvedValueOnce("not a backup");
    await fireEvent.press(view.getByLabelText("Import backup"));
    await act(async () => {});
    const replace = last("Replace local data from backup?");
    expect(replace.message).toMatch(/can't be undone/);
    expect(replace.buttons[1]!.text).toBe("Replace data");
    await act(async () => replace.buttons[1]!.onPress!());
    expect(last("Could not save").message).toBe(
      "This file isn't a valid FORGE backup. Nothing was changed.",
    );
    expect(r.journal("measurement")).toHaveLength(1);
    // Guest mode: no sync count is shown, but the outbox is untouched.
    const pending = r.outbox().length;
    expect(pending).toBeGreaterThan(0);
    expect(view.getByText("Local schema v1 · guest mode")).toBeTruthy();
    expect(view.queryByText(/pending sync record/)).toBeNull();
    expect(r.outbox()).toHaveLength(pending);
  } finally {
    db.close();
  }
});

// Batch C: exercise library, detail, custom exercises and the shared picker.

test("a new custom exercise explains what is missing and saves the chosen catalogue values", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    mockParams.custom = "new";
    const view = await render(<ExerciseScreen />);
    expect(view.getByText("New exercise")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Save exercise"));
    expect(view.getByText("Enter a name for this exercise.")).toBeTruthy();
    expect(view.getByText("Choose the main muscle it works.")).toBeTruthy();
    // Equipment is never preselected: it decides whether weight counts as load.
    expect(view.getByText(/Choose the equipment/)).toBeTruthy();
    expect(view.getByText("Add at least one step.")).toBeTruthy();
    expect(r.customExercises()).toHaveLength(0);
    await fireEvent.changeText(
      view.getByLabelText("Exercise name"),
      "Landmine press",
    );
    await fireEvent.press(
      view.getByLabelText("Main muscle, not chosen. Choose main muscle"),
    );
    await fireEvent.press(view.getByRole("radio", { name: "Shoulders" }));
    expect(view.queryByText("Choose the main muscle it works.")).toBeNull();
    await fireEvent.press(
      view.getByLabelText("Equipment, not chosen. Choose equipment"),
    );
    await fireEvent.press(view.getByRole("radio", { name: "Barbell" }));
    expect(
      view.getByLabelText("Equipment, Barbell. Choose equipment"),
    ).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Instructions (one step per line)"),
      "Hold the bar end\nPress up and forward",
    );
    await fireEvent.press(view.getByLabelText("One side"));
    await fireEvent.press(view.getByLabelText("Save exercise"));
    const [saved] = r.customExercises();
    expect(saved).toMatchObject({
      name: "Landmine press",
      muscle: "Shoulders",
      equipment: "Barbell",
      category: "strength",
      unilateral: true,
      tracking: ["kg", "reps"],
      instructions: ["Hold the bar end", "Press up and forward"],
    });
  } finally {
    db.close();
  }
});

test("editing a legacy custom exercise keeps its free text; an untouched save writes nothing", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const legacy = r.saveExercise({
      id: "custom-legacy",
      name: "Grip hang",
      muscle: "Forearms & grip",
      equipment: "Trap bar",
      instructions: ["Hang on"],
      secondary: ["Back"],
      pattern: "Carry",
      difficulty: "Hard",
      mistakes: "Shrugging",
      safety: "Chalk up",
      category: "duration",
      unilateral: false,
      tracking: ["seconds", "kg"],
    });
    mockParams.id = legacy.id;
    const view = await render(<ExerciseScreen />);
    await fireEvent.press(view.getByLabelText("Edit custom exercise"));
    expect(view.getByText("Edit exercise")).toBeTruthy();
    expect(
      view.getByLabelText("Main muscle, Other…. Choose main muscle"),
    ).toBeTruthy();
    expect(view.getByLabelText("Muscle").props.value).toBe("Forearms & grip");
    expect(view.getByLabelText("Equipment name").props.value).toBe("Trap bar");
    const pending = r.outbox().length;
    await fireEvent.press(view.getByLabelText("Save exercise"));
    expect(r.outbox()).toHaveLength(pending);
    expect(r.exercise(legacy.id)).toEqual(legacy);
    await fireEvent.press(view.getByLabelText("Edit custom exercise"));
    await fireEvent.changeText(
      view.getByLabelText("Exercise name"),
      "Grip hang (towel)",
    );
    await fireEvent.press(view.getByLabelText("Save exercise"));
    expect(r.exercise(legacy.id)).toEqual({
      ...legacy,
      name: "Grip hang (towel)",
    });
    expect(r.customExercises()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("the exercise detail keeps its records and session history readable as rows", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const w = r.startWorkout();
    const row = r.addExercise(w.id, "barbell-bench-press");
    const set = r.addSet(row.id);
    r.editSet(set.id, { weight: 100, reps: 5, completed: true });
    r.finishWorkout(w.id);
    mockParams.id = "barbell-bench-press";
    const view = await render(<ExerciseScreen />);
    expect(view.getByLabelText("Heaviest set: 100 kg × 5")).toBeTruthy();
    expect(view.getByLabelText("Session 1: 100 kg × 5")).toBeTruthy();
    expect(view.getByText(/Epley formula/)).toBeTruthy();
    expect(view.getByLabelText("Add to workout")).toBeTruthy();
    expect(view.queryByLabelText("Edit custom exercise")).toBeNull();
  } finally {
    db.close();
  }
});

test("the shared picker says Add where it adds and Choose where it only selects", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const pick = jest.fn();
    const add = await render(
      <ExercisePicker visible onClose={() => {}} onPick={pick} />,
    );
    expect(add.getByText("Choose your movement")).toBeTruthy();
    // Every catalogue muscle can be filtered, including Calves and Full body.
    await fireEvent.press(add.getByText("Calves"));
    expect(add.queryByLabelText("Add Barbell Bench Press")).toBeNull();
    await fireEvent.press(add.getByText("All"));
    await fireEvent.changeText(
      add.getByLabelText("Search exercises"),
      "barbell bench",
    );
    await fireEvent.press(add.getByLabelText("Add Barbell Bench Press"));
    expect(pick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "barbell-bench-press" }),
    );
    expect(add.getByText("Full body")).toBeTruthy();
    await add.unmount();
    const choose = await render(
      <ExercisePicker
        visible
        action="Choose"
        onClose={() => {}}
        onPick={pick}
      />,
    );
    await fireEvent.changeText(
      choose.getByLabelText("Search exercises"),
      "barbell bench",
    );
    expect(choose.getByLabelText("Choose Barbell Bench Press")).toBeTruthy();
    expect(choose.queryByLabelText("Add Barbell Bench Press")).toBeNull();
  } finally {
    db.close();
  }
});

test("the library labels its filters and offers a way out of an empty result", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const view = await render(<Explore />);
    await fireEvent.press(view.getByLabelText(/^Filters/));
    for (const caption of ["Equipment", "Sort by"])
      expect(view.getByText(caption)).toBeTruthy();
    // "Muscle" is both the row caption and a sort option.
    expect(view.getAllByText("Muscle")).toHaveLength(2);
    await fireEvent.changeText(view.getByLabelText("Search exercises"), "zzzz");
    expect(view.getByText("No matching exercises")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Clear search and filters"));
    expect(view.queryByText("No matching exercises")).toBeNull();
    expect(view.getByLabelText("Search exercises").props.value).toBe("");
  } finally {
    db.close();
  }
});

// Batch D: Account, History paging and the not-found route.

test("Account has a plain title and a back control; guest mode is explained", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const view = await render(<Account />);
    expect(view.getByRole("header", { name: "Account" })).toBeTruthy();
    expect(view.queryByText("Your data. Your choice.")).toBeNull();
    expect(view.getByText("Guest mode is active")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("History shows the newest 60 workouts, then the rest in the same order", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    for (let i = 0; i < 65; i++) {
      const w = r.startWorkout();
      r.finishWorkout(w.id);
    }
    const ids = r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => w.id);
    expect(ids).toHaveLength(65);
    const view = await render(<History />);
    const rows = () => view.getAllByLabelText(/^Review /);
    expect(rows()).toHaveLength(60);
    expect(view.getByText("65 workouts")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Show earlier (5)"));
    expect(rows()).toHaveLength(65);
    expect(view.queryByLabelText(/^Show earlier/)).toBeNull();
    // Every saved workout is listed exactly once, in the stored order.
    const pressed: string[] = [];
    jest.mocked(router.push).mockImplementation((to) => {
      pressed.push((to as unknown as { params: { id: string } }).params.id);
    });
    for (const row of rows()) await fireEvent.press(row);
    expect(pressed).toEqual(ids);
  } finally {
    db.close();
  }
});

// Phase 7.1A renamed the Today tab to Home; the way back is labelled to match.
test("an unknown link shows Page not found with a way back to Home", async () => {
  const view = await render(<NotFound />);
  expect(view.getByRole("header", { name: "Page not found" })).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Go to Home"));
  expect(router.replace).toHaveBeenCalledWith("/(tabs)");
});
