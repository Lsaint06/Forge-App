import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import { freshPathRepository, legacyUserRepository } from "./legacy-fixture";
import {
  consistencyInput,
  exerciseProgress,
  firstActivity,
  progressModel,
  trainingLog,
} from "../src/data/progress";
import { consistency, weekSummaries } from "../src/domain/progress/consistency";
import { mondayOf } from "../src/domain/progress/range";
import { addDays } from "../src/domain/paths/model";
import { localDate } from "../src/domain/types";
import { libraryPrograms } from "../src/programs";
import {
  enrollProgram,
  skipProgramSession,
  startProgramSession,
} from "../src/data/programs";
import {
  archivePath,
  currentPath,
  pathSessions,
  pausePath,
  startPathSession,
} from "../src/data/paths";

type Fixture = ReturnType<typeof pathRepository>;
const at = (date: string, hour = 18) =>
  new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime();

// Logs a finished workout on a given date with the given working sets.
function logWorkout(
  { r, db }: Fixture,
  date: string,
  exerciseId: string,
  sets: [
    number,
    number,
    Partial<{ kind: "warmup" | "working"; completed: boolean }>?,
  ][],
) {
  const w = r.startWorkout(`Session ${date}`);
  const row = r.addExercise(w.id, exerciseId);
  for (const [weight, reps, patch] of sets) {
    const s = r.addSet(row.id);
    r.editSet(s.id, { weight, reps, completed: true, ...patch });
  }
  r.finishWorkout(w.id);
  db.prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?").run(
    at(date) - 3600000,
    at(date),
    w.id,
  );
  return w;
}

test("only finished workouts and their completed working sets are analysed", () => {
  const f = pathRepository();
  try {
    logWorkout(f, "2026-10-01", "barbell-bench-press", [
      [60, 10, { kind: "warmup" }],
      [100, 5],
      [110, 1, { completed: false }],
    ]);
    // An active workout and a paused one are not history yet.
    const active = f.r.startWorkout("In progress");
    const row = f.r.addExercise(active.id, "barbell-bench-press");
    f.r.editSet(f.r.addSet(row.id).id, {
      weight: 200,
      reps: 5,
      completed: true,
    });
    const log = trainingLog(f.r);
    assert.equal(log.length, 1);
    assert.equal(log[0]!.sets.length, 3);
    const bench = progressModel(f.r).exercises.get("barbell-bench-press")!;
    assert.deepEqual(
      bench.records.heaviest && [
        bench.records.heaviest.weight,
        bench.records.heaviest.reps,
      ],
      [100, 5],
    );
    assert.equal(bench.bests[0]!.workingSets, 1);
  } finally {
    f.db.close();
  }
});

test("records follow edits and deletions of history, leaving nothing stale", () => {
  const f = pathRepository();
  try {
    logWorkout(f, "2026-10-01", "barbell-bench-press", [[100, 5]]);
    const pr = logWorkout(f, "2026-10-04", "barbell-bench-press", [[105, 5]]);
    logWorkout(f, "2026-10-07", "barbell-bench-press", [[102.5, 5]]);
    let model = progressModel(f.r);
    assert.equal(model.events.length, 1);
    assert.equal(model.events[0]!.workoutId, pr.id);
    assert.equal(
      model.exercises.get("barbell-bench-press")!.records.heaviest!.weight,
      105,
    );

    // Correct a typo in the record set: the record moves.
    const set = f.r.workoutSets(pr.id)[0]!;
    f.r.editSet(set.id, { weight: 101 });
    model = progressModel(f.r);
    assert.equal(
      model.exercises.get("barbell-bench-press")!.records.heaviest!.weight,
      102.5,
    );
    assert.deepEqual(
      model.events.map((e) => e.categories[0]),
      ["heaviest", "heaviest"],
    );

    // Delete it: the remaining history decides.
    f.r.deleteWorkout(pr.id);
    model = progressModel(f.r);
    assert.equal(
      model.exercises.get("barbell-bench-press")!.records.heaviest!.weight,
      102.5,
    );
    assert.equal(model.events.length, 1);
    assert.ok(model.events.every((e) => e.workoutId !== pr.id));
  } finally {
    f.db.close();
  }
});

