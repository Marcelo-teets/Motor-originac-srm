-- P2-001..004, P2-008..009: real trigger catalog, deduped persistence,
-- material-trigger qualification/lead recalculation and staleness-aware ranking.

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

alter table public.trigger_catalog enable row level security;
drop policy if exists trigger_catalog_authenticated_select on public.trigger_catalog;
create policy trigger_catalog_authenticated_select on public.trigger_catalog for select to authenticated using ((select auth.uid()) is not null);
revoke all on public.trigger_catalog from anon;
grant select on public.trigger_catalog to authenticated;
grant select,insert,update,delete on public.trigger_catalog to service_role;

alter table public.trigger_events add column if not exists source_id uuid references public.source_catalog(id) on delete set null;
alter table public.trigger_events add column if not exists confidence_score numeric;
alter table public.trigger_events add column if not exists evidence_payload jsonb not null default '{}'::jsonb;
alter table public.trigger_events add column if not exists dedupe_key text;
alter table public.trigger_events add column if not exists material boolean not null default false;
alter table public.trigger_events add column if not exists stale_after timestamptz;
alter table public.trigger_events add column if not exists catalog_code text references public.trigger_catalog(code) on update cascade on delete set null;

create unique index if not exists uq_trigger_events_dedupe_key on public.trigger_events(dedupe_key) where dedupe_key is not null;
create index if not exists idx_trigger_events_material_company_time on public.trigger_events(company_id,material,occurred_at desc);

-- Trigger events are machine-generated decision artifacts. Browser users can read, not forge them.
drop policy if exists authenticated_insert on public.trigger_events;
drop policy if exists authenticated_update on public.trigger_events;
drop policy if exists authenticated_delete on public.trigger_events;
revoke insert,update,delete on public.trigger_events from authenticated;
grant select,insert,update,delete on public.trigger_events to service_role;

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
  v_final_strength numeric;
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
  v_final_strength:=least(100,greatest(0,round(v_strength*v_confidence*v_explicit_multiplier,2)));
  v_material:=cfg.material_default and v_strength>=cfg.min_strength and v_confidence>=cfg.min_confidence
    and v_observed>=now()-make_interval(days=>cfg.staleness_days);

  -- One economic trigger family per company/day. The strongest evidence wins.
  v_dedupe:=md5(new.company_id::text||'|'||cfg.code||'|'||to_char(v_observed at time zone 'UTC','YYYY-MM-DD'));

  insert into public.trigger_events(
    company_id,signal_id,trigger_type,trigger_strength,title,description,occurred_at,metadata,created_at,
    source_id,confidence_score,evidence_payload,dedupe_key,material,stale_after,catalog_code
  ) values (
    new.company_id,new.id,cfg.trigger_type,v_final_strength,coalesce(nullif(new.signal_label,''),cfg.trigger_type),
    coalesce(nullif(new.evidence_text,''),'Trigger derivado de sinal persistido com lineage.'),v_observed,
    jsonb_build_object('engineVersion','material_trigger_v1','signalType',new.signal_type,'rawStrength',v_strength,'explicitMultiplier',v_explicit_multiplier),now(),
    new.source_id,v_confidence,
    jsonb_build_object('signalId',new.id,'monitoringOutputId',new.monitoring_output_id,'sourceId',new.source_id,
      'evidenceUrl',new.evidence_url,'evidenceText',new.evidence_text,'signalEvidence',coalesce(new.evidence_payload,'{}'::jsonb)),
    v_dedupe,v_material,v_observed+make_interval(days=>cfg.staleness_days),cfg.code
  )
  on conflict (dedupe_key) where dedupe_key is not null do update set
    signal_id=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.signal_id else public.trigger_events.signal_id end,
    trigger_strength=greatest(public.trigger_events.trigger_strength,excluded.trigger_strength),
    confidence_score=greatest(coalesce(public.trigger_events.confidence_score,0),coalesce(excluded.confidence_score,0)),
    title=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.title else public.trigger_events.title end,
    description=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.description else public.trigger_events.description end,
    source_id=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.source_id else public.trigger_events.source_id end,
    evidence_payload=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.evidence_payload else public.trigger_events.evidence_payload end,
    metadata=public.trigger_events.metadata||excluded.metadata||jsonb_build_object('deduped',true,'updatedAt',now()),
    material=public.trigger_events.material or excluded.material,
    stale_after=greatest(public.trigger_events.stale_after,excluded.stale_after);

  if v_material then perform public.enqueue_company_origination_reprocessing(new.company_id,'material_trigger:'||cfg.code); end if;
  return new;
