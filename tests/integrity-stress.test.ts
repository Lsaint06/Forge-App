import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository, type SqlDatabase } from "../src/data/repository";
import { exercises as catalog } from "../src/data/catalog";
import { entriesOn, totalsOf } from "../src/domain/nutrition";
import { localDate, type Journal } from "../src/domain/types";
import { checkBackup } from "../scripts/dev/check-backup";

// Phase 8.5 (M4): randomized stress tests on disposable in-memory databases.
// A seeded generator drives the logger and the nutrition log the way a lifter
// might (rapid edits, additions, removals, reordering), while a fault injector
// makes a write, or the commit itself, fail part-way through a change, as a
// full disk or a crash would. After every step:
// - a change that failed leaves the database exactly as it was;
// - a change that succeeded matches an independent model of the session;
// - positions stay contiguous, no set is orphaned, and the copy queued for
//   sync is exactly what is stored.
// Restarts (a new Repository on the same database) and backup round trips,
// checked by the same checker as `npm run backup:check`, happen throughout.

/** mulberry32: small, fast and deterministic. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A database whose writes, or commit, can be made to fail on demand. */
function faultyDatabase() {
  const db = new DatabaseSync(":memory:");
  const fault = { at: 0, count: 0, fired: false };
  const hit = () => {
    if (!fault.at) return;
    if (++fault.count === fault.at) {
      fault.at = 0;
      fault.fired = true;
      throw new Error("injected failure");
    }
  };
  const adapter: SqlDatabase = {
    exec: (sql) => {
      if (sql === "COMMIT") hit();
      db.exec(sql);
    },
    run: (sql, params = []) => {
      hit();
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  };
  /** Fails the n-th write (or commit) of the next change. */
  const arm = (n: number) => Object.assign(fault, { at: n, count: 0 });
  const disarm = () => {
    const fired = fault.fired;
    Object.assign(fault, { at: 0, count: 0, fired: false });
    return fired;
  };
  /** Every stored row, except the bundled exercise catalogue. */
  const dump = () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    return JSON.stringify(
      tables.map(({ name }) => [
        name,
        (
          db
            .prepare(
              name === "exercises"
                ? "SELECT * FROM exercises WHERE custom=1"
                : `SELECT * FROM ${name}`,
            )
            .all() as unknown[]
        )
          .map((row) => JSON.stringify(row))
          .sort(),
      ]),
    );
  };
  const repository = () => {
    const r = new Repository(adapter);
    r.migrate();
    return r;
  };
  return { db, adapter, arm, disarm, dump, repository };
}

const EXERCISES = catalog.slice(0, 24).map((e) => e.id);

/** node:sqlite returns rows without Object's prototype: compare plain data. */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

/** Totals equal to floating-point precision (the order of addition differs). */
function sameTotals(
  actual: Record<string, number>,
  expected: Record<string, number>,
  what: string,
) {
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    what,
  );
  for (const key of Object.keys(expected))
    assert.ok(
      Math.abs(actual[key]! - expected[key]!) < 1e-6,
      `${what}: ${key} ${actual[key]} ≠ ${expected[key]}`,
    );
}

type ModelSet = { id: string; weight: number; reps: number; done: boolean };
type ModelRow = {
  id: string;
  exerciseId: string;
  notes: string;
  sets: ModelSet[];
};

/** What the session should hold, kept independently of the database. */
function checkWorkout(r: Repository, workoutId: string, rows: ModelRow[]) {
  const stored = r.workoutExercises(workoutId);
  assert.deepEqual(
    stored.map((e) => e.id),
    rows.map((e) => e.id),
    "exercise order",
  );
  assert.deepEqual(
    stored.map((e) => e.position),
    stored.map((_, i) => i),
    "exercise positions",
  );
  for (const [i, row] of rows.entries()) {
    assert.equal(stored[i]!.exerciseId, row.exerciseId);
    assert.equal(stored[i]!.notes, row.notes);
    const sets = r.sets(row.id);
    assert.deepEqual(
      sets.map((s) => s.position),
      sets.map((_, j) => j),
      "set positions",
    );
    assert.deepEqual(
      sets.map((s) => ({
        id: s.id,
        weight: s.weight,
        reps: s.reps,
        done: !!s.completed,
      })),
      row.sets,
      "sets",
    );
  }
  assert.equal(
    r.db.all(
      "SELECT id FROM workout_sets WHERE exercise_row_id NOT IN (SELECT id FROM workout_exercises)",
    ).length,
    0,
    "orphaned sets",
  );
  // What sync would send is exactly what is stored.
  const queued = r.outboxRow(workoutId);
  assert.ok(queued, "the session waits for sync");
  assert.deepEqual(
    JSON.parse(queued.payload),
    plain({
      workout: r.workout(workoutId),
      exercises: r.workoutExercises(workoutId),
      sets: r.workoutSets(workoutId),
    }),
  );
  assert.equal(
    r.outbox().filter((o) => o.id === workoutId).length,
    1,
    "one queued copy per session",
  );
}

