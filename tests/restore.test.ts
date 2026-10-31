import { test } from "node:test";
import assert from "node:assert/strict";
import { pathRepository } from "./path-fixture";
import {
  synchronize,
  type CloudRecord,
  type CloudTransport,
} from "../src/cloud/sync";
import {
  claimIfEmpty,
  dataOwner,
  hasLocalData,
  localSummary,
  maskEmail,
  ownerHint,
  recordOwnerHint,
} from "../src/data/ownership";
import { entryState } from "../src/auth/entry";

// Phase 7.7C. P1: "Restore your training" is the existing manual
// synchronization, run once at the athlete's request on a phone with nothing
// of its own. Here with the real engine and repository: it only downloads,
// repeats safely, and resumes after an interruption. P2: the owner hints.

const me = { id: "user-a", email: "lstamand@gmail.com" };
type Repo = ReturnType<typeof pathRepository>["r"];

/** The account as the athlete's old phone synchronized it. */
function savedAccount() {
  const old = pathRepository();
  old.r.saveProfile({ onboarded: true, name: "Returning" });
  const w = old.r.startWorkout("Old session");
  old.r.finishWorkout(w.id);
  old.r.addJournal("measurement", {
    name: "Bodyweight",
    value: 80,
    unit: "kg",
  });
  const rows: CloudRecord[] = old.r.outbox().map((o) => ({
    id: o.id,
    kind: o.kind,
    payload: JSON.parse(o.payload) as unknown,
    revision: 1,
    deleted: !!o.deleted,
  }));
  old.db.close();
  return { rows, workoutId: w.id };
}

function cloud(rows: CloudRecord[], failList = false) {
  const calls = { lists: 0, writes: 0 };
  const transport: CloudTransport = {
    list: async () => {
      calls.lists++;
      if (failList) throw new TypeError("Network request failed");
      return rows;
    },
    write: async () => {
      calls.writes++;
      throw new Error("a restore must never upload");
    },
  };
  return { transport, calls };
}

const facts = (r: Repo) =>
  entryState({
    configured: true,
    session: me,
    owner: dataOwner(r),
    hasLocalData: hasLocalData(r),
    onboarded: r.profile().onboarded,
  }).kind;

test("restore on an empty phone downloads the account's training and opens Home", async () => {
  const { rows, workoutId } = savedAccount();
  const { r, db } = pathRepository();
  try {
    claimIfEmpty(r, me.id);
    assert.equal(facts(r), "setup");
    const { transport, calls } = cloud(rows);
    const result = await synchronize(r, transport, me.id);
    assert.equal(calls.writes, 0, "nothing uploaded");
    assert.equal(result.uploaded, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.downloaded, rows.length);
    // The profile comes back finished, so setup isn't repeated.
    assert.equal(r.profile().onboarded, true);
    assert.equal(r.profile().name, "Returning");
    assert.deepEqual(
      r.workouts().map((w) => w.id),
      [workoutId],
    );
    assert.equal(r.journal("measurement").length, 1);
    assert.equal(r.conflicts().length, 0);
    assert.equal(dataOwner(r), me.id);
    assert.equal(facts(r), "ready");
  } finally {
    db.close();
  }
});

test("restoring again duplicates nothing", async () => {
  const { rows } = savedAccount();
  const { r, db } = pathRepository();
  try {
    claimIfEmpty(r, me.id);
    await synchronize(r, cloud(rows).transport, me.id);
    const again = await synchronize(r, cloud(rows).transport, me.id);
    assert.equal(again.downloaded, 0);
    assert.equal(r.workouts().length, 1);
    assert.equal(r.journal().length, 1);
  } finally {
    db.close();
  }
});

test("an interrupted restore changes nothing, and trying again completes it", async () => {
  const { rows } = savedAccount();
  const { r, db } = pathRepository();
  try {
    claimIfEmpty(r, me.id);
    const failed = await synchronize(r, cloud(rows, true).transport, me.id);
    assert.equal(failed.downloaded, 0);
    assert.ok(failed.errors.length > 0);
    assert.equal(r.workouts().length, 0);
    assert.equal(r.profile().onboarded, false);
    assert.equal(facts(r), "setup");
    const done = await synchronize(r, cloud(rows).transport, me.id);
    assert.equal(done.errors.length, 0);
    assert.equal(facts(r), "ready");
  } finally {
    db.close();
  }
});

