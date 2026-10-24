import React from "react";
import { StyleSheet, type TextInputInstance } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
import WorkoutScreen, { RestTimer } from "../../src/screens/Workout";
import WorkoutExerciseCard from "../../src/components/WorkoutExerciseCard";
import { SetGrid, SetRow, SetFocusOrder } from "../../src/components/SetGrid";
import { useRepo, confirm } from "../../src/state";
import {
  cancelRestNotification,
  restNotification,
} from "../../src/notifications";
import { pathRepository } from "../path-fixture";
import { programLibrary } from "../../src/programs";
import {
  enrollProgram,
  startProgramSession,
  programExerciseAdvice,
} from "../../src/data/programs";
import {
  targetSummary,
  workoutTitle,
  firstSentence,
} from "../../src/domain/workout-display";
import { defaults, type WorkoutSet } from "../../src/domain/types";

// Phase 2 workout logger: header and dock, responsive set grid with inline
// RIR, exercise and workout menus, and Set Details.

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
  Object.assign(mockDims, { width: 393, fontScale: 1 });
  delete mockParams.id;
});

const program = programLibrary.find(
  (p) => p.id === "forge-strength-intermediate-3-day",
)!;

function enrolled() {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, restDay: 6 });
  const { id } = enrollProgram(fixture.r, program, "2026-10-19");
  return { ...fixture, enrollmentId: id };
}

async function chooseMenuItem(
  view: RenderResult,
  menu: string,
  item: string,
  sheet: string,
) {
  await fireEvent.press(view.getByLabelText(menu));
  await fireEvent.press(view.getByRole("menuitem", { name: item }));
  await waitFor(() =>
    expect(view.getByRole("header", { name: sheet })).toBeTruthy(),
  );
}

// Target lines carry invisible word joiners so ranges never wrap mid-way;
// match the visible text.
const visible = (s: string) =>
  s
    .replace(/\u2060/g, "")
    .replace(/\s+/g, " ")
    .trim();
test("curated program workouts open on a compact header, the target line and inline RIR", async () => {
  const { r, db, enrollmentId } = enrolled();
  try {
    const workout = startProgramSession(r, enrollmentId);
    const row = r.workoutExercises(workout.id)[0]!;
    const item = program.phases[0]!.sessions[0]!.exercises[0]!;
    const advice = programExerciseAdvice(r, workout.id, row.exerciseId)!;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    // Header: back, the workout's name, the clock and one menu. No slogans.
    // The header leads with the session; the full name stays in the menu.
    expect(
      view.getByRole("header", { name: workoutTitle(workout.name) }),
    ).toBeTruthy();
    expect(view.getByLabelText("Back to training")).toBeTruthy();
    expect(view.getByLabelText(/^Elapsed time \d+ minutes$/)).toBeTruthy();
    expect(view.getByLabelText("Workout options")).toBeTruthy();
    expect(view.queryByText("Your session.")).toBeNull();
    expect(view.queryByText("Session details")).toBeNull();
    // Dock: rest timer and the single primary action.
    expect(view.getByLabelText("Start rest")).toBeTruthy();
    expect(view.getByRole("button", { name: "Finish workout" })).toBeTruthy();
    // Keyboard toolbar for numeric pads.
    expect(view.getByLabelText("Next")).toBeTruthy();
    expect(view.getByLabelText("Done")).toBeTruthy();
    // One target line: sets, reps, RIR and rest.
    expect(
      view.getAllByText(
        targetSummary({
          target: row.target,
          item,
          rir: advice.advice.rir,
          rest: row.rest,
          workingSets: item.sets,
        }),
        { normalizer: visible },
      ).length,
    ).toBeGreaterThan(0);
    expect(advice.advice.rir).toBeDefined();
    // First session: no load to suggest, only how to choose one.
    expect(
      view.getAllByText(/^Choose a starting load at \d(–\d)? RIR$/).length,
    ).toBeGreaterThan(0);
    // Inline RIR shows the target and saves to the existing rir field.
    const rir = view.getByLabelText("Set 1 RIR");
    const { min, max } = advice.advice.rir!;
    expect(rir.props.placeholder).toBe(
      min === max ? `${min}` : `${min}-${max}`,
    );
    // RIR keeps the Set Details rule (0–20, halves allowed); reps are whole.
    expect(rir.props.keyboardType).toBe("decimal-pad");
    expect(view.getByLabelText("Set 1 reps").props.keyboardType).toBe(
      "number-pad",
    );
    expect(view.getByLabelText("Set 1 weight (kg)").props.keyboardType).toBe(
      "decimal-pad",
    );
    await fireEvent.changeText(rir, "2");
    expect(r.sets(row.id)[0]!.rir).toBe(2);
    await fireEvent.changeText(view.getByLabelText("Set 1 RIR"), "");
    expect(r.sets(row.id)[0]!.rir).toBeNull();
    // Out of range: kept as a draft, never saved, explained to VoiceOver.
    await fireEvent.changeText(view.getByLabelText("Set 1 RIR"), "25");
    expect(r.sets(row.id)[0]!.rir).toBeNull();
    expect(view.getByLabelText("Set 1 RIR").props.accessibilityHint).toBe(
      "Enter a number from 0 to 20",
    );
  } finally {
    db.close();
  }
}, 20_000);

