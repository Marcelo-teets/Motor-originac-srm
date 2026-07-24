-- Governed triage between discovery capture and identity approval.
-- The queue classifies candidates without promoting them. Funds, market
-- infrastructure, banks and SPEs cannot enter the operating Company Master
-- unless a reviewer explicitly overrides the entity classification.

create table if not exists public.candidate_entity_classifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.discovered_company_candidates(id) on delete cascade,
  automated_entity_type text not null,
  final_entity_type text not null,
  classification_status text not null default 'auto',
  confidence numeric(5,4) not null default 0.8000,
  rationale text not null,
  classifier_version integer not null default 1,
  reviewer_user_id uuid,
  reviewer_email text,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_entity_type_check check (automated_entity_type in (
    'operating_company','regulated_credit_company','investment_vehicle',
    'market_infrastructure','regulated_financial_institution',
    'special_purpose_vehicle','identity_incomplete'
  )),
  constraint candidate_final_entity_type_check check (final_entity_type in (
    'operating_company','regulated_credit_company','investment_vehicle',
    'market_infrastructure','regulated_financial_institution',
    'special_purpose_vehicle','identity_incomplete'
  )),
  constraint candidate_classification_status_check check (classification_status in ('auto','confirmed','overridden')),
  constraint candidate_classification_confidence_check check (confidence between 0 and 1)
);

alter table public.candidate_entity_classifications enable row level security;
revoke all on table public.candidate_entity_classifications from public,anon,authenticated;
grant all on table public.candidate_entity_classifications to service_role;

create index if not exists idx_candidate_entity_classifications_type
  on public.candidate_entity_classifications(final_entity_type,classification_status,updated_at desc);
create index if not exists idx_discovered_candidates_status_confidence
  on public.discovered_company_candidates(candidate_status,confidence desc,created_at desc);
create index if not exists idx_discovered_candidates_cnpj_status
  on public.discovered_company_candidates(cnpj,candidate_status);
create index if not exists idx_discovered_candidates_origin
  on public.discovered_company_candidates((raw_payload->>'origin'),candidate_status)
  where raw_payload ? 'origin';

create or replace function public.classify_candidate_entity_name(p_name text,p_cnpj text default null)
returns text
language sql
immutable
set search_path=public
as $$
  with normalized as (
    select upper(regexp_replace(coalesce(p_name,''),'\s+',' ','g')) as name,
           regexp_replace(coalesce(p_cnpj,''),'[^0-9]','','g') as cnpj
  )
  select case
    when nullif(btrim(name),'') is null or length(cnpj)<>14 then 'identity_incomplete'
    when name ~ '(FUNDO DE INVESTIMENTO|\mFIDC\M|\mFIC\M|\mFIAGRO\M|\mFII\M|\mFIP\M)' then 'investment_vehicle'
    when name ~ '(SOCIEDADE DE CR[EÉ]DITO DIRETO|SOCIEDADE DE EMPR[EÉ]STIMO ENTRE PESSOAS|\mSCD\M|\mSEP\M)' then 'regulated_credit_company'
    when name ~ '(SECURITIZADORA|DISTRIBUIDORA DE T[IÍ]TULOS|\mDTVM\M|CORRETORA DE VALORES|ADMINISTRADORA DE RECURSOS|GESTORA DE RECURSOS|AGENTE FIDUCI[AÁ]RIO)' then 'market_infrastructure'
    when name ~ '(\mSPE\M|SOCIEDADE DE PROP[OÓ]SITO ESPEC[IÍ]FICO)' then 'special_purpose_vehicle'
    when name ~ '(^| )BANCO( |$)|COMPANHIA HIPOTEC[AÁ]RIA|COOPERATIVA DE CR[EÉ]DITO|CAIXA ECON[OÔ]MICA' then 'regulated_financial_institution'
    else 'operating_company'
  end
  from normalized;
$$;

create or replace function public.candidate_triage_lane(p_entity_type text)
returns text
language sql
immutable
set search_path=public
as $$
  select case p_entity_type
    when 'operating_company' then 'identity_review_queue'
    when 'regulated_credit_company' then 'identity_review_queue'
    when 'investment_vehicle' then 'vehicle_context_only'
    when 'market_infrastructure' then 'market_infrastructure_context'
    when 'regulated_financial_institution' then 'market_infrastructure_context'
    when 'special_purpose_vehicle' then 'parent_resolution_required'
    else 'identity_enrichment_required'
  end;
