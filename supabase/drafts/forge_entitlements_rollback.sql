-- Rollback for supabase/drafts/forge_entitlements.sql (Phase 9.1 draft).
-- Not a migration: run it by hand, only if the entitlement objects must go.
-- It removes the membership mirror (RevenueCat keeps the purchases, and a
-- refresh rebuilds every record) and nothing else: training data
-- (forge_records), accounts and the other functions are untouched.
-- Verified locally (tests/billing-schema.test.ts).

drop function if exists public.forge_entitlement();
drop table if exists public.forge_entitlement_events;
drop table if exists public.forge_entitlements;
drop function if exists public.forge_entitlements_guard();
