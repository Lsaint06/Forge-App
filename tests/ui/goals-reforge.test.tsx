import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import JournalScreen from "../../src/screens/Journal";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { evaluate, type Goal } from "../../src/domain/goals";
import { goalSources } from "../../src/data/goal-sources";
import { nextTarget } from "../../src/screens/home/model";
import { dayLabel } from "../../src/domain/training-display";
import { theme } from "../../src/theme";

// Phase 7.5F: the REFORGE Goals screen, detail, chart and sheet. The goal
// engine, Undo and lifecycle are covered by goals.test (unchanged).

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
  useLocalSearchParams: () => ({ kind: "goal" }),
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

const today = localDate();
const hidden = { includeHiddenElements: true };
type Repo = ReturnType<typeof pathRepository>["r"];
function setup(profile: Parameters<Repo["saveProfile"]>[0] = {}) {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, ...profile });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
const weigh = (r: Repo, kg: number, date: string) =>
  r.addJournal(
    "measurement",
    { name: "Bodyweight", value: kg, unit: "kg" },
    date,
  );
const cut = (r: Repo, date = addDays(today, -20)) =>
  r.addJournal(
    "goal",
    {
      name: "Cut to 80",
      metric: "bodyweight",
      start: 84,
      target: 80,
      goalRules: 2,
    },
    date,
  );
const views = (r: Repo, units: "kg" | "lb" = "kg") =>
  (r.journal("goal") as Goal[]).map((g) =>
    evaluate(g, goalSources(r, today, units)),
  );

