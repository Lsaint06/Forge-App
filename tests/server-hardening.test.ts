import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { phone } from "./cloud-fixture";
import { localSummary } from "../src/data/ownership";
import {
  deleteAccount as deleteAccountOnPhone,
  pendingDeletion,
  type DeletionDeps,
} from "../src/auth/account-deletion";
import type { Repository } from "../src/data/repository";
import {
  synchronize,
  type CloudRecord,
  type CloudTransport,
} from "../src/cloud/sync";

// Phase 7.8E, Stage 3: the hardening migration (not deployed), verified in
// Postgres (PGlite) set up the way Supabase sets up a project: its API roles,
// `auth.uid()` and `auth.jwt()` read from the request's JWT claims, the
// sessions table, and Supabase's default privileges. Each request runs as
// PostgREST runs one: a transaction in the caller's role with its claims.
// Claims here are written by the test; in Supabase they come only from the
// JWT PostgREST verified (see the migration's assumptions).

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const SESSION_A = "10000000-0000-0000-0000-00000000000a";
const SESSION_B = "10000000-0000-0000-0000-00000000000b";
const migrations = [
  "supabase/migrations/202610140001_forge.sql",
  "supabase/migrations/202611020001_forge_security_hardening.sql",
];
const ROLLBACK = "supabase/rollback/202611020001_forge_security_hardening.sql";

/**
 * Supabase's default grants for new objects in public: "earlier" for projects
 * created before its 2026 change (production), "2026" for projects created
 * since, which grant the API roles nothing by default (FORGE DEV, Phase 8.2).
 */
type Defaults = "earlier" | "2026";

async function supabase(apply = migrations, defaults: Defaults = "earlier") {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.identities(
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      provider text NOT NULL
    );
    CREATE TABLE auth.sessions(
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      not_after timestamptz
    );
    -- As Supabase defines them: the request's verified JWT claims.
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
      )::jsonb
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `);
  await db.exec(
    defaults === "earlier"
      ? `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;`
      : // Nothing granted; functions not even to PUBLIC (the stricter case).
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
  );
  for (const file of apply) await db.exec(readFileSync(file, "utf8"));
  await db.exec(`
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}');
    INSERT INTO auth.identities VALUES
      ('20000000-0000-0000-0000-00000000000a', '${A}', 'google'),
      ('20000000-0000-0000-0000-00000000000b', '${B}', 'email');
    INSERT INTO auth.sessions(id, user_id) VALUES
      ('${SESSION_A}', '${A}'), ('${SESSION_B}', '${B}');
  `);
  return db;
}

const now = () => Math.floor(Date.now() / 1000);
const MIN = 60;
type Caller = { role: "anon" } | { role: "authenticated"; claims: object };
const anon: Caller = { role: "anon" };
/**
 * A signed-in request, as Supabase Auth issues its claims: who, which
 * session, how and when that session was authenticated (`amr`), and when
 * this token was issued (`iat`, renewed by every refresh).
 */
function as(
  sub: string | undefined,
  options: {
    session?: string | null;
    amr?: unknown;
    anonymous?: boolean;
    role?: string;
    extra?: object;
  } = {},
): Caller {
  const {
    session = sub === B ? SESSION_B : SESSION_A,
    anonymous = false,
    role = "authenticated",
    extra = {},
  } = options;
  // Given explicitly, even as undefined: that's a token without `amr`.
  const amr =
    "amr" in options
      ? options.amr
      : [{ method: "password", timestamp: now() - MIN }];
  const claims: Record<string, unknown> = {
    role,
    iat: now(),
    exp: now() + 3600,
    is_anonymous: anonymous,
    ...extra,
  };
  if (sub) claims.sub = sub;
  if (session) claims.session_id = session;
  if (amr !== undefined) claims.amr = amr;
  return { role: "authenticated", claims };
}

/** One API request: a transaction in the caller's role, with its claims. */
async function request<T = Record<string, unknown>>(
  db: PGlite,
  caller: Caller,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${caller.role}`);
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      caller.role === "authenticated" ? JSON.stringify(caller.claims) : "",
    ]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const deleteAccount = (db: PGlite, caller: Caller) =>
  request(db, caller, "SELECT public.forge_delete_account()");
