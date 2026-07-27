-- ORIGINATION INTELLIGENCE PLATFORM
-- Manutenção física após arquivamento verificado.
--
-- Execute no Supabase SQL Editor, um bloco por vez, em janela de baixo tráfego.
-- VACUUM FULL obtém ACCESS EXCLUSIVE LOCK e não pode rodar dentro de BEGIN/COMMIT.
-- Não execute enquanto houver runs queued/running/completed.

-- 1) Pré-check: deve retornar zero.
select count(*) as active_archive_runs
from public.data_archive_runs
where status in ('queued', 'running', 'completed');

-- 2) Pré-check: o bronze vencido deve estar zerado.
select count(*) as expired_bronze_rows
from public.bronze_historical_records
where ingested_at <= now() - interval '1 day';

-- 3) Pré-check: payloads vencidos devem estar zerados após prune.
select
  (select count(*) from public.capital_market_events
    where observed_at <= now() - interval '1 day'
      and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb)) as capital_market_payloads,
  (select count(*) from public.source_documents
    where observed_at <= now() - interval '1 day'
      and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb)) as source_document_payloads,
  (select count(*) from public.monitoring_outputs
    where observed_at <= now() - interval '1 day'
      and (
        raw_text is not null or payload <> '{}'::jsonb or
        output_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb
      )) as monitoring_payloads;

-- 4) Registre o tamanho antes.
select private.capture_database_storage_snapshot();

-- 5) Execute CADA comando separadamente.
-- O bronze normalmente é o primeiro e mais seguro, pois é staging service-role-only.
vacuum (full, analyze) public.bronze_historical_records;

-- Execute somente após o prune verificado dos payloads correspondentes.
vacuum (full, analyze) public.source_documents;
vacuum (full, analyze) public.monitoring_outputs;
vacuum (full, analyze) public.capital_market_events;

-- 6) Atualize estatísticas das tabelas relacionadas.
analyze public.capital_market_entity_links;
analyze public.capital_market_metrics;

-- 7) Registre e valide o tamanho depois.
select private.capture_database_storage_snapshot();

select
  pg_database_size(current_database()) as database_bytes,
  round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2) as database_mb,
  case
    when pg_database_size(current_database()) < 419430400 then 'healthy_under_400mb'
    when pg_database_size(current_database()) < 524288000 then 'inside_free_quota_above_target'
    else 'still_above_free_quota'
  end as result;