test("overview: a REFORGE header, the active count and each card in the engine's words", async () => {
  const { r, db } = setup();
  try {
    weigh(r, 82, addDays(today, -1));
    cut(r);
    r.addJournal(
      "goal",
      { name: "Train 3×", metric: "workouts", target: 3, goalRules: 2 },
      today,
    );
    const view = await render(<JournalScreen />);
    expect(view.getByRole("header", { name: "Goals" })).toBeTruthy();
    expect(view.getByText("2 active")).toBeTruthy();
    expect(view.getByText("Active")).toBeTruthy();
    const [bw] = views(r).filter((v) => v.name === "Cut to 80");
    // The card is announced exactly as the engine words it.
    expect(view.getByLabelText(/^Cut to 80\. /).props.accessibilityLabel).toBe(
      bw!.spoken,
    );
    // Value with its basis; target; a bar only with a real ratio.
    expect(view.getByText(/^82 kg · /, hidden)).toBeTruthy();
    expect(view.getByText("Target 80 kg", hidden)).toBeTruthy();
    expect(
      view.getByText(
        `${Math.round(bw!.ratio! * 100)}% · From 84 kg to 80 kg`,
        hidden,
      ),
    ).toBeTruthy();
    expect(view.getByText("2 kg to go", hidden)).toBeTruthy();
    // New goal is the pinned primary action.
    expect(view.getByRole("button", { name: "New goal" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("detail: name as the header, status overline, real chart points in order, target below", async () => {
  const { r, db } = setup();
  try {
    // A weigh-in before the goal is not part of its chart.
    weigh(r, 86, addDays(today, -30));
    weigh(r, 83.4, addDays(today, -10));
    weigh(r, 82.6, addDays(today, -4));
    weigh(r, 82, addDays(today, -1));
    cut(r);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Cut to 80\. /));
    expect(view.getByRole("header", { name: "Cut to 80" })).toBeTruthy();
    expect(view.getByText("Active goal")).toBeTruthy();
    const chart = within(view.getByTestId("goal-chart"));
    expect(chart.getByText("Weigh-ins since this goal was set")).toBeTruthy();
    const plot = view.getByRole("adjustable", {
      name: "Weigh-ins since this goal was set",
    });
    // Latest first, then back in time: exactly the recorded weigh-ins.
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(plot.props.accessibilityValue.text);
      await act(async () =>
        fireEvent(plot, "accessibilityAction", {
          nativeEvent: { actionName: "decrement" },
        }),
      );
    }
    expect(seen.slice(0, 3)).toEqual([
      `82 kg, ${dayLabel(addDays(today, -1))}`,
      `82.6 kg, ${dayLabel(addDays(today, -4))}`,
      `83.4 kg, ${dayLabel(addDays(today, -10))}`,
    ]);
    expect(seen.join()).not.toMatch(/86 kg/);
    expect(chart.getByText("Target 80 kg")).toBeTruthy();
    // Details and actions as REFORGE rows.
    expect(
      view.getByLabelText(`Counts from: ${dayLabel(addDays(today, -20))}`),
    ).toBeTruthy();
    for (const a of ["Edit", "Archive", "Delete"])
      expect(view.getByRole("button", { name: a })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("charts: pounds convert; sparse history explains itself; habits have no chart", async () => {
  const { r, db } = setup({ units: "lb" });
  try {
    weigh(r, 82, addDays(today, -1));
    weigh(r, 81, today);
    cut(r);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Cut to 80\. /));
    expect(
      view.getByRole("adjustable", {
        name: "Weigh-ins since this goal was set",
      }).props.accessibilityValue.text,
    ).toBe(`178.6 lb, ${dayLabel(today)}`);
    await view.unmount();
  } finally {
    db.close();
  }
  const sparse = setup();
  try {
    weigh(sparse.r, 82, addDays(today, -1));
    cut(sparse.r);
    sparse.r.addJournal(
      "goal",
      { name: "Train 3×", metric: "workouts", target: 3, goalRules: 2 },
      addDays(today, -21),
    );
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Cut to 80\. /));
    expect(
      view.getByText(
        "One day recorded so far. The chart appears from the second.",
      ),
    ).toBeTruthy();
    expect(view.queryByRole("adjustable")).toBeNull();
    await fireEvent.press(view.getByLabelText("Back"));
    await fireEvent.press(view.getByLabelText(/^Train 3×\. /));
    expect(view.queryByTestId("goal-chart")).toBeNull();
    // The habit's recent weeks are its history.
    expect(view.getByText("Recent")).toBeTruthy();
  } finally {
    sparse.db.close();
  }
});

test("achieved and archived goals are told apart, never re-dated or made active", async () => {
  const { r, db } = setup();
  try {
    r.addJournal(
      "goal",
      {
        name: "Bench 100",
        metric: "strength",
        exerciseId: "barbell-bench-press",
        target: 100,
        start: 80,
        goalRules: 2,
        status: "achieved",
        achievedOn: addDays(today, -12),
        achievedValue: 100,
        confirmedAt: Date.now() - 12 * 86400000,
      },
      addDays(today, -60),
    );
    r.addJournal(
      "goal",
      {
        name: "Train 5×",
        metric: "workouts",
        target: 5,
        goalRules: 2,
        status: "archived",
      },
      addDays(today, -40),
    );
    const before = r.journal("goal").map((g) => ({ ...g.data }));
    const view = await render(<JournalScreen />);
    expect(view.getByText("No active goals")).toBeTruthy();
    expect(view.getByText(/restore an archived one/)).toBeTruthy();
    expect(view.getByText("Past goals (2)")).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Show past goals" }),
    );
    const achieved = views(r).find((v) => v.name === "Bench 100")!;
    expect(
      view.getByLabelText(`${achieved.spoken}. `).props.accessibilityLabel,
    ).toMatch(/Achieved/);
    expect(view.getByText("Archived · Workouts per week")).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`${achieved.spoken}. `));
    expect(view.getByText("Achieved goal")).toBeTruthy();
    expect(view.getByText("Achieved", hidden)).toBeTruthy();
    // Achieved goals offer a new target, not an edit.
    expect(view.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(view.getByRole("button", { name: "Set a new target" })).toBeTruthy();
    // Viewing changes nothing.
    expect(r.journal("goal").map((g) => g.data)).toEqual(before);
  } finally {
    db.close();
  }
});

test("the REFORGE sheet edits only what changed and keeps the baseline", async () => {
  const { r, db } = setup();
  try {
    weigh(r, 82, addDays(today, -1));
    const g = cut(r);
    const view = await render(<JournalScreen />);
    await fireEvent.press(view.getByLabelText(/^Cut to 80\. /));
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    // The type is shown, not re-chosen; the saved values are filled in.
    expect(view.getByText("Bodyweight")).toBeTruthy();
    expect(view.queryByRole("radio", { name: "Lift" })).toBeNull();
    expect(view.getByLabelText("Target (kg)").props.value).toBe("80");
    expect(view.getByLabelText("Starting weight (kg)").props.value).toBe("84");
    // Cancel writes nothing.
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "78");
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(r.journal("goal")[0]!.data).toEqual(g.data);
    // A name change keeps the target, start and counting day.
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    await fireEvent.changeText(
      view.getByLabelText("Name (optional)"),
      "Lean 80",
    );
    await fireEvent.press(view.getByLabelText("Save changes"));
    const saved = r.journal("goal")[0]!;
    expect(saved.data).toEqual({ ...g.data, name: "Lean 80" });
    expect(saved.date).toBe(g.date);
    mockRevision++;
    await view.rerender(<JournalScreen />);
    expect(view.getByRole("header", { name: "Lean 80" })).toBeTruthy();
  } finally {
    db.close();
  }
});

