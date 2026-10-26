import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Progress from "../../app/(tabs)/progress";
import Records from "../../src/screens/Records";
import TrainingCalendar from "../../src/screens/TrainingCalendar";
import ExerciseScreen from "../../app/exercise";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { mondayOf } from "../../src/domain/progress/range";
import { lbToKg } from "../../src/domain/metrics";
import { libraryPrograms } from "../../src/programs";
import { enrollProgram, startProgramSession } from "../../src/data/programs";
import { dayLabel } from "../../src/domain/training-display";

// Phase 5: the Progress dashboard, records and the training calendar,
// rendered from a real repository.

const mockParams: { id?: string } = {};
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { profile: undefined; revision: number }) => unknown) =>
      selector({ profile: undefined, revision: 0 }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.id;
});

type Fixture = ReturnType<typeof pathRepository>;
const today = localDate();
const at = (date: string) => new Date(`${date}T18:00:00`).getTime();
function logWorkout(
  { r, db }: Fixture,
  date: string,
  exercises: [string, [number, number][]][],
  name = `Session ${date}`,
) {
  const w = r.startWorkout(name);
  for (const [exerciseId, sets] of exercises) {
    const row = r.addExercise(w.id, exerciseId);
    for (const [weight, reps] of sets)
      r.editSet(r.addSet(row.id).id, { weight, reps, completed: true });
  }
  r.finishWorkout(w.id);
  db.prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?").run(
    at(date) - 3000000,
    at(date),
    w.id,
  );
  return w;
}
// Eight weeks: bench every Tuesday, adding 2.5 kg a week; squat every other
// week at the same load; overhead press on Thursdays. The latest Tuesday is
// always 1–7 days ago, so every session is in the past whatever the weekday
// or hour (anchoring on this week's Monday dropped the latest session when
// the suite ran on a Monday).
function history(f: Fixture) {
  const lastWeek = mondayOf(addDays(today, -2));
  for (let week = 7; week >= 0; week--) {
    const monday = addDays(lastWeek, -week * 7);
    const load = 100 + (7 - week) * 2.5;
    logWorkout(f, addDays(monday, 1), [
      [
        "barbell-bench-press",
        [
          [load, 5],
          [load, 5],
        ],
      ],
      ...(week % 2 === 0
        ? ([["back-squat", [[140, 5]]]] as [string, [number, number][]][])
        : []),
    ]);
    if (week > 0)
      logWorkout(f, addDays(monday, 3), [["overhead-press", [[50, 8]]]]);
  }
}

test("a brand-new lifter sees one clear first step, not empty charts", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ onboarded: true });
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(
      view.getByRole("header", { name: "Your progress starts here" }),
    ).toBeTruthy();
    expect(view.queryByRole("adjustable")).toBeNull();
    expect(view.queryByText("Workouts")).toBeNull();
    await fireEvent.press(view.getByLabelText("Start a workout"));
    expect(router.navigate).toHaveBeenCalledWith("/(tabs)");
    // History, calendar and journals stay reachable.
    for (const label of [
      "Training history",
      "Training calendar",
      "Body measurements",
      "Nutrition",
      "Recovery",
      "Goals",
    ])
      expect(view.getByLabelText(label)).toBeTruthy();
    // Phase 7.1A: Nutrition is a tab; the row switches to it.
    await fireEvent.press(view.getByLabelText("Nutrition"));
    expect(router.navigate).toHaveBeenLastCalledWith({
      pathname: "/(tabs)/nutrition",
      params: { day: "today" },
    });
  } finally {
    f.db.close();
  }
});

