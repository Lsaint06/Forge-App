import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parseEntitlementResponse } from "../src/billing/entitlement";
import type { EntitlementRow } from "../supabase/functions/_shared/entitlement";
import {
  A,
  B,
  DAY,
  HOUR,
  PRODUCT,
  T0,
  answer,
  rowFor,
  type Sub,
} from "./billing-fixture";

// Phase 9.1: the entitlement draft (supabase/drafts/forge_entitlements.sql),
// verified in Postgres (PGlite) set up the way Supabase sets up a project,
// on top of Forge's two migrations, with Supabase's earlier default
// privileges (production) and its 2026 defaults (FORGE DEV). Each request
// runs as PostgREST runs one: a transaction in the caller's role, with its
// claims. The draft is never applied to a real project.

const BASELINE = "supabase/migrations/202610140001_forge.sql";
const HARDENING =
  "supabase/migrations/202611020001_forge_security_hardening.sql";
const DRAFT = "supabase/drafts/forge_entitlements.sql";
const ROLLBACK = "supabase/drafts/forge_entitlements_rollback.sql";
const CHECKS = "supabase/drafts/forge_entitlements_checks.sql";
const C = "00000000-0000-4000-8000-00000000000c";
const SESSION_A = "10000000-0000-4000-8000-00000000000a";
const SESSION_B = "10000000-0000-4000-8000-00000000000b";

type Defaults = "earlier" | "2026";
const DEFAULTS: Defaults[] = ["earlier", "2026"];

async function project(
  defaults: Defaults = "earlier",
  files = [BASELINE, HARDENING, DRAFT],
) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      not_after timestamptz
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `);
  await db.exec(
    defaults === "earlier"
      ? `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;`
      : // Nothing granted to the API roles; functions not even to PUBLIC.
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
  );
  for (const file of files) await db.exec(readFileSync(file, "utf8"));
  await db.exec(`
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}'), ('${C}');
    INSERT INTO auth.sessions(id, user_id) VALUES
      ('${SESSION_A}', '${A}'), ('${SESSION_B}', '${B}');
  `);
  return db;
}

type Caller = {
  role: "anon" | "authenticated" | "service_role";
  claims?: Record<string, unknown>;
};
const anon: Caller = { role: "anon" };
const service: Caller = {
  role: "service_role",
  claims: { role: "service_role" },
};
const seconds = () => Math.floor(Date.now() / 1000);
/** A recent, genuine sign-in, as Supabase Auth issues its claims. */
const as = (sub: string, extra: Record<string, unknown> = {}): Caller => ({
  role: "authenticated",
  claims: {
    sub,
    role: "authenticated",
    is_anonymous: false,
    session_id: sub === B ? SESSION_B : SESSION_A,
    amr: [{ method: "password", timestamp: seconds() - 60 }],
    iat: seconds(),
    exp: seconds() + 3600,
    ...extra,
  },
});

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
      caller.claims ? JSON.stringify(caller.claims) : "",
    ]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const refused = (p: Promise<unknown>) => assert.rejects(p, /permission denied/);

const COLUMNS = [
  "user_id",
  "status",
  "product_id",
  "store",
  "environment",
  "period_type",
  "purchased_at",
  "expires_at",
  "grace_expires_at",
  "access_until",
  "will_renew",
  "billing_issue_at",
  "revoked_at",
  "first_entitled_at",
  "source_event_id",
  "refreshed_at",
] as const;

/** The Edge Function's write: PostgREST's upsert, as the service role. */
const put = (db: PGlite, row: EntitlementRow, caller = service) =>
  request(
    db,
    caller,
    `INSERT INTO public.forge_entitlements (${COLUMNS.join(", ")})
     VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})
     ON CONFLICT (user_id) DO UPDATE SET ${COLUMNS.slice(1)
       .map((c) => `${c} = excluded.${c}`)
       .join(", ")}`,
    COLUMNS.map((c) => row[c]),
  );

/** The app's read: forge_entitlement(), with the account's session. */
const read = async (db: PGlite, caller: Caller) =>
  (
    await request<{ answer: { server_now: number } }>(
      db,
      caller,
      "SELECT public.forge_entitlement() AS answer",
    )
  )[0]!.answer;

/** The stored row, as the database owner sees it. */
const stored = async (db: PGlite, user = A) =>
  (
    await db.query<Record<string, unknown>>(
      "SELECT * FROM public.forge_entitlements WHERE user_id = $1",
      [user],
    )
  ).rows[0];
const count = async (db: PGlite, table: string, user: string) =>
  (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${table === "auth.users" ? "id" : "user_id"} = $1`,
      [user],
    )
  ).rows[0]!.n;

