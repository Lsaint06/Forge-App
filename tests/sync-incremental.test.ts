import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import type { Repository } from "../src/data/repository";
import {
  FULL_SYNC_EVERY_MS,
  SYNC_OVERLAP_MS,
  cloudTime,
  synchronize,
  SyncStopError,
  type CloudRecord,
  type CloudTransport,
  type ListOptions,
  type SyncProgress,
} from "../src/cloud/sync";
import {
  recordSyncOutcome,
  saveSyncCursor,
  syncCursor,
  syncRetryIds,
  syncStatus,
} from "../src/cloud/sync-state";
import { exercises as catalog } from "../src/data/catalog";

// Phase 7.8C: incremental downloads, the retry list, sync status and
// progress, with the real repository and engine against an in-memory cloud
// that keeps its own clock and stamps each write with the time it began,
// as Postgres `now()` does.

const me = "user-a";
const DAY = 86_400_000;
const BASE = Date.UTC(2026, 9, 1);
/** A cloud time `micros` microseconds after BASE, as PostgREST writes it. */
const iso = (micros: number) =>
  `${new Date(BASE + Math.floor(micros / 1000)).toISOString().slice(0, 23)}${String(micros % 1000).padStart(3, "0")}+00:00`;
type Row = CloudRecord & { updatedAt: string };
const key = (t: string) => cloudTime(t)!.key;

function cloud() {
  const rows = new Map<string, Row>();
  let clock = 0;
  const lists: ListOptions[] = [];
  const listFaults: Error[] = [];
  let fetched = 0;
  const put = (
    id: string,
    kind: string,
    payload: unknown,
    deleted = false,
    stamp = clock,
  ) => {
    const row: Row = {
      id,
      kind,
      payload: structuredClone(payload),
      revision: (rows.get(id)?.revision ?? 0) + 1,
      deleted,
      updatedAt: iso(stamp),
    };
    rows.set(id, row);
    return structuredClone(row);
  };
  const transport: CloudTransport = {
    async list(options = {}) {
      lists.push({ ...options });
      const fault = listFaults.shift();
      if (fault) throw fault;
      let out = [...rows.values()];
      if (options.ids) out = out.filter((r) => options.ids!.includes(r.id));
      else if (options.since) {
        const since = key(options.since);
        out = out.filter((r) => key(r.updatedAt) >= since);
      }
      out.sort((a, b) =>
        key(a.updatedAt) !== key(b.updatedAt)
          ? key(a.updatedAt) < key(b.updatedAt)
            ? -1
            : 1
          : a.id < b.id
            ? -1
            : 1,
      );
      options.onPage?.(out.length, options.ids ? undefined : out.length);
      fetched += out.length;
      return out.map((r) => structuredClone(r));
    },
    async write(op) {
      const old = rows.get(op.id);
      if ((old?.revision ?? 0) !== op.revision)
        return { conflict: structuredClone(old!) };
      clock += 1000;
      return {
        revision: put(op.id, op.kind, JSON.parse(op.payload), !!op.deleted)
          .revision,
      };
    },
  };
  return {
    transport,
    rows,
    lists,
    listFaults,
    put,
    /** Moves the cloud's clock on. */
    advance: (ms: number) => (clock += ms * 1000),
    clock: () => clock,
    fetched: () => fetched,
  };
}
type Cloud = ReturnType<typeof cloud>;

function phone() {
  const { r } = pathRepository();
  r.setSetting("cloudOwner", me);
  return r;
}
/** Syncs with this phone's clock at `at` (ms). */
const sync = (
  r: Repository,
  s: Cloud,
  at = Date.now(),
  onProgress?: (p: SyncProgress) => void,
) =>
  synchronize(r, s.transport, me, {
    now: () => at,
    ...(onProgress ? { onProgress } : {}),
  });
const bodyweight = (r: Repository, value = 80) =>
  r.addJournal("measurement", { name: "Bodyweight", value, unit: "kg" });
