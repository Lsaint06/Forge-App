import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyweight,
  greeting,
  homeClock,
  nextTarget,
  phaseLabel,
  weekDays,
} from "../src/screens/home/model";
import { pairFits } from "../src/components/reforge/layout";
import type { GoalView } from "../src/domain/goals";
import type { Journal, Workout } from "../src/domain/types";

// Phase 7.1B: Home's presentation rules over existing data.

test("the greeting follows the hour and uses the first name only", () => {
  assert.equal(greeting("Alex Carter", 9), "Good morning, Alex.");
  assert.equal(greeting("Alex", 12), "Good afternoon, Alex.");
  assert.equal(greeting("Alex", 16), "Good afternoon, Alex.");
  assert.equal(greeting("Alex", 17), "Good evening, Alex.");
  assert.equal(greeting("Alex", 2), "Good evening, Alex.");
  // The default profile name and an empty name get no name.
  assert.equal(greeting("Athlete", 9), "Good morning.");
  assert.equal(greeting("  ", 9), "Good morning.");
});

test("program phase names drop their week range", () => {
  assert.equal(phaseLabel("Weeks 1–3 · Accumulation"), "Accumulation");
  assert.equal(phaseLabel("Week 4 · Lower fatigue"), "Lower fatigue");
  assert.equal(phaseLabel("Foundation"), "Foundation");
});

const view = (
  id: string,
  over: Partial<GoalView> & { createdAt?: number } = {},
): GoalView =>
  ({
    goal: {
      id,
      date: "2026-10-01",
      createdAt: over.createdAt ?? 1,
      updatedAt: 1,
      data: {},
    },
    type: "bodyweight",
    habit: false,
    status: "active",
    name: id,
    measure: "",
    target: "",
    state: "",
    reached: false,
    historical: false,
    notes: [],
    spoken: id,
    ...over,
  }) as GoalView;

test("next target: the measured, unreached goal closest to its target", () => {
  assert.equal(
    nextTarget([
      view("far", { ratio: 0.2 }),
      view("close", { ratio: 0.8 }),
      view("done", { ratio: 1, reached: true }),
      view("habit", { ratio: 0.9, habit: true }),
      view("archived", { ratio: 0.95, status: "archived" }),
    ])?.goal.id,
    "close",
  );
  // Ties go to the most recently created goal.
  assert.equal(
    nextTarget([
      view("older", { ratio: 0.5, createdAt: 1 }),
      view("newer", { ratio: 0.5, createdAt: 2 }),
    ])?.goal.id,
    "newer",
  );
  // Otherwise the newest active goal with a recorded value.
  assert.equal(
    nextTarget([
      view("no-value"),
      view("habit", { habit: true, current: "2 of 3 this week", createdAt: 3 }),
      view("reached", { reached: true, current: "80 kg", createdAt: 2 }),
    ])?.goal.id,
    "habit",
  );
  assert.equal(nextTarget([view("nothing")]), undefined);
  assert.equal(nextTarget([]), undefined);
});

test("this week's training days run Monday to Sunday", () => {
  // Wednesday 2026-10-21.
  const now = new Date("2026-10-21T15:00:00").getTime();
  const w = (iso: string, status: Workout["status"] = "completed") =>
    ({
      id: iso,
      status,
      startedAt: new Date(iso).getTime(),
      finishedAt: status === "completed" ? new Date(iso).getTime() : null,
    }) as Workout;
  assert.deepEqual(
    weekDays(
      [
        w("2026-10-19T08:00:00"), // Monday
        w("2026-10-21T07:00:00"), // Wednesday
        w("2026-10-18T08:00:00"), // last Sunday: previous week
        w("2026-10-22T08:00:00", "active"),
      ],
      now,
    ),
    [true, false, true, false, false, false, false],
  );
});

test("bodyweight: the latest weigh-in in the lifter's units, else the profile", () => {
  const m = (value: number, date: string, createdAt = 1) =>
    ({
      id: date,
      kind: "measurement",
      date,
      createdAt,
      updatedAt: createdAt,
      data: { name: "Bodyweight", value, unit: "kg" },
    }) as Journal;
  assert.deepEqual(
    bodyweight([m(82, "2026-10-01"), m(81.25, "2026-10-20")], {
      weight: 90,
      units: "kg",
    }),
    { value: 81.3, unit: "kg", date: "2026-10-20" },
  );
  assert.deepEqual(
    bodyweight([m(80, "2026-10-20")], { weight: 0, units: "lb" }),
    {
      value: 176.4,
      unit: "lb",
      date: "2026-10-20",
    },
  );
  assert.deepEqual(bodyweight([], { weight: 75, units: "kg" }), {
    value: 75,
    unit: "kg",
  });
  assert.equal(bodyweight([], { weight: 0, units: "kg" }), undefined);
});

test("one clock reading drives every date on Home", () => {
  const t = new Date("2026-10-24T21:30:00").getTime();
  assert.deepEqual(homeClock(t), { now: t, today: "2026-10-24", hour: 21 });
});

test("snapshot and nutrition sit side by side only where both fit", () => {
  // Content widths: iPhone SE/mini 343, standard 361, Pro Max 398 (pt).
  assert.equal(pairFits(343, 1, 170), false);
  assert.equal(pairFits(361, 1, 170), true);
  assert.equal(pairFits(398, 1, 170), true);
  // Larger text stacks them.
  assert.equal(pairFits(361, 1.2, 170), false);
  assert.equal(pairFits(398, 1.3, 170), false);
});
