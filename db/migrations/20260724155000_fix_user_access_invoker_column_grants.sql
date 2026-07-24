begin;

create or replace function public.set_user_access(
  target_user_id uuid,
  new_role text,
  new_status text
)
returns public.user_profiles
language plpgsql
security invoker
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
      status = new_status
  where id = target_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.set_user_access(uuid, text, text) from public;
revoke all on function public.set_user_access(uuid, text, text) from anon;
grant execute on function public.set_user_access(uuid, text, text) to authenticated;

comment on function public.set_user_access(uuid, text, text) is 'GOD-MODE-only access administration executed with caller RLS; updated_at is maintained by trg_user_profiles_updated_at.';

commit;