function session(r: Repository, name = "Push day") {
  const w = r.startWorkout(name);
  const row = r.addExercise(w.id, "barbell-bench-press");
  r.addSet(row.id, { weight: 80, reps: 8, completed: true });
  r.finishWorkout(w.id);
  return w;
}
/** An account an older phone filled long ago, then a quiet week. */
async function history(s: Cloud, entries = 20) {
  const old = phone();
  for (let i = 0; i < entries; i++) bodyweight(old, 70 + i / 10);
  session(old);
  await sync(old, s);
  s.advance(7 * DAY);
  return old;
}

test("first sync downloads everything and keeps a checkpoint in the cloud's time", async () => {
  const s = cloud();
  await history(s);
  const r = phone();
  const first = await sync(r, s);
  assert.equal(first.full, true);
  assert.equal(first.downloaded, s.rows.size);
  assert.equal(s.lists.at(-1)!.since, undefined);
  const newest = [...s.rows.values()]
    .map((x) => x.updatedAt)
    .sort()
    .at(-1);
  assert.deepEqual(syncCursor(r, me)?.at, newest);
  assert.equal(syncStatus(r, me)?.outcome, "complete");
});

test("a repeated sync without changes reads only the day before the newest change", async () => {
  const s = cloud();
  await history(s, 300);
  const all = s.rows.size;
  const r = phone();
  assert.equal((await sync(r, s)).fetched, all);
  s.advance(2 * DAY);
  const again = await sync(r, s);
  assert.equal(again.full, false);
  const since = s.lists.at(-1)!.since!;
  assert.equal(
    cloudTime(since)!.ms,
    cloudTime(syncCursor(r, me)!.at!)!.ms - SYNC_OVERLAP_MS,
  );
  // This account was written within a second of its newest change, so the
  // margin re-reads all of it; nothing is applied twice.
  assert.equal(again.downloaded, 0);
  assert.equal(again.conflicts, 0);
  // Days later another phone adds an entry: it arrives, and the checkpoint
  // moves to it.
  const other = phone();
  await sync(other, s);
  s.advance(3 * DAY);
  bodyweight(other, 79);
  await sync(other, s);
  assert.equal((await sync(r, s)).downloaded, 1);
  // From then on a sync without changes reads one record, not the account.
  const quiet = await sync(r, s);
  assert.equal(quiet.fetched, 1);
  assert.equal(quiet.downloaded, 0);
  assert.equal(syncStatus(r, me)?.outcome, "complete");
});

test("new workouts, edits and deletions on another phone arrive incrementally", async () => {
  const s = cloud();
  const a = await history(s);
  const b = phone();
  await sync(b, s);
  s.advance(3 * DAY);
  const w = session(a, "New session");
  const entry = a.journal("measurement")[0]!;
  a.updateJournal(entry.id, { ...entry.data, value: 99 });
  const gone = a.journal("measurement")[1]!;
  a.deleteJournal(gone.id);
  await sync(a, s);
  const result = await sync(b, s);
  assert.equal(result.full, false);
  assert.equal(result.downloaded, 3);
  assert.equal(b.workout(w.id)?.name, "New session");
  assert.equal(b.journal().find((j) => j.id === entry.id)?.data.value, 99);
  assert.equal(
    b.journal().find((j) => j.id === gone.id),
    undefined,
    "the deletion arrives",
  );
});

test("a write that began before the checkpoint but landed after it is still downloaded", async () => {
  const s = cloud();
  const a = await history(s);
  const b = phone();
  await sync(b, s);
  const checkpoint = syncCursor(b, me)!.at!;
  // Another phone's write started 5 seconds before the checkpoint's time
  // and became visible only now, carrying its start time (as `now()`).
  const late = a.journal("measurement")[0]!;
  s.put(
    late.id,
    "journal",
    { ...late, data: { ...late.data, value: 55 } },
    false,
    (cloudTime(checkpoint)!.ms - BASE) * 1000 - 5_000_000,
  );
  // Records sharing the checkpoint's exact time are read again too.
  const twin = a.journal("measurement")[1]!;
  s.put(
    twin.id,
    "journal",
    { ...twin, data: { ...twin.data, value: 56 } },
    false,
    (cloudTime(checkpoint)!.ms - BASE) * 1000,
  );
  const result = await sync(b, s);
  assert.equal(result.downloaded, 2);
  assert.equal(b.journal().find((j) => j.id === late.id)?.data.value, 55);
  assert.equal(b.journal().find((j) => j.id === twin.id)?.data.value, 56);
});