const write = (db: PGlite, caller: Caller, id: string, base = 0) =>
  request<{ result: { revision?: number } }>(
    db,
    caller,
    "SELECT public.forge_write($1, 'journal', '{}'::jsonb, $2, false) AS result",
    [id, base],
  );
const count = async (db: PGlite, table: string, user: string) =>
  (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${table === "auth.users" ? "id" : "user_id"} = $1`,
      [user],
    )
  ).rows[0]!.n;
/** A's account, records, identities and sessions are all still there. */
async function intact(db: PGlite, user = A, records = 1) {
  assert.equal(await count(db, "auth.users", user), 1);
  assert.equal(await count(db, "auth.identities", user), 1);
  assert.equal(await count(db, "auth.sessions", user), 1);
  assert.equal(await count(db, "public.forge_records", user), records);
}
/**
 * Every privilege granted on the records table, exactly as Postgres holds
 * it: a privilege a newer Postgres adds (MAINTAIN, from 17) can't hide.
 */
const tableAcl = async (db: PGlite) =>
  (
    await db.query<{ grantee: string; privilege: string }>(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee,
         a.privilege_type AS privilege
       FROM pg_class c, aclexplode(c.relacl) a
       WHERE c.oid = 'public.forge_records'::regclass
       ORDER BY 1, 2`,
    )
  ).rows;
/** What the API roles (and everyone, PUBLIC) hold on the records table. */
const apiAcl = async (db: PGlite) =>
  (await tableAcl(db)).filter((p) =>
    ["anon", "authenticated", "PUBLIC"].includes(p.grantee),
  );
/** The app's own deletion engine, for this phone's owner A. */
const deleteAccount_ = (r: Repository, deps: DeletionDeps) =>
  deleteAccountOnPhone(r, A, deps);
const refusedAsStale = (p: Promise<unknown>) =>
  assert.rejects(p, (e: { message?: string; code?: string; hint?: string }) => {
    assert.equal(e.message, "Sign in again to delete your account");
    assert.equal(e.code, "42501");
    assert.equal(e.hint, "reauthentication_needed");
    return true;
  });

test("with Supabase's 2026 defaults (FORGE DEV), the app's reads, writes and deletion work, and nothing more", async () => {
  for (const apply of [migrations.slice(0, 1), migrations]) {
    const hardened = apply.length === migrations.length;
    const db = await supabase(apply, "2026");
    try {
      // Writes go through forge_write; each account reads only its own.
      assert.equal((await write(db, as(A), "a1"))[0]!.result.revision, 1);
      await write(db, as(B), "b1");
      assert.deepEqual(
        await request(db, as(A), "SELECT id FROM public.forge_records"),
        [{ id: "a1" }],
      );
      // Anonymous requests and direct writes are refused. The baseline
      // refuses anonymous reads here too, so an anonymous probe can't show
      // the hardening on such a project (schema_checks.sql can).
      await assert.rejects(
        request(db, anon, "SELECT id FROM public.forge_records"),
        /permission denied/i,
      );
      await assert.rejects(write(db, anon, "x"), /permission denied/i);
      await assert.rejects(
        request(
          db,
          as(A),
          `INSERT INTO public.forge_records(user_id, id, kind, payload) VALUES ('${A}', 'direct', 'journal', '{}')`,
        ),
        /permission denied/i,
      );
      assert.deepEqual(await apiAcl(db), [
        { grantee: "authenticated", privilege: "SELECT" },
      ]);
      // The hardened deletion still wants a recent sign-in.
      if (hardened)
        await refusedAsStale(
          deleteAccount(
            db,
            as(A, {
              amr: [{ method: "password", timestamp: now() - 11 * MIN }],
            }),
          ),
        );
      // A recent sign-in deletes the account and its records, and only them.
      await deleteAccount(db, as(A));
      assert.equal(await count(db, "auth.users", A), 0);
      assert.equal(await count(db, "public.forge_records", A), 0);
      await intact(db, B);
    } finally {
      await db.close();
    }
  }
});

test("a recent sign-in deletes the account with its records, identities and sessions, and nothing else", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1");
    await write(db, as(B), "a1");
    await deleteAccount(db, as(A));
    for (const table of [
      "auth.users",
      "auth.identities",
      "auth.sessions",
      "public.forge_records",
    ])
      assert.equal(await count(db, table, A), 0, table);
    await intact(db, B);
  } finally {
    await db.close();
  }
});

