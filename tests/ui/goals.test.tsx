import React from "react";
import { Alert } from "react-native";
import {
  render,
  fireEvent,
  act,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
// Lets a test fire one handler twice within a single frame.
import { findEventHandler } from "@testing-library/react-native/dist/events/propagation";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";

// Phase 7B WP4D: the Goals screen, its type-first sheet, detail, achievements
// and past goals. All six goal types stay creatable.

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
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ kind: "goal" }),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

type AlertButton = { text: string; onPress?: () => void };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const pressAlert = (title: string, button: string) => {
  const call = alert.mock.calls.filter(([t]) => t === title).at(-1);
  if (!call) throw new Error(`No "${title}" alert`);
  (call[2] as AlertButton[]).find((b) => b.text === button)!.onPress?.();
};
beforeEach(() => jest.clearAllMocks());

const today = localDate();
const DAY = 86_400_000;
type Repo = ReturnType<typeof pathRepository>["r"];
type Db = ReturnType<typeof pathRepository>["db"];
function setup(profile: Parameters<Repo["saveProfile"]>[0] = {}) {
  const fixture = pathRepository();
  fixture.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(fixture.r);
  return fixture;
}
const hidden = { includeHiddenElements: true };
// Progress bars (the shared ProgressBar is a labelled, non-focusable view).
const bars = (view: RenderResult, name: string) =>
  view
    .queryAllByLabelText(name, hidden)
    .filter((n) => n.props.accessibilityRole === "progressbar");
const goals = (r: Repo) => r.journal("goal");
const weigh = (r: Repo, kg: number, date: string) =>
  r.addJournal(
    "measurement",
    { name: "Bodyweight", value: kg, unit: "kg" },
    date,
  );
function bench(r: Repo, db: Db, kg: number, reps: number, daysAgo: number) {
  const w = r.startWorkout("Upper");
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { weight: kg, reps, completed: true });
  r.finishWorkout(w.id);
  const end = Date.now() - daysAgo * DAY;
  db.prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?").run(
    end - 3_600_000,
    end,
    w.id,
  );
}
async function pressTwiceInOneFrame(view: RenderResult, label: string) {
  const { handler } = findEventHandler(view.getByLabelText(label), "press", {
    bubbles: true,
  });
  await act(async () => {
    handler!({ nativeEvent: {} });
    handler!({ nativeEvent: {} });
  });
}
const newGoal = async (view: RenderResult, type: string) => {
  await fireEvent.press(view.getByRole("button", { name: "New goal" }));
  await fireEvent.press(view.getByRole("radio", { name: type }));
};

