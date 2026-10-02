-- P2-005..007/P2-010 closure: evidence-backed thesis, Market Map options and human review.
-- Uses the live thesis_outputs / market_map_cards schema as canonical. No parallel thesis model.
-- Materialization is allowed only for companies that pass public.is_company_decision_eligible().

alter table public.thesis_outputs add column if not exists version integer not null default 1;
alter table public.thesis_outputs add column if not exists status text not null default 'draft';
alter table public.thesis_outputs add column if not exists structure_rationale text;
alter table public.thesis_outputs add column if not exists market_map_summary text;
alter table public.thesis_outputs add column if not exists next_action text;
alter table public.thesis_outputs add column if not exists confidence_score numeric(5,4);
alter table public.thesis_outputs add column if not exists qualification_snapshot_id uuid references public.qualification_snapshots(id) on delete set null;
alter table public.thesis_outputs add column if not exists lead_score_snapshot_id uuid references public.lead_score_snapshots(id) on delete set null;
alter table public.thesis_outputs add column if not exists supersedes_id uuid references public.thesis_outputs(id) on delete set null;
alter table public.thesis_outputs add column if not exists review_status text not null default 'pending';
alter table public.thesis_outputs add column if not exists reviewed_by text;
alter table public.thesis_outputs add column if not exists reviewed_at timestamptz;
alter table public.thesis_outputs add column if not exists review_notes text;
alter table public.thesis_outputs add column if not exists updated_at timestamptz not null default now();

alter table public.thesis_outputs drop constraint if exists thesis_outputs_status_check;
alter table public.thesis_outputs add constraint thesis_outputs_status_check check (status in ('draft','reviewed','superseded','rejected'));
alter table public.thesis_outputs drop constraint if exists thesis_outputs_review_status_check;
alter table public.thesis_outputs add constraint thesis_outputs_review_status_check check (review_status in ('pending','approved','changes_requested','rejected'));

create index if not exists idx_thesis_outputs_company_version on public.thesis_outputs(company_id,version desc,created_at desc);
create unique index if not exists uq_thesis_outputs_company_version on public.thesis_outputs(company_id,version);

alter table public.market_map_cards add column if not exists thesis_id uuid references public.thesis_outputs(id) on delete cascade;
alter table public.market_map_cards add column if not exists option_rank integer not null default 1;
alter table public.market_map_cards add column if not exists size_guidance text;
alter table public.market_map_cards add column if not exists risk_level text;
alter table public.market_map_cards add column if not exists created_by text not null default 'thesis_engine_v1';
create index if not exists idx_market_map_cards_company_thesis on public.market_map_cards(company_id,thesis_id,option_rank);

-- Decision artifacts are generated/reviewed by trusted runtime only.
drop policy if exists authenticated_insert on public.thesis_outputs;
drop policy if exists authenticated_update on public.thesis_outputs;
drop policy if exists authenticated_delete on public.thesis_outputs;
revoke insert,update,delete on public.thesis_outputs from authenticated;
grant select,insert,update,delete on public.thesis_outputs to service_role;

drop policy if exists authenticated_insert on public.market_map_cards;
drop policy if exists authenticated_update on public.market_map_cards;
drop policy if exists authenticated_delete on public.market_map_cards;
revoke insert,update,delete on public.market_map_cards from authenticated;
grant select,insert,update,delete on public.market_map_cards to service_role;

