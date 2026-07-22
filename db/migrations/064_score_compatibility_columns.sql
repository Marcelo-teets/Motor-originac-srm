-- Existing backend writers persist both legacy and extended score fields.
-- These aliases were generated columns in production, which rejected real inserts.
-- Convert them to writable compatibility columns and keep both representations synced.

alter table public.qualification_snapshots
  alter column qualification_score_total drop expression;

alter table public.qualification_snapshots
  alter column urgency_score drop expression;

alter table public.lead_score_snapshots
  alter column bucket drop expression;

create or replace function public.sync_qualification_compatibility_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_total numeric;
  canonical_urgency numeric;
begin
  canonical_total := coalesce(new.qualification_score_total, new.total_score, 0);
  canonical_urgency := coalesce(new.urgency_score, new.timing_score, 0);

  new.qualification_score_total := canonical_total;
  new.total_score := canonical_total;
  new.urgency_score := canonical_urgency;
  new.timing_score := canonical_urgency;
  return new;
end;
$$;

drop trigger if exists "00_sync_qualification_compatibility" on public.qualification_snapshots;
create trigger "00_sync_qualification_compatibility"
before insert or update on public.qualification_snapshots
for each row execute function public.sync_qualification_compatibility_columns();

create or replace function public.sync_lead_score_compatibility_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_bucket text;
begin
  canonical_bucket := coalesce(nullif(new.bucket, ''), nullif(new.priority_tier, ''), 'low_priority');
  new.bucket := canonical_bucket;
  new.priority_tier := canonical_bucket;
  return new;
end;
$$;

drop trigger if exists "00_sync_lead_score_compatibility" on public.lead_score_snapshots;
create trigger "00_sync_lead_score_compatibility"
before insert or update on public.lead_score_snapshots
for each row execute function public.sync_lead_score_compatibility_columns();

comment on function public.sync_qualification_compatibility_columns() is
  'Keeps legacy total_score/timing_score aligned with qualification_score_total/urgency_score without generated-column insert failures.';

comment on function public.sync_lead_score_compatibility_columns() is
  'Keeps priority_tier and bucket aligned for all lead-score writers.';
