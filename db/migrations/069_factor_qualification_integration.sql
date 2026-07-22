insert into public.pattern_catalog(
  id,code,name,category,description,default_weight,active,created_at,updated_at,
  pattern_name,pattern_family,explicit_features,latent_features,
  default_qualification_impact,default_lead_score_impact,default_ranking_impact
)
values
(gen_random_uuid(),'ownership_change_window','Ownership change creates origination window','factor_map','Mudança societária oficial cria janela para confirmar sponsor, governança e novo ciclo de capital.',1.05,true,now(),now(),'Ownership change creates origination window','timing',array['ownership_change'],array['new_sponsor','capital_cycle'],4,6,6),
(gen_random_uuid(),'debt_maturity_refinancing_window','Debt maturity / refinancing window','factor_map','Endividamento ou obrigações formais sugerem pressão de maturidade e ângulo de DCM.',1.20,true,now(),now(),'Debt maturity / refinancing window','capital_structure',array['debt_maturity_pressure'],array['refinancing','term_out'],7,9,9),
(gen_random_uuid(),'capital_structure_change_window','Formal capital structure change','factor_map','Aumento/redução de capital cria timing financeiro e requer leitura da nova estrutura.',1.05,true,now(),now(),'Formal capital structure change','timing',array['capital_structure_change'],array['capital_cycle','reorganization'],4,6,6),
(gen_random_uuid(),'related_party_dependency_risk','Related-party dependency risk','factor_map_risk','Transações com partes relacionadas exigem diligência de governança e podem limitar executabilidade.',0.80,true,now(),now(),'Related-party dependency risk','risk',array['related_party_dependency'],array['governance_risk','cash_leakage'],-7,-10,-10)
on conflict (code) do update set
  name=excluded.name,category=excluded.category,description=excluded.description,
  default_weight=excluded.default_weight,active=excluded.active,
  pattern_name=excluded.pattern_name,pattern_family=excluded.pattern_family,
  explicit_features=excluded.explicit_features,latent_features=excluded.latent_features,
  default_qualification_impact=excluded.default_qualification_impact,
  default_lead_score_impact=excluded.default_lead_score_impact,
  default_ranking_impact=excluded.default_ranking_impact,updated_at=now();

create or replace function public.enrich_qualification_with_factor_map()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  factor_map jsonb;
  factor_count integer:=0;
  funding_delta numeric:=0;
  fidc_delta numeric:=0;
  dcm_delta numeric:=0;
  timing_delta numeric:=0;
  execution_delta numeric:=0;
  risk_penalty numeric:=0;
  opportunity numeric:=0;
  confidence_value numeric:=0;
  recommended_structure text;
  rationale_suffix text;
begin
  factor_map:=public.get_company_factor_map(new.company_id);
  factor_count:=coalesce((factor_map->>'factorCount')::integer,0);
  if factor_count=0 then return new; end if;
  funding_delta:=coalesce((factor_map->>'fundingNeedDelta')::numeric,0);
  fidc_delta:=coalesce((factor_map->>'fidcFitDelta')::numeric,0);
  dcm_delta:=coalesce((factor_map->>'dcmFitDelta')::numeric,0);
  timing_delta:=coalesce((factor_map->>'timingDelta')::numeric,0);
  execution_delta:=coalesce((factor_map->>'executionDelta')::numeric,0);
  risk_penalty:=coalesce((factor_map->>'riskPenalty')::numeric,0);
  opportunity:=coalesce((factor_map->>'opportunityScore')::numeric,0);
  confidence_value:=coalesce((factor_map->>'sourceConfidence')::numeric,0);
  recommended_structure:=nullif(factor_map->>'recommendedStructure','');

  new.qualification_score_structural:=least(100,greatest(0,coalesce(new.qualification_score_structural,new.structural_need_score,0)+round(funding_delta*0.38)+round(greatest(fidc_delta,dcm_delta)*0.15)));
  new.qualification_score_capital:=least(100,greatest(0,coalesce(new.qualification_score_capital,0)+round(funding_delta*0.28)+round(dcm_delta*0.20)-round(risk_penalty*0.16)));
  new.qualification_score_receivables:=least(100,greatest(0,coalesce(new.qualification_score_receivables,0)+round(fidc_delta*0.42)));
  new.qualification_score_execution:=least(100,greatest(0,coalesce(new.qualification_score_execution,new.executability_score,0)+round(execution_delta*0.30)+round(greatest(fidc_delta,dcm_delta)*0.12)-round(risk_penalty*0.48)));
  new.qualification_score_timing:=least(100,greatest(0,coalesce(new.qualification_score_timing,new.timing_score,0)+round(timing_delta*0.48)+round(opportunity*0.10)));
  new.qualification_score_total:=least(100,greatest(0,coalesce(new.qualification_score_total,new.total_score,0)+round(opportunity*0.22)-round(risk_penalty*0.30)));
  new.predicted_funding_need_score:=least(100,greatest(0,coalesce(new.predicted_funding_need_score,0)+round(funding_delta*0.55)+round(timing_delta*0.18)-round(risk_penalty*0.10)));
  new.urgency_score:=least(100,greatest(0,coalesce(new.urgency_score,new.qualification_score_timing,0)+round(timing_delta*0.35)+case when risk_penalty>=18 then 4 else 0 end));
  new.source_confidence_score:=greatest(coalesce(new.source_confidence_score,0),confidence_value);
  new.confidence_score:=greatest(coalesce(new.confidence_score,0),confidence_value);
  new.trigger_strength_score:=greatest(coalesce(new.trigger_strength_score,0),coalesce((factor_map->>'maxFactorScore')::numeric,0));
  new.structural_need_score:=new.qualification_score_structural;
  new.timing_score:=new.qualification_score_timing;
  new.executability_score:=new.qualification_score_execution;
  new.total_score:=new.qualification_score_total;
  if fidc_delta>=8 then new.has_receivables:=true; new.receivables_structurable:=true; new.fit_fidc:=true; end if;
  if dcm_delta>=8 then new.fit_dcm:=true; end if;
  if funding_delta>=10 then new.funding_gap:=true; end if;
  new.suggested_structure_type:=coalesce(recommended_structure,new.suggested_structure_type);
  new.fit_other_structure:=coalesce(recommended_structure,new.fit_other_structure);
  new.next_action:=coalesce(factor_map->>'nextAction',new.next_action);
  rationale_suffix:=format(' Factor map v1: oportunidade %s; funding %s; FIDC %s; DCM %s; risco %s.',round(opportunity,2),round(funding_delta,2),round(fidc_delta,2),round(dcm_delta,2),round(risk_penalty,2));
  new.rationale_summary:=concat(coalesce(new.rationale_summary,new.rationale,''),rationale_suffix);
  new.capital_structure_rationale:=concat(coalesce(new.capital_structure_rationale,''),rationale_suffix);
  new.rationale:=concat(coalesce(new.rationale,new.rationale_summary,''),rationale_suffix);
  new.evidence_payload:=coalesce(new.evidence_payload,'{}'::jsonb)||jsonb_build_object('factorMap',factor_map);
  new.evidence:=coalesce(new.evidence,'{}'::jsonb)||jsonb_build_object('factorMap',factor_map);
  new.snapshot_version:=concat(coalesce(new.snapshot_version,'qualification'),'+factor_map_v1');
  return new;
end;
$$;
