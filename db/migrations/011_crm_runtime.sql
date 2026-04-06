-- CRM runtime hardening for pipeline / activities / tasks
alter table if exists pipeline add column if not exists owner text;
alter table if exists pipeline add column if not exists next_action text;
alter table if exists pipeline add column if not exists updated_at timestamptz not null default now();

alter table if exists activities add column if not exists type text;
alter table if exists activities add column if not exists description text;
alter table if exists activities add column if not exists owner text;
alter table if exists activities add column if not exists due_date timestamptz;
alter table if exists activities add column if not exists updated_at timestamptz not null default now();

alter table if exists tasks add column if not exists description text;
alter table if exists tasks add column if not exists owner text;
alter table if exists tasks add column if not exists due_date timestamptz;
alter table if exists tasks add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ux_pipeline_company_id on pipeline(company_id);
create index if not exists idx_activities_company_created_desc on activities(company_id, created_at desc);
create index if not exists idx_tasks_company_created_desc on tasks(company_id, created_at desc);

alter table if exists pipeline alter column company_id set not null;
alter table if exists pipeline alter column stage set not null;
alter table if exists pipeline alter column updated_at set default now();

alter table if exists activities alter column company_id set not null;
alter table if exists activities alter column title set not null;
alter table if exists activities alter column status set not null;
alter table if exists activities alter column updated_at set default now();

alter table if exists tasks alter column company_id set not null;
alter table if exists tasks alter column title set not null;
alter table if exists tasks alter column status set not null;
alter table if exists tasks alter column updated_at set default now();

alter table if exists pipeline drop constraint if exists chk_pipeline_stage;
alter table if exists pipeline add constraint chk_pipeline_stage check (stage in ('Identified','Qualified','Approach','Structuring','Mandated','ClosedWon','ClosedLost','Recycled'));

alter table if exists activities drop constraint if exists chk_activities_status;
alter table if exists activities add constraint chk_activities_status check (status in ('open','done','cancelled'));

alter table if exists tasks drop constraint if exists chk_tasks_status;
alter table if exists tasks add constraint chk_tasks_status check (status in ('todo','in_progress','done','blocked'));
