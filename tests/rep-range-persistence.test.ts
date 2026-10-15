import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository, type SqlDatabase } from "../src/data/repository";
import { schema } from "../src/data/schema";
import { exercises as catalog } from "../src/data/catalog";
import {
  defaults,
  type Prescription,
  type RepTarget,
} from "../src/domain/types";
import {
  prescriptionSchema,
  repTargetSchema,
  workoutExerciseSchema,
} from "../src/domain/validation";

function open(t: TestContext, migrate = true) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const adapter: SqlDatabase = {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  };
  const r = new Repository(adapter);
  if (migrate) r.migrate();
  return { r, db };
}

const target: RepTarget = { min: 8, max: 12, sets: 2 };
const prescription: Prescription = {
  exerciseId: "barbell-bench-press",
  sets: target.sets,
  reps: target.min,
  repMax: target.max,
  weight: 40,
  rest: 120,
};

function start(r: Repository, patch: Partial<Prescription> = {}) {
  const template = r.saveTemplate("Range", [{ ...prescription, ...patch }]);
  const workout = r.startWorkout("Range", template.id);
  const row = r.workoutExercises(workout.id)[0]!;
  return { template, workout, row };
}

test("range validation accepts legacy fixed/zero reps and rejects malformed ranges and snapshots", (t) => {
  const { repMax: _, ...fixed } = prescription;
  assert.deepEqual(prescriptionSchema.parse(fixed), fixed);
  assert.equal(prescriptionSchema.parse({ ...fixed, reps: 0 }).reps, 0);
  assert.deepEqual(repTargetSchema.parse(target), target);
  for (const patch of [
    { repMax: 7 },
    { repMax: null },
    { repMax: 0 },
    { repMax: 12.5 },
    { reps: 0 },
    { repMax: Infinity },
  ])
    assert.equal(
      prescriptionSchema.safeParse({ ...prescription, ...patch }).success,
      false,
    );
  const { r } = open(t);
  const row = r.addExercise(r.startWorkout().id, prescription.exerciseId);
  assert.deepEqual(workoutExerciseSchema.parse(row), row);
  for (const invalid of [
    null,
    {},
    { min: 8 },
    { min: 8, max: 12 },
    { min: 12, max: 8, sets: 2 },
    { ...target, min: 0 },
    { ...target, max: NaN },
    { ...target, sets: 0 },
    { ...target, sets: 1.5 },
    { ...target, min: -1 },
    { ...target, sets: 31 },
  ])
    assert.equal(
      workoutExerciseSchema.safeParse({ ...row, target: invalid }).success,
      false,
    );
});

test("template ranges, prescribed rest, and frozen targets survive repository reopening", (t) => {
  const { r } = open(t);
  const { template, workout, row } = start(r);
  assert.deepEqual(r.templates()[0]!.exercises, [prescription]);
  assert.deepEqual(row.target, target);
  assert.equal(row.rest, prescription.rest);
  assert.deepEqual(
    r.sets(row.id).map((set) => [set.reps, set.rest]),
    [
      [8, 120],
      [8, 120],
    ],
  );
  r.saveTemplate(
    "Changed",
    [{ ...prescription, reps: 3, repMax: 5, sets: 4, rest: 30 }],
    template.id,
  );
  const reopened = new Repository(r.db);
  reopened.migrate();
  assert.deepEqual(reopened.workoutExercises(workout.id)[0]!.target, target);
  assert.equal(reopened.workoutExercises(workout.id)[0]!.rest, 120);
  assert.equal(reopened.templates()[0]!.exercises[0]!.repMax, 5);
});

test("legacy fixed targets snapshot positive reps; zero reps and freestyle omit targets", (t) => {
  const { r } = open(t);
  const fixed = start(r, { repMax: undefined });
  assert.equal("repMax" in r.templates()[0]!.exercises[0]!, false);
  assert.deepEqual(fixed.row.target, { ...target, max: target.min });
  const freestyle = r.addExercise(fixed.workout.id, "push-up");
  assert.equal("target" in r.workoutExercises(fixed.workout.id)[1]!, false);
  assert.equal("target" in freestyle, false);
  r.finishWorkout(fixed.workout.id);
  const zero = start(r, { reps: 0, repMax: undefined });
  assert.equal("target" in zero.row, false);
  assert.equal(zero.row.rest, 120);
  assert.doesNotThrow(() => r.exportBackup());
});