test("a stale sign-in is refused, however recently its token was refreshed", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1");
    // Signed in 11 minutes ago; the token itself was issued just now.
    await refusedAsStale(
      deleteAccount(
        db,
        as(A, { amr: [{ method: "password", timestamp: now() - 11 * MIN }] }),
      ),
    );
    // A refresh is never an authentication, even if it appeared in `amr`.
    await refusedAsStale(
      deleteAccount(
        db,
        as(A, {
          amr: [
            { method: "token_refresh", timestamp: now() },
            { method: "password", timestamp: now() - 30 * MIN },
          ],
        }),
      ),
    );
    // Within the window: accepted (just under ten minutes).
    await deleteAccount(
      db,
      as(A, { amr: [{ method: "oauth", timestamp: now() - 9 * MIN }] }),
    );
    assert.equal(await count(db, "auth.users", A), 0);
  } finally {
    await db.close();
  }
});

test("only interactive sign-in methods count", async () => {
  for (const method of [
    "password",
    "oauth",
    "otp",
    "magiclink",
    "recovery",
    "email/signup",
    "totp",
    "passkey",
  ]) {
    const db = await supabase();
    try {
      await deleteAccount(db, as(A, { amr: [{ method, timestamp: now() }] }));
      assert.equal(await count(db, "auth.users", A), 0, method);
    } finally {
      await db.close();
    }
  }
  const db = await supabase();
  try {
    await write(db, as(A), "a1");
    for (const method of [
      "token_refresh",
      "anonymous",
      "oauth_provider/authorization_code",
      "email_change",
      "",
      "PASSWORD",
      "unknown",
    ])
      await refusedAsStale(
        deleteAccount(db, as(A, { amr: [{ method, timestamp: now() }] })),
      );
    await intact(db);
  } finally {
    await db.close();
  }
});

test("missing, malformed or future-dated assurance is refused, and changes nothing", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1");
    for (const amr of [
      undefined,
      null,
      {},
      "password",
      [],
      [{}],
      [{ method: "password" }],
      [{ method: "password", timestamp: String(now()) }],
      [{ method: "password", timestamp: null }],
      [["password", now()]],
      [{ method: "password", timestamp: now() + 3600 }],
    ])
      await refusedAsStale(deleteAccount(db, as(A, { amr })));
    await intact(db);
  } finally {
    await db.close();
  }
});

test("the sign-in must still be live: no, malformed, unknown, someone else's or expired session", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1");
    for (const session of [
      null,
      "not-a-uuid",
      "10000000-0000-0000-0000-0000000000ff",
      SESSION_B,
    ])
      await refusedAsStale(deleteAccount(db, as(A, { session })));
    // Signed out on this device, or everywhere: the session row is gone.
    await db.exec(`DELETE FROM auth.sessions WHERE id = '${SESSION_A}'`);
    await refusedAsStale(deleteAccount(db, as(A)));
    // A time-boxed session past its end.
    await db.exec(
      `INSERT INTO auth.sessions(id, user_id, not_after) VALUES ('${SESSION_A}', '${A}', now() - interval '1 minute')`,
    );
    await refusedAsStale(deleteAccount(db, as(A)));
    await db.exec(
      `UPDATE auth.sessions SET not_after = now() + interval '1 hour' WHERE id = '${SESSION_A}'`,
    );
    await deleteAccount(db, as(A));
    assert.equal(await count(db, "auth.users", A), 0);
  } finally {
    await db.close();
  }
});

test("anonymous, signed-out and wrongly-roled callers can't delete", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1");
    await assert.rejects(deleteAccount(db, anon), /permission denied/i);
    await assert.rejects(
      deleteAccount(db, as(undefined)),
      /Authentication required/,
    );
    await assert.rejects(
      deleteAccount(db, as(A, { role: "anon" })),
      /Authentication required/,
    );
    await assert.rejects(
      deleteAccount(db, as(A, { anonymous: true })),
      /Anonymous sign-ins cannot delete an account/,
    );
    await intact(db);
  } finally {
    await db.close();
  }
});

