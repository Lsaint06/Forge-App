import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import {
  UNDO_MS,
  cancelPending,
  commitPending,
  markPending,
  readPending,
  reconcilePendingDeletes,
  remainingMs,
} from "../src/data/pending-deletes";
import type { Repository } from "../src/data/repository";

// Phase 7B WP6 D15: a goal or check-in deleted with Undo stays deleted even
// if FORGE is closed by the system inside the six seconds; nothing else is
// ever deleted, and a "new process" is a fresh call on the same database.

const T0 = 1_800_000_000_000;
function setup() {
  const f = pathRepository();
  const goal = f.r.addJournal("goal", {
    name: "Train 3×",
    metric: "workouts",
    target: 3,
  });
  const checkin = f.r.addJournal("recovery", {
    sleep: 7.5,
    quality: 4,
    soreness: 2,
    energy: 4,
    stress: 2,
  });
  return { ...f, goal, checkin };
}
const exists = (r: Repository, id: string) =>
  r.journal().some((j) => j.id === id);
const tombstones = (r: Repository, id: string) =>
  r.outbox().filter((o) => o.id === id && o.deleted).length;

test("the marker is exact, durable, and Undo removes it before anything is deleted", () => {
  const { r, db, goal } = setup();
  try {
    const m = markPending(r, "goal", goal, T0);
    assert.deepEqual(m, {
      v: 1,
      kind: "goal",
      id: goal.id,
      updatedAt: goal.updatedAt,
      createdAt: T0,
      expiresAt: T0 + UNDO_MS,
      owner: "",
    });
    assert.deepEqual(readPending(r, "goal"), m);
    assert.equal(remainingMs(m, T0 + 2000), 4000);
    cancelPending(r, "goal", goal.id);
    assert.equal(r.setting("pendingDelete.goal"), undefined);
    assert.equal(commitPending(r, "goal", goal.id), "none");
    assert.equal(reconcilePendingDeletes(r, T0 + 60_000).length, 0);
    assert.ok(exists(r, goal.id));
  } finally {
    db.close();
  }
});

test("normal completion deletes the record, queues one tombstone and clears the marker together", () => {
  const { r, db, goal } = setup();
  try {
    markPending(r, "goal", goal, T0);
    assert.equal(commitPending(r, "goal", goal.id), "deleted");
    assert.equal(exists(r, goal.id), false);
    assert.equal(tombstones(r, goal.id), 1);
    assert.equal(r.setting("pendingDelete.goal"), undefined);
  } finally {
    db.close();
  }
});

test("process ended before expiry: the remaining window is kept, then the delete completes", () => {
  const { r, db, checkin } = setup();
  try {
    markPending(r, "recovery", checkin, T0);
    // New process 2 s later: nothing is deleted yet; 4 s of Undo remain.
    const open = reconcilePendingDeletes(r, T0 + 2000);
    assert.equal(open.length, 1);
    assert.equal(remainingMs(open[0]!, T0 + 2000), 4000);
    assert.ok(exists(r, checkin.id));
    assert.ok(r.setting("pendingDelete.recovery"));
    // At the original deadline.
    assert.equal(commitPending(r, "recovery", checkin.id), "deleted");
    assert.equal(exists(r, checkin.id), false);
  } finally {
    db.close();
  }
});

test("process ended after expiry: the next launch completes it; repeating changes nothing", () => {
  const { r, db, goal, checkin } = setup();
  try {
    markPending(r, "goal", goal, T0);
    markPending(r, "recovery", checkin, T0 + 1000);
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
    assert.equal(exists(r, goal.id), false);
    assert.equal(exists(r, checkin.id), false);
    const outbox = JSON.stringify(r.outbox());
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 120_000), []);
    assert.equal(JSON.stringify(r.outbox()), outbox);
    assert.equal(tombstones(r, goal.id), 1);
  } finally {
    db.close();
  }
});

test("a clock set back counts as expired; the record is still the confirmed one", () => {
  const { r, db, goal } = setup();
  try {
    const m = markPending(r, "goal", goal, T0);
    assert.equal(remainingMs(m, T0 - 5000), 0);
    assert.deepEqual(reconcilePendingDeletes(r, T0 - 5000), []);
    assert.equal(exists(r, goal.id), false);
  } finally {
    db.close();
  }
});

test("an already-deleted record only clears the marker (no second tombstone)", () => {
  const { r, db, goal } = setup();
  try {
    markPending(r, "goal", goal, T0);
    r.deleteJournal(goal.id);
    assert.equal(commitPending(r, "goal", goal.id), "missing");
    assert.equal(tombstones(r, goal.id), 1);
    assert.equal(r.setting("pendingDelete.goal"), undefined);
  } finally {
    db.close();
  }
});

