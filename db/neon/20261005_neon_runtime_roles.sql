-- Compatibility roles used only inside Motor backend transactions.
-- They have NOLOGIN and do not represent external identity providers.
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;

  execute format('grant authenticated to %I', current_user);
  execute format('grant service_role to %I', current_user);
  execute format('grant anon to %I', current_user);
  execute format('grant anonymous to %I', current_user);
end
$roles$;
