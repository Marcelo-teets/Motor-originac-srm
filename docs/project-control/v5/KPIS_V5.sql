-- KPIs do Planejamento V5 — Motor Originação SRM
-- Somente leitura (exceto o bloco 10, que atualiza o registro interno do guard). Rodar no Neon `steep-poetry-38942951`, branch `production`.
-- Todas as colunas foram conferidas em information_schema e todos os blocos executados no Neon em 09/10/2026.
-- Uso: copiar o bloco desejado; cada bloco é um único SELECT.

-- 1. MÉTRICA-NORTE — empresas reais com sinal, fator (qualificação) e score.
--    "Real" = CNPJ com 14 dígitos. Meta: F1 ≥ 5 · F2 ≥ 20 · F3 ≥ 40 · F4 ≥ 60.
select count(*) as north_star
from public.companies c
where length(regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g')) = 14
  and exists (select 1 from public.company_signals s where s.company_id = c.id)
  and exists (select 1 from public.qualification_snapshots q where q.company_id = c.id)
  and exists (select 1 from public.score_snapshots sc where sc.company_id = c.id);

-- 2. FUNIL — onde o fluxo para.
select
  (select count(*) from public.discovered_company_candidates)                                     as candidatos,
  (select count(*) from public.discovered_company_candidates where candidate_status = 'captured') as aguardando_revisao,
  (select count(*) from public.discovered_company_candidates where candidate_status = 'promoted') as promovidos,
  (select count(*) from public.companies)                                                         as empresas,
  (select count(*) from public.companies c where public.company_verified_headcount_floor(c.id) is not null) as com_headcount,
  (select count(*) from public.companies c where public.is_company_origination_icp_eligible(c.id))          as icp_elegiveis,
  (select count(*) from public.companies c where public.is_company_decision_eligible(c.id))                 as decisao_elegiveis,
  (select count(distinct company_id) from public.score_snapshots)                                 as com_score,
  (select count(*) from public.ranking_v2)                                                        as no_ranking,
  (select count(*) from public.pipeline)                                                          as no_pipeline;

-- 3. FILA DE REVISÃO HUMANA — SLA de 72 h (F2-04).
select count(*) filter (where coalesce(updated_at, captured_at, created_at) < now() - interval '72 hours') as fora_do_sla,
       count(*)                                                                                       as total_na_fila,
       min(coalesce(updated_at, captured_at, created_at))                                             as mais_antigo
from public.discovered_company_candidates
where candidate_status = 'captured';

-- 4. HEADCOUNT — cobertura do gate de ICP (F2-01). Meta F2: ≥ 80% das promovidas.
select count(distinct c.id) filter (where m.company_id is not null) as empresas_com_employee_count,
       count(distinct c.id)                                         as empresas,
       round(100.0 * count(distinct c.id) filter (where m.company_id is not null) / nullif(count(distinct c.id), 0), 1) as cobertura_pct
from public.companies c
left join public.company_source_metric_snapshots m
  on m.company_id = c.id and m.metric_key = 'employee_count' and m.observed_vs_inferred = 'observed';

-- 5. CAPTURA — execuções de conectores nas últimas 24 h e 7 dias.
select status,
       count(*) filter (where started_at >= now() - interval '24 hours') as ultimas_24h,
       count(*) filter (where started_at >= now() - interval '7 days')   as ultimos_7d,
       max(started_at)                                                    as ultima
from public.source_connector_runs
group by status
order by status;

-- 6. FRESCOR POR FONTE (base do painel F1-06).
select source_code, health_status, last_success_at, last_failure_at, consecutive_failures,
       round(extract(epoch from (now() - last_success_at)) / 3600) as horas_desde_sucesso,
       freshness_sla_hours
from public.source_health
order by last_success_at nulls first;

-- 7. DISCOVERY — execuções de Search Profile.
select search_profile_id, count(*) as execucoes, sum(candidates_found) as encontrados,
       sum(candidates_inserted) as inseridos, sum(candidates_promoted) as promovidos, max(started_at) as ultima
from public.search_profile_runs
group by search_profile_id
order by ultima desc nulls last;

-- 8. GATILHOS MATERIAIS (F3-02). Meta: ≥ 1 por semana.
select date_trunc('week', created_at) as semana, count(*) as gatilhos, count(*) filter (where material) as materiais
from public.trigger_events
group by 1
order by 1 desc
limit 8;

-- 9. RAG / EMBEDDINGS (F3-01). Meta: ≥ 90% com embedding.
select count(*) as documentos,
       count(*) filter (where embedding is not null) as com_embedding,
       round(100.0 * count(*) filter (where embedding is not null) / nullif(count(*), 0), 1) as cobertura_pct
from public.vector_documents;

-- 10. ORÇAMENTO NEON — tamanho e estado do guard (limites: soft 400 MB, hard 440 MB, projeto 480 MB).
select pg_size_pretty(pg_database_size(current_database())) as banco,
       private.refresh_database_growth_guard() as guard;

-- 11. MAIORES TABELAS — onde o storage está.
select c.relname as tabela, pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 10;
