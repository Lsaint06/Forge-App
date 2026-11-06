import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pathRepository } from "./path-fixture";
import {
  synchronize,
  type CloudRecord,
  type CloudTransport,
} from "../src/cloud/sync";
import { accountHasCloudRecords, linkChecked } from "../src/cloud/link";
import {
  dataOwner,
  hasLocalData,
  importBackupKeepingOwner,
} from "../src/data/ownership";

// Phase 7.7B follow-up: linking this phone's unowned training to an account
// only when that account holds no cloud records. The sync engine combines
// histories by union (characterized below), so anything else is refused
// before any change, and an unverifiable account is refused too.

const me = "user-a";
type Fake = {
  rows?: { id: string }[];
  selectError?: Error;
  sessionUser?: string | null;
  sessionError?: Error;
  /** The session changes to another account after the query. */
  switchAfterQuery?: string;
  onQuery?: () => void;
};
function fakeClient(f: Fake = {}) {
  let user = f.sessionUser === undefined ? me : f.sessionUser;
  const calls: { table: string; columns: string; limit: number }[] = [];
  const client = {
    auth: {
      getSession: async () =>
        f.sessionError
          ? { data: { session: null }, error: f.sessionError }
          : {
              data: { session: user ? { user: { id: user } } : null },
              error: null,
            },
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        limit: async (limit: number) => {
          calls.push({ table, columns, limit });
          f.onQuery?.();
          if (f.switchAfterQuery) user = f.switchAfterQuery;
          return f.selectError
            ? { data: null, error: f.selectError }
            : { data: f.rows ?? [], error: null };
        },
      }),
    }),
    rpc: () => {
      throw new Error("linking must never write to the cloud");
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
function legacyPhone() {
  const f = pathRepository();
  f.r.saveProfile({ onboarded: true, name: "Phone athlete" });
  const w = f.r.startWorkout("Old session");
  f.r.addJournal("measurement", { name: "Bodyweight", value: 80, unit: "kg" });
  return { ...f, workoutId: w.id };
}
const snapshot = (r: ReturnType<typeof pathRepository>["r"]) => ({
  workouts: r.workouts().map((w) => w.id),
  journal: r.journal().map((j) => j.id),
  outbox: r.outbox().map((o) => o.id),
  profile: r.profile().name,
});

test("permitted: an account with no cloud records is linked; nothing is uploaded", async () => {
  const { r, db } = legacyPhone();
  try {
    const before = snapshot(r);
    const { client, calls } = fakeClient({ rows: [] });
    assert.equal(await linkChecked(r, client, me), "linked");
    assert.equal(dataOwner(r), me);
    // Local data, including what waits to be synchronized, is untouched.
    assert.deepEqual(snapshot(r), before);
    // One read of at most one identifier: never a payload, never a write.
    assert.deepEqual(calls, [
      { table: "forge_records", columns: "id", limit: 1 },
    ]);
  } finally {
    db.close();
  }
});

test("blocked: an account that already has cloud records is never linked", async () => {
  const { r, db } = legacyPhone();
  try {
    const before = snapshot(r);
    const { client } = fakeClient({ rows: [{ id: "profile" }] });
    assert.equal(await linkChecked(r, client, me), "accountHasRecords");
    assert.equal(dataOwner(r), undefined);
    assert.deepEqual(snapshot(r), before);
    assert.equal(hasLocalData(r), true);
  } finally {
    db.close();
  }
});

test("fails closed: no check, no link", async () => {
  const cases: [string, Fake][] = [
    [
      "cloud table missing or query refused",
      {
        selectError: new Error(
          'relation "public.forge_records" does not exist',
        ),
      },
    ],
    ["offline", { sessionError: new Error("Failed to fetch") }],
    ["signed out meanwhile", { sessionUser: null }],
    ["another account signed in", { sessionUser: "user-b" }],
    ["account changed during the check", { switchAfterQuery: "user-b" }],
  ];
  for (const [name, fake] of cases) {
    const { r, db } = legacyPhone();
    try {
      const before = snapshot(r);
      await assert.rejects(
        () => linkChecked(r, fakeClient(fake).client, me),
        Error,
        name,
      );
      assert.equal(dataOwner(r), undefined, name);
      assert.deepEqual(snapshot(r), before, name);
    } finally {
      db.close();
    }
  }
});

test("data cleared during the check is not linked", async () => {
  const { r, db } = legacyPhone();
  try {
    const { client } = fakeClient({ rows: [], onQuery: () => r.clearData() });
    await assert.rejects(
      () => linkChecked(r, client, me),
      /changed during the check/,
    );
    assert.equal(dataOwner(r), undefined);
  } finally {
    db.close();
  }
});

test("training owned by another account is never relinked, even to an empty account", async () => {
  const { r, db } = legacyPhone();
  try {
    r.setSetting("cloudOwner", "user-b");
    await assert.rejects(
      () => linkChecked(r, fakeClient({ rows: [] }).client, me),
      /another account/,
    );
    assert.equal(dataOwner(r), "user-b");
  } finally {
    db.close();
  }
});

test("accountHasCloudRecords reads the signed-in account only", async () => {
  assert.equal(
    await accountHasCloudRecords(fakeClient({ rows: [] }).client, me),
    false,
  );
  assert.equal(
    await accountHasCloudRecords(
      fakeClient({ rows: [{ id: "w1" }] }).client,
      me,
    ),
    true,
  );
});

test("why: the first sync after linking combines both histories by union", async () => {
  // Characterizes the existing engine (unchanged): with records already in
  // the account, local training is uploaded into it and the account's
  // training is downloaded onto the phone; only the profile conflicts.
  const { r, db, workoutId } = legacyPhone();
  try {
    const cloudWorkout = pathRepository();
    const other = cloudWorkout.r.startWorkout("Account session");
    cloudWorkout.r.finishWorkout(other.id);
    const payload = JSON.parse(
      cloudWorkout.r.outbox().find((o) => o.id === other.id)!.payload,
    ) as unknown;
    cloudWorkout.db.close();
    const rows: CloudRecord[] = [
      {
        id: "profile",
        kind: "profile",
        payload: {},
        revision: 3,
        deleted: false,
      },
      { id: other.id, kind: "workout", payload, revision: 1, deleted: false },
    ];
    const cloud: CloudTransport = {
      list: async () => rows,
      write: async (op) => {
        const old = rows.find((x) => x.id === op.id);
        if ((old?.revision ?? 0) !== op.revision) return { conflict: old! };
        rows.push({
          id: op.id,
          kind: op.kind,
          payload: JSON.parse(op.payload) as unknown,
          revision: op.revision + 1,
          deleted: !!op.deleted,
        });
        return { revision: op.revision + 1 };
      },
    };
    r.setSetting("cloudOwner", me);
    const result = await synchronize(r, cloud, me);
    assert.ok(
      rows.some((x) => x.id === workoutId),
      "local training uploaded",
    );
    assert.ok(
      r.workouts().some((w) => w.id === other.id),
      "cloud training downloaded",
    );
    assert.equal(result.conflicts, 1);
    assert.deepEqual(
      r.conflicts().map((c) => c.id),
      ["profile"],
    );
  } finally {
    db.close();
  }
});

test("a phone holding only a queued deletion still counts as local history", () => {
  const { r, db } = pathRepository();
  try {
    const w = r.startWorkout();
    r.deleteWorkout(w.id);
    assert.equal(r.workouts().length, 0);
    assert.equal(r.outbox().length, 1);
    assert.equal(hasLocalData(r), true);
  } finally {
    db.close();
  }
});

test("restoring a backup keeps the signed-in athlete's ownership", () => {
  const source = legacyPhone();
  const text = JSON.stringify(source.r.exportBackup());
  source.db.close();
  const { r, db } = pathRepository();
  try {
    r.setSetting("cloudOwner", me);
    r.startWorkout("Before import");
    importBackupKeepingOwner(r, text);
    assert.equal(dataOwner(r), me);
    assert.deepEqual(
      r.workouts().map((w) => w.name),
      ["Old session"],
    );
    // A rejected file changes nothing, ownership included.
    assert.throws(() => importBackupKeepingOwner(r, "{not json"));
    assert.equal(dataOwner(r), me);
    assert.deepEqual(
      r.workouts().map((w) => w.name),
      ["Old session"],
    );
  } finally {
    db.close();
  }
  const unowned = pathRepository();
  try {
    importBackupKeepingOwner(unowned.r, text);
    assert.equal(dataOwner(unowned.r), undefined);
  } finally {
    unowned.db.close();
  }
});
