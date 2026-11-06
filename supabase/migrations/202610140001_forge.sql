-- Auth-owned aggregate transport. Mobile workout data remains relational in SQLite.
-- No service-role key belongs in the mobile application.
create table public.forge_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('profile','exercise','workout','template','journal')),
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,id),
  check (octet_length(payload::text) <= 5242880)
);
create index forge_records_user_updated on public.forge_records(user_id,updated_at);
alter table public.forge_records enable row level security;
create policy "Read owned records" on public.forge_records for select to authenticated using (user_id=auth.uid());
-- Direct mutations are deliberately revoked: optimistic revision checks go through the RPC.
grant select on public.forge_records to authenticated;
revoke insert,update,delete on public.forge_records from authenticated,anon;
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
-- Intentionally callable only for the authenticated user's own account.
create or replace function public.forge_delete_account()
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id=auth.uid();
end; $$;
revoke all on function public.forge_delete_account() from public,anon;
grant execute on function public.forge_delete_account() to authenticated;