test("a repeated request after the deletion succeeds and changes nothing, even with a stale token", async () => {
  const db = await supabase();
  try {
    await write(db, as(B), "b1");
    await deleteAccount(db, as(A));
    await deleteAccount(db, as(A));
    await deleteAccount(
      db,
      as(A, { amr: [{ method: "password", timestamp: now() - 60 * MIN }] }),
    );
    await intact(db, B);
  } finally {
    await db.close();
  }
});

test("no caller-supplied value can stand in for a recent sign-in", async () => {
  const db = await supabase();
  try {
    // The function takes nothing: a timestamp argument isn't accepted.
    await assert.rejects(
      request(db, as(A), "SELECT public.forge_delete_account($1)", [now()]),
      /does not exist/,
    );
    // Claims outside `amr` don't count, whatever they say.
    await refusedAsStale(
      deleteAccount(
        db,
        as(A, {
          amr: [{ method: "password", timestamp: now() - 30 * MIN }],
          extra: { auth_time: now(), signed_in_at: now(), iat: now() },
        }),
      ),
    );
    await intact(db, A, 0);
  } finally {
    await db.close();
  }
});

test("sync writes are unchanged for accounts, refused for anonymous sign-ins; reads stay owner-only", async () => {
  const db = await supabase();
  try {
    assert.deepEqual((await write(db, as(A), "x"))[0]!.result, { revision: 1 });
    assert.deepEqual((await write(db, as(B), "x"))[0]!.result, { revision: 1 });
    assert.deepEqual((await write(db, as(A), "x", 1))[0]!.result, {
      revision: 2,
    });
    const conflict = (await write(db, as(A), "x", 0))[0]!.result as {
      conflict?: { revision: number };
    };
    assert.equal(conflict.conflict?.revision, 2);
    await assert.rejects(
      write(db, as(A, { anonymous: true }), "y"),
      /Authentication required/,
    );
    await assert.rejects(write(db, anon, "y"), /permission denied/i);
    const ownRows = (caller: Caller) =>
      request<{ id: string; owner: string }>(
        db,
        caller,
        "SELECT id, user_id::text AS owner FROM public.forge_records ORDER BY id",
      );
    assert.deepEqual(await ownRows(as(A)), [{ id: "x", owner: A }]);
    assert.deepEqual(await ownRows(as(B)), [{ id: "x", owner: B }]);
    // Even its own rows are hidden from an anonymous sign-in.
    assert.deepEqual(await ownRows(as(A, { anonymous: true })), []);
    await assert.rejects(ownRows(anon), /permission denied/i);
  } finally {
    await db.close();
  }
});

test("privileges: anon has none on records; signed-in accounts may only read; functions only for signed-in accounts", async () => {
  const db = await supabase();
  try {
    const privileges = [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ];
    const has = async (role: string, privilege: string) =>
      (
        await db.query<{ ok: boolean }>(
          "SELECT has_table_privilege($1, 'public.forge_records', $2) AS ok",
          [role, privilege],
        )
      ).rows[0]!.ok;
    const version = Number(
      (
        await db.query<{ v: string }>(
          "SELECT current_setting('server_version_num') AS v",
        )
      ).rows[0]!.v,
    );
    // Supabase's projects run Postgres 15 or 17; 17 adds MAINTAIN.
    if (version >= 170000) privileges.push("MAINTAIN");
    for (const privilege of privileges) {
      assert.equal(await has("anon", privilege), false, `anon ${privilege}`);
      assert.equal(
        await has("authenticated", privilege),
        privilege === "SELECT",
        `authenticated ${privilege}`,
      );
    }
    // Exactly: whatever a Postgres version adds, nothing but reading.
    assert.deepEqual(await apiAcl(db), [
      { grantee: "authenticated", privilege: "SELECT" },
    ]);
    const canRun = async (role: string, fn: string) =>
      (
        await db.query<{ ok: boolean }>(
          "SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok",
          [role, fn],
        )
      ).rows[0]!.ok;
    for (const fn of [
      "public.forge_delete_account()",
      "public.forge_write(text,text,jsonb,bigint,boolean)",
    ]) {
      assert.equal(await canRun("anon", fn), false, `anon ${fn}`);
      assert.equal(
        await canRun("authenticated", fn),
        true,
        `authenticated ${fn}`,
      );
    }
    // Both run as their owner with a fixed search path: pg_catalog first,
    // the caller's temporary schema last.
    const { rows } = await db.query<{
      name: string;
      definer: boolean;
      config: string[];
    }>(
      "SELECT proname AS name, prosecdef AS definer, proconfig AS config FROM pg_proc WHERE proname IN ('forge_write', 'forge_delete_account') ORDER BY 1",
    );
    assert.deepEqual(
      rows.map((r) => [r.name, r.definer, r.config]),
      [
        ["forge_delete_account", true, ["search_path=pg_catalog, pg_temp"]],
        ["forge_write", true, ["search_path=pg_catalog, pg_temp"]],
      ],
    );
  } finally {
    await db.close();
  }
});

