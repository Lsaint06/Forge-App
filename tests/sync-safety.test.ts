import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { pathRepository } from "./path-fixture";
import {
  Repository,
  isHeldRecord,
  type SqlDatabase,
} from "../src/data/repository";
import {
  synchronize,
  SyncStopError,
  type CloudRecord,
  type CloudTransport,
} from "../src/cloud/sync";
import { importBackupKeepingOwner } from "../src/data/ownership";
import { exercises as catalog } from "../src/data/catalog";
import type { Exercise, Journal } from "../src/domain/types";

// Phase 7.8B: every failure verified in the 7.8A audit, reproduced with the
// real repository and sync engine against an in-memory cloud that follows
// `forge_write`'s rules (revision-checked writes, conflicts return the cloud
// copy) and stores objects the way Postgres `jsonb` does (keys reordered).

const me = "user-a";
const BENCH = "barbell-bench-press";
const INCLINE = "incline-barbell-bench-press";
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** jsonb keeps object keys shortest first, then in byte order. */
function jsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonb);
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, jsonb(o[k])]),
    );
  }
  return value;
}

type Fault =
  | "ok"
  | "drop-request" // never reached the cloud
  | "drop-reply" // the cloud acted; its reply was lost
  | "timeout" // the cloud acted; no reply in time
  | "hang-after-save" // the cloud acted; Forge was closed while waiting
  | "unavailable"
  | "auth";

function cloud() {
  const rows = new Map<string, CloudRecord>();
  const faults: Fault[] = [];
  const listFaults: Fault[] = [];
  const rejectIds = new Set<string>();
  const calls = { writes: 0, lists: 0 };
  const store = (
    id: string,
    kind: string,
    payload: unknown,
    deleted: boolean,
  ) => {
    const row: CloudRecord = {
      id,
      kind,
      payload: jsonb(payload),
      revision: (rows.get(id)?.revision ?? 0) + 1,
      deleted,
    };
    rows.set(id, row);
    return structuredClone(row);
  };
  const fail = (fault: Fault): never => {
    if (fault === "auth") throw new SyncStopError("auth", "JWT expired");
    if (fault === "unavailable")
      throw new SyncStopError("unavailable", "Service unavailable");
    if (fault === "timeout")
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    throw new TypeError("Network request failed");
  };
  const transport: CloudTransport = {
    async list() {
      calls.lists++;
      const fault = listFaults.shift();
      if (fault && fault !== "ok") fail(fault);
      return [...rows.values()]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((row) => structuredClone(row));
    },
    async write(op) {
      calls.writes++;
      const fault = faults.shift() ?? "ok";
      if (["drop-request", "unavailable", "auth"].includes(fault)) fail(fault);
      if (rejectIds.has(op.id))
        throw new Error("23514: new row violates check constraint");
      const existing = rows.get(op.id);
      let reply: { revision: number } | { conflict: CloudRecord };
      // forge_write: the base revision must be the cloud's, else the cloud
      // copy comes back (all null when there is none).
      if ((existing?.revision ?? 0) !== op.revision)
        reply = {
          conflict: existing
            ? structuredClone(existing)
            : ({
                id: null,
                kind: null,
                payload: null,
                revision: null,
                deleted: null,
              } as unknown as CloudRecord),
        };
      else {
        if (existing && existing.kind !== op.kind)
          throw new Error("Record kind cannot change");
        reply = {
          revision: store(
            op.id,
            op.kind,
            JSON.parse(op.payload) as unknown,
            !!op.deleted,
          ).revision,
        };
      }
      if (fault === "hang-after-save") return new Promise<never>(() => {});
      if (fault !== "ok") fail(fault);
      return reply;
    },
  };
  return {
    transport,
    rows,
    faults,
    listFaults,
    rejectIds,
    calls,
    /** Another device's change, saved straight to the cloud. */
    put: (id: string, kind: string, payload: unknown, deleted = false) =>
      store(id, kind, payload, deleted),
  };
}

function adapter(db: DatabaseSync): SqlDatabase {
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  };
}
/** A phone signed in to the athlete's account. */
function phone() {
  const { r } = pathRepository();
  r.setSetting("cloudOwner", me);
  return r;
}
/** A finished session: bench press, two logged sets. */
function session(r: Repository, name = "Push day") {
  const w = r.startWorkout(name);
  const row = r.addExercise(w.id, BENCH);
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.finishWorkout(w.id);
  return { w, row };
}
const bodyweight = (r: Repository, value = 80) =>
  r.addJournal("measurement", { name: "Bodyweight", value, unit: "kg" });
