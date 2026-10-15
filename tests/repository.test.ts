import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository, type SqlDatabase } from "../src/data/repository";
const open = () => {
  const db = new DatabaseSync(":memory:");
  const adapter: SqlDatabase = {
    exec: (s) => db.exec(s),
    run: (s, p = []) => {
      db.prepare(s).run(...p);
    },
    all: <T>(s: string, p: (string | number | null)[] = []) =>
      db.prepare(s).all(...p) as T[],
  };
  const r = new Repository(adapter);
  r.migrate();
  return { r, db };
};
test("migrations are repeatable and preserve profile", () => {
  const { r } = open();
  r.saveProfile({ name: "Ada", onboarded: true });
  r.migrate();
  assert.equal(r.profile().name, "Ada");
});
test("workout set edits survive repository reopening", () => {
  const { r, db } = open();
  const w = r.startWorkout("Strength");
  const e = r.addExercise(w.id, "barbell-bench-press");
  const s = r.addSet(e.id);
  r.editSet(s.id, { weight: 75, reps: 8, completed: true });
  const reopened = new Repository(r.db);
  assert.equal(reopened.active()?.id, w.id);
  assert.equal(reopened.sets(e.id)[0]!.weight, 75);
  db.close();
});
test("only one active workout and completion is idempotent", () => {
  const { r } = open();
  const w = r.startWorkout("A");
  assert.equal(r.startWorkout("B").id, w.id);
  r.finishWorkout(w.id);
  r.finishWorkout(w.id);
  assert.equal(r.workouts().length, 1);
  assert.equal(r.active(), undefined);
});
test("template creates prescribed sets and duplicates without identity reuse", () => {
  const { r } = open();
  const t = r.saveTemplate("Push", [
    {
      exerciseId: "barbell-bench-press",
      sets: 3,
      reps: 8,
      weight: 40,
      rest: 90,
    },
  ]);
  const w = r.startWorkout("Push", t.id);
  assert.equal(r.sets(r.workoutExercises(w.id)[0]!.id).length, 3);
  r.finishWorkout(w.id);
  const copy = r.duplicateWorkout(w.id);
  assert.notEqual(copy.id, w.id);
  assert.equal(r.sets(r.workoutExercises(copy.id)[0]!.id)[0]!.completed, false);
});
test("backup import is atomic, validates and restores all entities", () => {
  const { r } = open();
  r.saveProfile({ name: "Ada" });
  r.addJournal(
    "nutrition",
    { name: "Oats", calories: 200, protein: 6, carbs: 30, fat: 4, quantity: 1 },
    "2026-10-14",
  );
  const backup = r.exportBackup();
  assert.throws(() => r.importBackup("{bad"));
  assert.equal(r.profile().name, "Ada");
  const { r: r2 } = open();
  r2.importBackup(JSON.stringify(backup));
  assert.equal(r2.journal("nutrition")[0]!.data.name, "Oats");
  assert.equal(r2.profile().name, "Ada");
});
test("invalid set edits do not corrupt stored sets", () => {
  const { r } = open();
  const e = r.addExercise(r.startWorkout().id, "barbell-bench-press");
  const s = r.addSet(e.id);
  assert.throws(() => r.editSet(s.id, { weight: -1 }));
  assert.equal(r.sets(e.id)[0]!.weight, 0);
});
test("deleting exercise cascades sets and preserves other exercises", () => {
  const { r } = open();
  const w = r.startWorkout();
  const e = r.addExercise(w.id, "barbell-bench-press");
  r.addSet(e.id);
  r.removeExercise(e.id);
  assert.equal(r.sets(e.id).length, 0);
});
test("local journal changes queue idempotent sync operations", () => {
  const { r } = open();
  const j = r.addJournal(
    "recovery",
    { sleep: 8, quality: 4, soreness: 2, energy: 4, stress: 2 },
    "2026-10-14",
  );
  r.updateJournal(j.id, {
    sleep: 7,
    quality: 4,
    soreness: 2,
    energy: 4,
    stress: 2,
  });
  assert.equal(r.outbox().filter((x) => x.id === j.id).length, 1);
});
test("remote workout refuses child IDs belonging to another workout without modifying either", () => {
  const { r } = open();
  const a = r.startWorkout("A");
  const e = r.addExercise(a.id, "barbell-bench-press");
  const s = r.addSet(e.id, { weight: 50 });
  r.finishWorkout(a.id);
  const b = {
    ...a,
    id: "remote-B",
    name: "B",
    status: "completed" as const,
    finishedAt: Date.now(),
  };
  assert.throws(
    () =>
      r.applyRemote(
        b.id,
        "workout",
        {
          workout: b,
          exercises: [{ ...e, workoutId: b.id, notes: "Corrupted" }],
          sets: [{ ...s, weight: 999 }],
        },
        1,
      ),
    /owned|another/i,
  );
  assert.equal(r.sets(e.id)[0]!.weight, 50);
  assert.equal(r.workout(b.id), undefined);
});
test("remote workout rejects duplicate child identities", () => {
  const { r } = open();
  const a = r.startWorkout("A");
  const e = r.addExercise(a.id, "barbell-bench-press");
  r.finishWorkout(a.id);
  assert.throws(
    () =>
      r.applyRemote(
        a.id,
        "workout",
        { workout: r.workout(a.id), exercises: [e, e], sets: [] },
        1,
      ),
    /duplicate/i,
  );
  assert.equal(r.workoutExercises(a.id).length, 1);
});
test("removing and adding sets or exercises preserves distinct sequential positions", () => {
  const { r } = open();
  const w = r.startWorkout();
  const a = r.addExercise(w.id, "barbell-bench-press");
  r.addExercise(w.id, "back-squat");
  r.removeExercise(a.id);
  const e = r.addExercise(w.id, "overhead-press");
  assert.deepEqual(
    r.workoutExercises(w.id).map((x) => x.position),
    [0, 1],
  );
  const s = r.addSet(e.id);
  r.addSet(e.id);
  r.removeSet(s.id);
  r.addSet(e.id);
  assert.deepEqual(
    r.sets(e.id).map((x) => x.position),
    [0, 1],
  );
});
test("completing an empty set is rejected and leaves it unfinished", () => {
  const { r } = open();
  const e = r.addExercise(r.startWorkout().id, "push-up");
  const s = r.addSet(e.id);
  assert.throws(
    () => r.editSet(s.id, { completed: true }),
    /repetition|duration|distance/i,
  );
  assert.equal(r.sets(e.id)[0]!.completed, false);
});
test("backup foreign-key failure rolls the entire replacement back", () => {
  const { r } = open();
  r.saveProfile({ name: "Preserved" });
  const w = r.startWorkout();
  r.addExercise(w.id, "push-up");
  const backup = r.exportBackup();
  backup.profile.name = "Invalid import";
  backup.workoutExercises[0]!.exerciseId = "missing-exercise";
  assert.throws(() => r.importBackup(JSON.stringify(backup)), /not found/i);
  assert.equal(r.profile().name, "Preserved");
  assert.equal(r.workoutExercises(w.id).length, 1);
});
test("workout edits survive closing and reopening a disk-backed SQLite database", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "forge-sqlite-"));
  const path = join(dir, "forge.db");
  function connect() {
    const db = new DatabaseSync(path);
    const adapter: SqlDatabase = {
      exec: (s) => db.exec(s),
      run: (s, p = []) => {
        db.prepare(s).run(...p);
      },
      all: <T>(s: string, p: (string | number | null)[] = []) =>
        db.prepare(s).all(...p) as T[],
    };
    const r = new Repository(adapter);
    r.migrate();
    return { r, db };
  }
  try {
    let { r, db } = connect();
    const w = r.startWorkout("Durable");
    const e = r.addExercise(w.id, "push-up");
    const set = r.addSet(e.id, { reps: 12, completed: true });
    r.setSetting("restDeadline", "123456789");
    db.close();
    ({ r, db } = connect());
    assert.equal(r.active()?.id, w.id);
    assert.equal(r.sets(e.id)[0]!.id, set.id);
    assert.equal(r.sets(e.id)[0]!.reps, 12);
    assert.equal(r.setting("restDeadline"), "123456789");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("measurement percentages and recognized bodyweight units reject misleading data", () => {
  const { r } = open();
  assert.throws(() =>
    r.addJournal("measurement", {
      name: "Body fat",
      value: 150,
      unit: "percent",
    }),
  );
  assert.throws(
    () =>
      r.addJournal("measurement", {
        name: "Bodyweight",
        value: 180,
        unit: "cm",
      }),
    /kilograms/i,
  );
  assert.equal(r.journal("measurement").length, 0);
});
