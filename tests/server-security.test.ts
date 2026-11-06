import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Phase 7.8E, Stage 1: what the existing, unchanged Supabase migration
// guarantees, in Postgres (PGlite) set up the way Supabase sets up a
// project: its API roles, `auth.uid()` read from the request's JWT claims,
// and its default privileges for new objects in `public`. Each request runs
// as PostgREST runs one: a transaction in the caller's role. Nothing here
// changes or deploys server SQL; the live project is checked separately with
// the read-only Stage 0 report.

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

type Caller = { role: "anon" } | { role: "authenticated"; sub?: string };
const anon: Caller = { role: "anon" };
/** A signed-in request; without `sub`, a token that names no user. */
const as = (sub?: string): Caller => ({ role: "authenticated", sub });

async function supabase() {
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
    -- As Supabase defines it: the caller is the subject of the request's JWT.
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    -- Supabase's default privileges for new objects in public.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `);
  await db.exec(
    readFileSync("supabase/migrations/202610140001_forge.sql", "utf8"),
  );
  await db.exec(`
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}');
    INSERT INTO auth.identities VALUES
      ('00000000-0000-0000-0000-0000000000a1', '${A}', 'google'),
      ('00000000-0000-0000-0000-0000000000b1', '${B}', 'email');
  `);
  return db;
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
    const claims =
      caller.role === "authenticated" && caller.sub
        ? JSON.stringify({ sub: caller.sub, role: "authenticated" })
        : "";
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      claims,
    ]);
    return (await tx.query<T>(sql, params)).rows;
  });
}

type WriteResult = {
  revision?: number;
  conflict?: { id: string | null; payload: unknown; revision: number | null };
};
async function write(
  db: PGlite,
  caller: Caller,
  id: string,
  kind: string,
  payload: unknown,
  base: number,
  deleted = false,
) {
  const rows = await request<{ result: WriteResult }>(
    db,
    caller,
    "SELECT public.forge_write($1, $2, $3::jsonb, $4, $5) AS result",
    [id, kind, JSON.stringify(payload), base, deleted],
  );
  return rows[0]!.result;
}

type Row = { id: string; owner: string; revision: number; payload: unknown };
const read = (db: PGlite, caller: Caller, where = "") =>
  request<Row>(
    db,
    caller,
    `SELECT id, user_id::text AS owner, revision::int AS revision, payload FROM public.forge_records ${where} ORDER BY id`,
  );
/** As the database owner (the dashboard's SQL editor): every account's rows. */
const owned = async (db: PGlite) =>
  (
    await db.query<{ owner: string; id: string }>(
      "SELECT user_id::text AS owner, id FROM public.forge_records ORDER BY user_id, id",
    )
  ).rows;
const users = async (db: PGlite) =>
  (await db.query<{ id: string }>("SELECT id::text FROM auth.users ORDER BY 1"))
    .rows;

test("two accounts keep separate records under the same ID", async () => {
  const db = await supabase();
  try {
    assert.deepEqual(
      await write(db, as(A), "shared", "journal", { owner: "A" }, 0),
      {
        revision: 1,
      },
    );
    // B's record with the same ID is B's own, not a conflict with A's.
    assert.deepEqual(
      await write(db, as(B), "shared", "journal", { owner: "B" }, 0),
      {
        revision: 1,
      },
    );
    assert.deepEqual(
      await write(db, as(A), "shared", "journal", { owner: "A", v: 2 }, 1),
      { revision: 2 },
    );
    assert.deepEqual(await read(db, as(A)), [
      { id: "shared", owner: A, revision: 2, payload: { owner: "A", v: 2 } },
    ]);
    assert.deepEqual(await read(db, as(B)), [
      { id: "shared", owner: B, revision: 1, payload: { owner: "B" } },
    ]);
    // Asking for the other account's rows by name returns nothing.
    assert.deepEqual(await read(db, as(B), `WHERE user_id = '${A}'`), []);
    // A conflict only ever reports the caller's own record…
    const stale = await write(db, as(B), "shared", "journal", {}, 2);
    assert.equal(stale.conflict?.revision, 1);
    assert.deepEqual(stale.conflict?.payload, { owner: "B" });
    // …and an ID only another account uses looks empty.
    await write(db, as(A), "only-a", "journal", { secret: 1 }, 0);
    const probe = await write(db, as(B), "only-a", "journal", {}, 1);
    assert.deepEqual(probe.conflict, {
      id: null,
      kind: null,
      payload: null,
      revision: null,
      deleted: null,
    });
    assert.deepEqual(await owned(db), [
      { owner: A, id: "only-a" },
      { owner: A, id: "shared" },
      { owner: B, id: "shared" },
    ]);
  } finally {
    await db.close();
  }
});

