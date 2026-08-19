-- MVP Closure Gate 2: deterministic candidate -> Company Master resolution.
-- Ambiguity is handled by the treatment engine. Conflicts are quarantined; duplicates are not created.

create or replace function public.auto_resolve_verified_candidate_entities(p_limit integer default 50)
returns table(candidate_id uuid, company_id uuid, outcome text, reason text)
language plpgsql
security definer
set search_path=public
as $$
declare
  q record;
  v_limit integer := least(200,greatest(1,coalesce(p_limit,50)));
  v_company_id uuid;
  v_cnpj text;
  v_domain text;
  v_match_type text;
  v_identity_confidence numeric;
  v_cnpj_company uuid;
  v_domain_company uuid;
  v_cnpj_count integer;
  v_domain_count integer;
  v_existing_cnpj text;
  v_now timestamptz;
begin
  for q in
    select *
    from public.candidate_decision_queue_v4 c
    where c.canonical_rank=1
      and c.queue_type='commercial'
      and c.candidate_status='captured'
      and c.candidate_role='operating_company'
      and nullif(btrim(coalesce(c.website,'')),'') is not null
      and nullif(btrim(coalesce(c.normalized_domain,'')),'') is not null
      and coalesce(c.confidence,0)>=0.70
      and c.raw_payload #>> '{website_identity_capture,status}'='verified'
      and (
        (c.raw_payload #>> '{website_identity_capture,matchType}'='cnpj'
          and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.85)
        or
        (c.raw_payload #>> '{website_identity_capture,matchType}'='exact_name'
          and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.95)
        or
        (c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain'
          and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92)
      )
    order by c.priority_score desc,c.confidence desc,c.captured_at asc
    limit v_limit
  loop
    candidate_id:=q.id;
    company_id:=null;
    outcome:=null;
    reason:=null;
    v_company_id:=null;
    v_cnpj_company:=null;
    v_domain_company:=null;
    v_now:=now();
    v_domain:=lower(regexp_replace(coalesce(q.normalized_domain,''),'^www\.','','i'));
    v_cnpj:=case when coalesce(q.cnpj_valid,false) then regexp_replace(coalesce(q.cnpj,''),'\D','','g') else null end;
    v_match_type:=coalesce(q.raw_payload #>> '{website_identity_capture,matchType}','unknown');
    v_identity_confidence:=coalesce(nullif(q.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,q.confidence,0);

    -- CNPJ is the strongest canonical key when present.
    if v_cnpj is not null then
      select count(*),min(c.id)
      into v_cnpj_count,v_cnpj_company
      from public.companies c
      where regexp_replace(coalesce(c.cnpj,''),'\D','','g')=v_cnpj
        and coalesce(c.metadata->>'synthetic_seed','false')<>'true';
    else
      v_cnpj_count:=0;
    end if;

    -- Domain is the next deterministic key. Multiple live companies on one domain are ambiguous.
    select count(*),min(c.id)
    into v_domain_count,v_domain_company
    from public.companies c
    where lower(regexp_replace(coalesce(c.domain,''),'^www\.','','i'))=v_domain
      and coalesce(c.metadata->>'synthetic_seed','false')<>'true';

    if v_cnpj_count>1 or v_domain_count>1 or
       (v_cnpj_company is not null and v_domain_company is not null and v_cnpj_company<>v_domain_company) then
      update public.discovered_company_candidates d
      set raw_payload=coalesce(d.raw_payload,'{}'::jsonb)||jsonb_build_object(
            'entity_resolution_conflict',jsonb_build_object(
              'version','auto_entity_resolution_v1','status','quarantined',
              'reason','canonical_key_conflict','cnpjCompanyId',v_cnpj_company,
              'domainCompanyId',v_domain_company,'observedAt',v_now
            )
          ),
          updated_at=v_now
      where d.id=q.id;
      outcome:='quarantined'; reason:='canonical_key_conflict'; return next; continue;
    end if;

    v_company_id:=coalesce(v_cnpj_company,v_domain_company);

    if v_company_id is not null and v_cnpj is not null then
      select regexp_replace(coalesce(c.cnpj,''),'\D','','g') into v_existing_cnpj
      from public.companies c where c.id=v_company_id;
      if nullif(v_existing_cnpj,'') is not null and v_existing_cnpj<>v_cnpj then
        update public.discovered_company_candidates d
        set raw_payload=coalesce(d.raw_payload,'{}'::jsonb)||jsonb_build_object(
              'entity_resolution_conflict',jsonb_build_object(
                'version','auto_entity_resolution_v1','status','quarantined',
                'reason','domain_cnpj_conflict','existingCompanyId',v_company_id,
                'candidateCnpj',v_cnpj,'existingCnpj',v_existing_cnpj,'observedAt',v_now
              )
            ),
            updated_at=v_now
        where d.id=q.id;
        outcome:='quarantined'; reason:='domain_cnpj_conflict'; return next; continue;
      end if;
    end if;

    if v_company_id is null then
      insert into public.companies(
        legal_name,trade_name,normalized_name,cnpj,domain,website_url,website,
        sector,sub_sector,segment,subsegment,geography,company_type,origin,metadata,created_at,updated_at
      ) values (
        coalesce(nullif(btrim(q.legal_name),''),nullif(btrim(q.company_name),'')),
        coalesce(nullif(btrim(q.company_name),''),nullif(btrim(q.legal_name),''),'Empresa sem nome'),
        lower(regexp_replace(coalesce(nullif(btrim(q.company_name),''),nullif(btrim(q.legal_name),''),'empresa'),'[^a-zA-Z0-9]+','','g')),
        v_cnpj,
        v_domain,
        q.website,
        q.website,
        q.segment,
        q.subsegment,
        q.segment,
        q.subsegment,
        q.geography,
        coalesce(nullif(q.company_type,''),'company'),
        'automatic_candidate_entity_resolution',
        jsonb_build_object(
          'data_status','real',
          'synthetic_seed',false,
          'identity_verified',true,
          'identity_review_status','approved',
          'identity_review_method','automatic_deterministic',
          'identity_confidence',v_identity_confidence,
          'identity_source_url',coalesce(q.raw_payload->>'identity_evidence_url',q.website,q.source_url),
          'entity_resolution_eligible',true,
          'monitoring_eligible',true,
          'decision_eligible',false,
          'decision_eligibility_reason','auto_identity_verified_pending_origination_qualification',
          'excluded_from_entity_resolution',false,
          'excluded_from_monitoring',false,
          'excluded_from_qualification',false,
          'excluded_from_scoring',false,
          'legal_name_provisional',(nullif(btrim(q.legal_name),'') is null),
          'auto_entity_resolution',jsonb_build_object(
            'version','auto_entity_resolution_v1','matchType',v_match_type,
            'confidence',v_identity_confidence,'candidateId',q.id,'resolvedAt',v_now
          )
        ),
        v_now,v_now
      ) returning id into v_company_id;
      outcome:='created';
    else
      update public.companies c
      set legal_name=coalesce(nullif(c.legal_name,''),nullif(q.legal_name,''),nullif(q.company_name,'')),
          trade_name=coalesce(nullif(c.trade_name,''),nullif(q.company_name,''),nullif(q.legal_name,''),'Empresa sem nome'),
          cnpj=coalesce(nullif(c.cnpj,''),v_cnpj),
          domain=coalesce(nullif(c.domain,''),v_domain),
          website_url=coalesce(nullif(c.website_url,''),q.website),
          website=coalesce(nullif(c.website,''),q.website),
          metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
            'data_status','real','synthetic_seed',false,'identity_verified',true,
            'identity_review_status','approved','identity_review_method','automatic_deterministic',
            'identity_confidence',greatest(coalesce(nullif(c.metadata->>'identity_confidence','')::numeric,0),v_identity_confidence),
            'identity_source_url',coalesce(q.raw_payload->>'identity_evidence_url',q.website,q.source_url),
            'entity_resolution_eligible',true,'monitoring_eligible',true,
            'excluded_from_entity_resolution',false,'excluded_from_monitoring',false,
            'auto_entity_resolution',jsonb_build_object(
              'version','auto_entity_resolution_v1','matchType',v_match_type,
              'confidence',v_identity_confidence,'candidateId',q.id,'resolvedAt',v_now
            )
          ),
          updated_at=v_now
      where c.id=v_company_id;
      outcome:='linked';
    end if;

    insert into public.company_discovery_links(company_id,discovered_candidate_id,match_method,confidence,metadata,created_at,updated_at)
    values(v_company_id,q.id,'automatic_deterministic_identity',least(1,greatest(0,v_identity_confidence)),
      jsonb_build_object('version','auto_entity_resolution_v1','matchType',v_match_type,'domain',v_domain,'cnpj',v_cnpj),v_now,v_now)
    on conflict (company_id,discovered_candidate_id) do update set
      match_method=excluded.match_method,confidence=greatest(public.company_discovery_links.confidence,excluded.confidence),
      metadata=public.company_discovery_links.metadata||excluded.metadata,updated_at=v_now;

    update public.discovered_company_candidates d
    set company_id=v_company_id,
        candidate_status='promoted',
        promoted_at=coalesce(d.promoted_at,v_now),
        legal_name=coalesce(nullif(d.legal_name,''),nullif(d.company_name,'')),
        raw_payload=coalesce(d.raw_payload,'{}'::jsonb)||jsonb_build_object(
          'legal_name_verified',true,
          'identity_review_status','approved',
          'identity_review_method','automatic_deterministic',
          'identity_evidence_url',coalesce(d.raw_payload->>'identity_evidence_url',d.website,d.source_url),
          'entityResolution',jsonb_build_object(
            'version','auto_entity_resolution_v1','autoMatched',true,'companyId',v_company_id,
            'method',v_match_type,'confidence',v_identity_confidence,'resolvedAt',v_now
          )
        ),
        updated_at=v_now
    where d.id=q.id;

    perform public.enqueue_company_origination_reprocessing(v_company_id,'automatic_entity_resolution');

    company_id:=v_company_id; reason:='verified_first_party_identity'; return next;
  end loop;
end;
$$;

revoke all on function public.auto_resolve_verified_candidate_entities(integer) from public,anon,authenticated;
grant execute on function public.auto_resolve_verified_candidate_entities(integer) to service_role;

-- Keep ambiguity treatment inside the ingestion/treatment engine.
do $$
declare existing_job bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into existing_job from cron.job where jobname='candidate-automatic-entity-resolution' limit 1;
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'candidate-automatic-entity-resolution',
      '*/15 * * * *',
      $job$select * from public.auto_resolve_verified_candidate_entities(50);$job$
    );
  end if;
end;
$$;
