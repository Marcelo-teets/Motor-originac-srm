# Data Archive Tier — Google Drive + Excel

## Objetivo

Reduzir a pressão de armazenamento do PostgreSQL sem perder a memória institucional da Origination Intelligence Platform.

O Supabase continua sendo a base operacional. O arquivo histórico é uma camada secundária, privada e consultável, composta por arquivos `.xlsx` particionados, registrados no banco e catalogados em Google Sheets.

## Modelo de dados

- **Supabase / banco quente:** empresas, usuários, pipeline, ranking, sinais atuais, qualification, patterns, scores e metadados de lineage.
- **Google Drive / banco frio:** linhas bronze já normalizadas, payloads JSON, textos brutos, documentos-fonte e saídas antigas de monitoring.
- **Google Sheets / catálogo:** manifesto humano com run, tabela, dataset, corte, arquivo, contagem, tamanho, SHA-256, status e URL privada.
- **Supabase Storage / legado e fallback:** mantém os arquivos antigos e recebe novos arquivos somente quando `ARCHIVE_STORAGE_PROVIDER` não está configurado como `google_drive`.

## Componentes

- `data_archive_policies`: regras de retenção por tabela e dataset.
- `data_archive_runs`: execução, corte temporal, status, destino e contagens.
- `data_archive_parts`: cada arquivo Excel, número de linhas, tamanho, SHA-256 e identificadores do Drive.
- `data_archive_tokens`: autenticação de uso único das Edge Functions.
- `database_storage_snapshots`: histórico do tamanho do banco e estado do orçamento gratuito.
- pasta privada do Google Drive para os arquivos `.xlsx`.
- planilha nativa do Google Sheets para o manifesto operacional.
- bucket privado `historical-excel-archive` como camada legada/fallback.
- Edge Function `historical-excel-export`: gera os workbooks e envia ao provedor configurado.
- Edge Function `historical-excel-catalog`: catálogo GOD-MODE, abertura de arquivos e limpeza de tentativas falhas.
- página `/historical-archive`: consulta operacional no frontend.

## Limites operacionais

- meta de banco: **400 MB**;
- alerta: **425 MB**;
- crítico: **450 MB**;
- cota de referência do plano gratuito: **500 MB**;
- `database-storage-budget`: mede o banco a cada duas horas e solicita arquivamento quando necessário;
- `historical-excel-queue`: procura conjuntos vencidos a cada hora.

O objetivo é manter margem antes da cota, não operar constantemente próximo ao limite.

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

Usada para bronze já normalizado. A linha bruta inteira vai para Excel e pode ser removida após verificação.

A janela quente padrão dos datasets brutos é de um dia, suficiente para replay operacional sem manter histórico pesado no PostgreSQL.

### `payload_only`

Mantém no PostgreSQL as colunas estruturadas, hashes, URLs e lineage. Apenas JSON/texto pesado é externalizado.

Views service-role-only selecionam somente linhas que ainda possuem payload. Depois que o payload é limpo, a linha deixa automaticamente a população exportável e não volta a aparecer em workbooks futuros.

### `mirror_only`

Cria cópia Excel, mas não permite limpeza. Aplicável a scores, qualification, sinais e fatores decisórios.

## Consulta no produto

A rota GOD-MODE `/historical-archive` apresenta:

- tamanho atual do banco, meta e cota;
- linhas arquivadas e linhas removidas do banco quente;
- total de arquivos por provedor;
- status dos runs;
- políticas de retenção;
- partes de cada run;
- SHA-256 resumido;
- abertura no Google Drive ou download assinado do legado;
- ação manual para limpeza de artefatos de tentativas falhas.

A pasta e a planilha permanecem privadas. O frontend nunca recebe service-role key nem credenciais OAuth do Google.

## Variáveis das Edge Functions

```env
ARCHIVE_STORAGE_PROVIDER=google_drive
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>
GOOGLE_DRIVE_ARCHIVE_FOLDER_ID=<private-folder-id>
GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID=<catalog-spreadsheet-id>
```

### Ativação segura

1. manter `ARCHIVE_STORAGE_PROVIDER=supabase_storage` durante o cadastro das credenciais;
2. cadastrar as cinco variáveis Google nos secrets do Supabase;
3. publicar as versões novas de `historical-excel-export` e `historical-excel-catalog`;
4. executar um run pequeno e confirmar arquivo, manifesto, contagem e abertura pela interface;
5. alterar `ARCHIVE_STORAGE_PROVIDER=google_drive`;
6. executar novo smoke e confirmar `storage_provider = 'google_drive'` em `data_archive_parts`;
7. somente depois migrar e remover arquivos legados do bucket.

## Operação manual

Medir o orçamento:

```sql
select private.capture_database_storage_snapshot();
```

Solicitar arquivamento somente quando necessário:

```sql
select private.queue_free_tier_archive_if_needed();
```

Enfileirar uma população específica:

```sql
select private.queue_historical_excel_export(
  p_table_name := 'bronze_historical_records',
  p_dataset_code := 'cvm_offers',
  p_cutoff := now() - interval '1 day',
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

- `historical-excel-queue`: a cada hora procura um conjunto vencido e enfileira um run.
- `historical-excel-reconcile`: a cada 15 minutos valida runs concluídos e executa o prune autorizado.
- `historical-excel-maintenance`: diariamente remove partes de runs falhos e elimina tokens expirados.
- `database-storage-budget`: a cada duas horas captura o tamanho do banco e aciona a fila quando o estado não está saudável.

## Particionamento

A Edge Function processa uma parte por invocação e usa paginação por cursor. A continuação é enfileirada por `continue_historical_excel_export_cursor`, evitando estouro de memória e custo crescente de `OFFSET`.

## Manutenção

- não usar `VACUUM FULL` durante operação normal;
- após grandes prunes, executar `ANALYZE` e acompanhar espaço reutilizável;
- considerar `VACUUM FULL` somente em janela controlada quando for indispensável reduzir o arquivo físico do banco;
- não remover índices classificados como `unused` antes de acumular uma janela representativa de tráfego;
- manter Drive, planilha e bucket privados;
- não expor credenciais Google ou service-role no frontend;
- acompanhar também a cota compartilhada do Google Drive;
- ativar leaked-password protection no painel do Supabase quando disponível no plano.
