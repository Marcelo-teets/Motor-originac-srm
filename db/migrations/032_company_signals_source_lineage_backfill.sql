-- 032_company_signals_source_lineage_backfill.sql
-- MIRROR DE LINHAGEM — aplicada no banco vivo via Supabase MCP em 2026-07-13
-- como migration `company_signals_source_lineage_backfill`. NÃO reexecutar
-- manualmente; o statement é idempotente, mas o registro oficial é o do banco.
--
-- Contexto (issue #128):
-- O diagnóstico no Supabase real mostrou que o drift uuid × text temido não
-- existe: companies.id, source_catalog.id e todas as colunas de captura são
-- uuid, e o runtime já resolve os códigos canônicos (src_*) para uuids do
-- catálogo antes de persistir. O único defeito real era o mapper de sinais em
-- backend/src/services/capturePersistenceService.ts, que não gravava a coluna
-- source_id (o uuid ficava apenas em metadata.source_id). Resultado: 0/12.707
-- sinais com linhagem de fonte na coluna, apesar de 11.985 terem o uuid válido
-- no metadata (0 referências órfãs contra source_catalog).
--
-- Correções:
-- 1) Código: signalRows agora inclui source_id (commit desta mesma PR).
-- 2) Dados: backfill abaixo, preenchendo somente nulos com refs validadas.
--
-- Nota sobre source_connector_runs: todos os runs existentes são
-- scope_type='global', em que source_id nulo é semanticamente correto.

update company_signals cs
set source_id = (cs.metadata->>'source_id')::uuid
where cs.source_id is null
  and cs.metadata->>'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from source_catalog sc
    where sc.id = (cs.metadata->>'source_id')::uuid
  );
