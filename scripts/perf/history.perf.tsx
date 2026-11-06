import React from "react";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { render } from "@testing-library/react-native";
import { Repository } from "../../src/data/repository";
import { useRepo } from "../../src/state";
import { localDate } from "../../src/domain/types";
import { addDays } from "../../src/domain/paths/model";
import { goalSources } from "../../src/data/goal-sources";
import { evaluate, type Goal } from "../../src/domain/goals";
import { libraryPrograms } from "../../src/programs";
import { enrollProgram } from "../../src/data/programs";
import Home from "../../src/screens/Home";
import Train from "../../app/(tabs)/train";
import NutritionTab from "../../app/(tabs)/nutrition";
import Progress from "../../app/(tabs)/progress";
import You from "../../src/screens/You";
import History from "../../src/screens/History";
import WorkoutScreen from "../../src/screens/Workout";

// Phase 8.5 (M2): how much work opening each tab and the logger, and
// redrawing them after a saved change, costs with a long training history.
// Not part of the test suites; run it on demand:
//
//   npx jest --testMatch "**/scripts/perf/*.perf.tsx" --runInBand
//
// PERF_WEEKS ("0,52,156") sets the histories; PERF_OUT saves the results as
// JSON. Times are milliseconds on this computer's CPU, in Jest with
// node:sqlite and the React test renderer: compare them with each other, not
// with a phone. Query counts don't depend on the computer.

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
  usePathname: () => "/",
}));
jest.mock("../../src/notifications", () => ({
  notificationsAvailable: true,
  notifyAt: jest.fn(async () => {}),
  restNotification: jest.fn(async () => {}),
  cancelRestNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => {}),
  enableNotifications: jest.fn(async () => true),
}));
jest.setTimeout(1_800_000);

type Cost = { ms: number; queries: number };
const stats = { queries: 0 };
const today = localDate();

