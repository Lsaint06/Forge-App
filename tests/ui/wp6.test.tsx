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
const WorkoutModule =
  require("../../src/screens/Workout") as typeof import("../../src/screens/Workout");
const WorkoutScreen = WorkoutModule.default as React.FC;
const ExerciseScreen = require("../../app/exercise").default as React.FC;
const { SetGrid } =
  require("../../src/components/SetGrid") as typeof import("../../src/components/SetGrid");
const { MacroSummary } =
  require("../../src/components/nutrition/MacroSummary") as typeof import("../../src/components/nutrition/MacroSummary");
const { QuickAddSheet } =
  require("../../src/components/nutrition/QuickAddSheet") as typeof import("../../src/components/nutrition/QuickAddSheet");
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

// ---- WP6 Batch B -------------------------------------------------------------

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle & {
    fontWeight?: string;
  };
const hidden = { includeHiddenElements: true };

test("the chosen segment is outlined and bolder in every layout", async () => {
  for (const fontScale of [1, 1.3, 2, 3]) {
    mockDims.fontScale = fontScale;
    const view = await render(<Ranges onPick={() => {}} />);
    const chosen = view.getByRole("tab", { name: "12 weeks" });
    const other = view.getByRole("tab", { name: "1 year" });
    expect(flat(chosen).borderWidth).toBe(1);
    expect(flat(chosen).borderColor).not.toBe("transparent");
    expect(flat(other).borderColor).toBe("transparent");
    expect(flat(view.getByText("12 weeks")).fontWeight).toBe("700");
    expect(flat(view.getByText("1 year")).fontWeight).toBe("600");
    // The outline moves with the choice; the spoken state follows.
    await fireEvent.press(other);
    expect(
      flat(view.getByRole("tab", { name: "1 year" })).borderColor,
    ).not.toBe("transparent");
    expect(
      view.getByRole("tab", { name: "1 year" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await view.unmount();
  }
});

test("macros keep three columns until a label can't fit, then take a row each", async () => {
  const totals = { calories: 1234, protein: 160, carbs: 210, fat: 55 };
  const targets = { calories: 2600, protein: 180, carbs: 300, fat: 75 };
  const props = { totals, targets, personalized: true, onSetTargets: () => {} };
  for (const [fontScale, direction] of [
    [1, "row"],
    [1.3, "row"],
    [1.6, "column"],
    [2, "column"],
  ] as const) {
    mockDims.fontScale = fontScale;
    const view = await render(<MacroSummary {...props} />);
    const protein = view.getByLabelText("Protein 160 g of 180 g");
    // The macro's container decides the arrangement; spoken labels are unchanged.
    // Columns share the width (flex 1); rows take the full width.
    expect(flat(protein).flex).toBe(direction === "row" ? 1 : undefined);
    expect(view.getByLabelText("Carbs 210 g of 300 g")).toBeTruthy();
    expect(view.getByLabelText("Fat 55 g of 75 g")).toBeTruthy();
    // In rows, values never shrink or cut.
    const value = view.getByText("160 g");
    expect(value.props.numberOfLines).toBe(direction === "row" ? 1 : undefined);
    expect(value.props.adjustsFontSizeToFit).toBe(
      direction === "row" ? true : undefined,
    );
    await view.unmount();
  }
});

test("the workout header wraps a long name and its summary instead of cutting them", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const w = r.startWorkout("Upper body · heavy bench and weighted pull-ups");
    const row = r.addExercise(w.id, "barbell-bench-press");
    r.addSet(row.id, { weight: 100, reps: 5 });
    const view = await render(<WorkoutScreen />);
    expect(
      view.getByRole("header", { name: /heavy bench/ }).props.numberOfLines,
    ).toBe(2);
    expect(view.getByText(/0 of 1 sets?/).props.numberOfLines).toBe(2);
  } finally {
    db.close();
  }
});

const BASE = {
  id: "s1",
  exerciseRowId: "row",
  position: 0,
  weight: 0,
  reps: 0,
  duration: 0,
  distance: 0,
  rpe: null,
  rir: null,
  kind: "working" as const,
  completed: false,
  rest: 90,
  tempo: "",
  notes: "",
  side: "both" as const,
};
function prevGrid() {
  return (
    <SetGrid
      sets={[BASE]}
      category="strength"
      showRir={false}
      previous={[{ ...BASE, weight: 60, reps: 8, completed: true }]}
      order={0}
      onDetails={() => {}}
    />
  );
}
test("Use previous has a 44 pt target that never reaches into neighbouring cells", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const target = async (width: number, fontScale: number) => {
      Object.assign(mockDims, { width, fontScale });
      const view = await render(prevGrid());
      const el = view.getByLabelText("Use previous 60 kilograms for 8 reps");
      const style = flat(el);
      const slop = el.props.hitSlop as
        { top?: number; bottom?: number } | undefined;
      await view.unmount();
      return { height: style.minHeight as number, slop };
    };
    // Wide grid (its own column) and stacked layout (beside the set number):
    // the 44 pt row is the target; no hitSlop overlaps another control.
    expect(await target(393, 1)).toEqual({ height: 44, slop: undefined });
    expect(await target(300, 2)).toEqual({ height: 44, slop: undefined });
    // Compact grid (under the cells): 24 pt plus 10 pt above and below.
    // Documented trade-off: a full 44 pt row here would add 20 pt per set.
    const compact = await target(320, 1);
    expect(compact.height + compact.slop!.top! + compact.slop!.bottom!).toBe(
      44,
    );
  } finally {
    db.close();
  }
});

