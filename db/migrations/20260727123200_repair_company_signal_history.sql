begin;

update public.company_signals signal
set source_id = output.source_id,
    updated_at = now()
from public.monitoring_outputs output
where signal.monitoring_output_id = output.id
  and signal.source_id is null
  and output.source_id is not null;

update public.company_signals
set observed_vs_inferred = lower(metadata ->> 'observedVsInferred'),
    updated_at = now()
where lower(metadata ->> 'observedVsInferred') in ('observed', 'inferred', 'estimated', 'recommended')
  and observed_vs_inferred is distinct from lower(metadata ->> 'observedVsInferred');

update public.company_signals
set metadata = coalesce(metadata, '{}'::jsonb)
               || jsonb_build_object('observedVsInferred', observed_vs_inferred),
    updated_at = now()
where metadata ->> 'observedVsInferred' is distinct from observed_vs_inferred;

alter table public.company_signals
  drop constraint if exists company_signals_observed_vs_inferred_check;
alter table public.company_signals
  add constraint company_signals_observed_vs_inferred_check
  check (observed_vs_inferred in ('observed', 'inferred', 'estimated', 'recommended'));

commit;
