-- Prevent concurrent ingestion of the same capital-market dataset.
-- Existing duplicate running rows are closed before the partial unique index is created.

with ranked as (
  select id,
         row_number() over (partition by dataset_code order by started_at desc) as rn
  from public.capital_market_dataset_runs
  where status = 'running'
)
update public.capital_market_dataset_runs run
set status = 'failed',
    finished_at = now(),
    error_message = coalesce(run.error_message || ' | ', '') || 'Superseded duplicate ingestion run before concurrency guard.',
    updated_at = now()
from ranked
where run.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists uq_capital_market_dataset_single_running
  on public.capital_market_dataset_runs(dataset_code)
  where status = 'running';
