create or replace function public.sync_qualification_compatibility_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_total numeric;
  canonical_timing numeric;
  canonical_urgency numeric;
begin
  canonical_total := coalesce(new.qualification_score_total, new.total_score, 0);
  canonical_timing := coalesce(new.qualification_score_timing, new.timing_score, 0);
  canonical_urgency := coalesce(new.urgency_score, canonical_timing, 0);

  new.qualification_score_total := canonical_total;
  new.total_score := canonical_total;
  new.qualification_score_timing := canonical_timing;
  new.timing_score := canonical_timing;
  new.urgency_score := canonical_urgency;
  return new;
end;
$$;

update public.qualification_snapshots
set
  qualification_score_total = coalesce(qualification_score_total, total_score, 0),
  total_score = coalesce(qualification_score_total, total_score, 0),
  qualification_score_timing = coalesce(qualification_score_timing, timing_score, 0),
  timing_score = coalesce(qualification_score_timing, timing_score, 0),
  urgency_score = coalesce(urgency_score, qualification_score_timing, timing_score, 0)
where
  total_score is distinct from qualification_score_total
  or timing_score is distinct from qualification_score_timing
  or urgency_score is null;

comment on function public.sync_qualification_compatibility_columns() is
  'Synchronizes total and qualification timing aliases while preserving urgency as an independent signal.';
