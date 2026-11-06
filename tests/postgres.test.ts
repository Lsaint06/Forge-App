import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("Supabase migration enforces RLS, CAS writes and owned account deletion in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`,
    );
    await db.exec(
      readFileSync("supabase/migrations/202610140001_forge.sql", "utf8"),
    );
    const a = "00000000-0000-0000-0000-000000000001",
      b = "00000000-0000-0000-0000-000000000002";
    await db.exec(
      `INSERT INTO auth.users(id) VALUES('${a}'),('${b}');SET ROLE authenticated;SET test.user_id='${a}';`,
    );
    const write = await db.query<{ result: { revision: number } }>(
      `SELECT public.forge_write('test-record','journal','{"data":"private"}'::jsonb,0,false) AS result`,
    );
    assert.equal(write.rows[0]!.result.revision, 1);
    const conflict = await db.query<{
      result: { conflict: { revision: number } };
    }>(
      `SELECT public.forge_write('test-record','journal','{}'::jsonb,0,false) AS result`,
    );
    assert.equal(conflict.rows[0]!.result.conflict.revision, 1);
    await assert.rejects(
      () => db.exec(`UPDATE public.forge_records SET revision=99`),
      /permission denied/i,
    );
    await db.exec(`SET test.user_id='${b}';`);
    assert.equal(
      (await db.query("SELECT * FROM public.forge_records")).rows.length,
      0,
    );
    await db.exec(`SELECT public.forge_delete_account();RESET ROLE;`);
    assert.equal(
      (await db.query(`SELECT id FROM auth.users WHERE id='${b}'`)).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`SELECT id FROM auth.users WHERE id='${a}'`)).rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT * FROM public.forge_records")).rows.length,
      1,
    );
    await db.exec("SET ROLE anon;");
    await assert.rejects(
      () =>
        db.exec(
          `SELECT public.forge_write('unauthorized','journal','{}',0,false)`,
        ),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});
