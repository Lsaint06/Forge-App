import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within, act } from "@testing-library/react-native";
import { router } from "expo-router";
import History from "../../src/screens/History";
import WorkoutScreen from "../../src/screens/Workout";
import { useRepo, confirm } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { theme } from "../../src/theme";

// Phase 7.5E: the REFORGE Workout history and the review's logged summary.

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
const mockParams: { id?: string } = {};
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
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
  delete mockParams.id;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
});

type Repo = ReturnType<typeof pathRepository>["r"];
type Db = ReturnType<typeof pathRepository>["db"];
/** A finished workout: one bench row with the given sets, ending `at`. */
function finished(
  f: { r: Repo; db: Db },
  name: string,
  at: number,
  sets: [number, number][] = [[50, 5]],
  minutes = 45,
) {
  const w = f.r.startWorkout(name);
  const row = f.r.addExercise(w.id, "barbell-bench-press");
  for (const [weight, reps] of sets)
    f.r.editSet(f.r.addSet(row.id).id, { completed: true, weight, reps });
  f.r.finishWorkout(w.id);
  f.db
    .prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?")
    .run(at - minutes * 60000, at, w.id);
  return w;
}
const day = (daysAgo: number, hour = 18) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
};
const rows = (view: Awaited<ReturnType<typeof render>>) =>
  view
    .getAllByLabelText(/^Review /)
    .map((n) => n.props.accessibilityLabel as string);

test("newest first; same-day sessions keep their own rows; unfinished ones are left out", async () => {
  const f = pathRepository();
  try {
    finished(f, "Pull day", day(3));
    finished(f, "Push day", day(1, 7));
    finished(f, "Push day", day(1, 19));
    // In progress: not history.
    f.r.startWorkout("Leg day");
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<History />);
    expect(view.getByRole("header", { name: "Workout history" })).toBeTruthy();
    expect(view.getByText("3 workouts")).toBeTruthy();
    const labels = rows(view);
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => l.split(",")[0])).toEqual([
      "Review Push day",
      "Review Push day",
      "Review Pull day",
    ]);
    expect(view.queryByLabelText(/^Review Leg day/)).toBeNull();
    // The two same-day sessions are told apart by their finish times.
    const hints = view
      .getAllByLabelText(/^Review Push day/)
      .map((n) => n.props.accessibilityHint as string);
    expect(hints[0]).not.toBe(hints[1]);
    expect(hints.every((h) => /^\d{1,2}[:.]\d{2}/.test(h))).toBe(true);
    // A different day shows no time.
    expect(
      view.getByLabelText(/^Review Pull day/).props.accessibilityHint,
    ).toBe("45 min, 1 exercise, 250 kg");
  } finally {
    f.db.close();
  }
});

test("rows show only recorded details, in the lifter's units", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    finished(f, "Forge Strength · Upper A", day(2), [[100, 5]], 52);
    const empty = f.r.startWorkout("Quick log");
    f.r.finishWorkout(empty.id);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<History />);
    // Program names lead with the session; labels keep the full name.
    expect(view.getByText("Upper A")).toBeTruthy();
    expect(
      view.getByLabelText(/^Review Forge Strength · Upper A, /),
    ).toBeTruthy();
    expect(view.getByText("52 min · 1 exercise · 1,102 lb")).toBeTruthy();
    // Nothing logged: said plainly, no zero duration or volume.
    expect(view.getByText("No exercises logged")).toBeTruthy();
    expect(view.queryByText(/\b0 (min|lb)\b/)).toBeNull();
  } finally {
    f.db.close();
  }
});

