-- Neon-native commercial decision gates for Origination Intelligence.
-- Keeps entity verification separate from ICP decision eligibility and persists material triggers
-- with lineage/dedupe/staleness. Heavy downstream recomputation stays in the canonical queue.

create or replace function public.parse_headcount_floor(p_value text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_match text[];
  v_digits text;
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then return null; end if;
  v_match := regexp_match(p_value,'([0-9][0-9\.,]*)');
  if v_match is null then return null; end if;
  v_digits := regexp_replace(v_match[1],'[^0-9]','','g');
  if v_digits='' then return null; end if;
  return least(1000000,v_digits::integer);
exception when others then
  return null;
end;
$$;

create or replace function public.company_verified_headcount_floor(p_company_id uuid)
returns integer
language sql
security invoker
stable
set search_path = ''
as $$
  with company_values as (
    select greatest(
      coalesce(public.parse_headcount_floor(c.metadata->>'icp_headcount_verified_min'),0),
      coalesce(public.parse_headcount_floor(c.metadata->>'employee_count'),0),
      coalesce(public.parse_headcount_floor(c.metadata->>'headcount'),0)
    )::integer as value
    from public.companies c
    where c.id=p_company_id
  ), metric_values as (
    select coalesce(max(m.metric_value),0)::integer as value
    from public.company_source_metric_snapshots m
    where m.company_id=p_company_id
      and lower(m.metric_key) in ('employee_count','employees','headcount','linkedin_employee_count','company_employee_count')
      and m.metric_value is not null
      and m.metric_value>=0
      and m.observed_vs_inferred='observed'
      and m.observed_at>=now()-interval '365 days'
      and (case when m.confidence_score>1 then m.confidence_score/100.0 else m.confidence_score end)>=0.60
  ), linked_candidate_values as (
    select coalesce(max(
      nullif(regexp_replace(coalesce(dc.raw_payload#>>'{firmographic_evidence,headcountMin}',''),'[^0-9]','','g'),'')::integer
    ),0)::integer as value
    from public.company_discovery_links dl
    join public.discovered_company_candidates dc on dc.id=dl.discovered_candidate_id
    where dl.company_id=p_company_id
      and nullif(dc.raw_payload#>>'{firmographic_evidence,provider}','') is not null
      and coalesce(dc.updated_at,dc.captured_at,dc.created_at)>=now()-interval '365 days'
  )
  select nullif(greatest(
    coalesce((select value from company_values),0),
    coalesce((select value from metric_values),0),
    coalesce((select value from linked_candidate_values),0)
  ),0);
$$;

create or replace function public.is_company_origination_icp_eligible(p_company_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = ''
as $$
  select coalesce((
    select
      public.is_company_entity_eligible(c.id)
      and coalesce(c.metadata->>'credit_review_status','') <> 'rejected'
      and coalesce(c.metadata->>'qualification_status','') <> 'ineligible'
      and not coalesce((c.metadata->>'synthetic_seed')::boolean,false)
      and (
        coalesce((c.metadata->>'icp_headcount_override')::boolean,false)
        or coalesce(public.company_verified_headcount_floor(c.id),0)>=50
      )
      and (
        coalesce(c.metadata->>'icp_status','')='eligible'
        or exists (
          select 1
          from public.company_discovery_links dl
          join public.discovered_company_candidates dc on dc.id=dl.discovered_candidate_id
          join public.search_profiles sp on sp.id=dc.search_profile_id
          where dl.company_id=c.id
            and sp.active
            and not coalesce((sp.config->>'qaSmoke')::boolean,false)
            and coalesce(sp.min_employee_count,0)>=50
            and lower(coalesce(sp.geography,'')) in ('br','brasil','brazil')
            and coalesce(dc.confidence,0)>=0.60
            and coalesce(dc.company_type,'') not ilike '%veículo%'
            and coalesce(dc.company_name,'') not ilike '%fundo de investimento%'
            and (
              coalesce((c.metadata->>'icp_headcount_override')::boolean,false)
              or coalesce(public.company_verified_headcount_floor(c.id),0)>=greatest(50,sp.min_employee_count)
            )
            and (
              lower(coalesce(dc.segment,'')) ~ '(fintech|embedded finance|marketplace|tech|receivables|recebíveis|crédito|credito)'
              or lower(coalesce(dc.credit_product,'')) ~ '(crédito|credito|receiv|antecip|financ|fidc)'
              or coalesce(c.credit_product,false)
              or coalesce(c.has_receivables,false)
              or coalesce(c.fit_fidc,false)
              or coalesce(c.fit_dcm,false)
            )
        )
      )
    from public.companies c
    where c.id=p_company_id
  ),false);
$$;

create or replace function public.is_company_decision_eligible(p_company_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = ''
as $$
  select public.is_company_origination_icp_eligible(p_company_id);
$$;

comment on function public.is_company_decision_eligible(uuid) is
  'Commercial decision gate: verified real entity + observed/overridden 50+ headcount + explicit ICP or governed active Search Profile fit. Identity verification alone grants analytics, not commercial decision eligibility.';

revoke all on function public.parse_headcount_floor(text) from public, anon, authenticated;
revoke all on function public.company_verified_headcount_floor(uuid) from public, anon, authenticated;
revoke all on function public.is_company_origination_icp_eligible(uuid) from public, anon, authenticated;
revoke all on function public.is_company_decision_eligible(uuid) from public, anon, authenticated;
grant execute on function public.parse_headcount_floor(text) to service_role;
grant execute on function public.company_verified_headcount_floor(uuid) to service_role;
grant execute on function public.is_company_origination_icp_eligible(uuid) to service_role;
grant execute on function public.is_company_decision_eligible(uuid) to service_role;

create or replace function public.reconcile_company_origination_eligibility(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity boolean;
  v_icp boolean;
  v_headcount integer;
begin
  if p_company_id is null then return; end if;
  v_entity := public.is_company_entity_eligible(p_company_id);
  v_headcount := public.company_verified_headcount_floor(p_company_id);
  v_icp := case when v_entity then public.is_company_origination_icp_eligible(p_company_id) else false end;

  update public.companies c
  set metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
        'origination_analytics_eligible',v_entity,
        'decision_eligible',v_icp,
        'decision_eligibility_reason',case
          when not v_entity then 'entity_not_verified'
          when v_icp then 'origination_icp_gate_v4'
          when coalesce(v_headcount,0)<50 then 'identity_verified_headcount_unverified_or_below_50'
          else 'identity_verified_pending_icp'
        end,
        'credit_approval_separate',true,
        'icp_gate_version',4,
        'icp_headcount_requirement',50,
        'icp_verified_headcount_floor',v_headcount,
        'icp_gate_evaluated_at',now()
      ),
      updated_at=now()
  where c.id=p_company_id
    and (
      coalesce((c.metadata->>'origination_analytics_eligible')::boolean,false) is distinct from v_entity
      or coalesce((c.metadata->>'decision_eligible')::boolean,false) is distinct from v_icp
      or coalesce(c.metadata->>'icp_gate_version','')<>'4'
      or nullif(c.metadata->>'icp_verified_headcount_floor','')::integer is distinct from v_headcount
    );
end;
$$;
revoke all on function public.reconcile_company_origination_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_company_origination_eligibility(uuid) to service_role;

create or replace function public.trg_reconcile_company_origination_eligibility()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.reconcile_company_origination_eligibility(
    case when tg_op='DELETE' then old.company_id else new.company_id end
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.trg_reconcile_company_origination_eligibility() from public, anon, authenticated;
grant execute on function public.trg_reconcile_company_origination_eligibility() to service_role;

drop trigger if exists trg_reconcile_company_origination_eligibility_from_link on public.company_discovery_links;
create trigger trg_reconcile_company_origination_eligibility_from_link
after insert or update or delete on public.company_discovery_links
for each row execute function public.trg_reconcile_company_origination_eligibility();

drop trigger if exists trg_reconcile_company_origination_eligibility_from_metric on public.company_source_metric_snapshots;
create trigger trg_reconcile_company_origination_eligibility_from_metric
after insert or update or delete on public.company_source_metric_snapshots
for each row execute function public.trg_reconcile_company_origination_eligibility();

update public.search_profile_runs
set run_status='failed',
    finished_at=coalesce(finished_at,now()),
    notes=concat_ws(' ',nullif(notes,''),'Recovered by stale-run watchdog: run exceeded 2 hours.'),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('staleRunRecovered',true,'watchdogVersion','neon_icp_gate_v4','recoveredAt',now()),
    updated_at=now()
where run_status in ('queued','running')
  and started_at < now()-interval '2 hours';

create table if not exists public.trigger_catalog (
  code text primary key,
  trigger_type text not null,
  signal_types text[] not null default '{}',
  min_strength numeric not null default 65 check (min_strength between 0 and 100),
  min_confidence numeric not null default 0.60 check (min_confidence between 0 and 1),
  staleness_days integer not null default 180 check (staleness_days between 1 and 730),
  material_default boolean not null default true,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.trigger_catalog(code,trigger_type,signal_types,min_strength,min_confidence,staleness_days,description)
values
 ('funding_gap','funding_need',array['funding_gap_signal','capital_mismatch','growth_without_funding'],70,0.65,120,'Necessidade ou desalinhamento de funding com evidência material.'),
 ('fidc_readiness','fidc_readiness',array['fidc_fit_signal','receivables_strong','receivables_detected'],75,0.70,180,'Recebíveis ou prontidão para estrutura FIDC.'),
 ('dcm_readiness','dcm_readiness',array['dcm_fit_signal','market_access_signal'],74,0.70,180,'Acesso ou prontidão para DCM.'),
 ('credit_expansion','credit_expansion',array['credit_product_detected','credit_product_signal','origination_acceleration'],78,0.65,120,'Expansão observada de produto/originação de crédito.'),
 ('funding_event','funding_event',array['media_funding_event_signal','structured_debt_event','fidc_event'],78,0.60,120,'Evento de funding, FIDC ou dívida estruturada.'),
 ('people_capital','people_capital',array['headcount_acceleration','capital_markets_hiring','funding_team_hiring','credit_buildout'],65,0.65,90,'Mudança de headcount ou contratação ligada a crédito/capital markets.'),
 ('regulatory_change','regulatory_change',array['regulatory_event'],78,0.75,90,'Evento regulatório com potencial efeito financeiro.')
on conflict (code) do update set
 trigger_type=excluded.trigger_type,signal_types=excluded.signal_types,min_strength=excluded.min_strength,
 min_confidence=excluded.min_confidence,staleness_days=excluded.staleness_days,
 description=excluded.description,active=true,updated_at=now();

alter table public.trigger_events
  add column if not exists signal_id uuid references public.company_signals(id) on delete set null,
  add column if not exists title text,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists confidence_score numeric,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists material boolean not null default false,
  add column if not exists stale_after timestamptz,
  add column if not exists catalog_code text references public.trigger_catalog(code) on update cascade on delete set null;

create unique index if not exists uq_trigger_events_dedupe_key
  on public.trigger_events(dedupe_key) where dedupe_key is not null;
create index if not exists idx_trigger_events_material_company_time
  on public.trigger_events(company_id,material,occurred_at desc);

create or replace function public.persist_material_trigger_from_signal()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  cfg public.trigger_catalog%rowtype;
  v_strength numeric;
  v_confidence numeric;
  v_final_strength integer;
  v_observed timestamptz;
  v_material boolean;
  v_dedupe text;
  v_explicit_multiplier numeric;
begin
  if new.company_id is null or not public.is_company_entity_eligible(new.company_id) then return new; end if;

  select * into cfg from public.trigger_catalog c
  where c.active and new.signal_type=any(c.signal_types)
  order by c.min_strength desc limit 1;
  if cfg.code is null then return new; end if;

  v_strength:=least(100,greatest(0,coalesce(new.signal_strength,new.strength,0)));
  v_confidence:=least(1,greatest(0,coalesce(new.confidence_score,case when coalesce(new.confidence,0)>1 then new.confidence/100.0 else new.confidence end,0)));
  v_observed:=coalesce(new.observed_at,new.created_at,now());
  v_explicit_multiplier:=case when coalesce(new.is_explicit,false) or coalesce(new.observed_vs_inferred,'')='observed' then 1 else 0.80 end;
  v_final_strength:=least(100,greatest(0,round(v_strength*v_confidence*v_explicit_multiplier)))::integer;
  v_material:=cfg.material_default and v_strength>=cfg.min_strength and v_confidence>=cfg.min_confidence
    and v_observed>=now()-make_interval(days=>cfg.staleness_days);

  v_dedupe:=md5(new.company_id::text||'|'||cfg.code||'|'||to_char(v_observed at time zone 'UTC','YYYY-MM-DD'));

  insert into public.trigger_events(
    company_id,signal_id,source_id,trigger_type,trigger_strength,title,description,occurred_at,
    metadata,confidence_score,evidence_payload,dedupe_key,material,stale_after,catalog_code,created_at
  ) values (
    new.company_id,new.id,new.source_id,cfg.trigger_type,v_final_strength,coalesce(nullif(new.signal_label,''),cfg.trigger_type),
    coalesce(nullif(new.evidence_text,''),'Trigger derivado de sinal persistido com lineage.'),v_observed,
    jsonb_build_object('engineVersion','material_trigger_v2','signalType',new.signal_type,'rawStrength',v_strength,'explicitMultiplier',v_explicit_multiplier),
    v_confidence,
    jsonb_build_object('signalId',new.id,'monitoringOutputId',new.monitoring_output_id,'sourceId',new.source_id,
      'evidenceUrl',new.evidence_url,'evidenceText',new.evidence_text,'signalEvidence',coalesce(new.evidence_payload,'{}'::jsonb)),
    v_dedupe,v_material,v_observed+make_interval(days=>cfg.staleness_days),cfg.code,now()
  )
  on conflict (dedupe_key) where dedupe_key is not null do update set
    signal_id=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.signal_id else public.trigger_events.signal_id end,
    trigger_strength=greatest(public.trigger_events.trigger_strength,excluded.trigger_strength),
    confidence_score=greatest(coalesce(public.trigger_events.confidence_score,0),coalesce(excluded.confidence_score,0)),
    title=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.title else public.trigger_events.title end,
    description=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.description else public.trigger_events.description end,
    source_id=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.source_id else public.trigger_events.source_id end,
    evidence_payload=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.evidence_payload else public.trigger_events.evidence_payload end,
    metadata=coalesce(public.trigger_events.metadata,'{}'::jsonb)||excluded.metadata||jsonb_build_object('deduped',true,'updatedAt',now()),
    material=public.trigger_events.material or excluded.material,
    stale_after=greatest(public.trigger_events.stale_after,excluded.stale_after);

  if v_material and public.is_company_decision_eligible(new.company_id) then
    perform public.enqueue_company_origination_reprocessing(new.company_id,'material_trigger:'||cfg.code);
  end if;
  return new;
end;
$$;
revoke all on function public.persist_material_trigger_from_signal() from public, anon, authenticated;
grant execute on function public.persist_material_trigger_from_signal() to service_role;

drop trigger if exists trg_persist_material_trigger_from_signal on public.company_signals;
create trigger trg_persist_material_trigger_from_signal
after insert or update of signal_strength,strength,confidence_score,confidence,evidence_payload on public.company_signals
for each row execute function public.persist_material_trigger_from_signal();

insert into public.source_catalog(
  name,url,category,scope,priority,criticality,frequency,status,validation_rule,metadata,
  source_type,auth_requirement,rate_limit_notes,health,source_tier,geography_scope,collection_method,cadence,
  priority_score,reliability_score,schema_contract,contract_status,freshness_sla_hours,pii_classification,cost_policy,drift_policy
)
values(
  'External B2B Firmographic Enrichment',null,'firmographics','BR',2,'high','on_demand','real',
  'Persist only matched company identity, provider business id, observed employee range and observation timestamp. Never promote identity from firmographics alone.',
  jsonb_build_object('code','src_external_b2b_firmographics','provider','operator_connector','captureMode','operator_enrichment_connector','decisionUse','headcount_evidence_only','identityAuthority',false,'scheduled',false),
  'b2b_enrichment','external_connector','On-demand only; do not schedule bulk capture.','healthy',2,'BR','connector','on_demand',
  82,0.70,
  jsonb_build_object('required',jsonb_build_array('company_name_or_domain','observed_at'),'optional',jsonb_build_array('employee_count','employee_range','provider_business_id')),
  'active',8760,'business_contact',
  jsonb_build_object('cost','connector_dependent','bulk_schedule',false),
  jsonb_build_object('on_schema_change','quarantine')
)
on conflict ((metadata->>'code')) where coalesce(metadata->>'code','')<>'' do update set
  validation_rule=excluded.validation_rule,
  metadata=public.source_catalog.metadata||excluded.metadata,
  status='real',
  health='healthy',
  updated_at=now();

do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.reconcile_company_origination_eligibility(r.id);
  end loop;
end;
$$;
