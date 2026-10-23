import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byExercise,
  compareLatest,
  defaultMetric,
  exerciseRecords,
  isWorkingSet,
  loadKind,
  progressionSeries,
  sessionBest,
  sessionBests,
  type LoggedExercise,
} from "../src/domain/progress/strength";
import {
  compactNumber,
  estimateText,
  loadText,
  recordHeadline,
  setText,
  signed,
} from "../src/domain/progress/format";
import { estimatedMax, kgToLb, lbToKg } from "../src/domain/metrics";

type S = LoggedExercise["sets"][number];
const set = (weight: number, reps: number, patch: Partial<S> = {}): S => ({
  weight,
  reps,
  kind: "working",
  completed: true,
  ...patch,
});
let clock = 0;
function session(sets: S[], id = `w${++clock}`, exerciseId = "bench") {
  return {
    workoutId: id,
    workoutName: id,
    exerciseId,
    date: `2026-10-${String(clock).padStart(2, "0")}`,
    time: clock * 1000,
    sets,
  } satisfies LoggedExercise;
}

test("exercises are classified by how their logged weight can be read", () => {
  const strength = (equipment: string, id = "x", name = "X") =>
    loadKind({ id, name, equipment, category: "strength" });
  assert.equal(strength("Barbell"), "load");
  assert.equal(strength("Dumbbell"), "load");
  assert.equal(strength("Cable"), "load");
  assert.equal(strength("Machine"), "load");
  // Bodyweight-based movements: the logged number may be assistance.
  assert.equal(strength("Bodyweight", "push-up"), "reps");
  assert.equal(strength("Pull-up bar", "pull-up"), "reps");
  assert.equal(strength("Gymnastic rings"), "reps");
  assert.equal(strength("Resistance band"), "reps");
  assert.equal(strength("Assisted pull-up machine"), "reps");
  assert.equal(strength("Machine", "assisted-dip", "Assisted Dip"), "reps");
  // Timed and distance work have no strength progression.
  assert.equal(loadKind({ category: "duration", equipment: "None" }), "none");
  assert.equal(loadKind({ category: "distance", equipment: "Rower" }), "none");
  assert.equal(loadKind(undefined), "none");
});

test("only completed, non-warm-up sets with reps count as working sets", () => {
  assert.equal(isWorkingSet(set(100, 5)), true);
  assert.equal(isWorkingSet(set(100, 5, { kind: "warmup" })), false);
  assert.equal(isWorkingSet(set(100, 5, { completed: false })), false);
  assert.equal(isWorkingSet(set(100, 0)), false);
  assert.equal(isWorkingSet(set(80, 8, { kind: "drop" })), true);
  assert.equal(isWorkingSet(set(80, 8, { kind: "failure" })), true);
  const best = sessionBest(
    session([
      set(140, 5, { kind: "warmup" }),
      set(150, 3, { completed: false }),
      set(100, 5),
      set(100, 6),
      set(90, 15),
    ]),
    "load",
  )!;
  assert.deepEqual(best.topSet, { weight: 100, reps: 6 });
  assert.equal(best.workingSets, 3);
  assert.deepEqual(best.mostReps, { weight: 90, reps: 15 });
  // 90 × 15 is beyond the estimate's 12-rep limit.
  assert.deepEqual(best.e1rm, {
    value: estimatedMax(100, 6),
    set: { weight: 100, reps: 6 },
  });
  assert.equal(
    sessionBest(session([set(60, 5, { kind: "warmup" })]), "load"),
    undefined,
  );
});

test("the Epley estimate is documented: 1 rep is the load, 2–12 reps estimated, more excluded", () => {
  assert.equal(estimatedMax(100, 1), 100);
  assert.equal(Math.round(estimatedMax(100, 5) * 1000) / 1000, 116.667);
  assert.equal(Math.round(estimatedMax(100, 12) * 10) / 10, 140);
  assert.equal(estimatedMax(100, 13), 0);
  assert.equal(estimatedMax(0, 5), 0);
  const only13 = sessionBest(session([set(80, 13)]), "load")!;
  assert.equal(only13.e1rm, undefined);
  assert.deepEqual(only13.topSet, { weight: 80, reps: 13 });
});

test("bodyweight-based movements compare reps only, never load", () => {
  const best = sessionBest(
    session([set(20, 6), set(0, 12)], "w", "pull-up"),
    "reps",
  )!;
  assert.equal(best.topSet, undefined);
  assert.equal(best.e1rm, undefined);
  assert.equal(best.repsAtWeight.size, 0);
  assert.deepEqual(best.mostReps, { weight: 0, reps: 12 });
  assert.equal(sessionBest(session([set(0, 60)]), "none"), undefined);
});

test("records need a previous best to beat; ties and first sessions are not records", () => {
  const bests = sessionBests(
    [
      session([set(100, 5)]),
      session([set(100, 5)]), // tie: no record
      session([set(102.5, 5)]), // heavier: heaviest + estimate
      session([set(100, 7)]), // more reps at 100: rep record + estimate
      session([set(105, 2)]), // heavier, lower estimate: heaviest only
      session([set(110, 1, { kind: "warmup" })]), // warm-up: nothing
    ],
    "load",
  );
  const { records, events } = exerciseRecords(bests, "load");
  assert.deepEqual(
    events.map((e) => e.categories),
    [["heaviest", "e1rm"], ["e1rm", "reps-at-weight"], ["heaviest"]],
  );
  assert.deepEqual(events[1]!.repsAtWeight, { weight: 100, reps: 7 });
  assert.equal(records.heaviest?.weight, 105);
  assert.equal(records.e1rm?.value, estimatedMax(100, 7));
  assert.equal(records.e1rm?.workoutId, bests[3]!.workoutId);
  assert.deepEqual(
    records.repsAtWeight.map((x) => [x.weight, x.reps]),
    [
      [105, 2],
      [102.5, 5],
      [100, 7],
    ],
  );
  // The earliest holder keeps a tied best.
  assert.equal(
    exerciseRecords(
      sessionBests([session([set(100, 5)]), session([set(100, 5)])], "load"),
      "load",
    ).records.heaviest?.workoutId,
    `w${clock - 1}`,
  );
});

