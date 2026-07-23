-- Candidate identity and promotion quality gate.
-- Portfolio presence is discovery evidence only; it is not evidence of legal
-- identity, credit product, receivables, FIDC fit or decision eligibility.

create or replace function public.is_valid_cnpj_checksum(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  s integer := 0;
  r integer;
  d1 integer;
  d2 integer;
  i integer;
  w1 integer[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 integer[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if length(v) <> 14 or v ~ '^(\d)\1{13}$' then return false; end if;
  for i in 1..12 loop s := s + substring(v,i,1)::integer * w1[i]; end loop;
  r := s % 11; d1 := case when r < 2 then 0 else 11-r end;
  if d1 <> substring(v,13,1)::integer then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substring(v,i,1)::integer * w2[i]; end loop;
  r := s % 11; d2 := case when r < 2 then 0 else 11-r end;
  return d2 = substring(v,14,1)::integer;
end;
$$;

create or replace function public.candidate_identity_blockers(
  p_cnpj text,
  p_website text,
  p_domain text,
  p_evidence_summary text,
  p_confidence numeric,
  p_raw_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(code order by position), '[]'::jsonb)
  from (values
    (1, 'invalid_or_missing_cnpj', not public.is_valid_cnpj_checksum(p_cnpj)),
    (2, 'missing_website', nullif(btrim(coalesce(p_website,'')), '') is null),
    (3, 'missing_normalized_domain', nullif(btrim(coalesce(p_domain,'')), '') is null),
    (4, 'identity_evidence_url_missing', nullif(btrim(coalesce(p_raw_payload->>'identity_evidence_url','')), '') is null),
    (5, 'legal_name_not_verified', coalesce(p_raw_payload->>'legal_name_verified','false') <> 'true'),
    (6, 'identity_review_not_approved', coalesce(p_raw_payload->>'identity_review_status','pending') <> 'approved'),
    (7, 'confidence_below_070', coalesce(p_confidence,0) < 0.70),
    (8, 'insufficient_identity_evidence', length(btrim(coalesce(p_evidence_summary,''))) < 40)
  ) as blockers(position, code, blocked)
  where blocked;
$$;

-- Record invalid synthetic dedupes before releasing them.
insert into public.data_quality_violations(rule_code,entity_table,entity_id,severity,status,reason,observed_value)
select 'candidate_linked_to_ineligible_company','discovered_company_candidates',d.id::text,'high','open',
  'Candidate was deduplicated against an ineligible or synthetic Company Master row.',
  jsonb_build_object('candidate_name',d.company_name,'linked_company_id',d.company_id,'candidate_status',d.candidate_status)
from public.discovered_company_candidates d
where d.company_id is not null
  and not public.is_company_decision_eligible(d.company_id)
  and not exists (
    select 1 from public.data_quality_violations v
    where v.rule_code='candidate_linked_to_ineligible_company'
      and v.entity_table='discovered_company_candidates'
      and v.entity_id=d.id::text and v.status='open'
  );

update public.discovered_company_candidates d
set company_id = null,
    candidate_status = 'captured',
    promoted_at = null,
    raw_payload = coalesce(d.raw_payload,'{}'::jsonb) || jsonb_build_object(
      'invalid_company_link_released', true,
      'identity_review_status', 'pending',
      'promotion_ready', false,
      'identity_quality_gate_version', 1
    ),
    updated_at = now()
where d.company_id is not null
  and not public.is_company_decision_eligible(d.company_id);

-- Remove profile-template assumptions from portfolio-page captures when no
-- legal identity has been reconciled.
update public.discovered_company_candidates d
set geography = null,
    segment = null,
    subsegment = null,
    company_type = null,
    credit_product = null,
    target_structure = null,
    evidence_summary = 'Presença no portfólio público confirmada; identidade jurídica, website, CNPJ, produto de crédito, recebíveis e aderência a FIDC ainda não validados.',
    raw_payload = coalesce(d.raw_payload,'{}'::jsonb) || jsonb_build_object(
      'classification_status','unverified_template_removed',
      'identity_review_status',coalesce(d.raw_payload->>'identity_review_status','pending'),
      'promotion_ready',false,
      'identity_quality_gate_version',1
    ),
    updated_at = now()
where d.raw_payload->>'origin'='vc_portfolio_page'
  and public.normalize_cnpj_digits(d.cnpj) is null
  and nullif(btrim(coalesce(d.normalized_domain,'')),'') is null;

update public.discovered_company_candidates d
set raw_payload = coalesce(d.raw_payload,'{}'::jsonb) || jsonb_build_object(
      'promotion_blockers', public.candidate_identity_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload),
      'promotion_ready', jsonb_array_length(public.candidate_identity_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload))=0
    ),
    updated_at = now()
where d.candidate_status <> 'promoted';

insert into public.data_quality_violations(rule_code,entity_table,entity_id,severity,status,reason,observed_value)
select 'candidate_identity_incomplete','discovered_company_candidates',d.id::text,'medium','open',
  'Candidate cannot be promoted until legal identity and evidence are reviewed.',
  jsonb_build_object('candidate_name',d.company_name,'blockers',d.raw_payload->'promotion_blockers','source_url',d.source_url)
from public.discovered_company_candidates d
where d.candidate_status <> 'promoted'
  and coalesce((d.raw_payload->>'promotion_ready')::boolean,false)=false
  and not exists (
    select 1 from public.data_quality_violations v
    where v.rule_code='candidate_identity_incomplete'
      and v.entity_table='discovered_company_candidates'
      and v.entity_id=d.id::text and v.status='open'
  );

create or replace function public.enforce_candidate_identity_quality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blockers jsonb;
begin
  new.raw_payload := coalesce(new.raw_payload,'{}'::jsonb);

  if new.company_id is not null and not public.is_company_decision_eligible(new.company_id) then
    if new.candidate_status='promoted' then
      raise exception using errcode='23514', message='candidate cannot be promoted to an ineligible company';
    end if;
    new.company_id := null;
    new.candidate_status := 'captured';
    new.raw_payload := new.raw_payload || jsonb_build_object('invalid_company_link_released',true,'identity_review_status','pending');
  end if;

  if new.candidate_status='deduped' and new.company_id is null then new.candidate_status := 'captured'; end if;

  v_blockers := public.candidate_identity_blockers(new.cnpj,new.website,new.normalized_domain,new.evidence_summary,new.confidence,new.raw_payload);
  new.raw_payload := new.raw_payload || jsonb_build_object(
    'promotion_blockers',v_blockers,
    'promotion_ready',jsonb_array_length(v_blockers)=0,
    'identity_quality_gate_version',1
  );

  if new.candidate_status='promoted' then
    if new.company_id is null or not public.is_company_decision_eligible(new.company_id) then
      raise exception using errcode='23514', message='promoted candidate must reference an eligible real company';
    end if;
    if jsonb_array_length(v_blockers)>0 then
      raise exception using errcode='23514', message='candidate identity review is incomplete', detail=v_blockers::text;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists discovered_candidate_identity_quality_guard on public.discovered_company_candidates;
create trigger discovered_candidate_identity_quality_guard
before insert or update of company_id,candidate_status,cnpj,website,normalized_domain,legal_name,evidence_summary,confidence,raw_payload
on public.discovered_company_candidates
for each row execute function public.enforce_candidate_identity_quality();

create or replace function public.candidate_promotion_readiness(p_candidate_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'candidateId',d.id,
    'companyName',d.company_name,
    'status',d.candidate_status,
    'ready',jsonb_array_length(public.candidate_identity_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload))=0,
    'blockers',public.candidate_identity_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload),
    'linkedCompanyId',d.company_id,
    'linkedCompanyEligible',case when d.company_id is null then false else public.is_company_decision_eligible(d.company_id) end,
    'confidence',d.confidence,
    'generatedAt',now()
  )
  from public.discovered_company_candidates d where d.id=p_candidate_id;
$$;

revoke all on function public.is_valid_cnpj_checksum(text) from public,anon,authenticated;
revoke all on function public.candidate_identity_blockers(text,text,text,text,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.candidate_promotion_readiness(uuid) from public,anon,authenticated;
grant execute on function public.is_valid_cnpj_checksum(text) to service_role;
grant execute on function public.candidate_identity_blockers(text,text,text,text,numeric,jsonb) to service_role;
grant execute on function public.candidate_promotion_readiness(uuid) to service_role;
notify pgrst,'reload schema';
