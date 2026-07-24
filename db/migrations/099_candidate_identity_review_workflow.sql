-- Transactional candidate identity review workflow.
-- Discovery names become real Company Master rows only after reviewed legal identity.

create table if not exists public.candidate_identity_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.discovered_company_candidates(id) on delete cascade,
  review_status text not null default 'draft' check (review_status in ('draft','approved','rejected')),
  legal_name text,
  cnpj text,
  website text,
  normalized_domain text,
  identity_source_url text,
  evidence_summary text,
  confidence numeric(5,4) not null default 0.7000 check (confidence between 0 and 1),
  reviewer_user_id uuid,
  reviewer_email text,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id)
);

alter table public.candidate_identity_reviews enable row level security;
revoke all on table public.candidate_identity_reviews from public, anon, authenticated;
grant all on table public.candidate_identity_reviews to service_role;

create or replace function public.normalize_identity_domain(p_website text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    lower(
      split_part(
        regexp_replace(
          regexp_replace(btrim(coalesce(p_website,'')), '^https?://', '', 'i'),
          '^www\\.', '', 'i'
        ),
        '/', 1
      )
    ),
    ''
  );
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
set search_path = public
as $$
declare
  v_candidate public.discovered_company_candidates%rowtype;
  v_company public.companies%rowtype;
  v_company_id uuid;
  v_cnpj text := public.normalize_cnpj_digits(p_cnpj);
  v_legal_name text := nullif(btrim(coalesce(p_legal_name,'')), '');
  v_website text := nullif(btrim(coalesce(p_website,'')), '');
  v_domain text := public.normalize_identity_domain(p_website);
  v_source_url text := nullif(btrim(coalesce(p_identity_source_url,'')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence_summary,'')), '');
  v_created boolean := false;
  v_now timestamptz := now();
