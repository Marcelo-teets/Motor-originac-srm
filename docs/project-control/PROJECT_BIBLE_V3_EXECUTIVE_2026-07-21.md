# Origination Intelligence Platform — Project Bible V3

**Data-base:** 21/07/2026  
**Repositório:** `Marcelo-teets/Motor-originac-srm`  
**Main auditada:** `956382fa7b4f3cd679dcb29f8b7923652a9614f8`  
**Supabase:** `hdghpmssudrqhsbvrdyt`

## Regra central

Toda entrega precisa melhorar a capacidade de descobrir empresas, detectar mudança, explicar a necessidade financeira, sugerir estrutura de crédito, justificar o timing e produzir uma próxima ação comercial auditável.

Não criar stack paralela. Stack oficial: React + Vite, Node + TypeScript, Supabase, Vercel e GitHub.

## Estado atual

A plataforma possui ingestão e processamento reais, mas ainda não fecha o ciclo de originação.

| Entidade | Registros |
|---|---:|
| `companies` | 8 |
| `monitoring_outputs` | 13.152 |
| `company_signals` | 16.048 |
| `enrichments` | 3.793 |
| `qualification_snapshots` | 888 |
| `lead_score_snapshots` | 888 |
| `score_snapshots` | 4.392 |
| `ranking_v2` | 72 |
| `source_connector_runs` | 990 |
| `search_profile_runs` | 0 |
| `discovered_company_candidates` | 0 |
| `company_discovery_links` | 0 |
| `trigger_events` | 0 |
| `thesis_outputs` | 3 |
| `market_map_cards` | 0 |
| `ai_agent_runs` | 0 |

Dos 990 runs de conectores, 99 estão `completed` e 891 `partial`.

## Diagnóstico

O motor continua aumentando outputs, sinais, enrichments e snapshots, mas o universo canônico permanece em oito empresas.

> O gargalo dominante é discovery: o sistema aprofunda o monitoramento do universo existente, mas não amplia cobertura nem converte ranking em pipeline de forma disciplinada.

## Entregas recentes

- PR #165: painel autenticado de saúde dos datasets CVM no Dashboard.
- PR #166: correção do bundle serverless do endpoint CVM na Vercel.

Código mergeado não equivale automaticamente a entrega concluída. Toda mudança precisa de:

1. CI e preview;
2. smoke no deployment canônico;
3. validação no banco;
4. efeito visível no fluxo do usuário.

## Segurança

Estado verificado:

- Security Advisor sem `ERROR`;
- aviso de leaked password protection desabilitado;
- RPCs administrativas CVM sem `EXECUTE` para `anon` e `authenticated`;
- `ranking_v2` com RLS e quatro policies.

O hardening vivo deve estar versionado e reproduzível por migrations da `main`.

## Arquitetura

```mermaid
flowchart LR
    Profile[Search Profile] --> Run[Discovery Run]
    Run --> Inbox[Capture Inbox]
    Inbox --> Resolve[Dedupe]
    Resolve --> Promote[Promotion]
    Promote --> Company[Company Master]
    Company --> Monitor[Monitoring]
    Monitor --> Signal[Signals]
    Signal --> Qualify[Qualification]
    Qualify --> Pattern[Patterns]
    Pattern --> Trigger[Triggers]
    Trigger --> Thesis[Thesis]
    Thesis --> Map[Market Map]
    Map --> Rank[Ranking]
    Rank --> Action[Owner + Next Action]
    Action --> Execute[Paper Clip]
    Execute --> Result[Pipeline Result]
```

## Critical path

1. Smoke de produção das PRs #165/#166.
2. Reconciliar e mergear #161.
3. Rebasear, validar e mergear #162.
4. Executar Search Profiles reais.
5. Alcançar 50 candidatos e 20 promoções.
6. Implementar Trigger Engine.
7. Produzir thesis e Market Map dos top 20.
8. Garantir owner e próxima ação.
9. Transformar Paper Clip em executor persistido.

## PRs abertas

### #161

Rebasear e mergear primeiro. Fecha UUID estável, statuses, normalização de recebíveis e lineage da promoção.

### #162

Rebasear depois de #161. Amplia fontes, portfólios VC, Open Finance, BCB SGS, PNCP e discovery.

### #154

Não mergear como está. Extrair mudanças ainda úteis e fechar como superseded, pois mistura UI, fontes, runtime, cron, dependências e migrations.

### PRs antigas #94–#119

Auditar individualmente. Recriar apenas lacunas ainda existentes em PRs atômicas sobre a `main` atual.

## Status real / parcial / mock

| Capacidade | Estado |
|---|---|
| Monitoring | Real parcial |
| CVM ingestion/health | Real parcial |
| Signals/enrichment | Real |
| Qualification/score/ranking | Real parcial |
| Search Profiles | Não operacional em produção |
| Capture Inbox | Parcial |
| Trigger Engine | Não operacional |
| Thesis | Parcial |
| Market Map | Não operacional |
| Pipeline | Parcial |
| Paper Clip/ABA | Mock/in-memory |
| Observabilidade | Parcial |

## Definition of Done do MVP

- produção deriva da `main` e expõe SHA;
- Security Advisor sem bloqueador;
- schema vivo reproduzível pelo GitHub;
- Search Profile automático;
- 50+ candidatos;
- 20+ empresas promovidas com lineage;
- top 20 com qualification, patterns, score, triggers, thesis e Market Map;
- top 20 com owner e próxima ação;
- Paper Clip cria task/activity persistida, com retry idempotente e audit trail;
- CI, migration check, smoke Supabase e smoke Vercel verdes.

## Origination Impact Score

Priorizar trabalho por:

```text
35% expansão do universo
25% qualidade de decisão
20% execução comercial
10% confiabilidade operacional
10% redução de risco
```

Trabalho que aumenta apenas volume de sinais, sem ampliar cobertura, decisão ou ação, recebe prioridade menor.
