-- MVP Closure Gate 1: bounded queue drain independent from ingestion request latency.

do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    select jobid into existing_job from cron.job where jobname='origination-derived-reprocessing' limit 1;
    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;

    perform cron.schedule(
      'origination-derived-reprocessing',
      '*/5 * * * *',
      $job$select * from public.process_origination_reprocessing_queue(25);$job$
    );
  end if;
end;
$$;