test("an earned increase is offered inline and applied only to unfinished working sets", async () => {
  const { r, db, enrollmentId } = enrolled();
  try {
    // One week at the top of every range with effort logged.
    for (let i = 0; i < 3; i++) {
      const w = startProgramSession(r, enrollmentId);
      for (const row of r.workoutExercises(w.id))
        for (const s of r.sets(row.id))
          r.editSet(s.id, { weight: 100, reps: 100, rir: 3, completed: true });
      r.finishWorkout(w.id);
    }
    const next = startProgramSession(r, enrollmentId);
    const row = r.workoutExercises(next.id)[0]!;
    const advice = programExerciseAdvice(r, next.id, row.exerciseId)!.advice;
    expect(advice.action).toBe("increase");
    const [first] = r.sets(row.id);
    r.editSet(first!.id, { weight: 90, reps: 6, completed: true });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(
      <WorkoutExerciseCard row={row} initialExpanded />,
    );
    // The previous session is shown beside each set: a button that fills
    // the set while it is open, plain text once the set is done.
    expect(view.getAllByLabelText("Previous 100 kg × 100")).toHaveLength(1);
    expect(
      view.getAllByLabelText("Use previous 100 kilograms for 100 reps"),
    ).toHaveLength(r.sets(row.id).length - 1);
    expect(view.getByText(`Increase to ${advice.weight} kg`)).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(`Use suggested load ${advice.weight} kg`),
    );
    const sets = r.sets(row.id);
    expect(sets[0]!.weight).toBe(90);
    expect(sets.slice(1).every((s) => s.weight === advice.weight)).toBe(true);
    // Once applied, the suggestion no longer changes anything and hides.
    await view.rerender(<WorkoutExerciseCard row={row} initialExpanded />);
    expect(view.queryByText(`Increase to ${advice.weight} kg`)).toBeNull();
    // The Progression sheet leads with the action, load and a short reason;
    // the full reasoning and program rules are one tap further.
    await chooseMenuItem(
      view,
      `Options for ${r.exercise(row.exerciseId)!.name}`,
      "Progression",
      "Progression",
    );
    expect(view.getByText("Increase the load")).toBeTruthy();
    expect(view.getByText(`${advice.weight} kg`)).toBeTruthy();
    expect(view.getByText(firstSentence(advice.reason))).toBeTruthy();
    expect(
      view.getByRole("button", { name: "Apply suggested load" }),
    ).toBeTruthy();
    expect(view.queryByText(advice.reason)).toBeNull();
    expect(view.queryByText(program.progression)).toBeNull();
    await fireEvent.press(
      view.getByRole("button", {
        name: "How this is decided",
        expanded: false,
      }),
    );
    expect(view.getByText(advice.reason)).toBeTruthy();
    expect(view.getByText(program.progression)).toBeTruthy();
  } finally {
    db.close();
  }
}, 30_000);

// ---- Responsive set grid ----------------------------------------------------

// The column header is hidden from screen readers (every input carries its
// full label), so queries for it must include hidden elements.
const hidden = { includeHiddenElements: true };