const TRIAL: Sub = { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true };
const PAID: Sub = { purchased: T0 - DAY, expires: T0 + 29 * DAY };
const iso = (ms: number) => new Date(ms).toISOString();

test("the draft is a draft: outside supabase/migrations and unknown to its checks", () => {
  assert.equal(existsSync(DRAFT), true);
  assert.match(readFileSync(DRAFT, "utf8"), /^-- Phase 9\.1 DRAFT/);
  for (const file of readdirSync("supabase/migrations"))
    assert.doesNotMatch(
      readFileSync(`supabase/migrations/${file}`, "utf8"),
      /forge_entitlement/,
      file,
    );
  assert.doesNotMatch(
    readFileSync("supabase/verify/schema_checks.sql", "utf8"),
    /forge_entitlement/,
  );
});

test("each account reads only its own record, with the server's clock", async () => {
  for (const defaults of DEFAULTS) {
    const db = await project(defaults);
    try {
      const a = rowFor(A, T0, { [PRODUCT]: TRIAL });
      const b = rowFor(B, T0, { [PRODUCT]: PAID });
      await put(db, a);
      await put(db, b);
      const before = Date.now();
      const mine = await read(db, as(A));
      assert.ok(Math.abs(mine.server_now - before) < 60_000, defaults);
      assert.deepEqual(mine, answer(A, mine.server_now, a), defaults);
      const parsed = parseEntitlementResponse(mine);
      assert.ok(parsed.ok);
      assert.equal(parsed.value.entitlement.status, "trial");
      const theirs = await read(db, as(B));
      assert.deepEqual(theirs, answer(B, theirs.server_now, b));
      // No record: never a member.
      const none = await read(db, as(C));
      assert.deepEqual(none, answer(C, none.server_now));
      // Through the Data API directly: still only the account's own row.
      assert.deepEqual(
        await request(
          db,
          as(A),
          "SELECT user_id, status FROM public.forge_entitlements",
        ),
        [{ user_id: A, status: "trial" }],
      );
    } finally {
      await db.close();
    }
  }
});

test("the Data API can neither change a membership nor see the webhook log", async () => {
  for (const defaults of DEFAULTS) {
    const db = await project(defaults);
    try {
      const a = rowFor(A, T0, { [PRODUCT]: TRIAL });
      await put(db, a);
      // Visitors without an account: nothing at all.
      await refused(
        request(db, anon, "SELECT * FROM public.forge_entitlements"),
      );
      await refused(
        request(db, anon, "SELECT * FROM public.forge_entitlement_events"),
      );
      await refused(request(db, anon, "SELECT public.forge_entitlement()"));
      // A signed-in account can't write its membership, or anyone's.
      await refused(put(db, { ...a, expires_at: iso(T0 + 365 * DAY) }, as(A)));
      await refused(
        request(
          db,
          as(A),
          "UPDATE public.forge_entitlements SET access_until = access_until + interval '1 year'",
        ),
      );
      await refused(
        request(
          db,
          as(A),
          `INSERT INTO public.forge_entitlements(user_id, status, refreshed_at) VALUES ('${C}', 'none', now())`,
        ),
      );
      await refused(
        request(db, as(A), "DELETE FROM public.forge_entitlements"),
      );
      await refused(request(db, as(A), "TRUNCATE public.forge_entitlements"));
      await refused(
        request(db, as(A), "SELECT * FROM public.forge_entitlement_events"),
      );
      await refused(
        request(
          db,
          as(A),
          "INSERT INTO public.forge_entitlement_events(id, type) VALUES ('evt', 'TEST')",
        ),
      );
      await refused(
        request(db, as(A), "SELECT public.forge_entitlements_guard()"),
      );
      // The Edge Functions never delete: records go only with the account.
      await refused(
        request(db, service, "DELETE FROM public.forge_entitlements"),
      );
      await refused(
        request(db, service, "TRUNCATE public.forge_entitlement_events"),
      );
      // An anonymous sign-in reads nothing, not even its own record.
      const anonymous = as(A, { is_anonymous: true });
      assert.equal(
        ((await read(db, anonymous)) as unknown as { entitlement: unknown })
          .entitlement,
        null,
      );
      assert.deepEqual(
        await request(
          db,
          anonymous,
          "SELECT user_id FROM public.forge_entitlements",
        ),
        [],
      );
      // Everything as it was.
      assert.equal((await stored(db))!.status, "trial");
      assert.equal(
        ((await stored(db))!.expires_at as Date).toISOString(),
        a.expires_at,
      );
    } finally {
      await db.close();
    }
  }
});