test("a grid caption wider than its column stays on one line at large text", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    Object.assign(mockDims, { width: 375, fontScale: 2 });
    const view = await render(prevGrid());
    const set = view.queryByText("Set", hidden);
    // Where the header shows (compact and wide layouts), "SET" never breaks.
    if (set) {
      expect(set.props.numberOfLines).toBe(1);
      expect(flat(set).width as number).toBeGreaterThanOrEqual(
        ui.textWidth("SET", 11, 2, 1.6),
      );
    }
  } finally {
    db.close();
  }
});

test("Use previous then ✓ in quick succession logs the previous result", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const before = r.startWorkout("Push");
    const prevRow = r.addExercise(before.id, "barbell-bench-press");
    r.editSet(r.addSet(prevRow.id, { weight: 60, reps: 8 }).id, {
      completed: true,
    });
    r.finishWorkout(before.id);
    const w = r.startWorkout("Push");
    const row = r.addExercise(w.id, "barbell-bench-press");
    r.addSet(row.id);
    Object.assign(mockDims, { width: 393, fontScale: 1 });
    const view = await render(<WorkoutScreen />);
    const fillPrevious = findEventHandler(
      view.getByLabelText("Use previous 60 kilograms for 8 reps"),
      "press",
      { bubbles: true },
    ).handler!;
    const done = findEventHandler(
      view.getByLabelText("Complete set 1"),
      "press",
      {
        bubbles: true,
      },
    ).handler!;
    await act(async () => {
      fillPrevious({ nativeEvent: {} });
      done({ nativeEvent: {} });
    });
    expect(r.sets(row.id)[0]).toMatchObject({
      weight: 60,
      reps: 8,
      completed: true,
    });
    expect(alert).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

function inScroll(view: RenderResult, label: string) {
  return (
    nodes(
      view,
      (n) =>
        n.type === "RCTScrollView" &&
        nodes(
          { toJSON: () => n } as unknown as RenderResult,
          (m) => m.props.accessibilityLabel === label,
        ).length > 0,
    ).length > 0
  );
}
test("Add food at large text scrolls its controls with the foods; nothing is lost", async () => {
  for (const fontScale of [1, 2]) {
    const { r, db } = pathRepository();
    fixture.r = r;
    try {
      Object.assign(mockDims, { width: 375, height: 667, fontScale });
      const close = jest.fn();
      const today = "2026-10-24";
      const view = await render(
        <QuickAddSheet
          day={today}
          today={today}
          initialMeal="Dinner"
          onClose={close}
        />,
      );
      // At 200 % the day, meal and search are part of the scrolling list.
      expect(inScroll(view, "Search foods")).toBe(fontScale === 2);
      expect(
        view.getByRole("tab", { name: "Dinner" }).props.accessibilityState,
      ).toMatchObject({ selected: true });
      await fireEvent.press(view.getByRole("tab", { name: "Lunch" }));
      await fireEvent.changeText(
        view.getByLabelText("Search foods"),
        "egg whole boiled",
      );
      const add = view.getAllByLabelText(
        /^Add 100 g of Egg, whole, boiled/,
      )[0]!;
      await fireEvent.press(add);
      const [entry] = r.journal("nutrition");
      expect(entry!.data).toMatchObject({ meal: "Lunch" });
      expect(view.getByLabelText("Create food")).toBeTruthy();
      await fireEvent.press(view.getByLabelText("Close"));
      expect(close).toHaveBeenCalled();
      await view.unmount();
    } finally {
      db.close();
    }
  }
});

// ---- WP6 Batch C -------------------------------------------------------------

test("rest is read aloud in words", () => {
  expect(WorkoutModule.spokenRest(90)).toBe("1 minute 30 seconds");
  expect(WorkoutModule.spokenRest(60)).toBe("1 minute");
  expect(WorkoutModule.spokenRest(121)).toBe("2 minutes 1 second");
  expect(WorkoutModule.spokenRest(5)).toBe("5 seconds");
});

test("the rest timer has a stable name, announces start and end once, and never per second", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    const w = r.startWorkout("Push");
    const row = r.addExercise(w.id, "barbell-bench-press");
    r.addSet(row.id, { weight: 60, reps: 8 });
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    const spoken = () => announce.mock.calls.map(([s]) => s as string);
    expect(spoken().filter((s) => s.startsWith("Rest started"))).toEqual([
      expect.stringMatching(/^Rest started, 1 minute (2\d|30) seconds$/),
    ]);
    const timerEl = view.getByRole("timer", { name: "Rest timer" });
    expect(timerEl.props.accessibilityValue.text).toMatch(/remaining$/);
    expect(timerEl.props.accessibilityLiveRegion).toBeUndefined();
    // Extending rest changes the countdown, not the announcement count.
    await fireEvent.press(view.getByLabelText("+30 sec"));
    expect(spoken().filter((s) => s.startsWith("Rest started"))).toHaveLength(
      1,
    );
    // Skipping is the lifter's own action: no "Rest over".
    await fireEvent.press(view.getByLabelText("Skip"));
    expect(Number(r.setting("restDeadline"))).toBe(0);
    expect(spoken()).not.toContain("Rest over");
  } finally {
    db.close();
  }
});

