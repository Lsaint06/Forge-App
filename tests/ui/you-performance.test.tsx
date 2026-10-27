import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import You from "../../src/screens/You";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { summary } from "../../src/domain/metrics";
import { evaluate, type Goal } from "../../src/domain/goals";
import { goalSources } from "../../src/data/goal-sources";
import { nextTarget } from "../../src/screens/home/model";
import { weeksConsistent } from "../../src/domain/presentation/you";
import { theme } from "../../src/theme";

// Phase 7.5C: the performance strip, primary goal and My stats on You.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
let mockRevision = 0;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: mockRevision, profile: mockProfile }),
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
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../src/notifications", () => ({
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

type Repo = ReturnType<typeof pathRepository>["r"];
type View = Awaited<ReturnType<typeof render>>;
const today = localDate();
/** A completed workout, moved back `daysAgo` days. */
function finished(r: Repo, daysAgo = 0) {
  const w = r.startWorkout("Push day");
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { completed: true, weight: 50, reps: 5 });
  r.finishWorkout(w.id);
  if (daysAgo) {
    const end = Date.now() - daysAgo * 86400000;
    (r as unknown as { db: { run: (s: string, p: unknown[]) => void } }).db.run(
      "UPDATE workouts SET started_at=?, finished_at=? WHERE id=?",
      [end - 3000000, end, w.id],
    );
  }
  return w;
}
function setup(profile: Parameters<Repo["saveProfile"]>[0] = {}) {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const strip = (view: View) => within(view.getByTestId("you-performance"));
const goal = (view: View) => within(view.getByTestId("you-goal"));
const stats = (view: View) => within(view.getByTestId("you-stats"));
const goalJournal = { pathname: "/journal", params: { kind: "goal" } };
const weighIn = (r: Repo, kg: number, date = today) =>
  r.addJournal(
    "measurement",
    { name: "Bodyweight", value: kg, unit: "kg" },
    date,
  );

// ---- Performance strip -------------------------------------------------------------

test("strip: workouts, the shared streak and weeks consistent, from completed workouts", async () => {
  const { r, db } = setup();
  try {
    // Today, a week ago and two weeks ago: three consecutive calendar weeks.
    finished(r);
    finished(r, 7);
    finished(r, 14);
    // An unfinished workout is not counted.
    r.startWorkout("Leg day");
    const view = await render(<You />);
    const s = strip(view);
    expect(s.getByLabelText("Workouts completed: 3")).toBeTruthy();
    expect(s.getByLabelText("Day streak: 1")).toBeTruthy();
    expect(s.getByLabelText("Weeks consistent: 3")).toBeTruthy();
    // The same figures as the shared summary and the brand pill.
    const life = summary(r.workouts(), (id) => r.workoutSets(id));
    expect(life.count).toBe(3);
    expect(
      view.getByLabelText(`${life.streak} day streak. Open progress`),
    ).toBeTruthy();
    expect(weeksConsistent(r.workouts(), today)).toBe(3);
    // Training history is the strip's action.
    await fireEvent.press(s.getByRole("button", { name: "Training history" }));
    expect(router.push).toHaveBeenLastCalledWith("/history");
  } finally {
    db.close();
  }
});

test("strip: a fully missed week ends weeks consistent", async () => {
  const { r, db } = setup();
  try {
    // This week and last week; two weeks back has nothing; three weeks back.
    finished(r);
    finished(r, 7);
    finished(r, 21);
    const view = await render(<You />);
    expect(strip(view).getByLabelText("Weeks consistent: 2")).toBeTruthy();
    expect(strip(view).getByLabelText("Workouts completed: 3")).toBeTruthy();
  } finally {
    db.close();
  }
});

test("strip: no workouts is an invitation, not a row of zeros; no legacy snapshot", async () => {
  const { db } = setup();
  try {
    const view = await render(<You />);
    const s = strip(view);
    expect(s.getByText(/record starts with your first workout/)).toBeTruthy();
    expect(s.queryByLabelText(/: 0$/)).toBeNull();
    expect(s.getByRole("button", { name: "Training history" })).toBeTruthy();
    for (const legacy of [
      "Training snapshot",
      "Working sets",
      "Time trained",
      "View progress",
    ])
      expect(view.queryByText(legacy)).toBeNull();
  } finally {
    db.close();
  }
});

// ---- Primary goal ------------------------------------------------------------------

test("primary goal: Home's next target, with Goals' values, bar and percentage", async () => {
  const { r, db } = setup();
  try {
    finished(r);
    weighIn(r, 85);
    r.addJournal("goal", {
      name: "Bench 100",
      metric: "strength",
      exerciseId: "barbell-bench-press",
      target: 100,
      start: 80,
      reps: 1,
      goalRules: 2,
    });
    r.addJournal("goal", {
      name: "Cut to 80",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    const view = await render(<You />);
    const views = (r.journal("goal") as Goal[]).map((g) =>
      evaluate(g, goalSources(r, today, "kg")),
    );
    const home = nextTarget(views)!;
    expect(home.name).toBe("Cut to 80");
    const g = goal(view);
    expect(g.getByText("Primary goal")).toBeTruthy();
    expect(g.getByText("Cut to 80")).toBeTruthy();
    expect(g.queryByText("Bench 100")).toBeNull();
    expect(g.getByText("5 kg to go")).toBeTruthy();
    expect(g.getByText("85 kg")).toBeTruthy();
    expect(g.getByText("Target 80 kg")).toBeTruthy();
    // 90 → 80 kg, now 85 kg: Goals' own ratio.
    expect(
      g.getByLabelText("Cut to 80: 50% complete", {
        includeHiddenElements: true,
      }).props.accessibilityValue,
    ).toEqual({ min: 0, max: 100, now: 50 });
    expect(g.getByText("50% complete")).toBeTruthy();
    const card = view.getByRole("button", { name: "Primary goal: Cut to 80" });
    expect(card.props.accessibilityHint).toBe(`${home.spoken}. Opens goals`);
    await fireEvent.press(card);
    expect(router.push).toHaveBeenLastCalledWith(goalJournal);
  } finally {
    db.close();
  }
});

test("primary goal: a reached goal says so; a goal without a ratio has no bar", async () => {
  const reached = setup();
  try {
    weighIn(reached.r, 79);
    reached.r.addJournal("goal", {
      name: "Cut to 80",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    const view = await render(<You />);
    expect(goal(view).getByText("Target reached")).toBeTruthy();
    await view.unmount();
  } finally {
    reached.db.close();
  }
  const open = setup();
  try {
    // A goal from before the WP4D rules has no trusted start: a recorded
    // best, but no meaningful ratio.
    finished(open.r);
    open.r.addJournal("goal", {
      name: "Bench 100",
      metric: "strength",
      exerciseId: "barbell-bench-press",
      target: 100,
    });
    const view = await render(<You />);
    const g = goal(view);
    expect(g.getByText("Bench 100")).toBeTruthy();
    expect(g.getByText("Best 50 kg × 5")).toBeTruthy();
    expect(g.getByText("50 kg to go")).toBeTruthy();
    expect(g.queryByRole("progressbar")).toBeNull();
    expect(g.queryByText(/% complete$/)).toBeNull();
  } finally {
    open.db.close();
  }
});

test("primary goal: honest empty states, never an invented goal or 0%", async () => {
  const none = setup();
  try {
    // Achieved and archived goals are not the next target.
    none.r.addJournal("goal", {
      name: "Old cut",
      metric: "bodyweight",
      target: 80,
      start: 90,
      status: "achieved",
      goalRules: 2,
    });
    const view = await render(<You />);
    const g = goal(view);
    expect(g.queryByText("Old cut")).toBeNull();
    expect(g.queryByRole("progressbar")).toBeNull();
    expect(g.queryByText(/%/)).toBeNull();
    await fireEvent.press(g.getByRole("button", { name: "Set a goal" }));
    expect(router.push).toHaveBeenLastCalledWith(goalJournal);
    await view.unmount();
  } finally {
    none.db.close();
  }
  const waiting = setup();
  try {
    // An active goal with nothing recorded yet: point to Goals instead.
    waiting.r.addJournal("goal", {
      name: "Squat 200",
      metric: "strength",
      exerciseId: "back-squat",
      target: 200,
    });
    const view = await render(<You />);
    const g = goal(view);
    expect(g.queryByText("Squat 200")).toBeNull();
    expect(g.getByText(/once a goal has a recorded value/)).toBeTruthy();
    await fireEvent.press(g.getByRole("button", { name: "View goals" }));
    expect(router.push).toHaveBeenLastCalledWith(goalJournal);
  } finally {
    waiting.db.close();
  }
});

// ---- My stats ----------------------------------------------------------------------

test("my stats: the latest weigh-in and the saved height, with their sources", async () => {
  const { r, db } = setup({ height: 178, weight: 90 });
  try {
    weighIn(r, 83, "2020-01-01");
    weighIn(r, 82.4);
    const view = await render(<You />);
    const s = stats(view);
    expect(s.getByLabelText("Bodyweight: 82.4 kg. Logged today")).toBeTruthy();
    expect(s.getByLabelText("Height: 178 cm. From your profile")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Open measurements" }),
    );
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "measurement" },
    });
  } finally {
    db.close();
  }
});

test("my stats: pounds and feet and inches; the profile weight when nothing is logged", async () => {
  const { db } = setup({ units: "lb", height: 177.8, weight: 80 });
  try {
    const view = await render(<You />);
    const s = stats(view);
    expect(
      s.getByLabelText("Bodyweight: 176.4 lb. From your profile"),
    ).toBeTruthy();
    expect(
      s.getByLabelText("Height: 5 ft 10 in. From your profile"),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});

test("my stats: missing values say so, and body fat is never shown", async () => {
  const { r, db } = setup({ bodyFat: 18.5 });
  try {
    // A body fat measurement exists, but My stats doesn't show it.
    r.addJournal("measurement", {
      name: "Body fat",
      value: 18,
      unit: "percent",
    });
    const view = await render(<You />);
    const s = stats(view);
    expect(
      s.getByLabelText(
        "Bodyweight: Not logged. Log a weigh-in in Measurements",
      ),
    ).toBeTruthy();
    expect(
      s.getByLabelText("Height: Not set. Add it in Edit profile"),
    ).toBeTruthy();
    expect(view.queryAllByText(/body fat/i)).toHaveLength(0);
    expect(view.queryAllByLabelText(/body fat/i)).toHaveLength(0);
  } finally {
    db.close();
  }
});

// ---- Composition and regressions ---------------------------------------------------

test("hierarchy: identity, plan, strip, primary goal, My stats, then settings", async () => {
  const { r, db } = setup({ name: "Alex Carter" });
  try {
    finished(r);
    const view = await render(<You />);
    const order = [
      "you-identity",
      "you-plan",
      "you-performance",
      "you-goal",
      "you-stats",
      // 7.5D: one Tools & settings card ends the tab.
      "you-tools",
    ];
    const seen: string[] = [];
    for (const n of view.container.queryAll((n) =>
      order.includes(n.props.testID as string),
    ))
      if (!seen.includes(n.props.testID as string))
        seen.push(n.props.testID as string);
    expect(seen).toEqual(order);
    // The approved identity is still there, and settings are one tap away.
    expect(view.getByRole("header", { name: "Alex Carter" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Edit profile" })).toBeTruthy();
    for (const label of [
      "Body measurements",
      "Goals",
      "Preferences",
      "Account & privacy",
    ])
      expect(view.getByLabelText(label)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("compact screens, large text and light mode", async () => {
  const { r, db } = setup({ height: 178 });
  try {
    finished(r);
    weighIn(r, 85);
    r.addJournal("goal", {
      name: "A long goal name that needs two lines on a compact phone",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(<You />);
    // The goal's values move under its name rather than squeezing it.
    expect(
      StyleSheet.flatten(view.getByTestId("you-goal-row").props.style)
        .flexDirection,
    ).toBe("column");
    const name = goal(view).getByText(
      "A long goal name that needs two lines on a compact phone",
    );
    expect(name.props.numberOfLines).toBe(2);
    // Numbers shrink slightly to fit rather than truncate.
    const workouts = within(
      strip(view).getByLabelText("Workout completed: 1"),
    ).getByText("1");
    expect(workouts.props.adjustsFontSizeToFit).toBe(true);
    // Light palette.
    expect(StyleSheet.flatten(name.props.style).color).toBe(
      theme.palettes.light.text,
    );
    expect(
      StyleSheet.flatten(goal(view).getByText("Primary goal").props.style)
        .color,
    ).toBe(theme.palettes.light.emberHot);
    // The Measurements link is a comfortable target.
    const link = view.getByRole("button", { name: "Open measurements" });
    const slop = link.props.hitSlop as { top: number; bottom: number };
    expect(
      Number(StyleSheet.flatten(link.props.style).minHeight) +
        slop.top +
        slop.bottom,
    ).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});

test("memoised figures refresh when stored data changes", async () => {
  const { r, db } = setup();
  try {
    const view = await render(<You />);
    expect(goal(view).getByRole("button", { name: "Set a goal" })).toBeTruthy();
    // A workout, a weigh-in and a goal are saved; the store's revision moves.
    finished(r);
    weighIn(r, 85);
    r.addJournal("goal", {
      name: "Cut to 80",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    mockRevision++;
    await view.rerender(<You />);
    expect(strip(view).getByLabelText("Workout completed: 1")).toBeTruthy();
    expect(strip(view).getByLabelText("Week consistent: 1")).toBeTruthy();
    expect(view.getByLabelText("1 day streak. Open progress")).toBeTruthy();
    expect(goal(view).getByText("Cut to 80")).toBeTruthy();
    expect(
      stats(view).getByLabelText("Bodyweight: 85 kg. Logged today"),
    ).toBeTruthy();
  } finally {
    db.close();
  }
});