test("a caller can only ever write as themselves", async () => {
  const db = await supabase();
  try {
    // forge_write takes no owner: it's always the caller.
    const [sig] = (
      await db.query<{ args: string }>(
        "SELECT pg_get_function_identity_arguments('public.forge_write(text,text,jsonb,bigint,boolean)'::regprocedure) AS args",
      )
    ).rows;
    assert.equal(
      sig!.args,
      "record_id text, record_kind text, record_payload jsonb, base_revision bigint, is_deleted boolean",
    );
    // An owner named in the payload is only data.
    await write(db, as(A), "spoof", "journal", { user_id: B }, 0);
    assert.deepEqual(await owned(db), [{ owner: A, id: "spoof" }]);
    assert.deepEqual(await read(db, as(B)), []);
  } finally {
    await db.close();
  }
});

test("no API role can change the table directly", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1", "journal", { v: 1 }, 0);
    for (const caller of [anon, as(A), as(B)])
      for (const sql of [
        `INSERT INTO public.forge_records(user_id, id, kind, payload) VALUES ('${A}', 'direct', 'journal', '{}')`,
        "UPDATE public.forge_records SET revision = 99",
        "DELETE FROM public.forge_records",
      ])
        await assert.rejects(
          () => request(db, caller, sql),
          /permission denied/i,
        );
    assert.deepEqual(await read(db, as(A)), [
      { id: "a1", owner: A, revision: 1, payload: { v: 1 } },
    ]);
  } finally {
    await db.close();
  }
});

test("signed-out callers see nothing and can't call Forge's functions", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1", "journal", { secret: true }, 0);
    assert.deepEqual(await read(db, anon), []);
    await assert.rejects(
      () => write(db, anon, "x", "journal", {}, 0),
      /permission denied/i,
    );
    await assert.rejects(
      () => request(db, anon, "SELECT public.forge_delete_account()"),
      /permission denied/i,
    );
    assert.deepEqual(await owned(db), [{ owner: A, id: "a1" }]);
    assert.equal((await users(db)).length, 2);
  } finally {
    await db.close();
  }
});

test("a signed-in request that names no user is refused", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1", "journal", {}, 0);
    await assert.rejects(
      () => write(db, as(), "x", "journal", {}, 0),
      /Authentication required/,
    );
    await assert.rejects(
      () => request(db, as(), "SELECT public.forge_delete_account()"),
      /Authentication required/,
    );
    assert.deepEqual(await read(db, as()), []);
    assert.equal((await users(db)).length, 2);
  } finally {
    await db.close();
  }
});