const seen = (r: Repository, id: string) =>
  r.db.all<{ revision: number }>("SELECT revision FROM sync_meta WHERE id=?", [
    id,
  ])[0]?.revision;
const markers = (r: Repository) =>
  r.db.all("SELECT key FROM settings WHERE key LIKE 'syncSent:%'").length;
const value = (row: CloudRecord | undefined) =>
  (row!.payload as Journal).data.value;
const setCount = (row: CloudRecord | undefined) =>
  (row!.payload as { sets: unknown[] }).sets.length;
const custom: Exercise = {
  id: "custom-sled",
  name: "Sled drag",
  muscle: "Quadriceps",
  equipment: "Sled",
  instructions: ["Drag the sled"],
  secondary: ["Glutes"],
  pattern: "Carry",
  difficulty: "Moderate",
  mistakes: "Leaning back",
  safety: "Clear the lane",
  category: "distance",
  unilateral: false,
  tracking: ["metres"],
};

// H1: false conflicts after successful uploads.

test("H1: a reply lost after the cloud saved a change settles without a conflict", async () => {
  const s = cloud();
  const r = phone();
  r.saveProfile({ name: "Ada" });
  const { w } = session(r);
  const j = bodyweight(r);
  s.faults.push("drop-reply");
  const first = await synchronize(r, s.transport, me);
  assert.equal(first.stopped, "offline");
  assert.equal(first.uploaded, 0);
  assert.equal(
    s.rows.size,
    1,
    "the cloud saved the change; its reply was lost",
  );
  assert.equal(s.calls.writes, 1, "nothing more is tried after the failure");
  assert.equal(s.calls.lists, 0);
  assert.equal(first.pending, 3);
  const second = await synchronize(r, s.transport, me);
  assert.equal(second.conflicts, 0);
  assert.equal(second.matched, 1);
  assert.equal(second.uploaded, 2);
  assert.equal(second.pending, 0);
  for (const id of ["profile", w.id, j.id])
    assert.equal(seen(r, id), s.rows.get(id)!.revision);
  assert.equal(markers(r), 0);
  // Repeating the sync changes nothing.
  const third = await synchronize(r, s.transport, me);
  assert.deepEqual(
    [third.uploaded, third.downloaded, third.matched, third.conflicts],
    [0, 0, 0, 0],
  );
});

test("H1: a change made after a lost reply uploads on top of the saved version", async () => {
  const s = cloud();
  const r = phone();
  const { w, row } = session(r);
  s.faults.push("drop-reply");
  await synchronize(r, s.transport, me);
  assert.equal(s.rows.get(w.id)!.revision, 1);
  r.addSet(row.id, { weight: 85, reps: 5, completed: true });
  const next = await synchronize(r, s.transport, me);
  assert.equal(next.conflicts, 0);
  assert.equal(next.uploaded, 1);
  assert.equal(s.rows.get(w.id)!.revision, 2);
  assert.equal(setCount(s.rows.get(w.id)), 3);
  assert.equal(r.outbox().length, 0);
  assert.equal(markers(r), 0);
});

test("H1: replies lost twice in a row are still recognized as this phone's own", async () => {
  const s = cloud();
  const r = phone();
  const { w, row } = session(r);
  s.faults.push("drop-reply"); // saved at revision 1, reply lost
  await synchronize(r, s.transport, me);
  r.addSet(row.id, { weight: 85, reps: 5, completed: true });
  s.faults.push("drop-reply"); // the cloud answers "conflict"; lost too
  const lost = await synchronize(r, s.transport, me);
  assert.equal(lost.stopped, "offline");
  assert.equal(s.rows.get(w.id)!.revision, 1);
  r.addSet(row.id, { weight: 90, reps: 3, completed: true });
  const next = await synchronize(r, s.transport, me);
  assert.equal(next.conflicts, 0);
  assert.equal(next.uploaded, 1);
  assert.equal(setCount(s.rows.get(w.id)), 4);
});