function counted(db: DatabaseSync) {
  return {
    exec: (sql: string) => db.exec(sql),
    run: (sql: string, params: (string | number | null)[] = []) => {
      stats.queries++;
      db.prepare(sql).run(...params);
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => {
      stats.queries++;
      return db.prepare(sql).all(...params) as T[];
    },
  };
}
async function cost(fn: () => unknown): Promise<Cost> {
  stats.queries = 0;
  const t = performance.now();
  await fn();
  return { ms: +(performance.now() - t).toFixed(1), queries: stats.queries };
}
const median = (xs: Cost[]) =>
  [...xs].sort((a, b) => a.ms - b.ms)[Math.floor(xs.length / 2)]!;

/**
 * Four sessions a week of six exercises (24 lifts in rotation, four sets
 * each), four food entries a day, a weekly weigh-in, a check-in every other
 * day and four goals; nothing waiting to sync.
 */
function seed(r: Repository, db: DatabaseSync, weeks: number) {
  const lifts = r
    .exercises()
    .map((e) => e.id)
    .filter((id) => /^(barbell|dumbbell)-/.test(id))
    .slice(0, 24);
  if (!lifts.includes("barbell-bench-press")) lifts[0] = "barbell-bench-press";
  let n = 0;
  for (let week = weeks; week > 0; week--)
    for (const d of [0, 1, 3, 5]) {
      const date = addDays(today, d - week * 7);
      if (date >= today) continue;
      r.transaction(() => {
        const w = r.startWorkout(`Session ${n}`);
        for (let k = 0; k < 6; k++) {
          const row = r.addExercise(w.id, lifts[(n * 6 + k) % lifts.length]!);
          for (let s = 0; s < 4; s++)
            r.addSet(row.id, {
              weight: 40 + k * 10 + (n % 20) * 1.25,
              reps: 5 + ((n + s) % 6),
              completed: true,
            });
        }
        r.finishWorkout(w.id);
        const end = new Date(`${date}T18:00:00`).getTime();
        db.prepare(
          "UPDATE workouts SET started_at=?, finished_at=? WHERE id=?",
        ).run(end - 3_600_000, end, w.id);
      });
      n++;
    }
  for (let day = weeks * 7; day > 0; day--) {
    const date = addDays(today, -day);
    r.transaction(() => {
      for (const meal of ["Breakfast", "Lunch", "Dinner", "Snack"])
        r.addJournal(
          "nutrition",
          {
            name: `${meal} ${day}`,
            calories: 450 + (day % 7) * 13.5,
            protein: 30,
            carbs: 50,
            fat: 15,
            quantity: 1,
            serving: "1 serving",
            meal,
          },
          date,
        );
      if (day % 7 === 0)
        r.addJournal(
          "measurement",
          { name: "Bodyweight", value: 90 - day * 0.005, unit: "kg" },
          date,
        );
      if (day % 2 === 0)
        r.addJournal(
          "recovery",
          { sleep: 7.5, quality: 4, soreness: 2, energy: 4, stress: 2 },
          date,
        );
    });
  }
  const goals: Record<string, string | number>[] = [
    {
      name: "Bench 120",
      metric: "strength",
      exerciseId: "barbell-bench-press",
      target: 120,
      start: 80,
      reps: 1,
    },
    { name: "Cut to 80", metric: "bodyweight", target: 80, start: 90 },
    { name: "Four a week", metric: "workouts", target: 4 },
    { name: "Volume", metric: "volume", target: 100_000 },
  ];
  for (const goal of goals) r.addJournal("goal", { ...goal, goalRules: 2 });
  db.exec("DELETE FROM outbox");
  return n;
}

/** Median of three opens, and of five redraws after a saved change. */
async function screen(el: () => React.ReactElement) {
  await (await render(el())).unmount();
  const opens: Cost[] = [];
  const changes: Cost[] = [];
  for (let i = 0; i < 3; i++) {
    let view: Awaited<ReturnType<typeof render>> | undefined;
    opens.push(
      await cost(async () => {
        view = await render(el());
      }),
    );
    for (let j = 0; i === 2 && j < 5; j++) {
      mockRevision++;
      changes.push(await cost(() => view!.rerender(el())));
    }
    await view!.unmount();
  }
  return { open: median(opens), change: median(changes) };
}

const results: Record<string, unknown> = {};
afterAll(() => {
  if (process.env.PERF_OUT)
    writeFileSync(process.env.PERF_OUT, JSON.stringify(results, null, 1));
});

const sizes = (process.env.PERF_WEEKS ?? "0,52,156").split(",").map(Number);
for (const weeks of sizes)
  test(`${weeks} weeks of training`, async () => {
    const db = new DatabaseSync(":memory:");
    const r = new Repository(counted(db));
    r.migrate();
    r.saveProfile({ onboarded: true, height: 180, weight: 85 });
    const workouts = seed(r, db, weeks);
    jest.mocked(useRepo).mockReturnValue(r);
    const p = r.profile();
    const out: Record<string, unknown> = {
      workouts,
      relaunch: await cost(() => new Repository(counted(db)).migrate()),
      home: await screen(() => <Home />),
      train: await screen(() => <Train />),
      nutrition: await screen(() => <NutritionTab />),
      progress: await screen(() => <Progress />),
      you: await screen(() => <You />),
      history: await screen(() => <History />),
      goals: await cost(() => {
        const s = goalSources(r, today, p.units);
        (r.journal("goal") as Goal[]).map((g) => evaluate(g, s));
      }),
      exerciseSearch: await cost(() => r.exercises("bench")),
      foodLog: await cost(() => r.journal("nutrition")),
    };
    // The logger: six exercises of four sets, two done; a saved set redraws
    // it (median of 40, after 5 to warm up).
    const live = r.startWorkout("Live");
    let target = "";
    for (let k = 0; k < 6; k++) {
      const row = r.addExercise(live.id, "barbell-bench-press");
      for (let s = 0; s < 4; s++) {
        const set = r.addSet(row.id, { weight: 80, reps: 8, completed: s < 2 });
        if (k === 2 && s === 2) target = set.id;
      }
    }
    const logger = await render(<WorkoutScreen />);
    const saves: Cost[] = [];
    for (let i = 0; i < 45; i++) {
      mockRevision++;
      const c = await cost(() => logger.rerender(<WorkoutScreen />));
      if (i >= 5) saves.push(c);
    }
    await logger.unmount();
    out.loggerSave = median(saves);
    out.editSet = await cost(() => r.editSet(target, { weight: 82.5 }));
    r.deleteWorkout(live.id);
    enrollProgram(r, libraryPrograms()[0]!, today);
    out.homeWithProgram = await screen(() => <Home />);
    out.trainWithProgram = await screen(() => <Train />);
    results[`${weeks}w`] = out;
    console.log(`${weeks} weeks (${workouts} workouts)`, out);
    db.close();
  });