const base: WorkoutSet = {
  id: "s1",
  exerciseRowId: "row",
  position: 0,
  weight: 62.5,
  reps: 8,
  duration: 0,
  distance: 0,
  rpe: null,
  rir: null,
  kind: "working",
  completed: false,
  rest: 120,
  tempo: "",
  notes: "",
  side: "both",
};
function gridRepo() {
  const repo = {
    profile: () => ({ ...defaults, onboarded: true }),
    sets: () => [base],
    editSet: jest.fn(),
    setSetting: jest.fn(),
  };
  jest
    .mocked(useRepo)
    .mockReturnValue(repo as unknown as ReturnType<typeof useRepo>);
  return repo;
}
const grid = (onDetails = jest.fn()) => (
  <SetGrid
    sets={[base, { ...base, id: "s2", position: 1 }]}
    category="strength"
    showRir
    previous={[{ ...base, weight: 60, completed: true }, undefined]}
    rirPlaceholder="2-3"
    order={0}
    onDetails={onDetails}
  />
);

test("standard and large iPhones show every column, including the previous set", async () => {
  gridRepo();
  for (const width of [393, 430]) {
    mockDims.width = width;
    const view = await render(grid());
    expect(view.getByText("Prev", hidden)).toBeTruthy();
    expect(view.getByText("60×8")).toBeTruthy();
    expect(
      view.getByLabelText("Use previous 60 kilograms for 8 reps"),
    ).toBeTruthy();
    expect(view.getByLabelText("No previous set")).toBeTruthy();
    expect(view.getByLabelText("Set 1 RIR")).toBeTruthy();
    await view.unmount();
  }
});

test("the narrowest iPhones move the previous set under the row instead of crushing columns", async () => {
  gridRepo();
  // First-generation iPhone SE width: every newer iPhone fits all six columns.
  mockDims.width = 320;
  const view = await render(grid());
  expect(view.queryByText("Prev", hidden)).toBeNull();
  expect(view.getByText("Set", hidden)).toBeTruthy();
  expect(view.getByText("RIR", hidden)).toBeTruthy();
  expect(view.getByText("Previous 60×8")).toBeTruthy();
  expect(
    view.getByLabelText("Use previous 60 kilograms for 8 reps"),
  ).toBeTruthy();
  for (const label of ["weight (kg)", "reps", "RIR"])
    expect(view.getByLabelText(`Set 1 ${label}`)).toBeTruthy();
});

test("large accessibility text stacks each set with labelled inputs", async () => {
  gridRepo();
  Object.assign(mockDims, { width: 320, fontScale: 1.2 });
  const view = await render(grid());
  // No column header: each input carries its own visible label.
  expect(view.queryByText("Set", hidden)).toBeNull();
  expect(view.getAllByText("kg")).toHaveLength(2);
  expect(view.getAllByText("Reps")).toHaveLength(2);
  expect(view.getAllByText("RIR")).toHaveLength(2);
  expect(
    view.getByLabelText("Use previous 60 kilograms for 8 reps"),
  ).toBeTruthy();
  // Numbers grow with Dynamic Type up to a cap that keeps them in the cell.
  expect(view.getByLabelText("Set 1 reps").props.maxFontSizeMultiplier).toBe(
    1.4,
  );
});

test("stepping through cells never rewrites a value, so lb weights cannot drift", async () => {
  const repo = gridRepo();
  repo.profile = () => ({ ...defaults, onboarded: true, units: "lb" });
  const view = await render(
    <SetRow set={{ ...base, weight: 102.5 }} category="strength" showRir />,
  );
  const weight = () => view.getByLabelText("Set 1 weight (lb)");
  expect(weight().props.value).toBe("225.97");
  // Focus and leave (as Next does) without typing: nothing is saved.
  await fireEvent(weight(), "focus");
  await fireEvent(weight(), "endEditing");
  for (const label of ["Set 1 reps", "Set 1 RIR"]) {
    await fireEvent(view.getByLabelText(label), "focus");
    await fireEvent(view.getByLabelText(label), "endEditing");
  }
  expect(repo.editSet).not.toHaveBeenCalled();
  // A load applied while the cell is focused shows at once and survives
  // leaving the cell.
  await fireEvent(weight(), "focus");
  await view.rerender(
    <SetRow set={{ ...base, weight: 105 }} category="strength" showRir />,
  );
  expect(weight().props.value).toBe("231.49");
  await fireEvent(weight(), "endEditing");
  expect(repo.editSet).not.toHaveBeenCalled();
  // Typed values are saved, converted from lb.
  await fireEvent(weight(), "focus");
  await fireEvent.changeText(weight(), "230");
  await fireEvent(weight(), "endEditing");
  expect(repo.editSet).toHaveBeenLastCalledWith("s1", {
    weight: expect.closeTo(104.326, 3),
  });
});