end;
$$;

revoke all on function public.persist_material_trigger_from_signal() from public,anon,authenticated;
grant execute on function public.persist_material_trigger_from_signal() to service_role;

drop trigger if exists trg_persist_material_trigger_from_signal on public.company_signals;
create trigger trg_persist_material_trigger_from_signal
after insert or update of signal_strength,strength,confidence_score,confidence,evidence_payload on public.company_signals
for each row execute function public.persist_material_trigger_from_signal();

-- Backfill first, before the downstream recalculation trigger exists. This keeps migration load bounded.
insert into public.trigger_events(
  company_id,signal_id,trigger_type,trigger_strength,title,description,occurred_at,metadata,created_at,
  source_id,confidence_score,evidence_payload,dedupe_key,material,stale_after,catalog_code
)
select distinct on (s.company_id,c.code,(coalesce(s.observed_at,s.created_at) at time zone 'UTC')::date)
  s.company_id,s.id,c.trigger_type,
  least(100,greatest(0,round(
    coalesce(s.signal_strength,s.strength,0)*
    least(1,greatest(0,coalesce(s.confidence_score,case when coalesce(s.confidence,0)>1 then s.confidence/100.0 else s.confidence end,0)))*
    case when coalesce(s.is_explicit,false) or coalesce(s.observed_vs_inferred,'')='observed' then 1 else 0.80 end,2))),
  coalesce(nullif(s.signal_label,''),c.trigger_type),coalesce(nullif(s.evidence_text,''),'Trigger backfilled from persisted signal.'),
  coalesce(s.observed_at,s.created_at),jsonb_build_object('engineVersion','material_trigger_v1','backfill',true,'signalType',s.signal_type),now(),
  s.source_id,least(1,greatest(0,coalesce(s.confidence_score,case when coalesce(s.confidence,0)>1 then s.confidence/100.0 else s.confidence end,0))),
  jsonb_build_object('signalId',s.id,'monitoringOutputId',s.monitoring_output_id,'sourceId',s.source_id,'evidenceUrl',s.evidence_url,'evidenceText',s.evidence_text,'signalEvidence',coalesce(s.evidence_payload,'{}'::jsonb)),
  md5(s.company_id::text||'|'||c.code||'|'||to_char(coalesce(s.observed_at,s.created_at) at time zone 'UTC','YYYY-MM-DD')),
  coalesce(s.signal_strength,s.strength,0)>=c.min_strength
    and least(1,greatest(0,coalesce(s.confidence_score,case when coalesce(s.confidence,0)>1 then s.confidence/100.0 else s.confidence end,0)))>=c.min_confidence
    and coalesce(s.observed_at,s.created_at)>=now()-make_interval(days=>c.staleness_days),
  coalesce(s.observed_at,s.created_at)+make_interval(days=>c.staleness_days),c.code
from public.company_signals s
join public.trigger_catalog c on c.active and s.signal_type=any(c.signal_types)
where public.is_company_entity_eligible(s.company_id) and coalesce(s.observed_at,s.created_at)>=now()-interval '180 days'
order by s.company_id,c.code,(coalesce(s.observed_at,s.created_at) at time zone 'UTC')::date,
  coalesce(s.signal_strength,s.strength,0)*least(1,greatest(0,coalesce(s.confidence_score,case when coalesce(s.confidence,0)>1 then s.confidence/100.0 else s.confidence end,0))) desc,s.created_at desc
