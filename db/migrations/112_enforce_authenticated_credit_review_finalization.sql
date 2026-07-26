-- Final credit decisions must have an attributable, active GOD-MODE reviewer.
-- Existing legacy rows are not falsified or silently rewritten; they are surfaced
-- as data-quality violations and must be revalidated through the governed UI.

alter table public.company_credit_reviews
  drop constraint if exists company_credit_reviews_finalized_reviewer_check;

alter table public.company_credit_reviews
  add constraint company_credit_reviews_finalized_reviewer_check
  check (
    status not in ('approved', 'rejected')
    or (reviewer_user_id is not null and reviewed_at is not null)
  ) not valid;

create or replace function public.enforce_credit_review_god_mode_reviewer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('approved', 'rejected') then
    if new.reviewer_user_id is null or new.reviewed_at is null then
      raise exception using
        errcode = '23514',
        message = 'finalized credit review requires an attributable reviewer and reviewed_at';
    end if;

    perform 1
    from public.user_profiles profile
    where profile.id = new.reviewer_user_id
      and profile.role = 'god_mode'
      and profile.status = 'active';

    if not found then
      raise exception using
        errcode = '42501',
        message = 'finalized credit review requires an active GOD-MODE reviewer';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_credit_review_god_mode_reviewer() from public;
revoke execute on function public.enforce_credit_review_god_mode_reviewer() from anon, authenticated;
grant execute on function public.enforce_credit_review_god_mode_reviewer() to service_role;

drop trigger if exists trg_enforce_credit_review_god_mode_reviewer
  on public.company_credit_reviews;

create trigger trg_enforce_credit_review_god_mode_reviewer
before insert or update of status, reviewer_user_id, reviewed_at
on public.company_credit_reviews
for each row
execute function public.enforce_credit_review_god_mode_reviewer();

insert into public.data_quality_violations (
  rule_code,
  entity_table,
  entity_id,
  severity,
  status,
  reason,
  observed_value
)
select
  'credit_review_missing_authenticated_reviewer',
  'company_credit_reviews',
  review.id::text,
  'high',
  'open',
  'Finalized credit review has no attributable authenticated GOD-MODE reviewer and requires human revalidation.',
  jsonb_build_object(
    'company_id', review.company_id,
    'review_version', review.review_version,
    'status', review.status,
    'approved_outcome', review.approved_outcome,
    'reviewed_at', review.reviewed_at
  )
from public.company_credit_reviews review
where review.status in ('approved', 'rejected')
  and (review.reviewer_user_id is null or review.reviewed_at is null)
  and not exists (
    select 1
    from public.data_quality_violations violation
    where violation.rule_code = 'credit_review_missing_authenticated_reviewer'
      and violation.entity_table = 'company_credit_reviews'
      and violation.entity_id = review.id::text
      and violation.status = 'open'
  );

notify pgrst, 'reload schema';