test("exercise edits cannot replace snapshots; substituting a movement clears the target", (t) => {
  const { r } = open(t);
  const { workout, row } = start(r);
  r.editExercise(row.id, {
    notes: "Keep snapshot",
    exerciseId: row.exerciseId,
  });
  r.editExercise(row.id, {
    target: { min: 1, max: 2, sets: 1 },
    rest: 60,
  } as Parameters<Repository["editExercise"]>[1]);
  assert.deepEqual(r.workoutExercises(workout.id)[0]!.target, target);
  assert.equal(r.workoutExercises(workout.id)[0]!.rest, 60);
  r.editExercise(row.id, { exerciseId: "push-up" });
  assert.equal("target" in r.workoutExercises(workout.id)[0]!, false);
  r.editExercise(row.id, { exerciseId: row.exerciseId });
  assert.equal("target" in r.workoutExercises(workout.id)[0]!, false);
});

test("duplicate and workout-to-template repeat preserve original ranges and set count", (t) => {
  const { r } = open(t);
  const { workout, row } = start(r);
  for (const set of r.sets(row.id))
    r.editSet(set.id, { reps: 11, completed: true });
  r.addSet(row.id, { kind: "warmup", reps: 5 });
  r.finishWorkout(workout.id);
  const copy = r.duplicateWorkout(workout.id);
  const copied = r.workoutExercises(copy.id)[0]!;
  assert.notEqual(copied.id, row.id);
  assert.deepEqual(copied.target, target);
  assert.equal(copied.rest, 120);
  assert.equal(r.sets(copied.id).length, 3);
  assert.ok(r.sets(copied.id).every((set) => !set.completed));
  r.finishWorkout(copy.id);
  const template = r.templateFromWorkout(workout.id, "Repeat");
  assert.deepEqual(template.exercises, [{ ...prescription, weight: 40 }]);
  const repeated = r.startWorkout(template.name, template.id);
  const repeatedRow = r.workoutExercises(repeated.id)[0]!;
  assert.deepEqual(repeatedRow.target, target);
  assert.equal(r.sets(repeatedRow.id).length, 2);
});

test("backup round trips preserve ranges and snapshots, and accept old optional-free backups", (t) => {
  const { r } = open(t);
  const { workout } = start(r);
  const { r: restored } = open(t);
  restored.importBackup(JSON.stringify(r.exportBackup()));
  assert.deepEqual(restored.templates()[0]!.exercises[0], prescription);
  assert.deepEqual(restored.workoutExercises(workout.id)[0]!.target, target);
  const legacy = r.exportBackup();
  for (const template of legacy.templates)
    for (const p of template.exercises) delete p.repMax;
  for (const row of legacy.workoutExercises) delete row.target;
  restored.importBackup(JSON.stringify(legacy));
  assert.equal("repMax" in restored.templates()[0]!.exercises[0]!, false);
  assert.equal("target" in restored.workoutExercises(workout.id)[0]!, false);
  assert.equal("target" in restored.exportBackup().workoutExercises[0]!, false);
  const invalid = r.exportBackup();
  invalid.workoutExercises[0]!.target = { ...target, max: 1 };
  assert.throws(() => restored.importBackup(JSON.stringify(invalid)));
  assert.equal("target" in restored.workoutExercises(workout.id)[0]!, false);
});

