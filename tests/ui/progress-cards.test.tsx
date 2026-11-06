import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import Progress from "../../app/(tabs)/progress";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { dayLabel } from "../../src/domain/training-display";
import { theme } from "../../src/theme";

// Phase 7.4D: the REFORGE Bodyweight and Training volume cards on Progress.

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
});

type Fixture = ReturnType<typeof pathRepository>;
const today = localDate();
const ago = (n: number) => addDays(today, -n);
function weigh(
  { r }: Fixture,
  kg: number,
  daysAgo: number,
  name = "Bodyweight",
) {
  r.addJournal("measurement", { name, value: kg, unit: "kg" }, ago(daysAgo));
}
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
/** Five weigh-ins across a year and a workout so the range control shows. */
function history(f: Fixture) {
  weigh(f, 90, 200);
  weigh(f, 88, 120);
  weigh(f, 86, 40);
  weigh(f, 85, 12);
  weigh(f, 84, 1);
  logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
}
const card = (view: Awaited<ReturnType<typeof render>>, id: string) =>
  within(view.getByTestId(id));
const header = (view: Awaited<ReturnType<typeof render>>) =>
  view.getByRole("button", { name: /^Bodyweight.*Open body measurements$/ });

test("bodyweight follows the range: its weigh-ins, its starting point and the change", async () => {
  const f = pathRepository();
  try {
    history(f);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const bw = () => card(view, "bodyweight-card");
    // 12 weeks: three weigh-ins; the range began at 88 kg (120 days ago).
    expect(
      bw().getByLabelText(`Current · ${dayLabel(ago(1))}: 84 kg`),
    ).toBeTruthy();
    expect(
      bw().getByLabelText(`Start · ${dayLabel(ago(120))}: 88 kg`),
    ).toBeTruthy();
    expect(header(view).props.accessibilityLabel).toBe(
      `Bodyweight, −4 kg (−4.5%) since ${dayLabel(ago(120))}. Open body measurements`,
    );
    const chart = () => bw().getByLabelText("Bodyweight trend");
    const points = async () => {
      // Count the points by stepping back to the first one.
      let n = 1;
      let last = chart().props.accessibilityValue.text;
      for (;;) {
        await fireEvent(chart(), "accessibilityAction", {
          nativeEvent: { actionName: "decrement" },
        });
        const now = chart().props.accessibilityValue.text;
        if (now === last) return n;
        last = now;
        n++;
      }
    };
    expect(await points()).toBe(3);
    // 4 weeks: two weigh-ins, measured from 86 kg (40 days ago).
    await fireEvent.press(view.getByRole("tab", { name: "4 weeks" }));
    expect(header(view).props.accessibilityLabel).toBe(
      `Bodyweight, −2 kg (−2.3%) since ${dayLabel(ago(40))}. Open body measurements`,
    );
    expect(chart().props.accessibilityValue.text).toBe(
      `84 kg, ${dayLabel(ago(1))}`,
    );
    expect(await points()).toBe(2);
    // 1 year and all time: every weigh-in, from the first one.
    for (const spoken of ["1 year", "All time"]) {
      await fireEvent.press(view.getByRole("tab", { name: spoken }));
      expect(header(view).props.accessibilityLabel).toBe(
        `Bodyweight, −6 kg (−6.7%) since ${dayLabel(ago(200))}. Open body measurements`,
      );
      expect(await points()).toBe(5);
    }
    // The header opens the existing measurements screen.
    await fireEvent.press(header(view));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/journal",
      params: { kind: "measurement" },
    });
  } finally {
    f.db.close();
  }
});

