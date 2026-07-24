-- Canonicalize the checkpoint attempt timestamp used by the CVM runtime.
-- Migration 037 originally created last_checked_at, while the ingestion service
-- writes last_attempted_at. Keep one canonical column and one supporting index.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capital_market_resource_checkpoints'
      and column_name = 'last_checked_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capital_market_resource_checkpoints'
      and column_name = 'last_attempted_at'
  ) then
    alter table public.capital_market_resource_checkpoints
      rename column last_checked_at to last_attempted_at;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capital_market_resource_checkpoints'
      and column_name = 'last_checked_at'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capital_market_resource_checkpoints'
      and column_name = 'last_attempted_at'
  ) then
    update public.capital_market_resource_checkpoints
    set last_attempted_at = coalesce(last_attempted_at, last_checked_at, now())
    where last_attempted_at is null;

    alter table public.capital_market_resource_checkpoints
      drop column last_checked_at;
  end if;
end $$;

alter table public.capital_market_resource_checkpoints
  alter column last_attempted_at set default now(),
  alter column last_attempted_at set not null;

drop index if exists public.idx_capital_market_resource_checkpoints_dataset_checked;

create index if not exists idx_capital_market_resource_checkpoints_dataset_attempted
  on public.capital_market_resource_checkpoints(dataset_code, last_attempted_at desc);

comment on column public.capital_market_resource_checkpoints.last_attempted_at is
  'Timestamp of the latest attempt to inspect or persist the official CVM resource.';
