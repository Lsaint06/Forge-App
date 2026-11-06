-- Forge's schema in one read-only query (Phase 8.3B): PASS or FAIL per check,
-- with a summary first. Nothing here changes anything.
--
-- How: paste ALL of this file into ONE new tab of the project's SQL editor
-- and Run once. Row 0 should read "18 PASS, 0 FAIL".
-- (The SQL editor shows only the last statement's result, so the checks are
-- one statement. For the detailed readings, run schema_checks.sql one query
-- at a time.)
--
-- Expects the hardened schema: 202610140001_forge.sql, then
-- 202611020001_forge_security_hardening.sql (FORGE DEV since Nov 3, 2026;
-- production only after its approval, E7). On the baseline alone, rows 10,
-- 13 and 14 read FAIL, and row 11 too on a project with Supabase's earlier
-- default grants: that is the baseline, not damage.
--
-- When a later phase adds a function to the public schema, add it to row
-- 12's expected list (and to query 6 of schema_checks.sql), with its own
-- checks. Verified in tests/verify-sql.test.ts against both schemas,
-- Supabase's earlier and 2026 defaults, an empty project and later drift.
with
t as (
  select to_regclass('public.forge_records') as rel
),
fns as (
  select p.oid,
    p.proname::text as proname,
    case when p.prosecdef then 'security definer' else 'security invoker' end
      || ' | ' || coalesce(array_to_string(p.proconfig, '; '), 'no settings')
      || ' | owner ' || pg_get_userbyid(p.proowner)::text as setup,
    'anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
      || ', authenticated ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
      || ', public ' || has_function_privilege('public', p.oid, 'EXECUTE')::text as runs,
    has_table_privilege(p.proowner, 'auth.users', 'DELETE')
      and has_table_privilege(p.proowner, 'auth.sessions', 'SELECT') as owner_rights
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
),
pol as (
  select p.polname::text || ' | ' || p.polcmd::text || ' | '
      || case when p.polpermissive then 'permissive' else 'restrictive' end
      || ' | ' || p.polroles::regrole[]::text as summary,
    pg_get_expr(p.polqual, p.polrelid) as using_expr
  from pg_policy p
  join t on p.polrelid = t.rel
),
checks (n, check_name, expected, actual, pass) as (
  select 1, 'Postgres major version', '15 or later',
    (current_setting('server_version_num')::int / 10000)::text,
    current_setting('server_version_num')::int >= 150000
  union all
  select 2, 'forge_records exists, row-level security on', 'true',
    coalesce((select c.relrowsecurity::text from pg_class c join t on c.oid = t.rel), 'table missing'), null::boolean
  union all
  select 3, 'forge_records columns',
    'user_id uuid, id text, kind text, payload jsonb, revision bigint, deleted boolean, created_at timestamp with time zone, updated_at timestamp with time zone',
    (select string_agg(a.attname::text || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
       from pg_attribute a join t on a.attrelid = t.rel
       where a.attnum > 0 and not a.attisdropped), null
  union all
  select 4, 'Primary key', 'PRIMARY KEY (user_id, id)',
    (select string_agg(pg_get_constraintdef(k.oid), '; ')
       from pg_constraint k join t on k.conrelid = t.rel where k.contype = 'p'), null
  union all
  select 5, 'Owner link: deleting an account deletes its records', 'auth.users, on delete cascade',
    (select string_agg(ns.nspname::text || '.' || c.relname::text || ', on delete '
         || case k.confdeltype when 'c' then 'cascade' else k.confdeltype::text end, '; ')
       from pg_constraint k join t on k.conrelid = t.rel
       join pg_class c on c.oid = k.confrelid
       join pg_namespace ns on ns.oid = c.relnamespace
       where k.contype = 'f'), null
  union all
  select 6, 'Check constraints (kind, revision, payload size)', '3',
    case when (select rel from t) is null then 'table missing'
      else (select count(*)::text from pg_constraint k join t on k.conrelid = t.rel where k.contype = 'c')
    end, null
  union all
  select 7, 'Indexes', 'forge_records_pkey, forge_records_user_updated',
    (select string_agg(c.relname::text, ', ' order by c.relname)
       from pg_index i join t on i.indrelid = t.rel join pg_class c on c.oid = i.indexrelid), null
  union all
  select 8, 'Triggers on forge_records (none by design)', '0',
    case when (select rel from t) is null then 'table missing'
      else (select count(*)::text from pg_trigger g join t on g.tgrelid = t.rel where not g.tgisinternal)
    end, null
  union all
  select 9, 'Policies on forge_records', 'Read owned records | r | permissive | {authenticated}',
    (select string_agg(summary, '; ') from pol), null
  union all
  select 10, 'Read policy is the hardened one',
    'own rows via (SELECT auth.uid()), and anonymous sign-ins refused',
    (select string_agg(using_expr, '; ') from pol),
    (select count(*) = 1
       and coalesce(bool_and(using_expr ~ 'SELECT (auth\.)?uid\(\)' and using_expr ~ 'is_anonymous'), false)
     from pol)
  union all
  select 11, 'API roles'' privileges on forge_records', 'authenticated SELECT',
    coalesce((select string_agg(g, ', ' order by g) from (
       select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
           || ' ' || a.privilege_type as g
       from pg_class c join t on c.oid = t.rel
       cross join lateral aclexplode(c.relacl) a
       where a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated')) s), 'none'), null
  union all
  select 12, 'Functions in public (nothing else callable)', 'forge_delete_account, forge_write',
    (select string_agg(proname, ', ' order by proname) from fns), null
  union all
  select 13, 'forge_write: definer, fixed search path, owner',
    'security definer | search_path=pg_catalog, pg_temp | owner postgres',
    (select setup from fns where proname = 'forge_write'), null
  union all
  select 14, 'forge_delete_account: definer, fixed search path, owner',
    'security definer | search_path=pg_catalog, pg_temp | owner postgres',
    (select setup from fns where proname = 'forge_delete_account'), null
  union all
  select 15, 'Who may run forge_write', 'anon false, authenticated true, public false',
    (select runs from fns where proname = 'forge_write'), null
  union all
  select 16, 'Who may run forge_delete_account', 'anon false, authenticated true, public false',
    (select runs from fns where proname = 'forge_delete_account'), null
  union all
  select 17, 'Function owner may delete accounts and read sessions', 'true',
    coalesce((select bool_and(owner_rights)::text from fns
       where proname in ('forge_write', 'forge_delete_account')), 'functions missing'), null
  union all
  select 18, 'auth.sessions columns the deletion reads', 'id, not_after, user_id',
    (select string_agg(column_name::text, ', ' order by column_name)
       from information_schema.columns
       where table_schema = 'auth' and table_name = 'sessions'
         and column_name in ('id', 'not_after', 'user_id')), null
),
results as (
  select n, check_name, expected, actual,
    coalesce(pass, actual is not distinct from expected) as ok
  from checks
)
select 0 as n, 'SUMMARY' as check_name,
  'all ' || count(*)::text || ' PASS' as expected,
  count(*) filter (where ok)::text || ' PASS, ' || count(*) filter (where not ok)::text || ' FAIL' as actual,
  case when bool_and(ok) then 'PASS' else 'FAIL' end as result
from results
union all
select n, check_name, expected, actual, case when ok then 'PASS' else 'FAIL' end
from results
order by n;
