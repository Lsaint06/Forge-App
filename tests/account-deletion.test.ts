import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { phone } from "./cloud-fixture";
import { claimIfEmpty, dataOwner, localSummary } from "../src/data/ownership";
import type { Repository } from "../src/data/repository";
import {
  acknowledgeDeletedAccount,
  cloudDeletion,
  deleteAccount,
  deletedAccount,
  dismissDeletion,
  noteAccountGone,
  pendingDeletion,
  resumeDeletion,
  type DeletionDeps,
} from "../src/auth/account-deletion";
import {
  ACCOUNT_GONE_HERE,
  ACCOUNT_GONE_SYNC_TEXT,
  DELETED_HERE_TEXT,
  DELETION_DIDNT_HAPPEN,
  DELETION_UNCONFIRMED_HERE,
  DELETION_UNCONFIRMED_SIGNED_OUT,
  OWNER_DELETED_SIGNED_OUT,
  OWNER_DELETED_TEXT,
  OWNER_DELETION_UNCONFIRMED,
  accountDeletionText,
  ownerDeletionText,
  restoreOutcome,
  syncFailureText,
  syncSummary,
  welcomeDeletionText,
} from "../src/domain/presentation/account";
import { entryState } from "../src/auth/entry";
import {
  SyncStopError,
  stopReason,
  synchronize,
  type CloudRecord,
  type CloudTransport,
  type SyncResult,
} from "../src/cloud/sync";
import { cloudFailure } from "../src/cloud/transport";

// Phase 7.8E, Stage 2: deleting the Forge account. The account service is
// simulated here (and, at the end, the real migration in PGlite): nothing
// touches the live Supabase project.

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

/** A phone holding `owner`'s training, with changes not yet synchronized. */
function phoneOf(owner = A) {
  const r = phone(owner);
  r.saveProfile({ onboarded: true });
  r.startWorkout("Push day");
  return r;
}

type Reply = {
  error?: { message?: string; hint?: string; code?: string } | null;
};
function service(
  f: {
    reply?: Reply | (() => Promise<Reply>);
    user?: { id?: string; missing?: boolean } | (() => Promise<object>);
  } = {},
) {
  const calls: string[] = [];
  const deps: DeletionDeps = {
    async deleteInCloud() {
      calls.push("delete");
      return typeof f.reply === "function"
        ? f.reply()
        : (f.reply ?? { error: null });
    },
    async currentUser() {
      calls.push("check");
      return typeof f.user === "function" ? f.user() : (f.user ?? {});
    },
    async signOut() {
      calls.push("signOut");
    },
    afterRemove: () => calls.push("afterRemove"),
  };
  return { deps, calls };
}
const offline = { error: { message: "TypeError: Network request failed" } };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
const facts = (r: Repository) => ({
  marker: pendingDeletion(r),
  deleted: deletedAccount(r),
});

test("confirmed: the sign-in ends, then this phone's training is removed and the deletion recorded", async () => {
  const r = phoneOf();
  assert.equal(localSummary(r).workouts, 1);
  assert.ok(localSummary(r).unsynced > 0);
  const { deps, calls } = service();
  const order: string[] = [];
  deps.signOut = async () => {
    order.push(`signOut with ${localSummary(r).workouts} workout`);
  };
  deps.afterRemove = () => order.push("afterRemove");
  assert.deepEqual(await deleteAccount(r, A, deps), { kind: "deleted" });
  assert.deepEqual(calls, ["delete"]);
  assert.deepEqual(order, ["signOut with 1 workout", "afterRemove"]);
  const left = localSummary(r);
  assert.deepEqual(
    [left.workouts, left.templates, left.journal, left.unsynced],
    [0, 0, 0, 0],
  );
  assert.equal(dataOwner(r), undefined);
  assert.equal(pendingDeletion(r), undefined);
  assert.deepEqual(
    { ...deletedAccount(r), at: 0 },
    { owner: A, at: 0, localRemoved: true, source: "this-phone" },
  );
  assert.equal(welcomeDeletionText(facts(r)), DELETED_HERE_TEXT);
});