test("an older reading never wins, and a first membership is never forgotten", async () => {
  const db = await project();
  try {
    await put(db, rowFor(A, T0, { [PRODUCT]: TRIAL }));
    // A newer reading: cancelled during the free week.
    await put(
      db,
      rowFor(A, T0 + HOUR, {
        [PRODUCT]: { ...TRIAL, unsubscribed: T0 + HOUR },
      }),
    );
    // An older reading arriving late changes nothing.
    await put(db, rowFor(A, T0 - HOUR, {}));
    let row = (await stored(db))!;
    assert.equal(row.status, "trial");
    assert.equal(row.will_renew, false);
    assert.equal((row.refreshed_at as Date).toISOString(), iso(T0 + HOUR));
    // The membership moved to another account: none here, its start kept.
    await put(db, rowFor(A, T0 + 2 * HOUR, {}));
    row = (await stored(db))!;
    assert.equal(row.status, "none");
    assert.equal((row.first_entitled_at as Date).toISOString(), iso(T0 - DAY));
    // An earlier start (an older subscription transferred in) is kept…
    await put(
      db,
      rowFor(A, T0 + 3 * HOUR, {
        [PRODUCT]: { ...PAID, original: T0 - 90 * DAY },
      }),
    );
    assert.equal(
      ((await stored(db))!.first_entitled_at as Date).toISOString(),
      iso(T0 - 90 * DAY),
    );
    // …and a later one never replaces it.
    await put(
      db,
      rowFor(A, T0 + 4 * HOUR, {
        [PRODUCT]: { purchased: T0 + 4 * HOUR, expires: T0 + 34 * DAY },
      }),
    );
    row = (await stored(db))!;
    assert.equal(row.status, "active");
    assert.equal(
      (row.first_entitled_at as Date).toISOString(),
      iso(T0 - 90 * DAY),
    );
    // A record never moves to another account.
    await request(
      db,
      service,
      `UPDATE public.forge_entitlements SET user_id = '${C}'`,
    );
    assert.equal(await count(db, "public.forge_entitlements", A), 1);
    assert.equal(await count(db, "public.forge_entitlements", C), 0);
  } finally {
    await db.close();
  }
});

test("an inconsistent record is refused", async () => {
  const db = await project();
  try {
    const base = rowFor(A, T0, { [PRODUCT]: PAID });
    const bad: [string, Partial<Record<keyof EntitlementRow, unknown>>][] = [
      ["in force without an end", { access_until: null }],
      ["an end past the period", { access_until: iso(T0 + 60 * DAY) }],
      ["in force without a product", { product_id: null }],
      ["in force without a store", { store: null }],
      ["an unknown status", { status: "lifetime" }],
      ["another store", { store: "play_store" }],
      ["an unknown environment", { environment: "staging" }],
      ["an unknown period type", { period_type: "prepaid" }],
      ["access after expiry", { status: "expired" }],
      [
        "access while Apple retries",
        { status: "billing_retry", billing_issue_at: iso(T0) },
      ],
      [
        "a revocation without its time",
        { status: "revoked", access_until: null },
      ],
      ["a grace period without a billing issue", { status: "grace" }],
      [
        "a retry without a billing issue",
        { status: "billing_retry", access_until: null },
      ],
      ["a membership without a start", { first_entitled_at: null }],
      ["no reading time", { refreshed_at: null }],
      ["an empty product", { product_id: "" }],
    ];
    for (const [name, change] of bad)
      await assert.rejects(
        put(db, { ...base, ...change } as EntitlementRow),
        /violates/,
        name,
      );
    assert.equal(await count(db, "public.forge_entitlements", A), 0);
    // Every status the server writes is accepted.
    for (const sub of [
      undefined,
      TRIAL,
      PAID,
      {
        purchased: T0 - 31 * DAY,
        expires: T0 - DAY,
        billingIssue: T0 - DAY,
        grace: T0 + DAY,
      },
      { purchased: T0 - 31 * DAY, expires: T0 - DAY, billingIssue: T0 - DAY },
      { purchased: T0 - 31 * DAY, expires: T0 - DAY },
      { ...PAID, refunded: T0 },
    ]) {
      await db.exec("DELETE FROM public.forge_entitlements");
      const row = rowFor(A, T0, sub ? { [PRODUCT]: sub } : {});
      await put(db, row);
      const back = await read(db, as(A));
      assert.deepEqual(back, answer(A, back.server_now, row), row.status);
      assert.ok(parseEntitlementResponse(back).ok, row.status);
    }
  } finally {
    await db.close();
  }
});

