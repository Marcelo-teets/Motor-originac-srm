begin;

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

commit;
