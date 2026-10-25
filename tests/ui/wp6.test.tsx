import React, { useState } from "react";
import {
  Alert,
  AccessibilityInfo,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import {
  render,
  fireEvent,
  act,
  type RenderResult,
} from "@testing-library/react-native";
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import { z } from "zod";
import { pathRepository } from "../path-fixture";
import {
  setSchema,
  profileSchema,
  prescriptionSchema,
} from "../../src/domain/validation";
import { defaults } from "../../src/domain/types";

// Phase 7B WP6 Batch A: validation messages, responsive segmented controls,
// 44 pt targets, field errors for screen readers, and once-only actions.

const fixture: { r?: ReturnType<typeof pathRepository>["r"] } = {};
// The shared setup mocks the state module; these tests need the real one.
jest.mock("../../src/state", () => jest.requireActual("../../src/state"));
jest.mock("../../src/data/native", () => ({
  repository: () => fixture.r,
}));
const mockDims = { width: 375, height: 667, scale: 2, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
const mockParams: Record<string, string> = {};
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
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const state = require("../../src/state") as typeof import("../../src/state");
const ui =
  require("../../src/components/ui") as typeof import("../../src/components/ui");
const WorkoutScreen = require("../../src/screens/Workout").default as React.FC;
const ExerciseScreen = require("../../app/exercise").default as React.FC;
const { ExercisePicker } =
  require("../../src/components/ExercisePicker") as typeof import("../../src/components/ExercisePicker");
/* eslint-enable @typescript-eslint/no-require-imports */

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
const announce = jest
  .spyOn(AccessibilityInfo, "announceForAccessibility")
  .mockImplementation(() => {});
const flush = () => act(async () => {});
const lastAlert = () => alert.mock.calls.at(-1) as [string, string];
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 375, fontScale: 1 });
  for (const k of Object.keys(mockParams)) delete mockParams[k];
});
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
type Node = {
  type: string;
  props: Record<string, unknown>;
  children: (Node | string)[] | null;
};
/** Host nodes in the rendered tree that match a predicate. */
function nodes(view: RenderResult, match: (n: Node) => boolean) {
  const found: Node[] = [];
  const walk = (n: Node | Node[] | string | null) => {
    if (!n || typeof n === "string") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (match(n)) found.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(view.toJSON() as Node | Node[] | null);
  return found;
}
const textOf = (n: Node | string): string =>
  typeof n === "string" ? n : (n.children ?? []).map(textOf).join("");
const failure = (run: () => unknown) => {
  try {
    run();
  } catch (e) {
    return e;
  }
  throw new Error("expected a validation failure");
};

// ---- 1. Validation messages (the WP5 regression) ---------------------------

test("a set completed without reps explains what to enter; nothing is written", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const w = r.startWorkout("Push");
    const row = r.addExercise(w.id, "barbell-bench-press");
    const set = r.addSet(row.id, { weight: 60 });
    const queued = JSON.stringify(r.outbox());
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    expect(lastAlert()).toEqual([
      "Could not save",
      "Enter repetitions, duration or distance before completing a set.",
    ]);
    // Not completed, not stored, not queued, and no rest started.
    expect(r.sets(row.id)[0]).toMatchObject({ id: set.id, completed: false });
    expect(JSON.stringify(r.outbox())).toBe(queued);
    expect(Number(r.setting("restDeadline") ?? 0)).toBe(0);
    expect(view.getByLabelText("Complete set 1")).toBeTruthy();
    // Developers still get the full error.
    expect(warn).toHaveBeenCalledWith(
      "[FORGE] Save rejected by validation",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    // Entering reps and trying again works.
    await fireEvent.changeText(view.getByLabelText("Set 1 reps"), "8");
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    expect(r.sets(row.id)[0]).toMatchObject({ reps: 8, completed: true });
  } finally {
    db.close();
  }
});

