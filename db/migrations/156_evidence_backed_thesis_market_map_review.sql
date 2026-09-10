-- P2-005..007/P2-010 closure: evidence-backed thesis, market-map options and human review.
-- This migration intentionally does not manufacture a top-20. Materialization only runs for
-- companies that already passed public.is_company_decision_eligible().

alter table public.thesis_outputs add column if not exists version integer not null default 1;
alter table public.thesis_outputs add column if not exists status text not null default 'draft';
alter table public.thesis_outputs add column if not exists why_credit text;
alter table public.thesis_outputs add column if not exists why_now text;
alter table public.thesis_outputs add column if not exists structure_rationale text;
alter table public.thesis_outputs add column if not exists key_risks text[] not null default '{}';
alter table public.thesis_outputs add column if not exists next_action text;
alter table public.thesis_outputs add column if not exists evidence_payload jsonb not null default '{}'::jsonb;
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
alter table public.market_map_cards add column if not exists structure_type text;
alter table public.market_map_cards add column if not exists size_guidance text;
alter table public.market_map_cards add column if not exists risk_level text;
alter table public.market_map_cards add column if not exists evidence_payload jsonb not null default '{}'::jsonb;
alter table public.market_map_cards add column if not exists created_by text not null default 'thesis_engine_v1';
alter table public.market_map_cards add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_market_map_cards_company_thesis on public.market_map_cards(company_id,thesis_id,option_rank);