test("bodyweight and assisted movements never produce load records", () => {
  const f = pathRepository();
  try {
    logWorkout(f, "2026-10-01", "pull-up", [[0, 6]]);
    logWorkout(f, "2026-10-03", "pull-up", [[20, 8]]);
    logWorkout(f, "2026-10-01", "assisted-pull-up", [[40, 8]]);
    logWorkout(f, "2026-10-03", "assisted-pull-up", [[30, 8]]);
    const model = progressModel(f.r);
    const pull = model.exercises.get("pull-up")!;
    assert.equal(pull.kind, "reps");
    assert.equal(pull.records.heaviest, undefined);
    assert.equal(pull.records.e1rm, undefined);
    assert.equal(pull.records.mostReps?.reps, 8);
    const assisted = model.exercises.get("assisted-pull-up")!;
    assert.equal(assisted.kind, "reps");
    assert.equal(assisted.records.heaviest, undefined);
    // 8 reps matched, not beaten: no record either way.
    assert.deepEqual(
      model.events.map((e) => [e.exerciseId, e.categories]),
      [["pull-up", ["most-reps"]]],
    );
    assert.equal(exerciseProgress(f.r, "pull-up")!.records.mostReps?.reps, 8);
  } finally {
    f.db.close();
  }
});

test("an empty history gives an empty model and no first activity", () => {
  const f = pathRepository();
  try {
    const model = progressModel(f.r);
    assert.equal(model.log.length, 0);
    assert.equal(model.exercises.size, 0);
    assert.equal(model.events.length, 0);
    const input = consistencyInput(f.r, "2026-10-22");
    assert.equal(input.workouts.length, 0);
    assert.equal(firstActivity(input), undefined);
  } finally {
    f.db.close();
  }
});

test("a curated program's week counts its sessions, skipped ones included, wherever they fall", () => {
  const f = pathRepository();
  try {
    f.r.saveProfile({ restDay: 6 });
    const program = libraryPrograms().find(
      (p) => p.id === "forge-strength-intermediate-3-day",
    )!;
    const monday = "2026-10-05";
    const { id } = enrollProgram(f.r, program, monday);
    // Week 1: three sessions on Tuesday, Thursday and Saturday.
    for (const d of [1, 3, 5]) {
      const w = startProgramSession(f.r, id);
      for (const s of f.r.workoutSets(w.id))
        f.r.editSet(s.id, { completed: true, weight: 60, reps: 5 });
      f.r.finishWorkout(w.id);
      f.db
        .prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?")
        .run(at(addDays(monday, d)) - 3600000, at(addDays(monday, d)), w.id);
    }
    // Week 2: one session, one skipped.
    const w = startProgramSession(f.r, id);
    for (const s of f.r.workoutSets(w.id))
      f.r.editSet(s.id, { completed: true, weight: 60, reps: 5 });
    f.r.finishWorkout(w.id);
    f.db
      .prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?")
      .run(at(addDays(monday, 7)) - 3600000, at(addDays(monday, 7)), w.id);
    skipProgramSession(f.r, id);
    const skip = f.r
      .journal("schedule")
      .find((j) => j.data.forgeProgram === 1 && j.data.skipped === true)!;
    f.r.updateJournal(skip.id, skip.data, addDays(monday, 9));

    const today = addDays(monday, 15); // Tuesday of week 3
    const input = consistencyInput(f.r, today);
    const [one, two, three] = weekSummaries(input, [
      monday,
      addDays(monday, 7),
      addDays(monday, 14),
    ]);
    assert.deepEqual([one!.planned, one!.onPlan, one!.missed], [3, 3, 0]);
    assert.deepEqual(
      [two!.planned, two!.onPlan, two!.skipped, two!.missed],
      [3, 1, 1, 1],
    );
    // Week 3 is under way with nothing done yet: nothing is due.
    assert.equal(three!.due, 0);
    const total = consistency([one!, two!, three!]);
    assert.equal(total.due, 6);
    assert.equal(total.dueDone, 4);
    // Suggested next sessions appear on the calendar.
    assert.ok(input.upcoming.length > 0);
    assert.ok(input.upcoming.every((u) => u.date >= today));
  } finally {
    f.db.close();
  }
});