test("webhook deliveries are recorded once each", async () => {
  const db = await project("2026");
  try {
    const record = (id: string, user: string | null) =>
      request(
        db,
        service,
        `INSERT INTO public.forge_entitlement_events(id, type, environment, user_id, event_at)
         VALUES ($1, 'INITIAL_PURCHASE', 'sandbox', $2, now())
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, user],
      );
    assert.equal((await record("evt-1", A)).length, 1);
    // RevenueCat's retry, with the same event ID: nothing new.
    assert.equal((await record("evt-1", A)).length, 0);
    await request(
      db,
      service,
      "UPDATE public.forge_entitlement_events SET processed_at = now() WHERE id = 'evt-1'",
    );
    // An App User ID that is no account here is recorded without one.
    assert.equal((await record("evt-2", null)).length, 1);
    await assert.rejects(
      record("evt-3", "00000000-0000-4000-8000-0000000000ff"),
      /violates/,
    );
    const rows = await db.query<{ id: string; processed: boolean }>(
      "SELECT id, processed_at IS NOT NULL AS processed FROM public.forge_entitlement_events ORDER BY id",
    );
    assert.deepEqual(rows.rows, [
      { id: "evt-1", processed: true },
      { id: "evt-2", processed: false },
    ]);
  } finally {
    await db.close();
  }
});

test("expiry deletes nothing; records go only with the account itself", async () => {
  const db = await project();
  try {
    const write = (user: string, id: string) =>
      request(
        db,
        as(user),
        "SELECT public.forge_write($1, 'journal', '{}'::jsonb, 0, false)",
        [id],
      );
    await write(A, "a1");
    await write(B, "b1");
    await put(db, rowFor(A, T0, { [PRODUCT]: TRIAL }));
    await put(db, rowFor(B, T0, { [PRODUCT]: PAID }));
    for (const [id, user] of [
      ["evt-a", A],
      ["evt-b", B],
    ])
      await request(
        db,
        service,
        "INSERT INTO public.forge_entitlement_events(id, type, user_id) VALUES ($1, 'RENEWAL', $2)",
        [id, user],
      );
    // A's free week ends: the record says so, and A's training stays.
    await put(
      db,
      rowFor(A, T0 + 7 * DAY, { [PRODUCT]: { ...TRIAL, unsubscribed: T0 } }),
    );
    assert.equal((await stored(db))!.status, "expired");
    assert.equal(await count(db, "public.forge_records", A), 1);
    // A deletes the account (a recent, genuine sign-in): everything of A's goes.
    await request(db, as(A), "SELECT public.forge_delete_account()");
    for (const table of [
      "auth.users",
      "public.forge_records",
      "public.forge_entitlements",
      "public.forge_entitlement_events",
    ])
      assert.equal(await count(db, table, A), 0, table);
    // B's account is untouched.
    for (const table of [
      "auth.users",
      "public.forge_records",
      "public.forge_entitlements",
      "public.forge_entitlement_events",
    ])
      assert.equal(await count(db, table, B), 1, table);
  } finally {
    await db.close();
  }
});

/** Everything in public, with its privileges and settings. */
const catalog = async (db: PGlite) =>
  (
    await db.query<{ x: string }>(
      `SELECT x FROM (
         SELECT 'rel ' || relname || ' ' || coalesce(relacl::text, '') AS x FROM pg_class WHERE relnamespace = 'public'::regnamespace
         UNION ALL SELECT 'fn ' || proname || ' ' || coalesce(proconfig::text, '') || ' ' || coalesce(proacl::text, '') FROM pg_proc WHERE pronamespace = 'public'::regnamespace
         UNION ALL SELECT 'policy ' || polname || ' ' || polrelid::regclass::text FROM pg_policy
         UNION ALL SELECT 'trigger ' || tgname FROM pg_trigger WHERE NOT tgisinternal
       ) s ORDER BY x`,
    )
  ).rows.map((r) => r.x);

test("the rollback removes exactly what the draft added; the draft applies again", async () => {
  for (const defaults of DEFAULTS) {
    const without = await project(defaults, [BASELINE, HARDENING]);
    const db = await project(defaults);
    try {
      await request(
        db,
        as(A),
        "SELECT public.forge_write('a1', 'journal', '{}'::jsonb, 0, false)",
      );
      await put(db, rowFor(A, T0, { [PRODUCT]: TRIAL }));
      await db.exec(readFileSync(ROLLBACK, "utf8"));
      assert.deepEqual(await catalog(db), await catalog(without), defaults);
      // Training data untouched.
      assert.equal(await count(db, "public.forge_records", A), 1);
      // Running it again is harmless, and the draft applies again.
      await db.exec(readFileSync(ROLLBACK, "utf8"));
      await db.exec(readFileSync(DRAFT, "utf8"));
      await put(db, rowFor(A, T0, { [PRODUCT]: TRIAL }));
      assert.equal(
        (
          (await read(db, as(A))) as unknown as {
            entitlement: { status: string };
          }
        ).entitlement.status,
        "trial",
      );
    } finally {
      await without.close();
      await db.close();
    }
  }
});

/** Each statement of the checks file, in order, and what it returns. */
async function runChecks(db: PGlite) {
  const statements = readFileSync(CHECKS, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const results: Record<string, unknown>[][] = [];
  for (const sql of statements)
    results.push((await db.query<Record<string, unknown>>(sql)).rows);
  return results;
}
const text = (v: unknown) =>
  Array.isArray(v) ? `{${v.join(",")}}` : String(v);

test("the checks file reads only, and shows what it documents", async () => {
  for (const defaults of DEFAULTS) {
    const db = await project(defaults);
    try {
      const before = await catalog(db);
      const [tables, acl, policies, fns, triggers, keys] = await runChecks(db);
      assert.deepEqual(await catalog(db), before);
      // 1. Both tables, row level security on.
      assert.deepEqual(tables, [
        { relname: "forge_entitlement_events", rls_on: true },
        { relname: "forge_entitlements", rls_on: true },
      ]);
      // 2. Exactly these privileges, whatever Supabase's defaults.
      assert.deepEqual(
        acl!.map((r) => `${r.relname} ${r.grantee} ${r.privilege_type}`),
        [
          "forge_entitlement_events service_role INSERT",
          "forge_entitlement_events service_role SELECT",
          "forge_entitlement_events service_role UPDATE",
          "forge_entitlements authenticated SELECT",
          "forge_entitlements service_role INSERT",
          "forge_entitlements service_role SELECT",
          "forge_entitlements service_role UPDATE",
        ],
        defaults,
      );
      // 3. One policy.
      assert.deepEqual(
        policies!.map((r) => [r.relname, r.polname, r.polcmd, text(r.roles)]),
        [
          [
            "forge_entitlements",
            "Read own entitlement",
            "r",
            "{authenticated}",
          ],
        ],
      );
      // 4. The functions.
      assert.deepEqual(
        fns!.map((r) => [
          r.proname,
          r.prosecdef,
          text(r.proconfig),
          r.rolname,
          r.can_execute,
        ]),
        [
          [
            "forge_entitlement",
            false,
            "{search_path=pg_catalog, pg_temp}",
            "anon",
            false,
          ],
          [
            "forge_entitlement",
            false,
            "{search_path=pg_catalog, pg_temp}",
            "authenticated",
            true,
          ],
          [
            "forge_entitlements_guard",
            false,
            "{search_path=pg_catalog, pg_temp}",
            "anon",
            false,
          ],
          [
            "forge_entitlements_guard",
            false,
            "{search_path=pg_catalog, pg_temp}",
            "authenticated",
            false,
          ],
        ],
        defaults,
      );
      // 5. The guard. 6. Records go with their account.
      assert.deepEqual(triggers, [
        { tgname: "forge_entitlements_guard", tgenabled: "O" },
      ]);
      assert.deepEqual(keys, [
        { relname: "forge_entitlement_events", confdeltype: "c" },
        { relname: "forge_entitlements", confdeltype: "c" },
      ]);
    } finally {
      await db.close();
    }
  }
  const sql = readFileSync(CHECKS, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(
    sql,
    /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|set_config)\b/i,
  );
});