/** Round trip through a backup file, checked like `npm run backup:check`. */
function roundTrip(r: Repository, workoutId: string) {
  const text = JSON.stringify(r.exportBackup());
  const check = checkBackup(text);
  assert.ok(check.ok, check.lines.join("\n"));
  const fresh = faultyDatabase().repository();
  fresh.importBackup(text);
  assert.deepEqual(
    plain(fresh.workoutSnapshot(workoutId)),
    plain(r.workoutSnapshot(workoutId)),
  );
  assert.deepEqual(
    plain(fresh.journal("nutrition")),
    plain(r.journal("nutrition")),
  );
}

for (const seed of [1, 2, 3, 4]) {
  test(`logger stress, seed ${seed}: interrupted changes leave nothing half-written; the rest match the model`, () => {
    const next = random(seed);
    const pick = <T>(list: readonly T[]) =>
      list[Math.floor(next() * list.length)]!;
    const store = faultyDatabase();
    let r = store.repository();
    const w = r.startWorkout("Stress");
    const rows: ModelRow[] = [];
    const allSets = () =>
      rows.flatMap((row) => row.sets.map((s) => ({ row, s })));
    let failures = 0;
    let refused = 0;
    for (let step = 0; step < 900; step++) {
      const before = store.dump();
      type Change = { run: () => unknown; apply: (result: unknown) => void };
      const changes: Change[] = [
        {
          run: () => r.addExercise(w.id, pick(EXERCISES)),
          apply: (e) => {
            const row = e as { id: string; exerciseId: string };
            rows.push({
              id: row.id,
              exerciseId: row.exerciseId,
              notes: "",
              sets: [],
            });
          },
        },
      ];
      if (rows.length) {
        const row = pick(rows);
        const weight = Math.round(next() * 2000) / 10;
        const reps = Math.floor(next() * 21);
        changes.push(
          {
            run: () => r.addSet(row.id, { weight, reps }),
            apply: (s) =>
              row.sets.push({
                id: (s as { id: string }).id,
                weight,
                reps,
                done: false,
              }),
          },
          {
            run: () => r.moveExercise(row.id, next() < 0.5 ? -1 : 1),
            apply: () => {
              const i = rows.indexOf(row);
              const dir =
                r.workoutExercises(w.id).findIndex((e) => e.id === row.id) - i;
              if (dir) [rows[i], rows[i + dir]] = [rows[i + dir]!, row];
            },
          },
          {
            run: () => r.editExercise(row.id, { notes: `note ${step}` }),
            apply: () => (row.notes = `note ${step}`),
          },
        );
        if (next() < 0.15)
          changes.push({
            run: () => r.removeExercise(row.id),
            apply: () => rows.splice(rows.indexOf(row), 1),
          });
      }
      const sets = allSets();
      if (sets.length) {
        const { row, s } = pick(sets);
        const patch = {
          weight: Math.round(next() * 2000) / 10,
          reps: Math.floor(next() * 21),
          completed: next() < 0.5,
        };
        // Rapid edits dominate a real session.
        for (let n = 0; n < 4; n++)
          changes.push({
            run: () => r.editSet(s.id, patch),
            apply: () =>
              Object.assign(s, {
                weight: patch.weight,
                reps: patch.reps,
                done: patch.completed,
              }),
          });
        changes.push({
          run: () => r.removeSet(s.id),
          apply: () => row.sets.splice(row.sets.indexOf(s), 1),
        });
      }
      if (next() < 0.05)
        changes.push({ run: () => r.pauseWorkout(w.id), apply: () => {} });
      if (next() < 0.05)
        changes.push({
          run: () => r.updateWorkout(w.id, { notes: `notes ${step}` }),
          apply: () => {},
        });

      const change = pick(changes);
      if (next() < 0.35) store.arm(1 + Math.floor(next() * 8));
      let result: unknown;
      let threw = false;
      try {
        result = change.run();
      } catch {
        threw = true;
      }
      const injected = store.disarm();
      if (threw) {
        if (injected) failures++;
        else refused++;
        assert.equal(
          store.dump(),
          before,
          `step ${step}: a failed change left a partial write`,
        );
        // A failed change must not leave the open repository believing it.
        checkWorkout(store.repository(), w.id, rows);
      } else change.apply(result);
      checkWorkout(r, w.id, rows);
      if (step % 100 === 99) {
        // Forge restarts: a new repository over the same database.
        r = store.repository();
        checkWorkout(r, w.id, rows);
      }
      if (step % 300 === 299) roundTrip(r, w.id);
    }
    assert.ok(failures > 50, `${failures} injected failures`);
    assert.ok(refused >= 0);
    // Saving twice keeps one session.
    r.finishWorkout(w.id);
    r.finishWorkout(w.id);
    assert.equal(r.workouts().filter((x) => x.id === w.id).length, 1);
    assert.equal(r.workout(w.id)?.status, "completed");
    assert.equal(r.active(), undefined);
    checkWorkout(r, w.id, rows);
    roundTrip(r, w.id);
  });
}

