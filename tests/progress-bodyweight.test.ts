import test from "node:test";
import assert from "node:assert/strict";
import {
  bodyweightOver,
  percentText,
} from "../src/domain/presentation/bodyweight";
import { changeText } from "../src/domain/measurements";

// Phase 7.4D: bodyweight over a Progress range (decision P1).

const day = (date: string, value: number, count = 1) => ({
  date,
  value,
  count,
  entry: {} as never,
});
const series = {
  days: [
    day("2026-08-01", 84.2),
    day("2026-09-20", 83.6),
    day("2026-10-05", 83.0, 2),
    day("2026-10-12", 82.6),
    day("2026-10-25", 82.4),
  ],
};

test("a range keeps its own weigh-ins and compares with where it began", () => {
  // 4 weeks from Monday 28 Sep: the baseline is the last weigh-in before it.
  const v = bodyweightOver(series, "2026-09-28");
  assert.deepEqual(
    v.points.map((p) => p.date),
    ["2026-10-05", "2026-10-12", "2026-10-25"],
  );
  assert.equal(v.points[0]!.count, 2);
  assert.deepEqual(v.latest, { date: "2026-10-25", kg: 82.4, count: 1 });
  assert.deepEqual(v.start, { date: "2026-09-20", kg: 83.6, count: 1 });
  assert.ok(Math.abs(v.change!.kg - -1.2) < 1e-9);
  assert.equal(percentText(v.change!.percent), "−1.4%");
  assert.equal(changeText(v.change!.kg, "mass", "kg"), "−1.2 kg");
  // Pounds are a display conversion of the same change.
  assert.equal(changeText(v.change!.kg, "mass", "lb"), "−2.6 lb");
});

test("all time compares the first and newest weigh-ins", () => {
  const v = bodyweightOver(series);
  assert.equal(v.points.length, 5);
  assert.equal(v.start!.date, "2026-08-01");
  assert.ok(Math.abs(v.change!.kg - -1.8) < 1e-9);
  assert.equal(percentText(v.change!.percent), "−2.1%");
});

test("with nothing earlier, the first weigh-in in the range is the baseline", () => {
  const v = bodyweightOver({ days: series.days.slice(2) }, "2026-09-28");
  assert.equal(v.start!.date, "2026-10-05");
  assert.ok(Math.abs(v.change!.kg - -0.6) < 1e-9);
});

test("sparse and empty: no invented points, no change from a single day", () => {
  // No weigh-in in the range: the latest stays known, nothing is plotted.
  const quiet = bodyweightOver({ days: series.days.slice(0, 2) }, "2026-09-28");
  assert.deepEqual(quiet.points, []);
  assert.equal(quiet.start, undefined);
  assert.equal(quiet.change, undefined);
  assert.equal(quiet.latest!.kg, 83.6);
  // One weigh-in ever: a point, no change.
  const one = bodyweightOver({ days: [day("2026-10-20", 80)] }, "2026-09-28");
  assert.equal(one.points.length, 1);
  assert.equal(one.change, undefined);
  // No series at all.
  assert.deepEqual(bodyweightOver(undefined, "2026-09-28"), {
    latest: undefined,
    points: [],
    start: undefined,
    change: undefined,
  });
  // A gain reads as plainly as a loss.
  const up = bodyweightOver({
    days: [day("2026-10-01", 80), day("2026-10-20", 80.4)],
  });
  assert.equal(percentText(up.change!.percent), "+0.5%");
  assert.equal(percentText(0.01), "0%");
});
