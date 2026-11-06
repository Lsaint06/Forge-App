import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import WorkoutScreen from "../../src/screens/Workout";
import { SetGrid } from "../../src/components/SetGrid";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { programLibrary } from "../../src/programs";
import { enrollProgram, startProgramSession } from "../../src/data/programs";
import { phaseLabel } from "../../src/screens/home/model";
import { theme } from "../../src/theme";
import { defaults, type WorkoutSet } from "../../src/domain/types";

// Phase 7.2A: the active workout after the approved Train reference. The
// logger's behaviour is covered by workout-logger, workout-wp2, redesign,
// wp6 and legacy-workouts; these tests pin the new frame and set states.

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
    (selector: (s: { profile: undefined }) => unknown) =>
      selector({ profile: undefined }),
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
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDims, { width: 393, height: 852, fontScale: 1 });
  delete mockParams.id;
});

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as ViewStyle) as ViewStyle & {
    borderColor?: string;
  };
// Either palette: the test renderer may report a light or dark scheme.
const palettes = [theme.colors, theme.palettes.light];
const isColor = (value: unknown, key: keyof typeof theme.palettes.light) =>
  palettes.some((p) => p[key] === value);
const hidden = { includeHiddenElements: true };

function freestyle(sets = 3) {
  const fixture = pathRepository();
  const { r } = fixture;
  const w = r.startWorkout("Freestyle");
  const row = r.addExercise(w.id, "barbell-bench-press");
  for (let i = 0; i < sets; i++) r.addSet(row.id, { weight: 60, reps: 8 });
  jest.mocked(useRepo).mockReturnValue(r);
  return { ...fixture, w, row };
}

test("the logger leads with the reference's hero, session timer and progress", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    const program = programLibrary.find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    const { id } = enrollProgram(r, program, "2026-10-19");
    const w = startProgramSession(r, id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    // Brand, overline, condensed title and the plan's week and phase.
    expect(view.getByLabelText("FORGE")).toBeTruthy();
    expect(view.getByText("Workout in progress")).toBeTruthy();
    expect(view.getByRole("header", { name: /./ })).toBeTruthy();
    expect(
      view.getByText(`Week 1 · ${phaseLabel(program.phases[0]!.name)}`),
    ).toBeTruthy();
    // Session timer card: the live clock, the start time and Pause.
    expect(view.getByLabelText(/^Elapsed time \d+ minutes$/)).toBeTruthy();
    expect(view.getByLabelText(/^Started at /)).toBeTruthy();
    expect(view.getByRole("button", { name: "Pause workout" })).toBeTruthy();
    // Progress in finished exercises, as in the reference.
    const exercises = r.workoutExercises(w.id).length;
    const bar = view.getByRole("progressbar", {
      name: `Workout progress, 0 of ${exercises} exercises complete`,
    });
    expect(bar.props.accessibilityValue.now).toBe(0);
    expect(view.getByText(` / ${exercises} exercises`, hidden)).toBeTruthy();
    expect(view.getByText("0%", hidden)).toBeTruthy();
    // The exercises are numbered; Finish Workout is the CTA.
    expect(view.getAllByText(String(exercises)).length).toBeGreaterThan(0);
    expect(view.getByRole("button", { name: "Finish workout" })).toBeTruthy();
  } finally {
    db.close();
  }
}, 20_000);