test("the marker is written before the request and holds only an ID, a state and a time", async () => {
  const r = phoneOf();
  let seen: string | undefined;
  const { deps } = service({
    reply: async () => {
      seen = r.setting("accountDeletion");
      return { error: null };
    },
  });
  await deleteAccount(r, A, deps);
  const marker = JSON.parse(seen!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(marker).sort(), ["at", "owner", "state"]);
  assert.equal(marker.owner, A);
  assert.equal(marker.state, "requested");
  // The record left afterwards is just as bare: no token, password or email.
  const record = r.setting("accountDeleted")!;
  assert.deepEqual(Object.keys(JSON.parse(record)).sort(), [
    "at",
    "localRemoved",
    "owner",
    "source",
  ]);
  assert.doesNotMatch(record + seen, /@|token|password|eyJ/i);
});

test("reply lost: the account service says the account is gone, so the deletion is finished", async () => {
  const r = phoneOf();
  const { deps, calls } = service({ reply: offline, user: { missing: true } });
  assert.deepEqual(await deleteAccount(r, A, deps), { kind: "deleted" });
  assert.deepEqual(calls, ["delete", "check", "signOut", "afterRemove"]);
  assert.equal(localSummary(r).workouts, 0);
});

test("request never arrived: the account still exists, so nothing on this phone changes", async () => {
  const r = phoneOf();
  const { deps, calls } = service({ reply: offline, user: { id: A } });
  assert.deepEqual(await deleteAccount(r, A, deps), { kind: "notDeleted" });
  assert.deepEqual(calls, ["delete", "check"]);
  assert.equal(localSummary(r).workouts, 1);
  assert.equal(dataOwner(r), A);
  assert.equal(pendingDeletion(r)?.state, "notDeleted");
  assert.equal(accountDeletionText(facts(r)), DELETION_DIDNT_HAPPEN);
  // "Keep my account".
  dismissDeletion(r, A);
  assert.equal(pendingDeletion(r), undefined);
  assert.equal(accountDeletionText(facts(r)), undefined);
});

test("no answer either way: uncertain, nothing removed, and checked again only by its own account", async () => {
  const r = phoneOf();
  const first = service({ reply: offline, user: {} });
  assert.deepEqual(await deleteAccount(r, A, first.deps), {
    kind: "uncertain",
  });
  assert.ok(!first.calls.includes("signOut"));
  assert.equal(localSummary(r).workouts, 1);
  assert.equal(pendingDeletion(r)?.state, "requested");
  assert.equal(accountDeletionText(facts(r)), DELETION_UNCONFIRMED_HERE);
  assert.equal(welcomeDeletionText(facts(r)), DELETION_UNCONFIRMED_SIGNED_OUT);
  assert.equal(ownerDeletionText(facts(r)), OWNER_DELETION_UNCONFIRMED);
  // Still offline.
  assert.deepEqual(await resumeDeletion(r, A, service().deps), {
    kind: "uncertain",
  });
  // Signed out, or another account signed in: not even asked.
  for (const signedIn of [undefined, B]) {
    const other = service({ user: { missing: true } });
    assert.equal(await resumeDeletion(r, signedIn, other.deps), undefined);
    assert.deepEqual(other.calls, []);
  }
  assert.equal(localSummary(r).workouts, 1);
  // Its own account again, and the account service says it's gone.
  const later = service({ user: { missing: true } });
  assert.deepEqual(await resumeDeletion(r, A, later.deps), {
    kind: "deleted",
  });
  assert.equal(localSummary(r).workouts, 0);
});

test("Forge closed after the deletion was confirmed: the next launch finishes it, without a connection", async () => {
  const r = phoneOf();
  const clearData = r.clearData.bind(r);
  r.clearData = () => {
    throw new Error("Forge closed");
  };
  await assert.rejects(deleteAccount(r, A, service().deps), /Forge closed/);
  // Nothing was removed, and the phone knows the deletion was confirmed.
  assert.equal(localSummary(r).workouts, 1);
  assert.equal(pendingDeletion(r)?.state, "deleted");
  r.clearData = clearData;
  const launch = service({
    user: () => Promise.reject(new Error("no connection needed")),
  });
  assert.deepEqual(await resumeDeletion(r, undefined, launch.deps), {
    kind: "deleted",
  });
  assert.deepEqual(launch.calls, ["signOut", "afterRemove"]);
  assert.equal(localSummary(r).workouts, 0);
  assert.equal(deletedAccount(r)?.localRemoved, true);
});

