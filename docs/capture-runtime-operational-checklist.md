# Capture Runtime — Operational Checklist

## Objetivo

Garantir que o Motor Originação SRM rode captura recorrente com persistência real no Supabase, alimentando o fluxo oficial:

`Sources -> Monitoring Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Scores -> Ranking -> Pipeline`

## Estado observado em 2026-05-25

Consulta executada no Supabase `hdghpmssudrqhsbvrdyt`:

| Tabela | Linhas |
| --- | ---: |
| companies | 8 |
| source_catalog | 12 |
| qualification_snapshots | 8 |
| lead_score_snapshots | 8 |
| pipeline | 8 |
| company_patterns | 7 |
| company_signals | 5 |
| monitoring_outputs | 0 |
| source_connector_runs | 0 |
| enrichments | 0 |
| score_snapshots | 0 |

Leitura operacional:

- O banco e o pipeline derivado já existem.
- Ainda falta tráfego real de captura suficiente para popular `monitoring_outputs` e `source_connector_runs`.
- A próxima prioridade não é criar nova arquitetura; é endurecer a recorrência e validar persistência.

## Execução recorrente

Há duas camadas de recorrência intencionais:

1. GitHub Actions (`.github/workflows/capture.yml`)
   - Roda diariamente.
   - Permite execução manual via `workflow_dispatch`.
   - Usa `CRON_SECRET` como bearer token.
   - Valida se o payload contém `companiesProcessed` e `persisted`.

2. Vercel Cron (`vercel.json`)
   - Roda `/api/data-capture/cron/run` diariamente.
   - Mantém a captura dentro do runtime serverless oficial do deploy.
   - Evita dependência exclusiva do GitHub Actions.

## Endpoints relevantes

| Endpoint | Uso | Autorização |
| --- | --- | --- |
| `/api/data-capture/health` | Diagnóstico sem executar captura | Não exige segredo |
| `/api/data-capture/run` | Execução manual/workflow | `Authorization: Bearer <CRON_SECRET>` |
| `/api/data-capture/cron/run` | Execução via Vercel Cron | `Authorization: Bearer <CRON_SECRET>` |

## Checklist pós-merge

1. Confirmar deploy de produção da Vercel.
2. Abrir `/api/data-capture/health` e validar:
   - `status = real`
   - `resolvedUseSupabase = true`
   - `CRON_SECRET = true`
   - tabelas core acessíveis.
3. Rodar manualmente o workflow `Capture Data` no GitHub Actions.
4. Conferir no Supabase se houve incremento em:
   - `source_connector_runs`
   - `monitoring_outputs`
   - `company_signals`
   - `qualification_snapshots`
   - `lead_score_snapshots`
   - `pipeline`
5. Se `monitoring_outputs` continuar zerada, investigar o runtime de conectores antes de mexer no frontend.

## Próxima PR recomendada

`feat(capture): expose capture run audit on Monitoring Center`

Escopo sugerido:

- endpoint leve para últimos `source_connector_runs`;
- endpoint leve para últimos `monitoring_outputs`;
- painel no Monitoring Center com:
  - última execução;
  - status;
  - empresas processadas;
  - outputs gerados;
  - sinais gerados;
  - erro resumido, se houver.

Critério de aceite:

- O time consegue abrir o produto e saber se a captura está rodando sem depender de query manual no Supabase.
