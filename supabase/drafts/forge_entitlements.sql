-- Phase 9.1 DRAFT: Forge membership entitlements. NOT A MIGRATION YET.
--
-- Written and verified locally only (PGlite: tests/billing-schema.test.ts);
-- never applied to any project. It stays outside supabase/migrations so no
-- tool applies it by accident. To promote it, after Opus 1's review and the
-- founder's approval: copy it into supabase/migrations/, numbered after the
-- latest migration there; add its objects to supabase/verify/schema_checks.sql
-- (query 6 lists every public function); apply it to FORGE DEV first, and to
-- production only with the founder's explicit approval.
-- Checks: supabase/drafts/forge_entitlements_checks.sql.
-- Rollback: supabase/drafts/forge_entitlements_rollback.sql.
--
-- Apple bills; RevenueCat validates the store's transactions; Forge's Edge
-- Functions (Phase 9.3) read RevenueCat with a server-only secret and write
-- here as the service role. The app reads only its own record, with the
-- server's clock, through forge_entitlement(). Nothing the app sends can
-- create or change a record. These tables hold no training data, and
-- expiry deletes nothing: records go only with the account itself.
--
-- Additive: no existing table, function or policy changes.

-- 1. One record per account --------------------------------------------------
create table public.forge_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in (
    'none', 'trial', 'active', 'grace', 'billing_retry', 'expired', 'revoked'
  )),
  product_id text check (length(product_id) between 1 and 200),
  store text check (store = 'app_store'),
  environment text check (environment in ('production', 'sandbox')),
  period_type text check (period_type in ('trial', 'intro', 'normal')),
  purchased_at timestamptz,
  expires_at timestamptz,
  grace_expires_at timestamptz,
  access_until timestamptz,
  will_renew boolean not null default false,
  billing_issue_at timestamptz,
  revoked_at timestamptz,
  -- Once set, never cleared (see the guard below).
  first_entitled_at timestamptz,
  source_event_id text check (length(source_event_id) between 1 and 200),
  -- When RevenueCat read the store's state (its request time).
  refreshed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  -- In force exactly while access_until is set: to the end of the period,
  -- or of Apple's billing grace period when that ends later.
  constraint forge_entitlements_in_force check (
    (status in ('trial', 'active', 'grace')) = (access_until is not null)
  ),
  constraint forge_entitlements_period check (
    access_until is null or (
      product_id is not null
      and store is not null
      and environment is not null
      and expires_at is not null
      and access_until = greatest(expires_at, grace_expires_at)
    )
  ),
  constraint forge_entitlements_grace check (
    status <> 'grace'
    or (billing_issue_at is not null and grace_expires_at is not null)
  ),
  constraint forge_entitlements_billing_retry check (
    status <> 'billing_retry' or billing_issue_at is not null
  ),
  constraint forge_entitlements_revoked check (
    status <> 'revoked' or revoked_at is not null
  ),
  constraint forge_entitlements_started check (
    status = 'none' or first_entitled_at is not null
  )
);

-- 2. What a write may not undo -------------------------------------------------
-- An older reading of the store never replaces a newer one (two refreshes
-- crossing), a record never moves to another account, and once an account
-- has had a trial or subscription it always has: the onboarding's Forge
-- Path preview never returns.
create function public.forge_entitlements_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.refreshed_at < old.refreshed_at then
    return null;
  end if;
  new.user_id := old.user_id;
  new.first_entitled_at := least(old.first_entitled_at, new.first_entitled_at);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.forge_entitlements_guard() from public, anon, authenticated;
create trigger forge_entitlements_guard
  before update on public.forge_entitlements
  for each row execute function public.forge_entitlements_guard();

-- 3. Webhook deliveries, once each ----------------------------------------------
-- RevenueCat retries a delivery with the same event ID: recorded on first
-- receipt (insert ... on conflict do nothing) and marked once processed, so
-- a retry of a processed event is acknowledged without work. Only the
-- account's ID is kept, and it goes with the account; never the event body.
create table public.forge_entitlement_events (
  id text primary key check (length(id) between 1 and 200),
  type text not null check (length(type) between 1 and 64),
  environment text check (environment in ('production', 'sandbox')),
  user_id uuid references auth.users(id) on delete cascade,
  event_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index forge_entitlement_events_user
  on public.forge_entitlement_events(user_id);

-- 4. Who may do what ----------------------------------------------------------------
-- The signed-in account reads its own record (never an anonymous sign-in);
-- the Data API's roles get nothing else. Older Supabase projects grant new
-- tables to anon and authenticated by default, and projects created since
-- Supabase's 2026 change (FORGE DEV) grant nothing: both are set explicitly
-- here. The service role (the Edge Functions) bypasses row level security
-- but not these grants: it may read, add and update, never delete.
alter table public.forge_entitlements enable row level security;
alter table public.forge_entitlement_events enable row level security;
create policy "Read own entitlement" on public.forge_entitlements
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) -> 'is_anonymous', 'false'::jsonb) <> 'true'::jsonb
  );
revoke all on table public.forge_entitlements from public, anon, authenticated, service_role;
revoke all on table public.forge_entitlement_events from public, anon, authenticated, service_role;
grant select on table public.forge_entitlements to authenticated;
grant select, insert, update on table public.forge_entitlements to service_role;
grant select, insert, update on table public.forge_entitlement_events to service_role;

-- 5. The app's read: its own record, and the server's clock ---------------------
-- Times in milliseconds since the epoch, in the shape the app checks
-- (src/billing/entitlement.ts, EntitlementResponse); `entitlement` is null
-- when the account has no record. Runs as the caller, so row level security
-- applies.
create function public.forge_entitlement()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'server_now', floor(extract(epoch from now()) * 1000)::bigint,
    'entitlement', (
      select jsonb_build_object(
        'status', e.status,
        'product_id', e.product_id,
        'environment', e.environment,
        'period_type', e.period_type,
        'purchased_at', floor(extract(epoch from e.purchased_at) * 1000)::bigint,
        'expires_at', floor(extract(epoch from e.expires_at) * 1000)::bigint,
        'grace_expires_at', floor(extract(epoch from e.grace_expires_at) * 1000)::bigint,
        'access_until', floor(extract(epoch from e.access_until) * 1000)::bigint,
        'will_renew', e.will_renew,
        'billing_issue_at', floor(extract(epoch from e.billing_issue_at) * 1000)::bigint,
        'revoked_at', floor(extract(epoch from e.revoked_at) * 1000)::bigint,
        'first_entitled_at', floor(extract(epoch from e.first_entitled_at) * 1000)::bigint,
        'refreshed_at', floor(extract(epoch from e.refreshed_at) * 1000)::bigint
      )
      from public.forge_entitlements e
      where e.user_id = auth.uid()
    )
  )
  where auth.uid() is not null
$$;
revoke all on function public.forge_entitlement() from public, anon;
grant execute on function public.forge_entitlement() to authenticated;