test("a partial restore keeps what arrived; the next try brings the rest", async () => {
  const { rows, workoutId } = savedAccount();
  const broken = rows.map((row) =>
    row.id === workoutId ? { ...row, payload: { broken: true } } : row,
  );
  const { r, db } = pathRepository();
  try {
    claimIfEmpty(r, me.id);
    const partial = await synchronize(r, cloud(broken).transport, me.id);
    assert.equal(partial.errors.length, 1);
    assert.equal(partial.downloaded, rows.length - 1);
    assert.equal(r.workouts().length, 0);
    const rest = await synchronize(r, cloud(rows).transport, me.id);
    assert.equal(rest.downloaded, 1);
    assert.equal(r.workouts().length, 1);
  } finally {
    db.close();
  }
});

test("restore is only offered before anything is entered on this phone", () => {
  const { r, db } = pathRepository();
  try {
    claimIfEmpty(r, me.id);
    assert.equal(hasLocalData(r), false);
    // The first onboarding answer is saved (and queued) right away.
    r.saveProfile({ name: "Typed in setup" });
    assert.equal(hasLocalData(r), true);
  } finally {
    db.close();
  }
});

test("restore never takes another account's phone", async () => {
  const { rows } = savedAccount();
  const { r, db } = pathRepository();
  try {
    r.setSetting("cloudOwner", "user-b");
    r.startWorkout();
    await assert.rejects(
      () => synchronize(r, cloud(rows).transport, me.id),
      /different account/,
    );
    assert.equal(dataOwner(r), "user-b");
  } finally {
    db.close();
  }
});

test("owner hints: masked, tied to the owner, never authorization (P2)", () => {
  assert.equal(maskEmail("lstamand@gmail.com"), "l•••@gmail.com");
  assert.equal(maskEmail("a@b.co"), "a•••@b.co");
  assert.equal(maskEmail("not-an-email"), undefined);
  assert.equal(maskEmail(undefined), undefined);
  const { r, db } = pathRepository();
  try {
    // Only the owner, signed in, is described.
    assert.equal(recordOwnerHint(r, { ...me, methods: ["Google"] }), false);
    r.setSetting("cloudOwner", me.id);
    assert.equal(recordOwnerHint(r, { ...me, methods: ["Google"] }), true);
    assert.equal(recordOwnerHint(r, { ...me, methods: ["Google"] }), false);
    assert.deepEqual(ownerHint(r), {
      email: "l•••@gmail.com",
      methods: ["Google"],
    });
    // The whole address is never stored.
    assert.doesNotMatch(r.setting("cloudOwnerHint")!, /lstamand/);
    // A hint describing anyone but the current owner is ignored.
    r.setSetting("cloudOwner", "user-b");
    assert.equal(ownerHint(r), undefined);
    // It plays no part in deciding what's shown: another account's data
    // stays blocked whatever the hint says.
    r.startWorkout();
    assert.equal(facts(r), "otherAccount");
    // Unreadable hints are ignored.
    r.setSetting("cloudOwnerHint", "{not json");
    assert.equal(ownerHint(r), undefined);
    // Deleting this phone's data removes it with everything else.
    r.clearData();
    assert.equal(r.setting("cloudOwnerHint"), undefined);
  } finally {
    db.close();
  }
});

test("localSummary counts what deleting would remove, and what never synced", () => {
  const { r, db } = pathRepository();
  try {
    const w = r.startWorkout();
    r.finishWorkout(w.id);
    r.addJournal("measurement", { name: "Bodyweight", value: 80, unit: "kg" });
    const s = localSummary(r);
    assert.equal(s.workouts, 1);
    assert.equal(s.templates, 0);
    assert.equal(s.journal, 1);
    assert.equal(s.customExercises, 0);
    assert.ok(s.unsynced >= 2);
  } finally {
    db.close();
  }
});