// Baseline (7.8A L2 / 7.8E L6): besides SELECT for signed-in users, the
// migration leaves Supabase's default grants of SELECT to anon and of
// TRUNCATE, REFERENCES and TRIGGER to both API roles. None is reachable
// through Supabase's Data API (row-level security returns no rows to anon,
// and the API has no TRUNCATE). The planned server migration (E7) revokes
// them, and this test changes with it. Check 6 of the Stage 0 report shows
// the live project's actual grants.
test("baseline: privileges and policies the migration leaves under Supabase's defaults", async () => {
  const db = await supabase();
  try {
    const kinds = [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ];
    const privileges = (
      await db.query(
        `SELECT r.rolname AS role, ${kinds.map((k) => `has_table_privilege(r.rolname, 'public.forge_records', '${k}') AS ${k.toLowerCase()}`).join(", ")} FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated') ORDER BY 1`,
      )
    ).rows;
    const extra = { truncate: true, references: true, trigger: true };
    assert.deepEqual(privileges, [
      {
        role: "anon",
        select: true,
        insert: false,
        update: false,
        delete: false,
        ...extra,
      },
      {
        role: "authenticated",
        select: true,
        insert: false,
        update: false,
        delete: false,
        ...extra,
      },
    ]);
    const functions = (
      await db.query(
        "SELECT p.proname AS name, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated, p.prosecdef AS definer, p.proconfig AS settings FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1",
      )
    ).rows;
    assert.deepEqual(functions, [
      {
        name: "forge_delete_account",
        anon: false,
        authenticated: true,
        definer: true,
        settings: ["search_path=public, auth, pg_temp"],
      },
      {
        name: "forge_write",
        anon: false,
        authenticated: true,
        definer: true,
        settings: ["search_path=public, pg_temp"],
      },
    ]);
    // Row-level security is on; the only policy lets the owner read.
    const [rls] = (
      await db.query<{ on: boolean }>(
        "SELECT relrowsecurity AS on FROM pg_class WHERE oid = 'public.forge_records'::regclass",
      )
    ).rows;
    assert.equal(rls!.on, true);
    assert.deepEqual(
      (
        await db.query(
          "SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'forge_records'",
        )
      ).rows,
      [
        {
          policyname: "Read owned records",
          cmd: "SELECT",
          roles: ["authenticated"],
          qual: "(user_id = auth.uid())",
        },
      ],
    );
  } finally {
    await db.close();
  }
});

test("deleting an account removes its cloud records and only its own", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1", "journal", {}, 0);
    await write(db, as(A), "shared", "profile", {}, 0);
    await write(db, as(B), "b1", "journal", {}, 0);
    await write(db, as(B), "shared", "profile", {}, 0);
    await request(db, as(A), "SELECT public.forge_delete_account()");
    assert.deepEqual(await users(db), [{ id: B }]);
    assert.deepEqual(
      (
        await db.query(
          "SELECT user_id::text AS owner, provider FROM auth.identities",
        )
      ).rows,
      [{ owner: B, provider: "email" }],
    );
    assert.deepEqual(await owned(db), [
      { owner: B, id: "b1" },
      { owner: B, id: "shared" },
    ]);
  } finally {
    await db.close();
  }
});

test("a deleted account's still-valid sign-in can't write or read, and deleting again is harmless", async () => {
  const db = await supabase();
  try {
    await write(db, as(A), "a1", "journal", {}, 0);
    await write(db, as(B), "b1", "journal", {}, 0);
    await request(db, as(A), "SELECT public.forge_delete_account()");
    // Its access token stays valid until it expires; the database refuses
    // anything written in the deleted account's name.
    await assert.rejects(
      () => write(db, as(A), "after", "journal", {}, 0),
      /foreign key/i,
    );
    assert.deepEqual(await read(db, as(A)), []);
    // A retry after a lost reply changes nothing else.
    await request(db, as(A), "SELECT public.forge_delete_account()");
    assert.deepEqual(await users(db), [{ id: B }]);
    assert.deepEqual(await owned(db), [{ owner: B, id: "b1" }]);
  } finally {
    await db.close();
  }
});

test("identities, revisions, kinds and sizes stay within the migration's limits", async () => {
  const db = await supabase();
  try {
    const refused = (id: string, kind: string, base: number, re: RegExp) =>
      assert.rejects(() => write(db, as(A), id, kind, {}, base), re);
    await refused("", "journal", 0, /Invalid identity/);
    await refused("x".repeat(201), "journal", 0, /Invalid identity/);
    await refused("neg", "journal", -1, /Invalid revision/);
    await refused("x", "other", 0, /forge_records_kind_check/);
    await write(db, as(A), "k", "journal", {}, 0);
    await refused("k", "workout", 1, /Record kind cannot change/);
    // Over 5 MB.
    await assert.rejects(
      () =>
        request(
          db,
          as(A),
          "SELECT public.forge_write('big', 'journal', to_jsonb(repeat('x', 5242880)), 0, false)",
        ),
      /forge_records_payload_check/,
    );
    assert.deepEqual(await owned(db), [{ owner: A, id: "k" }]);
  } finally {
    await db.close();
  }
});