-- Decision artifacts are machine-generated and/or explicitly reviewed. Browser users may read,
-- but direct table writes are denied so they cannot bypass the review API/RPC contract.
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
set search_path=public
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
  v_summary text;
  v_next_action text;
  v_market_summary text;
  v_risks text[]:='{}';
  v_evidence jsonb:='{}'::jsonb;
  v_trigger_evidence jsonb:='[]'::jsonb;
  v_pattern_evidence jsonb:='[]'::jsonb;
  v_source_evidence jsonb:='[]'::jsonb;
  v_public jsonb:='{}'::jsonb;
  v_confidence numeric:=0;
  v_risk_level text:='none';
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
  v_risk_level:=coalesce(v_public->>'riskLevel','none');

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','trigger','id',t.id,'catalogCode',t.catalog_code,'type',t.trigger_type,
    'strength',t.trigger_strength,'confidence',t.confidence_score,'occurredAt',t.occurred_at,
    'sourceId',t.source_id,'evidence',t.evidence_payload
  ) order by t.trigger_strength desc,t.occurred_at desc),'[]'::jsonb)
  into v_trigger_evidence
  from (select * from public.trigger_events where company_id=p_company_id and material and coalesce(stale_after,now())>=now() order by trigger_strength desc,occurred_at desc limit 8) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','pattern','id',cp.id,'patternId',cp.pattern_id,'confidence',cp.confidence_score,
    'rationale',cp.rationale,'thesisImpact',cp.thesis_impact,'evidence',cp.evidence_payload
  ) order by cp.ranking_impact desc,cp.detected_at desc),'[]'::jsonb)
  into v_pattern_evidence
  from (select * from public.company_patterns where company_id=p_company_id order by ranking_impact desc,detected_at desc limit 6) cp;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','signal','id',s.id,'signalType',s.signal_type,'strength',coalesce(s.signal_strength,s.strength),
    'confidence',coalesce(s.confidence_score,s.confidence),'observedAt',coalesce(s.observed_at,s.created_at),
    'sourceId',s.source_id,'evidenceUrl',s.evidence_url,'evidenceText',s.evidence_text,'evidence',s.evidence_payload
  ) order by coalesce(s.signal_strength,s.strength,0) desc,coalesce(s.observed_at,s.created_at) desc),'[]'::jsonb)
  into v_source_evidence
  from (select * from public.company_signals where company_id=p_company_id order by coalesce(signal_strength,strength,0) desc,coalesce(observed_at,created_at) desc limit 10) s;

  v_structure:=coalesce(nullif(q.suggested_structure_type,''),case when coalesce(q.fit_fidc,false) then 'FIDC' when coalesce(q.fit_dcm,false) then 'Debênture / Nota Comercial' else 'Estrutura a validar' end);
  v_next_action:=coalesce(nullif(q.next_action,''),nullif(l.next_action,''),'Validar estrutura, ticket, prazo, garantias e sponsor financeiro antes da abordagem.');

  v_why_credit:=concat_ws(' ',
    case when coalesce(q.has_credit_product,false) then 'Há evidência de produto de crédito.' end,
    case when coalesce(q.has_receivables,false) then 'Há evidência de recebíveis.' end,
    case when coalesce(q.funding_gap,false) or coalesce(q.funding_gap_level,'') in ('medium','high','critical') then 'Há sinal de necessidade/desalinhamento de funding.' end,
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
    'Tamanho e prazo permanecem “a dimensionar” até existirem dados financeiros suficientes.',
    'O Market Map deve mostrar alternativas, trade-offs e riscos; não recomendar instrumento por disponibilidade de dado.'
  );

  v_summary:=concat_ws(' ',coalesce(nullif(c.trade_name,''),nullif(c.legal_name,''),'Empresa'),v_why_credit,format('Por que agora: %s',v_why_now),format('Estrutura sugerida: %s.',v_structure));
  v_confidence:=least(0.99,greatest(0,coalesce(q.confidence_score,q.source_confidence_score,0)));

  v_evidence:=jsonb_build_object(
    'engineVersion','origination_thesis_v1',
    'qualificationSnapshotId',q.id,
    'leadScoreSnapshotId',l.id,
    'publicEvidence',v_public,
    'triggers',v_trigger_evidence,
    'patterns',v_pattern_evidence,
    'signals',v_source_evidence,
    'evidenceRules',jsonb_build_object(
      'noInventedTicket',true,'noInventedTenor',true,'materialTriggerRequiredForWhyNow',true,'humanReviewRequired',true
    )
  );

  select id,version into v_previous_id,v_version from public.thesis_outputs where company_id=p_company_id order by version desc,created_at desc limit 1;
  v_version:=coalesce(v_version,0)+1;
  if v_previous_id is not null then update public.thesis_outputs set status='superseded',updated_at=now() where id=v_previous_id and status<>'rejected'; end if;

  insert into public.thesis_outputs(
    company_id,thesis_summary,structure_type,market_map_summary,confidence_score,version,status,
    why_credit,why_now,structure_rationale,key_risks,next_action,evidence_payload,
    qualification_snapshot_id,lead_score_snapshot_id,supersedes_id,review_status,created_at,updated_at
  ) values (
    p_company_id,v_summary,v_structure,v_market_summary,v_confidence,v_version,'draft',
    v_why_credit,v_why_now,v_structure_rationale,v_risks,v_next_action,v_evidence,
    q.id,l.id,v_previous_id,'pending',now(),now()
  ) returning id into v_thesis_id;

  delete from public.market_map_cards where company_id=p_company_id and thesis_id=v_thesis_id;
  insert into public.market_map_cards(company_id,thesis_id,peer_name,peer_type,rationale,option_rank,structure_type,size_guidance,risk_level,evidence_payload,created_by,created_at,updated_at)
  values
    (p_company_id,v_thesis_id,'Estrutura-base','structure_option',v_structure_rationale,1,v_structure,'A dimensionar',v_risk_level,jsonb_build_object('thesisId',v_thesis_id,'source','qualification+triggers'),'thesis_engine_v1',now(),now()),
    (p_company_id,v_thesis_id,'Alternativa FIDC','structure_option','Adequada apenas se houver recebíveis elegíveis, cessíveis e operacionalmente estruturáveis.',2,'FIDC','A dimensionar',case when coalesce(q.fit_fidc,false) then 'conditional_fit' else 'unverified' end,jsonb_build_object('fitFidc',q.fit_fidc,'receivables',q.receivables_type),'thesis_engine_v1',now(),now()),
    (p_company_id,v_thesis_id,'Alternativa DCM','structure_option','Nota comercial/debênture depende de capacidade de dívida, governança, documentação, distribuição e perfil de caixa.',3,'Nota Comercial / Debênture','A dimensionar',case when coalesce(q.fit_dcm,false) then 'conditional_fit' else 'unverified' end,jsonb_build_object('fitDcm',q.fit_dcm,'fundingStructure',q.funding_structure_type),'thesis_engine_v1',now(),now());

  return v_thesis_id;