begin
  select * into v_candidate
  from public.discovered_company_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='candidate not found';
  end if;
  if v_candidate.candidate_status in ('discarded','promoted') then
    raise exception using errcode='23514', message='candidate is not available for identity approval';
  end if;
  if v_legal_name is null or length(v_legal_name) < 4 then
    raise exception using errcode='23514', message='verified legal name is required';
  end if;
  if v_cnpj is null or not public.is_valid_cnpj_checksum(v_cnpj) then
    raise exception using errcode='23514', message='valid CNPJ is required';
  end if;
  if v_website is null or v_website !~* '^https?://[^[:space:]]+$' or v_domain is null then
    raise exception using errcode='23514', message='valid website and normalized domain are required';
  end if;
  if v_source_url is null or v_source_url !~* '^https?://[^[:space:]]+$' then
    raise exception using errcode='23514', message='identity evidence URL is required';
  end if;
  if v_evidence is null or length(v_evidence) < 80 then
    raise exception using errcode='23514', message='identity evidence summary must contain at least 80 characters';
  end if;
  if coalesce(p_confidence,0) < 0.70 or p_confidence > 1 then
    raise exception using errcode='23514', message='identity confidence must be between 0.70 and 1.00';
  end if;

  select * into v_company
  from public.companies
  where cnpj = v_cnpj
  for update;

  if found then
    if coalesce((v_company.metadata->>'synthetic_seed')::boolean,false) then
      raise exception using errcode='23514', message='reviewed identity collides with a synthetic Company Master row';
    end if;
    v_company_id := v_company.id;
    update public.companies
    set legal_name = v_legal_name,
        trade_name = coalesce(nullif(btrim(v_candidate.company_name),''), trade_name),
        normalized_name = lower(regexp_replace(v_legal_name,'[^a-zA-Z0-9]+','','g')),
        domain = v_domain,
        website_url = v_website,
        website = v_website,
        country = 'BR',
        geography = 'BR',
        origin = coalesce(origin,'candidate_identity_review'),
        description = v_evidence,
        notes = v_evidence,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'data_status','real',
          'decision_eligible',true,
          'synthetic_seed',false,
          'excluded_from_entity_resolution',false,
          'excluded_from_qualification',false,
          'excluded_from_scoring',false,
          'identity_review_status','approved',
          'identity_source_url',v_source_url,
          'identity_reviewed_at',v_now,
          'identity_reviewer_user_id',p_reviewer_user_id,
          'identity_reviewer_email',p_reviewer_email,
          'identity_confidence',p_confidence,
          'qualification_status','pending_evidence'
        ),
        updated_at = v_now
    where id = v_company_id;
  else
    insert into public.companies(
      legal_name,trade_name,normalized_name,cnpj,domain,website_url,website,
      country,geography,stage,origin,description,notes,metadata
    ) values (
      v_legal_name,
      coalesce(nullif(btrim(v_candidate.company_name),''),v_legal_name),
      lower(regexp_replace(v_legal_name,'[^a-zA-Z0-9]+','','g')),
      v_cnpj,v_domain,v_website,v_website,
      'BR','BR','Identified','candidate_identity_review',v_evidence,v_evidence,
      jsonb_build_object(
        'data_status','real',
        'decision_eligible',true,
        'synthetic_seed',false,
        'excluded_from_entity_resolution',false,
        'excluded_from_qualification',false,
        'excluded_from_scoring',false,
        'identity_review_status','approved',
        'identity_source_url',v_source_url,
        'identity_reviewed_at',v_now,
        'identity_reviewer_user_id',p_reviewer_user_id,
        'identity_reviewer_email',p_reviewer_email,
        'identity_confidence',p_confidence,
        'qualification_status','pending_evidence',
        'credit_classification_status','not_reviewed'
      )
    ) returning id into v_company_id;
    v_created := true;
  end if;

  insert into public.candidate_identity_reviews(
    candidate_id,review_status,legal_name,cnpj,website,normalized_domain,
    identity_source_url,evidence_summary,confidence,reviewer_user_id,
    reviewer_email,review_notes,reviewed_at,updated_at
  ) values (
    p_candidate_id,'approved',v_legal_name,v_cnpj,v_website,v_domain,
    v_source_url,v_evidence,p_confidence,p_reviewer_user_id,
    p_reviewer_email,p_review_notes,v_now,v_now
  )
  on conflict(candidate_id) do update set
    review_status='approved',legal_name=excluded.legal_name,cnpj=excluded.cnpj,
    website=excluded.website,normalized_domain=excluded.normalized_domain,
    identity_source_url=excluded.identity_source_url,evidence_summary=excluded.evidence_summary,
    confidence=excluded.confidence,reviewer_user_id=excluded.reviewer_user_id,
    reviewer_email=excluded.reviewer_email,review_notes=excluded.review_notes,
    reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at;

  insert into public.company_discovery_links(
    company_id,discovered_candidate_id,match_method,confidence,metadata,updated_at
  ) values (
    v_company_id,p_candidate_id,'human_identity_review',p_confidence,
    jsonb_build_object('identity_source_url',v_source_url,'reviewed_at',v_now,'workflow_version',1),v_now
  )
  on conflict(company_id,discovered_candidate_id) do update set
    match_method='human_identity_review',confidence=excluded.confidence,
    metadata=excluded.metadata,updated_at=excluded.updated_at;

  update public.discovered_company_candidates
  set legal_name=v_legal_name,
      cnpj=v_cnpj,
      website=v_website,
      normalized_domain=v_domain,
      evidence_summary=v_evidence,
      confidence=p_confidence,
      company_id=v_company_id,
      candidate_status='promoted',
      promoted_at=v_now,
      raw_payload=coalesce(raw_payload,'{}'::jsonb) || jsonb_build_object(
        'identity_evidence_url',v_source_url,
        'legal_name_verified',true,
        'identity_review_status','approved',
        'identity_reviewed_at',v_now,
        'identity_reviewed_by_user_id',p_reviewer_user_id,
        'identity_reviewed_by_email',p_reviewer_email,
        'identity_review_notes',p_review_notes,
        'promotion_ready',true,
        'promotion_blockers','[]'::jsonb,
        'identity_quality_gate_version',2,
        'classification_status','pending_separate_credit_review',
        'company_master_created',v_created
      ),
      updated_at=v_now
  where id=p_candidate_id;

  update public.data_quality_violations
  set status='resolved',resolved_at=v_now
  where entity_table='discovered_company_candidates'
    and entity_id=p_candidate_id::text
    and rule_code in ('candidate_identity_incomplete','candidate_linked_to_ineligible_company')
    and status='open';

  return jsonb_build_object(
    'candidateId',p_candidate_id,
    'companyId',v_company_id,
    'companyCreated',v_created,
    'reviewStatus','approved',
    'decisionEligible',public.is_company_decision_eligible(v_company_id),
    'classificationStatus','pending_separate_credit_review',
    'generatedAt',v_now
  );
