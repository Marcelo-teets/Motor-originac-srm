-- People & Capital Intelligence
-- Adds governed people-growth, job-intent and investor relationship signals
-- without creating a parallel scoring or graph architecture.

create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  investor_type text not null default 'unknown' check (investor_type in (
    'unknown', 'venture_capital', 'growth_equity', 'private_equity', 'corporate_venture',
    'family_office', 'angel', 'strategic', 'asset_manager', 'credit_fund'
  )),
  website text,
  country_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists public.company_investor_relationships (
  id uuid primary key default gen_random_uuid(),
  relationship_key text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  relationship_type text not null default 'equity_investor' check (relationship_type in (
    'equity_investor', 'lead_investor', 'participant_investor', 'debt_investor', 'strategic_investor'
  )),
  round_stage text,
  round_amount numeric,
  round_currency text,
  is_lead boolean not null default false,
  announced_at timestamptz,
  observed_at timestamptz not null default now(),
  source_url text,
  confidence_score numeric not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_investor_relationships_company
  on public.company_investor_relationships (company_id, observed_at desc);
create index if not exists idx_company_investor_relationships_investor
  on public.company_investor_relationships (investor_id, observed_at desc);
create index if not exists idx_company_investor_relationships_source
  on public.company_investor_relationships (source_id, observed_at desc);

create table if not exists public.company_job_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.source_catalog(id) on delete cascade,
  external_job_id text not null,
  title text not null,
  normalized_title text not null,
  role_family text not null default 'other' check (role_family in (
    'capital_markets', 'funding', 'treasury', 'credit', 'risk', 'underwriting',
    'collections', 'finance', 'other'
  )),
  seniority text not null default 'unspecified' check (seniority in (
    'c_level', 'executive', 'manager', 'senior', 'junior', 'unspecified'
  )),
  location text,
  employment_type text,
  source_url text not null,
  opened_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  dcm_relevance_score numeric not null default 0 check (dcm_relevance_score >= 0 and dcm_relevance_score <= 100),
  credit_relevance_score numeric not null default 0 check (credit_relevance_score >= 0 and credit_relevance_score <= 100),
  confidence_score numeric not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_id, external_job_id)
);

create index if not exists idx_company_job_openings_company_status
  on public.company_job_openings (company_id, status, last_seen_at desc);
create index if not exists idx_company_job_openings_role
  on public.company_job_openings (role_family, status, dcm_relevance_score desc);
create index if not exists idx_company_job_openings_source
  on public.company_job_openings (source_id, last_seen_at desc);

alter table public.investors enable row level security;
alter table public.company_investor_relationships enable row level security;
alter table public.company_job_openings enable row level security;

grant select on public.investors, public.company_investor_relationships, public.company_job_openings to authenticated;
grant all on public.investors, public.company_investor_relationships, public.company_job_openings to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investors' and policyname='investors_authenticated_select') then
    create policy investors_authenticated_select on public.investors for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='investors' and policyname='investors_service_role_all') then
    create policy investors_service_role_all on public.investors for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='company_investor_relationships' and policyname='company_investor_relationships_authenticated_select') then
    create policy company_investor_relationships_authenticated_select on public.company_investor_relationships for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='company_investor_relationships' and policyname='company_investor_relationships_service_role_all') then
    create policy company_investor_relationships_service_role_all on public.company_investor_relationships for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='company_job_openings' and policyname='company_job_openings_authenticated_select') then
    create policy company_job_openings_authenticated_select on public.company_job_openings for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='company_job_openings' and policyname='company_job_openings_service_role_all') then
    create policy company_job_openings_service_role_all on public.company_job_openings for all to service_role using (true) with check (true);
  end if;
end $$;

-- Governed sources used by the runtime. Existing rows are promoted instead of duplicated.
insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, health
)
select
  'Company Careers Pages', null, 'jobs', 'BR', 1, 'high', 'weekly', 'active',
  'Capture only public first-party careers pages; preserve job URL, title and observed timestamp.',
  jsonb_build_object(
    'code','src_company_careers',
    'tags',jsonb_build_array('jobs','hiring','headcount','credit','risk','funding','capital-markets'),
    'capturePolicy','json_ld_first_anchor_fallback',
    'firstParty',true
  ),
  'company_site', 'none', 'healthy'
where not exists (select 1 from public.source_catalog where metadata->>'code'='src_company_careers');

update public.source_catalog
set status='active', health='healthy', priority=1, criticality='high', frequency='weekly', updated_at=now()
where metadata->>'code'='src_company_careers';

insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, health
)
select
  'Tech Signals LatAm', 'https://pedrobmesquita.substack.com/', 'news_niche', 'BR', 1, 'high', 'weekly', 'active',
  'Parse public newsletter entries section-aware; corroborate critical financing facts when possible.',
  jsonb_build_object(
    'code','src_tech_signals_latam',
    'feedUrl','https://pedrobmesquita.substack.com/feed',
    'tags',jsonb_build_array('newsletter','traction','headcount','funding','investors','latam'),
    'capturePolicy','rss_full_content_section_aware',
    'confidencePolicy','aggregator_medium_high'
  ),
  'rss', 'none', 'healthy'
where not exists (select 1 from public.source_catalog where metadata->>'code'='src_tech_signals_latam');

update public.source_catalog
set status='active', health='healthy', priority=1, criticality='high', frequency='weekly', updated_at=now(),
    url='https://pedrobmesquita.substack.com/',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('feedUrl','https://pedrobmesquita.substack.com/feed')
where metadata->>'code'='src_tech_signals_latam';

insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, health
)
select
  'Credit & Capital Markets Hiring RSS', 'https://news.google.com/rss', 'jobs', 'BR', 2, 'medium', 'weekly', 'active',
  'Use as discovery/corroboration only; first-party careers pages remain authoritative for open-role state.',
  jsonb_build_object(
    'code','src_jobs_credit_hiring_rss',
    'queryTemplate','{company} ("capital markets" OR funding OR tesouraria OR credito OR risco OR underwriting) (vaga OR hiring OR contrata)',
    'tags',jsonb_build_array('jobs','credit','risk','funding','capital-markets'),
    'sourceType','rss'
  ),
  'rss', 'none', 'healthy'
where not exists (select 1 from public.source_catalog where metadata->>'code'='src_jobs_credit_hiring_rss');

insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, health
)
select
  'VC Portfolio & Investor Change RSS', 'https://news.google.com/rss', 'vc_portfolio', 'BR', 2, 'medium', 'weekly', 'active',
  'Use for discovery and timing; relationship graph requires named-investor evidence.',
  jsonb_build_object(
    'code','src_vc_portfolio_change_rss',
    'queryTemplate','{company} (investidor OR investment OR portfolio OR rodada OR "Series A" OR "Series B" OR seed)',
    'tags',jsonb_build_array('vc','portfolio','funding','investors'),
    'sourceType','rss'
  ),
  'rss', 'none', 'healthy'
where not exists (select 1 from public.source_catalog where metadata->>'code'='src_vc_portfolio_change_rss');

-- Canonical headcount history from the already-existing metric snapshot layer.
create or replace view public.company_headcount_history_v1
with (security_invoker=true)
as
with ranked_daily as (
  select
    s.*,
    row_number() over (
      partition by s.company_id, date_trunc('day', s.observed_at)
      order by s.confidence_score desc, s.observed_at desc, s.created_at desc
    ) as confidence_rank
  from public.company_source_metric_snapshots s
  where s.metric_key='headcount_total'
    and s.observed_vs_inferred='observed'
    and s.metric_value is not null
), series as (
  select
    company_id,
    source_id,
    observed_at,
    metric_value::integer as headcount_total,
    confidence_score,
    raw_payload,
    lag(metric_value::integer) over (partition by company_id order by observed_at) as previous_headcount,
    lag(observed_at) over (partition by company_id order by observed_at) as previous_observed_at
  from ranked_daily
  where confidence_rank=1
)
select
  company_id,
  source_id,
  observed_at,
  headcount_total,
  previous_headcount,
  headcount_total - previous_headcount as headcount_delta,
  case when previous_headcount > 0
    then round(((headcount_total - previous_headcount)::numeric / previous_headcount::numeric) * 100, 2)
    else null end as calculated_growth_pct,
  previous_observed_at,
  confidence_score,
  raw_payload
from series;

grant select on public.company_headcount_history_v1 to authenticated, service_role;

create or replace view public.company_investor_network_v1
with (security_invoker=true)
as
select
  r.company_id,
  c.trade_name as company_name,
  r.investor_id,
  i.name as investor_name,
  i.investor_type,
  r.relationship_type,
  r.round_stage,
  r.round_amount,
  r.round_currency,
  r.is_lead,
  r.announced_at,
  r.observed_at,
  r.source_id,
  r.source_url,
  r.confidence_score,
  r.evidence_payload
from public.company_investor_relationships r
join public.companies c on c.id=r.company_id
join public.investors i on i.id=r.investor_id;