test("rapid edits to one set keep the last value and one queued copy", () => {
  const store = faultyDatabase();
  const r = store.repository();
  const w = r.startWorkout("Rapid");
  const row = r.addExercise(w.id, EXERCISES[0]!);
  const set = r.addSet(row.id);
  for (let i = 1; i <= 500; i++)
    r.editSet(set.id, { weight: i / 2, reps: i % 13 });
  assert.equal(r.sets(row.id)[0]!.weight, 250);
  assert.equal(r.sets(row.id)[0]!.reps, 500 % 13);
  assert.equal(r.outbox().length, 1);
  checkWorkout(r, w.id, [
    {
      id: row.id,
      exerciseId: row.exerciseId,
      notes: "",
      sets: [{ id: set.id, weight: 250, reps: 500 % 13, done: false }],
    },
  ]);
});

for (const seed of [11, 12]) {
  test(`nutrition stress, seed ${seed}: logged food and daily totals survive failures, restarts and backups`, () => {
    const next = random(seed);
    const store = faultyDatabase();
    let r = store.repository();
    const model = new Map<string, Journal["data"]>();
    const today = localDate();
    const meals = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
    const food = () => ({
      name: `Food ${Math.floor(next() * 1000)}`,
      calories: Math.round(next() * 9000) / 10,
      protein: Math.round(next() * 600) / 10,
      carbs: Math.round(next() * 1200) / 10,
      fat: Math.round(next() * 500) / 10,
      quantity: [0.5, 1, 1.5, 2, 3][Math.floor(next() * 5)]!,
      serving: "100 g",
      meal: meals[Math.floor(next() * meals.length)]!,
    });
    const expected = () => {
      const entries = [...model.entries()].map(
        ([id, data]) =>
          ({
            id,
            data,
            date: today,
            createdAt: 0,
            kind: "nutrition",
          }) as Journal,
      );
      return totalsOf(entries);
    };
    let failures = 0;
    for (let step = 0; step < 400; step++) {
      const before = store.dump();
      const ids = [...model.keys()];
      const roll = next();
      let run: () => unknown;
      let apply: (result: unknown) => void;
      if (!ids.length || roll < 0.5) {
        const data = food();
        run = () => r.addJournal("nutrition", data, today);
        apply = (j) => model.set((j as Journal).id, data);
      } else if (roll < 0.8) {
        const id = ids[Math.floor(next() * ids.length)]!;
        const data = food();
        run = () => r.updateJournal(id, data);
        apply = () => model.set(id, data);
      } else {
        const id = ids[Math.floor(next() * ids.length)]!;
        run = () => r.deleteJournal(id);
        apply = () => model.delete(id);
      }
      if (next() < 0.35) store.arm(1 + Math.floor(next() * 6));
      let result: unknown;
      let threw = false;
      try {
        result = run();
      } catch {
        threw = true;
      }
      if (store.disarm()) failures++;
      if (threw)
        assert.equal(store.dump(), before, `step ${step}: partial write`);
      else apply(result);
      const stored = r.journal("nutrition");
      assert.deepEqual(
        plain([...new Map(stored.map((j) => [j.id, j.data]))].sort()),
        plain([...model].sort()),
        `step ${step}: logged food`,
      );
      sameTotals(
        totalsOf(entriesOn(stored, today)),
        expected(),
        `step ${step}: totals`,
      );
      // Each change waits for sync, with what is stored.
      for (const j of stored) {
        const queued = r.outboxRow(j.id);
        assert.ok(queued, "queued");
        assert.deepEqual(JSON.parse(queued.payload).data, plain(j.data));
      }
      if (step % 80 === 79) r = store.repository();
      if (step % 200 === 199) {
        const fresh = faultyDatabase().repository();
        fresh.importBackup(JSON.stringify(r.exportBackup()));
        sameTotals(
          totalsOf(entriesOn(fresh.journal("nutrition"), today)),
          expected(),
          "after a backup",
        );
      }
    }
    assert.ok(failures > 20, `${failures} injected failures`);
  });
}

