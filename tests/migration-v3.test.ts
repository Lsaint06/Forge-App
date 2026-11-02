import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository, type SqlDatabase } from "../src/data/repository";
import { schema, migrationV2 } from "../src/data/schema";
import { exercises as catalog } from "../src/data/catalog";
import { defaults } from "../src/domain/types";

// Phase 7.8D: the v3 migration is additive, runs in one transaction, and is
// safe to repeat. An interrupted start must leave a database from before
// 7.8D exactly as it was, every pending change included, and the next start
// must complete it.

function connect(t: TestContext, db = new DatabaseSync(":memory:")) {
  t.after(() => {
    if (db.isOpen) db.close();
  });
  const adapter: SqlDatabase = {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  };
  return { db, adapter };
}

const LEGACY_TABLES = [
  "profile",
  "favorites",
  "workouts",
  "journal",
  "settings",
  "sync_meta",
  "outbox",
  "conflicts",
];
const dump = (a: SqlDatabase, tables = LEGACY_TABLES) =>
  Object.fromEntries(
    tables.map((table) => [
      table,
      a.all(`SELECT * FROM ${table} ORDER BY rowid`),
    ]),
  );
const tables = (a: SqlDatabase) =>
  a
    .all<{
      name: string;
    }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .map((row) => row.name);
const versions = (a: SqlDatabase) =>
  a
    .all<{
      version: number;
    }>("SELECT version FROM migrations ORDER BY version")
    .map((row) => row.version);

const legacyProfile = JSON.stringify({ ...defaults, name: "Legacy" });
const BENCH = "barbell-bench-press";
const SQUAT = "back-squat";

/**
 * Every row from before v3 is still there, unchanged. The only additions:
 * each favourite as a synced record, queued as new (revision 0).
 */
function assertAdditive(
  before: Record<string, unknown[]>,
  after: Record<string, unknown[]>,
) {
  for (const table of LEGACY_TABLES) {
    const was = before[table]!.map((row) => JSON.stringify(row));
    const now = after[table]!.map((row) => JSON.stringify(row));
    for (const row of was) assert.ok(now.includes(row), `${table} kept ${row}`);
    const added = after[table]!.filter(
      (row) => !was.includes(JSON.stringify(row)),
    ) as { id: string; revision?: number; kind: string }[];
    if (table === "journal")
      assert.deepEqual(
        added.map((row) => `${row.id} ${row.kind}`).sort(),
        [`favorite:${BENCH} favorite`, `favorite:${SQUAT} favorite`].sort(),
      );
    else if (table === "outbox")
      assert.deepEqual(
        added.map((row) => `${row.id}@${row.revision}`).sort(),
        [`favorite:${BENCH}@0`, `favorite:${SQUAT}@0`].sort(),
      );
    else assert.deepEqual(added, [], `${table} unchanged`);
  }
}

/**
 * A database as Forge left it before Phase 7.8D (migrations 1 and 2): a
 * synchronized profile, favourites, a journal entry and changes still
 * waiting to upload.
 */
function legacyDatabase(t: TestContext, profileWaiting = false) {
  const { db, adapter } = connect(t);
  db.exec(schema);
  db.exec(migrationV2);
  for (const e of catalog)
    adapter.run("INSERT INTO exercises(id,data,custom) VALUES(?,?,0)", [
      e.id,
      JSON.stringify(e),
    ]);
  adapter.run("INSERT INTO profile(id,data) VALUES('local',?)", [
    legacyProfile,
  ]);
  db.exec(`
    INSERT INTO favorites VALUES('${BENCH}');
    INSERT INTO favorites VALUES('${SQUAT}');
    INSERT INTO journal VALUES('m1','measurement','2026-10-30','{"name":"Waist","value":82,"unit":"cm"}',1,2);
    INSERT INTO settings VALUES('cloudOwner','user-a');
    INSERT INTO sync_meta VALUES('profile',4);
    INSERT INTO sync_meta VALUES('m1',2);
    INSERT INTO outbox VALUES('m1','journal','{"id":"m1"}',2,0,0,0);
    INSERT INTO outbox VALUES('w-gone','workout','{}',3,1,99,1);
  `);
  if (profileWaiting)
    adapter.run(
      "INSERT INTO outbox(id,kind,payload,revision) VALUES('profile','profile',?,4)",
      [legacyProfile],
    );
  return { db, adapter };
}