create or replace function public.generate_origination_thesis_v1(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  c public.companies%rowtype;
  q public.qualification_snapshots%rowtype;
  l public.lead_score_snapshots%rowtype;
  v_thesis_id uuid;
  v_previous_id uuid;
  v_version integer;
  v_why_credit text;
  v_why_now text;
  v_structure text;
  v_structure_rationale text;
  v_commercial_angle text;
  v_next_action text;
  v_market_summary text;
  v_risks text[]:='{}';
  v_evidence jsonb:='{}'::jsonb;
  v_trigger_evidence jsonb:='[]'::jsonb;
  v_pattern_evidence jsonb:='[]'::jsonb;
  v_signal_evidence jsonb:='[]'::jsonb;
  v_public jsonb:='{}'::jsonb;
  v_confidence numeric:=0;
  v_risk_level text:='unverified';
begin
  if p_company_id is null or not public.is_company_decision_eligible(p_company_id) then
    raise exception using errcode='23514',message='Company is not eligible for origination thesis materialization.';
  end if;

  select * into c from public.companies where id=p_company_id;
  select * into q from public.qualification_snapshots where company_id=p_company_id order by created_at desc,id desc limit 1;
  select * into l from public.lead_score_snapshots where company_id=p_company_id order by created_at desc,id desc limit 1;
  if q.id is null or l.id is null then
    raise exception using errcode='23514',message='Qualification and lead score snapshots are required before thesis materialization.';
  end if;

  v_public:=coalesce(q.evidence_payload->'publicEvidence','{}'::jsonb);
  v_risk_level:=coalesce(nullif(v_public->>'riskLevel',''),'unverified');

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','trigger','id',t.id,'catalogCode',t.catalog_code,'type',t.trigger_type,
    'strength',t.trigger_strength,'confidence',t.confidence_score,'occurredAt',t.occurred_at,
    'sourceId',t.source_id,'evidence',t.evidence_payload
  ) order by t.trigger_strength desc,t.occurred_at desc),'[]'::jsonb)
  into v_trigger_evidence
  from (select * from public.trigger_events where company_id=p_company_id and material and coalesce(stale_after,now())>=now() order by trigger_strength desc,occurred_at desc limit 8) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','pattern','id',cp.id,'patternId',cp.pattern_id,'confidence',coalesce(cp.confidence_score,cp.confidence),
    'rationale',cp.rationale,'thesisImpact',cp.thesis_impact,'evidence',cp.evidence_payload
  ) order by cp.ranking_impact desc,coalesce(cp.detected_at,cp.created_at) desc),'[]'::jsonb)
  into v_pattern_evidence
  from (select * from public.company_patterns where company_id=p_company_id order by ranking_impact desc,coalesce(detected_at,created_at) desc limit 6) cp;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','signal','id',s.id,'signalType',s.signal_type,'strength',coalesce(s.signal_strength,s.strength),
    'confidence',coalesce(s.confidence_score,s.confidence),'observedAt',coalesce(s.observed_at,s.created_at),
    'sourceId',s.source_id,'evidenceUrl',s.evidence_url,'evidenceText',s.evidence_text,'evidence',s.evidence_payload
  ) order by coalesce(s.signal_strength,s.strength,0) desc,coalesce(s.observed_at,s.created_at) desc),'[]'::jsonb)
  into v_signal_evidence
  from (select * from public.company_signals where company_id=p_company_id order by coalesce(signal_strength,strength,0) desc,coalesce(observed_at,created_at) desc limit 10) s;

  v_structure:=coalesce(nullif(q.suggested_structure_type,''),nullif(l.suggested_structure,''),case when coalesce(q.fit_fidc,false) then 'FIDC' when coalesce(q.fit_dcm,false) then 'Debênture / Nota Comercial' else 'Estrutura a validar' end);
  v_next_action:=coalesce(nullif(q.next_action,''),nullif(l.next_action,''),'Validar estrutura, ticket, prazo, garantias e sponsor financeiro antes da abordagem.');
  v_commercial_angle:=coalesce(nullif(l.commercial_angle,''),'Validar funding gap, estrutura atual, qualidade do lastro e janela de captação antes de abordagem comercial.');

  v_why_credit:=concat_ws(' ',
    case when coalesce(q.has_credit_product,false) then 'Há evidência de produto de crédito.' end,
    case when coalesce(q.has_receivables,false) then 'Há evidência de recebíveis.' end,
    case when coalesce(q.funding_gap,false) or coalesce(q.funding_gap_level,'') in ('medium','high','critical') then 'Há sinal de necessidade ou desalinhamento de funding.' end,
    case when coalesce(q.fit_fidc,false) then 'A qualificação indica fit potencial para FIDC.' end,
    case when coalesce(q.fit_dcm,false) then 'A qualificação indica fit potencial para DCM.' end
  );
  if nullif(v_why_credit,'') is null then
    v_why_credit:='A tese depende da qualificação vigente; faltam evidências suficientes para afirmar um racional de crédito mais específico.';
  end if;

  v_why_now:=coalesce(
    nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(v_public->'whyNow','[]'::jsonb)) limit 3),' '),''),
    (select string_agg(format('%s (%s).',t.trigger_type,to_char(t.occurred_at,'DD/MM/YYYY')),' ' order by t.trigger_strength desc,t.occurred_at desc)
       from (select trigger_type,occurred_at,trigger_strength from public.trigger_events where company_id=p_company_id and material and coalesce(stale_after,now())>=now() order by trigger_strength desc,occurred_at desc limit 3) t),
    'Nenhum trigger temporal material foi comprovado; manter em monitoramento até surgir janela objetiva.'
  );

  v_structure_rationale:=concat_ws(' ',
    format('Estrutura-base: %s.',v_structure),
    nullif(q.capital_structure_rationale,''),
    case when coalesce(q.has_receivables,false) then 'Validar elegibilidade, cessibilidade, performance, concentração e fluxo de cobrança dos recebíveis.' end,
    'Ticket e prazo só devem ser definidos após evidência financeira e operacional suficiente.'
  );

  if v_risk_level in ('blocking','high') then v_risks:=array_append(v_risks,'Risco público/compliance material exige diligência antes da abordagem padrão.'); end if;
  if coalesce(q.qualification_score_execution,q.executability_score,0)<60 then v_risks:=array_append(v_risks,'Executabilidade abaixo do nível desejado; validar governança, documentação, lastro e capacidade operacional.'); end if;
  if coalesce(q.has_receivables,false) and not coalesce(q.receivables_structurable,false) then v_risks:=array_append(v_risks,'Recebíveis identificados, mas estruturabilidade ainda não comprovada.'); end if;
  if coalesce(q.concentration_risk_level,'')='high' then v_risks:=array_append(v_risks,'Concentração elevada sinalizada na qualificação.'); end if;
  if coalesce(q.delinquency_signal_level,'')='high' then v_risks:=array_append(v_risks,'Sinal elevado de inadimplência exige validação do histórico da carteira.'); end if;
  if cardinality(v_risks)=0 then v_risks:=array['Principais riscos ainda dependem da diligência financeira, jurídica e operacional; não presumir ausência de risco.']; end if;

  v_market_summary:=concat_ws(' ',
    format('Comparar %s com alternativas de funding aderentes à natureza do lastro e ao estágio da companhia.',v_structure),
    'Tamanho e prazo permanecem a dimensionar até existirem dados financeiros suficientes.',
    'O Market Map mostra alternativas, trade-offs e riscos; não recomenda instrumento por disponibilidade de dado.'
  );

  v_confidence:=least(0.99,greatest(0,coalesce(q.confidence_score,q.source_confidence_score,0)));
  v_evidence:=jsonb_build_object(
    'engineVersion','origination_thesis_v1',
    'qualificationSnapshotId',q.id,
    'leadScoreSnapshotId',l.id,
    'publicEvidence',v_public,
    'triggers',v_trigger_evidence,
    'patterns',v_pattern_evidence,
    'signals',v_signal_evidence,
    'evidenceRules',jsonb_build_object('noInventedTicket',true,'noInventedTenor',true,'humanReviewRequired',true)
  );

  select id,version into v_previous_id,v_version from public.thesis_outputs where company_id=p_company_id order by version desc,created_at desc limit 1;
  v_version:=coalesce(v_version,0)+1;
  if v_previous_id is not null then update public.thesis_outputs set status='superseded',updated_at=now() where id=v_previous_id and status<>'rejected'; end if;

  insert into public.thesis_outputs(
    company_id,thesis_version,why_credit,why_now,suggested_structure,commercial_angle,risks_to_validate,evidence,
    version,status,structure_rationale,market_map_summary,next_action,confidence_score,
    qualification_snapshot_id,lead_score_snapshot_id,supersedes_id,review_status,created_at,updated_at
  ) values (
    p_company_id,'evidence_v1',v_why_credit,v_why_now,v_structure,v_commercial_angle,v_risks,v_evidence,
    v_version,'draft',v_structure_rationale,v_market_summary,v_next_action,v_confidence,
    q.id,l.id,v_previous_id,'pending',now(),now()
  ) returning id into v_thesis_id;

  insert into public.market_map_cards(company_id,thesis_id,asset_type,suggested_structure,investor_profile,comparables,rationale,metadata,option_rank,size_guidance,risk_level,created_by,created_at,updated_at)
  values
    (p_company_id,v_thesis_id,coalesce(nullif(array_to_string(q.receivables_type,', '),''),'Ativos/fluxo a validar'),v_structure,'Crédito estruturado / DCM conforme diligência','{}'::text[],v_structure_rationale,jsonb_build_object('thesisId',v_thesis_id,'source','qualification+triggers'),1,'A dimensionar',v_risk_level,'thesis_engine_v1',now(),now()),
    (p_company_id,v_thesis_id,coalesce(nullif(array_to_string(q.receivables_type,', '),''),'Recebíveis a validar'),'FIDC','Gestores/FIDCs com mandato aderente ao lastro','{}'::text[],'Adequada apenas se houver recebíveis elegíveis, cessíveis e operacionalmente estruturáveis.',jsonb_build_object('fitFidc',q.fit_fidc,'receivables',q.receivables_type),2,'A dimensionar',case when coalesce(q.fit_fidc,false) then 'conditional_fit' else 'unverified' end,'thesis_engine_v1',now(),now()),
    (p_company_id,v_thesis_id,'Crédito corporativo / fluxo de caixa','Nota Comercial / Debênture','Investidores de crédito privado / DCM','{}'::text[],'Alternativa depende de capacidade de dívida, governança, documentação, distribuição e perfil de caixa.',jsonb_build_object('fitDcm',q.fit_dcm,'fundingStructure',q.funding_structure_type),3,'A dimensionar',case when coalesce(q.fit_dcm,false) then 'conditional_fit' else 'unverified' end,'thesis_engine_v1',now(),now());

  return v_thesis_id;