end;
$$;

revoke all on function public.generate_origination_thesis_v1(uuid) from public,anon,authenticated;
grant execute on function public.generate_origination_thesis_v1(uuid) to service_role;

create or replace function public.refresh_top_origination_theses_v1(p_limit integer default 20)
returns table(company_id uuid,thesis_id uuid,ranking_position integer)
language plpgsql
security definer
set search_path=public
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

-- Human review is versioned: every review creates a new row and supersedes the prior thesis.
create or replace function public.review_origination_thesis_v1(
  p_thesis_id uuid,
  p_action text,
  p_reviewer text,
  p_review_notes text default null,
  p_thesis_summary text default null,
  p_structure_type text default null,
  p_why_credit text default null,
  p_why_now text default null,
  p_structure_rationale text default null,
  p_next_action text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
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
    company_id,thesis_summary,structure_type,market_map_summary,confidence_score,version,status,
    why_credit,why_now,structure_rationale,key_risks,next_action,evidence_payload,
    qualification_snapshot_id,lead_score_snapshot_id,supersedes_id,review_status,
    reviewed_by,reviewed_at,review_notes,created_at,updated_at
  ) values (
    old.company_id,coalesce(nullif(p_thesis_summary,''),old.thesis_summary),coalesce(nullif(p_structure_type,''),old.structure_type),old.market_map_summary,old.confidence_score,old.version+1,v_status,
    coalesce(nullif(p_why_credit,''),old.why_credit),coalesce(nullif(p_why_now,''),old.why_now),coalesce(nullif(p_structure_rationale,''),old.structure_rationale),old.key_risks,coalesce(nullif(p_next_action,''),old.next_action),
    coalesce(old.evidence_payload,'{}'::jsonb)||jsonb_build_object('review',jsonb_build_object('action',p_action,'reviewer',p_reviewer,'notes',p_review_notes,'reviewedAt',now())),
    old.qualification_snapshot_id,old.lead_score_snapshot_id,old.id,v_review_status,p_reviewer,now(),p_review_notes,now(),now()
  ) returning id into v_new_id;

  insert into public.market_map_cards(company_id,thesis_id,peer_name,peer_type,rationale,option_rank,structure_type,size_guidance,risk_level,evidence_payload,created_by,created_at,updated_at)
  select company_id,v_new_id,peer_name,peer_type,rationale,option_rank,
    case when option_rank=1 and nullif(p_structure_type,'') is not null then p_structure_type else structure_type end,
    size_guidance,risk_level,evidence_payload||jsonb_build_object('copiedFromThesisId',old.id),'human_review_v1',now(),now()
  from public.market_map_cards where thesis_id=old.id;
  return v_new_id;
end;
$$;

revoke all on function public.review_origination_thesis_v1(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.review_origination_thesis_v1(uuid,text,text,text,text,text,text,text,text,text) to service_role;

comment on function public.generate_origination_thesis_v1(uuid) is 'Creates an append-only evidence-backed origination thesis + Market Map options. Never invents ticket/tenor and requires decision eligibility.';
comment on function public.refresh_top_origination_theses_v1(integer) is 'Materializes evidence-backed theses only for the current decision-eligible ranking, capped at 20.';
comment on function public.review_origination_thesis_v1(uuid,text,text,text,text,text,text,text,text,text) is 'Versioned human thesis review. Approval/edit/rejection creates a new thesis row and preserves lineage.';

notify pgrst,'reload schema';
