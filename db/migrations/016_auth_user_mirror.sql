-- Migration 016 — Auth user mirror
-- Objetivo: manter public.users sincronizada com auth.users
-- Pré-requisito: tabela public.users já criada

create or replace function public.sync_auth_user_to_public_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    role,
    auth_provider,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_app_meta_data ->> 'role', 'authenticated'),
    'supabase_auth',
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    auth_provider = 'supabase_auth',
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_or_updated on auth.users;
create trigger on_auth_user_created_or_updated
after insert or update on auth.users
for each row execute procedure public.sync_auth_user_to_public_users();

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
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name') as full_name,
  coalesce(au.raw_app_meta_data ->> 'role', 'authenticated') as role,
  'supabase_auth' as auth_provider,
  coalesce(au.created_at, now()) as created_at,
  now() as updated_at
from auth.users au
where au.email is not null
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  auth_provider = 'supabase_auth',
  updated_at = now();