test("a first lift at a new weight is not a rep record", () => {
  const { events } = exerciseRecords(
    sessionBests([session([set(100, 5)]), session([set(90, 10)])], "load"),
    "load",
  );
  // 90 kg was never lifted before; only the estimate improved.
  assert.deepEqual(
    events.map((e) => e.categories),
    [["e1rm"]],
  );
});

test("reps-only exercises record most reps after the baseline", () => {
  const { records, events } = exerciseRecords(
    sessionBests(
      [
        session([set(0, 8)], "a", "pull-up"),
        session([set(0, 8)], "b", "pull-up"),
        session([set(0, 10)], "c", "pull-up"),
      ],
      "reps",
    ),
    "reps",
  );
  assert.deepEqual(
    events.map((e) => [e.workoutId, e.categories]),
    [["c", ["most-reps"]]],
  );
  assert.equal(records.mostReps?.reps, 10);
  assert.equal(records.heaviest, undefined);
});

test("latest and previous are compared at the same reps, else by estimate, else not at all", () => {
  const same = compareLatest(
    sessionBests([session([set(100, 5)]), session([set(102.5, 5)])], "load"),
    "load",
  )!;
  assert.deepEqual(same.comparison, { kind: "weight", delta: 2.5, reps: 5 });
  const different = compareLatest(
    sessionBests([session([set(100, 5)]), session([set(90, 10)])], "load"),
    "load",
  )!;
  assert.equal(different.comparison.kind, "e1rm");
  assert.ok(
    different.comparison.kind === "e1rm" &&
      Math.abs(
        different.comparison.delta -
          (estimatedMax(90, 10) - estimatedMax(100, 5)),
      ) < 1e-9,
  );
  // No estimate above 12 reps, and different reps: nothing comparable.
  const none = compareLatest(
    sessionBests([session([set(60, 15)]), session([set(70, 14)])], "load"),
    "load",
  )!;
  assert.deepEqual(none.comparison, { kind: "none" });
  const reps = compareLatest(
    sessionBests([session([set(0, 8)]), session([set(0, 6)])], "reps"),
    "reps",
  )!;
  assert.deepEqual(reps.comparison, { kind: "reps", delta: -2 });
  const first = compareLatest(
    sessionBests([session([set(100, 5)])], "load"),
    "load",
  )!;
  assert.equal(first.previous, undefined);
  assert.equal(compareLatest([], "load"), undefined);
});

test("progression series and defaults follow what each session supports", () => {
  const bests = sessionBests(
    [session([set(100, 5)]), session([set(80, 15)]), session([set(105, 3)])],
    "load",
  );
  assert.equal(defaultMetric("load", bests), "e1rm");
  assert.equal(defaultMetric("reps", bests), "reps");
  // The 15-rep session has no estimate and is left out of that series.
  assert.equal(progressionSeries(bests, "e1rm").length, 2);
  assert.deepEqual(
    progressionSeries(bests, "top").map((p) => p.value),
    [100, 80, 105],
  );
  const high = sessionBests([session([set(60, 20)])], "load");
  assert.equal(defaultMetric("load", high), "top");
});

test("rows of one exercise in the same workout are merged; workouts stay separate", () => {
  const a = session([set(100, 5)], "same");
  const b = { ...session([set(110, 3)], "same"), time: a.time };
  const c = { ...session([set(90, 8)], "other"), time: a.time + 1 };
  const grouped = byExercise([c, b, a]).get("bench")!;
  assert.deepEqual(
    grouped.map((g) => [g.workoutId, g.sets.length]),
    [
      ["same", 2],
      ["other", 1],
    ],
  );
});

test("weights display in the lifter's units without drift", () => {
  assert.equal(loadText(100, "kg"), "100 kg");
  assert.equal(loadText(lbToKg(225), "lb"), "225 lb");
  assert.equal(loadText(lbToKg(132.5), "lb"), "132.5 lb");
  assert.equal(setText({ weight: lbToKg(185), reps: 5 }, "lb"), "185 lb × 5");
  assert.equal(estimateText(estimatedMax(100, 5), "kg"), "116.7 kg");
  assert.equal(
    estimateText(estimatedMax(100, 5), "lb"),
    `${Math.round(kgToLb(estimatedMax(100, 5)) * 10) / 10} lb`,
  );
  assert.equal(compactNumber(8420.4), (8420).toLocaleString());
  assert.equal(compactNumber(48210), "48.2k");
  assert.equal(compactNumber(123456), "123k");
  assert.equal(compactNumber(1234567), "1.2M");
  assert.equal(signed(2.5, "kg"), "+2.5 kg");
  assert.equal(signed(-1, "rep"), "−1 rep");
  assert.equal(signed(0.04, "kg"), "±0 kg");
  const headline = recordHeadline(
    {
      exerciseId: "bench",
      workoutId: "w",
      date: "2026-10-01",
      time: 0,
      categories: ["heaviest", "e1rm"],
      heaviest: { weight: lbToKg(225), reps: 3 },
      e1rm: { value: 100, set: { weight: 100, reps: 1 } },
    },
    "lb",
  );
  assert.deepEqual(headline, { label: "Heaviest set", value: "225 lb × 3" });
});