test("a second tap, or a check at launch, shares the request in flight", async () => {
  const r = phoneOf();
  const reply = deferred<Reply>();
  const { deps, calls } = service({ reply: () => reply.promise });
  const first = deleteAccount(r, A, deps);
  const second = deleteAccount(r, A, deps);
  const launch = service({ user: { id: A } });
  const check = resumeDeletion(r, A, launch.deps);
  reply.resolve({ error: null });
  assert.deepEqual(await first, { kind: "deleted" });
  assert.deepEqual(await second, { kind: "deleted" });
  assert.deepEqual(await check, { kind: "deleted" });
  assert.equal(calls.filter((c) => c === "delete").length, 1);
  assert.deepEqual(launch.calls, []);
});

test("a delete that meets a launch check waits, and stops if the check settled it", async () => {
  const r = phoneOf();
  await deleteAccount(r, A, service({ reply: offline, user: {} }).deps);
  const user = deferred<object>();
  const launch = service({ user: () => user.promise });
  const check = resumeDeletion(r, A, launch.deps);
  const tap = service();
  const deletion = deleteAccount(r, A, tap.deps);
  user.resolve({ id: A });
  assert.deepEqual(await check, { kind: "notDeleted" });
  assert.deepEqual(await deletion, { kind: "notDeleted" });
  assert.deepEqual(tap.calls, []);
  assert.equal(localSummary(r).workouts, 1);
});

test("only the account that owns this phone's training can delete it here", async () => {
  const r = phoneOf(B);
  const { deps, calls } = service();
  await assert.rejects(deleteAccount(r, A, deps), /owns this phone/);
  assert.deepEqual(calls, []);
  assert.equal(pendingDeletion(r), undefined);
  assert.equal(localSummary(r).workouts, 1);
  assert.equal(dataOwner(r), B);
});

test("the account service asking for a fresh sign-in (Stage 3) changes nothing", async () => {
  const r = phoneOf();
  const { deps, calls } = service({
    reply: {
      error: {
        message: "Sign in again to delete your account",
        hint: "reauthentication_needed",
      },
    },
  });
  assert.deepEqual(await deleteAccount(r, A, deps), {
    kind: "reauthenticate",
  });
  assert.deepEqual(calls, ["delete"]);
  assert.equal(pendingDeletion(r), undefined);
  assert.equal(localSummary(r).workouts, 1);
});

test("after a deletion, a new account on this phone starts empty and the notice ends", async () => {
  const r = phoneOf();
  await deleteAccount(r, A, service().deps);
  assert.equal(claimIfEmpty(r, B), true);
  assert.equal(dataOwner(r), B);
  assert.equal(localSummary(r).workouts, 0);
  acknowledgeDeletedAccount(r);
  assert.equal(deletedAccount(r), undefined);
  assert.equal(welcomeDeletionText(facts(r)), undefined);
});

test("another device finds the account gone: nothing removed, and no other account can open it", () => {
  const r = phoneOf();
  noteAccountGone(r, B); // not this phone's owner: ignored
  assert.equal(deletedAccount(r), undefined);
  noteAccountGone(r, A);
  assert.deepEqual(
    { ...deletedAccount(r), at: 0 },
    { owner: A, at: 0, localRemoved: false, source: "sync" },
  );
  assert.equal(localSummary(r).workouts, 1);
  assert.equal(accountDeletionText(facts(r)), ACCOUNT_GONE_HERE);
  assert.equal(welcomeDeletionText(facts(r)), OWNER_DELETED_SIGNED_OUT);
  assert.equal(ownerDeletionText(facts(r)), OWNER_DELETED_TEXT);
  acknowledgeDeletedAccount(r);
  assert.ok(deletedAccount(r), "kept: the training is still here");
  // A new account, even with the same email (a new ID), can't open it.
  const entry = entryState({
    configured: true,
    session: { id: B, email: "same@example.com" },
    owner: dataOwner(r),
    hasLocalData: true,
    onboarded: true,
  });
  assert.equal(entry.kind, "otherAccount");
});

