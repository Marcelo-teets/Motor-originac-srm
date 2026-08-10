# Search Scheduler Cadence V14

## Problema confirmado em produção

O scheduler possuía dois guards corretos em código:

- lease para `queued/running` recentes;
- janela mínima padrão de 20h após um run `completed`.

Mesmo assim, o Search Profile mestre foi executado repetidamente em intervalos de poucos minutos. Em 10/08/2026, o profile `Brasil Middle Market Tech - FIDC/DCM` registrou execuções às 22:45, 22:50, 22:52, 23:01, 23:06, 23:14, 23:19 e 23:32 UTC — todas `scheduled`, muitas com 15 lanes e nenhuma candidata nova.

## Root cause

`SearchProfileCaptureRuntime.listRuns()` devolvia diretamente as linhas PostgREST de `search_profile_runs` em snake_case:

- `run_status`;
- `finished_at`;
- `created_at`;
- `search_profile_id`.

`runScheduledSearchProfiles()` consome o contrato TypeScript `SearchProfileRunRecord`, em camelCase:

- `runStatus`;
- `finishedAt`;
- `createdAt`;
- `searchProfileId`.

Consequência: o scheduler recebia `runStatus/finishedAt/createdAt` como `undefined`. O lease e o guard de 20h existiam, mas nunca enxergavam o estado real persistido.

## Correção

Foi criado `mapSearchProfileRunRow()` como boundary explícita entre PostgREST e domínio.

A função normaliza:

- ids;
- `run_status` → `runStatus`;
- `trigger_mode` → `triggerMode`;
- contadores numéricos;
- metadata;
- `started_at` / `finished_at`;
- `created_at` / `updated_at`.

O mesmo mapper passa a ser usado em:

- `createSearchProfileRun`;
- `updateSearchProfileRun`;
- `listRuns`.

Assim qualquer consumidor do runtime recebe o mesmo contrato, inclusive API e scheduler.

## Quality Gate

`searchProfileRunMapping.test.ts` usa uma linha no formato real do Supabase e protege três comportamentos:

1. mapping snake_case → camelCase;
2. run `completed` recente dispara `skipped_recent_run` e não executa captura;
3. run `running` recente dispara `skipped_run_in_progress` e respeita lease.

O teste entra no `test:search-discovery-quality` obrigatório do CI.

## Observabilidade

As notas de captura deixaram de carregar uma versão fixa (`Capture V11`). Versionamento de estágios continua nos payloads (`entityNormalization`, `relevanceGate`, `publisherAttribution`, `rediscovery`) e a nota operacional passa a dizer apenas `Capture completed...`.

Isso evita telemetria enganosa após novas evoluções do motor.

## Impacto operacional

A correção reduz:

- chamadas repetidas às fontes;
- processamento e escrita redundantes;
- ruído de rediscovery;
- risco de consumir orçamento gratuito sem ganho de originação.

Não altera Search Profiles, qualification, patterns, score, ranking ou gates humanos. O objetivo é somente fazer a cadência já definida funcionar com os dados reais do Supabase.
