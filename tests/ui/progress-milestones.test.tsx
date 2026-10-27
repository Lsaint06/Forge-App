import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import Progress from "../../app/(tabs)/progress";
import Records from "../../src/screens/Records";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";
import { evaluate, type Goal } from "../../src/domain/goals";
import { goalSources } from "../../src/data/goal-sources";
import { theme } from "../../src/theme";
import { nextGoals } from "../../src/domain/presentation/milestones";
import { nextTarget } from "../../src/screens/home/model";

// Phase 7.4F: Milestones and Next goals on Progress, the REFORGE Records
// screen and the More links.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { profile: unknown; revision: number }) => unknown) =>
      selector({ profile: mockProfile, revision: 0 }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

type Fixture = ReturnType<typeof pathRepository>;
type View = Awaited<ReturnType<typeof render>>;
const today = localDate();
const ago = (n: number) => addDays(today, -n);
function logWorkout(
  { r, db }: Fixture,
  daysAgo: number,
  exercises: [string, [number, number][]][],
) {
  const w = r.startWorkout(`Session ${daysAgo}`);
  for (const [exerciseId, sets] of exercises) {
    const row = r.addExercise(w.id, exerciseId);
    for (const [weight, reps] of sets)
      r.editSet(r.addSet(row.id).id, { weight, reps, completed: true });
  }
  r.finishWorkout(w.id);
  const end = new Date(`${ago(daysAgo)}T18:00:00`).getTime();
  db.prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?").run(
    end - 3000000,
    end,
    w.id,
  );
}
const card = (view: View, id: string) => within(view.getByTestId(id));
const seeAll = (view: View) =>
  view.getByLabelText(/^Milestones, \d of 5 earned\. See all$/);

