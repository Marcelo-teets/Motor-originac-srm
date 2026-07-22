create or replace function public.align_score_snapshot_with_public_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare qualification public.qualification_snapshots%rowtype;
begin
  select * into qualification
  from public.qualification_snapshots
  where company_id=new.company_id
  order by created_at desc,id desc
  limit 1;
  if qualification.id is null then return new; end if;

  new.structural_need_score:=qualification.qualification_score_structural;
  new.timing_score:=qualification.qualification_score_timing;
  new.executability_score:=qualification.qualification_score_execution;
  new.source_confidence_score:=least(100,greatest(0,coalesce(qualification.source_confidence_score,0)*100));
  new.trigger_strength_score:=qualification.trigger_strength_score;

  if new.score_type='qualification' then
    new.score_value:=qualification.qualification_score_total;
    new.total_score:=qualification.qualification_score_total;
  elsif new.score_type='funding_need' then
    new.score_value:=qualification.predicted_funding_need_score;
    new.total_score:=qualification.predicted_funding_need_score;
  elsif new.score_type='urgency' then
    new.score_value:=qualification.urgency_score;
    new.total_score:=qualification.urgency_score;
  end if;
  new.rationale:=concat(coalesce(new.rationale,''),' Ajustado por public_evidence_v1.');
  new.drivers:=coalesce(new.drivers,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('publicEvidence',qualification.evidence_payload->'publicEvidence'));
  return new;
end;
$$;

drop trigger if exists align_score_snapshot_with_public_evidence on public.score_snapshots;
create trigger align_score_snapshot_with_public_evidence
before insert on public.score_snapshots
for each row execute function public.align_score_snapshot_with_public_evidence();

create or replace function public.apply_public_evidence_lead_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qualification public.qualification_snapshots%rowtype;
  evidence jsonb;
  opportunity numeric:=0;
  risk_penalty numeric:=0;
  blocking_count integer:=0;
  risk_level text:='none';
  final_score numeric;
  bucket_value text;
begin
  select * into qualification
  from public.qualification_snapshots
  where company_id=new.company_id
  order by created_at desc,id desc
  limit 1;
  if qualification.id is null then return new; end if;

  evidence:=coalesce(qualification.evidence_payload->'publicEvidence',qualification.evidence->'publicEvidence',public.get_company_public_evidence(new.company_id));
  if coalesce((evidence->>'publicSignalCount')::integer,0)=0 then return new; end if;

  opportunity:=coalesce((evidence->>'opportunityScore')::numeric,0);
  risk_penalty:=coalesce((evidence->>'riskPenalty')::numeric,0);
  blocking_count:=coalesce((evidence->>'blockingRiskCount')::integer,0);
  risk_level:=coalesce(evidence->>'riskLevel','none');

  final_score:=least(100,greatest(0,coalesce(new.lead_score,0)+round(opportunity*0.12)-round(risk_penalty*0.32)));
  if blocking_count>0 then final_score:=least(final_score,54);
  elsif risk_level='high' then final_score:=least(final_score,69); end if;

  bucket_value:=case
    when final_score>=85 then 'immediate_priority'
    when final_score>=70 then 'high_priority'
    when final_score>=55 then 'monitor_closely'
    when final_score>=40 then 'watchlist'
    else 'low_priority' end;

  new.lead_score:=final_score;
  new.priority_tier:=bucket_value;
  new.bucket:=bucket_value;
  new.next_action:=evidence->>'nextAction';
  new.suggested_structure:=coalesce(qualification.suggested_structure_type,new.suggested_structure);
  new.commercial_angle:=case
    when risk_level='blocking' then 'Diligência de compliance antes de originação padrão.'
    when risk_level='high' then 'Originação condicionada à validação do risco público material.'
    when coalesce((evidence->>'hasPublicContracts')::boolean,false) then 'FIDC/cessão de contratos públicos com validação de elegibilidade.'
    when coalesce((evidence->>'hasPublicFinancing')::boolean,false) then 'Complemento ou reperfilamento de funding público existente.'
    else coalesce(new.commercial_angle,'Originação orientada por evidência pública.') end;
  new.rationale:=concat(coalesce(new.rationale,''),format(' Public evidence: opportunity=%s, risk=%s, level=%s.',opportunity,risk_penalty,risk_level));
  return new;
end;
$$;

drop trigger if exists apply_public_evidence_lead_guardrails on public.lead_score_snapshots;
create trigger apply_public_evidence_lead_guardrails
before insert on public.lead_score_snapshots
for each row execute function public.apply_public_evidence_lead_guardrails();