test("one goal, one reading: Goals shows what Home and You select", async () => {
  const { r, db } = setup();
  try {
    weigh(r, 82, addDays(today, -1));
    cut(r);
    r.addJournal(
      "goal",
      {
        name: "Squat 200",
        metric: "strength",
        exerciseId: "back-squat",
        target: 200,
      },
      today,
    );
    const all = views(r);
    const home = nextTarget(all)!;
    const view = await render(<JournalScreen />);
    // Home's next target (also You's primary goal) is the same goal, with the
    // same words, on Goals.
    expect(view.getByLabelText(home.spoken)).toBeTruthy();
    // A change made in Goals is what the shared evaluation then reads.
    await fireEvent.press(view.getByLabelText(home.spoken));
    await fireEvent.press(view.getByRole("button", { name: "Edit" }));
    await fireEvent.changeText(view.getByLabelText("Target (kg)"), "81");
    await fireEvent.press(view.getByLabelText("Save changes"));
    const after = nextTarget(views(r))!;
    expect(after.target).toBe("Target 81 kg");
    mockRevision++;
    await view.rerender(<JournalScreen />);
    expect(view.getByText("Target 81 kg", hidden)).toBeTruthy();
  } finally {
    db.close();
  }
});

test("empty Goals invites a first goal; compact screens, large text and light mode", async () => {
  const empty = setup();
  try {
    const view = await render(<JournalScreen />);
    expect(view.getByText("Set a goal you can measure")).toBeTruthy();
    expect(view.queryByText(/active$/)).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "New goal" }));
    expect(view.getByRole("radio", { name: "Bodyweight" })).toBeTruthy();
    await view.unmount();
  } finally {
    empty.db.close();
  }
  const { r, db } = setup();
  try {
    const long =
      "A very long goal name that a lifter typed to remind themselves why";
    r.addJournal(
      "goal",
      { name: long, metric: "workouts", target: 3, goalRules: 2 },
      today,
    );
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    const view = await render(<JournalScreen />);
    const name = view.getByText(long, hidden);
    expect(name.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(name.props.style).color).toBe(
      theme.palettes.light.text,
    );
    const footer = view.getByRole("button", { name: "New goal" });
    expect(
      Number(StyleSheet.flatten(footer.props.style).minHeight),
    ).toBeGreaterThanOrEqual(44);
  } finally {
    db.close();
  }
});
