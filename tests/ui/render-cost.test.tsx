import React from "react";
import { DatabaseSync } from "node:sqlite";
import { render } from "@testing-library/react-native";
import { Repository } from "../../src/data/repository";
import { useRepo } from "../../src/state";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import Home from "../../src/screens/Home";
import Train from "../../app/(tabs)/train";
import NutritionTab from "../../app/(tabs)/nutrition";
import Progress from "../../app/(tabs)/progress";
import You from "../../src/screens/You";
import WorkoutScreen from "../../src/screens/Workout";

// Phase 8.5 (M2): opening a tab or the logger, and redrawing it after a
// saved change, reads the same number of queries however long the training
// history is. Each finished workout used to cost several queries on Home,
// Train, Nutrition, Progress and You (about 5,000 on Home with three years of
// training), and every set saved in the logger read each exercise's whole
// history (about 2,000).

let mockRevision = 0;
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
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ kind: "nutrition" }),
}));
jest.mock("../../src/notifications", () => ({
  notificationsAvailable: true,
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));

const today = localDate();
const LIFTS = [
  "barbell-bench-press",
  "back-squat",
  "conventional-deadlift",
  "lat-pulldown",
  "dumbbell-lateral-raise",
  "dumbbell-fly",
];

/** A lifter with `weeks` of history: four sessions a week, food, weigh-ins and goals. */
function lifter(weeks: number) {
  const db = new DatabaseSync(":memory:");
  let queries = 0;
  const r = new Repository({
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      queries++;
      db.prepare(sql).run(...params);
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => {
      queries++;
      return db.prepare(sql).all(...params) as T[];
    },
  });
  r.migrate();
  r.saveProfile({ onboarded: true, height: 180, weight: 85 });
  let n = 0;
  for (let week = weeks; week > 0; week--)
    for (const d of [0, 1, 3, 5]) {
      const date = addDays(today, d - week * 7);
      if (date >= today) continue;
      const w = r.startWorkout(`Session ${n}`);
      for (let k = 0; k < 4; k++) {
        const row = r.addExercise(w.id, LIFTS[(n + k) % LIFTS.length]!);
        for (let s = 0; s < 3; s++)
          r.addSet(row.id, { weight: 60 + k * 10, reps: 8, completed: true });
      }
      r.finishWorkout(w.id);
      const end = new Date(`${date}T18:00:00`).getTime();
      db.prepare(
        "UPDATE workouts SET started_at=?, finished_at=? WHERE id=?",
      ).run(end - 3_600_000, end, w.id);
      r.addJournal(
        "nutrition",
        {
          name: "Oats",
          calories: 150,
          protein: 5,
          carbs: 27,
          fat: 3,
          quantity: 1,
          serving: "40 g",
          meal: "Breakfast",
        },
        date,
      );
      if (d === 0)
        r.addJournal(
          "measurement",
          { name: "Bodyweight", value: 85, unit: "kg" },
          date,
        );
      n++;
    }
  r.addJournal("goal", {
    name: "Bench 120",
    metric: "strength",
    exerciseId: "barbell-bench-press",
    target: 120,
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
  r.addJournal("goal", {
    name: "Four a week",
    metric: "workouts",
    target: 4,
    goalRules: 2,
  });
  return { r, db, count: () => queries, reset: () => (queries = 0) };
}

/** Queries to open a screen, then to draw it again after a saved change. */
async function cost(
  f: ReturnType<typeof lifter>,
  screen: () => React.ReactElement,
) {
  jest.mocked(useRepo).mockReturnValue(f.r);
  f.reset();
  const view = await render(screen());
  const open = f.count();
  f.reset();
  mockRevision++;
  await view.rerender(screen());
  const change = f.count();
  await view.unmount();
  return { open, change };
}

const screens: [string, () => React.ReactElement][] = [
  ["Home", () => <Home />],
  ["Train", () => <Train />],
  ["Nutrition", () => <NutritionTab />],
  ["Progress", () => <Progress />],
  ["You", () => <You />],
];

test.each(screens)(
  "%s reads as many queries with three times the history",
  async (_, screen) => {
    const short = lifter(2);
    const long = lifter(6);
    try {
      expect(long.r.workouts().length).toBeGreaterThan(
        2 * short.r.workouts().length,
      );
      expect(await cost(long, screen)).toEqual(await cost(short, screen));
    } finally {
      short.db.close();
      long.db.close();
    }
  },
  30_000,
);

test("the logger reads as many queries per saved set with three times the history", async () => {
  const short = lifter(2);
  const long = lifter(6);
  try {
    for (const { r } of [short, long]) {
      const w = r.startWorkout("Push");
      for (const lift of LIFTS.slice(0, 3)) {
        const row = r.addExercise(w.id, lift);
        r.addSet(row.id, { weight: 80, reps: 8, completed: true });
        r.addSet(row.id, { weight: 80, reps: 8 });
      }
    }
    const logger = () => <WorkoutScreen />;
    expect(await cost(long, logger)).toEqual(await cost(short, logger));
  } finally {
    short.db.close();
    long.db.close();
  }
}, 30_000);
