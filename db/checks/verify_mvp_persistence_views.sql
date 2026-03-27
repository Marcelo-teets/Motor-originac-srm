-- Verify that MVP persistence views and core tables are available in Supabase.

select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'vw_pipeline_current',
    'vw_latest_ranking_v2',
    'vw_latest_thesis_outputs'
  )
order by table_name;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'pipeline',
    'pipeline_stage_history',
    'activities',
    'tasks',
    'ranking_v2',
    'thesis_outputs',
    'score_history'
  )
order by table_name;

select count(*) as pipeline_rows from pipeline;
select count(*) as pipeline_history_rows from pipeline_stage_history;
select count(*) as activity_rows from activities;
select count(*) as task_rows from tasks;
select count(*) as ranking_rows from ranking_v2;
select count(*) as thesis_rows from thesis_outputs;
select count(*) as score_history_rows from score_history;