test("an existing user's mixed history yields consistent, non-negative counts", () => {
  const f = legacyUserRepository();
  try {
    const today = localDate();
    const input = consistencyInput(f.r, today);
    // Every completed workout appears once.
    assert.equal(
      input.workouts.length,
      f.r.workouts().filter((w) => w.status === "completed").length,
    );
    assert.ok(
      input.dated.every((d) =>
        ["completed", "skipped", "missed", "scheduled"].includes(d.state),
      ),
    );
    // Nothing ahead of today is ever missed.
    assert.ok(input.dated.every((d) => d.state !== "missed" || d.date < today));
    const [week] = weekSummaries(input, [mondayOf(today)]);
    assert.ok(week!.missed >= 0 && week!.due >= week!.dueDone);
    assert.ok(progressModel(f.r).log.length > 0);
  } finally {
    f.db.close();
  }
});

test("an archived Path counts until its last session; a paused Path until the pause", () => {
  const archived = freshPathRepository();
  try {
    const path = currentPath(archived.r)!;
    const first = pathSessions(archived.r, path)[0]!;
    const w = startPathSession(archived.r, first.record.id);
    for (const s of archived.r.workoutSets(w.id))
      archived.r.editSet(s.id, { completed: true, weight: 40, reps: 8 });
    archived.r.finishWorkout(w.id);
    archivePath(archived.r, path.record.id);
    // Weeks later: the rest of the archived schedule is not "missed".
    const input = consistencyInput(archived.r, "2026-12-20");
    assert.deepEqual(
      input.dated.map((d) => [d.date, d.state]),
      [[first.record.date, "completed"]],
    );
  } finally {
    archived.db.close();
  }
  const paused = freshPathRepository();
  try {
    const path = currentPath(paused.r)!;
    const sessions = pathSessions(paused.r, path);
    pausePath(paused.r, path.record.id, "2026-10-26");
    const input = consistencyInput(paused.r, "2026-11-20");
    const before = sessions.filter((s) => s.record.date < "2026-10-26");
    assert.deepEqual(
      input.dated.map((d) => d.date),
      before.map((s) => s.record.date),
    );
    // Sessions before the pause that weren't trained are missed; the ones
    // after it are suspended and will move when the Path resumes.
    assert.ok(input.dated.every((d) => d.state === "missed"));
  } finally {
    paused.db.close();
  }
});
test("a saved calendar plan is completed only by that template on that day", () => {
  const f = pathRepository();
  try {
    const t = f.r.saveTemplate("Upper", [
      {
        exerciseId: "barbell-bench-press",
        sets: 1,
        reps: 5,
        weight: 0,
        rest: 90,
      },
    ]);
    f.r.addJournal(
      "schedule",
      { name: "Upper", templateId: t.id },
      "2026-10-05",
    );
    f.r.addJournal(
      "schedule",
      { name: "Upper", templateId: t.id },
      "2026-10-07",
    );
    f.r.addJournal(
      "schedule",
      { name: "Upper", templateId: t.id },
      "2026-10-30",
    );
    const w = f.r.startWorkout("Upper", t.id);
    for (const s of f.r.workoutSets(w.id))
      f.r.editSet(s.id, { completed: true, weight: 60, reps: 5 });
    f.r.finishWorkout(w.id);
    f.db
      .prepare("UPDATE workouts SET started_at=?, finished_at=? WHERE id=?")
      .run(at("2026-10-05") - 3600000, at("2026-10-05"), w.id);
    const input = consistencyInput(f.r, "2026-10-22");
    assert.deepEqual(
      input.dated.map((d) => [d.date, d.state]),
      [
        ["2026-10-05", "completed"],
        ["2026-10-07", "missed"],
        ["2026-10-30", "scheduled"],
      ],
    );
  } finally {
    f.db.close();
  }
});
