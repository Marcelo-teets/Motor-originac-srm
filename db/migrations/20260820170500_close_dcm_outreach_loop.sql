-- MVP closure: make ranking -> outreach -> governed learning operational.
-- No messages are sent automatically. Missing contacts are explicit, never fabricated.

create table if not exists public.dcm_outreach_learning_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  rule_text text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  source_feedback_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pending_review' check (status in ('pending_review','reviewed','applied','rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);

create index if not exists idx_dcm_outreach_learning_rules_status
  on public.dcm_outreach_learning_rules(status, occurrence_count desc, last_seen_at desc);

alter table public.dcm_outreach_learning_rules enable row level security;
drop policy if exists dcm_outreach_learning_rules_read_authenticated on public.dcm_outreach_learning_rules;
create policy dcm_outreach_learning_rules_read_authenticated
  on public.dcm_outreach_learning_rules for select to authenticated using (true);
grant select on public.dcm_outreach_learning_rules to authenticated;
grant all on public.dcm_outreach_learning_rules to service_role;

create or replace function public.capture_dcm_outreach_learning_rule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule text;
  v_key text;
begin
  if jsonb_typeof(coalesce(new.learned_rules, '[]'::jsonb)) <> 'array' then
    return new;
  end if;

  for v_rule in
    select btrim(value)
    from jsonb_array_elements_text(coalesce(new.learned_rules, '[]'::jsonb))
    where btrim(value) <> ''
  loop
    v_key := encode(extensions.digest(lower(regexp_replace(v_rule, '\s+', ' ', 'g')), 'sha256'), 'hex');
    insert into public.dcm_outreach_learning_rules as rule (
      rule_key, rule_text, occurrence_count, source_feedback_ids, status, first_seen_at, last_seen_at
    ) values (
      v_key, v_rule, 1, array[new.id], 'pending_review', now(), now()
    )
    on conflict (rule_key) do update set
      rule_text = excluded.rule_text,
      occurrence_count = rule.occurrence_count + 1,
      source_feedback_ids = case
        when new.id = any(rule.source_feedback_ids) then rule.source_feedback_ids
        else array_append(rule.source_feedback_ids, new.id)
      end,
      status = case when rule.status = 'rejected' then 'pending_review' else rule.status end,
      last_seen_at = now();
  end loop;
  return new;
end;
$$;

revoke all on function public.capture_dcm_outreach_learning_rule() from public, anon, authenticated;
grant execute on function public.capture_dcm_outreach_learning_rule() to service_role;

drop trigger if exists trg_capture_dcm_outreach_learning_rule on public.dcm_outreach_feedback;
create trigger trg_capture_dcm_outreach_learning_rule
after insert or update of learned_rules on public.dcm_outreach_feedback
for each row execute function public.capture_dcm_outreach_learning_rule();

create or replace view public.dcm_outreach_learning_queue_v
with (security_invoker = true)
as
select
  rule.id,
  rule.rule_text,
  rule.occurrence_count,
  rule.status,
  rule.source_feedback_ids,
  rule.first_seen_at,
  rule.last_seen_at,
  rule.reviewed_at
from public.dcm_outreach_learning_rules rule
order by
  case rule.status when 'pending_review' then 0 when 'reviewed' then 1 when 'applied' then 2 else 3 end,
  rule.occurrence_count desc,
  rule.last_seen_at desc;

grant select on public.dcm_outreach_learning_queue_v to authenticated, service_role;

create or replace function public.materialize_dcm_daily_outreach(
  p_generated_on date default current_date,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit,20),50));
  v_snapshot_at timestamptz;
begin
  select max(created_at) into v_snapshot_at from public.ranking_v2;
  if v_snapshot_at is null then
    return jsonb_build_object('status','no_ranking','generatedOn',p_generated_on,'inserted',0);
  end if;

  with ranked as (
    select r.*
    from public.ranking_v2 r
    where r.created_at = v_snapshot_at
    order by r.position
    limit v_limit
  ), candidates as (
    select
      ranked.company_id,
      ranked.position,
      ranked.ranking_score,
      ranked.lead_score,
      ranked.qualification_score,
      coalesce(nullif(brief.suggested_structure,''),'Estrutura a validar') as product_hypothesis,
      concat_ws(' ', nullif(brief.why_credit,''), nullif(brief.why_now,''), nullif(brief.commercial_angle,'')) as thesis,
      coalesce(nullif(brief.next_action,''),'Validar funding atual e identificar o decisor financeiro.') as brief_next_action,
      brief.why_credit,
      brief.why_now,
      brief.probable_pattern,
      brief.commercial_angle,
      brief.origination_conviction_score,
      brief.brief_confidence
    from ranked
    left join public.company_origination_brief_v1 brief on brief.company_id=ranked.company_id
    where not exists (
      select 1 from public.dcm_daily_leads existing
      where existing.company_id=ranked.company_id and existing.generated_on=p_generated_on
    )
  )
  insert into public.dcm_daily_leads (
    company_id, contact_name, contact_role, linkedin_url, product_hypothesis, priority,
    thesis, generated_message, actual_message, outreach_status, recommended_skills,
    source_trace, next_action, generated_on, created_by, updated_by
  )
  select
    candidate.company_id,
    'Contato a identificar',
    'CEO/CFO/Capital Markets/Funding',
    null,
    candidate.product_hypothesis,
    case
      when candidate.position <= 10 or candidate.ranking_score >= 80 then 'A'
      when candidate.position <= 25 or candidate.ranking_score >= 65 then 'B'
      else 'C'
    end,
    coalesce(nullif(candidate.thesis,''),'Tese de originação em atualização; validar evidências antes da abordagem.'),
    null,
    null,
    'missing_data',
    jsonb_build_array('pesquisa contextual','identificar decisor financeiro','validar funding e timing'),
    jsonb_build_array(
      jsonb_build_object(
        'type','ranking_v2', 'snapshotAt',v_snapshot_at, 'position',candidate.position,
        'rankingScore',candidate.ranking_score, 'leadScore',candidate.lead_score,
        'qualificationScore',candidate.qualification_score
      ),
      jsonb_build_object(
        'type','origination_brief_v1','whyCredit',candidate.why_credit,'whyNow',candidate.why_now,
        'probablePattern',candidate.probable_pattern,'commercialAngle',candidate.commercial_angle,
        'convictionScore',candidate.origination_conviction_score,'confidence',candidate.brief_confidence
      )
    ),
    concat('Identificar decisor financeiro validado e, em seguida: ', candidate.brief_next_action),
    p_generated_on,
    null,
    null
  from candidates candidate;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object(
    'status','completed',
    'generatedOn',p_generated_on,
    'rankingSnapshotAt',v_snapshot_at,
    'limit',v_limit,
    'inserted',v_inserted,
    'autoSend',false,
    'contactPolicy','never_fabricate_contact'
  );
end;
$$;

revoke all on function public.materialize_dcm_daily_outreach(date,integer) from public, anon, authenticated;
grant execute on function public.materialize_dcm_daily_outreach(date,integer) to service_role;

comment on function public.materialize_dcm_daily_outreach(date,integer) is
  'Materializes the daily DCM queue from the latest Ranking V2 + Origination Brief. Never sends outreach and never invents a person; unresolved contacts remain missing_data.';
comment on table public.dcm_outreach_learning_rules is
  'Governed reusable writing rules sourced from real generated-vs-sent outreach feedback; rules require review before applied status.';