test("the app's sync works unchanged against the hardened schema", async () => {
  const db = await supabase();
  try {
    type Row = {
      id: string;
      kind: string;
      payload: unknown;
      revision: number | string;
      deleted: boolean;
      updated_at: Date;
    };
    const transport = (caller: Caller): CloudTransport => ({
      async list({ since, ids } = {}) {
        const where = ids
          ? "WHERE id = ANY($1)"
          : since
            ? "WHERE updated_at >= $1"
            : "";
        const rows = await request<Row>(
          db,
          caller,
          `SELECT id, kind, payload, revision, deleted, updated_at FROM public.forge_records ${where} ORDER BY updated_at, id`,
          ids ? [ids] : since ? [since] : [],
        );
        return rows.map((r): CloudRecord => ({
          id: r.id,
          kind: r.kind,
          payload: r.payload,
          revision: Number(r.revision),
          deleted: r.deleted,
          updatedAt: r.updated_at.toISOString(),
        }));
      },
      async write(op) {
        const rows = await request<{
          result: { revision?: number; conflict?: CloudRecord };
        }>(
          db,
          caller,
          "SELECT public.forge_write($1, $2, $3::jsonb, $4, $5) AS result",
          [op.id, op.kind, op.payload, op.revision, !!op.deleted],
        );
        const result = rows[0]!.result;
        return result.conflict
          ? { conflict: result.conflict }
          : { revision: Number(result.revision) };
      },
    });
    const here = phone(A);
    here.saveProfile({ onboarded: true });
    here.startWorkout("Push day");
    here.addJournal("measurement", {
      name: "Bodyweight",
      value: 80,
      unit: "kg",
    });
    const first = await synchronize(here, transport(as(A)), A);
    assert.equal(first.stopped, undefined);
    assert.ok(first.uploaded > 0);
    assert.equal(localSummary(here).unsynced, 0);
    // Another of A's devices downloads it all; B sees none of it.
    const there = phone(A);
    const second = await synchronize(there, transport(as(A)), A);
    assert.equal(second.stopped, undefined);
    assert.equal(second.downloaded, first.uploaded);
    assert.equal(localSummary(there).workouts, 1);
    assert.equal(localSummary(there).journal, 1);
    const other = phone(B);
    assert.equal((await synchronize(other, transport(as(B)), B)).downloaded, 0);
  } finally {
    await db.close();
  }
});

test("the rollback restores the previous behavior exactly", async () => {
  const db = await supabase([...migrations, ROLLBACK]);
  try {
    // As before Stage 3: any signed-in token of the account could delete it.
    await deleteAccount(
      db,
      as(A, {
        amr: [{ method: "password", timestamp: now() - 60 * MIN }],
        session: null,
      }),
    );
    assert.equal(await count(db, "auth.users", A), 0);
    const { rows } = await db.query<{ name: string; config: string[] }>(
      "SELECT proname AS name, proconfig AS config FROM pg_proc WHERE proname IN ('forge_write', 'forge_delete_account') ORDER BY 1",
    );
    assert.deepEqual(
      rows.map((r) => [r.name, r.config]),
      [
        ["forge_delete_account", ["search_path=public, auth, pg_temp"]],
        ["forge_write", ["search_path=public, pg_temp"]],
      ],
    );
    // Writes and reads behave as they did, anonymous claims included.
    assert.deepEqual(
      (await write(db, as(B, { anonymous: true }), "b"))[0]!.result,
      {
        revision: 1,
      },
    );
    // The unused table privileges stay removed, and the statements the
    // rollback gives for them restore the previous ones exactly.
    assert.deepEqual(await apiAcl(db), [
      { grantee: "authenticated", privilege: "SELECT" },
    ]);
    const restore = readFileSync(ROLLBACK, "utf8")
      .split("\n")
      .filter((line) => /^--\s+(grant|revoke) /.test(line))
      .map((line) => line.replace(/^--\s+/, ""));
    assert.equal(restore.length, 2);
    const before = await supabase([migrations[0]!]);
    try {
      await db.exec(restore.join("\n"));
      assert.deepEqual(await tableAcl(db), await tableAcl(before));
    } finally {
      await before.close();
    }
  } finally {
    await db.close();
  }
});