test("bodyweight in pounds: the same weigh-ins, converted for display only", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    history(f);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const bw = card(view, "bodyweight-card");
    expect(
      bw.getByLabelText(`Current · ${dayLabel(ago(1))}: 185.2 lb`),
    ).toBeTruthy();
    expect(header(view).props.accessibilityLabel).toMatch(
      /^Bodyweight, −8\.8 lb \(−4\.5%\) since /,
    );
    expect(
      bw.getByLabelText("Bodyweight trend").props.accessibilityValue.text,
    ).toBe(`185.2 lb, ${dayLabel(ago(1))}`);
    // Stored values are untouched kilograms.
    expect(
      f.r
        .journal("measurement")
        .map((e) => e.data.value)
        .sort(),
    ).toEqual([84, 85, 86, 88, 90]);
  } finally {
    f.db.close();
  }
});

test("sparse and empty bodyweight: nothing invented", async () => {
  const f = pathRepository();
  try {
    weigh(f, 82, 40);
    weigh(f, 50, 3, "Waist"); // a mass entry under another name is not bodyweight
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const bw = () => card(view, "bodyweight-card");
    // 12 weeks: one weigh-in, no change, an invitation for the next.
    expect(
      bw().getByLabelText(`Current · ${dayLabel(ago(40))}: 82 kg`),
    ).toBeTruthy();
    expect(bw().queryByLabelText(/^Start/)).toBeNull();
    expect(header(view).props.accessibilityLabel).toBe(
      "Bodyweight. Open body measurements",
    );
    expect(
      bw().getByText("Your trend line appears after your next weigh-in."),
    ).toBeTruthy();
    // 4 weeks: none in range; the latest stays visible, nothing is plotted.
    await fireEvent.press(view.getByRole("tab", { name: "4 weeks" }));
    expect(bw().getByText("No weigh-ins in the last 4 weeks.")).toBeTruthy();
    expect(bw().queryByLabelText("Bodyweight trend")).toBeNull();
    expect(
      bw().getByLabelText(`Current · ${dayLabel(ago(40))}: 82 kg`),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }

  // No weigh-in at all (and no workout yet): an invitation to log one.
  const g = pathRepository();
  try {
    jest.mocked(useRepo).mockReturnValue(g.r);
    const view = await render(<Progress />);
    const bw = card(view, "bodyweight-card");
    expect(
      bw.getByText(
        "Log your bodyweight and Forge charts it here, range by range.",
      ),
    ).toBeTruthy();
    await fireEvent.press(bw.getByRole("button", { name: "Log bodyweight" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/journal",
      params: { kind: "measurement" },
    });
  } finally {
    g.db.close();
  }
});

test("training volume: load or workouts, same buckets, never confused with sets", async () => {
  const f = pathRepository();
  try {
    // 100 × 5 × 2 + 140 × 5 = 1,700 kg over three working sets, two workouts;
    // a pull-up adds a working set but no load.
    logWorkout(f, 2, [
      [
        "barbell-bench-press",
        [
          [100, 5],
          [100, 5],
        ],
      ],
    ]);
    logWorkout(f, 9, [
      ["back-squat", [[140, 5]]],
      ["pull-up", [[0, 8]]],
    ]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const vol = () => card(view, "volume-card");
    expect(
      vol().getByLabelText("Training volume measure").props.accessibilityRole,
    ).toBe("tablist");
    expect(
      vol().getByLabelText(
        "Total volume · the last 12 weeks: 1,700 kg, 4 working sets",
      ),
    ).toBeTruthy();
    // Every week's bar carries its own load and sets; together they make
    // the range's total (stepping back from this week to the first).
    const bars = () => vol().getByLabelText("Volume by week");
    const seen = new Set<string>([bars().props.accessibilityValue.text]);
    for (let i = 0; i < 12; i++) {
      await fireEvent(bars(), "accessibilityAction", {
        nativeEvent: { actionName: "decrement" },
      });
      seen.add(bars().props.accessibilityValue.text);
    }
    const parts = [...seen].map((t) =>
      /^Week of .+ · ([\d,]+) kg · (\d+) working sets?$/.exec(t),
    );
    expect(parts.every(Boolean)).toBe(true);
    const sum = (k: 1 | 2) =>
      parts.reduce((n, m) => n + Number(m![k]!.replace(/,/g, "")), 0);
    expect(sum(1)).toBe(1700);
    expect(sum(2)).toBe(4); // Workouts: counts, not sets, in the same weekly buckets.
    const workouts = vol().getByRole("tab", { name: "Workouts" });
    expect(
      StyleSheet.flatten(workouts.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    await fireEvent.press(workouts);
    expect(
      vol().getByLabelText("Workouts · the last 12 weeks: 2"),
    ).toBeTruthy();
    expect(vol().getByLabelText("Workouts completed by week")).toBeTruthy();
    expect(vol().queryByLabelText("Volume by week")).toBeNull();
    // 1 year: monthly buckets, same totals.
    await fireEvent.press(view.getByRole("tab", { name: "1 year" }));
    expect(vol().getByLabelText("Workouts completed by month")).toBeTruthy();
    await fireEvent.press(vol().getByRole("tab", { name: "Volume" }));
    expect(vol().getByLabelText("Volume by month")).toBeTruthy();
    expect(
      vol().getByLabelText(
        "Total volume · the last 1 year: 1,700 kg, 4 working sets",
      ),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("training volume in pounds, and empty ranges say so", async () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ units: "lb" });
    logWorkout(f, 60, [["back-squat", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const vol = () => card(view, "volume-card");
    // 500 kg ≈ 1,102 lb.
    expect(
      vol().getByLabelText(
        /^Total volume · the last 12 weeks: 1,10[23] lb, 1 working set$/,
      ),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "4 weeks" }));
    expect(
      vol().getByText("No working sets in the last 4 weeks."),
    ).toBeTruthy();
    await fireEvent.press(vol().getByRole("tab", { name: "Workouts" }));
    expect(
      vol().getByText("No finished workouts in the last 4 weeks."),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("light mode: ember change, light card text; the sections keep their order", async () => {
  mockProfile = { theme: "light" };
  const f = pathRepository();
  try {
    history(f);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const change = card(view, "bodyweight-card").getByText("−4 kg (−4.5%)");
    expect(StyleSheet.flatten(change.props.style).color).toBe(
      theme.palettes.light.emberHot,
    );
    // Range → Overview → Bodyweight → Training volume → Strength → Consistency.
    const order = [
      "Bodyweight. Open body measurements",
      "Training volume",
      "Strength",
      "Consistency",
      "Records",
      "Training time",
    ].map((name) =>
      view.container
        .queryAll(() => true)
        .findIndex(
          (n) =>
            n.props.accessibilityLabel === name ||
            (n.props.accessibilityRole === "header" &&
              [n.props.children].flat().join("") === name),
        ),
    );
    // The bodyweight header carries its change, so find it by prefix.
    order[0] = view.container
      .queryAll(() => true)
      .findIndex((n) =>
        String(n.props.accessibilityLabel ?? "").startsWith("Bodyweight,"),
      );
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  } finally {
    f.db.close();
  }
});

test("PD-2: other measurements follow the range too; all time is every entry", async () => {
  const f = pathRepository();
  try {
    f.r.addJournal(
      "measurement",
      { name: "Waist", value: 90, unit: "cm" },
      ago(200),
    );
    f.r.addJournal(
      "measurement",
      { name: "Waist", value: 86, unit: "cm" },
      ago(10),
    );
    logWorkout(f, 2, [["barbell-bench-press", [[100, 5]]]]);
    jest.mocked(useRepo).mockReturnValue(f.r);
    const view = await render(<Progress />);
    const chart = () => view.getByLabelText("Waist trend");
    const first = async () => {
      await fireEvent(chart(), "accessibilityAction", {
        nativeEvent: { actionName: "decrement" },
      });
      return chart().props.accessibilityValue.text as string;
    };
    // 12 weeks: only the recent entry (stepping back stays on it).
    expect(await first()).toBe(`86 cm, ${dayLabel(ago(10))}`);
    await fireEvent.press(view.getByRole("tab", { name: "All time" }));
    expect(await first()).toBe(`90 cm, ${dayLabel(ago(200))}`);
  } finally {
    f.db.close();
  }
});