test("H1: another device's change is still a conflict, and neither version is replaced", async () => {
  const s = cloud();
  const r = phone();
  const j = bodyweight(r, 80);
  await synchronize(r, s.transport, me);
  s.put(j.id, "journal", {
    ...j,
    data: { ...j.data, value: 79 },
    updatedAt: j.updatedAt + 1,
  });
  r.updateJournal(j.id, { ...j.data, value: 81 });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 1);
  assert.equal(result.matched, 0);
  assert.equal(value(s.rows.get(j.id)), 79, "the other device's value stays");
  assert.equal(r.journal()[0]!.data.value, 81, "this phone's value stays");
});

test("H1: after a lost reply, a later change from another device is still a conflict", async () => {
  const s = cloud();
  const r = phone();
  const j = bodyweight(r, 80);
  s.faults.push("drop-reply");
  await synchronize(r, s.transport, me); // saved at revision 1
  s.put(j.id, "journal", { ...j, data: { ...j.data, value: 79 } }); // 2
  r.updateJournal(j.id, { ...j.data, value: 81 });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 1);
  assert.equal(value(s.rows.get(j.id)), 79);
  assert.equal(s.rows.get(j.id)!.revision, 2);
});

test("H1: the same edit made on two devices settles without a choice", async () => {
  const s = cloud();
  const r = phone();
  const j = bodyweight(r, 80);
  await synchronize(r, s.transport, me);
  // Saved elsewhere at a different moment, with the same value.
  s.put(j.id, "journal", {
    ...j,
    data: { ...j.data, value: 81 },
    updatedAt: 1,
  });
  r.updateJournal(j.id, { ...j.data, value: 81 });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 0);
  assert.equal(result.matched, 1);
  assert.equal(seen(r, j.id), 2);
  assert.equal(r.outbox().length, 0);
});

test("H1: conflicts saved before this fix settle once both versions are the same", async () => {
  const s = cloud();
  const r = phone();
  const j = bodyweight(r);
  const op = r.outbox()[0]!;
  const row = s.put(j.id, "journal", JSON.parse(op.payload) as unknown);
  r.conflict(j.id, op.payload, JSON.stringify(row), row.revision);
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 0);
  assert.equal(result.matched, 1);
  assert.equal(s.calls.writes, 0, "settled without sending anything");
  assert.equal(r.outbox().length, 0);
  assert.equal(seen(r, j.id), 1);
});

test("H1: the same deletion on both sides settles; a deletion against an edit is a conflict", async () => {
  const s = cloud();
  const r = phone();
  const a = bodyweight(r, 80);
  const b = bodyweight(r, 81);
  await synchronize(r, s.transport, me);
  s.put(a.id, "journal", {}, true);
  s.put(b.id, "journal", {}, true);
  r.deleteJournal(a.id);
  r.updateJournal(b.id, { ...b.data, value: 82 });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.matched, 1);
  assert.deepEqual(
    r.conflicts().map((c) => c.id),
    [b.id],
  );
  assert.equal(r.journal().find((x) => x.id === b.id)?.data.value, 82);
});

test("a record the cloud no longer holds at all goes back up as new; nothing is replaced", async () => {
  const s = cloud();
  const r = phone();
  const j = bodyweight(r, 80);
  await synchronize(r, s.transport, me);
  s.rows.delete(j.id); // e.g. removed from the project by hand
  r.updateJournal(j.id, { ...j.data, value: 81 });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 0);
  assert.equal(result.uploaded, 1);
  assert.equal(value(s.rows.get(j.id)), 81);
});