test("a weekly full download catches anything older than the margin", async () => {
  const s = cloud();
  const a = await history(s);
  const b = phone();
  const t0 = Date.now();
  await sync(b, s, t0);
  // An impossible write, stamped two days before the checkpoint: outside
  // the margin, so the next incremental sync can't see it.
  const entry = a.journal("measurement")[2]!;
  const at = cloudTime(syncCursor(b, me)!.at!)!.ms;
  s.put(
    entry.id,
    "journal",
    { ...entry, data: { ...entry.data, value: 42 } },
    false,
    (at - BASE - 2 * DAY) * 1000,
  );
  assert.equal((await sync(b, s, t0 + DAY)).downloaded, 0);
  const weekly = await sync(b, s, t0 + FULL_SYNC_EVERY_MS);
  assert.equal(weekly.full, true);
  assert.equal(weekly.downloaded, 1);
  assert.equal(b.journal().find((j) => j.id === entry.id)?.data.value, 42);
});

test("an interrupted download changes nothing; the checkpoint waits for a complete one", async () => {
  const s = cloud();
  const a = await history(s);
  const b = phone();
  await sync(b, s);
  const cursor = syncCursor(b, me);
  s.advance(DAY);
  bodyweight(a, 81);
  await sync(a, s);
  for (const fault of [
    new TypeError("Network request failed"),
    new SyncStopError("auth", "JWT expired"),
  ]) {
    s.listFaults.push(fault);
    const result = await sync(b, s);
    assert.equal(
      result.stopped,
      fault instanceof SyncStopError ? "auth" : "offline",
    );
    assert.equal(result.downloaded, 0);
    assert.deepEqual(syncCursor(b, me), cursor);
    assert.equal(syncStatus(b, me)?.outcome, "stopped");
  }
  const done = await sync(b, s);
  assert.equal(done.downloaded, 1);
  assert.notDeepEqual(syncCursor(b, me), cursor);
});

test("records held for a newer Forge are fetched again by id and arrive after the update", async () => {
  const NEWER = "sled-push-from-a-newer-forge";
  const s = cloud();
  const a = await history(s);
  const b = phone();
  await sync(b, s);
  const w = session(a, "Newer exercise");
  await sync(a, s);
  const row = s.rows.get(w.id)!;
  (
    row.payload as { exercises: { exerciseId: string }[] }
  ).exercises[0]!.exerciseId = NEWER;
  const first = await sync(b, s);
  assert.equal(first.held.update, 1);
  assert.deepEqual(syncRetryIds(b, me), [w.id]);
  // Days later it's outside the margin, but fetched by id every time.
  s.advance(5 * DAY);
  const later = await sync(b, s);
  assert.equal(later.held.update, 1);
  assert.deepEqual(s.lists.at(-1)!.ids, [w.id]);
  // Updating Forge brings the exercise; the next sync applies the record.
  b.db.run("INSERT INTO exercises(id,data,custom) VALUES(?,?,0)", [
    NEWER,
    JSON.stringify({ ...catalog[0]!, id: NEWER, name: "Sled push" }),
  ]);
  const updated = await sync(b, s);
  assert.equal(updated.downloaded, 1);
  assert.equal(b.workout(w.id)?.name, "Newer exercise");
  assert.deepEqual(syncRetryIds(b, me), []);
});

