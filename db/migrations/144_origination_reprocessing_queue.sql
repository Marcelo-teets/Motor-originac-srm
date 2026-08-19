-- MVP Closure Gate 1: decouple high-volume signal ingestion from expensive derived refreshes.
-- Goal: company_signals writes stay fast and deterministic; derived layers are refreshed once per company.

create table if not exists public.origination_reprocessing_queue (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  reasons jsonb not null default '[]'::jsonb,
  first_queued_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_origination_reprocessing_queue_status_queued
  on public.origination_reprocessing_queue(status, queued_at);

alter table public.origination_reprocessing_queue enable row level security;

-- Runtime table is service-owned. No end-user policies are intentionally created here.
revoke all on table public.origination_reprocessing_queue from anon, authenticated;
grant select, insert, update, delete on table public.origination_reprocessing_queue to service_role;

create or replace function public.enqueue_company_origination_reprocessing(
  p_company_id uuid,
  p_reason text default 'unspecified'
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if p_company_id is null then return; end if;

  insert into public.origination_reprocessing_queue(
    company_id,status,reasons,first_queued_at,queued_at,started_at,finished_at,attempts,last_error,updated_at
  ) values (
    p_company_id,
    'queued',
    case when v_reason is null then '[]'::jsonb else jsonb_build_array(v_reason) end,
    now(),now(),null,null,0,null,now()
  )
  on conflict (company_id) do update set
    status='queued',
    reasons=(
      select coalesce(jsonb_agg(value order by value),'[]'::jsonb)
      from (
        select distinct value
        from jsonb_array_elements_text(
          coalesce(public.origination_reprocessing_queue.reasons,'[]'::jsonb)
          || case when v_reason is null then '[]'::jsonb else jsonb_build_array(v_reason) end
        ) as reason(value)
      ) dedup
    ),
    queued_at=now(),
    started_at=null,
    finished_at=null,
    last_error=null,
    updated_at=now();
end;
$$;

revoke all on function public.enqueue_company_origination_reprocessing(uuid,text) from public, anon, authenticated;
grant execute on function public.enqueue_company_origination_reprocessing(uuid,text) to service_role;

-- Preserve signal -> Factor Map observation writes, but stop refreshing the entire company
-- synchronously for every signal. The refresh is queued and deduplicated by company_id.
create or replace function public.capture_signal_factor_observations()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  source_code_value text;
  strength_value numeric;
  confidence_value numeric;
  observed_value timestamptz;
  rule_row public.source_factor_rules%rowtype;
begin
  source_code_value := coalesce(
    new.metadata ->> 'sourceCode',
    new.evidence_payload ->> 'sourceCode',
    new.evidence_payload #>> '{normalized,sourceCode}',
    '*'
  );
  strength_value := least(100, greatest(0, coalesce(new.signal_strength, new.strength, 0)));
  confidence_value := coalesce(
    new.confidence_score,
    case when coalesce(new.confidence,0) > 1 then new.confidence / 100.0 else new.confidence end,
    0
  );
  confidence_value := least(1, greatest(0, confidence_value));
  observed_value := coalesce(new.observed_at, new.created_at, now());

  for rule_row in
    select rule.*
    from public.source_factor_rules rule
    where rule.active
      and rule.signal_type = new.signal_type
      and rule.source_code in ('*', source_code_value)
      and strength_value >= rule.min_strength
      and confidence_value >= rule.confidence_floor
  loop
    insert into public.company_factor_observations (
      company_id, signal_id, factor_id, rule_id, contribution,
      signal_strength, confidence_score, observed_at, expires_at,
      evidence_payload, created_at, updated_at
    )
    select
      new.company_id,
      new.id,
      rule_row.factor_id,
      rule_row.id,
      (rule_row.base_contribution * (strength_value / 100.0) * confidence_value)::numeric(10,4),
      strength_value,
      confidence_value,
      observed_value,
      observed_value + make_interval(days => factor.decay_days),
      jsonb_build_object(
        'signalType', new.signal_type,
        'signalLabel', new.signal_label,
        'sourceCode', source_code_value,
        'evidenceUrl', new.evidence_url,
        'evidenceText', new.evidence_text,
        'ruleVersion', rule_row.rule_version,
        'ruleRationale', rule_row.rationale,
        'signalEvidence', coalesce(new.evidence_payload, '{}'::jsonb)
      ),
      now(),
      now()
    from public.origination_factor_catalog factor
    where factor.id = rule_row.factor_id
      and factor.active
    on conflict (signal_id, factor_id, rule_id) do update set
      contribution = excluded.contribution,
      signal_strength = excluded.signal_strength,
      confidence_score = excluded.confidence_score,
      observed_at = excluded.observed_at,
      expires_at = excluded.expires_at,
      evidence_payload = excluded.evidence_payload,
      updated_at = now();
  end loop;

  if new.signal_type <> 'origination_brief' then
    perform public.enqueue_company_origination_reprocessing(new.company_id,'company_signal:' || new.signal_type);
  end if;
  return new;
end;
$$;

-- Origination Brief trigger becomes an enqueue-only invalidation trigger.
create or replace function public.trg_refresh_company_origination_brief_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_signal_type text;
  v_mapped boolean;
  v_dimension text;
begin
  if tg_op='DELETE' then v_company_id:=old.company_id; else v_company_id:=new.company_id; end if;

  if tg_table_name='company_signals' then
    v_signal_type:=case when tg_op='DELETE' then old.signal_type else new.signal_type end;
    if v_signal_type='origination_brief' then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;

    v_mapped:=coalesce((public.origination_signal_reasoning_v2(v_signal_type)->>'mapped')::boolean,false);
    v_dimension:=public.origination_signal_reasoning_v2(v_signal_type)->>'decisionDimension';
    if not v_mapped or v_dimension='context' then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  end if;

  perform public.enqueue_company_origination_reprocessing(v_company_id,
    case when tg_table_name='company_signals' then 'origination_brief_signal:' || coalesce(v_signal_type,'unknown')
         else 'origination_brief_dependency:' || tg_table_name end
  );
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

-- Drain a bounded batch. Each company is refreshed at most once per queue cycle.
-- Errors are isolated per company and retained for retry/observability.
create or replace function public.process_origination_reprocessing_queue(p_limit integer default 25)
returns table(company_id uuid, status text, error text)
language plpgsql
security definer
set search_path=public
as $$
declare
  q record;
  v_limit integer := least(100, greatest(1, coalesce(p_limit,25)));
begin
  for q in
    select r.company_id
    from public.origination_reprocessing_queue r
    where r.status in ('queued','failed')
    order by r.queued_at asc
    for update skip locked
    limit v_limit
  loop
    update public.origination_reprocessing_queue r
    set status='processing',started_at=now(),finished_at=null,attempts=r.attempts+1,last_error=null,updated_at=now()
    where r.company_id=q.company_id;

    begin
      perform public.refresh_company_factor_snapshots(q.company_id,current_date);
      perform public.refresh_company_origination_brief_v1(q.company_id);

      update public.origination_reprocessing_queue r
      set status='completed',finished_at=now(),last_error=null,updated_at=now()
      where r.company_id=q.company_id;

      company_id:=q.company_id; status:='completed'; error:=null; return next;
    exception when others then
      update public.origination_reprocessing_queue r
      set status='failed',finished_at=now(),last_error=left(sqlerrm,2000),updated_at=now()
      where r.company_id=q.company_id;

      company_id:=q.company_id; status:='failed'; error:=left(sqlerrm,2000); return next;
    end;
  end loop;
end;
$$;

revoke all on function public.process_origination_reprocessing_queue(integer) from public, anon, authenticated;
grant execute on function public.process_origination_reprocessing_queue(integer) to service_role;

-- Queue currently real, monitoring-eligible companies once so the new worker starts from a clean baseline.
insert into public.origination_reprocessing_queue(company_id,status,reasons,first_queued_at,queued_at,updated_at)
select c.id,'queued',jsonb_build_array('migration_144_baseline'),now(),now(),now()
from public.companies c
where public.is_company_entity_eligible(c.id)
on conflict (company_id) do update set status='queued',queued_at=now(),updated_at=now();