test("repeated synchronization between two phones moves nothing twice", async () => {
  const s = cloud();
  const a = phone();
  session(a);
  bodyweight(a);
  a.saveTemplate("Upper A", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  const up = await synchronize(a, s.transport, me);
  assert.equal(up.uploaded, 3);
  const b = phone();
  const down = await synchronize(b, s.transport, me);
  assert.equal(down.downloaded, 3);
  for (const r of [a, b, a, b]) {
    const again = await synchronize(r, s.transport, me);
    assert.deepEqual(
      [again.uploaded, again.downloaded, again.conflicts, again.pending],
      [0, 0, 0, 0],
    );
  }
  assert.ok([...s.rows.values()].every((row) => row.revision === 1));
});

// H2: restoring a backup into an account that already synced.

test("H2: restoring a backup into an account that already synced settles every unchanged record", async () => {
  const s = cloud();
  const r = phone();
  r.saveProfile({ onboarded: true, name: "Ada" });
  for (let i = 0; i < 5; i++) session(r, `Session ${i + 1}`);
  r.saveTemplate("Upper A", [
    { exerciseId: BENCH, sets: 3, reps: 8, repMax: 12, weight: 60, rest: 120 },
  ]);
  r.saveTemplate("Upper B", [
    { exerciseId: INCLINE, sets: 4, reps: 6, weight: 50, rest: 150 },
  ]);
  r.saveExercise(custom);
  for (let i = 0; i < 10; i++) bodyweight(r, 80 + i / 10);
  await synchronize(r, s.transport, me);
  const revisions = new Map([...s.rows].map(([id, row]) => [id, row.revision]));
  const text = JSON.stringify(r.exportBackup());
  await wait(5); // a re-stamped save time would now differ
  importBackupKeepingOwner(r, text);
  const file = JSON.parse(text) as {
    workouts: { id: string; updatedAt: number }[];
    templates: { id: string; updatedAt: number }[];
  };
  const times = (rows: { id: string; updatedAt: number }[]) =>
    rows.map((x) => `${x.id}@${x.updatedAt}`).sort();
  assert.deepEqual(times(r.workouts()), times(file.workouts));
  assert.deepEqual(times(r.templates()), times(file.templates));
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 0);
  assert.equal(result.matched, revisions.size);
  assert.equal(result.uploaded, 0);
  assert.equal(result.pending, 0);
  for (const [id, revision] of revisions)
    assert.equal(s.rows.get(id)!.revision, revision, "nothing was rewritten");
  bodyweight(r, 79);
  assert.equal((await synchronize(r, s.transport, me)).uploaded, 1);
});

test("H2: an older backup never silently replaces newer cloud records", async () => {
  const s = cloud();
  const r = phone();
  const { w, row } = session(r);
  const j = bodyweight(r, 80);
  bodyweight(r, 81);
  await synchronize(r, s.transport, me);
  const text = JSON.stringify(r.exportBackup());
  // Training continues after the backup and reaches the cloud.
  r.addSet(row.id, { weight: 90, reps: 3, completed: true });
  r.updateJournal(j.id, { ...j.data, value: 79 });
  await synchronize(r, s.transport, me);
  const newer = [w.id, j.id].map((id) => structuredClone(s.rows.get(id)));
  const inCloud = s.rows.size;
  importBackupKeepingOwner(r, text);
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 2);
  assert.deepEqual(
    r
      .conflicts()
      .map((c) => c.id)
      .sort(),
    [w.id, j.id].sort(),
  );
  assert.equal(result.matched, inCloud - 2);
  // The backup's profile was never saved to the cloud, so it goes up as new.
  assert.equal(result.uploaded, 1);
  assert.deepEqual(
    [w.id, j.id].map((id) => s.rows.get(id)),
    newer,
    "the newer cloud versions are untouched until the athlete chooses",
  );
});

test("H2: a template that differs only in its saved time settles without a choice", async () => {
  const s = cloud();
  const r = phone();
  const t = r.saveTemplate("Upper A", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  s.put(t.id, "template", { ...t, updatedAt: t.updatedAt - 60_000 });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 0);
  assert.equal(result.matched, 1);
  assert.equal(r.outbox().length, 0);
});

test("H2: a template downloaded from the cloud keeps the cloud's saved time and queues nothing", async () => {
  const s = cloud();
  const t = phone().saveTemplate("Upper A", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  s.put(t.id, "template", { ...t, updatedAt: 12345 });
  const r = phone();
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.downloaded, 1);
  assert.equal(r.templates()[0]!.updatedAt, 12345);
  assert.equal(r.outbox().length, 0);
});

// H3: network failures, retries and interruptions.

test("H3: with no connection, sync stops at the first failure and the next sync sends everything at once", async () => {
  const s = cloud();
  const r = phone();
  for (let i = 0; i < 5; i++) bodyweight(r, 80 + i);
  const before = r
    .outbox()
    .map((o) => o.payload)
    .sort();
  s.faults.push("drop-request", "drop-request", "drop-request");
  for (let i = 0; i < 3; i++) {
    const offline = await synchronize(r, s.transport, me);
    assert.equal(offline.stopped, "offline");
    assert.equal(offline.pending, 5);
  }
  assert.equal(s.calls.writes, 3, "one attempt per sync, not one per change");
  assert.equal(s.calls.lists, 0);
  assert.deepEqual(
    r
      .outbox()
      .map((o) => o.payload)
      .sort(),
    before,
  );
  const online = await synchronize(r, s.transport, me);
  assert.equal(online.stopped, undefined);
  assert.equal(online.uploaded, 5, "no back-off to wait out");
  assert.equal(online.pending, 0);
});