test("v3 adds its tables and keeps every row and waiting change", (t) => {
  const { adapter } = legacyDatabase(t);
  const before = dump(adapter);
  const r = new Repository(adapter);
  r.migrate();
  assert.deepEqual(versions(adapter), [1, 2, 3]);
  assert.ok(tables(adapter).includes("sync_base"));
  assert.ok(tables(adapter).includes("newer_records"));
  assert.ok(tables(adapter).includes("favorites_seen"));
  assertAdditive(before, dump(adapter));
  // The favourites are kept, now as synced records.
  assert.deepEqual(r.favorites(), [BENCH, SQUAT]);
  // The synchronized profile is the base for merging later changes.
  assert.deepEqual(
    adapter
      .all("SELECT * FROM sync_base")
      .map((row) => ({ ...(row as object) })),
    [{ id: "profile", revision: 4, payload: legacyProfile }],
  );
});

test("no base is recorded while a profile change is still waiting", (t) => {
  const { adapter } = legacyDatabase(t, true);
  new Repository(adapter).migrate();
  assert.deepEqual(adapter.all("SELECT * FROM sync_base"), []);
  assert.equal(
    adapter.all("SELECT * FROM outbox WHERE id='profile'").length,
    1,
  );
});

test("an interrupted v3 leaves the database as it was; the next start completes it", (t) => {
  for (const failAt of [
    "CREATE TABLE IF NOT EXISTS newer_records",
    "VALUES(3",
  ]) {
    const { db, adapter } = legacyDatabase(t);
    const before = dump(adapter);
    const tablesBefore = tables(adapter);
    let interrupted = false;
    const failing: SqlDatabase = {
      ...adapter,
      exec: (sql) => {
        if (!interrupted && sql.includes(failAt)) {
          interrupted = true;
          // Part of the step ran before Forge stopped.
          db.exec(
            "CREATE TABLE IF NOT EXISTS sync_base(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL);",
          );
          throw new Error("Simulated interruption");
        }
        adapter.exec(sql);
      },
      run: (sql, params) => {
        if (!interrupted && sql.includes(failAt)) {
          interrupted = true;
          throw new Error("Simulated interruption");
        }
        adapter.run(sql, params);
      },
    };
    assert.throws(() => new Repository(failing).migrate(), /interruption/);
    assert.ok(interrupted);
    assert.deepEqual(versions(adapter), [1, 2]);
    assert.deepEqual(tables(adapter), tablesBefore);
    assert.deepEqual(dump(adapter), before);

    // Retry, then start again twice: one result, no duplicates.
    const r = new Repository(adapter);
    r.migrate();
    const migrated = dump(adapter, [...LEGACY_TABLES, "sync_base"]);
    r.migrate();
    new Repository(adapter).migrate();
    assert.deepEqual(versions(adapter), [1, 2, 3]);
    assert.deepEqual(dump(adapter, [...LEGACY_TABLES, "sync_base"]), migrated);
    assertAdditive(before, dump(adapter));
  }
});

test("waiting changes come through the update and every later start unchanged", (t) => {
  const { adapter } = legacyDatabase(t);
  const outbox = () =>
    adapter
      .all("SELECT * FROM outbox ORDER BY rowid")
      .map((row) => JSON.stringify(row));
  const before = outbox();
  const r = new Repository(adapter);
  r.migrate();
  for (const row of before) assert.ok(outbox().includes(row), row);
  // This version's own changes, made offline: a new favourite, and the
  // removal of one carried over from before the update.
  r.toggleFavorite("conventional-deadlift");
  r.toggleFavorite(SQUAT);
  const waiting = outbox();
  r.migrate();
  new Repository(adapter).migrate();
  assert.deepEqual(outbox(), waiting);
  for (const row of before) assert.ok(outbox().includes(row), row);
  assert.deepEqual(r.favorites(), [BENCH, "conventional-deadlift"]);
});

test("a fresh phone migrates once and has nothing waiting", (t) => {
  const { adapter } = connect(t);
  const r = new Repository(adapter);
  r.migrate();
  r.migrate();
  assert.deepEqual(versions(adapter), [1, 2, 3]);
  assert.deepEqual(r.outbox(), []);
  assert.deepEqual(adapter.all("SELECT * FROM sync_base"), []);
  assert.deepEqual(adapter.all("SELECT * FROM newer_records"), []);
});

test("an older version of Forge still opens a v3 database unchanged", (t) => {
  const { db, adapter } = legacyDatabase(t);
  new Repository(adapter).migrate();
  const after = dump(adapter, [...LEGACY_TABLES, "sync_base", "migrations"]);
  // What a version before 7.8D runs at every start.
  db.exec(schema);
  if (!adapter.all("SELECT version FROM migrations WHERE version=2").length)
    db.exec(migrationV2);
  for (const e of catalog)
    adapter.run(
      "INSERT OR IGNORE INTO exercises(id,data,custom) VALUES(?,?,0)",
      [e.id, JSON.stringify(e)],
    );
  assert.deepEqual(
    dump(adapter, [...LEGACY_TABLES, "sync_base", "migrations"]),
    after,
  );
});