end;
$$;

create or replace function public.reject_candidate_identity_review(
  p_candidate_id uuid,
  p_reason text,
  p_reviewer_user_id uuid default null,
  p_reviewer_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.discovered_company_candidates%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_now timestamptz := now();
begin
  select * into v_candidate
  from public.discovered_company_candidates
  where id=p_candidate_id
  for update;

  if not found then raise exception using errcode='P0002',message='candidate not found'; end if;
  if v_candidate.candidate_status='promoted' then raise exception using errcode='23514',message='promoted candidate cannot be rejected'; end if;
  if v_reason is null or length(v_reason)<20 then raise exception using errcode='23514',message='rejection reason must contain at least 20 characters'; end if;

  insert into public.candidate_identity_reviews(
    candidate_id,review_status,reviewer_user_id,reviewer_email,review_notes,reviewed_at,updated_at
  ) values (p_candidate_id,'rejected',p_reviewer_user_id,p_reviewer_email,v_reason,v_now,v_now)
  on conflict(candidate_id) do update set
    review_status='rejected',reviewer_user_id=excluded.reviewer_user_id,
    reviewer_email=excluded.reviewer_email,review_notes=excluded.review_notes,
    reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at;

  update public.discovered_company_candidates
  set candidate_status='discarded',company_id=null,promoted_at=null,
      raw_payload=coalesce(raw_payload,'{}'::jsonb) || jsonb_build_object(
        'identity_review_status','rejected',
        'identity_reviewed_at',v_now,
        'identity_reviewed_by_user_id',p_reviewer_user_id,
        'identity_reviewed_by_email',p_reviewer_email,
        'identity_rejection_reason',v_reason,
        'promotion_ready',false,
        'promotion_blockers',jsonb_build_array('candidate_discarded'),
        'identity_quality_gate_version',2
      ),
      updated_at=v_now
  where id=p_candidate_id;

  update public.data_quality_violations
  set status='resolved',resolved_at=v_now
  where entity_table='discovered_company_candidates'
    and entity_id=p_candidate_id::text
    and rule_code='candidate_identity_incomplete'
    and status='open';

  return jsonb_build_object('candidateId',p_candidate_id,'reviewStatus','rejected','generatedAt',v_now);
end;
$$;

comment on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text)
is 'Atomically validates identity, reconciles/creates a real Company Master row, records lineage and promotes the candidate without inferring credit fields.';
comment on function public.reject_candidate_identity_review(uuid,text,uuid,text)
is 'Records a reviewed rejection and discards a discovery candidate without creating a Company Master row.';

revoke all on function public.normalize_identity_domain(text) from public,anon,authenticated;
revoke all on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reject_candidate_identity_review(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.normalize_identity_domain(text) to service_role;
grant execute on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text) to service_role;
grant execute on function public.reject_candidate_identity_review(uuid,text,uuid,text) to service_role;

notify pgrst,'reload schema';