test("H3: a reply that times out counts as no connection; the saved change is recognized next time", async () => {
  const s = cloud();
  const r = phone();
  bodyweight(r);
  s.faults.push("timeout");
  const first = await synchronize(r, s.transport, me);
  assert.equal(first.stopped, "offline");
  assert.equal(s.rows.size, 1);
  const second = await synchronize(r, s.transport, me);
  assert.equal(second.conflicts, 0);
  assert.equal(second.matched, 1);
});

test("H3: a cloud that isn't answering stops the sync without changing anything", async () => {
  const s = cloud();
  const r = phone();
  bodyweight(r);
  s.faults.push("unavailable");
  const up = await synchronize(r, s.transport, me);
  assert.equal(up.stopped, "unavailable");
  assert.equal(s.rows.size, 0);
  assert.equal(up.pending, 1);
  assert.equal(s.calls.lists, 0);
  await synchronize(r, s.transport, me);
  s.put("someone-else", "journal", {}, true);
  s.listFaults.push("unavailable");
  const down = await synchronize(r, s.transport, me);
  assert.equal(down.stopped, "unavailable");
  assert.equal(down.downloaded, 0);
});

test("H3: a change the cloud refuses doesn't hold up the others, and is tried again next sync", async () => {
  const s = cloud();
  const r = phone();
  bodyweight(r, 80);
  const refused = bodyweight(r, 81);
  bodyweight(r, 82);
  s.rejectIds.add(refused.id);
  const first = await synchronize(r, s.transport, me);
  assert.equal(first.stopped, undefined);
  assert.equal(first.uploaded, 2);
  assert.equal(first.rejected, 1);
  assert.equal(first.pending, 1);
  assert.equal(s.calls.lists, 1, "the download still runs");
  s.rejectIds.clear();
  const writes = s.calls.writes;
  const second = await synchronize(r, s.transport, me);
  assert.equal(second.uploaded, 1);
  assert.equal(s.calls.writes, writes + 1);
});

test("H3: a second sync while one runs is refused; the first finishes normally", async () => {
  const s = cloud();
  const r = phone();
  bodyweight(r);
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  const slow: CloudTransport = {
    list: () => s.transport.list(),
    write: async (op) => {
      await gate;
      return s.transport.write(op);
    },
  };
  const first = synchronize(r, slow, me);
  await assert.rejects(
    () => synchronize(r, s.transport, me),
    /already in progress/,
  );
  release();
  assert.equal((await first).uploaded, 1);
  assert.equal(s.calls.writes, 1);
});

test("H3: a sign-in that expires during sync stops it; nothing more is sent and nothing is lost", async () => {
  const s = cloud();
  const r = phone();
  for (let i = 0; i < 3; i++) bodyweight(r, 80 + i);
  s.faults.push("ok", "auth");
  const first = await synchronize(r, s.transport, me);
  assert.equal(first.stopped, "auth");
  assert.equal(first.uploaded, 1);
  assert.equal(first.pending, 2);
  assert.equal(first.conflicts, 0);
  assert.equal(s.calls.lists, 0);
  const again = await synchronize(r, s.transport, me);
  assert.equal(again.uploaded, 2);
  // Expiring while downloading: nothing is applied.
  s.put("from-another-phone", "journal", {}, true);
  s.listFaults.push("auth");
  const journal = r.journal().length;
  const down = await synchronize(r, s.transport, me);
  assert.equal(down.stopped, "auth");
  assert.equal(down.downloaded, 0);
  assert.equal(r.journal().length, journal);
  assert.equal(seen(r, "from-another-phone"), undefined);
});

test("H3: if Forge closes mid-upload, the next launch recognizes the change the cloud saved", async () => {
  const s = cloud();
  const db = new DatabaseSync(":memory:");
  const open = () => {
    const r = new Repository(adapter(db));
    r.migrate();
    return r;
  };
  const before = open();
  before.setSetting("cloudOwner", me);
  const { w, row } = session(before);
  s.faults.push("hang-after-save");
  void synchronize(before, s.transport, me); // never finishes
  await wait(10);
  assert.equal(s.rows.get(w.id)?.revision, 1);
  const relaunched = open();
  relaunched.addSet(row.id, { weight: 85, reps: 5, completed: true });
  const result = await synchronize(relaunched, s.transport, me);
  assert.equal(result.conflicts, 0);
  assert.equal(result.uploaded, 1);
  assert.equal(s.rows.get(w.id)!.revision, 2);
  assert.equal(setCount(s.rows.get(w.id)), 3);
});

