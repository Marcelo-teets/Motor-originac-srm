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

create or replace function private.normalize_company_signal_lineage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_mode text;
begin
  normalized_mode := pg_catalog.lower(
    coalesce(
      nullif(new.metadata ->> 'observedVsInferred', ''),
      nullif(new.observed_vs_inferred, ''),
      'observed'
    )
  );

  if normalized_mode not in ('observed', 'inferred', 'estimated', 'recommended') then
    raise exception 'invalid_signal_observation_mode: %', normalized_mode using errcode = '23514';
  end if;

  new.observed_vs_inferred := normalized_mode;
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
                  || pg_catalog.jsonb_build_object('observedVsInferred', normalized_mode);

  if new.source_id is null and new.monitoring_output_id is not null then
    select output.source_id
    into new.source_id
    from public.monitoring_outputs output
    where output.id = new.monitoring_output_id;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_company_signal_lineage() from public, anon, authenticated;

drop trigger if exists trg_normalize_company_signal_lineage on public.company_signals;
create trigger trg_normalize_company_signal_lineage
before insert or update of source_id, monitoring_output_id, observed_vs_inferred, metadata
on public.company_signals
for each row execute function private.normalize_company_signal_lineage();

create or replace view public.company_signal_lineage_quality_v1
with (security_invoker = true)
as
select
  signal.id,
  signal.company_id,
  signal.signal_type,
  signal.signal_label,
  signal.observed_at,
  signal.observed_vs_inferred,
  signal.source_id,
  signal.monitoring_output_id,
  signal.evidence_url,
  case
    when signal.source_id is not null then 'source_linked'
    when signal.monitoring_output_id is not null then 'monitoring_linked'
    when nullif(signal.evidence_url, '') is not null then 'evidence_url_only'
    when signal.observed_vs_inferred = 'inferred'
      and nullif(signal.metadata ->> 'corroboration', '') is not null
      then 'corroborated_inference'
    else 'missing_lineage'
  end as lineage_status,
  case
    when signal.metadata ->> 'observedVsInferred' = signal.observed_vs_inferred then 'aligned'
    else 'mismatch'
  end as semantic_status,
  signal.metadata,
  signal.created_at,
  signal.updated_at
from public.company_signals signal;

revoke all on table public.company_signal_lineage_quality_v1 from public, anon;
grant select on table public.company_signal_lineage_quality_v1 to authenticated, service_role;

create or replace view public.company_signal_quality_summary_v1
with (security_invoker = true)
as
select
  lineage_status,
  observed_vs_inferred,
  semantic_status,
  count(*)::bigint as signal_count,
  min(observed_at) as first_observed_at,
  max(observed_at) as last_observed_at
from public.company_signal_lineage_quality_v1
group by lineage_status, observed_vs_inferred, semantic_status;

revoke all on table public.company_signal_quality_summary_v1 from public, anon;
grant select on table public.company_signal_quality_summary_v1 to authenticated, service_role;

create unique index if not exists uq_score_snapshots_identity
on public.score_snapshots (
  company_id,
  created_at,
  score_type,
  (coalesce(nullif(score_version, ''), version::text, 'unversioned'))
);

comment on index public.uq_score_snapshots_identity is
  'Prevents duplicate replay for the same company, timestamp, score type and effective version.';

commit;