grant select on public.company_investor_network_v1 to authenticated, service_role;

create or replace view public.company_people_capital_snapshot_v1
with (security_invoker=true)
as
with latest_headcount as (
  select distinct on (company_id)
    company_id, observed_at, headcount_total, previous_headcount, headcount_delta,
    calculated_growth_pct, confidence_score
  from public.company_headcount_history_v1
  order by company_id, observed_at desc
), jobs as (
  select
    company_id,
    count(*) filter (where status='open')::integer as open_jobs_total,
    count(*) filter (where status='open' and dcm_relevance_score >= 60)::integer as strategic_open_jobs,
    count(*) filter (where status='open' and role_family='capital_markets')::integer as capital_markets_open_jobs,
    count(*) filter (where status='open' and role_family in ('funding','treasury'))::integer as funding_treasury_open_jobs,
    count(*) filter (where status='open' and role_family in ('credit','risk','underwriting','collections'))::integer as credit_risk_open_jobs,
    count(*) filter (where first_seen_at >= now() - interval '30 days' and dcm_relevance_score >= 60)::integer as new_strategic_jobs_30d
  from public.company_job_openings
  group by company_id
), investors_agg as (
  select company_id, count(distinct investor_id)::integer as known_investors
  from public.company_investor_relationships
  group by company_id
)
select
  c.id as company_id,
  c.trade_name as company_name,
  h.observed_at as headcount_observed_at,
  h.headcount_total,
  h.previous_headcount,
  h.headcount_delta,
  h.calculated_growth_pct,
  coalesce(j.open_jobs_total,0) as open_jobs_total,
  coalesce(j.strategic_open_jobs,0) as strategic_open_jobs,
  coalesce(j.capital_markets_open_jobs,0) as capital_markets_open_jobs,
  coalesce(j.funding_treasury_open_jobs,0) as funding_treasury_open_jobs,
  coalesce(j.credit_risk_open_jobs,0) as credit_risk_open_jobs,
  coalesce(j.new_strategic_jobs_30d,0) as new_strategic_jobs_30d,
  coalesce(i.known_investors,0) as known_investors,
  least(100,
    case
      when h.calculated_growth_pct >= 20 then 35
      when h.calculated_growth_pct >= 10 then 25
      when h.calculated_growth_pct >= 5 then 15
      else 0
    end
    + case when coalesce(j.capital_markets_open_jobs,0) > 0 then 30 else 0 end
    + case when coalesce(j.funding_treasury_open_jobs,0) > 0 then 25 else 0 end
    + case when coalesce(j.credit_risk_open_jobs,0) > 0 then 20 else 0 end
    + least(15, coalesce(j.new_strategic_jobs_30d,0) * 5)
  )::integer as people_timing_score,
  concat_ws(' ',
    case when h.headcount_delta is not null then format('Headcount variou %s pessoas (%s%% calculado).', h.headcount_delta, coalesce(h.calculated_growth_pct,0)) end,
    case when coalesce(j.strategic_open_jobs,0) > 0 then format('%s vagas estratégicas abertas em crédito/risco/funding/DCM.', j.strategic_open_jobs) end,
    case when coalesce(j.capital_markets_open_jobs,0) > 0 then format('%s vagas diretamente em Capital Markets.', j.capital_markets_open_jobs) end,
    case when coalesce(i.known_investors,0) > 0 then format('%s investidores relacionados no grafo.', i.known_investors) end
  ) as people_capital_rationale
from public.companies c
left join latest_headcount h on h.company_id=c.id
left join jobs j on j.company_id=c.id
left join investors_agg i on i.company_id=c.id;

grant select on public.company_people_capital_snapshot_v1 to authenticated, service_role;

-- Extend the existing Obsidian-inspired vault rather than creating another graph engine.
alter table public.knowledge_nodes drop constraint if exists knowledge_nodes_node_type_check;
alter table public.knowledge_nodes add constraint knowledge_nodes_node_type_check check (node_type in (
  'note', 'company', 'thesis', 'signal', 'meeting', 'source', 'playbook', 'structure', 'investor'
));

alter table public.knowledge_links drop constraint if exists knowledge_links_relation_type_check;
alter table public.knowledge_links add constraint knowledge_links_relation_type_check check (relation_type in (
  'wikilink', 'company', 'signal', 'thesis', 'evidence', 'supports', 'challenges', 'related',
  'backed_by', 'portfolio_company', 'funding_round'
));

