create or replace function public.guard_pipeline_with_public_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qualification public.qualification_snapshots%rowtype;
  lead public.lead_score_snapshots%rowtype;
  evidence jsonb;
  risk_level text:='none';
  recommended_stage text:='Identified';
  current_stage text:=coalesce(new.stage,'Identified');
  current_rank integer:=0;
  recommended_rank integer:=0;
begin
  select * into qualification from public.qualification_snapshots where company_id=new.company_id order by created_at desc,id desc limit 1;
  if qualification.id is null then return new; end if;
  select * into lead from public.lead_score_snapshots where company_id=new.company_id order by created_at desc,id desc limit 1;

  evidence:=coalesce(qualification.evidence_payload->'publicEvidence',qualification.evidence->'publicEvidence',public.get_company_public_evidence(new.company_id));
  if coalesce((evidence->>'publicSignalCount')::integer,0)=0 then return new; end if;

  risk_level:=coalesce(evidence->>'riskLevel','none');
  recommended_stage:=case
    when risk_level in ('blocking','high') then 'Identified'
    when coalesce(lead.lead_score,0)>=70 and coalesce(qualification.qualification_score_execution,qualification.executability_score,0)>=60 then 'Approach'
    when coalesce(qualification.qualification_score_total,qualification.total_score,0)>=60 then 'Qualified'
    else coalesce(evidence->>'recommendedStage','Identified') end;

  current_rank:=case current_stage
    when 'Identified' then 1 when 'Qualified' then 2 when 'Approach' then 3
    when 'Structuring' then 4 when 'Mandated' then 5 when 'ClosedWon' then 6
    when 'ClosedLost' then 6 when 'Recycled' then 1 else 1 end;
  recommended_rank:=case recommended_stage when 'Identified' then 1 when 'Qualified' then 2 when 'Approach' then 3 else 1 end;

  if current_stage not in ('Structuring','Mandated','ClosedWon','ClosedLost') and recommended_rank>current_rank then new.stage:=recommended_stage; end if;
  if risk_level='blocking' then
    new.status:='blocked';
    if current_stage in ('Identified','Qualified','Approach') then new.stage:='Identified'; end if;
  elsif risk_level='high' then new.status:='attention';
  else new.status:='active'; end if;

  new.priority:=coalesce(lead.bucket,lead.priority_tier,new.priority,'watchlist');
  new.next_action:=evidence->>'nextAction';
  new.expected_structure:=coalesce(qualification.suggested_structure_type,new.expected_structure);
  new.notes:=concat_ws(' ',nullif(new.notes,''),format('[public_evidence_v1 risk=%s opportunity=%s]',risk_level,coalesce(evidence->>'opportunityScore','0')));
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists guard_pipeline_with_public_evidence on public.pipeline;
create trigger guard_pipeline_with_public_evidence
before insert or update on public.pipeline
for each row execute function public.guard_pipeline_with_public_evidence();

create or replace function public.sync_public_evidence_pipeline_and_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qualification public.qualification_snapshots%rowtype;
  evidence jsonb;
  action_text text;
  task_code text;
  owner_value text;
  priority_value text;
begin
  select * into qualification from public.qualification_snapshots where company_id=new.company_id order by created_at desc,id desc limit 1;
  if qualification.id is null then return null; end if;
  evidence:=coalesce(qualification.evidence_payload->'publicEvidence',qualification.evidence->'publicEvidence',public.get_company_public_evidence(new.company_id));
  if coalesce((evidence->>'publicSignalCount')::integer,0)=0 then return null; end if;

  insert into public.pipeline (company_id,stage,status,priority,next_action,expected_structure,notes,created_at,updated_at)
  values (new.company_id,coalesce(evidence->>'recommendedStage','Identified'),'active',coalesce(new.bucket,new.priority_tier,'watchlist'),evidence->>'nextAction',qualification.suggested_structure_type,'Sincronizado automaticamente por public_evidence_v1.',now(),now())
  on conflict (company_id) do update set
    priority=excluded.priority,
    next_action=excluded.next_action,
    expected_structure=excluded.expected_structure,
    notes=concat_ws(' ',public.pipeline.notes,excluded.notes),
    updated_at=now();

  owner_value:=case when coalesce(evidence->>'riskLevel','none') in ('blocking','high','caution') then 'Credit' else 'Intelligence' end;
  priority_value:=case when coalesce(evidence->>'riskLevel','none') in ('blocking','high') then 'high' else 'medium' end;

  for action_text in
    select value from jsonb_array_elements_text(coalesce(evidence->'dueDiligenceActions','[]'::jsonb)) limit 5
  loop
    task_code:=md5(new.company_id::text||'|'||action_text);
    insert into public.tasks (company_id,title,description,status,priority,due_at,owner_name,metadata,created_at,updated_at)
    values (
      new.company_id,
      'Dados públicos · '||left(action_text,180),
      action_text,
      'todo',priority_value,now()+interval '3 days',owner_value,
      jsonb_build_object('autoGenerated',true,'source','public_evidence_v1','publicEvidenceTaskCode',task_code,'riskLevel',evidence->>'riskLevel'),
      now(),now()
    ) on conflict do nothing;
  end loop;
  return null;
