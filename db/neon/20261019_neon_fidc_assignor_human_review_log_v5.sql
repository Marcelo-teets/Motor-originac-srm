-- V5 A2: append-only evidence-based manual triage of FIDC assignors.
-- This journal does NOT approve identity, promote candidates, infer funding,
-- write qualification/score/ranking, or create a pipeline opportunity.
create table if not exists public.fidc_assignor_human_reviews_v5 (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$' and public.is_valid_cnpj_checksum(cnpj)),
  disposition text not null check (disposition in ('needs_evidence','no_go','refer_to_identity_review')),
  rationale text not null check (char_length(btrim(rationale)) between 30 and 3000),
  next_action text not null check (char_length(btrim(next_action)) between 10 and 1000),
  reviewer_user_id uuid not null references public.user_profiles(id),
  reviewer_email text not null check (char_length(btrim(reviewer_email)) > 3),
  review_lane_at_decision text not null,
  legal_name_at_decision text,
  registration_status_at_decision text,
  cvm_evidence_url text not null check (cvm_evidence_url like 'https://%'),
  registry_evidence_url text,
  cvm_reference_date date,
  evidence_links integer not null default 0,
  distinct_funds integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists fidc_assignor_human_reviews_cnpj_created_idx
  on public.fidc_assignor_human_reviews_v5 (cnpj, created_at desc, id desc);

alter table public.fidc_assignor_human_reviews_v5 enable row level security;
revoke all on public.fidc_assignor_human_reviews_v5 from public, anonymous, authenticated;
grant select, insert on public.fidc_assignor_human_reviews_v5 to neondb_owner;

comment on table public.fidc_assignor_human_reviews_v5 is
  'Append-only commercial triage journal. NOT an identity approval or qualification decision.';

-- Latest decision is a report, not an authorization gate.
create or replace view public.fidc_assignor_latest_human_review_v5
with (security_invoker = true, security_barrier = true)
as
select distinct on (cnpj)
  id, cnpj, disposition, rationale, next_action,
  reviewer_user_id, reviewer_email, review_lane_at_decision,
  legal_name_at_decision, registration_status_at_decision,
  cvm_evidence_url, registry_evidence_url, cvm_reference_date,
  evidence_links, distinct_funds, created_at
from public.fidc_assignor_human_reviews_v5
order by cnpj, created_at desc, id desc;

revoke all on public.fidc_assignor_latest_human_review_v5
  from public, anonymous, authenticated;
grant select on public.fidc_assignor_latest_human_review_v5 to neondb_owner;

-- Check application-authenticated actor and live CVM source atomically with INSERT.
-- The connection is the already-established Neon Postgres data plane.
create or replace function public.record_fidc_assignor_human_review_v5(
  p_cnpj text,
  p_disposition text,
  p_rationale text,
  p_next_action text,
  p_reviewer_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source record;
  v_reviewer_email text;
  v_id uuid;
begin
  if nullif(current_setting('request.jwt.claim.role', true),'') is distinct from 'authenticated'
     or nullif(current_setting('request.jwt.claim.sub', true),'') is distinct from p_reviewer_user_id::text
  then
    raise exception 'fidc_review_authenticated_actor_required' using errcode = '42501';
  end if;

  select u.email into v_reviewer_email
  from public.user_profiles u
  where u.id = p_reviewer_user_id
    and u.status = 'active'
    and u.role = 'god_mode';

  if v_reviewer_email is null then
    raise exception 'fidc_review_god_mode_required' using errcode = '42501';
  end if;

  if coalesce(p_disposition,'') not in ('needs_evidence','no_go','refer_to_identity_review')
     or char_length(btrim(coalesce(p_rationale,''))) not between 30 and 3000
     or char_length(btrim(coalesce(p_next_action,''))) not between 10 and 1000
  then
    raise exception 'fidc_review_invalid_payload' using errcode = '22023';
  end if;

  select * into v_source
  from public.fidc_assignor_commercial_review_v5
  where cnpj = p_cnpj;

  if not found or coalesce(v_source.cvm_evidence_url,'') not like 'https://%' then
    raise exception 'fidc_review_unverified_source_identity' using errcode = '23514';
  end if;

  if p_disposition = 'refer_to_identity_review'
     and (v_source.review_lane <> 'business_model_due_diligence'
          or upper(btrim(coalesce(v_source.registration_status,''))) <> 'ATIVA')
  then
    raise exception 'fidc_review_identity_referral_requires_active_operating_registry'
      using errcode = '23514';
  end if;

  insert into public.fidc_assignor_human_reviews_v5 (
    cnpj, disposition, rationale, next_action, reviewer_user_id,
    reviewer_email, review_lane_at_decision, legal_name_at_decision,
    registration_status_at_decision, cvm_evidence_url, registry_evidence_url,
    cvm_reference_date, evidence_links, distinct_funds
  ) values (
    v_source.cnpj, p_disposition, btrim(p_rationale), btrim(p_next_action),
    p_reviewer_user_id, v_reviewer_email, v_source.review_lane,
    v_source.legal_name, v_source.registration_status,
    v_source.cvm_evidence_url, v_source.registry_url,
    v_source.cvm_reference_date, v_source.evidence_links, v_source.distinct_funds
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_fidc_assignor_human_review_v5(text,text,text,text,uuid)
  from public, anonymous, authenticated;
grant execute on function public.record_fidc_assignor_human_review_v5(text,text,text,text,uuid)
  to neondb_owner;
