import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { router } from "expo-router";
import Progress from "../../app/(tabs)/progress";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { achievements, summary } from "../../src/domain/metrics";
import { progressModel } from "../../src/data/progress";
import { theme } from "../../src/theme";

// Phase 7.4B: the REFORGE Progress frame (brand header, title block, range
// segments, overview strip) and the lifetime-summary cache (PD-1). The
// sections below keep their own suites (progress.test.tsx).

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
let mockRevision = 0;
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (
      selector: (s: {
        profile: typeof mockProfile;
        revision: number;
      }) => unknown,
    ) => selector({ profile: mockProfile, revision: mockRevision }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 0;
  mockProfile = undefined;
});

type Fixture = ReturnType<typeof pathRepository>;
const today = localDate();
function logWorkout({ r, db }: Fixture, date: string, weight = 100) {
  const w = r.startWorkout(`Session ${date}`);
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.editSet(r.addSet(row.id).id, { weight, reps: 5, completed: true });
  r.finishWorkout(w.id);
  // Today's session finishes now; earlier ones in the evening.
  const end =
    date === today ? Date.now() - 1000 : new Date(`${date}T18:00:00`).getTime();
  db.prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?").run(
    end - 3000000,
    end,
    w.id,
  );
  return w;
}
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as object) as {
    color?: string;
    minHeight?: number;
  };

test("the REFORGE frame: brand, title, subtitle, date and the streak", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ onboarded: true });
    logWorkout(f, addDays(today, -1));
    logWorkout(f, addDays(today, -2));
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.getByLabelText("FORGE")).toBeTruthy();
    expect(view.getByRole("header", { name: "Progress" })).toBeTruthy();
    expect(
      view.getByText("Evidence of a stronger you. Keep building."),
    ).toBeTruthy();
    // The streak is the shared day streak; on Progress it is not a link.
    const pill = view.getByLabelText("2 day streak");
    expect(pill.props.accessibilityRole).toBeUndefined();
    // No plan: no week or phase is invented.
    expect(view.queryByText(/^Week \d+/)).toBeNull();
    // Every section and Progress destination is still there; the More card
    // (links to other tabs' screens) is gone.
    for (const label of [
      "Milestones, 1 of 5 earned. See all",
      "Next goals. Open goals",
      "All records",
    ])
      expect(view.getByLabelText(label)).toBeTruthy();
    for (const heading of [
      "Consistency",
      "Strength",
      "Records",
      "Training volume",
      "Training time",
    ])
      expect(view.getByRole("header", { name: heading })).toBeTruthy();
    expect(view.queryByRole("header", { name: "More" })).toBeNull();
  } finally {
    f.db.close();
  }
});