test("every one of the six goal types can still be created", async () => {
  const { r, db } = setup({ frequency: 4 });
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Set a goal you can measure")).toBeTruthy();
    await newGoal(view, "Workouts per week");
    await fireEvent.press(view.getByLabelText("Save goal"));
    await newGoal(view, "Training volume");
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "50000");
    await fireEvent.press(view.getByLabelText("Save goal"));
    await newGoal(view, "Session length");
    await fireEvent.changeText(view.getByLabelText("Target (minutes)"), "60");
    await fireEvent.press(view.getByLabelText("Save goal"));
    expect(view.getByText("Choose at least or at most")).toBeTruthy();
    await fireEvent.press(view.getByRole("radio", { name: "At most" }));
    await fireEvent.press(view.getByLabelText("Save goal"));
    await newGoal(view, "Daily calories");
    await fireEvent.changeText(
      view.getByLabelText("Target (kcal a day)"),
      "2500",
    );
    await fireEvent.press(view.getByRole("radio", { name: "At least" }));
    await fireEvent.press(view.getByLabelText("Save goal"));
    await newGoal(view, "Bodyweight");
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "80");
    await fireEvent.changeText(
      view.getByLabelText("Starting weight (kg)"),
      "84",
    );
    await fireEvent.press(view.getByLabelText("Save goal"));
    await newGoal(view, "Lift");
    await fireEvent.press(
      view.getByLabelText("Exercise, not chosen. Choose exercise"),
    );
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "barbell bench",
    );
    await fireEvent.press(view.getByLabelText("Choose Barbell Bench Press"));
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "100");
    await fireEvent.press(view.getByLabelText("Save goal"));
    const saved = goals(r).map((g) => g.data);
    expect(saved.map((d) => d.metric).sort()).toEqual([
      "bodyweight",
      "duration",
      "nutrition",
      "strength",
      "volume",
      "workouts",
    ]);
    expect(saved.every((d) => d.goalRules === 2)).toBe(true);
    expect(saved.find((d) => d.metric === "workouts")).toEqual({
      name: "Train 4× a week",
      metric: "workouts",
      target: 4,
      goalRules: 2,
    });
    expect(saved.find((d) => d.metric === "duration")!.direction).toBe(
      "atMost",
    );
    expect(saved.find((d) => d.metric === "strength")).toMatchObject({
      exerciseId: "barbell-bench-press",
      start: 0,
      name: "Barbell Bench Press 100 kg",
    });
    expect(view.getByText("Active")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("a pound user sets a bodyweight goal in pounds; it saves once and can be undone", async () => {
  const { r, db } = setup({ units: "lb" });
  try {
    weigh(r, 82, addDays(today, -2));
    const view = await render(<JournalScreen />);
    await newGoal(view, "Bodyweight");
    // The starting weight comes from the latest weigh-in, in pounds.
    expect(view.getByLabelText("Starting weight (lb)").props.value).toBe(
      "180.78",
    );
    await fireEvent.changeText(view.getByLabelText("Target (lb)"), "175,5");
    expect(view.getByText(/Lose 5\.3 lb/)).toBeTruthy();
    await pressTwiceInOneFrame(view, "Save goal");
    expect(goals(r)).toHaveLength(1);
    const g = goals(r)[0]!;
    expect(Number(g.data.target)).toBeCloseTo(79.6055, 3);
    expect(g.data.name).toBe("Reach 175.5 lb");
    expect(view.getByText("Target 175.5 lb", hidden)).toBeTruthy();
    expect(view.queryByText(/ kg/, hidden)).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(goals(r)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test("errors are plain sentences and nothing is saved", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByRole("button", { name: "New goal" }));
    await fireEvent.press(view.getByLabelText("Save goal"));
    expect(view.getByText("Choose what kind of goal this is")).toBeTruthy();
    await fireEvent.press(view.getByRole("radio", { name: "Bodyweight" }));
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "80");
    await fireEvent.press(view.getByLabelText("Save goal"));
    expect(view.getByText("Enter your starting weight")).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText("Starting weight (kg)"),
      "80",
    );
    await fireEvent.press(view.getByLabelText("Save goal"));
    expect(
      view.getByText(
        "Your target is your starting weight. Choose a different target.",
      ),
    ).toBeTruthy();
    expect(goals(r)).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test("a lift already done before the goal asks first and says so, with the real date", async () => {
  const { r, db } = setup();
  try {
    bench(r, db, 102.5, 3, 10);
    const view = await render(<JournalScreen />);
    await newGoal(view, "Lift");
    await fireEvent.press(
      view.getByLabelText("Exercise, not chosen. Choose exercise"),
    );
    await fireEvent.changeText(
      view.getByLabelText("Search exercises"),
      "barbell bench",
    );
    await fireEvent.press(view.getByLabelText("Choose Barbell Bench Press"));
    expect(view.getByText(/^Your best: 102\.5 kg × 3/)).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "100");
    await fireEvent.press(view.getByLabelText("Save goal"));
    expect(alert.mock.calls.at(-1)![1]).toMatch(
      /You've already lifted 102\.5 kg, before this goal/,
    );
    expect(goals(r)).toHaveLength(0);
    await act(async () => pressAlert("Check this goal", "Save anyway"));
    expect(goals(r)).toHaveLength(1);
    expect(
      view.getByText("Already lifted before this goal was set", hidden),
    ).toBeTruthy();
    // Confirming keeps the real workout day, not today.
    await fireEvent.press(view.getByLabelText(/^Mark .* as achieved$/));
    expect(view.getByText(/^Marked .* as achieved$/)).toBeTruthy();
    await view.unmount();
    const g = goals(r)[0]!;
    expect(g.data.status).toBe("achieved");
    expect(g.data.achievedOn).toBe(addDays(today, -10));
    expect(g.data.achievedValue).toBe(102.5);
    expect(Math.abs(Number(g.data.confirmedAt) - Date.now())).toBeLessThan(
      60_000,
    );
  } finally {
    db.close();
  }
});

test("Mark as achieved can be undone; once written it never changes", async () => {
  const { r, db } = setup();
  try {
    weigh(r, 79.5, addDays(today, -3));
    r.addJournal(
      "goal",
      { name: "Cut to 80", metric: "bodyweight", start: 84, target: 80 },
      addDays(today, -30),
    );
    const view = await render(<JournalScreen />);
    expect(view.getByText("Target reached", hidden)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Mark Cut to 80 as achieved"));
    // Held back for Undo: nothing written yet.
    expect(goals(r)[0]!.data.status).toBeUndefined();
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(view.getByLabelText("Mark Cut to 80 as achieved")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Mark Cut to 80 as achieved"));
    await view.unmount();
    const done = goals(r)[0]!;
    expect(done.data).toMatchObject({
      status: "achieved",
      achievedOn: addDays(today, -3),
      achievedValue: 79.5,
    });
    // Later weigh-ins don't change it.
    weigh(r, 82, today);
    const again = await render(<JournalScreen />);
    await fireEvent.press(
      again.getByRole("button", { name: "Show past goals" }),
    );
    expect(
      again.getByLabelText(/^Cut to 80\. .*Achieved .* · 79\.5 kg/),
    ).toBeTruthy();
    expect(goals(r)[0]!.data).toEqual(done.data);
  } finally {
    db.close();
  }
});

test("an untouched edit writes nothing; legacy goals change meaning only on request", async () => {
  const { r, db } = setup();
  try {
    const legacy = r.addJournal(
      "goal",
      {
        name: "Eat 2500",
        metric: "nutrition",
        target: 2500,
        start: 84.2,
        exerciseId: "",
        notes: "",
      },
      addDays(today, -5),
    );
    r.addJournal(
      "nutrition",
      {
        name: "Oats",
        calories: 600,
        protein: 20,
        carbs: 90,
        fat: 10,
        quantity: 1,
        meal: "Breakfast",
      },
      today,
    );
    const outbox = r.outbox().length;
    const view = await render(<JournalScreen />);
    expect(view.getByText("Today's calories", hidden)).toBeTruthy();
    expect(view.getByText("600 kcal logged today", hidden)).toBeTruthy();
    expect(bars(view, "Eat 2500")).toHaveLength(0);
    await fireEvent.press(view.getByLabelText(/^Eat 2500\. Today's calories/));
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    await fireEvent.press(view.getByLabelText("Save changes"));
    expect(goals(r)[0]).toEqual(legacy);
    expect(r.outbox()).toHaveLength(outbox);
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    await fireEvent(
      view.getByLabelText("Use the new measurement"),
      "valueChange",
      true,
    );
    await fireEvent.press(view.getByRole("radio", { name: "At least" }));
    await fireEvent.press(view.getByLabelText("Save changes"));
    expect(goals(r)[0]!.data).toEqual({
      ...legacy.data,
      goalRules: 2,
      direction: "atLeast",
    });
    expect(view.getByText("Daily calories · at least", hidden)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("archive, restore and delete with Undo keep goals intact", async () => {
  const { r, db } = setup();
  try {
    const g = r.addJournal(
      "goal",
      { name: "Train 3×", metric: "workouts", target: 3 },
      today,
    );
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Train 3×\. /));
    await fireEvent.press(view.getByRole("button", { name: "Archive" }));
    expect(goals(r)[0]!.data.status).toBe("archived");
    await fireEvent.press(view.getByRole("button", { name: "Restore" }));
    expect(goals(r)[0]!.data).toEqual(g.data);
    await fireEvent.press(view.getByRole("button", { name: "Delete" }));
    await act(async () => pressAlert("Delete goal?", "Delete"));
    expect(view.getByText("Deleted Train 3×")).toBeTruthy();
    expect(goals(r)).toHaveLength(1);
    await fireEvent.press(view.getByRole("button", { name: "Undo" }));
    expect(view.getByLabelText(/^Train 3×\. /)).toBeTruthy();
    expect(goals(r)[0]).toEqual({ ...g, updatedAt: goals(r)[0]!.updatedAt });
    await waitFor(() => expect(view.getByText("Active")).toBeTruthy());
  } finally {
    db.close();
  }
});

test("cards describe values with units, dates and basis; no raw errors anywhere", async () => {
  const { r, db } = setup();
  try {
    weigh(r, 82, addDays(today, -1));
    r.addJournal(
      "goal",
      { name: "Reach 80", metric: "bodyweight", start: 84, target: 80 },
      addDays(today, -20),
    );
    r.addJournal(
      "goal",
      { name: "Squat", metric: "strength", target: 160, exerciseId: "squat" },
      today,
    );
    const view = await render(<JournalScreen />);
    expect(bars(view, "Reach 80")).toHaveLength(1);
    expect(bars(view, "Reach 80")[0]!.props.accessibilityValue.now).toBe(50);
    expect(bars(view, "Squat")).toHaveLength(0);
    const card = view.getByLabelText(/^Reach 80\. /);
    expect(card.props.accessibilityLabel).toBe(
      "Reach 80. Bodyweight · lose. 82 kg · Yesterday. Target 80 kg. 50 percent. 2 kg to go",
    );
    expect(
      view.getByText(
        "Exercise not found (squat). Edit the goal to choose an exercise.",
        hidden,
      ),
    ).toBeTruthy();
    expect(view.queryByText(/[{}]|"code"|NaN|undefined/, hidden)).toBeNull();
  } finally {
    db.close();
  }
});
