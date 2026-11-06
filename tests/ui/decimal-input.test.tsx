import React from "react";
import {
  render,
  fireEvent,
  type RenderResult,
} from "@testing-library/react-native";
import WorkoutScreen from "../../src/screens/Workout";
import WorkoutExerciseCard from "../../src/components/WorkoutExerciseCard";
import Templates from "../../app/templates";
import { parseNumber } from "../../src/components/ui";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { programLibrary } from "../../src/programs";
import { enrollProgram, startProgramSession } from "../../src/data/programs";
import { lbToKg } from "../../src/domain/metrics";

// Phase 7B WP4A, decision D4: the shared number parser accepts a comma as
// the decimal separator (comma-decimal regions). These are the WP2
// regression checks: every workout input keeps its rules, and "." input is
// unchanged.

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
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

beforeEach(() => jest.clearAllMocks());

/** Types a value one keystroke at a time, as on a phone keyboard. */
async function type(view: RenderResult, label: string, value: string) {
  const input = view.getByLabelText(label);
  await fireEvent(input, "focus");
  for (let i = 1; i <= value.length; i++)
    await fireEvent.changeText(input, value.slice(0, i));
  await fireEvent(input, "endEditing");
}
const round = (n: number) => Math.round(n * 1000) / 1000;

test("the parser reads one comma as a decimal point and keeps every rule", () => {
  expect(parseNumber("22,5", {})).toEqual({ value: 22.5 });
  expect(parseNumber("22.5", {})).toEqual({ value: 22.5 });
  expect(parseNumber("135", {})).toEqual({ value: 135 });
  expect(parseNumber(",5", {})).toEqual({ value: 0.5 });
  // Whole-number fields still refuse fractions, however they are written.
  expect(parseNumber("8,5", { integer: true })).toHaveProperty("error");
  expect(parseNumber("8.5", { integer: true })).toHaveProperty("error");
  expect(parseNumber("8", { integer: true })).toEqual({ value: 8 });
  // Optional fields still accept empty.
  expect(parseNumber("", { nullable: true })).toEqual({ value: null });
  expect(parseNumber("", {})).toHaveProperty("error");
  // Ambiguous text is never guessed at.
  expect(parseNumber("1.234,5", {})).toHaveProperty("error");
  expect(parseNumber("1,2,3", {})).toHaveProperty("error");
  expect(parseNumber("abc", {})).toHaveProperty("error");
  // Bounds are unchanged.
  expect(parseNumber("2000,5", { max: 2000 })).toHaveProperty("error");
  expect(parseNumber("-1,5", {})).toHaveProperty("error");
  expect(parseNumber("0,5", { min: 1, max: 10 })).toHaveProperty("error");
});

test("a comma-typed load is saved, copied forward and shown with a point", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    for (let i = 0; i < 3; i++) r.addSet(bench.id, { reps: 8 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await type(view, "Set 1 weight (kg)", "22,5");
    // WP2 copy-forward works the same with a comma.
    expect(r.sets(bench.id).map((s) => s.weight)).toEqual([22.5, 22.5, 22.5]);
    expect(r.sets(bench.id).map((s) => s.reps)).toEqual([8, 8, 8]);
    await view.rerender(<WorkoutScreen />);
    expect(view.getByLabelText("Set 1 weight (kg)").props.value).toBe("22.5");
    // A point still works exactly as before.
    await type(view, "Set 2 weight (kg)", "25.5");
    expect(r.sets(bench.id).map((s) => s.weight)).toEqual([22.5, 25.5, 25.5]);
  } finally {
    db.close();
  }
});

test("pounds typed with a comma convert like pounds typed with a point", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, units: "lb" });
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    r.addSet(bench.id, { reps: 5 });
    r.addSet(bench.id, { reps: 5 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await type(view, "Set 1 weight (lb)", "135,5");
    await type(view, "Set 2 weight (lb)", "135.5");
    const [a, b] = r.sets(bench.id).map((s) => round(s.weight));
    expect(a).toBe(round(lbToKg(135.5)));
    expect(b).toBe(a);
  } finally {
    db.close();
  }
});

test("reps stay whole numbers: a comma fraction is refused and nothing is saved", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    const w = r.startWorkout("Push");
    const bench = r.addExercise(w.id, "barbell-bench-press");
    r.addSet(bench.id, { reps: 8 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    await type(view, "Set 1 reps", "8,5");
    expect(r.sets(bench.id)[0]!.reps).toBe(8);
    await type(view, "Set 1 reps", "10");
    expect(r.sets(bench.id)[0]!.reps).toBe(10);
  } finally {
    db.close();
  }
});

test("inline RIR stays optional and bounded", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true, restDay: 6 });
    const program = programLibrary.find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    const { id } = enrollProgram(r, program, "2026-10-19");
    startProgramSession(r, id);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<WorkoutScreen />);
    const set = () => r.workoutSets(r.active()!.id)[0]!;
    await type(view, "Set 1 RIR", "2,5");
    expect(set().rir).toBe(2.5);
    await fireEvent.changeText(view.getByLabelText("Set 1 RIR"), "");
    expect(set().rir).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Set 1 RIR"), "20,5");
    expect(set().rir).toBeNull();
  } finally {
    db.close();
  }
});

test("Set Details: RPE, RIR and rest accept commas within their limits", async () => {
  const { r, db } = pathRepository();
  try {
    const workout = r.startWorkout("Freestyle");
    const row = r.addExercise(workout.id, "barbell-bench-press");
    r.addSet(row.id, { weight: 60, reps: 8 });
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(
      <WorkoutExerciseCard row={row} initialExpanded />,
    );
    await fireEvent.press(view.getByLabelText("Set 1 details"));
    await fireEvent.changeText(
      view.getByLabelText("RPE (1–10, optional)"),
      "8,5",
    );
    await fireEvent.changeText(
      view.getByLabelText("RIR (0–20, optional)"),
      "1,5",
    );
    await fireEvent.changeText(view.getByLabelText("Rest (seconds)"), "90,5");
    expect(r.sets(row.id)[0]).toMatchObject({ rpe: 8.5, rir: 1.5, rest: 90.5 });
    // Out of range is refused; empty clears the optional fields only.
    await fireEvent.changeText(
      view.getByLabelText("RPE (1–10, optional)"),
      "10,5",
    );
    await fireEvent.changeText(view.getByLabelText("RIR (0–20, optional)"), "");
    await fireEvent.changeText(view.getByLabelText("Rest (seconds)"), "");
    expect(r.sets(row.id)[0]).toMatchObject({
      rpe: 8.5,
      rir: null,
      rest: 90.5,
      weight: 60,
      reps: 8,
    });
  } finally {
    db.close();
  }
});

test("a template load typed with a comma is stored like one typed with a point", async () => {
  const { r, db } = pathRepository();
  try {
    r.saveProfile({ onboarded: true });
    r.saveTemplate("Push", [
      {
        exerciseId: "barbell-bench-press",
        sets: 3,
        reps: 5,
        weight: 60,
        rest: 120,
      },
    ]);
    jest.mocked(useRepo).mockReturnValue(r);
    const view = await render(<Templates />);
    await fireEvent.press(view.getByLabelText("Edit Push"));
    await fireEvent.press(view.getByLabelText("Barbell Bench Press"));
    await type(view, "Barbell Bench Press load (kg)", "62,5");
    await fireEvent.press(view.getByRole("button", { name: "Save template" }));
    expect(r.templates()[0]!.exercises[0]!.weight).toBe(62.5);
  } finally {
    db.close();
  }
});