// M5: workouts in progress on two phones.

test("M5: a workout in progress elsewhere never blocks other records or replaces the one in progress here", async () => {
  const s = cloud();
  const a = phone();
  const wa = a.startWorkout("Phone A session");
  a.addExercise(wa.id, BENCH);
  bodyweight(a);
  await synchronize(a, s.transport, me);
  const b = phone();
  const wb = b.startWorkout("Phone B session");
  b.addExercise(wb.id, INCLINE);
  const first = await synchronize(b, s.transport, me);
  assert.equal(first.held.active, 1);
  assert.equal(first.failed, 0);
  assert.deepEqual(first.errors, []);
  assert.equal(b.journal().length, 1, "unrelated records arrive");
  assert.equal(b.active()?.id, wb.id);
  assert.equal(b.workout(wa.id), undefined);
  assert.equal(s.rows.get(wb.id)?.revision, 1, "this phone's session uploads");
  const again = await synchronize(b, s.transport, me);
  assert.equal(again.held.active, 1);
  assert.deepEqual(again.errors, []);
  b.finishWorkout(wb.id);
  const after = await synchronize(b, s.transport, me);
  assert.equal(after.held.active, 0);
  assert.equal(b.workout(wb.id)?.status, "completed");
  assert.equal(b.active()?.id, wa.id, "arrives once this phone's is finished");
  assert.equal(s.rows.get(wa.id)?.revision, 1, "never changed by this phone");
});

test("M5: restoring an account with two workouts in progress keeps one and holds the other", async () => {
  const s = cloud();
  for (const name of ["Phone A session", "Phone C session"]) {
    const other = phone();
    const w = other.startWorkout(name);
    other.addExercise(w.id, BENCH);
    await synchronize(other, s.transport, me);
  }
  const fresh = phone();
  const result = await synchronize(fresh, s.transport, me);
  assert.equal(result.downloaded, 1);
  assert.equal(result.held.active, 1);
  assert.equal(result.failed, 0);
  assert.equal(
    fresh.workouts().filter((w) => w.status !== "completed").length,
    1,
  );
});

// M3: exercises (and kinds of record) from a newer Forge.

const NEWER = "sled-push-from-a-newer-forge";
function useNewerExercise(s: ReturnType<typeof cloud>, id: string) {
  const row = structuredClone(s.rows.get(id)!);
  for (const e of (row.payload as { exercises: { exerciseId: string }[] })
    .exercises)
    e.exerciseId = NEWER;
  s.rows.set(id, { ...row, revision: row.revision + 1 });
  return structuredClone(s.rows.get(id)!);
}
/** What updating Forge does: the catalogue gains the exercise. */
const updateForge = (r: Repository) =>
  r.db.run("INSERT INTO exercises(id,data,custom) VALUES(?,?,0)", [
    NEWER,
    JSON.stringify({ ...catalog[0]!, id: NEWER, name: "Sled push" }),
  ]);

test("M3: a workout using an exercise this version doesn't know is held, untouched, until Forge is updated", async () => {
  const s = cloud();
  const a = phone();
  const { w } = session(a);
  await synchronize(a, s.transport, me);
  const stored = useNewerExercise(s, w.id);
  const b = phone();
  for (let i = 0; i < 2; i++) {
    const held = await synchronize(b, s.transport, me);
    assert.equal(held.held.update, 1);
    assert.equal(held.failed, 0);
    assert.deepEqual(held.errors, []);
  }
  assert.equal(b.workout(w.id), undefined);
  assert.deepEqual(s.rows.get(w.id), stored, "the cloud copy is untouched");
  assert.equal(seen(b, w.id), undefined, "tried again on every sync");
  updateForge(b);
  const updated = await synchronize(b, s.transport, me);
  assert.equal(updated.downloaded, 1);
  assert.equal(updated.held.update, 0);
  assert.equal(b.workoutExercises(w.id)[0]!.exerciseId, NEWER);
});

