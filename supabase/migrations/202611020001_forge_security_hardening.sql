-- Phase 7.8E, Stage 3: server-side security hardening.
--
-- Additive: no table, column or record changes, and the app's sync contract
-- (forge_write) is unchanged for every signed-in, non-anonymous account.
-- Prepared and verified locally (PGlite: tests/server-hardening.test.ts).
-- NOT deployed. Apply to a development project first; see
-- docs/audits/PHASE_7_8E_ACCOUNT_LIFECYCLE.md, section 11. Rollback:
-- supabase/rollback/202611020001_forge_security_hardening.sql.
--
-- Assumptions (verify in the dashboard before applying):
--   * No custom access token hook rewrites the `amr`, `session_id` or
--     `is_anonymous` claims (Authentication > Hooks).
--   * The Data API exposes no function that sets `request.jwt.*`: the claims
--     read below come from the JWT PostgREST verified for this request.

-- 1. Deleting the account requires a recent, genuine sign-in -------------
--
-- Recency comes from the token's `amr` claim: Supabase Auth records each
-- authentication method used on a session (password, Google, email code…)
-- with the time it was used, and a token refresh reissues the token from
-- those records without adding to them. The token's issue time (`iat`) is
-- never used: a refresh renews it. Only interactive methods count, and
-- missing, malformed or future-dated claims are refused. The session must
-- still exist, so a signed-out or revoked token can't delete the account.
--
-- Search path: pg_catalog first and the caller's temporary schema last, as
-- PostgreSQL advises for SECURITY DEFINER functions. An empty search path
-- would search the temporary schema first for type names, so a caller's
-- temporary table named `uuid`, `jsonb` or `text` could stand in for them.
create or replace function public.forge_delete_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  caller uuid := auth.uid();
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  session_ref text := claims ->> 'session_id';
  signed_in_at bigint;
  now_epoch bigint := floor(extract(epoch from now()))::bigint;
begin
  if caller is null or coalesce(claims ->> 'role', '') <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if claims -> 'is_anonymous' = to_jsonb(true) then
    raise exception 'Anonymous sign-ins cannot delete an account'
      using errcode = '42501';
  end if;
  -- Already deleted: nothing left to do, so a repeated request succeeds.
  if not exists (select 1 from auth.users where id = caller) then
    return;
  end if;
  -- The sign-in this request carries must still be live.
  if session_ref is null
    or session_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists (
      select 1 from auth.sessions s
      where s.id = session_ref::uuid
        and s.user_id = caller
        and (s.not_after is null or s.not_after > now())
    )
  then
    raise exception 'Sign in again to delete your account'
      using errcode = '42501', hint = 'reauthentication_needed';
  end if;
  -- The most recent interactive authentication recorded for that session.
  if jsonb_typeof(claims -> 'amr') = 'array' then
    select max(floor((entry ->> 'timestamp')::numeric)::bigint)
      into signed_in_at
      from jsonb_array_elements(claims -> 'amr') as entry
      where jsonb_typeof(entry) = 'object'
        and jsonb_typeof(entry -> 'timestamp') = 'number'
        and entry ->> 'method' in (
          'password', 'oauth', 'otp', 'magiclink', 'recovery',
          'email/signup', 'invite', 'sso/saml', 'web3', 'passkey',
          'totp', 'mfa/phone', 'mfa/webauthn', 'mfa/recovery_code'
        );
  end if;
  if signed_in_at is null
    or signed_in_at < now_epoch - 600
    or signed_in_at > now_epoch + 60
  then
    raise exception 'Sign in again to delete your account'
      using errcode = '42501', hint = 'reauthentication_needed';
  end if;
  delete from auth.users where id = caller;
end;
$$;
revoke all on function public.forge_delete_account() from public, anon;
grant execute on function public.forge_delete_account() to authenticated;

-- 2. Sync writes: unchanged, but never as an anonymous sign-in, and with the
-- same fixed search path as above (every table is schema-qualified).
create or replace function public.forge_write(
  record_id text,
  record_kind text,
  record_payload jsonb,
  base_revision bigint,
  is_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing public.forge_records;
  owner_id uuid := auth.uid();
  next_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt(), '{}'::jsonb) -> 'is_anonymous' = to_jsonb(true) then
    raise exception 'Authentication required';
  end if;
  if length(record_id) < 1 or length(record_id) > 200 then raise exception 'Invalid identity'; end if;
  if base_revision < 0 then raise exception 'Invalid revision'; end if;
  -- Serialize inserts and updates for this owner/record, including absent records.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || record_id, 0));
  select * into existing from public.forge_records where user_id = owner_id and id = record_id for update;
  if coalesce(existing.revision, 0) <> base_revision then
    return jsonb_build_object('conflict', jsonb_build_object('id', existing.id, 'kind', existing.kind, 'payload', existing.payload, 'revision', existing.revision, 'deleted', existing.deleted));
  end if;
  if existing.id is not null and existing.kind <> record_kind then raise exception 'Record kind cannot change'; end if;
  next_revision := base_revision + 1;
  insert into public.forge_records(user_id, id, kind, payload, revision, deleted)
  values (owner_id, record_id, record_kind, record_payload, next_revision, is_deleted)
  on conflict (user_id, id) do update
    set payload = excluded.payload, revision = excluded.revision, deleted = excluded.deleted, updated_at = now();
  return jsonb_build_object('revision', next_revision);
end;
$$;
revoke all on function public.forge_write(text, text, jsonb, bigint, boolean) from public, anon;
grant execute on function public.forge_write(text, text, jsonb, bigint, boolean) to authenticated;

-- 3. Reads: still only the account's own records, and never for an
-- anonymous sign-in.
alter policy "Read owned records" on public.forge_records
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) -> 'is_anonymous', 'false'::jsonb) <> 'true'::jsonb
  );

-- 4. Table privileges the Data API never needs (L6). Reading through row
-- level security stays; every change goes through forge_write. "all" also
-- covers privileges newer Postgres versions add (MAINTAIN, from 17).
revoke all on table public.forge_records from anon;
revoke all on table public.forge_records from authenticated;
grant select on table public.forge_records to authenticated;
