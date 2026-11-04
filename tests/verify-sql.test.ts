import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Phase 8: supabase/verify/schema_checks.sql, the read-only checks the
// founder runs in each project's SQL editor, tells the baseline schema
// (today's production) from the hardened one (the development project), as
// its comments say. PGlite is set up the way Supabase sets up a project:
// with its earlier default grants (production), or with its 2026 defaults,
// where tables and functions aren't granted to the API roles (FORGE DEV,
// Phase 8.2).

const BASELINE = "supabase/migrations/202610140001_forge.sql";
const HARDENING =
  "supabase/migrations/202611020001_forge_security_hardening.sql";

type Defaults = "earlier" | "2026";

async function project(files: string[], defaults: Defaults = "earlier") {
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
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`
      : // Nothing granted by default; functions not even to PUBLIC (the
        // stricter reading of "not exposed automatically").
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
  );
  for (const file of files) await db.exec(readFileSync(file, "utf8"));
  return db;
}

/** Each statement of the checks file, in order, and what it returns. */
async function runChecks(db: PGlite) {
  const statements = readFileSync("supabase/verify/schema_checks.sql", "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const results: Record<string, unknown>[][] = [];
  for (const sql of statements)
    results.push(
      (await db.query<Record<string, unknown>>(sql)).rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            Array.isArray(v) ? [...v] : v,
          ]),
        ),
      ),
    );
  return results;
}

const text = (v: unknown) =>
  Array.isArray(v) ? `{${v.join(",")}}` : String(v);

test("the checks file tells the baseline from the hardened schema, as documented", async () => {
  for (const [hardened, defaults] of [
    [false, "earlier"],
    [true, "earlier"],
    [false, "2026"],
    [true, "2026"],
  ] as const) {
    const db = await project(
      hardened ? [BASELINE, HARDENING] : [BASELINE],
      defaults,
    );
    try {
      const [fns, exec, acl, policy, owner, sessionColumns, exposed, version] =
        await runChecks(db);
      // 1. Security definer, and the fixed search path.
      assert.deepEqual(
        fns!.map((r) => [r.proname, r.prosecdef, text(r.proconfig)]),
        hardened
          ? [
              [
                "forge_delete_account",
                true,
                "{search_path=pg_catalog, pg_temp}",
              ],
              ["forge_write", true, "{search_path=pg_catalog, pg_temp}"],
            ]
          : [
              [
                "forge_delete_account",
                true,
                "{search_path=public, auth, pg_temp}",
              ],
              ["forge_write", true, "{search_path=public, pg_temp}"],
            ],
      );
      // 2. Only signed-in accounts run them.
      assert.deepEqual(
        exec!.map((r) => [r.proname, r.rolname, r.can_execute]),
        [
          ["forge_delete_account", "anon", false],
          ["forge_delete_account", "authenticated", true],
          ["forge_write", "anon", false],
          ["forge_write", "authenticated", true],
        ],
      );
      // 3. Exact privileges. With the 2026 defaults the baseline reads the
      // same as the hardened schema: queries 1 and 4 tell them apart.
      const rows = acl!.map((r) => `${r.grantee} ${r.privilege_type}`);
      if (hardened || defaults === "2026")
        assert.deepEqual(rows, ["authenticated SELECT"]);
      else
        for (const role of ["anon", "authenticated"])
          for (const privilege of [
            "REFERENCES",
            "SELECT",
            "TRIGGER",
            "TRUNCATE",
          ])
            assert.ok(
              rows.includes(`${role} ${privilege}`),
              `${role} ${privilege}`,
            );
      // 4. Row-level security and its one policy.
      assert.equal(policy!.length, 1);
      assert.equal(policy![0]!.rls_on, true);
      assert.equal(policy![0]!.polname, "Read owned records");
      assert.equal(policy![0]!.polcmd, "r");
      assert.equal(text(policy![0]!.roles), "{authenticated}");
      const using = String(policy![0]!.using_expression);
      if (hardened) {
        assert.match(using, /SELECT auth\.uid\(\)/);
        assert.match(using, /is_anonymous/);
      } else assert.equal(using, "(user_id = auth.uid())");
      // 5. What the hardened deletion relies on.
      assert.deepEqual(owner, [{ owner_reads_sessions: true }]);
      assert.deepEqual(
        sessionColumns!.map((r) => r.column_name),
        ["id", "not_after", "user_id"],
      );
      // 6. Nothing else exposed. 7. A version is reported.
      assert.deepEqual(
        exposed!.map((r) => r.proname),
        ["forge_delete_account", "forge_write"],
      );
      assert.equal(typeof version![0]!.postgres_major, "number");
    } finally {
      await db.close();
    }
  }
});

test("the checks file only reads: running it changes nothing", async () => {
  const db = await project([BASELINE, HARDENING]);
  try {
    const snapshot = async () =>
      (
        await db.query<{ n: string }>(
          "SELECT md5(string_agg(x, '|' ORDER BY x)) AS n FROM (SELECT relname || relacl::text AS x FROM pg_class WHERE relnamespace = 'public'::regnamespace UNION ALL SELECT proname || coalesce(proconfig::text, '') FROM pg_proc WHERE pronamespace = 'public'::regnamespace) s",
        )
      ).rows[0]!.n;
    const before = await snapshot();
    await runChecks(db);
    assert.equal(await snapshot(), before);
    const sql = readFileSync("supabase/verify/schema_checks.sql", "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(
      sql,
      /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|set_config)\b/i,
    );
  } finally {
    await db.close();
  }
});