$$;

create or replace function public.refresh_candidate_entity_classifications(p_candidate_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_written integer:=0;
begin
  insert into public.candidate_entity_classifications(
    candidate_id,automated_entity_type,final_entity_type,classification_status,
    confidence,rationale,classifier_version,created_at,updated_at
  )
  select d.id,classified.entity_type,classified.entity_type,'auto',
    case classified.entity_type
      when 'identity_incomplete' then 0.55
      when 'operating_company' then 0.82
      when 'regulated_credit_company' then 0.88
      else 0.94 end,
    case classified.entity_type
      when 'investment_vehicle' then 'Legal name identifies an investment fund or credit-rights vehicle; retain as transaction context, not an operating-company lead.'
      when 'market_infrastructure' then 'Legal name identifies securitization or capital-markets infrastructure; retain for ecosystem intelligence.'
      when 'regulated_financial_institution' then 'Legal name identifies a bank or regulated financial institution outside the operating-company ICP.'
      when 'special_purpose_vehicle' then 'Legal name identifies an SPE; resolve sponsor, parent or operating beneficiary before promotion.'
      when 'regulated_credit_company' then 'Legal name identifies a regulated credit company compatible with the fintech/credit-product ICP.'
      when 'identity_incomplete' then 'Legal name or valid 14-digit CNPJ is missing and requires enrichment.'
      else 'Candidate is not identified as a fund, market intermediary, bank or SPE and can enter identity review.' end,
    1,now(),now()
  from public.discovered_company_candidates d
  cross join lateral (
    select public.classify_candidate_entity_name(coalesce(d.legal_name,d.company_name),d.cnpj) as entity_type
  ) classified
  where d.candidate_status<>'discarded'
    and (p_candidate_id is null or d.id=p_candidate_id)
  on conflict(candidate_id) do update set
    automated_entity_type=excluded.automated_entity_type,
    final_entity_type=case
      when public.candidate_entity_classifications.classification_status='auto'
        then excluded.automated_entity_type
      else public.candidate_entity_classifications.final_entity_type end,
    confidence=case
      when public.candidate_entity_classifications.classification_status='auto'
        then excluded.confidence
      else public.candidate_entity_classifications.confidence end,
    rationale=case
      when public.candidate_entity_classifications.classification_status='auto'
        then excluded.rationale
      else public.candidate_entity_classifications.rationale end,
    classifier_version=excluded.classifier_version,
    updated_at=now();
  get diagnostics v_written=row_count;
  return jsonb_build_object('classifications_written',v_written,'candidateId',p_candidate_id,'generatedAt',now());
end;
$$;

create or replace function public.confirm_candidate_entity_classification(
  p_candidate_id uuid,
  p_final_entity_type text,
  p_reviewer_user_id uuid default null,
  p_reviewer_email text default null,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.candidate_entity_classifications%rowtype; v_now timestamptz:=now();
begin
  if p_final_entity_type not in (
    'operating_company','regulated_credit_company','investment_vehicle',
    'market_infrastructure','regulated_financial_institution',
    'special_purpose_vehicle','identity_incomplete'
  ) then raise exception using errcode='23514',message='invalid final entity type'; end if;

  perform public.refresh_candidate_entity_classifications(p_candidate_id);
  update public.candidate_entity_classifications
  set final_entity_type=p_final_entity_type,
      classification_status=case when automated_entity_type=p_final_entity_type then 'confirmed' else 'overridden' end,
      confidence=case when automated_entity_type=p_final_entity_type then greatest(confidence,0.90) else 0.95 end,
      reviewer_user_id=p_reviewer_user_id,
      reviewer_email=nullif(btrim(coalesce(p_reviewer_email,'')),''),
      review_notes=nullif(btrim(coalesce(p_review_notes,'')),''),
      reviewed_at=v_now,
      updated_at=v_now
  where candidate_id=p_candidate_id
  returning * into v_row;
  if not found then raise exception using errcode='P0002',message='candidate classification not found'; end if;

  return jsonb_build_object(
    'candidateId',p_candidate_id,
    'automatedEntityType',v_row.automated_entity_type,
    'finalEntityType',v_row.final_entity_type,
    'classificationStatus',v_row.classification_status,
    'reviewedAt',v_row.reviewed_at
  );
end;
$$;

create or replace function public.sync_candidate_entity_classification()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.refresh_candidate_entity_classifications(new.id);
  return null;
end;
$$;

drop trigger if exists trg_sync_candidate_entity_classification on public.discovered_company_candidates;
create trigger trg_sync_candidate_entity_classification
after insert or update of legal_name,company_name,cnpj,candidate_status
on public.discovered_company_candidates
for each row execute function public.sync_candidate_entity_classification();

select public.refresh_candidate_entity_classifications(null);

create or replace view public.candidate_identity_triage_v1
with (security_invoker=true)
as
select
  d.id as candidate_id,
  d.company_name,
  d.legal_name,
  d.cnpj,
  d.website,
  d.normalized_domain,
  d.segment,
  d.subsegment,
  d.company_type,
  d.credit_product,
  d.target_structure,
  d.source_ref,
  d.source_url,
  d.evidence_summary,
  d.confidence as source_confidence,
  d.candidate_status,
  d.company_id,
  d.captured_at,
  d.created_at,
  c.automated_entity_type,
  c.final_entity_type,
  c.classification_status,
  c.confidence as classification_confidence,
  c.rationale as classification_rationale,
  public.candidate_triage_lane(c.final_entity_type) as queue_lane,
  r.review_status as identity_review_status,
  r.reviewed_at as identity_reviewed_at,
  e.id as latest_event_id,
  coalesce(e.event_date,e.reference_date) as latest_event_date,
  e.maturity_date,
  e.instrument_type,
  e.volume as latest_event_volume,
  coalesce((d.raw_payload->>'eventCount')::integer,0) as event_count,
  coalesce(d.raw_payload->'instrumentTypes','[]'::jsonb) as instrument_types,
  coalesce(d.raw_payload->'promotion_blockers','[]'::jsonb) as promotion_blockers,
  c.final_entity_type in ('investment_vehicle','market_infrastructure','regulated_financial_institution') as excluded_from_operating_leads,
  case
    when c.final_entity_type='investment_vehicle' then 'Retain as FIDC/fund transaction context; resolve cedent, originator and sponsor instead of promoting the vehicle.'
    when c.final_entity_type in ('market_infrastructure','regulated_financial_institution') then 'Retain as market ecosystem context; do not promote to the operating-company lead universe.'
    when c.final_entity_type='special_purpose_vehicle' then 'Resolve parent, sponsor or operating beneficiary before identity approval.'
    when c.final_entity_type='identity_incomplete' then 'Enrich legal identity and CNPJ from an official source.'
    when c.final_entity_type='regulated_credit_company' then 'Validate website, regulatory status, credit product and legal identity; then approve entity identity only.'
    else 'Validate website, official legal identity and evidence; then approve entity identity only.' end as next_action,
  round((
    case c.final_entity_type
      when 'regulated_credit_company' then 55
      when 'operating_company' then 50
      when 'special_purpose_vehicle' then 18
      when 'identity_incomplete' then 12
      when 'market_infrastructure' then 6
      when 'regulated_financial_institution' then 4
      else 0 end
    + least(20,coalesce(d.confidence,0)*20)
    + case
        when coalesce(e.event_date,e.reference_date)>=current_date-90 then 20
        when coalesce(e.event_date,e.reference_date)>=current_date-365 then 10
        else 0 end
    + least(10,coalesce((d.raw_payload->>'eventCount')::integer,0))
    + case when e.instrument_type in ('DEBENTURE','NOTA COMERCIAL') then 10 else 0 end
    + case when r.review_status='draft' then 5 when r.review_status in ('approved','rejected') then -100 else 0 end
  )::numeric,2) as triage_priority
from public.discovered_company_candidates d
join public.candidate_entity_classifications c on c.candidate_id=d.id
left join public.candidate_identity_reviews r on r.candidate_id=d.id
left join public.capital_market_events e on e.id=case
  when coalesce(d.raw_payload->>'latestEventId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (d.raw_payload->>'latestEventId')::uuid else null end
where d.candidate_status<>'discarded';

revoke all on public.candidate_identity_triage_v1 from public,anon,authenticated;
grant select on public.candidate_identity_triage_v1 to service_role;

create or replace function public.get_candidate_identity_triage(
  p_limit integer default 100,
  p_queue_lane text default null,
  p_entity_type text default null
)
returns jsonb
language sql
security invoker
stable
set search_path=public
as $$
  with filtered as (
    select * from public.candidate_identity_triage_v1 q
    where q.candidate_status='captured'
      and (p_queue_lane is null or q.queue_lane=p_queue_lane)
      and (p_entity_type is null or q.final_entity_type=p_entity_type)
  ), selected as (
    select * from filtered order by triage_priority desc,latest_event_date desc nulls last,created_at desc
    limit greatest(1,least(coalesce(p_limit,100),500))
  ), summary as (
    select count(*)::integer as total,
      count(*) filter (where queue_lane='identity_review_queue')::integer as identity_review_queue,
      count(*) filter (where queue_lane='vehicle_context_only')::integer as vehicle_context_only,
      count(*) filter (where queue_lane='market_infrastructure_context')::integer as market_infrastructure_context,
      count(*) filter (where queue_lane='parent_resolution_required')::integer as parent_resolution_required,
      count(*) filter (where queue_lane='identity_enrichment_required')::integer as identity_enrichment_required
    from filtered
  )
  select jsonb_build_object(
    'generatedAt',now(),
    'filters',jsonb_build_object('queueLane',p_queue_lane,'entityType',p_entity_type,'limit',greatest(1,least(coalesce(p_limit,100),500))),
    'summary',(select to_jsonb(summary) from summary),
    'candidates',coalesce((select jsonb_agg(to_jsonb(selected) order by triage_priority desc,latest_event_date desc nulls last) from selected),'[]'::jsonb)
  );
$$;

-- Add an entity-type gate around the existing identity approval workflow.
do $$
begin
  if to_regprocedure('public.approve_candidate_identity_review_pre_entity_gate(uuid,text,text,text,text,text,numeric,uuid,text,text)') is null then
    alter function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text)
      rename to approve_candidate_identity_review_pre_entity_gate;
  end if;
end;
$$;

create or replace function public.approve_candidate_identity_review(
  p_candidate_id uuid,
  p_legal_name text,
  p_cnpj text,
  p_website text,
  p_identity_source_url text,
  p_evidence_summary text,
  p_confidence numeric default 0.8000,
  p_reviewer_user_id uuid default null,
  p_reviewer_email text default null,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_type text; v_result jsonb;
begin
  perform public.refresh_candidate_entity_classifications(p_candidate_id);
  select final_entity_type into v_type from public.candidate_entity_classifications where candidate_id=p_candidate_id;
  if v_type not in ('operating_company','regulated_credit_company') then
    raise exception using
      errcode='23514',
      message='candidate entity type is not eligible for operating Company Master promotion',
      detail=jsonb_build_object('candidateId',p_candidate_id,'finalEntityType',v_type,'requiredTypes',jsonb_build_array('operating_company','regulated_credit_company'))::text;
  end if;
  v_result:=public.approve_candidate_identity_review_pre_entity_gate(
    p_candidate_id,p_legal_name,p_cnpj,p_website,p_identity_source_url,
    p_evidence_summary,p_confidence,p_reviewer_user_id,p_reviewer_email,p_review_notes
  );
  return v_result||jsonb_build_object('finalEntityType',v_type,'entityGateVersion',1);
end;
$$;

revoke all on function public.classify_candidate_entity_name(text,text) from public,anon,authenticated;
revoke all on function public.candidate_triage_lane(text) from public,anon,authenticated;
revoke all on function public.refresh_candidate_entity_classifications(uuid) from public,anon,authenticated;
revoke all on function public.confirm_candidate_entity_classification(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.sync_candidate_entity_classification() from public,anon,authenticated;
revoke all on function public.get_candidate_identity_triage(integer,text,text) from public,anon,authenticated;
revoke all on function public.approve_candidate_identity_review_pre_entity_gate(uuid,text,text,text,text,text,numeric,uuid,text,text) from public,anon,authenticated;
revoke all on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text) from public,anon,authenticated;

grant execute on function public.classify_candidate_entity_name(text,text) to service_role;
grant execute on function public.candidate_triage_lane(text) to service_role;
grant execute on function public.refresh_candidate_entity_classifications(uuid) to service_role;
grant execute on function public.confirm_candidate_entity_classification(uuid,text,uuid,text,text) to service_role;
grant execute on function public.get_candidate_identity_triage(integer,text,text) to service_role;
grant execute on function public.approve_candidate_identity_review_pre_entity_gate(uuid,text,text,text,text,text,numeric,uuid,text,text) to service_role;
grant execute on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text) to service_role;

notify pgrst,'reload schema';