test("a record that couldn't be read is retried, and a record the cloud no longer has is forgotten", async () => {
  const s = cloud();
  const a = await history(s);
  const b = phone();
  await sync(b, s);
  s.advance(DAY);
  const broken = bodyweight(a, 81);
  await sync(a, s);
  s.rows.get(broken.id)!.payload = { not: "a journal entry" };
  const vanished = s.put("vanished", "journal", { not: "readable" });
  const partial = await sync(b, s);
  assert.equal(partial.failed, 2);
  assert.deepEqual(syncRetryIds(b, me).sort(), [broken.id, vanished.id].sort());
  // Fixed in the cloud by another phone; the other one removed outright.
  s.rows.get(broken.id)!.payload = {
    ...broken,
    data: { ...broken.data, value: 82 },
  };
  s.rows.delete(vanished.id);
  s.advance(5 * DAY);
  const fixed = await sync(b, s);
  assert.equal(fixed.downloaded, 1);
  assert.equal(b.journal().find((j) => j.id === broken.id)?.data.value, 82);
  assert.deepEqual(syncRetryIds(b, me), []);
});

test("the last complete sync is recorded only when nothing is left over", async () => {
  const s = cloud();
  const r = phone();
  const t = Date.UTC(2026, 9, 30, 14, 5);
  bodyweight(r);
  await sync(r, s, t);
  assert.deepEqual(syncStatus(r, me), {
    at: t,
    outcome: "complete",
    completeAt: t,
  });
  // Offline: stopped; the last complete time stays.
  bodyweight(r, 81);
  s.listFaults.push(new TypeError("Network request failed"));
  await sync(r, s, t + 1000);
  assert.deepEqual(syncStatus(r, me), {
    at: t + 1000,
    outcome: "stopped",
    completeAt: t,
  });
  // A conflict left for a choice: partial, not complete.
  await sync(r, s, t + 2000);
  const entry = r.journal()[0]!;
  s.put(entry.id, "journal", { ...entry, data: { ...entry.data, value: 60 } });
  r.updateJournal(entry.id, { ...entry.data, value: 61 });
  const conflicted = await sync(r, s, t + 3000);
  assert.equal(conflicted.conflicts, 1);
  assert.equal(syncStatus(r, me)?.outcome, "partial");
  assert.equal(syncStatus(r, me)?.completeAt, t + 2000);
  r.keepLocal(entry.id);
  await sync(r, s, t + 4000);
  assert.equal(syncStatus(r, me)?.completeAt, t + 4000);
});

test("sync history belongs to its account: another account's is ignored and removing the data removes it", () => {
  const r = phone();
  saveSyncCursor(r, me, { at: iso(5), fullAt: 1 });
  recordSyncOutcome(r, me, "complete", 1);
  assert.equal(syncCursor(r, "user-b"), undefined);
  assert.equal(syncStatus(r, "user-b"), undefined);
  assert.ok(syncCursor(r, me));
  r.clearData();
  assert.equal(syncCursor(r, me), undefined);
  assert.equal(syncStatus(r, me), undefined);
});

test("an unreadable checkpoint, or a clock that went back, means a full download", async () => {
  const s = cloud();
  await history(s);
  const r = phone();
  const t = Date.now();
  await sync(r, s, t);
  r.setSetting("syncCursor", "{not json");
  assert.equal((await sync(r, s, t)).full, true);
  assert.equal((await sync(r, s, t)).full, false);
  assert.equal((await sync(r, s, t - 2 * DAY)).full, true);
});

test("progress: uploads counted, downloads toward the cloud's total, then the records applied", async () => {
  const s = cloud();
  await history(s, 5);
  const r = phone();
  bodyweight(r, 90);
  bodyweight(r, 91);
  const steps: SyncProgress[] = [];
  await sync(r, s, Date.now(), (p) => steps.push(p));
  assert.deepEqual(steps.slice(0, 3), [
    { step: "uploading", done: 0, total: 2 },
    { step: "uploading", done: 1, total: 2 },
    { step: "uploading", done: 2, total: 2 },
  ]);
  const total = s.rows.size;
  assert.deepEqual(steps[3], { step: "downloading", received: total, total });
  assert.deepEqual(steps[4], { step: "applying", total });
  assert.equal(steps.length, 5);
});
