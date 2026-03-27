create table if not exists engine_requests (
  id uuid primary key default gen_random_uuid(),
  requester_engine text not null,
  target_engine text not null,
  company_id text references companies(id) on delete cascade,
  source_id text references source_catalog(id),
  request_type text not null,
  priority text not null default 'medium',
  status text not null default 'queued',
  reason text,
  evidence_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_engine_requests_target_status on engine_requests(target_engine, status, created_at desc);
create index if not exists idx_engine_requests_company on engine_requests(company_id, created_at desc);

create table if not exists engine_learning_events (
  id uuid primary key default gen_random_uuid(),
  engine_name text not null,
  company_id text references companies(id) on delete cascade,
  source_id text references source_catalog(id),
  event_type text not null,
  severity text not null default 'info',
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_engine_learning_events_engine on engine_learning_events(engine_name, created_at desc);

create table if not exists code_improvement_proposals (
  id uuid primary key default gen_random_uuid(),
  engine_name text not null,
  proposal_type text not null,
  title text not null,
  rationale text,
  target_module text,
  status text not null default 'draft',
  risk_level text not null default 'medium',
  proposal_payload jsonb not null default '{}'::jsonb,
  test_plan jsonb not null default '[]'::jsonb,
  branch_name text,
  pr_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_code_improvement_proposals_engine on code_improvement_proposals(engine_name, created_at desc);
