import test from "node:test";
import assert from "node:assert/strict";
import {
  exerciseRecords,
  sessionBest,
  type LoadKind,
  type LoggedExercise,
  type SessionBest,
} from "../src/domain/progress/strength";
import { latestRecord, recordGain } from "../src/domain/presentation/records";

// Phase 7.4E: the PR highlight's choice and its gain over the beaten best,
// checked against records found by the unchanged `exerciseRecords`.

let t = 0;
function session(
  exerciseId: string,
  sets: [number, number][],
  date = "2026-10-01",
): LoggedExercise {
  t += 1000;
  return {
    workoutId: `w${t}`,
    workoutName: "Session",
    exerciseId,
    date,
    time: t,
    sets: sets.map(([weight, reps]) => ({
      weight,
      reps,
      kind: "working",
      completed: true,
    })),
  } as LoggedExercise;
}
function history(kind: LoadKind, sessions: LoggedExercise[]) {
  const bests = sessions
    .map((s) => sessionBest(s, kind))
    .filter((b): b is SessionBest => !!b);
  return { bests, ...exerciseRecords(bests, kind) };
}

test("heaviest set: +5 kg over the heaviest earlier set, not just the last one", () => {
  const h = history("load", [
    session("bench", [[90, 5]]),
    session("bench", [[85, 8]]),
    session("bench", [[95, 3]]),
  ]);
  const e = latestRecord(h.events)!;
  // 95 × 3 estimates below 90 × 5, so only the heaviest set is a record.
  assert.deepEqual(e.categories, ["heaviest"]);
  assert.deepEqual(recordGain(e, h.bests), {
    category: "heaviest",
    previous: 90,
    delta: 5,
    weight: undefined,
  });
});

test("estimated 1RM and reps at a weight: gains in kilograms and in reps", () => {
  const e1rm = history("load", [
    session("squat", [[100, 5]]),
    session("squat", [[100, 8]]),
  ]);
  const ev = latestRecord(e1rm.events)!;
  assert.equal(ev.categories[0], "e1rm");
  const gain = recordGain(ev, e1rm.bests)!;
  assert.equal(gain.category, "e1rm");
  assert.ok(gain.delta > 0);
  assert.equal(gain.previous, e1rm.bests[0]!.e1rm!.value);

  // More reps at a lighter weight than the heaviest: a rep record only.
  const reps = history("load", [
    session("row", [
      [60, 10],
      [100, 3],
    ]),
    session("row", [[60, 12]]),
  ]);
  const rv = latestRecord(reps.events)!;
  assert.deepEqual(rv.categories, ["reps-at-weight"]);
  assert.deepEqual(recordGain(rv, reps.bests), {
    category: "reps-at-weight",
    previous: 10,
    delta: 2,
    weight: 60,
  });
});

test("bodyweight work: most reps, in reps", () => {
  const h = history("reps", [
    session("pull-up", [[0, 8]]),
    session("pull-up", [[0, 7]]),
    session("pull-up", [[0, 11]]),
  ]);
  const e = latestRecord(h.events)!;
  assert.deepEqual(recordGain(e, h.bests), {
    category: "most-reps",
    previous: 8,
    delta: 3,
    weight: undefined,
  });
});

test("the choice is the newest record; same-workout ties are deterministic", () => {
  const older = {
    ...latestRecord(
      history("load", [session("a", [[50, 5]]), session("a", [[60, 5]])])
        .events,
    )!,
  };
  const newer = { ...older, exerciseId: "b", time: older.time + 1 };
  assert.equal(latestRecord([older, newer])!.exerciseId, "b");
  // Same finish time: heaviest before e1rm before reps; then exercise id.
  const reps = {
    ...older,
    exerciseId: "c",
    categories: ["reps-at-weight" as const],
  };
  const e1rm = { ...older, exerciseId: "d", categories: ["e1rm" as const] };
  const heavyZ = {
    ...older,
    exerciseId: "z",
    categories: ["heaviest" as const],
  };
  const heavyA = {
    ...older,
    exerciseId: "a2",
    categories: ["heaviest" as const],
  };
  for (const order of [
    [reps, e1rm, heavyZ, heavyA],
    [heavyA, heavyZ, e1rm, reps],
  ])
    assert.equal(latestRecord(order)!.exerciseId, "a2");
  assert.equal(latestRecord([reps, e1rm])!.exerciseId, "d");
  assert.equal(latestRecord([]), undefined);
});

test("a first session is a baseline: no record, nothing to highlight", () => {
  const h = history("load", [session("deadlift", [[180, 3]])]);
  assert.deepEqual(h.events, []);
  assert.equal(latestRecord(h.events), undefined);
});