test("rest ending on its own is announced once and cleared; reopening a running rest is quiet", async () => {
  const { r, db } = pathRepository();
  fixture.r = r;
  try {
    r.startWorkout("Push");
    r.setSetting("restDeadline", String(Date.now() + 60_000));
    const running = await render(<WorkoutModule.RestTimer />);
    expect(announce).not.toHaveBeenCalled();
    await running.unmount();
    r.setSetting("restDeadline", String(Date.now() - 1000));
    await render(<WorkoutModule.RestTimer />);
    await flush();
    expect(announce.mock.calls.map(([s]) => s)).toEqual(["Rest over"]);
    expect(r.setting("restDeadline")).toBe("0");
  } finally {
    db.close();
  }
});

test("a sheet is a modal for screen readers and starts at its title", async () => {
  const enabled = jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled");
  const send = jest
    .spyOn(AccessibilityInfo, "sendAccessibilityEvent")
    .mockImplementation(() => {});
  const close = jest.fn();
  const view = await render(
    <ui.Sheet visible title="Log measurement" onClose={close}>
      <ui.Field label="Value (kg)" value="" />
    </ui.Sheet>,
  );
  const modal = nodes(view, (n) => n.props.onShow !== undefined)[0]!;
  const show = modal.props.onShow as () => void;
  // Background controls are out of reach; the scrim is not focusable.
  expect(
    nodes(view, (n) => n.props.accessibilityViewIsModal === true),
  ).toHaveLength(1);
  // The scrim is outside the modal view: hidden from screen readers.
  expect(view.queryByTestId("sheet-backdrop")).toBeNull();
  expect(view.getByTestId("sheet-backdrop", hidden).props.accessible).toBe(
    false,
  );
  const title = view.getByRole("header", { name: "Log measurement" });
  // No screen reader: focus is left alone.
  enabled.mockResolvedValueOnce(false);
  await act(async () => show());
  expect(send).not.toHaveBeenCalled();
  // With one: focus moves to the title once the sheet is shown.
  enabled.mockResolvedValueOnce(true);
  await act(async () => show());
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]![1]).toBe("focus");
  expect(title).toBeTruthy();
  // Close is unchanged.
  await fireEvent.press(view.getByLabelText("Close"));
  expect(close).toHaveBeenCalled();
  enabled.mockRestore();
  send.mockRestore();
});
