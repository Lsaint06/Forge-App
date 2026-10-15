import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Repository, type SqlDatabase } from "../src/data/repository";
import {
  synchronize,
  type CloudTransport,
  type CloudRecord,
} from "../src/cloud/sync";
import {
  acceptPath,
  pathPrograms,
  pathSummary,
  pathSessions,
  startPathSession,
} from "../src/data/paths";
import { generatePath } from "../src/domain/paths/generator";
import { exercises } from "../src/data/catalog";
import { pathPreferences } from "./path-fixture";
function local() {
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
  return r;
}
function remote(rows: CloudRecord[] = []) {
  const cloud: CloudTransport = {
    list: async () => rows,
    write: async (op) => {
      const old = rows.find((x) => x.id === op.id);
      if ((old?.revision ?? 0) !== op.revision) return { conflict: old! };
      const row = {
        id: op.id,
        kind: op.kind,
        payload: JSON.parse(op.payload) as unknown,
        revision: op.revision + 1,
        deleted: !!op.deleted,
      };
      const index = rows.findIndex((x) => x.id === op.id);
      if (index < 0) rows.push(row);
      else rows[index] = row;
      return { revision: row.revision };
    },
  };
  return cloud;
}
test("Path phases, calendar links and completed sessions round-trip through the existing sync protocol", async () => {
  const a = local();
  acceptPath(a, generatePath(pathPreferences(), exercises));
  const program = pathPrograms(a)[0]!;
  const session = pathSessions(a, program)[0]!;
  const workout = startPathSession(a, session.record.id);
  a.editSet(a.workoutSets(workout.id)[0]!.id, { reps: 8, completed: true });
  a.finishWorkout(workout.id);
  const server = remote();
  assert.equal((await synchronize(a, server, "paths-user")).errors.length, 0);
  const b = local();
  const result = await synchronize(b, server, "paths-user");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(pathPrograms(b)[0]!.data.phases, program.data.phases);
  assert.equal(pathSummary(b, pathPrograms(b)[0]!).completed, 1);
  assert.equal(
    pathSessions(b, pathPrograms(b)[0]!).find(
      (s) => s.record.id === session.record.id,
    )!.data.workoutId,
    workout.id,
  );
});
test("sync uploads local data then restores on second offline repository", async () => {
  const a = local();
  a.saveProfile({ name: "Ada" });
  a.addJournal(
    "measurement",
    { name: "Bodyweight", value: 80, unit: "kg" },
    "2026-10-14",
  );
  const server = remote();
  await synchronize(a, server, "user");
  assert.equal(a.outbox().length, 0);
  const b = local();
  await synchronize(b, server, "user");
  assert.equal(b.profile().name, "Ada");
  assert.equal(b.journal("measurement")[0]!.data.value, 80);
});
test("conflicting remote change preserves local content and blocks overwrite", async () => {
  const r = local();
  const entry = r.addJournal("measurement", {
    name: "Bodyweight",
    value: 80,
    unit: "kg",
  });
  const server = remote([
    {
      id: entry.id,
      kind: "journal",
      payload: { ...entry, data: { ...entry.data, value: 90 } },
      revision: 2,
      deleted: false,
    },
  ]);
  const result = await synchronize(r, server, "user");
  assert.equal(result.conflicts, 1);
  assert.equal(r.journal()[0]!.data.value, 80);
  assert.equal(r.outbox().length, 1);
  r.keepLocal(entry.id);
  await synchronize(r, server, "user");
  assert.equal(r.conflicts().length, 0);
  assert.equal(r.outbox().length, 0);
});
test("network failure retains edits and schedules retry", async () => {
  const r = local();
  r.saveProfile({ name: "Ada" });
  const server: CloudTransport = {
    write: async () => {
      throw new Error("Offline");
    },
    list: async () => [],
  };
  await synchronize(r, server, "user");
  assert.equal(r.outbox()[0]!.attempts, 1);
  assert.ok(r.outbox()[0]!.nextAttempt > Date.now());
});
test("different authenticated user cannot upload previous users local records", async () => {
  const r = local();
  r.saveProfile({ name: "Ada" });
  await synchronize(r, remote(), "first-user");
  await assert.rejects(
    () => synchronize(r, remote(), "another-user"),
    /different account/i,
  );
});
test("clear during pending download aborts sync without restoring another accounts records", async () => {
  const r = local();
  const source = local();
  const entry = source.addJournal("measurement", {
    name: "Bodyweight",
    value: 80,
    unit: "kg",
  });
  let release!: (rows: CloudRecord[]) => void;
  const pending = new Promise<CloudRecord[]>((resolve) => {
    release = resolve;
  });
  const cloud: CloudTransport = {
    list: () => pending,
    write: async () => ({ revision: 1 }),
  };
  const run = synchronize(r, cloud, "first-user");
  r.clearData();
  release([
    {
      id: entry.id,
      kind: "journal",
      payload: entry,
      revision: 1,
      deleted: false,
    },
  ]);
  await assert.rejects(() => run, /changed during synchronization/i);
  assert.equal(r.journal().length, 0);
  assert.equal(r.setting("cloudOwner"), undefined);
});
test("clear during upload cannot acknowledge or retry against the replacement database", async () => {
  const r = local();
  r.saveProfile({ name: "Ada" });
  let release!: (result: { revision: number }) => void;
  const pending = new Promise<{ revision: number }>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  const cloud: CloudTransport = {
    write: () => pending,
    list: async () => {
      reads++;
      return [];
    },
  };
  const run = synchronize(r, cloud, "user");
  r.clearData();
  release({ revision: 1 });
  await assert.rejects(() => run, /changed during synchronization/i);
  assert.equal(r.db.all("SELECT * FROM sync_meta").length, 0);
  assert.equal(reads, 0);
});