test("authored rule messages are shown; technical schema messages never are", () => {
  const set = {
    id: "s",
    exerciseRowId: "e",
    position: 0,
    weight: 60,
    reps: 0,
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
  expect(state.saveErrorMessage(failure(() => setSchema.parse(set)))).toBe(
    "Enter repetitions, duration or distance before completing a set.",
  );
  expect(
    state.saveErrorMessage(
      failure(() =>
        profileSchema.parse({
          ...defaults,
          repMin: 12,
          repMax: 8,
        }),
      ),
    ),
  ).toBe("Minimum reps must not exceed maximum reps.");
  expect(
    state.saveErrorMessage(
      failure(() =>
        prescriptionSchema.parse({
          exerciseId: "x",
          sets: 3,
          reps: 12,
          repMax: 8,
          weight: 0,
          rest: 90,
        }),
      ),
    ),
  ).toBe("Rep ranges require positive, ordered bounds.");
  // Type and limit errors stay generic; so does a rule without a message.
  const generic =
    "Some values couldn't be saved. Check the form and try again. Your existing data is unchanged.";
  expect(
    state.saveErrorMessage(
      failure(() => setSchema.parse({ ...set, reps: "eight" })),
    ),
  ).toBe(generic);
  expect(
    state.saveErrorMessage(
      failure(() =>
        z
          .object({ a: z.number() })
          .refine(() => false)
          .parse({ a: 1 }),
      ),
    ),
  ).toBe(generic);
  // Plain-language errors are unchanged.
  expect(
    state.saveErrorMessage(new Error("Choose today or a future date.")),
  ).toBe("Choose today or a future date.");
});

// ---- 2. Segmented controls at larger text ----------------------------------

const RANGES = ["4 weeks", "12 weeks", "1 year", "All time"];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
test("segmented options stay on one row, wrap to two lines, use two columns, then stack", () => {
  // 375 pt phone: 335 pt inside the screen margins.
  expect(ui.segmentLayout(RANGES, 335, 1)).toBe("row");
  expect(ui.segmentLayout(RANGES, 335, 1.3)).toBe("wrap");
  expect(ui.segmentLayout(RANGES, 335, 2)).toBe("grid");
  expect(ui.segmentLayout(RANGES, 335, 3)).toBe("stack");
  expect(ui.segmentLayout(MEALS, 335, 1)).toBe("row");
  // "Breakfast" can't break, so four meals take two columns, then one.
  expect(ui.segmentLayout(MEALS, 335, 1.6)).toBe("grid");
  expect(ui.segmentLayout(MEALS, 335, 2)).toBe("grid");
  expect(ui.segmentLayout(MEALS, 335, 2.6)).toBe("stack");
  expect(ui.segmentLayout(["Dark", "Light", "System"], 303, 1)).toBe("row");
  expect(ui.segmentLayout(["Dark", "Light", "System"], 303, 2)).toBe("stack");
  // Short labels stay in a row even at 200 %.
  expect(ui.segmentLayout(["1M", "3M", "6M", "1Y", "All"], 335, 2)).toBe("row");
  // A word that can't fit on its own line always stacks (no broken words).
  expect(ui.segmentLayout(["Standard", "Lower fatigue"], 120, 1)).toBe("stack");
});

function Ranges({ onPick }: { onPick: (v: string) => void }) {
  const [value, setValue] = useState("12 weeks");
  return (
    <ui.SegmentedControl
      label="Range"
      options={RANGES}
      value={value}
      onChange={(v) => {
        setValue(v);
        onPick(v);
      }}
    />
  );
}
const minHeight = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle)
    .minHeight as number;

