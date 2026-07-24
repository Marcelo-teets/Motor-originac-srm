begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

alter table public.user_profiles
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists locale text not null default 'pt-BR';

alter table public.user_profiles drop constraint if exists user_profiles_role_check;

update public.user_profiles
set role = case
  when lower(coalesce(email, '')) = 'antunes.p.marcelo@gmail.com' then 'god_mode'
  else 'common'
end,
full_name = case
  when lower(coalesce(email, '')) = 'antunes.p.marcelo@gmail.com' then coalesce(full_name, 'Marcelo Pereira Antunes')
  else full_name
end,
status = coalesce(status, 'active'),
updated_at = now();

alter table public.user_profiles alter column role set default 'common';
alter table public.user_profiles alter column role set not null;
alter table public.user_profiles
  add constraint user_profiles_role_check check (role in ('god_mode', 'common'));

create unique index if not exists user_profiles_single_god_mode_idx
  on public.user_profiles (role)
  where role = 'god_mode';

create or replace function private.is_god_mode(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = coalesce(check_user, auth.uid())
      and role = 'god_mode'
      and status = 'active'
  );
$$;

revoke all on function private.is_god_mode(uuid) from public;
revoke all on function private.is_god_mode(uuid) from anon;
grant execute on function private.is_god_mode(uuid) to authenticated, service_role;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    full_name,
    role,
    status,
    job_title,
    phone,
    avatar_url,
    timezone,
    locale,
    metadata
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'common',
    'active',
    new.raw_user_meta_data ->> 'job_title',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'America/Sao_Paulo'),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'pt-BR'),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
    metadata = public.user_profiles.metadata || excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;
revoke all on function public.handle_new_user_profile() from anon;
revoke all on function public.handle_new_user_profile() from authenticated;

create or replace function private.guard_user_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.role = 'god_mode'
     and (
       new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from 'god_mode'
       or new.status is distinct from 'active'
     ) then
    raise exception 'god_mode_profile_is_protected' using errcode = '42501';
  end if;

  if private.is_god_mode(auth.uid()) then
    if old.role <> 'god_mode' and new.role = 'god_mode' then
      raise exception 'god_mode_cannot_be_delegated' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.id <> auth.uid() then
    raise exception 'user_profile_forbidden' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.status is distinct from old.status then
    raise exception 'user_profile_privileged_fields_forbidden' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_user_profile_update() from public;
revoke all on function private.guard_user_profile_update() from anon;
revoke all on function private.guard_user_profile_update() from authenticated;

drop trigger if exists trg_00_guard_user_profile_update on public.user_profiles;
create trigger trg_00_guard_user_profile_update
before update on public.user_profiles
for each row execute function private.guard_user_profile_update();

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_self_or_admin on public.user_profiles;
drop policy if exists user_profiles_update_self_or_admin on public.user_profiles;
drop policy if exists user_profiles_select_self_or_god on public.user_profiles;
drop policy if exists user_profiles_update_self_or_god on public.user_profiles;

create policy user_profiles_select_self_or_god
on public.user_profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy user_profiles_update_self_or_god
on public.user_profiles
for update
to authenticated
using (
  (id = (select auth.uid()) and status = 'active')
  or private.is_god_mode((select auth.uid()))
)
with check (
  (id = (select auth.uid()) and status = 'active')
  or private.is_god_mode((select auth.uid()))
);

revoke all on table public.user_profiles from anon;
revoke all on table public.user_profiles from authenticated;
grant select on table public.user_profiles to authenticated;
grant update (full_name, job_title, phone, avatar_url, timezone, locale, metadata)
  on table public.user_profiles to authenticated;

create or replace function public.set_user_access(
  target_user_id uuid,
  new_role text,
  new_status text
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_profile public.user_profiles;
  updated_profile public.user_profiles;
begin
  if not private.is_god_mode(auth.uid()) then
    raise exception 'god_mode_required' using errcode = '42501';
  end if;

  if new_role not in ('god_mode', 'common') then
    raise exception 'invalid_user_role' using errcode = '22023';
  end if;

  if new_status not in ('active', 'invited', 'disabled') then
    raise exception 'invalid_user_status' using errcode = '22023';
  end if;

  select * into current_profile
  from public.user_profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'user_profile_not_found' using errcode = 'P0002';
  end if;

  if current_profile.role = 'god_mode' then
    if new_role <> 'god_mode' or new_status <> 'active' then
      raise exception 'god_mode_profile_is_protected' using errcode = '42501';
    end if;
  elsif new_role = 'god_mode' then
    raise exception 'god_mode_cannot_be_delegated' using errcode = '42501';
  end if;

  update public.user_profiles
  set role = new_role,
      status = new_status,
      updated_at = now()
  where id = target_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.set_user_access(uuid, text, text) from public;
revoke all on function public.set_user_access(uuid, text, text) from anon;
grant execute on function public.set_user_access(uuid, text, text) to authenticated;

comment on column public.user_profiles.role is 'Access role: god_mode (single protected owner) or common.';
comment on function public.set_user_access(uuid, text, text) is 'GOD-MODE-only access administration with single-owner guardrails.';

commit;