/** A phone with real training on it, for the backup fuzz. */
function trainedRepository() {
  const store = faultyDatabase();
  const r = store.repository();
  for (let n = 0; n < 3; n++) {
    const w = r.startWorkout(`Session ${n}`);
    for (const exerciseId of EXERCISES.slice(n, n + 3)) {
      const row = r.addExercise(w.id, exerciseId);
      for (let s = 0; s < 3; s++)
        r.addSet(row.id, { weight: 60 + s * 5, reps: 8, completed: true });
    }
    if (n < 2) r.finishWorkout(w.id);
  }
  r.addJournal("nutrition", {
    name: "Oats",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    quantity: 1,
    serving: "40 g",
    meal: "Breakfast",
  });
  return { store, r };
}

test("damaged backups are refused whole: truncated anywhere, or with broken records", () => {
  const source = trainedRepository().r;
  const text = JSON.stringify(source.exportBackup());
  // The phone being restored already has its own training.
  const target = trainedRepository();
  const original = target.store.dump();
  const refusedWhole = (damaged: string, what: string) => {
    let imported = false;
    try {
      target.r.importBackup(damaged);
      imported = true;
    } catch {
      // Refused: the phone must be exactly as it was.
    }
    assert.equal(imported, false, `${what}: imported`);
    assert.equal(target.store.dump(), original, `${what}: partly replaced`);
    assert.equal(checkBackup(damaged).ok, false, `${what}: called restorable`);
  };
  // Cut off anywhere: a copy that stopped part-way.
  for (let i = 1; i < 60; i++) {
    const at = Math.floor((text.length * i) / 60);
    refusedWhole(text.slice(0, at), `truncated at ${at}`);
  }
  type Row = Record<string, unknown>;
  type File = {
    version: number;
    profile?: unknown;
    workouts: Row[];
    workoutExercises: Row[];
    sets: Row[];
    journals: (Row & { data: Row })[];
  };
  const b = JSON.parse(text) as File;
  const first = <T>(rows: T[]) => rows[0]!;
  const broken: [string, (copy: File) => void][] = [
    [
      "a set whose exercise is missing",
      (c) => (first(c.sets).exerciseRowId = "missing"),
    ],
    [
      "an exercise whose session is missing",
      (c) => (first(c.workoutExercises).workoutId = "missing"),
    ],
    ["a duplicated set", (c) => c.sets.push(first(c.sets))],
    ["a duplicated session", (c) => c.workouts.push(first(c.workouts))],
    [
      "two sessions in progress",
      (c) => {
        const finished = c.workouts.find((w) => w.status === "completed")!;
        finished.status = "active";
        finished.finishedAt = null;
      },
    ],
    ["a set with text for its weight", (c) => (first(c.sets).weight = "heavy")],
    ["a negative rep count", (c) => (first(c.sets).reps = -3)],
    [
      "sessions that aren't a list",
      (c) => ((c as unknown as Row).workouts = {}),
    ],
    ["no profile", (c) => delete c.profile],
    ["a newer format", (c) => (c.version = 2)],
    [
      "a food entry without calories",
      (c) => delete first(c.journals).data.calories,
    ],
  ];
  for (const [what, damage] of broken) {
    const copy = structuredClone(b);
    damage(copy);
    refusedWhole(JSON.stringify(copy), what);
  }
  // The intact file still restores, completely.
  target.r.importBackup(text);
  assert.deepEqual(
    target.r
      .workouts()
      .map((w) => w.id)
      .sort(),
    source
      .workouts()
      .map((w) => w.id)
      .sort(),
  );
});