test("cloud template and workout aggregates carry ranges through applyRemote and requeue", (t) => {
  const { r } = open(t);
  const { template, workout, row } = start(r);
  r.editSet(r.sets(row.id)[0]!.id, { reps: 10, completed: true });
  r.finishWorkout(workout.id);
  const { r: remote } = open(t);
  for (const operation of r.outbox())
    remote.applyRemote(
      operation.id,
      operation.kind,
      JSON.parse(operation.payload),
      1,
    );
  assert.deepEqual(remote.templates()[0]!.exercises[0], prescription);
  assert.deepEqual(remote.workoutExercises(workout.id)[0]!.target, target);
  assert.equal(remote.sets(row.id)[0]!.completed, true);
  remote.editExercise(row.id, { notes: "Requeue" });
  const aggregate = JSON.parse(
    remote.outbox().find((op) => op.id === workout.id)!.payload,
  );
  assert.deepEqual(aggregate.exercises[0].target, target);
  const bad = {
    ...aggregate,
    exercises: [{ ...aggregate.exercises[0], target: { min: 8 } }],
  };
  assert.throws(() => remote.applyRemote(workout.id, "workout", bad, 2));
  assert.deepEqual(remote.workoutExercises(workout.id)[0]!.target, target);
  const oldTemplate = { ...template, exercises: [{ ...prescription }] };
  delete oldTemplate.exercises[0]!.repMax;
  remote.applyRemote(template.id, "template", oldTemplate, 2);
  const oldAggregate = {
    ...aggregate,
    exercises: [{ ...aggregate.exercises[0] }],
  };
  delete oldAggregate.exercises[0].target;
  remote.applyRemote(workout.id, "workout", oldAggregate, 2);
  assert.equal("repMax" in remote.templates()[0]!.exercises[0]!, false);
  assert.equal("target" in remote.workoutExercises(workout.id)[0]!, false);
});

test("target history uses only complete matching groups, ignores warmups, and remains newest-first", (t) => {
  const { r } = open(t);
  const create = (patch: Partial<Prescription> = {}, completed = true) => {
    const result = start(r, patch);
    for (const set of r.sets(result.row.id)) r.editSet(set.id, { completed });
    r.finishWorkout(result.workout.id);
    return result;
  };
  const oldest = create();
  r.addSet(oldest.row.id, { kind: "warmup", reps: 5, completed: false });
  r.db.run("UPDATE workouts SET finished_at=1 WHERE id=?", [oldest.workout.id]);
  const newest = create();
  r.db.run("UPDATE workouts SET finished_at=2 WHERE id=?", [newest.workout.id]);
  create({ reps: 6 });
  create({ repMax: 15 });
  create({ sets: 3 });
  create({ repMax: undefined });
  create({}, false);
  const missing = create();
  r.removeSet(r.sets(missing.row.id)[0]!.id);
  const extra = create();
  r.addSet(extra.row.id, { reps: 8, completed: true });
  const mixed = create();
  const unrelatedTarget = r.addExercise(
    mixed.workout.id,
    prescription.exerciseId,
  );
  r.addSet(unrelatedTarget.id, { reps: 8, completed: true });
  const combinedPartial = create();
  r.removeSet(r.sets(combinedPartial.row.id)[0]!.id);
  const partialRow = r.addExercise(
    combinedPartial.workout.id,
    prescription.exerciseId,
  );
  r.addSet(partialRow.id, { reps: 8, completed: true });
  const backup = r.exportBackup();
  backup.workoutExercises.find((row) => row.id === partialRow.id)!.target =
    target;
  r.importBackup(JSON.stringify(backup));
  const active = start(r);
  for (const set of r.sets(active.row.id))
    r.editSet(set.id, { completed: true });
  const expected = [
    r.sets(newest.row.id),
    r.sets(oldest.row.id).filter((s) => s.kind !== "warmup"),
  ];
  assert.deepEqual(r.targetHistory(prescription.exerciseId, target), expected);
  r.pauseWorkout(active.workout.id);
  assert.deepEqual(r.targetHistory(prescription.exerciseId, target), expected);
  assert.deepEqual(r.targetHistory("push-up", target), []);
});