test("segmented controls keep roles, selection and 44 pt options in every layout", async () => {
  for (const fontScale of [1, 1.3, 2, 3]) {
    mockDims.fontScale = fontScale;
    const onPick = jest.fn();
    const view = await render(<Ranges onPick={onPick} />);
    expect(view.getByLabelText("Range").props.accessibilityRole).toBe(
      "tablist",
    );
    const tabs = view.getAllByRole("tab");
    expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(RANGES);
    for (const t of tabs) expect(minHeight(t)).toBeGreaterThanOrEqual(44);
    // Labels may take two lines in a row and are never cut in a stack.
    const lines = view.getByText("4 weeks").props.numberOfLines;
    expect(lines).toBe(fontScale === 3 ? undefined : 2);
    expect(
      view.getByRole("tab", { name: "12 weeks" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    // Each option is its own target; choosing one selects only it.
    await fireEvent.press(view.getByRole("tab", { name: "All time" }));
    expect(onPick).toHaveBeenLastCalledWith("All time");
    expect(
      view.getByRole("tab", { name: "All time" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      view.getByRole("tab", { name: "12 weeks" }).props.accessibilityState,
    ).toMatchObject({ selected: false });
    // A stack marks the chosen option with a check as well as its fill.
    expect(nodes(view, (n) => n.props.name === "checkmark").length).toBe(
      fontScale === 3 ? 1 : 0,
    );
    await view.unmount();
  }
});

// ---- 3. Touch targets -------------------------------------------------------

test("chips and the back control meet the 44 pt minimum", async () => {
  const view = await render(
    <>
      <ui.BackButton onPress={() => {}} />
      <ui.Chips values={["All", "Chest"]} value="All" onChange={() => {}} />
    </>,
  );
  const back = StyleSheet.flatten(
    view.getByLabelText("Back").props.style as object,
  ) as { minWidth: number; minHeight: number };
  expect(back.minWidth).toBeGreaterThanOrEqual(44);
  expect(back.minHeight).toBeGreaterThanOrEqual(44);
  for (const name of ["All", "Chest"])
    expect(
      minHeight(view.getByRole("button", { name })),
    ).toBeGreaterThanOrEqual(44);
});

// ---- 4. Field errors for screen readers --------------------------------------

function Weight({ error }: { error?: string }) {
  return <ui.Field label="Weight (kg)" value="" error={error} />;
}
test("a field error is tied to its field, announced once, and cleared", async () => {
  const view = await render(<Weight />);
  expect(view.getByLabelText("Weight (kg)").props.accessibilityHint).toBe(
    undefined,
  );
  await view.rerender(<Weight error="Enter a number from 20 to 400" />);
  await flush();
  expect(view.getByLabelText("Weight (kg)").props.accessibilityHint).toBe(
    "Error: Enter a number from 20 to 400",
  );
  // The message sits in a polite live region (read by TalkBack when it appears).
  const regions = nodes(
    view,
    (n) => n.props.accessibilityLiveRegion === "polite",
  );
  expect(regions.map(textOf)).toEqual(["Enter a number from 20 to 400"]);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith(
    "Weight (kg): Enter a number from 20 to 400.",
  );
  // The same message isn't repeated on every keystroke.
  await view.rerender(<Weight error="Enter a number from 20 to 400" />);
  await flush();
  expect(announce).toHaveBeenCalledTimes(1);
  // Fixed: the message and hint go away; a new problem is announced again.
  await view.rerender(<Weight />);
  await flush();
  expect(view.queryByText("Enter a number from 20 to 400")).toBeNull();
  expect(view.getByLabelText("Weight (kg)").props.accessibilityHint).toBe(
    undefined,
  );
  await view.rerender(<Weight error="Enter your weight" />);
  await flush();
  expect(announce).toHaveBeenCalledTimes(2);
});

test("an invalid typed number is announced once while it stays invalid", async () => {
  const save = jest.fn();
  const view = await render(
    <ui.NumberField label="Protein (g)" value={150} max={1000} onSave={save} />,
  );
  await fireEvent(view.getByLabelText("Protein (g)"), "focus");
  await fireEvent.changeText(view.getByLabelText("Protein (g)"), "-");
  await flush();
  await fireEvent.changeText(view.getByLabelText("Protein (g)"), "-5");
  await flush();
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce.mock.calls[0]![0]).toMatch(/^Protein \(g\): Enter a number/);
  await fireEvent.changeText(view.getByLabelText("Protein (g)"), "160");
  await flush();
  expect(save).toHaveBeenLastCalledWith(160);
  expect(view.getByLabelText("Protein (g)").props.accessibilityHint).toBe(
    undefined,
  );
});

test("a failed custom-exercise Save is announced once, listing every field", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    mockParams.custom = "new";
    const view = await render(<ExerciseScreen />);
    await fireEvent.press(view.getByLabelText("Save exercise"));
    await flush();
    expect(announce).toHaveBeenCalledTimes(1);
    const spoken = announce.mock.calls[0]![0] as string;
    for (const part of [
      "Exercise name: Enter a name for this exercise",
      "Main muscle: Choose the main muscle it works",
      "Equipment: Choose the equipment",
      "Instructions (one step per line): Add at least one step",
    ])
      expect(spoken).toContain(part);
    expect(
      view.getByLabelText("Main muscle, not chosen. Choose main muscle").props
        .accessibilityHint,
    ).toBe("Error: Choose the main muscle it works.");
  } finally {
    db.close();
  }
});

// ---- 5. Once-only actions ----------------------------------------------------

async function fillCustomExercise(view: RenderResult) {
  await fireEvent.changeText(
    view.getByLabelText("Exercise name"),
    "Landmine press",
  );
  await fireEvent.press(
    view.getByLabelText("Main muscle, not chosen. Choose main muscle"),
  );
  await fireEvent.press(view.getByRole("radio", { name: "Shoulders" }));
  await fireEvent.press(
    view.getByLabelText("Equipment, not chosen. Choose equipment"),
  );
  await fireEvent.press(view.getByRole("radio", { name: "Barbell" }));
  await fireEvent.changeText(
    view.getByLabelText("Instructions (one step per line)"),
    "Press up and forward",
  );
}

test("two rapid Save taps create one custom exercise; a refused Save can be retried", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    mockParams.custom = "new";
    const view = await render(<ExerciseScreen />);
    // Refused (missing fields) twice in one frame: nothing saved, still usable.
    await pressTwiceInOneFrame(view, "Save exercise");
    expect(r.customExercises()).toHaveLength(0);
    await fillCustomExercise(view);
    await pressTwiceInOneFrame(view, "Save exercise");
    expect(r.customExercises()).toHaveLength(1);
    expect(r.customExercises()[0]).toMatchObject({
      name: "Landmine press",
      muscle: "Shoulders",
      equipment: "Barbell",
    });
  } finally {
    db.close();
  }
});

