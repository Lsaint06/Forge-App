import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import Progress from "../../app/(tabs)/progress";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { lbToKg } from "../../src/domain/metrics";
import { dayLabel } from "../../src/domain/training-display";
import { theme } from "../../src/theme";

// Phase 7.4E: the PR highlight, all-time stats and the REFORGE analytics
// cards; the Overview strip's figures now live in their own cards.

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
/** A 50-minute workout finishing that evening. */
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
const highlight = (view: View) =>
  card(view, "pr-highlight").getByRole("button", { name: /Open exercise$/ });

test("PR highlight: the newest record, its number, its gain and its day", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 20, [["barbell-bench-press", [[100, 5]]]]);
    logWorkout(f, 6, [["barbell-bench-press", [[105, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const pr = card(view, "pr-highlight");
    expect(pr.getByText("Barbell Bench Press")).toBeTruthy();
    expect(pr.getByText("105 kg")).toBeTruthy();
    expect(pr.getByText("+5 kg")).toBeTruthy();
    expect(pr.getByText("Heaviest set · 5 reps")).toBeTruthy();
    expect(
      pr.getByText(`New personal record · ${dayLabel(ago(6))}`),
    ).toBeTruthy();
    expect(highlight(view).props.accessibilityLabel).toBe(
      `Barbell Bench Press: 105 kg, Heaviest set · 5 reps, +5 kg over your previous best, ${dayLabel(ago(6))}. Open exercise`,
    );
    await fireEvent.press(highlight(view));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/exercise",
      params: { id: "barbell-bench-press" },
    });
    await fireEvent.press(
      pr.getByRole("button", { name: "PR highlight. Open all records" }),
    );
    expect(router.push).toHaveBeenLastCalledWith("/records");
  } finally {
    f.db.close();
  }
});

test("PR highlight follows the newest record of any kind, in the lifter's units", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    logWorkout(f, 30, [["barbell-bench-press", [[lbToKg(225), 5]]]]);
    logWorkout(f, 20, [["barbell-bench-press", [[lbToKg(230), 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const lb = await render(<Progress />);
    expect(card(lb, "pr-highlight").getByText("230 lb")).toBeTruthy();
    expect(card(lb, "pr-highlight").getByText("+5 lb")).toBeTruthy();
    await lb.unmount();
    // A newer bodyweight record takes the highlight: reps, not load.
    logWorkout(f, 12, [["pull-up", [[0, 8]]]]);
    logWorkout(f, 3, [["pull-up", [[0, 11]]]]);
    const view = await render(<Progress />);
    const pr = card(view, "pr-highlight");
    expect(pr.getByText("Pull-Up")).toBeTruthy();
    expect(pr.getByText("11 reps")).toBeTruthy();
    expect(pr.getByText("+3 reps")).toBeTruthy();
    expect(pr.getByText("Most reps")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("no record yet: an honest empty highlight, nothing invented", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const pr = card(view, "pr-highlight");
    expect(
      pr.getByText(
        "No records yet. Beat a previous best and your newest record shows here.",
      ),
    ).toBeTruthy();
    expect(pr.queryByRole("button", { name: /Open exercise$/ })).toBeNull();
    expect(pr.queryByText(/kg/)).toBeNull();
  } finally {
    f.db.close();
  }
});

test("all-time stats: workouts, total volume (= Training volume over all time) and time", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 200, [["back-squat", [[100, 5]]]]);
    logWorkout(f, 2, [
      [
        "barbell-bench-press",
        [
          [100, 5],
          [100, 5],
        ],
      ],
      ["pull-up", [[0, 8]]],
    ]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const all = card(view, "all-time");
    expect(all.getByLabelText("Total workouts: 2")).toBeTruthy();
    expect(all.getByLabelText("Total volume: 1,500 kg")).toBeTruthy();
    expect(all.getByText("1h 40m")).toBeTruthy();
    expect(
      all.getByLabelText("Total training time: 1 hour 40 minutes"),
    ).toBeTruthy();
    // Lifetime, whatever the range; equal to the volume card over all time.
    await fireEvent.press(view.getByRole("tab", { name: "4 weeks" }));
    expect(all.getByLabelText("Total volume: 1,500 kg")).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "All time" }));
    expect(
      card(view, "volume-card").getByLabelText(
        "Total volume · all time: 1,500 kg, 4 working sets",
      ),
    ).toBeTruthy();
    await fireEvent.press(
      all.getByRole("button", {
        name: "All-time stats. Open training history",
      }),
    );
    expect(router.push).toHaveBeenLastCalledWith("/history");
  } finally {
    f.db.close();
  }
});

test("side by side where both fit, stacked on a small screen or with large text", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const direction = async () => {
      const view = await render(<Progress />);
      const d = StyleSheet.flatten(
        view.getByTestId("card-pair").props.style,
      ).flexDirection;
      await view.unmount();
      return d;
    };
    expect(await direction()).toBe("row");
    mockDims.width = 320;
    expect(await direction()).toBe("column");
    Object.assign(mockDims, { width: 393, fontScale: 1.6 });
    expect(await direction()).toBe("column");
  } finally {
    f.db.close();
  }
});