create or replace function public.sync_people_capital_investor_graph()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_company_node_id uuid;
  v_investor_node_id uuid;
  v_company_name text;
  v_investor_name text;
  v_investor_normalized text;
  v_system_actor uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  select trade_name into v_company_name from public.companies where id=new.company_id;
  select name, normalized_name into v_investor_name, v_investor_normalized from public.investors where id=new.investor_id;

  select id into v_company_node_id from public.knowledge_nodes
  where company_id=new.company_id and node_type='company' and status='active'
  order by updated_at desc limit 1;

  if v_company_node_id is null then
    insert into public.knowledge_nodes (
      title, slug, node_type, content_markdown, excerpt, tags, properties,
      company_id, status, visibility, created_by, updated_by
    ) values (
      coalesce(v_company_name, 'Company'),
      'company-' || new.company_id::text,
      'company',
      '# ' || coalesce(v_company_name, 'Company'),
      'Company node generated by People & Capital Intelligence.',
      array['company','auto-generated'],
      jsonb_build_object('generatedBy','people_capital_intelligence'),
      new.company_id, 'active', 'team', v_system_actor, v_system_actor
    ) returning id into v_company_node_id;
  end if;

  select id into v_investor_node_id from public.knowledge_nodes
  where node_type='investor'
    and properties->>'investorId'=new.investor_id::text
    and status='active'
  order by updated_at desc limit 1;

  if v_investor_node_id is null then
    insert into public.knowledge_nodes (
      title, slug, node_type, content_markdown, excerpt, tags, properties,
      status, visibility, created_by, updated_by
    ) values (
      v_investor_name,
      'investor-' || public.knowledge_slugify(coalesce(v_investor_normalized,v_investor_name)) || '-' || left(new.investor_id::text,8),
      'investor',
      '# ' || v_investor_name || E'\n\nInvestidor relacionado automaticamente a companhias monitoradas.',
      'Investor node generated from sourced funding relationships.',
      array['investor','capital-network','auto-generated'],
      jsonb_build_object('investorId',new.investor_id,'generatedBy','people_capital_intelligence'),
      'active', 'team', v_system_actor, v_system_actor
    ) returning id into v_investor_node_id;
  end if;

  insert into public.knowledge_links (
    source_node_id, target_node_id, target_title, target_slug, relation_type, properties, created_by
  )
  select
    v_company_node_id, v_investor_node_id, n.title, n.slug, 'backed_by',
    jsonb_build_object(
      'relationshipId',new.id,
      'roundStage',new.round_stage,
      'roundAmount',new.round_amount,
      'roundCurrency',new.round_currency,
      'isLead',new.is_lead,
      'announcedAt',new.announced_at,
      'sourceUrl',new.source_url,
      'confidenceScore',new.confidence_score
    ),
    v_system_actor
  from public.knowledge_nodes n where n.id=v_investor_node_id
  on conflict (source_node_id,target_slug,relation_type)
  do update set target_node_id=excluded.target_node_id, target_title=excluded.target_title, properties=excluded.properties;

  insert into public.knowledge_links (
    source_node_id, target_node_id, target_title, target_slug, relation_type, properties, created_by
  )
  select
    v_investor_node_id, v_company_node_id, n.title, n.slug, 'portfolio_company',
    jsonb_build_object('relationshipId',new.id,'sourceUrl',new.source_url,'confidenceScore',new.confidence_score),
    v_system_actor
  from public.knowledge_nodes n where n.id=v_company_node_id
  on conflict (source_node_id,target_slug,relation_type)
  do update set target_node_id=excluded.target_node_id, target_title=excluded.target_title, properties=excluded.properties;

  return new;
end;
$$;

drop trigger if exists trg_people_capital_investor_graph on public.company_investor_relationships;
create trigger trg_people_capital_investor_graph
after insert or update of investor_id, relationship_type, round_stage, round_amount, round_currency, is_lead, announced_at, source_url, confidence_score
on public.company_investor_relationships
for each row execute function public.sync_people_capital_investor_graph();

revoke all on function public.sync_people_capital_investor_graph() from public, anon, authenticated;
grant execute on function public.sync_people_capital_investor_graph() to service_role;

comment on table public.company_job_openings is 'Observed public job openings with role-family classification and DCM/credit relevance.';
comment on table public.company_investor_relationships is 'Sourced company-investor relationships feeding the internal knowledge graph.';
comment on view public.company_people_capital_snapshot_v1 is 'Decision-oriented People & Capital feature snapshot; headcount growth is separated from hiring intent.';
