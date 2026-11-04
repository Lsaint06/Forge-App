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

// Phase 8.3B: supabase/verify/schema_summary.sql, the same readings as one
// statement with PASS or FAIL per row (the SQL editor shows only the last
// statement's result). Run in a read-only transaction, as an extra guard.
const SUMMARY = "supabase/verify/schema_summary.sql";
type SummaryRow = {
  n: number;
  check_name: string;
  expected: string;
  actual: string | null;
  result: "PASS" | "FAIL";
};
async function summary(db: PGlite) {
  return db.transaction(async (tx) => {
    await tx.exec("SET TRANSACTION READ ONLY");
    return (await tx.query<SummaryRow>(readFileSync(SUMMARY, "utf8"))).rows;
  });
}

test("the summary query passes only the hardened schema, and names what differs", async () => {
  const cases: [string, string[], Defaults, string, number[]][] = [
    [
      "hardened, 2026 defaults (FORGE DEV)",
      [BASELINE, HARDENING],
      "2026",
      "",
      [],
    ],
    ["hardened, earlier defaults", [BASELINE, HARDENING], "earlier", "", []],
    // The baseline: its policy, search paths and (with the earlier
    // defaults) its table privileges.
    ["baseline, 2026 defaults", [BASELINE], "2026", "", [10, 13, 14]],
    ["baseline, earlier defaults", [BASELINE], "earlier", "", [10, 11, 13, 14]],
    // The wrong project, or nothing applied yet.
    [
      "nothing applied",
      [],
      "2026",
      "",
      Array.from({ length: 16 }, (_, i) => i + 2),
    ],
    // Later drift: a direct-write privilege and an extra callable function.
    [
      "hardened, then drift",
      [BASELINE, HARDENING],
      "2026",
      `GRANT INSERT ON public.forge_records TO authenticated;
       CREATE FUNCTION public.stray() RETURNS int LANGUAGE sql AS 'SELECT 1';`,
      [11, 12],
    ],
    // Anonymous callers given the table, even read-only.
    [
      "hardened, then anon may read",
      [BASELINE, HARDENING],
      "2026",
      "GRANT SELECT ON public.forge_records TO anon;",
      [11],
    ],
    // The read policy simplified back to owner-only, letting anonymous
    // sign-ins read their own rows again.
    [
      "hardened, then the anonymous guard dropped",
      [BASELINE, HARDENING],
      "2026",
      `ALTER POLICY "Read owned records" ON public.forge_records
         USING (user_id = (SELECT auth.uid()));`,
      [10],
    ],
  ];
  for (const [name, files, defaults, drift, failing] of cases) {
    const db = await project(files, defaults);
    try {
      if (drift) await db.exec(drift);
      const rows = await summary(db);
      assert.equal(rows.length, 19, name);
      assert.deepEqual(
        rows.filter((r) => r.n > 0 && r.result === "FAIL").map((r) => r.n),
        failing,
        name,
      );
      const head = rows[0]!;
      assert.equal(head.check_name, "SUMMARY", name);
      assert.equal(
        head.actual,
        `${18 - failing.length} PASS, ${failing.length} FAIL`,
        name,
      );
      assert.equal(head.result, failing.length ? "FAIL" : "PASS", name);
    } finally {
      await db.close();
    }
  }
});

test("the summary query only reads: read-only transaction, nothing changed, no write statement", async () => {
  const db = await project([BASELINE, HARDENING], "2026");
  try {
    const snapshot = async () =>
      (
        await db.query<{ n: string }>(
          `SELECT md5(string_agg(x, '|' ORDER BY x)) AS n FROM (
             SELECT relname || coalesce(relacl::text, '') || relrowsecurity::text AS x FROM pg_class
               WHERE relnamespace IN ('public'::regnamespace, 'auth'::regnamespace)
             UNION ALL SELECT proname || coalesce(proconfig::text, '') || coalesce(proacl::text, '') FROM pg_proc
               WHERE pronamespace IN ('public'::regnamespace, 'auth'::regnamespace)
             UNION ALL SELECT polname || pg_get_expr(polqual, polrelid) FROM pg_policy) s`,
        )
      ).rows[0]!.n;
    const before = await snapshot();
    await summary(db);
    assert.equal(await snapshot(), before);
    // Outside its comments and quoted text, only reading words.
    const code = readFileSync(SUMMARY, "utf8")
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(
      code,
      /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|set_config|copy|call|do|lock|vacuum|comment|refresh|reset|set)\b/i,
    );
    assert.equal(code.split(";").filter((s) => s.trim()).length, 1);
  } finally {
    await db.close();
  }
});
