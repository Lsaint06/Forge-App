import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_STATE,
  monthGrid,
  monthSummary,
  sessionDescription,
  shiftMonth,
} from "../src/screens/calendar/model";
import type { DayDetail } from "../src/domain/progress/consistency";

// Phase 7.2C-4: Training calendar presentation rules.

const weekday = (d: string) => new Date(`${d}T12:00:00`).getDay();

test("the month grid is whole Monday-to-Sunday weeks covering every day", () => {
  for (const month of [
    "2026-02-01", // starts on a Sunday
    "2026-06-01", // starts on a Monday
    "2026-10-01",
    "2025-12-01",
    "2024-02-01", // leap year
  ]) {
    const days = monthGrid(month);
    assert.equal(days.length % 7, 0, month);
    assert.equal(weekday(days[0]!), 1, `${month} starts on Monday`);
    assert.equal(weekday(days.at(-1)!), 0, `${month} ends on Sunday`);
    const inMonth = days.filter((d) => d.slice(0, 7) === month.slice(0, 7));
    const length = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
      0,
    ).getDate();
    assert.equal(inMonth.length, length, month);
    assert.equal(new Set(days).size, days.length, `${month} has no repeats`);
  }
});

test("months step across year boundaries", () => {
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(shiftMonth("2026-01-01", 2), "2026-03-01");
});

test("the month summary counts only that month's days", () => {
  const day = (
    date: string,
    workouts: number,
    states: DayDetail["sessions"][number]["state"][],
  ): DayDetail => ({
    date,
    status: "rest",
    workouts: Array.from({ length: workouts }, (_, i) => ({
      workoutId: `${date}-${i}`,
      name: "W",
    })),
    sessions: states.map((state) => ({ name: "S", state, source: "path" })),
  });
  const details = [
    day("2026-09-30", 3, ["missed"]), // previous month, in the first week
    day("2026-10-02", 1, ["completed"]),
    day("2026-10-05", 1, []),
    day("2026-10-07", 0, ["skipped", "missed"]),
    day("2026-11-01", 2, ["skipped"]), // next month
  ];
  assert.equal(
    monthSummary("2026-10-01", details),
    "2 workouts this month · 1 skipped · 1 missed",
  );
  assert.equal(monthSummary("2026-12-01", []), "0 workouts this month");
  assert.equal(
    monthSummary("2026-10-01", [day("2026-10-02", 1, [])]),
    "1 workout this month",
  );
});

test("every state has its own mark and words; sessions say where they come from", () => {
  const states = Object.values(DAY_STATE);
  assert.equal(new Set(states.map((s) => s.icon)).size, states.length);
  assert.equal(new Set(states.map((s) => s.label)).size, states.length);
  assert.equal(new Set(states.map((s) => s.spoken)).size, states.length);
  // Completion reads ember, as in the logger and the Path week.
  assert.equal(DAY_STATE.completed.tone, "accent");
  assert.equal(DAY_STATE.missed.tone, "warning");
  assert.equal(sessionDescription("scheduled", "path"), "Planned · Path");
  assert.equal(sessionDescription("skipped", "program"), "Skipped · program");
  assert.equal(sessionDescription("missed", "plan"), "Missed");
});