test("milestones: earned tiles, the next one still ahead, and every one in See all", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const ms = card(view, "milestones-card");
    expect(seeAll(view).props.accessibilityLabel).toBe(
      "Milestones, 1 of 5 earned. See all",
    );
    expect(ms.getByLabelText("First spark, earned")).toBeTruthy();
    expect(
      ms.getByLabelText("Built a habit · 10 workouts, not yet earned"),
    ).toBeTruthy();
    expect(ms.getByText("Next milestone")).toBeTruthy();
    // Only one tile still ahead is shown on the card.
    expect(ms.queryByLabelText(/^Forged · 100 workouts/)).toBeNull();
    await fireEvent.press(seeAll(view));
    expect(view.getByText("Earned · 1")).toBeTruthy();
    expect(view.getByText("Still ahead · 4")).toBeTruthy();
    expect(
      view.getByLabelText("Forged · 100 workouts, not yet earned"),
    ).toBeTruthy();
    expect(
      view.getByLabelText("10,000 kg lifted, not yet earned"),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("thresholds unchanged: ten workouts and 10,000 kg earn their milestones; pounds read in pounds", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    // Ten workouts of 100 kg × 10: exactly 10,000 kg, no record (same weight).
    for (let i = 10; i >= 1; i--)
      logWorkout(f, i * 2, [["barbell-bench-press", [[100, 10]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(seeAll(view).props.accessibilityLabel).toBe(
      "Milestones, 3 of 5 earned. See all",
    );
    const ms = card(view, "milestones-card");
    expect(
      ms.getByLabelText("Built a habit · 10 workouts, earned"),
    ).toBeTruthy();
    // PD-3: the volume milestone in pounds, never "kg" for a pound lifter.
    expect(ms.getByLabelText("22,046 lb lifted, earned")).toBeTruthy();
    expect(view.queryByText("10,000 kg lifted")).toBeNull();
    expect(ms.getByLabelText("First spark, earned")).toBeTruthy();
    expect(
      ms.getByLabelText("Forged · 100 workouts, not yet earned"),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("a new lifter sees every milestone ahead, and the empty goal invitation", async () => {
  const f = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const ms = card(view, "milestones-card");
    expect(seeAll(view).props.accessibilityLabel).toBe(
      "Milestones, 0 of 5 earned. See all",
    );
    expect(
      ms.getByText("Your first finished workout starts the collection."),
    ).toBeTruthy();
    expect(ms.getByLabelText("First spark, not yet earned")).toBeTruthy();
    const goals = card(view, "next-goals-card");
    expect(
      goals.getByText(
        "No active goals. Set one you can measure and track it here.",
      ),
    ).toBeTruthy();
    await fireEvent.press(goals.getByRole("button", { name: "Set a goal" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "goal" },
    });
  } finally {
    f.db.close();
  }
});

test("next goals: real goals in Home's order, a bar only where Goals gives a ratio", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 2, [["barbell-bench-press", [[50, 5]]]]);
    f.r.addJournal(
      "measurement",
      { name: "Bodyweight", value: 85, unit: "kg" },
      today,
    );
    f.r.addJournal("goal", {
      name: "Bench 100",
      metric: "strength",
      exerciseId: "barbell-bench-press",
      target: 100,
      start: 80,
      reps: 1,
      goalRules: 2,
    });
    f.r.addJournal("goal", {
      name: "Cut to 80",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    // A goal with no start or recorded value has nothing to measure yet.
    f.r.addJournal("goal", {
      name: "Squat 200",
      metric: "strength",
      exerciseId: "back-squat",
      target: 200,
      reps: 1,
      goalRules: 2,
    });
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const goals = card(view, "next-goals-card");
    const rows = goals.getAllByRole("button", { name: /Open goals$/ });
    expect(rows[0]!.props.accessibilityLabel).toBe("Next goals. Open goals");
    // The goals shown, in order, are exactly Goals' evaluation in Home's
    // order; the first is Home's next target.
    const views = (f.r.journal("goal") as Goal[]).map((g) =>
      evaluate(g, goalSources(f.r, today, "kg")),
    );
    const expected = nextGoals(views);
    expect(expected[0]).toBe(nextTarget(views));
    expect(expected[0]!.name).toBe("Cut to 80");
    expect(rows.slice(1).map((r) => r.props.accessibilityLabel)).toEqual(
      expected.map((v) => `${v.spoken}. Open goals`),
    );
    // A goal with nothing measured is left out.
    const squat = views.find((v) => v.name === "Squat 200")!;
    expect(squat.current === undefined && squat.ratio === undefined).toBe(
      expected.every((v) => v.name !== "Squat 200"),
    );
    // Bars only for goals with a real ratio, with Goals' own value.
    expect(goals.queryAllByRole("progressbar")).toHaveLength(
      expected.filter((v) => v.ratio !== undefined).length,
    );
    const cut = expected[0]!;
    expect(
      goals.getByLabelText("Cut to 80", { includeHiddenElements: true }).props
        .accessibilityValue,
    ).toEqual({ min: 0, max: 100, now: Math.round(cut.ratio! * 100) });
    await fireEvent.press(rows[1]!);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "goal" },
    });
  } finally {
    f.db.close();
  }
});
test("Progress has no More card: its destinations live in Home, Train, You and the tab bar", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.queryByTestId("more-card")).toBeNull();
    expect(view.queryByRole("header", { name: "More" })).toBeNull();
    for (const label of [
      "Training history",
      "Training calendar",
      "Body measurements",
      "Nutrition",
      "Recovery",
    ])
      expect(view.queryByLabelText(label)).toBeNull();
    // Progress's own links stay: records and goals.
    expect(view.getByLabelText("All records")).toBeTruthy();
    expect(view.getByLabelText("Next goals. Open goals")).toBeTruthy();
  } finally {
    f.db.close();
  }
});
test("Records screen: REFORGE rows, record types, units, navigation and the empty state", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    logWorkout(f, 20, [
      ["barbell-bench-press", [[100, 5]]],
      ["pull-up", [[0, 8]]],
    ]);
    logWorkout(f, 6, [
      ["barbell-bench-press", [[105, 5]]],
      ["pull-up", [[0, 10]]],
    ]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Records />);
    expect(view.getByRole("header", { name: "Records" })).toBeTruthy();
    const recent = card(view, "recent-records");
    // Heaviest set and most reps, in pounds, each opening its workout.
    const bench = recent.getByLabelText(
      `Barbell Bench Press, Heaviest set 231.49 lb × 5, ${dayLabel(ago(6))}. Review workout`,
    );
    expect(
      recent.getByLabelText(
        `Pull-Up, Most reps 10 reps, ${dayLabel(ago(6))}. Review workout`,
      ),
    ).toBeTruthy();
    await fireEvent.press(bench);
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: "/workout" }),
    );
    const bests = card(view, "your-bests");
    expect(bests.getByText("2 exercises")).toBeTruthy();
    expect(bests.getByText(/^Heaviest 231.49 lb × 5 · Est. 1RM /)).toBeTruthy();
    await fireEvent.press(bests.getByRole("button", { name: "Pull-Up" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/exercise",
      params: { id: "pull-up" },
    });
    await fireEvent.press(
      view.getByRole("button", { name: "How records work" }),
    );
    expect(view.getByText(/recalculated from your history/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalled();
  } finally {
    f.db.close();
  }
});

test("large text stacks milestone tiles; light mode keeps ember for earned ones", async () => {
  mockProfile = { theme: "light" };
  mockDims.fontScale = 2;
  const f = pathRepository();
  try {
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const tile = view.getByTestId("milestone-first");
    const style = StyleSheet.flatten(tile.props.style);
    expect(style.flexBasis).toBe("100%");
    expect(style.borderColor).toBe(theme.palettes.light.emberMuted);
    expect(
      StyleSheet.flatten(within(tile).getByText("Earned").props.style).color,
    ).toBe(theme.palettes.light.emberHot);
    expect(
      StyleSheet.flatten(view.getByTestId("milestone-ten").props.style)
        .borderColor,
    ).toBe(theme.palettes.light.cardBorder);
  } finally {
    f.db.close();
  }
});