test("a record changed by synchronization is kept and the stale marker discarded", () => {
  const { r, db, goal } = setup();
  try {
    markPending(r, "goal", goal, T0);
    const remote = {
      ...goal,
      data: { ...goal.data, target: 4 },
      updatedAt: goal.updatedAt + 1000,
    };
    r.applyRemote(goal.id, "journal", remote, 2);
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
    assert.ok(exists(r, goal.id));
    assert.equal(
      r.journal("goal").find((g) => g.id === goal.id)!.data.target,
      4,
    );
    assert.equal(r.setting("pendingDelete.goal"), undefined);
  } finally {
    db.close();
  }
});

test("a failure while completing rolls back the delete, the tombstone and the marker together", () => {
  const { r, db, goal } = setup();
  try {
    markPending(r, "goal", goal, T0);
    const queue = r.queue.bind(r);
    r.queue = () => {
      throw new Error("disk full");
    };
    assert.throws(() => commitPending(r, "goal", goal.id), /disk full/);
    assert.ok(exists(r, goal.id));
    assert.equal(tombstones(r, goal.id), 0);
    assert.ok(readPending(r, "goal"));
    // Retried later (e.g. next launch), it completes.
    r.queue = queue;
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
    assert.equal(exists(r, goal.id), false);
  } finally {
    db.close();
  }
});

test("corrupted or invalid markers are removed without touching any record", () => {
  const { r, db, goal, checkin } = setup();
  try {
    const valid = JSON.stringify(markPending(r, "goal", goal, T0));
    const bad = [
      "{not json",
      "null",
      JSON.stringify({ ...JSON.parse(valid), v: 2 }),
      JSON.stringify({ ...JSON.parse(valid), kind: "recovery" }),
      JSON.stringify({ ...JSON.parse(valid), id: "" }),
      JSON.stringify({ ...JSON.parse(valid), id: "x".repeat(101) }),
      JSON.stringify({ ...JSON.parse(valid), expiresAt: T0 + 60_000 }),
      JSON.stringify({ ...JSON.parse(valid), updatedAt: "soon" }),
      JSON.stringify({ ...JSON.parse(valid), owner: undefined }),
    ];
    const before = JSON.stringify(r.journal());
    for (const raw of bad) {
      r.setSetting("pendingDelete.goal", raw);
      assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
      assert.equal(r.setting("pendingDelete.goal"), undefined, raw);
    }
    assert.equal(JSON.stringify(r.journal()), before);
    // A goal marker naming a check-in's id deletes nothing: kinds never cross.
    r.setSetting(
      "pendingDelete.goal",
      JSON.stringify({
        ...JSON.parse(valid),
        id: checkin.id,
        updatedAt: checkin.updatedAt,
      }),
    );
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
    assert.ok(exists(r, checkin.id));
  } finally {
    db.close();
  }
});

test("restoring a backup or deleting everything clears pending markers first", () => {
  const { r, db, goal, checkin } = setup();
  try {
    markPending(r, "goal", goal, T0);
    markPending(r, "recovery", checkin, T0);
    const backup = JSON.stringify(r.exportBackup());
    assert.equal(backup.includes("pendingDelete"), false);
    r.importBackup(backup);
    assert.equal(readPending(r, "goal"), undefined);
    assert.equal(readPending(r, "recovery"), undefined);
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
    assert.ok(exists(r, goal.id));
    assert.ok(exists(r, checkin.id));
    markPending(r, "goal", goal, T0);
    r.clearData();
    assert.equal(r.setting("pendingDelete.goal"), undefined);
  } finally {
    db.close();
  }
});

test("a marker from another account's data never deletes anything", () => {
  const { r, db, goal } = setup();
  try {
    r.setSetting("cloudOwner", "account-a");
    markPending(r, "goal", goal, T0);
    assert.equal(readPending(r, "goal")!.owner, "account-a");
    r.setSetting("cloudOwner", "account-b");
    assert.equal(commitPending(r, "goal", goal.id), "other-account");
    assert.ok(exists(r, goal.id));
    assert.equal(r.setting("pendingDelete.goal"), undefined);
    // Guest data signed into an account later is also a different owner.
    r.setSetting("cloudOwner", "");
    markPending(r, "goal", goal, T0);
    r.setSetting("cloudOwner", "account-a");
    assert.deepEqual(reconcilePendingDeletes(r, T0 + 60_000), []);
    assert.ok(exists(r, goal.id));
  } finally {
    db.close();
  }
});

test("rapid successive deletions: each completes once, and a timer for an old one is ignored", () => {
  const { r, db, goal } = setup();
  try {
    const second = r.addJournal("goal", {
      name: "Train 4×",
      metric: "workouts",
      target: 4,
    });
    markPending(r, "goal", goal, T0);
    // The screen completes the first before holding the second.
    assert.equal(commitPending(r, "goal", goal.id), "deleted");
    markPending(r, "goal", second, T0 + 500);
    // A late timer for the first finds the second's marker and does nothing.
    assert.equal(commitPending(r, "goal", goal.id), "none");
    assert.ok(exists(r, second.id));
    assert.equal(commitPending(r, "goal", second.id), "deleted");
    assert.equal(tombstones(r, goal.id), 1);
    assert.equal(tombstones(r, second.id), 1);
  } finally {
    db.close();
  }
});