test("Forge before Stage 2: its never-read flag now says the owner's account was deleted", () => {
  const r = phoneOf();
  r.setSetting("cloudAccountDeleted", "true");
  assert.deepEqual(deletedAccount(r), {
    owner: A,
    at: 0,
    localRemoved: false,
    source: "this-phone",
  });
  assert.equal(ownerDeletionText(facts(r)), OWNER_DELETED_TEXT);
  // Without an owner it says nothing, and removing the data clears it.
  r.clearData();
  r.setSetting("cloudAccountDeleted", "true");
  assert.equal(deletedAccount(r), undefined);
});

test("cloudDeletion: the RPC, and the account service's answer about the account", async () => {
  const client = (
    rpc: () => Promise<unknown>,
    getUser: () => Promise<unknown>,
  ) =>
    cloudDeletion({
      rpc: rpc as never,
      auth: { getUser } as never,
    });
  const ok = client(
    async () => ({ error: null }),
    async () => ({ data: { user: { id: A } }, error: null }),
  );
  assert.deepEqual(await ok.deleteInCloud(), { error: null });
  assert.deepEqual(await ok.currentUser(), { id: A });
  const gone = client(
    () => Promise.reject(new TypeError("Network request failed")),
    async () => ({
      data: { user: null },
      error: { code: "user_not_found", status: 403 },
    }),
  );
  assert.deepEqual(await gone.deleteInCloud(), {
    error: { message: "Network request failed" },
  });
  assert.deepEqual(await gone.currentUser(), { missing: true });
  // A revoked sign-in or no connection proves nothing.
  for (const answer of [
    async () => ({
      data: { user: null },
      error: { code: "session_not_found", status: 403 },
    }),
    () => Promise.reject(new TypeError("Network request failed")),
  ])
    assert.deepEqual(
      await client(async () => ({ error: null }), answer).currentUser(),
      {},
    );
});

test("sync and restore say plainly that the account no longer exists", () => {
  const result: SyncResult = {
    uploaded: 0,
    downloaded: 0,
    matched: 0,
    rejected: 0,
    failed: 0,
    held: { update: 0, active: 0 },
    conflicts: 0,
    pending: 2,
    errors: [],
    stopped: "deleted",
  };
  assert.equal(syncSummary(result), ACCOUNT_GONE_SYNC_TEXT);
  assert.equal(
    syncFailureText(new SyncStopError("deleted", "insert or update")),
    ACCOUNT_GONE_SYNC_TEXT,
  );
  assert.match(ACCOUNT_GONE_SYNC_TEXT, /no longer exists.*export a backup/);
  const restored = restoreOutcome(result);
  assert.equal(restored.kind, "failed");
  assert.match(restored.text, /nothing to restore/);
  assert.equal(stopReason(new SyncStopError("deleted", "")), "deleted");
  // PostgREST's answer to a write for an account that no longer exists.
  const e = cloudFailure(
    {
      code: "23503",
      message:
        'insert or update on table "forge_records" violates foreign key constraint',
    },
    409,
  );
  assert.equal(stopReason(e), "deleted");
});

// The real migration (unchanged) in PGlite, as Supabase runs it: deleting
// the account deletes its cloud records; another device's sync afterwards
// stops and uploads nothing; other accounts are untouched.

