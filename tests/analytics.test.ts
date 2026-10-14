import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  measurementTrend,
  goalProgress,
  programAdherence,
} from "../src/domain/analytics";
import type { Workout, WorkoutSet } from "../src/domain/types";
const w: Workout = {
  id: "w",
  name: "Test",
  status: "completed",
  startedAt: 1000,
  finishedAt: 601000,
  pausedAt: null,
  pausedMs: 0,
  notes: "",
  templateId: "t",
  updatedAt: 601000,
};
const s: WorkoutSet = {
  id: "s",
  exerciseRowId: "e",
  position: 0,
  weight: 50,
  reps: 10,
  duration: 0,
  distance: 0,
  rpe: null,
  rir: null,
  kind: "working",
  completed: true,
  rest: 90,
  tempo: "",
  notes: "",
  side: "both",
};
test("analytics attributes each completed working set exactly once", () => {
  const a = analyze([w], () => [
    {
      exerciseId: "bench",
      muscle: "Chest",
      sets: [s, { ...s, id: "warm", kind: "warmup" }],
    },
  ]);
  assert.equal(a.totalVolume, 500);
  assert.equal(a.totalSets, 1);
  assert.equal(a.muscles.Chest?.volume, 500);
  assert.equal(a.averageMinutes, 10);
});
test("analytics ignores active sessions and records estimated max", () => {
  const a = analyze([{ ...w, status: "active" }, w], () => [
    { exerciseId: "bench", muscle: "Chest", sets: [s] },
  ]);
  assert.equal(a.frequency, 1);
  assert.ok(a.exercises.bench!.estimatedMax > 50);
});
test("measurement trends are numeric and date ordered", () => {
  assert.deepEqual(
    measurementTrend(
      [
        { date: "2026-10-15", data: { name: "Bodyweight", value: 81 } },
        { date: "2026-10-14", data: { name: "Bodyweight", value: 80 } },
      ],
      "Bodyweight",
    ).map((x) => x.value),
    [80, 81],
  );
});
test("goal ratios are bounded and target bodyweight uses distance from start", () => {
  assert.equal(goalProgress(4, 3).ratio, 1);
  assert.equal(goalProgress(85, 80, 90).ratio, 0.5);
});
test("program adherence cannot count one workout against multiple planned sessions", () => {
  const schedule = [
    { date: "1970-01-01", templateId: "t" },
    { date: "1970-01-01", templateId: "t" },
  ];
  assert.deepEqual(programAdherence(schedule, [w], 700000), {
    completed: 1,
    due: 2,
    ratio: 0.5,
  });
});
