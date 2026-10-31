import React from "react";
import { render, within } from "@testing-library/react-native";
import Home from "../../src/screens/Home";
import Progress from "../../app/(tabs)/progress";
import You from "../../src/screens/You";
import History from "../../src/screens/History";
import NutritionTab from "../../app/(tabs)/nutrition";
import { useRepo } from "../../src/state";
import { pathRepository } from "../path-fixture";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { kgToLb, summary } from "../../src/domain/metrics";
import { TARGETS_SAVED } from "../../src/domain/nutrition";

// Phase 7.6: one product, one source of truth. The same records read the
// same on Home, Train's history, Progress, Nutrition and You, after changes,
// as each tab renders when it is switched to.

jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: undefined }) => unknown) =>
      selector({ revision: mockRevision, profile: undefined }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
let mockRevision = 0;
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

const today = localDate();
type F = ReturnType<typeof pathRepository>;
function setup(profile: Parameters<F["r"]["saveProfile"]>[0] = {}) {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, height: 180, weight: 80, ...profile });
  jest.mocked(useRepo).mockReturnValue(f.r);
  return f;
}
/** A finished workout on a day, with completed sets and planned ones never done. */
function trained(
  { r, db }: F,
  daysAgo: number,
  done: [number, number][],
  planned: [number, number][] = [],
) {
  const w = r.startWorkout(`Session ${daysAgo}`);
  const row = r.addExercise(w.id, "barbell-bench-press");
  for (const [weight, reps] of done)
    r.editSet(r.addSet(row.id).id, { weight, reps, completed: true });
  for (const [weight, reps] of planned) r.addSet(row.id, { weight, reps });
  r.finishWorkout(w.id);
  const end = new Date(`${addDays(today, -daysAgo)}T18:00:00`).getTime();
  db.prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?").run(
    end - 2700000,
    end,
    w.id,
  );
}
/** Renders one tab, as switching to it does, and returns it. */
const open = (screen: React.ReactElement) => render(screen);

test("training: counts, streak and volume agree across Home, Progress, History and You", async () => {
  const f = setup();
  try {
    // Two finished workouts on consecutive days; a planned 100 kg set was
    // never done and must count nowhere. A workout in progress counts nowhere.
    trained(
      f,
      0,
      [
        [80, 5],
        [80, 5],
      ],
      [[100, 3]],
    );
    trained(f, 1, [[60, 10]]);
    f.r.startWorkout("Live");
    const volume = 80 * 5 * 2 + 60 * 10;
    const life = summary(f.r.workouts(), (id) => f.r.workoutSets(id));
    expect(life).toMatchObject({ count: 2, streak: 2, totalVolume: volume });

    const home = await open(<Home />);
    expect(home.getByLabelText("2 day streak. Open progress")).toBeTruthy();
    await home.unmount();

    const progress = await open(<Progress />);
    expect(progress.getByLabelText("2 day streak")).toBeTruthy();
    const all = within(progress.getByTestId("all-time"));
    expect(all.getByLabelText("Total workouts: 2")).toBeTruthy();
    expect(
      all.getByLabelText(`Total volume: ${volume.toLocaleString()} kg`),
    ).toBeTruthy();
    await progress.unmount();

    const history = await open(<History />);
    expect(history.getByText("2 workouts")).toBeTruthy();
    expect(history.getAllByText(/1 exercise · (800|600) kg$/)).toHaveLength(2);
    expect(history.queryByText(/1,100 kg|Live/)).toBeNull();
    await history.unmount();

    const you = await open(<You />);
    const strip = within(you.getByTestId("you-performance"));
    expect(strip.getByLabelText("Workouts completed: 2")).toBeTruthy();
    expect(strip.getByLabelText("Day streak: 2")).toBeTruthy();
    expect(you.getByLabelText("2 day streak. Open progress")).toBeTruthy();
    await you.unmount();

    // Pounds everywhere after the unit changes.
    f.r.saveProfile({ units: "lb" });
    mockRevision++;
    const lb = Math.round(kgToLb(volume)).toLocaleString();
    const again = await open(<Progress />);
    expect(
      within(again.getByTestId("all-time")).getByLabelText(
        `Total volume: ${lb} lb`,
      ),
    ).toBeTruthy();
    await again.unmount();
    const rows = await open(<History />);
    expect(
      rows.getByText(
        `45 min · 1 exercise · ${Math.round(kgToLb(800)).toLocaleString()} lb`,
      ),
    ).toBeTruthy();
    await rows.unmount();
  } finally {
    f.db.close();
  }
});