test("the Overview's figures live in their cards; each follows the range", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 60, [["barbell-bench-press", [[100, 5]]]]);
    logWorkout(f, 40, [["barbell-bench-press", [[105, 5]]]]);
    logWorkout(f, 3, [["barbell-bench-press", [[110, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    expect(view.queryByLabelText(/^Volume \(kg\)/)).toBeNull();
    const cons = () => card(view, "consistency-card");
    const recs = () => card(view, "records-card");
    expect(cons().getByLabelText("Workouts: 3")).toBeTruthy();
    expect(cons().getByLabelText(/^Active weeks: 3\/12$/)).toBeTruthy();
    expect(recs().getByLabelText("Records: 2")).toBeTruthy();
    expect(recs().getByText("Set in the last 12 weeks")).toBeTruthy();
    // Record rows open their workout; All records stays.
    expect(
      recs().getByLabelText(
        `Barbell Bench Press, Heaviest set 110 kg × 5, ${dayLabel(ago(3))}. Review workout`,
      ),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "4 weeks" }));
    expect(cons().getByLabelText("Workouts: 1")).toBeTruthy();
    expect(recs().getByLabelText("Records: 1")).toBeTruthy();
    await fireEvent.press(recs().getByLabelText("All records"));
    expect(router.push).toHaveBeenLastCalledWith("/records");
  } finally {
    f.db.close();
  }
});

test("muscle sets expand and collapse; training time per range", async () => {
  const f = pathRepository();
  try {
    logWorkout(f, 2, [
      ["barbell-bench-press", [[100, 5]]],
      ["back-squat", [[100, 5]]],
      ["overhead-press", [[50, 5]]],
      ["pull-up", [[0, 8]]],
      ["romanian-deadlift", [[100, 5]]],
      ["dumbbell-curl", [[15, 10]]],
      ["standing-calf-raise", [[60, 12]]],
    ]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    // Equal counts are listed alphabetically: Shoulders is past the first five.
    const muscles = () => card(view, "muscle-card");
    expect(muscles().queryByLabelText("Shoulders: 1 working set")).toBeNull();
    await fireEvent.press(
      muscles().getByRole("button", { name: "Show all 7 muscles" }),
    );
    expect(muscles().getByLabelText("Shoulders: 1 working set")).toBeTruthy();
    await fireEvent.press(
      muscles().getByRole("button", { name: "Show fewer" }),
    );
    expect(muscles().queryByLabelText("Shoulders: 1 working set")).toBeNull();
    const time = card(view, "training-time-card");
    expect(time.getByLabelText("Average workout: 50 min")).toBeTruthy();
    expect(time.getByLabelText("Total: 50 min")).toBeTruthy();
    expect(time.getByLabelText("Day streak: 0")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("light mode: ember gain and light text on the analytics cards", async () => {
  mockProfile = { theme: "light" };
  const f = pathRepository();
  try {
    logWorkout(f, 20, [["barbell-bench-press", [[100, 5]]]]);
    logWorkout(f, 6, [["barbell-bench-press", [[105, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const color = (el: { props: { style?: unknown } }) =>
      (StyleSheet.flatten(el.props.style as object) as { color?: string })
        .color;
    const pr = card(view, "pr-highlight");
    expect(color(pr.getByText("+5 kg"))).toBe(theme.palettes.light.emberHot);
    expect(color(pr.getByText("105 kg"))).toBe(theme.palettes.light.text);
    expect(color(card(view, "all-time").getByText("Total volume"))).toBe(
      theme.palettes.light.text2,
    );
  } finally {
    f.db.close();
  }
});

// Phase 7.4G: extremes — a million kilograms, on the smallest phone with
// the largest text: everything renders, values stay whole and labelled.
test("extremes: very large totals on a 320 pt screen with large text", async () => {
  Object.assign(mockDims, { width: 320, fontScale: 2 });
  const f = pathRepository();
  try {
    const heavy: [number, number][] = Array.from({ length: 100 }, () => [
      500, 20,
    ]);
    logWorkout(f, 9, [["barbell-bench-press", heavy]]);
    logWorkout(f, 2, [["barbell-bench-press", [[505, 20]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    // 100 × 500 × 20 + 505 × 20 = 1,010,100 kg.
    expect(
      card(view, "all-time").getByLabelText("Total volume: 1,010,100 kg"),
    ).toBeTruthy();
    expect(
      card(view, "volume-card").getByLabelText(
        "Total volume · the last 12 weeks: 1,010,100 kg, 101 working sets",
      ),
    ).toBeTruthy();
    expect(card(view, "pr-highlight").getByText("505 kg")).toBeTruthy();
    // Large text: the pair stacks and every strip falls back to one column.
    expect(
      StyleSheet.flatten(view.getByTestId("card-pair").props.style)
        .flexDirection,
    ).toBe("column");
  } finally {
    f.db.close();
  }
});