test("v2 migration adds nullable columns once without changing any legacy rows", (t) => {
  const { r, db } = open(t, false);
  db.exec(schema);
  assert.equal(
    r.db
      .all<{ name: string }>("PRAGMA table_info(workout_exercises)")
      .some((c) => c.name === "target"),
    false,
  );
  const exercise = catalog.find((e) => e.id === prescription.exerciseId)!;
  r.db.run("INSERT INTO exercises(id,data,custom) VALUES(?,?,0)", [
    exercise.id,
    JSON.stringify(exercise),
  ]);
  r.db.run("INSERT INTO profile(id,data) VALUES('local',?)", [
    JSON.stringify({ ...defaults, name: "Legacy" }),
  ]);
  db.exec(`
    INSERT INTO templates VALUES('t','Legacy template','Keep',1);
    INSERT INTO template_exercises VALUES('p','t','barbell-bench-press',0,2,0,30,75);
    INSERT INTO workouts VALUES('w','Legacy workout','completed',1,2,NULL,0,'Keep','t',2);
    INSERT INTO workout_exercises VALUES('e','w','barbell-bench-press',0,'Keep',75,'group');
    INSERT INTO workout_sets VALUES('s','e',0,30,8,0,0,NULL,NULL,'working',1,75,'','Keep','both');
    INSERT INTO favorites VALUES('barbell-bench-press');
    INSERT INTO journal VALUES('j','program','2026-10-15','{"name":"Legacy"}',1,2);
    INSERT INTO settings VALUES('preserve','yes');
    INSERT INTO sync_meta VALUES('w',3);
    INSERT INTO outbox VALUES('w','workout','{}',3,1,4,0);
    INSERT INTO conflicts VALUES('w','{}','{}',3);
  `);
  const tables = [
    "profile",
    "favorites",
    "workouts",
    "workout_sets",
    "templates",
    "journal",
    "settings",
    "sync_meta",
    "outbox",
    "conflicts",
  ];
  const before = tables.map((table) => r.db.all(`SELECT * FROM ${table}`));
  for (let run = 0; run < 2; run++) {
    r.migrate();
    assert.deepEqual(
      tables.map((table) => r.db.all(`SELECT * FROM ${table}`)),
      before,
    );
    assert.deepEqual(
      r.db
        .all<{ version: number }>(
          "SELECT version FROM migrations ORDER BY version",
        )
        .map((row) => row.version),
      [1, 2],
    );
    assert.deepEqual(r.templates()[0]!.exercises, [
      {
        exerciseId: exercise.id,
        sets: 2,
        reps: 0,
        weight: 30,
        rest: 75,
      },
    ]);
    assert.deepEqual(r.workoutExercises("w"), [
      {
        id: "e",
        workoutId: "w",
        exerciseId: exercise.id,
        position: 0,
        notes: "Keep",
        rest: 75,
        groupId: "group",
      },
    ]);
    assert.equal(r.exercise(exercise.id)!.name, exercise.name);
  }
  assert.equal(
    r.db.all<{ rep_max: null }>("SELECT rep_max FROM template_exercises")[0]!
      .rep_max,
    null,
  );
  assert.equal(
    r.db.all<{ target: null }>("SELECT target FROM workout_exercises")[0]!
      .target,
    null,
  );
});

test("migration failure rolls back both additive columns and the version marker", (t) => {
  const { r, db } = open(t, false);
  db.exec(schema);
  const adapter: SqlDatabase = {
    ...r.db,
    exec: (sql) => {
      if (sql.includes("ALTER TABLE workout_exercises")) {
        db.exec("ALTER TABLE template_exercises ADD COLUMN rep_max INTEGER;");
        throw new Error("Simulated migration interruption");
      }
      db.exec(sql);
    },
  };
  assert.throws(() => new Repository(adapter).migrate(), /interruption/);
  assert.equal(
    r.db.all("SELECT version FROM migrations WHERE version=2").length,
    0,
  );
  assert.equal(
    r.db
      .all<{ name: string }>("PRAGMA table_info(template_exercises)")
      .some((c) => c.name === "rep_max"),
    false,
  );
  r.migrate();
  r.migrate();
  assert.equal(
    r.db.all("SELECT version FROM migrations WHERE version=2").length,
    1,
  );
});