end;
$$;

revoke all on function public.generate_origination_thesis_v1(uuid) from public,anon,authenticated;
grant execute on function public.generate_origination_thesis_v1(uuid) to service_role;

create or replace function public.refresh_top_origination_theses_v1(p_limit integer default 20)
returns table(company_id uuid,thesis_id uuid,ranking_position integer)
language plpgsql
security definer
set search_path='public'
as $$
declare r record; v_id uuid;
begin
  for r in
    with latest as (select max(created_at) created_at from public.ranking_v2)
    select rv.company_id,rv.position
    from public.ranking_v2 rv join latest l on rv.created_at=l.created_at
    where public.is_company_decision_eligible(rv.company_id)
    order by rv.position asc
    limit least(20,greatest(1,coalesce(p_limit,20)))
  loop
    v_id:=public.generate_origination_thesis_v1(r.company_id);
    company_id:=r.company_id; thesis_id:=v_id; ranking_position:=r.position; return next;
  end loop;
end;
$$;
revoke all on function public.refresh_top_origination_theses_v1(integer) from public,anon,authenticated;
grant execute on function public.refresh_top_origination_theses_v1(integer) to service_role;

create or replace function public.review_origination_thesis_v1(
  p_thesis_id uuid,
  p_action text,
  p_reviewer text,
  p_review_notes text default null,
  p_suggested_structure text default null,
  p_why_credit text default null,
  p_why_now text default null,
  p_structure_rationale text default null,
  p_next_action text default null,
  p_commercial_angle text default null
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  old public.thesis_outputs%rowtype;
  v_new_id uuid;
  v_review_status text;
  v_status text;
begin
  if p_action not in ('approve','request_changes','reject','edit') then raise exception 'Invalid review action'; end if;
  if nullif(btrim(coalesce(p_reviewer,'')),'') is null then raise exception 'Reviewer is required'; end if;
  select * into old from public.thesis_outputs where id=p_thesis_id;
  if old.id is null then raise exception 'Thesis not found'; end if;
  if not public.is_company_decision_eligible(old.company_id) then raise exception using errcode='23514',message='Company is not decision-eligible'; end if;

  v_review_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
  v_status:=case p_action when 'approve' then 'reviewed' when 'reject' then 'rejected' else 'draft' end;
  update public.thesis_outputs set status='superseded',updated_at=now() where id=old.id and old.status<>'rejected';

  insert into public.thesis_outputs(
    company_id,thesis_version,why_credit,why_now,suggested_structure,commercial_angle,risks_to_validate,evidence,
    version,status,structure_rationale,market_map_summary,next_action,confidence_score,
    qualification_snapshot_id,lead_score_snapshot_id,supersedes_id,review_status,
    reviewed_by,reviewed_at,review_notes,created_at,updated_at
  ) values (
    old.company_id,'human_review_v1',coalesce(nullif(p_why_credit,''),old.why_credit),coalesce(nullif(p_why_now,''),old.why_now),
    coalesce(nullif(p_suggested_structure,''),old.suggested_structure),coalesce(nullif(p_commercial_angle,''),old.commercial_angle),old.risks_to_validate,
    coalesce(old.evidence,'{}'::jsonb)||jsonb_build_object('review',jsonb_build_object('action',p_action,'reviewer',p_reviewer,'notes',p_review_notes,'reviewedAt',now())),
    old.version+1,v_status,coalesce(nullif(p_structure_rationale,''),old.structure_rationale),old.market_map_summary,
    coalesce(nullif(p_next_action,''),old.next_action),old.confidence_score,old.qualification_snapshot_id,old.lead_score_snapshot_id,old.id,v_review_status,
    p_reviewer,now(),p_review_notes,now(),now()
  ) returning id into v_new_id;

  insert into public.market_map_cards(company_id,thesis_id,asset_type,suggested_structure,investor_profile,comparables,rationale,metadata,option_rank,size_guidance,risk_level,created_by,created_at,updated_at)
  select company_id,v_new_id,asset_type,
    case when option_rank=1 and nullif(p_suggested_structure,'') is not null then p_suggested_structure else suggested_structure end,
    investor_profile,comparables,rationale,coalesce(metadata,'{}'::jsonb)||jsonb_build_object('copiedFromThesisId',old.id),
    option_rank,size_guidance,risk_level,'human_review_v1',now(),now()
  from public.market_map_cards where thesis_id=old.id;
  return v_new_id;
end;
$$;

revoke all on function public.review_origination_thesis_v1(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.review_origination_thesis_v1(uuid,text,text,text,text,text,text,text,text,text) to service_role;

comment on function public.generate_origination_thesis_v1(uuid) is 'Creates an append-only evidence-backed origination thesis + canonical Market Map options. Never invents ticket/tenor and requires decision eligibility.';
comment on function public.refresh_top_origination_theses_v1(integer) is 'Materializes evidence-backed theses only for the current decision-eligible ranking, capped at 20.';
comment on function public.review_origination_thesis_v1(uuid,text,text,text,text,text,text,text,text,text) is 'Versioned human thesis review. Approval/edit/rejection creates a new thesis row and preserves lineage.';

notify pgrst,'reload schema';