test("M3: templates with unknown exercises and unknown kinds of record are held too", async () => {
  const s = cloud();
  const a = phone();
  const t = a.saveTemplate("Upper A", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  await synchronize(a, s.transport, me);
  useNewerExercise(s, t.id);
  s.rows.set("favorite-1", {
    id: "favorite-1",
    kind: "favorite",
    payload: { exerciseId: BENCH },
    revision: 1,
    deleted: false,
  });
  const b = phone();
  const result = await synchronize(b, s.transport, me);
  assert.equal(result.held.update, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(b.templates().length, 0);
});

test("M3: a conflict whose cloud version uses unknown exercises can't be replaced either way", async () => {
  const s = cloud();
  const r = phone();
  const { w, row } = session(r);
  await synchronize(r, s.transport, me);
  useNewerExercise(s, w.id);
  r.addSet(row.id, { weight: 85, reps: 5, completed: true });
  const result = await synchronize(r, s.transport, me);
  assert.equal(result.conflicts, 1);
  for (const choose of [() => r.useCloudVersion(w.id), () => r.keepLocal(w.id)])
    assert.throws(choose, (e) => isHeldRecord(e) && e.reason === "update");
  assert.equal(r.conflicts().length, 1);
  assert.equal(r.workoutSets(w.id).length, 3, "this phone's version stays");
  updateForge(r);
  r.useCloudVersion(w.id);
  assert.equal(r.conflicts().length, 0);
  assert.equal(r.workoutExercises(w.id)[0]!.exerciseId, NEWER);
});

// M4: resolving a conflict.

test("M3: only a kind or exercise from a newer Forge locks a conflict; an unreadable cloud copy can still be replaced", () => {
  const r = phone();
  const j = bodyweight(r);
  const op = r.outboxRow(j.id)!;
  // Saved without a kind: unreadable, not newer. Keep local version works.
  r.conflict(
    j.id,
    op.payload,
    JSON.stringify({ id: j.id, payload: {}, revision: 2, deleted: false }),
    2,
  );
  r.keepLocal(j.id);
  assert.equal(r.conflicts().length, 0);
  assert.equal(r.outboxRow(j.id)!.revision, 2);
  // A kind this version doesn't know: both choices wait for an update.
  r.conflict(
    j.id,
    op.payload,
    JSON.stringify({
      id: j.id,
      kind: "favorite",
      payload: {},
      revision: 3,
      deleted: false,
    }),
    3,
  );
  for (const choose of [() => r.keepLocal(j.id), () => r.useCloudVersion(j.id)])
    assert.throws(choose, (e) => isHeldRecord(e) && e.reason === "update");
  assert.equal(r.conflicts().length, 1);
  assert.equal(r.journal()[0]!.data.value, 80);
});

test("M4: Use cloud version replaces the record and settles the conflict in one step", async () => {
  const s = cloud();
  const r = phone();
  const j = bodyweight(r, 80);
  const t = r.saveTemplate("Upper A", [
    { exerciseId: BENCH, sets: 3, reps: 8, weight: 60, rest: 120 },
  ]);
  const gone = bodyweight(r, 70);
  await synchronize(r, s.transport, me);
  s.put(j.id, "journal", { ...j, data: { ...j.data, value: 79 } });
  s.put(t.id, "template", { ...t, name: "Upper A (cloud)" });
  s.put(gone.id, "journal", {}, true);
  r.updateJournal(j.id, { ...j.data, value: 81 });
  r.saveTemplate("Upper A (phone)", t.exercises, t.id);
  r.updateJournal(gone.id, { ...gone.data, value: 71 });
  assert.equal((await synchronize(r, s.transport, me)).conflicts, 3);
  for (const id of [j.id, t.id, gone.id]) r.useCloudVersion(id);
  assert.equal(r.journal().find((x) => x.id === j.id)?.data.value, 79);
  assert.equal(r.templates()[0]!.name, "Upper A (cloud)");
  assert.equal(
    r.journal().find((x) => x.id === gone.id),
    undefined,
  );
  assert.equal(r.conflicts().length, 0);
  assert.equal(r.outbox().length, 0);
  assert.equal(seen(r, j.id), 2);
  const next = await synchronize(r, s.transport, me);
  assert.deepEqual([next.uploaded, next.downloaded, next.conflicts], [0, 0, 0]);
});