on conflict (dedupe_key) where dedupe_key is not null do update set
  trigger_strength=greatest(public.trigger_events.trigger_strength,excluded.trigger_strength),
  confidence_score=greatest(coalesce(public.trigger_events.confidence_score,0),coalesce(excluded.confidence_score,0)),
  material=public.trigger_events.material or excluded.material,
  evidence_payload=case when excluded.trigger_strength>public.trigger_events.trigger_strength then excluded.evidence_payload else public.trigger_events.evidence_payload end,
  stale_after=greatest(public.trigger_events.stale_after,excluded.stale_after),
  metadata=public.trigger_events.metadata||jsonb_build_object('backfillDeduped',true);

create or replace function public.recalculate_decision_layers_from_trigger(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  q public.qualification_snapshots%rowtype;
  t public.trigger_events%rowtype;
  v_qscore numeric;
  v_timing numeric;
  v_execution numeric;
  v_conf numeric;
  v_lead numeric;
  v_bucket text;
  v_payload jsonb;
begin
  if p_company_id is null or not public.is_company_decision_eligible(p_company_id) then return; end if;

  select * into t from public.trigger_events
  where company_id=p_company_id and material and coalesce(stale_after,now())>=now()
  order by trigger_strength desc,occurred_at desc,id desc limit 1;
  if t.id is null then return; end if;

  select * into q from public.qualification_snapshots where company_id=p_company_id order by created_at desc,id desc limit 1;

  if q.id is null then
    v_qscore:=least(100,greatest(0,round(t.trigger_strength*0.70)));
    v_timing:=least(100,greatest(0,round(t.trigger_strength)));
    v_execution:=50;
    v_conf:=coalesce(t.confidence_score,0.50);
    insert into public.qualification_snapshots(
      company_id,snapshot_version,structural_need_score,timing_score,executability_score,total_score,
      rationale,next_action,evidence,created_by,qualification_score_total,urgency_score,predicted_funding_need_score,
      source_confidence_score,trigger_strength_score,confidence_score,qualification_score_structural,
      qualification_score_execution,qualification_score_timing,evidence_payload,created_at
    ) values (
      p_company_id,'p2_trigger_v1',v_qscore,v_timing,v_execution,v_qscore,
      'Qualification baseline criada por trigger material; campos sem evidência permanecem conservadores.',
      'Validar funding, recebíveis, ticket, prazo e responsável financeiro.',jsonb_build_object('materialTrigger',to_jsonb(t)),
      'material_trigger_engine',v_qscore,v_timing,greatest(v_qscore,t.trigger_strength),v_conf,t.trigger_strength,v_conf,
      v_qscore,v_execution,v_timing,jsonb_build_object('materialTrigger',to_jsonb(t)),now()
    );
  else
    v_qscore:=coalesce(q.qualification_score_total,q.total_score,0);
    v_timing:=least(100,greatest(coalesce(q.qualification_score_timing,q.timing_score,0),t.trigger_strength));
    v_execution:=coalesce(q.qualification_score_execution,q.executability_score,50);
    v_conf:=greatest(coalesce(q.source_confidence_score,q.confidence_score,0),coalesce(t.confidence_score,0));
    v_payload:=to_jsonb(q)||jsonb_build_object(
      'id',gen_random_uuid(),'snapshot_version','p2_trigger_v1','timing','material_trigger','timing_score',v_timing,
      'qualification_score_timing',v_timing,'urgency_score',greatest(coalesce(q.urgency_score,0),v_timing),
      'trigger_strength_score',t.trigger_strength,'source_confidence_score',v_conf,
      'confidence_score',greatest(coalesce(q.confidence_score,0),v_conf),
      'predicted_funding_need_score',greatest(coalesce(q.predicted_funding_need_score,0),case when t.catalog_code='funding_gap' then t.trigger_strength else 0 end),
      'rationale',concat_ws(' ',q.rationale,'Trigger material '||t.trigger_type||' incorporado com dedupe e staleness.'),
      'rationale_summary',concat_ws(' ',q.rationale_summary,'Atualizado por trigger material.'),
      'evidence_payload',coalesce(q.evidence_payload,'{}'::jsonb)||jsonb_build_object('materialTrigger',to_jsonb(t)),
      'created_by','material_trigger_engine','created_at',now()
    );
    insert into public.qualification_snapshots select (jsonb_populate_record(null::public.qualification_snapshots,v_payload)).*;
  end if;

  select * into q from public.qualification_snapshots where company_id=p_company_id order by created_at desc,id desc limit 1;
  v_lead:=least(100,greatest(0,round(
    coalesce(q.qualification_score_total,q.total_score,0)*0.70+
    coalesce(q.trigger_strength_score,0)*0.20+
    least(1,greatest(0,coalesce(q.source_confidence_score,q.confidence_score,0)))*100*0.10
  )));
  v_bucket:=case when v_lead>=85 then 'immediate_priority' when v_lead>=70 then 'high_priority'
    when v_lead>=55 then 'monitor_closely' when v_lead>=40 then 'watchlist' else 'low_priority' end;

  insert into public.lead_score_snapshots(company_id,lead_score,priority_tier,commercial_angle,suggested_structure,next_action,rationale,bucket,source_confidence,trigger_strength,pattern_score,created_at)
  values(p_company_id,v_lead,v_bucket,'Prioridade recalculada por trigger material com evidência persistida e staleness controlado.',
    q.suggested_structure_type,q.next_action,'Lead score p2_trigger_v1: qualification 70%, trigger 20%, source confidence 10%.',
    v_bucket,q.source_confidence_score,q.trigger_strength_score,0,now());

  perform public.refresh_ranking_v2();
end;
$$;

revoke all on function public.recalculate_decision_layers_from_trigger(uuid) from public,anon,authenticated;
grant execute on function public.recalculate_decision_layers_from_trigger(uuid) to service_role;

create or replace function public.trg_recalculate_decision_layers_from_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.material and not coalesce((new.metadata->>'backfill')::boolean,false) then
    perform public.recalculate_decision_layers_from_trigger(new.company_id);
  end if;
  return new;
end;
$$;
revoke all on function public.trg_recalculate_decision_layers_from_trigger() from public,anon,authenticated;
grant execute on function public.trg_recalculate_decision_layers_from_trigger() to service_role;

drop trigger if exists trg_recalculate_decision_layers_from_trigger on public.trigger_events;
create trigger trg_recalculate_decision_layers_from_trigger
after insert or update of material,trigger_strength on public.trigger_events
for each row execute function public.trg_recalculate_decision_layers_from_trigger();

create or replace function public.refresh_ranking_v2()
returns void
language plpgsql
set search_path=''
as $$
declare v_snapshot_at timestamptz:=clock_timestamp();
begin
  with latest_qualification as (
    select distinct on (q.company_id) q.company_id,q.qualification_score_total,q.trigger_strength_score,q.source_confidence_score,q.evidence_payload
    from public.qualification_snapshots q
    where q.qualification_score_total is not null and public.is_company_decision_eligible(q.company_id)
    order by q.company_id,q.created_at desc,q.id desc
  ), latest_lead as (
    select distinct on (l.company_id) l.company_id,l.lead_score from public.lead_score_snapshots l
    where l.lead_score is not null and public.is_company_decision_eligible(l.company_id)
    order by l.company_id,l.created_at desc,l.id desc
  ), latest_pattern as (
    select distinct on (p.company_id,p.pattern_id) p.company_id,p.pattern_id,p.ranking_impact from public.company_patterns p
    where public.is_company_decision_eligible(p.company_id)
    order by p.company_id,p.pattern_id,p.detected_at desc,p.created_at desc,p.id desc
  ), pattern_impact as (
    select company_id,coalesce(sum(ranking_impact),0)::numeric ranking_impact from latest_pattern group by company_id
  ), trigger_state as (
    select distinct on (t.company_id) t.company_id,t.trigger_strength,t.occurred_at,
      case when t.occurred_at>=now()-interval '30 days' then 1.0 when t.occurred_at>=now()-interval '90 days' then 0.75
           when t.occurred_at>=now()-interval '180 days' then 0.50 else 0 end as freshness
    from public.trigger_events t where t.material and public.is_company_decision_eligible(t.company_id)
    order by t.company_id,t.trigger_strength desc,t.occurred_at desc,t.id desc
  ), scored as (
    select q.company_id,q.qualification_score_total::integer qualification_score,l.lead_score::integer lead_score,
      greatest(0,least(100,round(q.qualification_score_total*0.40+l.lead_score*0.35+
        coalesce(ts.trigger_strength*ts.freshness,0)*0.10+coalesce(q.source_confidence_score,0)*100*0.05+
        coalesce(pi.ranking_impact,0)*0.10+coalesce((q.evidence_payload#>>'{publicEvidence,opportunityScore}')::numeric,0)*0.10-
        coalesce((q.evidence_payload#>>'{publicEvidence,riskPenalty}')::numeric,0)*0.28)))::integer raw_ranking_score,
      coalesce((q.evidence_payload#>>'{publicEvidence,blockingRiskCount}')::integer,0) blocking_risk_count,
      coalesce(q.evidence_payload#>>'{publicEvidence,riskLevel}','none') risk_level,coalesce(ts.freshness,0) trigger_freshness
    from latest_qualification q join latest_lead l on l.company_id=q.company_id
    left join pattern_impact pi on pi.company_id=q.company_id left join trigger_state ts on ts.company_id=q.company_id
  ), guarded as (
    select company_id,qualification_score,lead_score,
      case when blocking_risk_count>0 then least(raw_ranking_score,54) when risk_level='high' then least(raw_ranking_score,69) else raw_ranking_score end::integer ranking_score,
      risk_level,trigger_freshness from scored
  ), positioned as (
    select company_id,row_number() over(order by ranking_score desc,company_id asc)::integer position,qualification_score,lead_score,ranking_score,risk_level,trigger_freshness from guarded
  ), latest_snapshot as (select max(created_at) created_at from public.ranking_v2),
  latest_rows as (select r.company_id,r.position,r.qualification_score,r.lead_score,r.ranking_score from public.ranking_v2 r join latest_snapshot s on r.created_at=s.created_at),
  changes as (
    (select company_id,position,qualification_score,lead_score,ranking_score from positioned except select company_id,position,qualification_score,lead_score,ranking_score from latest_rows)
    union all
    (select company_id,position,qualification_score,lead_score,ranking_score from latest_rows except select company_id,position,qualification_score,lead_score,ranking_score from positioned)
  )
  insert into public.ranking_v2(company_id,position,qualification_score,lead_score,ranking_score,rationale,created_at)
  select company_id,position,qualification_score,lead_score,ranking_score,
    format('Ranking V2 p2_trigger_v1; risk=%s; triggerFreshness=%s; duplicate evidence suppressed.',risk_level,trigger_freshness),v_snapshot_at
  from positioned where exists(select 1 from changes);
end;
$$;

-- Recalculate once per currently decision-eligible company after backfill.
do $$
declare r record;
begin
  for r in select id from public.companies where public.is_company_decision_eligible(id) loop
    perform public.recalculate_decision_layers_from_trigger(r.id);
  end loop;
end;
$$;

notify pgrst,'reload schema';
