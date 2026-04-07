-- CRM runtime hardening for pipeline / activities / tasks
alter table if exists pipeline add column if not exists owner text;
alter table if exists pipeline add column if not exists next_action text;

alter table if exists activities add column if not exists type text;
alter table if exists activities add column if not exists description text;
alter table if exists activities add column if not exists owner text;
alter table if exists activities add column if not exists due_date timestamptz;
alter table if exists activities add column if not exists updated_at timestamptz not null default now();

alter table if exists tasks add column if not exists description text;
alter table if exists tasks add column if not exists owner text;
alter table if exists tasks add column if not exists due_date timestamptz;