test("a storage failure releases the Save guard so the lifter can retry", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    mockParams.custom = "new";
    const view = await render(<ExerciseScreen />);
    await fillCustomExercise(view);
    const real = r.saveExercise.bind(r);
    const spy = jest.spyOn(r, "saveExercise").mockImplementationOnce(() => {
      throw new Error("Storage is full.");
    });
    await fireEvent.press(view.getByLabelText("Save exercise"));
    expect(lastAlert()).toEqual(["Could not save", "Storage is full."]);
    expect(r.customExercises()).toHaveLength(0);
    spy.mockImplementation(real);
    await fireEvent.press(view.getByLabelText("Save exercise"));
    expect(r.customExercises()).toHaveLength(1);
  } finally {
    db.close();
  }
});

function Picker({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <ui.Button title="Open picker" onPress={() => setOpen(true)} />
      <ExercisePicker
        visible={open}
        onClose={() => setOpen(false)}
        onPick={(e) => onPick(e.id)}
      />
    </>
  );
}
test("a picker row tapped twice adds once; the next opening picks again", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const onPick = jest.fn();
    const view = await render(<Picker onPick={onPick} />);
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "barbell bench",
    );
    await pressTwiceInOneFrame(view, "Add Barbell Bench Press");
    expect(onPick).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByLabelText("Open picker"));
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "barbell bench",
    );
    await fireEvent.press(view.getByLabelText("Add Barbell Bench Press"));
    expect(onPick).toHaveBeenCalledTimes(2);
  } finally {
    db.close();
  }
});

test("in the logger, a double tap on a picker row adds one exercise row", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const w = r.startWorkout("Push");
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getAllByLabelText(/^Add exercise/)[0]!);
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "barbell bench",
    );
    await pressTwiceInOneFrame(view, "Add Barbell Bench Press");
    expect(r.workoutExercises(w.id)).toHaveLength(1);
    // Normal logging is unchanged: the added row has one set to fill in.
    expect(r.sets(r.workoutExercises(w.id)[0]!.id)).toHaveLength(1);
  } finally {
    db.close();
  }
});