test("range segments: short labels, full spoken names, 12 weeks by default, 44 pt", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, addDays(today, -60));
    logWorkout(f, addDays(today, -1));
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.getByLabelText("Time range").props.accessibilityRole).toBe(
      "tablist",
    );
    for (const [label, spoken] of [
      ["4W", "4 weeks"],
      ["12W", "12 weeks"],
      ["1Y", "1 year"],
      ["All", "All time"],
    ] as const) {
      expect(view.getByText(label)).toBeTruthy();
      const tab = view.getByRole("tab", { name: spoken });
      expect(flat(tab).minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(
      view.getByRole("tab", { name: "12 weeks" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(view.getByLabelText("Workouts: 2")).toBeTruthy();
    // The range still filters: 4 weeks leaves out the session 60 days ago.
    await fireEvent.press(view.getByRole("tab", { name: "4 weeks" }));
    expect(view.getByLabelText("Workouts: 1")).toBeTruthy();
    expect(
      view.getByRole("tab", { name: "4 weeks" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(view.getByRole("tab", { name: "All time" }));
    expect(view.getByLabelText("Workouts: 2")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("a new lifter sees the frame and one clear first step", async () => {
  const f = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.getByRole("header", { name: "Progress" })).toBeTruthy();
    expect(view.getByLabelText("0 day streak")).toBeTruthy();
    expect(view.queryByRole("tablist")).toBeNull();
    expect(
      view.getByRole("header", { name: "Your progress starts here" }),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByRole("button", { name: "Start a workout" }),
    );
    expect(router.navigate).toHaveBeenCalledWith("/(tabs)");
  } finally {
    f.db.close();
  }
});

test("light mode: the title and range use the light palette", async () => {
  mockProfile = { theme: "light" };
  const f = pathRepository();
  try {
    logWorkout(f, addDays(today, -1));
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(flat(view.getByText("Progress")).color).toBe(
      theme.palettes.light.text,
    );
    expect(flat(view.getByText("4W")).color).not.toBe(
      theme.palettes.dark.text2,
    );
  } finally {
    f.db.close();
  }
});

test("PD-1: lifetime totals are computed once per data change, never per range tap", async () => {
  const f = pathRepository();
  try {
    const old = logWorkout(f, addDays(today, -2), 100);
    logWorkout(f, addDays(today, -1), 105);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const sets = jest.spyOn(f.r, "workoutSets");
    const view = await render(<Progress />);
    // Identical to the summary computed directly from the same data.
    const direct = () => summary(f.r.workouts(), (id) => f.r.workoutSets(id));
    const earned = () =>
      achievements(
        direct().count,
        direct().totalVolume,
        progressModel(f.r).events.length,
      ).length;
    expect(view.getByLabelText(`${direct().streak} day streak`)).toBeTruthy();
    expect(view.getByLabelText("2 day streak")).toBeTruthy();
    // Milestones depend on the lifetime count and volume.
    expect(
      view.getByLabelText(`Milestones, ${earned()} of 5 earned. See all`),
    ).toBeTruthy();
    // Range taps and re-renders read no workout sets at all.
    sets.mockClear();
    for (const spoken of ["4 weeks", "1 year", "All time", "12 weeks"])
      await fireEvent.press(view.getByRole("tab", { name: spoken }));
    await view.rerender(<Progress />);
    expect(sets).not.toHaveBeenCalled();

    // A new workout today: the next data change (revision) refreshes them.
    logWorkout(f, today, 110);
    mockRevision++;
    await view.rerender(<Progress />);
    expect(sets).toHaveBeenCalled();
    expect(view.getByLabelText("3 day streak")).toBeTruthy();
    expect(view.getByLabelText(`${direct().streak} day streak`)).toBeTruthy();

    // Deleting a workout is reflected too: no stale streak.
    f.r.deleteWorkout(old.id);
    mockRevision++;
    await view.rerender(<Progress />);
    expect(view.getByLabelText("2 day streak")).toBeTruthy();
    expect(direct().streak).toBe(2);
  } finally {
    f.db.close();
  }
});

// Phase 7.4C: the REFORGE charts on Progress, across ranges and units.
test("charts: weekly or monthly buckets per range, and pound axes for pound lifters", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    logWorkout(f, addDays(today, -9), 100);
    logWorkout(f, addDays(today, -2), 105);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    for (const [spoken, bucket] of [
      ["4 weeks", "week"],
      ["12 weeks", "week"],
      ["1 year", "month"],
      ["All time", "week"],
    ] as const) {
      await fireEvent.press(view.getByRole("tab", { name: spoken }));
      expect(view.getByLabelText(`Workouts by ${bucket}`)).toBeTruthy();
      expect(view.getByLabelText(`Volume by ${bucket}`)).toBeTruthy();
    }
    // The strength line, measured: its axis is in pounds (≈ 220–231 lb),
    // its callout too; stored kilograms are unchanged.
    const chart = view.getByLabelText(/by session$/);
    await act(async () => {
      fireEvent(chart, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 150 } },
      });
    });
    expect(
      view.getByLabelText(/by session$/).props.accessibilityValue.text,
    ).toMatch(/ lb, /);
    const axis = view.container
      .queryAll((n) => n.type === "Text")
      .map((n) => [n.props.children].flat().join(""))
      .filter((t) => /^\d+$/.test(t))
      .map(Number);
    expect(Math.max(...axis)).toBeGreaterThan(200);
    expect(f.r.workoutSets(f.r.workouts()[0]!.id)[0]!.weight).toBe(105);
  } finally {
    f.db.close();
  }
});

test("PD-4: goals are evaluated once per data change, not on every range tap", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, addDays(today, -1));
    f.r.addJournal("goal", {
      name: "Bench 120",
      metric: "strength",
      exerciseId: "barbell-bench-press",
      target: 120,
      start: 80,
      reps: 1,
      goalRules: 2,
    });
    jest.mocked(useRepo).mockReturnValue(f.r);
    const journal = jest.spyOn(f.r, "journal");
    const goalReads = () =>
      journal.mock.calls.filter(([kind]) => kind === "goal").length;
    const view = await render(<Progress />);
    expect(view.getByText("Bench 120")).toBeTruthy();
    const before = goalReads();
    for (const spoken of ["4 weeks", "1 year", "All time", "12 weeks"])
      await fireEvent.press(view.getByRole("tab", { name: spoken }));
    expect(goalReads()).toBe(before);
    // A new goal arrives with the next data change.
    f.r.addJournal("goal", {
      name: "Cut to 78",
      metric: "bodyweight",
      target: 78,
      start: 88,
      goalRules: 2,
    });
    f.r.addJournal(
      "measurement",
      { name: "Bodyweight", value: 84, unit: "kg" },
      today,
    );
    mockRevision++;
    await view.rerender(<Progress />);
    expect(goalReads()).toBeGreaterThan(before);
    expect(view.getByText("Cut to 78")).toBeTruthy();
  } finally {
    f.db.close();
  }
});
