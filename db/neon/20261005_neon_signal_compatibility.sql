-- Neon compatibility field used by capture persistence and Knowledge workspace.
alter table public.company_signals
  add column if not exists is_explicit boolean not null default false;

update public.company_signals
set is_explicit = (observed_vs_inferred = 'observed')
where is_explicit is distinct from (observed_vs_inferred = 'observed');