test("the set number opens Set Details and shows the set type", async () => {
  gridRepo();
  const onDetails = jest.fn();
  const view = await render(grid(onDetails));
  await fireEvent.press(view.getByLabelText("Set 2 details"));
  expect(onDetails).toHaveBeenCalledWith(expect.objectContaining({ id: "s2" }));
  await view.rerender(
    <SetGrid
      sets={[{ ...base, kind: "warmup", side: "left" }]}
      category="strength"
      showRir={false}
      previous={[undefined]}
      order={0}
      onDetails={onDetails}
    />,
  );
  expect(
    view.getByRole("button", {
      name: "Set 1 details",
      value: { text: "warm-up, left side" },
    }),
  ).toBeTruthy();
  expect(view.getByText("WL")).toBeTruthy();
});

test("Set Details keeps set type, side, RPE, RIR, rest, tempo, notes and removal", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Freestyle");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    const set = r.addSet(row.id, { weight: 60, reps: 8 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(
      <WorkoutExerciseCard row={row} initialExpanded />,
    );
    await fireEvent.press(view.getByLabelText("Set 1 details"));
    await fireEvent.press(view.getByRole("tab", { name: "Warm-up" }));
    await fireEvent.press(view.getByRole("tab", { name: "Left" }));
    await fireEvent.changeText(
      view.getByLabelText("RPE (1–10, optional)"),
      "8",
    );
    await fireEvent.changeText(
      view.getByLabelText("RIR (0–20, optional)"),
      "2",
    );
    await fireEvent.changeText(view.getByLabelText("Rest (seconds)"), "150");
    await fireEvent.changeText(
      view.getByLabelText("Tempo (e.g. 3-1-1-0)"),
      "3-1-1-0",
    );
    await fireEvent.changeText(view.getByLabelText("Set notes"), "Paused");
    expect(r.sets(row.id)[0]).toMatchObject({
      id: set.id,
      kind: "warmup",
      side: "left",
      rpe: 8,
      rir: 2,
      rest: 150,
      tempo: "3-1-1-0",
      notes: "Paused",
      weight: 60,
      reps: 8,
    });
    // Removal is destructive and confirmed.
    await fireEvent.press(view.getByRole("button", { name: "Remove set" }));
    expect(confirm).toHaveBeenCalledWith(
      "Remove set?",
      expect.any(String),
      expect.any(Function),
      { action: "Remove set" },
    );
    expect(r.sets(row.id)).toHaveLength(1);
    jest.mocked(confirm).mock.calls[0]![2]();
    expect(r.sets(row.id)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("the exercise menu keeps reordering, substitution, settings and removal", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Freestyle");
    const bench = r.addExercise(workout.id, "barbell-bench-press");
    r.addExercise(workout.id, "back-squat");
    r.addSet(bench.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const onReorder = jest.fn();
    const view = await render(
      <WorkoutExerciseCard
        row={bench}
        index={0}
        count={2}
        initialExpanded
        onReorder={onReorder}
      />,
    );
    const name = r.exercise(bench.exerciseId)!.name;
    await fireEvent.press(view.getByLabelText(`Options for ${name}`));
    const items = view
      .getAllByRole("menuitem")
      .map((i) => i.props.accessibilityLabel);
    // Reordering opens the reorder sheet instead of moving one step a time.
    expect(items).toEqual([
      "Reorder exercises",
      "Substitute exercise",
      "Notes, rest & superset",
      "Progression",
      "Remove exercise",
    ]);
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Reorder exercises" }),
    );
    await waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1));
    await chooseMenuItem(
      view,
      `Options for ${name}`,
      "Notes, rest & superset",
      "Exercise settings",
    );
    await fireEvent.changeText(
      view.getByLabelText("Exercise notes"),
      "Wide grip",
    );
    await fireEvent.changeText(
      view.getByLabelText("Superset / circuit group (shared label)"),
      "A",
    );
    await fireEvent.changeText(
      view.getByLabelText("Exercise default rest (seconds)"),
      "150",
    );
    expect(
      r.workoutExercises(workout.id).find((e) => e.id === bench.id),
    ).toMatchObject({ notes: "Wide grip", groupId: "A", rest: 150 });
    await fireEvent.press(view.getByLabelText("Close"));
    await chooseMenuItem(
      view,
      `Options for ${name}`,
      "Substitute exercise",
      "Choose your movement",
    );
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText(`Options for ${name}`));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Remove exercise" }),
    );
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "Remove exercise?",
        expect.any(String),
        expect.any(Function),
        { action: "Remove exercise" },
      ),
    );
  } finally {
    db.close();
  }
});

