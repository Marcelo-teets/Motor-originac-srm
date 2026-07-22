create or replace function public.sync_factor_map_patterns()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare factor_map jsonb:=coalesce(new.evidence_payload->'factorMap',new.evidence->'factorMap',public.get_company_factor_map(new.company_id));
begin
  delete from public.company_patterns company_pattern
  using public.pattern_catalog pattern
  where company_pattern.company_id=new.company_id
    and company_pattern.pattern_id=pattern.id
    and pattern.code in ('ownership_change_window','debt_maturity_refinancing_window','capital_structure_change_window','related_party_dependency_risk');

  insert into public.company_patterns(
    id,company_id,pattern_id,confidence,rationale,supporting_signal_ids,
    detected_at,created_at,confidence_score,qualification_impact,
    lead_score_impact,ranking_impact,thesis_impact,evidence_payload
  )
  select gen_random_uuid(),new.company_id,pattern.id,
    round(least(100,greatest(55,coalesce((factor_item->>'score')::numeric,0))),2),
    case pattern.code
      when 'ownership_change_window' then 'Mudança societária oficial cria janela para confirmar sponsor, governança e novo ciclo de capital.'
      when 'debt_maturity_refinancing_window' then 'Perfil de dívida/obrigações no FRE cria hipótese de refinanciamento, alongamento ou DCM.'
      when 'capital_structure_change_window' then 'Evento formal de capital indica reorganização e timing financeiro.'
      when 'related_party_dependency_risk' then 'Dependência de partes relacionadas exige diligência e reduz executabilidade até validação.' end,
    coalesce((select array_agg(distinct observation.signal_id)
      from public.company_factor_observations observation
      join public.origination_factor_catalog factor on factor.id=observation.factor_id
      where observation.company_id=new.company_id and factor.code=case pattern.code
        when 'ownership_change_window' then 'ownership_change'
        when 'debt_maturity_refinancing_window' then 'debt_maturity_concentration'
        when 'capital_structure_change_window' then 'capital_cycle_change'
        when 'related_party_dependency_risk' then 'related_party_dependency' end),'{}'::uuid[]),
    now(),now(),least(1,greatest(0,coalesce((factor_item->>'confidence')::numeric,0))),
    pattern.default_qualification_impact,pattern.default_lead_score_impact,pattern.default_ranking_impact,
    case pattern.code
      when 'ownership_change_window' then 'Confirmar controlador, sponsor financeiro, motivo da mudança e plano de capital.'
      when 'debt_maturity_refinancing_window' then 'Mapear vencimentos, garantias e covenants; testar debênture/nota comercial ou reperfilamento.'
      when 'capital_structure_change_window' then 'Entender uso dos recursos e necessidade posterior ao evento de capital.'
      when 'related_party_dependency_risk' then 'Validar materialidade, condições, governança e potenciais vazamentos de caixa.' end,
    jsonb_build_object('factorMap',factor_map,'factor',factor_item,'source','signal_factor_map_v1')
  from public.pattern_catalog pattern
  cross join lateral (select value as factor_item from jsonb_array_elements(coalesce(factor_map->'factors','[]'::jsonb))) factor_row
  where pattern.active and (
    (pattern.code='ownership_change_window' and factor_item->>'code'='ownership_change' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='debt_maturity_refinancing_window' and factor_item->>'code'='debt_maturity_concentration' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='capital_structure_change_window' and factor_item->>'code'='capital_cycle_change' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='related_party_dependency_risk' and factor_item->>'code'='related_party_dependency' and coalesce((factor_item->>'score')::numeric,0)>=8)
  );
  return null;
end;
$$;