test("deleting a workout updates every tab's totals", async () => {
  const f = setup();
  try {
    trained(f, 0, [[80, 5]]);
    trained(f, 3, [[60, 10]]);
    const older = f.r.workouts().find((w) => w.name === "Session 3")!;
    f.r.deleteWorkout(older.id);
    mockRevision++;
    const progress = await open(<Progress />);
    expect(
      within(progress.getByTestId("all-time")).getByLabelText(
        "Total workouts: 1",
      ),
    ).toBeTruthy();
    await progress.unmount();
    const you = await open(<You />);
    expect(
      within(you.getByTestId("you-performance")).getByLabelText(
        "Workout completed: 1",
      ),
    ).toBeTruthy();
    await you.unmount();
    const history = await open(<History />);
    expect(history.getByText("1 workout")).toBeTruthy();
  } finally {
    f.db.close();
  }
});

test("a goal reads the same on Home, Progress and You, before and after an edit", async () => {
  const f = setup();
  try {
    f.r.addJournal(
      "measurement",
      { name: "Bodyweight", value: 85, unit: "kg" },
      today,
    );
    const g = f.r.addJournal("goal", {
      name: "Cut to 80",
      metric: "bodyweight",
      target: 80,
      start: 90,
      goalRules: 2,
    });
    const check = async (target: string, left: string) => {
      const home = await open(<Home />);
      expect(home.getByText("Cut to 80")).toBeTruthy();
      expect(home.getByText(target)).toBeTruthy();
      expect(home.getByText(left)).toBeTruthy();
      await home.unmount();
      const progress = await open(<Progress />);
      const next = within(progress.getByTestId("next-goals-card"));
      expect(next.getByText("Cut to 80")).toBeTruthy();
      expect(next.getByText(target)).toBeTruthy();
      await progress.unmount();
      const you = await open(<You />);
      const primary = within(you.getByTestId("you-goal"));
      expect(primary.getByText(target)).toBeTruthy();
      expect(primary.getByText(left)).toBeTruthy();
      await you.unmount();
    };
    await check("Target 80 kg", "5 kg to go");
    f.r.updateJournal(g.id, { ...g.data, target: 82 });
    mockRevision++;
    await check("Target 82 kg", "3 kg to go");
  } finally {
    f.db.close();
  }
});

test("nutrition: Home and the Nutrition tab show the same day and targets", async () => {
  const f = setup({ calories: 2400, protein: 180 });
  try {
    f.r.setSetting(TARGETS_SAVED, "1");
    f.r.addJournal(
      "nutrition",
      {
        name: "Chicken rice",
        calories: 620,
        protein: 55,
        carbs: 70,
        fat: 18,
        quantity: 1,
        meal: "Lunch",
      },
      today,
    );
    // Yesterday's food is not today's.
    f.r.addJournal(
      "nutrition",
      {
        name: "Oats",
        calories: 300,
        protein: 10,
        carbs: 50,
        fat: 5,
        quantity: 1,
        meal: "Breakfast",
      },
      addDays(today, -1),
    );
    const home = await open(<Home />);
    const card = within(home.getByRole("button", { name: "Nutrition today" }));
    expect(card.getByText("620")).toBeTruthy();
    expect(card.getByText("of 2,400")).toBeTruthy();
    await home.unmount();
    const tab = await open(<NutritionTab />);
    expect(
      tab.getByLabelText("620 of 2,400 calories, 1,780 left"),
    ).toBeTruthy();
    await tab.unmount();
    // A new target (Preferences, or Nutrition's own sheet) reaches both.
    f.r.saveProfile({ calories: 2600 });
    mockRevision++;
    const after = await open(<Home />);
    expect(
      within(after.getByRole("button", { name: "Nutrition today" })).getByText(
        "of 2,600",
      ),
    ).toBeTruthy();
    await after.unmount();
    const tab2 = await open(<NutritionTab />);
    expect(
      tab2.getByLabelText("620 of 2,600 calories, 1,980 left"),
    ).toBeTruthy();
  } finally {
    f.db.close();
  }
});
