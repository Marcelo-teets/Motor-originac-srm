# Data Archive Tier — Excel

## Objetivo

Reduzir a pressão de armazenamento do PostgreSQL sem perder a memória institucional da Origination Intelligence Platform.

O Supabase continua sendo a base operacional. O arquivo histórico é uma camada secundária, privada e consultável, composta por arquivos `.xlsx` particionados e registrados no banco.

## Componentes

- `data_archive_policies`: regras de retenção por tabela e dataset.
- `data_archive_runs`: execução, corte temporal, status e contagens.
- `data_archive_parts`: cada arquivo Excel, número de linhas, tamanho e SHA-256.
- `data_archive_tokens`: autenticação de uso único das Edge Functions.
- bucket privado `historical-excel-archive`.
- Edge Function `historical-excel-export`: gera os workbooks.
- Edge Function `historical-excel-catalog`: catálogo GOD-MODE, links assinados e limpeza de tentativas falhas.
- página `/historical-archive`: consulta operacional no frontend.

## Estados

`queued -> running -> completed -> verified -> pruned`

Falhas terminam em `failed`.

## Regra de segurança

Nenhum dado pode ser removido do Supabase antes de:

1. todas as partes do Excel estarem registradas;
2. cada parte possuir SHA-256 válido;
3. a soma das linhas das partes coincidir com o run;
4. a contagem do run coincidir com a população elegível da origem no mesmo `cutoff_at`;
5. a política possuir `allow_prune = true`;
6. o run estar em `verified`.

## Estratégias

### `full_row`

Usada para bronze CVM já normalizado. A linha bruta inteira vai para Excel e pode ser removida após verificação.

### `payload_only`

Mantém no PostgreSQL as colunas estruturadas, hashes, URLs e lineage. Apenas JSON/texto pesado é externalizado.

A v2 usa views service-role-only para selecionar somente linhas que ainda possuem payload. Depois que o payload é limpo, a linha deixa automaticamente a população exportável e não volta a aparecer em workbooks futuros.

### `mirror_only`

Cria cópia Excel, mas não permite limpeza. Aplicável a scores, qualification, sinais e fatores decisórios.

## Consulta no produto

A rota GOD-MODE `/historical-archive` apresenta:

- linhas arquivadas e linhas removidas do banco quente;
- total de arquivos e tamanho no bucket;
- status dos runs;
- políticas de retenção;
- partes de cada run;
- SHA-256 resumido;
- download assinado por cinco minutos;
- ação manual para limpeza de artefatos de tentativas falhas.

O bucket continua privado. O frontend nunca recebe a service-role key.

## Operação manual

Enfileirar:

```sql
select private.queue_historical_excel_export(
  p_table_name := 'bronze_historical_records',
  p_dataset_code := 'cvm_offers',
  p_cutoff := now(),
  p_include_raw_payload := true,
  p_chunk_rows := 1000,
  p_requested_by := 'manual'
);
```

Validar:

```sql
select private.verify_historical_excel_export('<RUN_ID>'::uuid, 'operador');
```

Limpar, somente após validação:

```sql
select private.prune_verified_historical_archive('<RUN_ID>'::uuid);
```

Limpar arquivos de runs falhos:

```sql
select private.queue_historical_archive_maintenance();
```

## Automação

- `historical-excel-queue`: procura diariamente um conjunto vencido e enfileira um run.
- `historical-excel-reconcile`: a cada 15 minutos valida runs concluídos e executa o prune autorizado.
- `historical-excel-maintenance`: diariamente remove do Storage as partes de runs falhos antigos e elimina tokens expirados.

## Particionamento

A Edge Function processa uma parte por invocação e usa paginação por cursor. A continuação é enfileirada por `continue_historical_excel_export_cursor`, evitando estouro de memória e custo crescente de `OFFSET`.

## Manutenção

- Não usar `VACUUM FULL` durante operação normal.
- Após grandes prunes, executar `ANALYZE` e acompanhar espaço reutilizável.
- Não remover índices classificados como `unused` antes de acumular uma janela representativa de tráfego.
- Manter o bucket privado e gerar apenas links assinados de curta duração.
- Ativar leaked-password protection no painel do Supabase quando disponível no plano.