test("the workout menu keeps rename, notes, pause, default rest, templates and discard", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Freestyle");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    r.addSet(row.id, { weight: 60, reps: 8 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await chooseMenuItem(
      view,
      "Workout options",
      "Rename workout",
      "Rename workout",
    );
    await fireEvent.changeText(view.getByLabelText("Workout name"), "Push A");
    expect(r.workout(workout.id)!.name).toBe("Push A");
    await fireEvent.press(view.getByLabelText("Close"));
    await chooseMenuItem(
      view,
      "Workout options",
      "Workout notes",
      "Workout notes",
    );
    await fireEvent.changeText(
      view.getByLabelText("Workout notes"),
      "Felt strong",
    );
    expect(r.workout(workout.id)!.notes).toBe("Felt strong");
    await fireEvent.press(view.getByLabelText("Close"));
    await chooseMenuItem(
      view,
      "Workout options",
      "Default rest",
      "Default rest",
    );
    await fireEvent.changeText(
      view.getByLabelText("Default rest (seconds)"),
      "120",
    );
    expect(r.profile().rest).toBe(120);
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("Workout options"));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Pause workout" }),
    );
    await waitFor(() => expect(r.workout(workout.id)!.status).toBe("paused"));
    await chooseMenuItem(
      view,
      "Workout options",
      "Save as template",
      "Save as template",
    );
    expect(
      view.getByRole("button", { name: "Save as template", disabled: true }),
    ).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Template name"),
      "Push day",
    );
    await fireEvent.press(
      view.getByRole("button", { name: "Save as template" }),
    );
    expect(r.templates().map((t) => t.name)).toContain("Push day");
    // Discarding is destructive, listed last and confirmed.
    await fireEvent.press(view.getByLabelText("Workout options"));
    const items = view.getAllByRole("menuitem");
    expect(items.at(-1)!.props.accessibilityLabel).toBe("Discard workout");
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Discard workout" }),
    );
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "Discard this workout?",
        expect.any(String),
        expect.any(Function),
        { action: "Discard workout" },
      ),
    );
    expect(r.workout(workout.id)).toBeDefined();
  } finally {
    db.close();
  }
});

test("completed sessions open for review without the dock, and deletion stays confirmed", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Pull A");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    const set = r.addSet(row.id, { weight: 60, reps: 8 });
    r.editSet(set.id, { completed: true });
    r.finishWorkout(workout.id);
    // History opens a finished workout by id ("Review / edit").
    mockParams.id = workout.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByText(/^Completed \w+ \d+ · 480 kg$/)).toBeTruthy();
    expect(view.queryByLabelText("Finish workout")).toBeNull();
    expect(view.queryByLabelText("Start rest")).toBeNull();
    await fireEvent.press(view.getByLabelText("Workout options"));
    const items = view
      .getAllByRole("menuitem")
      .map((i) => i.props.accessibilityLabel);
    expect(items).not.toContain("Pause workout");
    expect(items.at(-1)).toBe("Delete session");
  } finally {
    db.close();
  }
});