test("the app's deletion flow against the hardened server: stale asks to sign in again and removes nothing; fresh deletes", async () => {
  const db = await supabase();
  try {
    const here = phone(A);
    here.saveProfile({ onboarded: true });
    here.startWorkout("Push day");
    /** The RPC as supabase-js reports PostgREST's answer. */
    const rpcAs = (caller: Caller) => async () => {
      try {
        await deleteAccount(db, caller);
        return { error: null };
      } catch (e) {
        const { message, code, hint } = e as Record<string, string>;
        return { error: { message, code, hint } };
      }
    };
    const deps = (caller: Caller) => ({
      deleteInCloud: rpcAs(caller),
      currentUser: async () =>
        (await count(db, "auth.users", A)) ? { id: A } : { missing: true },
      signOut: async () => {},
    });
    const stale = as(A, {
      amr: [{ method: "oauth", timestamp: now() - 30 * MIN }],
    });
    assert.deepEqual(await deleteAccount_(here, deps(stale)), {
      kind: "reauthenticate",
    });
    assert.equal(pendingDeletion(here), undefined);
    assert.equal(localSummary(here).workouts, 1);
    assert.equal(await count(db, "auth.users", A), 1);
    // Confirmed again: a fresh sign-in on a live session.
    assert.deepEqual(await deleteAccount_(here, deps(as(A))), {
      kind: "deleted",
    });
    assert.equal(await count(db, "auth.users", A), 0);
    assert.equal(localSummary(here).workouts, 0);
    await intact(db, B, 0);
  } finally {
    await db.close();
  }
});

