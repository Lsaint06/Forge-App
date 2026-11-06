-- Rollback for supabase/migrations/202611020001_forge_security_hardening.sql
-- (Phase 7.8E, Stage 3). Restores the previous behavior exactly: the
-- functions and the read policy as 202610140001_forge.sql defined them.
-- Not a migration: run it by hand, only if the hardening must be undone.
-- Verified locally (tests/server-hardening.test.ts).

create or replace function public.forge_write(record_id text,record_kind text,record_payload jsonb,base_revision bigint,is_deleted boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.forge_records; owner_id uuid:=auth.uid(); next_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if length(record_id) < 1 or length(record_id)>200 then raise exception 'Invalid identity'; end if;
  if base_revision < 0 then raise exception 'Invalid revision'; end if;
  -- Serialize inserts and updates for this owner/record, including absent records.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || record_id,0));
  select * into existing from public.forge_records where user_id=owner_id and id=record_id for update;
  if coalesce(existing.revision,0) <> base_revision then
    return jsonb_build_object('conflict',jsonb_build_object('id',existing.id,'kind',existing.kind,'payload',existing.payload,'revision',existing.revision,'deleted',existing.deleted));
  end if;
  if existing.id is not null and existing.kind <> record_kind then raise exception 'Record kind cannot change'; end if;
  next_revision:=base_revision+1;
  insert into public.forge_records(user_id,id,kind,payload,revision,deleted) values(owner_id,record_id,record_kind,record_payload,next_revision,is_deleted)
  on conflict(user_id,id) do update set payload=excluded.payload,revision=excluded.revision,deleted=excluded.deleted,updated_at=now();
  return jsonb_build_object('revision',next_revision);
end; $$;
revoke all on function public.forge_write(text,text,jsonb,bigint,boolean) from public,anon;
grant execute on function public.forge_write(text,text,jsonb,bigint,boolean) to authenticated;

create or replace function public.forge_delete_account()
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id=auth.uid();
end; $$;
revoke all on function public.forge_delete_account() from public,anon;
grant execute on function public.forge_delete_account() to authenticated;

alter policy "Read owned records" on public.forge_records using (user_id=auth.uid());

-- The table privileges the hardening removed were never used by the Data
-- API (L6), so this leaves them removed. To restore Supabase's previous
-- defaults exactly as well, on any Postgres version (from 17, "all" also
-- includes MAINTAIN), also run:
--   grant all on table public.forge_records to anon, authenticated;
--   revoke insert, update, delete on table public.forge_records from anon, authenticated;