test("Pause sits in the session card; while paused, Resume replaces the rest timer", async () => {
  const { r, db, w } = freestyle(1);
  try {
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Pause workout" }));
    expect(r.workout(w.id)!.status).toBe("paused");
    await view.rerender(<WorkoutScreen />);
    expect(view.getByText("Workout paused")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Pause workout" })).toBeNull();
    expect(view.queryByLabelText("Start rest")).toBeNull();
    // Logging stays possible while paused; Finish stays available.
    expect(view.getByLabelText("Set 1 reps")).toBeTruthy();
    expect(view.getByRole("button", { name: "Finish workout" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Resume workout" }));
    expect(r.workout(w.id)!.status).toBe("active");
    await view.rerender(<WorkoutScreen />);
    expect(view.getByText("Workout in progress")).toBeTruthy();
    expect(view.getByLabelText("Start rest")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("completed sets show ember check discs and the next set is outlined in ember", async () => {
  const { r, db, row } = freestyle(3);
  try {
    const view = await render(<WorkoutScreen />);
    // Before logging: the first set is next.
    expect(
      isColor(
        flat(view.getByLabelText("Set 1 weight (kg)")).borderColor,
        "emberMuted",
      ),
    ).toBe(true);
    expect(
      isColor(
        flat(view.getByLabelText("Set 2 weight (kg)")).borderColor,
        "cardBorder",
      ),
    ).toBe(true);
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    expect(r.sets(row.id)[0]!.completed).toBe(true);
    await view.rerender(<WorkoutScreen />);
    const done = view.getByRole("button", { name: "Mark set 1 incomplete" });
    expect(done.props.accessibilityState).toMatchObject({ selected: true });
    expect(
      view.getByRole("button", { name: "Complete set 2" }).props
        .accessibilityState,
    ).toMatchObject({ selected: false });
    // The next set moves on; the done set keeps its values in an outline.
    for (const label of ["weight (kg)", "reps"])
      expect(
        isColor(
          flat(view.getByLabelText(`Set 2 ${label}`)).borderColor,
          "emberMuted",
        ),
      ).toBe(true);
    const first = flat(view.getByLabelText("Set 1 weight (kg)"));
    expect(first.backgroundColor).toBe("transparent");
    expect(isColor(first.borderColor, "cardBorder")).toBe(true);
    expect(view.getByLabelText("Set 1 weight (kg)").props.value).toBe("60");
    // Undo stays one tap.
    await fireEvent.press(done);
    expect(r.sets(row.id)[0]!.completed).toBe(false);
  } finally {
    db.close();
  }
});

test("rest shows remaining over its full length; +30s extends both", async () => {
  const { r, db, row } = freestyle(1);
  try {
    const rest = r.sets(row.id)[0]!.rest;
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    expect(r.setting("restTotal")).toBe(String(rest));
    await view.rerender(<WorkoutScreen />);
    const mm = (s: number) =>
      `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    expect(view.getByText(` / ${mm(rest)}`)).toBeTruthy();
    const deadline = Number(r.setting("restDeadline"));
    await fireEvent.press(view.getByLabelText("+30 sec"));
    expect(r.setting("restTotal")).toBe(String(rest + 30));
    expect(Number(r.setting("restDeadline"))).toBeGreaterThan(
      deadline + 25_000,
    );
    await view.rerender(<WorkoutScreen />);
    expect(view.getByText(` / ${mm(rest + 30)}`)).toBeTruthy();
    // Skip ends the rest; the panel returns to Start rest.
    await fireEvent.press(view.getByLabelText("Skip"));
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Start rest")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("workout progress counts finished exercises", async () => {
  const { r, db, w, row } = freestyle(2);
  try {
    const second = r.addExercise(w.id, "back-squat");
    r.addSet(second.id, { weight: 100, reps: 5 });
    for (const s of r.sets(row.id)) r.editSet(s.id, { completed: true });
    const view = await render(<WorkoutScreen />);
    const bar = view.getByRole("progressbar", {
      name: "Workout progress, 1 of 2 exercises complete",
    });
    expect(bar.props.accessibilityValue.now).toBe(50);
    expect(view.getByText("50%", hidden)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("Add set copies the last set and the notes row opens exercise settings", async () => {
  const { r, db, row } = freestyle(1);
  try {
    r.editSet(r.sets(row.id)[0]!.id, { weight: 62.5, reps: 6 });
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Add set" }));
    expect(r.sets(row.id)).toHaveLength(2);
    expect(r.sets(row.id)[1]).toMatchObject({ weight: 62.5, reps: 6 });
    await fireEvent.press(view.getByLabelText("Add exercise notes"));
    expect(
      view.getByRole("header", { name: "Exercise settings" }),
    ).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Exercise notes"),
      "Wide grip",
    );
    expect(r.workoutExercises(row.workoutId)[0]!.notes).toBe("Wide grip");
    await fireEvent.press(view.getByLabelText("Close"));
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Exercise notes: Wide grip")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("logger controls keep 44 pt targets; Finish Workout stays prominent", async () => {
  const { r, db, row } = freestyle(1);
  try {
    const view = await render(<WorkoutScreen />);
    const size = (label: string) => {
      const s = flat(view.getByLabelText(label));
      return Math.max(Number(s.minHeight ?? 0), Number(s.height ?? 0));
    };
    expect(size("Complete set 1")).toBeGreaterThanOrEqual(44);
    expect(flat(view.getByLabelText("Complete set 1")).width).toBe(44);
    expect(size("Add set")).toBeGreaterThanOrEqual(44);
    expect(size("Add exercise notes")).toBeGreaterThanOrEqual(44);
    expect(size("Start rest")).toBeGreaterThanOrEqual(44);
    expect(size("Pause workout")).toBeGreaterThanOrEqual(44);
    expect(size("Workout options")).toBeGreaterThanOrEqual(44);
    expect(
      size(`Options for ${r.exercise(row.exerciseId)!.name}`),
    ).toBeGreaterThanOrEqual(44);
    expect(size("Finish workout")).toBe(54);
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    await view.rerender(<WorkoutScreen />);
    expect(size("+30 sec")).toBeGreaterThanOrEqual(44);
    expect(size("Skip")).toBeGreaterThanOrEqual(44);
    await view.unmount();
    // Short screens keep a 48 pt Finish so more sets stay in view.
    mockDims.height = 667;
    const compact = await render(<WorkoutScreen />);
    expect(flat(compact.getByLabelText("Finish workout")).minHeight).toBe(48);
  } finally {
    db.close();
  }
});

test("finished workouts open for review without the session or progress cards", async () => {
  const { r, db, w, row } = freestyle(2);
  try {
    r.editSet(r.sets(row.id)[0]!.id, { completed: true });
    r.finishWorkout(w.id);
    // History opens a finished workout by id ("Review / edit").
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByText("Completed session")).toBeTruthy();
    expect(view.queryByLabelText(/^Elapsed time/)).toBeNull();
    expect(view.queryByRole("progressbar")).toBeNull();
    expect(view.queryByRole("button", { name: "Add set" })).toBeNull();
    expect(view.getByLabelText("Set 1 done")).toBeTruthy();
    expect(view.getByLabelText("Set 2 not done")).toBeTruthy();
    expect(view.getByRole("button", { name: "Edit workout" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("the 375 pt iPhones keep every column inside the card, including Prev and RIR", async () => {
  const repo = {
    profile: () => ({ ...defaults, onboarded: true }),
    sets: () => [],
    editSet: jest.fn(),
    setSetting: jest.fn(),
  };
  jest
    .mocked(useRepo)
    .mockReturnValue(repo as unknown as ReturnType<typeof useRepo>);
  mockDims.width = 375;
  const base: WorkoutSet = {
    id: "s1",
    exerciseRowId: "row",
    position: 0,
    weight: 60,
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
  const view = await render(
    <SetGrid
      sets={[base]}
      category="strength"
      showRir
      previous={[{ ...base, completed: true }]}
      order={0}
      onDetails={() => {}}
    />,
  );
  expect(view.getByText("Prev", hidden)).toBeTruthy();
  expect(view.getByText("RIR", hidden)).toBeTruthy();
});

test("with no workout to show, the REFORGE empty state returns to Train (7.2C-4)", async () => {
  const { r, db } = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(r);
    const { router } = jest.requireMock("expo-router") as {
      router: { canGoBack: jest.Mock; replace: jest.Mock };
    };
    router.canGoBack.mockReturnValue(false);
    const view = await render(<WorkoutScreen />);
    expect(
      view.getByRole("header", { name: "No active workout" }),
    ).toBeTruthy();
    expect(view.getByText("Ready when you are")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back to Train"));
    expect(router.replace).toHaveBeenLastCalledWith("/(tabs)/train");
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.replace).toHaveBeenLastCalledWith("/(tabs)/train");
    router.canGoBack.mockReturnValue(true);
  } finally {
    db.close();
  }
});