test("a caller's temporary objects can't stand in for the types the functions use", async () => {
  const db = await supabase();
  try {
    /**
     * One request whose caller first creates temporary tables named like
     * the types both functions use, in its own session.
     */
    const shadowed = (caller: Caller, sql: string) =>
      db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${caller.role}`);
        await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
          caller.role === "authenticated" ? JSON.stringify(caller.claims) : "",
        ]);
        for (const name of ["uuid", "jsonb", "text"])
          await tx.exec(`CREATE TEMP TABLE ${name} (x int) ON COMMIT DROP`);
        return (await tx.query(sql)).rows;
      });
    assert.deepEqual(
      await shadowed(
        as(A),
        "SELECT public.forge_write('x', 'journal', '{}'::pg_catalog.jsonb, 0, false) AS result",
      ),
      [{ result: { revision: 1 } }],
    );
    // Every check still holds: stale is refused, fresh deletes.
    await refusedAsStale(
      shadowed(
        as(A, { amr: [{ method: "password", timestamp: now() - 30 * MIN }] }),
        "SELECT public.forge_delete_account()",
      ),
    );
    await intact(db);
    await shadowed(
      as(A, { amr: [{ method: "password", timestamp: now() }] }),
      "SELECT public.forge_delete_account()",
    );
    assert.equal(await count(db, "auth.users", A), 0);
    await intact(db, B, 0);
  } finally {
    await db.close();
  }
});

// ---- Stage 6: adversarial requests against the hardened schema ----

test("Stage 6: direct changes to records are refused for every API role; another account's rows stay invisible", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "shared");
    await write(db, as(B), "shared");
    const attempts = [
      `INSERT INTO public.forge_records(user_id, id, kind, payload) VALUES ('${A}', 'direct', 'journal', '{}')`,
      `INSERT INTO public.forge_records(user_id, id, kind, payload) VALUES ('${B}', 'planted', 'journal', '{}')`,
      `UPDATE public.forge_records SET payload = '{"x":1}'`,
      `UPDATE public.forge_records SET user_id = '${A}' WHERE id = 'shared'`,
      "DELETE FROM public.forge_records",
      "TRUNCATE public.forge_records",
      // Only reading is granted, so no lock that could block the table.
      "LOCK TABLE public.forge_records IN ACCESS EXCLUSIVE MODE",
    ];
    for (const caller of [as(A), anon])
      for (const sql of attempts)
        await assert.rejects(
          request(db, caller, sql),
          /permission denied/i,
          sql,
        );
    // A asking for B's row by its owner and ID: nothing.
    assert.deepEqual(
      await request(
        db,
        as(A),
        `SELECT id FROM public.forge_records WHERE user_id = '${B}' AND id = 'shared'`,
      ),
      [],
    );
    await intact(db, A);
    await intact(db, B);
  } finally {
    await db.close();
  }
});

test("Stage 6: hostile record IDs and kinds are stored as data, or refused whole", async () => {
  const db = await supabase();
  try {
    const hostile = [
      "x'); DROP TABLE public.forge_records; --",
      "' OR '1'='1",
      '\\"; SELECT pg_sleep(1); --',
      "🏋️ José",
      "a".repeat(200),
    ];
    for (const id of hostile)
      assert.deepEqual(
        (await write(db, as(A), id))[0]!.result,
        { revision: 1 },
        id,
      );
    const ids = await request<{ id: string }>(
      db,
      as(A),
      "SELECT id FROM public.forge_records",
    );
    assert.deepEqual(ids.map((r) => r.id).sort(), [...hostile].sort());
    const refused = (sql: string, params: unknown[], pattern: RegExp) =>
      assert.rejects(request(db, as(A), sql, params), pattern, sql);
    const writeSql =
      "SELECT public.forge_write($1, $2, $3::jsonb, $4, false) AS result";
    await refused(
      writeSql,
      ["a".repeat(201), "journal", "{}", 0],
      /Invalid identity/,
    );
    await refused(writeSql, ["", "journal", "{}", 0], /Invalid identity/);
    await refused(
      writeSql,
      ["k", "journal'; --", "{}", 0],
      /violates check constraint/,
    );
    await refused(writeSql, ["k", "journal", "{}", -1], /Invalid revision/);
    await refused(
      writeSql,
      ["big", "journal", JSON.stringify({ x: "a".repeat(5_242_880) }), 0],
      /violates check constraint/,
    );
    // A record's kind can't change, so it can't be smuggled into another one.
    await refused(
      writeSql,
      [hostile[0], "workout", "{}", 1],
      /Record kind cannot change/,
    );
    assert.equal(await count(db, "public.forge_records", A), hostile.length);
    await intact(db, B, 0);
  } finally {
    await db.close();
  }
});

test("Stage 6: a deleted account's still-valid token can't write or read anything", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "x");
    await write(db, as(B), "x");
    const fresh = as(A, { amr: [{ method: "password", timestamp: now() }] });
    await deleteAccount(db, fresh);
    assert.equal(await count(db, "auth.users", A), 0);
    // The same token, before it expires.
    await assert.rejects(write(db, fresh, "after"), /violates foreign key/);
    assert.deepEqual(
      await request(db, fresh, "SELECT id FROM public.forge_records"),
      [],
    );
    assert.equal(await count(db, "public.forge_records", A), 0);
    await intact(db, B);
  } finally {
    await db.close();
  }
});

test("Stage 6: only Forge's two functions are exposed, none can rewrite a request's claims, and reading is the only policy", async () => {
  const db = await supabase();
  try {
    const { rows: functions } = await db.query<{
      name: string;
      source: string;
      anon: boolean;
    }>(
      `SELECT p.proname AS name, p.prosrc AS source,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1`,
    );
    assert.deepEqual(
      functions.map((f) => [f.name, f.anon]),
      [
        ["forge_delete_account", false],
        ["forge_write", false],
      ],
    );
    for (const f of functions)
      assert.doesNotMatch(
        f.source,
        /set_config|request\.jwt|\bset\s+(local\s+)?role\b|\bexecute\b/i,
        f.name,
      );
    const { rows: policies } = await db.query<{
      name: string;
      command: string;
      roles: string;
    }>(
      `SELECT polname AS name, polcmd::text AS command,
         polroles::regrole[]::text AS roles
       FROM pg_policy WHERE polrelid = 'public.forge_records'::regclass`,
    );
    assert.deepEqual(policies, [
      { name: "Read owned records", command: "r", roles: "{authenticated}" },
    ]);
  } finally {
    await db.close();
  }
});
