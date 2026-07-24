# BNDES Automatic Datastore Runtime

## Objetivo

Cobrir as operações indiretas automáticas do BNDES para todas as empresas válidas do Company Master sem baixar e reprocessar o CSV oficial de aproximadamente 1,1 GB.

O caminho oficial é o CKAN Datastore do próprio BNDES. O arquivo CSV continua sendo a fonte de verdade publicada, mas a API oficial é a interface operacional prioritária porque permite filtros exatos por CNPJ.

## Escopo de cobertura

A cobertura é explicitamente definida como:

- `coverageMode`: `ckan_datastore_targeted`
- `coverageScope`: `company_master_targets`
- `targetCoverageAchieved`: todos os CNPJs válidos do Company Master foram consultados na versão corrente do recurso
- `sourceWideCoverage`: `false`

A plataforma não deve confundir cobertura integral do universo-alvo com leitura linha a linha de todo o arquivo.

## Fluxo

```text
Company Master CNPJs
  -> normalize + sort
  -> resource hash + target fingerprint
  -> target batches
  -> CKAN datastore_search filters.cpf_cnpj
  -> complete pagination per batch
  -> normalizePublicBulkRow
  -> bronze_historical_records
  -> public_company_records
  -> monitoring_outputs / company_signals
  -> qualification / patterns / score / ranking / pipeline
```

## Checkpoint e retomada

O runtime reutiliza `public_dataset_resource_checkpoints`.

O `resource_key` combina:

- ID do recurso automático;
- hash da versão publicada;
- fingerprint do universo atual de CNPJs.

Metadados principais:

- `targetFingerprint`
- `targetCount`
- `nextTargetOffset`
- `targetsProcessed`
- `targetBatchSize`
- `pageSize`
- `apiRowsReturned`
- `recordsWritten`

O offset só avança após a paginação completa do lote. Se a execução cair depois da persistência e antes do checkpoint, o lote é repetido de forma idempotente por `dataset_code + record_key`.

## Mudanças no universo

Um novo checkpoint é criado quando:

- o hash do recurso BNDES muda; ou
- a lista de CNPJs válidos do Company Master muda.

Isso evita declarar cobertura atual usando uma execução antiga.

## Status da fonte

A fonte pode ser marcada como `real` quando:

- os metadados vieram do `resource_show` oficial;
- o Datastore está ativo;
- todos os CNPJs do fingerprint atual foram processados;
- não houve erro.

O campo legado `fullCoverageAchieved` permanece `false`, pois não representa leitura integral do CSV. A informação correta é `targetCoverageAchieved`.

## Operação

Workflow:

- `.github/workflows/bndes-automatic-datastore.yml`

Gatilhos:

- issue owner-only com título exato `[public-bulk-run] bndes-automatic-datastore`;
- `workflow_dispatch`;
- agenda semanal.

CLI:

```bash
cd backend
npx tsx src/cli/bndesAutomaticDatastore.ts \
  --target-batch-size 25 \
  --max-target-batches 100 \
  --page-size 1000 \
  --max-pages-per-target-batch 100 \
  --trigger manual \
  --require-progress
```

## Guardrails

- API oficial e gratuita; nenhuma chave externa é necessária.
- Somente CNPJs do Company Master são consultados e persistidos.
- Paginação possui limite explícito e falha visível.
- Checkpoint só avança após o lote completo.
- Resultado parcial não é reportado como cobertura concluída.
- Nenhum signal é criado quando não existe match.
- Logs enviados como artefato são sanitizados.
- O fluxo `all-light` permanece independente.

## Fallback

O download particionado do CSV não é o caminho principal. Deve ser implementado apenas se o CKAN Datastore deixar de oferecer cobertura confiável ou for descontinuado.
