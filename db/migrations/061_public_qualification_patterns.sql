create or replace function public.enrich_qualification_with_public_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  evidence jsonb;
  opportunity numeric := 0;
  risk_penalty numeric := 0;
  coverage numeric := 0;
  blocking_count integer := 0;
  has_contracts boolean := false;
  has_financing boolean := false;
  risk_level text := 'none';
  suggested text;
  rationale_suffix text;
begin
  evidence := public.get_company_public_evidence(new.company_id);
  if coalesce((evidence ->> 'publicSignalCount')::integer, 0) = 0 then return new; end if;

  opportunity := coalesce((evidence ->> 'opportunityScore')::numeric, 0);
  risk_penalty := coalesce((evidence ->> 'riskPenalty')::numeric, 0);
  coverage := coalesce((evidence ->> 'evidenceCoverage')::numeric, 0);
  blocking_count := coalesce((evidence ->> 'blockingRiskCount')::integer, 0);
  has_contracts := coalesce((evidence ->> 'hasPublicContracts')::boolean, false);
  has_financing := coalesce((evidence ->> 'hasPublicFinancing')::boolean, false);
  risk_level := coalesce(evidence ->> 'riskLevel', 'none');

  new.qualification_score_structural := least(100,greatest(0,coalesce(new.qualification_score_structural,new.structural_need_score,0)+round(opportunity*0.22)));
  new.qualification_score_capital := least(100,greatest(0,coalesce(new.qualification_score_capital,0)+round(opportunity*0.16)+case when coalesce((evidence->>'hasFiscalStress')::boolean,false) then 5 else 0 end));
  new.qualification_score_receivables := least(100,greatest(0,coalesce(new.qualification_score_receivables,0)+case when has_contracts then 14 else 0 end));
  new.qualification_score_execution := least(100,greatest(0,coalesce(new.qualification_score_execution,new.executability_score,0)-round(risk_penalty*0.52)));
  new.qualification_score_timing := least(100,greatest(0,coalesce(new.qualification_score_timing,new.timing_score,0)+least(12,coalesce((evidence->>'freshSignalCount')::integer,0)*3)+case when risk_level in ('high','blocking') then 3 else 0 end));
  new.qualification_score_total := least(100,greatest(0,coalesce(new.qualification_score_total,new.total_score,0)+round(opportunity*0.12)-round(risk_penalty*0.25)));
  if blocking_count>0 then new.qualification_score_total:=least(new.qualification_score_total,59); end if;
  new.predicted_funding_need_score := least(100,greatest(0,coalesce(new.predicted_funding_need_score,0)+round(opportunity*0.18)+case when coalesce((evidence->>'hasFiscalStress')::boolean,false) then 8 else 0 end));
  new.urgency_score := least(100,greatest(0,coalesce(new.urgency_score,new.qualification_score_timing,0)+least(10,coalesce((evidence->>'freshSignalCount')::integer,0)*2)));
  new.source_confidence_score := greatest(coalesce(new.source_confidence_score,0),coverage);
  new.confidence_score := greatest(coalesce(new.confidence_score,0),coverage);
  new.trigger_strength_score := greatest(coalesce(new.trigger_strength_score,0),coalesce((evidence->>'maxSignalStrength')::numeric,0));

  new.structural_need_score:=new.qualification_score_structural;
  new.timing_score:=new.qualification_score_timing;
  new.executability_score:=new.qualification_score_execution;
  new.total_score:=new.qualification_score_total;

  if has_contracts then
    new.has_receivables:=true;
    new.receivables_structurable:=true;
    new.fit_fidc:=true;
    if not ('Recebíveis públicos'=any(coalesce(new.receivables_type,'{}'::text[]))) then
      new.receivables_type:=array_append(coalesce(new.receivables_type,'{}'::text[]),'Recebíveis públicos');
    end if;
  end if;
  if has_financing or coalesce((evidence->>'hasCorporateChange')::boolean,false) then new.fit_dcm:=true; end if;

  suggested:=case
    when has_contracts then 'FIDC de recebíveis públicos / cessão de contratos'
    when has_financing then 'Debênture / nota comercial para complemento ou alongamento'
    else new.suggested_structure_type end;
  new.suggested_structure_type:=coalesce(suggested,new.suggested_structure_type);
  new.fit_other_structure:=coalesce(suggested,new.fit_other_structure);
  new.next_action:=evidence->>'nextAction';

  rationale_suffix:=format(' Evidência pública: oportunidade %s; risco %s; nível %s; cobertura %s.',opportunity,risk_penalty,risk_level,round(coverage,2));
  new.rationale_summary:=concat(coalesce(new.rationale_summary,new.rationale,''),rationale_suffix);
  new.capital_structure_rationale:=concat(coalesce(new.capital_structure_rationale,''),rationale_suffix);
  new.rationale:=concat(coalesce(new.rationale,new.rationale_summary,''),rationale_suffix);
  new.evidence_payload:=coalesce(new.evidence_payload,'{}'::jsonb)||jsonb_build_object('publicEvidence',evidence);
  new.evidence:=coalesce(new.evidence,'{}'::jsonb)||jsonb_build_object('publicEvidence',evidence);
  new.snapshot_version:=concat(coalesce(new.snapshot_version,'qualification'),'+public_evidence_v1');
  return new;
