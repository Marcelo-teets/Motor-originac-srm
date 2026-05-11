-- Migration 016 — Sync public.users with auth.users
-- Objetivo:
-- 1) criar/atualizar automaticamente a linha correspondente em public.users para cada usuário autenticado no Supabase Auth
-- 2) backfill de usuários já existentes em auth.users
--
-- Observação operacional:
-- esta migration assume que não existem conflitos legados relevantes entre public.users.email e auth.users.email.
-- se houver conflitos com emails iguais e IDs diferentes, revisar antes de executar em produção.

create or replace function public.sync_public_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_full_name text;
  resolved_role text;
begin
  resolved_full_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  resolved_role := coalesce(
    new.raw_app_meta_data ->> 'role',
    'analyst'
  );

  insert into public.users (
    id,
    email,
    full_name,
    role,
    auth_provider,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    resolved_full_name,
    resolved_role,
    'supabase_auth',
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.users.full_name),
      role = coalesce(excluded.role, public.users.role),
      auth_provider = 'supabase_auth',
      updated_at = now();

  return new;
end;
$$;

comment on function public.sync_public_user_from_auth() is
  'Mantém public.users sincronizada com auth.users para uso nas tabelas operacionais do aplicativo.';

drop trigger if exists on_auth_user_synced_to_public on auth.users;

create trigger on_auth_user_synced_to_public
after insert or update of email, raw_user_meta_data, raw_app_meta_data
on auth.users
for each row
execute function public.sync_public_user_from_auth();

insert into public.users (
  id,
  email,
  full_name,
  role,
  auth_provider,
  created_at,
  updated_at
)
select
  au.id,
  au.email,
  coalesce(
    au.raw_user_meta_data ->> 'full_name',
    au.raw_user_meta_data ->> 'name',
    split_part(coalesce(au.email, ''), '@', 1)
  ) as full_name,
  coalesce(au.raw_app_meta_data ->> 'role', 'analyst') as role,
  'supabase_auth' as auth_provider,
  coalesce(au.created_at, now()) as created_at,
  now() as updated_at
from auth.users au
where au.email is not null
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(excluded.full_name, public.users.full_name),
    role = coalesce(excluded.role, public.users.role),
    auth_provider = 'supabase_auth',
    updated_at = now();