async function server() {
  const db = new PGlite();
  await db.exec(
    `CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610140001_forge.sql", "utf8"),
  );
  await db.exec(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}');`);
  /** One request as `user`, refused the way PostgREST reports it. */
  async function as<T>(user: string, run: () => Promise<T>) {
    await db.exec(`SET ROLE authenticated;SET test.user_id='${user}';`);
    try {
      return await run();
    } catch (e) {
      const { code, message } = e as { code?: string; message?: string };
      throw cloudFailure({ code, message }, code === "23503" ? 409 : 400);
    } finally {
      await db.exec("RESET ROLE;");
    }
  }
  type Row = {
    id: string;
    kind: string;
    payload: unknown;
    revision: number | string;
    deleted: boolean;
    updated_at: Date;
  };
  const transport = (user: string): CloudTransport => ({
    list: ({ since, ids } = {}) =>
      as(user, async () => {
        const where = ids
          ? "WHERE id = ANY($1)"
          : since
            ? "WHERE updated_at >= $1"
            : "";
        const { rows } = await db.query<Row>(
          `SELECT id,kind,payload,revision,deleted,updated_at FROM public.forge_records ${where} ORDER BY updated_at,id`,
          ids ? [ids] : since ? [since] : [],
        );
        return rows.map((row): CloudRecord => ({
          id: row.id,
          kind: row.kind,
          payload: row.payload,
          revision: Number(row.revision),
          deleted: row.deleted,
          updatedAt: row.updated_at.toISOString(),
        }));
      }),
    write: (op) =>
      as(user, async () => {
        const { rows } = await db.query<{
          result: { revision?: number; conflict?: CloudRecord };
        }>("SELECT public.forge_write($1,$2,$3::jsonb,$4,$5) AS result", [
          op.id,
          op.kind,
          op.payload,
          op.revision,
          !!op.deleted,
        ]);
        const result = rows[0]!.result;
        return result.conflict
          ? { conflict: result.conflict }
          : { revision: Number(result.revision) };
      }),
  });
  const deps = (user: string): Omit<DeletionDeps, "signOut"> => ({
    deleteInCloud: async () => {
      try {
        await as(user, () => db.query("SELECT public.forge_delete_account()"));
        return { error: null };
      } catch (e) {
        return { error: { message: (e as Error).message } };
      }
    },
    currentUser: async () => {
      const { rows } = await db.query(
        `SELECT id FROM auth.users WHERE id='${user}'`,
      );
      return rows.length ? { id: user } : { missing: true };
    },
  });
  const count = async (user: string) =>
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.forge_records WHERE user_id='${user}'`,
      )
    ).rows[0]!.n;
  return { db, transport, deps, count };
}

test("real migration: deleted with its cloud records; another device stops and uploads nothing; other accounts untouched", async () => {
  const s = await server();
  try {
    const here = phoneOf(A);
    const there = phoneOf(A);
    const other = phoneOf(B);
    assert.equal(
      (await synchronize(here, s.transport(A), A)).stopped,
      undefined,
    );
    assert.equal(
      (await synchronize(there, s.transport(A), A)).stopped,
      undefined,
    );
    assert.equal(
      (await synchronize(other, s.transport(B), B)).stopped,
      undefined,
    );
    const bRecords = await s.count(B);
    assert.ok((await s.count(A)) > 0 && bRecords > 0);
    // Training added on the other device, never synchronized.
    there.addJournal("measurement", {
      name: "Bodyweight",
      value: 80,
      unit: "kg",
    });
    const waiting = localSummary(there).unsynced;
    assert.ok(waiting > 0);

    const outcome = await deleteAccount(here, A, {
      ...s.deps(A),
      signOut: async () => {},
    });
    assert.deepEqual(outcome, { kind: "deleted" });
    assert.equal(await s.count(A), 0);
    assert.equal(localSummary(here).workouts, 0);

    // The other device, still holding A's sign-in: nothing goes up, and
    // nothing on it is lost.
    const result = await synchronize(there, s.transport(A), A);
    assert.equal(result.stopped, "deleted");
    assert.equal(result.uploaded, 0);
    assert.equal(syncSummary(result), ACCOUNT_GONE_SYNC_TEXT);
    assert.equal(await s.count(A), 0);
    assert.equal(localSummary(there).workouts, 1);
    assert.equal(localSummary(there).journal, 1);
    assert.equal(localSummary(there).unsynced, waiting);
    noteAccountGone(there, A);
    assert.equal(deletedAccount(there)?.source, "sync");

    // Asking again with the old sign-in is harmless.
    assert.deepEqual(await s.deps(A).deleteInCloud(), { error: null });
    // The same email signing up again is a new account with nothing in it.
    const C = "00000000-0000-0000-0000-00000000000c";
    await s.db.exec(`INSERT INTO auth.users(id) VALUES('${C}');`);
    assert.deepEqual(await s.transport(C).list(), []);
    // B's account and records are exactly as they were.
    assert.equal(await s.count(B), bRecords);
    assert.deepEqual((await s.deps(B).currentUser()).id, B);
    assert.equal(
      (await synchronize(other, s.transport(B), B)).stopped,
      undefined,
    );
  } finally {
    await s.db.close();
  }
});