test("Delete asks first; Cancel keeps it; confirming removes it and the list refreshes", async () => {
  const f = pathRepository();
  try {
    const keep = finished(f, "Keep me", day(1));
    const gone = finished(f, "Delete me", day(2));
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<History />);
    await fireEvent.press(view.getByLabelText(/^Options for Delete me, /));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Delete workout" }),
    );
    await act(async () => {
      await new Promise((done) => setTimeout(done, 800));
    });
    expect(confirm).toHaveBeenCalledWith(
      "Delete workout?",
      expect.stringContaining("cannot be undone"),
      expect.any(Function),
      { action: "Delete workout" },
    );
    // Cancel: nothing happens.
    expect(f.r.workout(gone.id)).toBeDefined();
    expect(rows(view)).toHaveLength(2);
    // Confirm: deleted, and the list and count follow.
    jest.mocked(confirm).mock.calls[0]![2]();
    mockRevision++;
    await view.rerender(<History />);
    expect(f.r.workout(gone.id)).toBeUndefined();
    expect(f.r.workout(keep.id)).toBeDefined();
    expect(rows(view)).toEqual([expect.stringMatching(/^Review Keep me, /)]);
    expect(view.getByText("1 workout")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("Repeat starts a copy and opens the logger; a row opens the review", async () => {
  const f = pathRepository();
  try {
    const w = finished(f, "Push day", day(1));
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<History />);
    await fireEvent.press(view.getByLabelText(/^Review Push day, /));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/workout",
      params: { id: w.id },
    });
    await fireEvent.press(view.getByLabelText(/^Options for Push day, /));
    await fireEvent.press(
      view.getByRole("menuitem", { name: "Repeat workout" }),
    );
    await act(async () => {
      await new Promise((done) => setTimeout(done, 800));
    });
    expect(router.push).toHaveBeenLastCalledWith("/workout");
    expect(f.r.active()?.name).toBe("Push day");
    // The original stays completed: one copy, not a replacement.
    expect(f.r.workout(w.id)?.status).toBe("completed");
  } finally {
    f.db.close();
  }
});

test("only the shown page is summarised", async () => {
  const f = pathRepository();
  try {
    for (let i = 0; i < 65; i++) finished(f, `Session ${i}`, day(i + 1));
    jest.mocked(useRepo).mockReturnValue(f.r);
    const reads = jest.spyOn(f.r, "workoutExercises");
    const view = await render(<History />);
    expect(rows(view)).toHaveLength(60);
    // Exactly the 60 shown workouts are read; the 5 older ones are not.
    const read = new Set(reads.mock.calls.map(([id]) => id));
    const shown = f.r
      .workouts()
      .filter((w) => w.status === "completed")
      .map((w) => w.id);
    expect(read).toEqual(new Set(shown.slice(0, 60)));
    await fireEvent.press(view.getByLabelText("Show earlier (5)"));
    expect(rows(view)).toHaveLength(65);
  } finally {
    f.db.close();
  }
});

test("empty history points to Train", async () => {
  const f = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<History />);
    expect(view.getByText("No workouts yet")).toBeTruthy();
    expect(view.getByText("0 workouts")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Go to Train" }));
    expect(router.navigate).toHaveBeenLastCalledWith("/(tabs)/train");
  } finally {
    f.db.close();
  }
});

test("compact screens, large text and light mode: long names wrap, targets stay 44 pt", async () => {
  const f = pathRepository();
  try {
    const long =
      "An unusually long workout name that a lifter typed in full after a big session";
    finished(f, long, day(1));
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    mockProfile = { theme: "light" };
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<History />);
    const row = view.getByLabelText(new RegExp(`^Review ${long}, `));
    const title = within(row).getByText(long);
    expect(title.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(title.props.style).color).toBe(
      theme.palettes.light.text,
    );
    expect(
      Number(StyleSheet.flatten(row.props.style).minHeight),
    ).toBeGreaterThanOrEqual(44);
    expect(
      view.getByLabelText(new RegExp(`^Options for ${long}, `)),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("review shows what was logged for each exercise, not the plan target", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "kg" });
    const w = f.r.startWorkout("Push day");
    const bench = f.r.addExercise(w.id, "barbell-bench-press");
    f.r.editSet(f.r.addSet(bench.id).id, {
      completed: true,
      weight: 60,
      reps: 8,
    });
    f.r.editSet(f.r.addSet(bench.id).id, {
      completed: true,
      weight: 80,
      reps: 5,
    });
    f.r.addSet(bench.id, { weight: 85, reps: 5 });
    f.r.finishWorkout(w.id);
    mockParams.id = w.id;
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<WorkoutScreen />);
    expect(view.getByText("Completed session")).toBeTruthy();
    expect(view.getByText("2 of 3 sets · top set 80 kg × 5")).toBeTruthy();
    expect(view.queryByText(/working sets? · \d+s rest/)).toBeNull();
    // Editing returns to the logger's own summary.
    await fireEvent.press(view.getByLabelText("Edit workout"));
    expect(view.getByText(/working sets? · \d+s rest/)).toBeTruthy();
  } finally {
    f.db.close();
  }
});
