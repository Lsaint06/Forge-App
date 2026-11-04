-- Read-only checks of the Phase 9.1 entitlement draft
-- (supabase/drafts/forge_entitlements.sql), once it is applied. Paste into
-- the SQL editor of the project being checked; nothing here changes
-- anything. The expected results, the same with Supabase's earlier and its
-- 2026 default privileges, are noted under each query and verified in
-- tests/billing-schema.test.ts.

-- 1. Both tables, with row level security on.
select c.relname, c.relrowsecurity as rls_on
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('forge_entitlements', 'forge_entitlement_events')
order by 1;
-- forge_entitlement_events | true
-- forge_entitlements       | true

-- 2. What the API roles hold on them, exactly.
select c.relname,
  case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
  a.privilege_type
from pg_class c, aclexplode(c.relacl) a
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('forge_entitlements', 'forge_entitlement_events')
  and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
order by 1, 2, 3;
-- forge_entitlement_events | service_role  | INSERT, SELECT, UPDATE (3 rows)
-- forge_entitlements       | authenticated | SELECT
-- forge_entitlements       | service_role  | INSERT, SELECT, UPDATE (3 rows)
-- Nothing for anon or PUBLIC, and no DELETE or TRUNCATE for anyone.

-- 3. Row level security's only policy: each account reads its own record.
select c.relname, p.polname, p.polcmd, p.polroles::regrole[] as roles
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('forge_entitlements', 'forge_entitlement_events')
order by 1, 2;
-- One row: forge_entitlements | Read own entitlement | r | {authenticated}

-- 4. The functions: how they run, and who may run them.
select p.proname, p.prosecdef, p.proconfig, r.rolname,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p
cross join (values ('anon'), ('authenticated')) as r(rolname)
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('forge_entitlement', 'forge_entitlements_guard')
order by 1, 4;
-- Both: not security definer, {search_path=pg_catalog, pg_temp}.
-- forge_entitlement: anon false, authenticated true.
-- forge_entitlements_guard: anon false, authenticated false.

-- 5. The guard runs before every update of a record.
select t.tgname, t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname = 'forge_entitlements'
  and not t.tgisinternal;
-- One row: forge_entitlements_guard | O

-- 6. Records go with their account, and only with it.
select c.relname, k.confdeltype
from pg_constraint k
join pg_class c on c.oid = k.conrelid
where k.contype = 'f'
  and k.confrelid = 'auth.users'::regclass
  and c.relnamespace = 'public'::regnamespace
  and c.relname in ('forge_entitlements', 'forge_entitlement_events')
order by 1;
-- forge_entitlement_events | c
-- forge_entitlements       | c