end;
$$;

drop trigger if exists enrich_qualification_with_public_evidence on public.qualification_snapshots;
create trigger enrich_qualification_with_public_evidence
before insert on public.qualification_snapshots
for each row execute function public.enrich_qualification_with_public_evidence();

create or replace function public.sync_public_evidence_patterns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare evidence jsonb:=coalesce(new.evidence_payload->'publicEvidence',new.evidence->'publicEvidence',public.get_company_public_evidence(new.company_id));
begin
  delete from public.company_patterns company_pattern
  using public.pattern_catalog pattern
  where company_pattern.company_id=new.company_id
    and company_pattern.pattern_id=pattern.id
    and pattern.code in ('public_receivables_fundable','public_funding_refinancing_window','public_fiscal_stress_conditional','public_compliance_red_flag','public_corporate_change_window');

  insert into public.company_patterns (
    id,company_id,pattern_id,confidence,rationale,supporting_signal_ids,
    detected_at,created_at,confidence_score,qualification_impact,
    lead_score_impact,ranking_impact,thesis_impact,evidence_payload
  )
  select
    gen_random_uuid(),new.company_id,pattern.id,
    case pattern.code when 'public_compliance_red_flag' then 96 when 'public_receivables_fundable' then 94 else 90 end,
    case pattern.code
      when 'public_receivables_fundable' then 'Contrato público observado cria lastro potencial, condicionado à cessibilidade, performance e ciclo de pagamento.'
      when 'public_funding_refinancing_window' then 'Funding público observado evidencia capital existente e possível janela de complemento ou reperfilamento.'
      when 'public_fiscal_stress_conditional' then 'Dívida fiscal aumenta necessidade e urgência, mas reduz executabilidade até regularização e diligência.'
      when 'public_compliance_red_flag' then 'Evento CEIS/CNEP exige diligência reforçada e bloqueia abordagem padrão enquanto o status não for validado.'
      when 'public_corporate_change_window' then 'Mudança cadastral material pode indicar reorganização ou novo ciclo de capital e cria janela de contato.' end,
    '{}'::uuid[],now(),now(),
    case pattern.code when 'public_compliance_red_flag' then 0.96 when 'public_receivables_fundable' then 0.94 else 0.90 end,
    pattern.default_qualification_impact,pattern.default_lead_score_impact,pattern.default_ranking_impact,
    case pattern.code
      when 'public_receivables_fundable' then 'Priorizar tese de FIDC/cessão com diligência de elegibilidade dos contratos públicos.'
      when 'public_funding_refinancing_window' then 'Explorar complemento, alongamento ou substituição de funding existente.'
      when 'public_fiscal_stress_conditional' then 'Condicionar qualquer estrutura a certidões, materialidade e plano de regularização.'
      when 'public_compliance_red_flag' then 'Não avançar abordagem padrão antes da diligência de compliance.'
      when 'public_corporate_change_window' then 'Usar a mudança como gatilho para confirmar reorganização e sponsor financeiro.' end,
    jsonb_build_object('publicEvidence',evidence,'source','public_data_downstream_v1')
  from public.pattern_catalog pattern
  where pattern.active and (
    (pattern.code='public_receivables_fundable' and coalesce((evidence->>'hasPublicContracts')::boolean,false)) or
    (pattern.code='public_funding_refinancing_window' and coalesce((evidence->>'hasPublicFinancing')::boolean,false)) or
    (pattern.code='public_fiscal_stress_conditional' and coalesce((evidence->>'hasFiscalStress')::boolean,false)) or
    (pattern.code='public_compliance_red_flag' and coalesce((evidence->>'hasComplianceRisk')::boolean,false)) or
    (pattern.code='public_corporate_change_window' and coalesce((evidence->>'hasCorporateChange')::boolean,false))
  );
  return null;
end;
$$;

drop trigger if exists sync_public_evidence_patterns on public.qualification_snapshots;
create trigger sync_public_evidence_patterns
after insert on public.qualification_snapshots
for each row execute function public.sync_public_evidence_patterns();
