-- Verify MVP persistence objects after applying migrations 003 and 004.

select 'pipeline_stage_catalog' as object_name, count(*) as row_count from pipeline_stage_catalog;
select 'vw_pipeline_current' as object_name, count(*) as row_count from vw_pipeline_current;
select 'vw_latest_ranking_v2' as object_name, count(*) as row_count from vw_latest_ranking_v2;
select 'vw_latest_thesis_outputs' as object_name, count(*) as row_count from vw_latest_thesis_outputs;

select code, label, stage_order, is_terminal
from pipeline_stage_catalog
order by stage_order;

select id, company_id, stage_code, stage_label, stage_order, owner_name, next_action, status
from vw_pipeline_current
order by stage_order asc, updated_at desc
limit 50;

select company_id, position, qualification_score, lead_score, ranking_score, suggested_structure, created_at
from vw_latest_ranking_v2
order by position asc
limit 50;

select company_id, structure_type, confidence_score, why_now, commercial_angle, created_at
from vw_latest_thesis_outputs
order by created_at desc
limit 50;

select company_id, score_type, previous_value, current_value, diff, trigger_strength, created_at
from score_history
order by created_at desc
limit 50;

select company_id, title, status, due_at, follow_up_at, created_at
from tasks
order by created_at desc
limit 50;

select company_id, title, status, due_at, follow_up_at, created_at
from activities
order by created_at desc
limit 50;