end;
$$;

create unique index if not exists uq_open_public_evidence_task
  on public.tasks (company_id,((metadata->>'publicEvidenceTaskCode')))
  where metadata?'publicEvidenceTaskCode' and status in ('todo','in_progress','blocked');

drop trigger if exists sync_public_evidence_pipeline_and_tasks on public.lead_score_snapshots;
create trigger sync_public_evidence_pipeline_and_tasks
after insert on public.lead_score_snapshots
for each row execute function public.sync_public_evidence_pipeline_and_tasks();

create or replace function public.refresh_ranking_v2()
returns void
language plpgsql
set search_path = public
as $$
declare v_snapshot_at timestamptz:=clock_timestamp();
begin
  with latest_qualification as (
    select distinct on (company_id) company_id,qualification_score_total,trigger_strength_score,source_confidence_score,evidence_payload
    from public.qualification_snapshots
    where qualification_score_total is not null
    order by company_id,created_at desc,id desc
  ), latest_lead as (
    select distinct on (company_id) company_id,lead_score
    from public.lead_score_snapshots
    where lead_score is not null
    order by company_id,created_at desc,id desc
  ), latest_pattern as (
    select distinct on (company_id,pattern_id) company_id,pattern_id,ranking_impact
    from public.company_patterns
    order by company_id,pattern_id,detected_at desc,created_at desc,id desc
  ), pattern_impact as (
    select company_id,coalesce(sum(ranking_impact),0)::numeric as ranking_impact
    from latest_pattern group by company_id
  ), scored as (
    select
      qualification.company_id,
      qualification.qualification_score_total::integer as qualification_score,
      lead.lead_score::integer as lead_score,
      greatest(0,least(100,round(
        qualification.qualification_score_total*0.40
        + lead.lead_score*0.35
        + coalesce(qualification.trigger_strength_score,0)*0.10
        + coalesce(qualification.source_confidence_score,0)*100*0.05
        + coalesce(pattern.ranking_impact,0)*0.10
        + coalesce((qualification.evidence_payload#>>'{publicEvidence,opportunityScore}')::numeric,0)*0.10
        - coalesce((qualification.evidence_payload#>>'{publicEvidence,riskPenalty}')::numeric,0)*0.28
      )))::integer as raw_ranking_score,
      coalesce((qualification.evidence_payload#>>'{publicEvidence,blockingRiskCount}')::integer,0) as blocking_risk_count,
      coalesce(qualification.evidence_payload#>>'{publicEvidence,riskLevel}','none') as risk_level
    from latest_qualification qualification
    join latest_lead lead on lead.company_id=qualification.company_id
    left join pattern_impact pattern on pattern.company_id=qualification.company_id
  ), guarded as (
    select company_id,qualification_score,lead_score,
      case when blocking_risk_count>0 then least(raw_ranking_score,54) when risk_level='high' then least(raw_ranking_score,69) else raw_ranking_score end::integer as ranking_score,
      risk_level
    from scored
  ), positioned as (
    select company_id,row_number() over(order by ranking_score desc,company_id asc)::integer as position,qualification_score,lead_score,ranking_score,risk_level
    from guarded
  ), latest_snapshot as (
    select max(created_at) as created_at from public.ranking_v2
  ), latest_rows as (
    select ranking.company_id,ranking.position,ranking.qualification_score,ranking.lead_score,ranking.ranking_score
    from public.ranking_v2 ranking join latest_snapshot snapshot on ranking.created_at=snapshot.created_at
  ), changes as (
    (select company_id,position,qualification_score,lead_score,ranking_score from positioned
     except
     select company_id,position,qualification_score,lead_score,ranking_score from latest_rows)
    union all
    (select company_id,position,qualification_score,lead_score,ranking_score from latest_rows
     except
     select company_id,position,qualification_score,lead_score,ranking_score from positioned)
  )
  insert into public.ranking_v2 (company_id,position,qualification_score,lead_score,ranking_score,rationale,created_at)
  select company_id,position,qualification_score,lead_score,ranking_score,format('Ranking V2 com evidência pública, impactos de padrões e guardrail de risco (%s).',risk_level),v_snapshot_at
  from positioned where exists(select 1 from changes);
end;
$$;

comment on function public.get_company_public_evidence(uuid) is 'Agrega sinais públicos oficiais por empresa, deduplica evidências e calcula oportunidade, risco, why-now, diligência, estrutura, stage e próxima ação.';
comment on function public.enrich_qualification_with_public_evidence() is 'Aplica public evidence intelligence a todo novo qualification snapshot, independentemente do executor que o gerou.';
comment on function public.apply_public_evidence_lead_guardrails() is 'Ajusta lead score, bucket, commercial angle e próxima ação usando oportunidade e risco de fontes públicas.';
comment on function public.guard_pipeline_with_public_evidence() is 'Impede avanço automático inadequado e condiciona pipeline a diligência quando há risco fiscal/compliance.';