test("while resting, the dock shows the countdown with +30 s and Skip", async () => {
  const setSetting = jest.fn();
  const deadline = Date.now() + 75_000;
  jest.mocked(useRepo).mockReturnValue({
    profile: () => ({ ...defaults, onboarded: true }),
    setting: () => String(deadline),
    setSetting,
  } as unknown as ReturnType<typeof useRepo>);
  const view = await render(<RestTimer />);
  expect(
    view.getByRole("timer", { name: /^Rest, 1:1\d remaining$/ }),
  ).toBeTruthy();
  expect(view.queryByLabelText("Start rest")).toBeNull();
  await fireEvent.press(view.getByLabelText("+30 sec"));
  const extended = Number(setSetting.mock.calls.at(-1)![1]);
  expect(extended - Date.now()).toBeGreaterThan(100_000);
  await fireEvent.press(view.getByLabelText("Skip"));
  expect(setSetting).toHaveBeenLastCalledWith("restDeadline", "0");
  expect(cancelRestNotification).toHaveBeenCalled();
});

test("a paused workout shows Resume in the dock beside the single primary Finish", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Freestyle");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    r.addSet(row.id, { weight: 60, reps: 8 });
    r.pauseWorkout(workout.id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByText(/^Paused · /)).toBeTruthy();
    // Resume replaces the rest timer while paused; it is tonal, not ember.
    expect(view.queryByLabelText("Start rest")).toBeNull();
    const resume = view.getByRole("button", { name: "Resume workout" });
    expect(StyleSheet.flatten(resume.props.style).backgroundColor).not.toBe(
      StyleSheet.flatten(
        view.getByRole("button", { name: "Finish workout" }).props.style,
      ).backgroundColor,
    );
    await fireEvent.press(resume);
    expect(r.workout(workout.id)!.status).toBe("active");
    await view.rerender(<WorkoutScreen />);
    expect(view.queryByRole("button", { name: "Resume workout" })).toBeNull();
    expect(view.getByLabelText("Start rest")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("reviewing a finished workout is read-only; editing never starts a rest timer", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Pull A");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    const [a, b] = [
      r.addSet(row.id, { weight: 60, reps: 8 }),
      r.addSet(row.id, { weight: 60, reps: 8 }),
    ];
    r.editSet(a.id, { completed: true });
    r.finishWorkout(workout.id);
    mockParams.id = workout.id;
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    // Review: values only; nothing to tap that changes history.
    expect(view.queryByLabelText("Complete set 2")).toBeNull();
    expect(view.getByLabelText("Set 2 not done")).toBeTruthy();
    // Editing unlocks the controls; completing a set still starts no rest.
    await fireEvent.press(view.getByLabelText("Edit workout"));
    await fireEvent.press(view.getByLabelText("Complete set 2"));
    expect(r.sets(row.id).find((s) => s.id === b.id)!.completed).toBe(true);
    expect(Number(r.setting("restDeadline") ?? 0)).toBe(0);
    expect(restNotification).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("completing a set in an active workout still starts rest", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Pull A");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    r.addSet(row.id, { weight: 60, reps: 8 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await fireEvent.press(view.getByLabelText("Complete set 1"));
    expect(Number(r.setting("restDeadline"))).toBeGreaterThan(Date.now());
    expect(restNotification).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
  }
});

test("Next walks weight, reps and RIR, then the next set and exercise", () => {
  const order = new SetFocusOrder();
  const focused: string[] = [];
  const input = (key: string) =>
    ({ focus: () => focused.push(key) }) as unknown as TextInputInstance;
  const register = (key: string, ...position: number[]) =>
    order.register(key, position, input(key));
  // Registered out of order, as rows mount.
  register("b1:weight", 1, 0, 0);
  register("a2:weight", 0, 1, 0);
  register("a1:rir", 0, 0, 2);
  register("a1:weight", 0, 0, 0);
  const remove = register("a1:reps", 0, 0, 1);
  order.focused("a1:weight");
  for (let i = 0; i < 4; i++) order.next(focused.at(-1) ?? "a1:weight");
  expect(focused).toEqual(["a1:reps", "a1:rir", "a2:weight", "b1:weight"]);
  // The last input has no next; unmounted inputs drop out of the order.
  expect(order.next("b1:weight")).toBe(false);
  remove();
  focused.length = 0;
  order.next("a1:weight");
  expect(focused).toEqual(["a1:rir"]);
});
