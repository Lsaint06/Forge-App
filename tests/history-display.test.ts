import test from "node:test";
import assert from "node:assert/strict";
import { historyRow, sharedDays } from "../src/domain/presentation/history";
import { loggedSummary } from "../src/domain/workout-display";
import { dayLabel } from "../src/domain/training-display";
import { kgToLb } from "../src/domain/metrics";
import type { Workout, WorkoutSet } from "../src/domain/types";

// Phase 7.5E: workout history rows and the review's logged summary.

const at = (date: string, time = "18:00:00") =>
  new Date(`${date}T${time}`).getTime();
function workout(
  id: string,
  date: string,
  minutes: number,
  name = "Push day",
  time?: string,
): Workout {
  const end = at(date, time);
  return {
    id,
    name,
    status: "completed",
    startedAt: end - minutes * 60000,
    finishedAt: end,
    pausedMs: 0,
  } as unknown as Workout;
}
let n = 0;
function set(patch: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: `s${n++}`,
    exerciseRowId: "row",
    position: 0,
    weight: 0,
    reps: 0,
    duration: 0,
    distance: 0,
    rpe: null,
    rir: null,
    kind: "working",
    completed: true,
    rest: 90,
    ...patch,
  } as WorkoutSet;
}

test("history row: date block, title and only what was recorded", () => {
  const row = historyRow(
    workout("a", "2026-10-21", 52, "Forge Strength · Upper A"),
    { exercises: 4, volumeKg: 12400 },
    "kg",
  );
  assert.equal(row.id, "a");
  assert.equal(row.name, "Forge Strength · Upper A");
  assert.equal(row.title, "Upper A");
  assert.equal(row.day, dayLabel("2026-10-21"));
  assert.equal(row.date.number, "21");
  assert.ok(row.date.weekday.length > 0);
  assert.deepEqual(row.meta, ["52 min", "4 exercises", "12,400 kg"]);
});

test("history row: pounds, singulars and missing data left out, never zero", () => {
  assert.deepEqual(
    historyRow(
      workout("b", "2026-10-21", 30),
      { exercises: 1, volumeKg: 100 },
      "lb",
    ).meta,
    ["30 min", "1 exercise", `${Math.round(kgToLb(100))} lb`],
  );
  // Under a minute, no volume: neither is shown as zero.
  assert.deepEqual(
    historyRow(
      workout("c", "2026-10-21", 0),
      { exercises: 2, volumeKg: 0 },
      "kg",
    ).meta,
    ["2 exercises"],
  );
  // No exercises: said plainly.
  assert.deepEqual(
    historyRow(
      workout("d", "2026-10-21", 5),
      { exercises: 0, volumeKg: 0 },
      "kg",
    ).meta,
    ["5 min", "No exercises logged"],
  );
});

test("same-day workouts: each keeps its row, led by its finish time", () => {
  const morning = workout("m", "2026-10-21", 40, "Push day", "07:30:00");
  const evening = workout("e", "2026-10-21", 40, "Push day", "18:15:00");
  const other = workout("o", "2026-10-20", 40);
  const shared = sharedDays([evening, morning, other]);
  assert.deepEqual([...shared], ["2026-10-21"]);
  const rows = [evening, morning].map((w) =>
    historyRow(w, { exercises: 1, volumeKg: 100 }, "kg", true),
  );
  // Same name, same day: two rows, two ids, two different times.
  assert.notEqual(rows[0]!.id, rows[1]!.id);
  assert.notEqual(rows[0]!.meta[0], rows[1]!.meta[0]);
  assert.match(rows[1]!.meta[0]!, /7.30|7:30/);
  assert.equal(
    historyRow(other, { exercises: 1, volumeKg: 100 }, "kg").meta[0],
    "40 min",
  );
});

test("logged summary: completed sets and the heaviest working set", () => {
  assert.equal(
    loggedSummary(
      [
        set({ weight: 60, reps: 8, kind: "warmup" }),
        set({ weight: 80, reps: 5 }),
        set({ weight: 80, reps: 6 }),
        set({ weight: 75, reps: 8 }),
      ],
      "strength",
      "kg",
    ),
    "4 sets · top set 80 kg × 6",
  );
  // A heavier warm-up is never the best; pounds are shown in pounds.
  assert.equal(
    loggedSummary(
      [
        set({ weight: 100, reps: 1, kind: "warmup" }),
        set({ weight: 50, reps: 5 }),
      ],
      "strength",
      "lb",
    ),
    `2 sets · top set ${Math.round(kgToLb(50) * 100) / 100} lb × 5`,
  );
});

test("logged summary: incomplete, unloaded and empty exercises are honest", () => {
  assert.equal(
    loggedSummary(
      [
        set({ weight: 80, reps: 5 }),
        set({ weight: 90, reps: 5, completed: false }),
      ],
      "strength",
      "kg",
    ),
    "1 of 2 sets · top set 80 kg × 5",
  );
  assert.equal(
    loggedSummary([set({ reps: 12 }), set({ reps: 15 })], "strength", "kg"),
    "2 sets · best 15 reps",
  );
  assert.equal(
    loggedSummary([set({ completed: false })], "strength", "kg"),
    "0 of 1 set",
  );
  assert.equal(loggedSummary([], "strength", "kg"), "No sets logged");
});

test("logged summary: duration and distance exercises", () => {
  assert.equal(
    loggedSummary(
      [set({ duration: 45 }), set({ duration: 30 })],
      "duration",
      "kg",
    ),
    "2 sets · longest 45 s",
  );
  assert.equal(
    loggedSummary([set({ duration: 95 })], "duration", "kg"),
    "1 set · longest 1:35",
  );
  assert.equal(
    loggedSummary([set({ distance: 1200, duration: 300 })], "distance", "kg"),
    "1 set · longest 1,200 m",
  );
});
