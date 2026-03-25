-- Harden operational layer for pipeline, activities and tasks
-- Keeps compatibility with the current canonical schema while enabling real commercial execution.

alter table if exists pipeline
  add column if not exists owner_name text;

alter table if exists activities
  add column if not exists owner_name text;

alter table if exists tasks
  add column if not exists owner_name text,
  add column if not exists due_at timestamptz;

create unique index if not exists uq_pipeline_company_id on pipeline(company_id);
create index if not exists idx_pipeline_stage on pipeline(stage);
create index if not exists idx_activities_company_created on activities(company_id, created_at desc);
create index if not exists idx_tasks_company_updated on tasks(company_id, updated_at desc);
create index if not exists idx_tasks_status on tasks(status);

comment on table pipeline is 'Operational pipeline for origination and structuring handoff.';
comment on table activities is 'Commercial and execution activities linked to companies in the origination engine.';
comment on table tasks is 'Operational tasks linked to companies and pipeline execution.';
