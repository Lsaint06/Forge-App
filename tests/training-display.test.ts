import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byMonth,
  dayLabel,
  durationMinutes,
  monthLabel,
  relativeDay,
  plural,
  templateLine,
  weekGoalText,
  volumeText,
  workoutLine,
} from "../src/domain/training-display";
import type { Workout } from "../src/domain/types";

const at = (date: string, hour = 18) =>
  new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime();
function workout(id: string, date: string, minutes = 50): Workout {
  const startedAt = at(date);
  return {
    id,
    name: id,
    status: "completed",
    startedAt,
    finishedAt: startedAt + minutes * 60000,
    pausedAt: null,
    pausedMs: 0,
    notes: "",
    templateId: null,
    updatedAt: startedAt,
  };
}

test("days read as today, tomorrow or a short date", () => {
  assert.equal(relativeDay("2026-10-22", "2026-10-22"), "today");
  assert.equal(relativeDay("2026-10-23", "2026-10-22"), "tomorrow");
  assert.equal(relativeDay("2026-11-01", "2026-10-31"), "tomorrow");
  assert.equal(relativeDay("2026-10-24", "2026-10-22"), dayLabel("2026-10-24"));
  assert.match(dayLabel("2026-10-24"), /Sat/);
  assert.match(dayLabel("2026-10-24"), /24/);
});

test("history groups by local month, newest first, keeping order within a month", () => {
  const items = [
    workout("c", "2026-10-21"),
    workout("b", "2026-10-02"),
    workout("a", "2026-09-30"),
    workout("old", "2025-12-31"),
  ];
  const groups = byMonth(items);
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((w) => w.id)]),
    [
      ["2026-10", ["c", "b"]],
      ["2026-09", ["a"]],
      ["2025-12", ["old"]],
    ],
  );
  assert.match(groups[0]!.title, /October/);
  assert.match(groups[0]!.title, /2026/);
  assert.match(monthLabel("2025-12"), /December/);
});

test("the history line shows date, duration and volume in the lifter's units", () => {
  const w = { ...workout("w", "2026-10-21", 52), pausedMs: 2 * 60000 };
  assert.equal(durationMinutes(w), 50);
  assert.equal(volumeText(1000, "kg"), `${(1000).toLocaleString()} kg`);
  assert.equal(volumeText(1000, "lb"), `${(2205).toLocaleString()} lb`);
  assert.equal(
    workoutLine(w, 1000, "kg"),
    `${dayLabel("2026-10-21")} · 50 min · ${(1000).toLocaleString()} kg`,
  );
});

test("counts read naturally, and the weekly goal reads as met once reached", () => {
  assert.equal(plural(1, "exercise"), "1 exercise");
  assert.equal(plural(3, "exercise"), "3 exercises");
  assert.equal(templateLine([{ sets: 5 }]), "1 exercise · 5 sets");
  assert.equal(templateLine([{ sets: 1 }, { sets: 0 }]), "2 exercises · 1 set");
  assert.equal(weekGoalText(2, 4), "2 of 4 sessions");
  assert.equal(weekGoalText(0, 1), "0 of 1 session");
  assert.equal(weekGoalText(4, 4), "4 sessions · goal met");
  assert.equal(weekGoalText(5, 4), "5 sessions · goal met");
  assert.equal(weekGoalText(1, 1), "1 session · goal met");
});
