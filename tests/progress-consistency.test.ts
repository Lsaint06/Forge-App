import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketSummaries,
  consistency,
  dayDetail,
  weekSummaries,
  type ConsistencyInput,
  type ProgramPlan,
} from "../src/domain/progress/consistency";
import {
  buckets,
  mondayOf,
  rangeWindow,
  weekStarts,
  weekdayIndex,
} from "../src/domain/progress/range";
import { muscleSets, volumeBuckets } from "../src/domain/progress/volume";

// 2026-10-19 is a Monday.
const MON = "2026-10-19";
const day = (offset: number) => {
  const d = new Date(`${MON}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// A 3-day program suggesting Monday, Wednesday and Friday.
const program = (patch: Partial<ProgramPlan> = {}): ProgramPlan => ({
  name: "Strength 3",
  start: MON,
  end: day(60),
  weekdays: [0, 2, 4],
  done: [],
  skipped: [],
  ...patch,
});
const input = (patch: Partial<ConsistencyInput> = {}): ConsistencyInput => ({
  today: day(14), // Monday two weeks later
  workouts: [],
  programs: [],
  dated: [],
  upcoming: [],
  ...patch,
});
const workouts = (...offsets: number[]) =>
  offsets.map((o, i) => ({ date: day(o), workoutId: `w${i}`, name: `W${i}` }));

test("weeks run Monday to Sunday in local dates", () => {
  assert.equal(weekdayIndex(MON), 0);
  assert.equal(weekdayIndex(day(6)), 6);
  assert.equal(mondayOf(day(6)), MON);
  assert.equal(mondayOf(day(7)), day(7));
});

test("a three-day program trained three times in a week is fully on plan, whatever the days", () => {
  // Trained Tuesday, Thursday and Sunday: none of the suggested days.
  const i = input({
    workouts: workouts(1, 3, 6),
    programs: [program({ done: [day(1), day(3), day(6)] })],
  });
  const [week] = weekSummaries(i, [MON]);
  assert.deepEqual(
    { ...week, start: undefined, end: undefined },
    {
      start: undefined,
      end: undefined,
      completed: 3,
      planned: 3,
      onPlan: 3,
      skipped: 0,
      missed: 0,
      due: 3,
      dueDone: 3,
    },
  );
  assert.equal(consistency([week!]).adherence, 1);
});

test("rest days are never failures; only a finished week's shortfall is missed", () => {
  const i = input({
    workouts: workouts(0, 2),
    programs: [program({ done: [day(0), day(2)] })],
  });
  const [week] = weekSummaries(i, [MON]);
  assert.equal(week!.missed, 1);
  assert.equal(week!.due, 3);
  assert.equal(week!.dueDone, 2);
  // Program sessions aren't tied to dates: no individual day is "missed".
  for (let d = 0; d < 7; d++)
    assert.notEqual(dayDetail(i, day(d)).status, "missed");
  assert.equal(dayDetail(i, day(1)).status, "rest");
  assert.equal(dayDetail(i, day(5)).status, "rest");
});

test("skipped sessions are counted as skipped, not missed or done", () => {
  const i = input({
    workouts: workouts(0, 2),
    programs: [program({ done: [day(0), day(2)], skipped: [day(4)] })],
  });
  const [week] = weekSummaries(i, [MON]);
  assert.equal(week!.skipped, 1);
  assert.equal(week!.missed, 0);
  assert.equal(week!.dueDone, 2);
  assert.equal(week!.due, 3);
  assert.equal(dayDetail(i, day(4)).status, "skipped");
});

test("the current week only counts what is already done or skipped", () => {
  // Today is Wednesday of the third week; one session done so far.
  const i = input({
    today: day(16),
    workouts: workouts(14),
    programs: [program({ done: [day(14)] })],
  });
  const [current] = weekSummaries(i, [day(14)]);
  assert.equal(current!.planned, 3);
  assert.equal(current!.missed, 0);
  assert.equal(current!.due, 1);
  assert.equal(current!.dueDone, 1);
});

test("extra sessions are completed workouts but never exceed the plan", () => {
  const i = input({
    workouts: workouts(0, 1, 2, 3, 4),
    programs: [program({ done: [day(0), day(1), day(2), day(3), day(4)] })],
  });
  const [week] = weekSummaries(i, [MON]);
  assert.equal(week!.completed, 5);
  assert.equal(week!.onPlan, 3);
  assert.equal(consistency([week!]).adherence, 1);
});

test("a program counts only between its start and its end", () => {
  // Started on Wednesday; ended (last session) the next Monday.
  const i = input({
    programs: [
      program({ start: day(2), end: day(7), done: [day(2), day(4), day(7)] }),
    ],
    workouts: workouts(2, 4, 7),
  });
  const [first, second, third] = weekSummaries(i, [MON, day(7), day(14)]);
  assert.equal(first!.planned, 2); // Wednesday and Friday
  assert.equal(second!.planned, 1); // Monday only
  assert.equal(third!.planned, 0);
  assert.equal(consistency([first!, second!, third!]).adherence, 1);
});

test("dated Path and calendar sessions keep their own states", () => {
  const i = input({
    workouts: workouts(0),
    dated: [
      { date: day(0), name: "A", source: "path", state: "completed" },
      { date: day(2), name: "B", source: "path", state: "missed" },
      { date: day(4), name: "C", source: "path", state: "skipped" },
      { date: day(15), name: "D", source: "plan", state: "scheduled" },
    ],
  });
  const weeks = weekSummaries(i, [MON, day(7), day(14)]);
  const total = consistency(weeks);
  assert.equal(total.planned, 4);
  assert.equal(total.missed, 1);
  assert.equal(total.skipped, 1);
  // A session still ahead is planned but not yet due.
  assert.equal(total.due, 3);
  assert.equal(total.dueDone, 1);
  assert.equal(dayDetail(i, day(2)).status, "missed");
  assert.equal(dayDetail(i, day(15)).status, "scheduled");
  // A completed workout outranks a missed session on the same day.
  const both = input({
    workouts: workouts(2),
    dated: [{ date: day(2), name: "B", source: "path", state: "missed" }],
  });
  assert.equal(dayDetail(both, day(2)).status, "completed");
  assert.equal(dayDetail(both, day(2)).sessions.length, 1);
});

test("without a plan only completed training is shown; nothing is missed", () => {
  const i = input({ workouts: workouts(0, 1, 9) });
  const total = consistency(weekSummaries(i, [MON, day(7), day(14)]));
  assert.equal(total.adherence, undefined);
  assert.equal(total.missed, 0);
  assert.equal(total.completed, 3);
  assert.equal(total.activeWeeks, 2);
  assert.equal(total.weeks, 3);
  assert.equal(dayDetail(i, day(3)).status, "rest");
});

test("suggested upcoming sessions show only from today on", () => {
  const i = input({
    today: day(14),
    upcoming: [
      { date: day(13), name: "Old" },
      { date: day(16), name: "Next" },
    ],
  });
  assert.equal(dayDetail(i, day(13)).status, "rest");
  assert.equal(dayDetail(i, day(16)).status, "scheduled");
});

test("an empty history yields empty, honest summaries", () => {
  const total = consistency(weekSummaries(input(), [MON]));
  assert.equal(total.completed, 0);
  assert.equal(total.adherence, undefined);
  assert.equal(total.activeWeeks, 0);
});

test("ranges include the current week and chart long ranges by month without double counting", () => {
  const today = day(16);
  const four = rangeWindow("4w", today);
  assert.equal(four.from, day(14 - 21));
  assert.equal(four.bucket, "week");
  assert.equal(weekStarts(four).length, 4);
  assert.equal(buckets(four).length, 4);
  const twelve = rangeWindow("12w", today);
  assert.equal(weekStarts(twelve).length, 12);
  const year = rangeWindow("1y", today);
  assert.equal(year.bucket, "month");
  assert.equal(weekStarts(year).length, 52);
  const all = rangeWindow("all", today, "2026-01-07");
  assert.equal(all.from, mondayOf("2026-01-07"));
  assert.equal(all.bucket, "month");
  const allNew = rangeWindow("all", today, today);
  assert.equal(allNew.from, mondayOf(today));
  assert.equal(allNew.bucket, "week");
  // Month buckets hold each week once (by its Monday).
  const i = input({
    today,
    workouts: workouts(...Array.from({ length: 30 }, (_, n) => -n * 9)),
  });
  const weeks = weekSummaries(i, weekStarts(year));
  const months = bucketSummaries(weeks, buckets(year));
  assert.equal(
    months.reduce((n, m) => n + m.completed, 0),
    weeks.reduce((n, w) => n + w.completed, 0),
  );
  const firstMonth = buckets(year)[0]!;
  assert.equal(firstMonth.start.slice(8), "01");
});

test("volume counts working sets everywhere but load only for external-load exercises", () => {
  const log = [
    {
      workoutId: "w",
      workoutName: "W",
      exerciseId: "bench",
      date: MON,
      time: 1,
      sets: [
        { weight: 100, reps: 5, kind: "working" as const, completed: true },
        { weight: 60, reps: 10, kind: "warmup" as const, completed: true },
        { weight: 100, reps: 5, kind: "working" as const, completed: false },
      ],
    },
    {
      workoutId: "w",
      workoutName: "W",
      exerciseId: "assisted-pull-up",
      date: MON,
      time: 1,
      sets: [
        { weight: 30, reps: 8, kind: "working" as const, completed: true },
      ],
    },
    {
      workoutId: "w",
      workoutName: "W",
      exerciseId: "plank",
      date: MON,
      time: 1,
      sets: [{ weight: 0, reps: 0, kind: "working" as const, completed: true }],
    },
  ];
  const info = (id: string) =>
    id === "bench"
      ? { kind: "load" as const, muscle: "Chest" }
      : id === "plank"
        ? { kind: "none" as const, muscle: "Core" }
        : { kind: "reps" as const, muscle: "Back" };
  const [week] = volumeBuckets(log, info, [{ start: MON, end: day(6) }]);
  assert.equal(week!.workingSets, 2);
  // 100 × 5; the assisted machine's 30 is assistance, not load.
  assert.equal(week!.loadVolume, 500);
  assert.deepEqual(muscleSets(log, info), [
    { muscle: "Back", sets: 1 },
    { muscle: "Chest", sets: 1 },
  ]);
});
