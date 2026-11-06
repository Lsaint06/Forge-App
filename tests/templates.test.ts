import { test } from "node:test";
import assert from "node:assert/strict";
import { monthOf, monthWeeks, shiftMonth } from "../src/domain/calendar-dates";
import {
  restText,
  repsText,
  prescriptionLine,
  loadForDisplay,
  loadForStorage,
  loadStep,
  exerciseNames,
  moveItem,
} from "../src/domain/templates";
import { lbToKg } from "../src/domain/metrics";

// Phase 7B WP3: scheduling dates, template formatting, units and moves.

test("month grids are Monday first, complete and never shift a day", () => {
  // October 2026 starts on a Thursday and has 31 days.
  const weeks = monthWeeks("2026-10-15");
  assert.equal(weeks[0]!.length, 7);
  assert.deepEqual(weeks[0]!.slice(0, 4), [
    undefined,
    undefined,
    undefined,
    "2026-10-01",
  ]);
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 31);
  assert.equal(days[0], "2026-10-01");
  assert.equal(days.at(-1), "2026-10-31");
  assert.ok(weeks.every((w) => w.length === 7));
  // Daylight-saving changes (late March, late October/November) keep every
  // date exactly once and in order.
  for (const month of ["2026-03-01", "2026-11-01", "2027-02-01"]) {
    const list = monthWeeks(month).flat().filter(Boolean) as string[];
    assert.equal(new Set(list).size, list.length, month);
    assert.deepEqual([...list].sort(), list, month);
    assert.ok(
      list.every((d) => d.startsWith(month.slice(0, 7))),
      month,
    );
  }
  // A month starting on Monday has no leading blanks.
  assert.equal(monthWeeks("2026-06-01")[0]![0], "2026-06-01");
});

test("months move across year boundaries", () => {
  assert.equal(monthOf("2026-10-23"), "2026-10-01");
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2027-01-01", -1), "2026-12-01");
  assert.equal(shiftMonth("2026-01-31".slice(0, 8) + "01", 1), "2026-02-01");
});

test("prescriptions read as a lifter would say them", () => {
  assert.equal(restText(45), "45s");
  assert.equal(restText(90), "1:30");
  assert.equal(restText(120), "2:00");
  assert.equal(repsText({ reps: 6 }), "6");
  assert.equal(repsText({ reps: 6, repMax: 8 }), "6–8");
  assert.equal(repsText({ reps: 6, repMax: 6 }), "6");
  const p = {
    exerciseId: "x",
    sets: 3,
    reps: 6,
    repMax: 8,
    weight: lbToKg(135),
    rest: 90,
  };
  assert.equal(prescriptionLine(p, "lb"), "3 × 6–8 · 135 lb · 1:30 rest");
  assert.equal(
    prescriptionLine({ ...p, weight: 0 }, "kg"),
    "3 × 6–8 · 1:30 rest",
  );
});

test("loads display in the lifter's units and store as kilograms", () => {
  // 135 lb is stored as about 61.23 kg and shows as 135 lb again.
  const stored = loadForStorage(135, "lb");
  assert.ok(Math.abs(stored - 61.235) < 0.001);
  assert.equal(loadForDisplay(stored, "lb"), 135);
  assert.equal(loadForStorage(62.5, "kg"), 62.5);
  assert.equal(loadForDisplay(62.5, "kg"), 62.5);
  // No long decimals in the control.
  assert.equal(loadForDisplay(61.2349, "kg"), 61.23);
  assert.equal(loadStep(2.5, "kg"), 2.5);
  assert.equal(loadStep(2.5, "lb"), 5);
});

test("long exercise lists are summarised", () => {
  assert.equal(exerciseNames(["A", "B"]), "A, B");
  assert.equal(exerciseNames(["A", "B", "C"]), "A, B, C");
  assert.equal(exerciseNames(["A", "B", "C", "D"]), "A, B and 2 more");
  assert.equal(exerciseNames([]), "");
});

test("moving an item keeps every other item and its values", () => {
  const items = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(items, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(items, 0, 3), ["b", "c", "d", "a"]);
  assert.deepEqual(moveItem(items, 1, 99), ["a", "c", "d", "b"]);
  assert.deepEqual(moveItem(items, 9, 0), items);
  assert.deepEqual(items, ["a", "b", "c", "d"]);
});
