alter table if exists companies add column if not exists account_tier text;
alter table if exists companies add column if not exists estimated_ticket_size numeric;
alter table if exists companies add column if not exists commercial_owner_name text;
alter table if exists companies add column if not exists next_step text;
alter table if exists companies add column if not exists next_step_due_at timestamptz;
alter table if exists companies add column if not exists last_touchpoint_at timestamptz;
alter table if exists companies add column if not exists momentum_status text;
alter table if exists companies add column if not exists priority_reason text;
alter table if exists companies add column if not exists entry_angle text;
alter table if exists companies add column if not exists weekly_focus_flag boolean not null default false;

create table if not exists account_stakeholders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  title text,
  email text,
  role_in_buying_committee text,
  champion_score integer not null default 0,
  blocker_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists touchpoints (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  owner_name text,
  channel text not null,
  occurred_at timestamptz not null,
  summary text not null,
  objection_raised boolean not null default false,
  agreed_next_step text,
  created_at timestamptz not null default now()
);

create table if not exists objection_instances (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  objection_text text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_momentum_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  momentum_score integer not null,
  momentum_status text not null,
  rationale text,
  created_at timestamptz not null default now()
);

create table if not exists commercial_priority_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  priority_score integer not null,
  priority_band text not null,
  rationale text,
  created_at timestamptz not null default now()
);
