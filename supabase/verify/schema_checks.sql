-- Read-only checks of Forge's Supabase schema (Phase 7.8E Stage 3, Phase 8).
-- Paste into the SQL editor of the project being checked, ONE QUERY AT A
-- TIME: the editor shows only the last statement's result. For every check
-- in one result, with PASS or FAIL, use schema_summary.sql instead. Nothing
-- here changes anything. Each query notes what to expect:
--   BASELINE: 202610140001_forge.sql only (today's production project);
--   HARDENED: plus 202611020001_forge_security_hardening.sql (development).
-- Projects created since Supabase's 2026 change grant the API roles nothing
-- by default (FORGE DEV is one): there query 3 reads the same for both, and
-- queries 1 and 4 tell them apart.
-- Verified against both schemas, with Supabase's earlier and 2026 defaults,
-- in tests/verify-sql.test.ts.

-- 1. Forge's functions: security definer, and their fixed search path.
select proname, prosecdef, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('forge_write', 'forge_delete_account')
order by proname;
-- BASELINE: forge_delete_account | true | {search_path=public, auth, pg_temp}
--           forge_write          | true | {search_path=public, pg_temp}
-- HARDENED: both                 | true | {search_path=pg_catalog, pg_temp}

-- 2. Who may run them.
select p.proname, r.rolname,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p
cross join (values ('anon'), ('authenticated')) as r(rolname)
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('forge_write', 'forge_delete_account')
order by 1, 2;
-- BOTH: anon false; authenticated true, for each function.

-- 3. The API roles' privileges on the records table, exactly.
select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
  a.privilege_type
from pg_class c, aclexplode(c.relacl) a
where c.oid = 'public.forge_records'::regclass
  and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated'))
order by 1, 2;
-- BASELINE, with Supabase's earlier default grants (production): anon and
--           authenticated each: REFERENCES, SELECT, TRIGGER, TRUNCATE (and
--           MAINTAIN on Postgres 17).
-- BASELINE on a project created since the 2026 change, and HARDENED
--           everywhere: one row: authenticated | SELECT.

-- 4. Row-level security, and its only policy.
select c.relrowsecurity as rls_on,
  p.polname, p.polcmd, p.polroles::regrole[] as roles,
  pg_get_expr(p.polqual, p.polrelid) as using_expression
from pg_class c
join pg_policy p on p.polrelid = c.oid
where c.oid = 'public.forge_records'::regclass;
-- BOTH: one row: true | Read owned records | r | {authenticated}.
-- BASELINE: using (user_id = auth.uid()).
-- HARDENED: using user_id = (select auth.uid()), and not an anonymous
--           sign-in (is_anonymous).

-- 5. What the hardened deletion relies on.
select has_table_privilege('postgres', 'auth.sessions', 'SELECT') as owner_reads_sessions;
-- BOTH: true.
select column_name
from information_schema.columns
where table_schema = 'auth' and table_name = 'sessions'
  and column_name in ('id', 'not_after', 'user_id')
order by 1;
-- BOTH: three rows: id, not_after, user_id.

-- 6. Nothing else exposed in public that could run as a request.
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
order by 1;
-- BOTH: forge_delete_account, forge_write (and nothing that sets
--       request.jwt.* claims).

-- 7. The Postgres version (15 or 17; the hardening handles both).
select current_setting('server_version_num')::int / 10000 as postgres_major;
