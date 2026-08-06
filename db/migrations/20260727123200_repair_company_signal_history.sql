begin;

-- Historical repair must not enqueue thousands of artificial learning/factor jobs.
-- Trigger state changes are transactional and are restored before commit.
alter table public.company_signals disable trigger trg_enqueue_knowledge_learning_signal;
alter table public.company_signals disable trigger capture_signal_factor_observations;

update public.company_signals signal
set source_id = output.source_id,
    updated_at = now()
from public.monitoring_outputs output
where signal.monitoring_output_id = output.id
  and signal.source_id is null
  and output.source_id is not null;

update public.company_signals
set observed_vs_inferred = case
      when lower(metadata ->> 'observedVsInferred') in ('observed', 'inferred', 'estimated', 'recommended')
        then lower(metadata ->> 'observedVsInferred')
      else observed_vs_inferred
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'observedVsInferred',
      case
        when lower(metadata ->> 'observedVsInferred') in ('observed', 'inferred', 'estimated', 'recommended')
          then lower(metadata ->> 'observedVsInferred')
        else observed_vs_inferred
      end
    ),
    updated_at = now()
where observed_vs_inferred is distinct from lower(metadata ->> 'observedVsInferred')
   or metadata ->> 'observedVsInferred' is null;

alter table public.company_signals enable trigger capture_signal_factor_observations;
alter table public.company_signals enable trigger trg_enqueue_knowledge_learning_signal;

alter table public.company_signals
  drop constraint if exists company_signals_observed_vs_inferred_check;
alter table public.company_signals
  add constraint company_signals_observed_vs_inferred_check
  check (observed_vs_inferred in ('observed', 'inferred', 'estimated', 'recommended'));

commit;