test("one workout shows a baseline, with no fake trend or records", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, today, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.getByLabelText("Workouts: 1")).toBeTruthy();
    expect(view.getByLabelText("Records: 0")).toBeTruthy();
    expect(view.getByLabelText("Active weeks: 1/12")).toBeTruthy();
    expect(
      view.getByText("First session: this sets your baseline"),
    ).toBeTruthy();
    expect(
      view.getByText("Your trend line appears after your next session."),
    ).toBeTruthy();
    expect(view.getByText("No new records in this range")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("several weeks of history: overview, ranges, exercise choice, comparisons and records", async () => {
  const f = pathRepository();
  try {
    history(f);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const workouts = f.r.workouts().length;
    expect(view.getByLabelText(`Workouts: ${workouts}`)).toBeTruthy();
    expect(view.getByLabelText("Workouts by week")).toBeTruthy();
    // The heaviest main lift with a trend opens first.
    expect(
      view.getByLabelText("Exercise: Back Squat. Change exercise"),
    ).toBeTruthy();
    // Same weight and reps each time: no change, stated plainly.
    expect(view.getByText("±0 kg at 5 reps")).toBeTruthy();
    expect(view.getAllByText(/^Heaviest set · \d/).length).toBeGreaterThan(0);
    // Switching to 4 weeks narrows the counts.
    await fireEvent.press(view.getByLabelText("4 weeks"));
    const recent = f.r
      .workouts()
      .filter(
        (w) => localDate(w.finishedAt!) >= addDays(mondayOf(today), -21),
      ).length;
    expect(view.getByLabelText(`Workouts: ${recent}`)).toBeTruthy();
    // Choose another exercise.
    await fireEvent.press(
      view.getByLabelText("Exercise: Back Squat. Change exercise"),
    );
    expect(
      view.getByRole("header", { name: "Choose an exercise" }),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Barbell Bench Press"));
    expect(
      view.getByLabelText("Exercise: Barbell Bench Press. Change exercise"),
    ).toBeTruthy();
    // Same reps, 2.5 kg heavier than last time.
    expect(view.getByText("+2.5 kg at 5 reps")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Heaviest set"));
    expect(
      view.getByLabelText(/^Barbell Bench Press, heaviest set by session/),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Barbell Bench Press details"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/exercise",
      params: { id: "barbell-bench-press" },
    });
    await fireEvent.press(view.getByLabelText("All records"));
    expect(router.push).toHaveBeenLastCalledWith("/records");
    await fireEvent.press(view.getByLabelText("Training calendar"));
    expect(router.push).toHaveBeenLastCalledWith("/calendar");
  } finally {
    f.db.close();
  }
});

test("a fully trained program week reads as 100% on plan", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ restDay: 6 });
    const program = libraryPrograms().find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    const lastMonday = addDays(mondayOf(today), -7);
    const { id } = enrollProgram(f.r, program, lastMonday);
    for (const d of [0, 2, 4]) {
      const w = startProgramSession(f.r, id);
      for (const s of f.r.workoutSets(w.id))
        f.r.editSet(s.id, { completed: true, weight: 60, reps: 5 });
      f.r.finishWorkout(w.id);
      f.db
        .prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?")
        .run(
          at(addDays(lastMonday, d)) - 3000000,
          at(addDays(lastMonday, d)),
          w.id,
        );
    }
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.getByLabelText("On plan: 100%, 3 of 3 sessions")).toBeTruthy();
    expect(view.getByText("3 of 3 planned sessions done")).toBeTruthy();
    expect(view.getByText("Planned")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("weights follow the lifter's units", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    logWorkout(f, addDays(today, -3), [
      ["barbell-bench-press", [[lbToKg(225), 5]]],
    ]);
    logWorkout(f, today, [["barbell-bench-press", [[lbToKg(230), 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.getByText("230 lb × 5")).toBeTruthy();
    expect(view.getByText("+5 lb at 5 reps")).toBeTruthy();
    expect(view.getByText("Heaviest set · 230 lb × 5")).toBeTruthy();
    expect(view.queryByText(/ kg/)).toBeNull();
  } finally {
    f.db.close();
  }
});

test("lifetime milestones stay available whatever the range", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, addDays(today, -60), [["barbell-bench-press", [[100, 5]]]]);
    logWorkout(f, addDays(today, -57), [["barbell-bench-press", [[105, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    await fireEvent.press(view.getByLabelText("4 weeks"));
    expect(view.getByLabelText("Records: 0")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Milestones"));
    expect(view.getByText("New territory · first PR")).toBeTruthy();
    expect(view.getByText("First spark")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("explanations open as information sheets", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, today, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    await fireEvent.press(view.getByLabelText("How strength is measured"));
    expect(view.getByText(/Epley formula/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Close"));
    await fireEvent.press(view.getByLabelText("How records work"));
    expect(
      view.getByText(/first session with an exercise sets the baseline/),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("Records lists recent records and every exercise's bests", async () => {
  const f = pathRepository();
  try {
    history(f);
    logWorkout(f, addDays(today, -1), [["pull-up", [[0, 8]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Records />);
    expect(view.getByText("Recent records")).toBeTruthy();
    expect(view.getAllByText("Barbell Bench Press").length).toBeGreaterThan(1);
    expect(view.getByText(/^Heaviest 117.5 kg × 5 · Est. 1RM /)).toBeTruthy();
    expect(view.getByText("Most reps 8")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back Squat"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/exercise",
      params: { id: "back-squat" },
    });
    await fireEvent.press(view.getByLabelText("How records work"));
    expect(view.getByText(/recalculated from your history/)).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("Records has an encouraging empty state", async () => {
  const f = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Records />);
    expect(view.getByText("No records yet")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("the calendar marks days and opens a day's workouts", async () => {
  const f = pathRepository();
  try {
    const w = logWorkout(
      f,
      today,
      [["barbell-bench-press", [[100, 5]]]],
      "Push",
    );
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<TrainingCalendar />);
    expect(
      view.getByLabelText(`${dayLabel(today)}, today: workout completed`),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Review Push"));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: w.id },
    });
    // A day without a plan or workout is a rest day, not a failure.
    const other = addDays(today, today.endsWith("01") ? 1 : -1);
    await fireEvent.press(view.getByLabelText(`${dayLabel(other)}: rest day`));
    expect(view.getByText("Rest day")).toBeTruthy();
    // Months ahead can be checked for plans; no earlier months without training.
    expect(view.queryByLabelText("Previous month")).toBeNull();
    await fireEvent.press(view.getByLabelText("Next month"));
    await waitFor(() =>
      expect(view.getByLabelText("Previous month")).toBeTruthy(),
    );
  } finally {
    f.db.close();
  }
});

test("the exercise screen shows records in the lifter's units and reps for bodyweight work", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    logWorkout(f, addDays(today, -2), [
      ["barbell-bench-press", [[lbToKg(225), 5]]],
    ]);
    logWorkout(f, today, [["pull-up", [[0, 9]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    mockParams.id = "barbell-bench-press";
    const bench = await render(<ExerciseScreen />);
    expect(bench.getByLabelText(/Heaviest set: 225 lb × 5/)).toBeTruthy();
    expect(bench.getByLabelText(/Session 1: 225 lb × 5/)).toBeTruthy();
    expect(bench.queryByText(/ kg/)).toBeNull();
    await bench.unmount();
    mockParams.id = "pull-up";
    const pull = await render(<ExerciseScreen />);
    expect(pull.getByLabelText(/Most reps in a set: 9/)).toBeTruthy();
    expect(pull.queryByText(/Estimated 1RM/)).toBeNull();
  } finally {
    f.db.close();
  }
});
