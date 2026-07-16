---
title: "Motor Originação — Documentação Completa do Projeto"
project: "Origination Intelligence Platform"
product_name: "Motor Originação SRM"
document_type: "Cérebro mestre, memória institucional, arquitetura, operação e roadmap"
snapshot_date: "2026-07-15"
timezone: "America/Sao_Paulo"
status: "Documento consolidado — fotografia do projeto na data de corte"
canonical_repository: "Marcelo-teets/Motor-originac-srm"
supabase_project_id: "hdghpmssudrqhsbvrdyt"
vercel_project_id: "prj_hsB473e7bNF0xOd6CEUwo7WFgNYs"
---

# Motor Originação — Documentação Completa do Projeto

> **Nome institucional:** Origination Intelligence Platform  
> **Nome operacional:** Motor Originação SRM  
> **Data de corte:** 15 de julho de 2026  
> **Escopo geográfico:** Brasil  
> **Objetivo:** transformar originação de crédito estruturado em um processo sistemático, explicável, monitorável e operacional.

---

## 0. Como usar este documento

Este arquivo é a memória institucional consolidada do projeto. Ele combina:

1. a visão estratégica e as regras do cérebro mestre;
2. o estado observado no código da branch `main`;
3. o estado vivo do Supabase;
4. o estado observado do projeto na Vercel;
5. o histórico recente de PRs, decisões e correções;
6. o backlog necessário para transformar a plataforma em um MVP funcional com dados reais.

### 0.1 Hierarquia de fontes de verdade

Quando houver divergência, usar esta ordem:

1. **Cérebro mestre:** visão, escopo, princípios, prioridades e regras de produto.
2. **GitHub `main`:** fonte oficial do código e das migrations.
3. **Supabase vivo:** fonte oficial do schema e dos dados efetivamente existentes.
4. **Vercel viva:** fonte oficial dos deployments e comportamento do runtime publicado.
5. **Este documento:** fotografia consolidada e explicada dessas fontes em 15/07/2026.

### 0.2 Legenda de status

| Status | Significado |
|---|---|
| **REAL** | Existe no código e está integrado a dados ou runtime reais. |
| **REAL/PARCIAL** | Existe e funciona, mas ainda possui lacunas operacionais, cobertura incompleta ou fallback. |
| **PARCIAL** | Implementação incompleta, dependente de integração, credencial, carga ou validação. |
| **FALLBACK/MOCK** | Serve para não quebrar a experiência, mas não deve ser tratado como evidência real. |
| **PLANEJADO** | Está no catálogo, roadmap ou backlog, sem operação completa. |
| **PR ABERTA** | Existe em branch, mas não integra a fonte oficial até merge na `main`. |
| **BLOQUEADOR** | Impede validação, segurança, produção ou entrega comercial confiável. |

### 0.3 Segurança e segredos

Este documento **não contém valores de tokens, chaves privadas, service-role keys, PATs ou senhas**. Ele registra somente:

- nome da variável;
- sistema em que deve existir;
- ambiente;
- finalidade;
- dependências operacionais.

Segredos devem permanecer exclusivamente no GitHub Actions, Vercel, Supabase ou gerenciador de senhas apropriado.

---

# PARTE I — IDENTIDADE, MISSÃO E TESE

## 1. Identidade do projeto

### 1.1 Nome

- **Projeto:** Origination Intelligence Platform
- **Produto:** Motor Originação SRM
- **Repositório canônico:** `Marcelo-teets/Motor-originac-srm`
- **Supabase:** `Motor_orig`
- **Supabase Project ID:** `hdghpmssudrqhsbvrdyt`
- **Vercel Project:** `motor-originac-srm`
- **Vercel Project ID:** `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs`

### 1.2 Propósito central

Construir um sistema institucional capaz de:

- descobrir empresas;
- monitorar mudanças;
- capturar sinais explícitos e implícitos;
- enriquecer o contexto;
- qualificar a necessidade de crédito;
- identificar padrões de funding;
- priorizar leads;
- sugerir estruturas;
- orientar a abordagem comercial;
- registrar execução e resultado.

### 1.3 Perguntas que o sistema deve responder

1. Quem são os melhores leads?
2. O que mudou neles?
3. O que eles têm em comum?
4. Por que isso importa financeiramente?
5. Qual estrutura de crédito faz sentido?
6. Por que agora?
7. Qual é a próxima ação?
8. Qual é a entrega final?
9. Qual foi o resultado comercial?

### 1.4 Missão operacional

Dar ao time de originação uma vantagem estrutural para detectar e abordar empresas antes que a necessidade de funding se torne óbvia para o mercado.

### 1.5 Tese principal

O mercado normalmente enxerga:

- anúncios de rodada;
- emissões já publicadas;
- notícias amplamente distribuídas;
- empresas já assessoradas;
- demandas de funding já explícitas.

O Motor deve enxergar:

- crescimento sem funding proporcional;
- expansão antes de uma captação;
- recebíveis fortes com funding fraco;
- produto de crédito sem estrutura de capital compatível;
- pressão de embedded finance;
- contratação de equipes de crédito, risco e cobrança;
- alterações de produto, termos, pricing e posicionamento;
- indícios regulatórios ou cadastrais;
- mudanças em portfólios de VC/PE;
- sinais fracos antes da notícia comum.

---

## 2. Objetivo de negócio

### 2.1 Objetivo macro

Aumentar a velocidade, a qualidade e a taxa de conversão da originação de operações de crédito estruturado.

### 2.2 Objetivos específicos

- Mapear empresas aderentes a FIDC, DCM, CRI, CRA, debêntures, notas comerciais e estruturas correlatas.
- Identificar funding gaps.
- Detectar ativos ou fluxos securitizáveis.
- Priorizar empresas por necessidade, timing e executabilidade.
- Tornar a tese explicável e baseada em evidência.
- Reduzir trabalho manual de pesquisa.
- Melhorar o timing de abordagem.
- Conectar inteligência ao pipeline comercial.
- Construir memória institucional.
- Permitir evolução futura para previsão e aprendizado contínuo.

### 2.3 Resultado operacional esperado

A plataforma precisa produzir, para cada empresa prioritária:

- score;
- racional;
- evidências;
- padrões detectados;
- tese;
- estrutura sugerida;
- riscos a validar;
- por que agora;
- próxima ação;
- owner;
- estágio no pipeline;
- histórico de evolução.

---

## 3. Universo-alvo

### 3.1 Escopo atual

- Brasil-only.
- Middle market.
- Empresas de tecnologia.
- Empresas tech-based e tech-backed.
- Startups e growth companies.
- Fintechs.
- Empresas com produto de crédito.
- Empresas com recebíveis.
- Empresas com necessidade potencial de capital de giro.
- Empresas com fit para FIDC ou DCM.

### 3.2 Categorias prioritárias

#### Fintechs

- crédito;
- pagamentos;
- banking infrastructure;
- embedded finance;
- BNPL;
- antecipação;
- marketplaces financeiros;
- financiamento de sellers, buyers ou parceiros.

#### Plataformas B2B e marketplaces

- modelos com capital de giro;
- repasse futuro;
- financiamento de cadeia;
- seller financing;
- contratos recorrentes;
- concentração de recebíveis.

#### Empresas com recebíveis

- mensalidades;
- assinaturas;
- parcelamento;
- contratos B2B;
- duplicatas;
- recebíveis performados ou a performar;
- fluxo de locação;
- carteira de crédito;
- fluxos vinculáveis.

#### Empresas com fit DCM

- necessidade de alongamento;
- crescimento acelerado;
- estrutura de capital inadequada;
- refinanciamento;
- aquisições;
- expansão;
- funding institucional escalável.

### 3.3 Fora do escopo atual

- expansão internacional;
- stack paralela;
- Snowflake;
- produto genérico para qualquer empresa;
- dependência central de vendors caros;
- scraping frágil como primeira opção;
- features que não melhorem a capacidade de originar operações reais.

---

# PARTE II — MODELO OPERACIONAL DE ORIGINAÇÃO

## 4. Pipeline lógico da plataforma

```text
Search Profile
    ↓
Sources
    ↓
Monitoring
    ↓
Raw Outputs
    ↓
Signals
    ↓
Enrichment
    ↓
Qualification
    ↓
Patterns
    ↓
Score / Lead Score
    ↓
Thesis
    ↓
Ranking
    ↓
Pipeline
    ↓
Atividades, tarefas e próxima ação
    ↓
Mandato, estruturação, captação e fechamento
```

### 4.1 Regra de qualidade

Uma empresa só deve subir de prioridade quando houver uma combinação coerente de:

- evidência;
- confiança da fonte;
- aderência estrutural;
- timing;
- executabilidade;
- padrões;
- disponibilidade de dados;
- possibilidade real de abordagem.

---

## 5. Qualification Engine

### 5.1 Perguntas obrigatórias

- A empresa possui produto de crédito?
- Crédito é core ou complementar?
- A empresa financia clientes, sellers, fornecedores ou parceiros?
- Existem recebíveis?
- Os recebíveis são estruturáveis?
- A empresa já possui FIDC?
- Já utiliza dívida estruturada?
- A estrutura de capital atual é adequada?
- Há funding gap?
- Existe fit para FIDC?
- Existe fit para DCM?
- O timing é bom?
- A operação é executável?
- Quais dados faltam?
- Qual a próxima ação?

### 5.2 Blocos de qualification implementados

A configuração atual totaliza 100 pontos:

| Bloco | Peso |
|---|---:|
| Structural | 20 |
| Receivables | 20 |
| Capital Structure | 25 |
| Execution | 20 |
| Timing | 15 |
| **Total** | **100** |

### 5.3 Output esperado

```json
{
  "qualificationScore": 0,
  "structuralNeed": 0,
  "receivablesFit": 0,
  "capitalStructureFit": 0,
  "executionReadiness": 0,
  "timing": 0,
  "sourceConfidence": 0,
  "triggerStrength": 0,
  "suggestedStructure": "",
  "rationale": "",
  "risksToValidate": [],
  "nextAction": ""
}
```

---

## 6. Pattern Engine

### 6.1 Padrões institucionais

| Código | Nome | Impacto padrão observado |
|---|---|---:|
| `capital_mismatch` | Capital mismatch | 10,40 |
| `embedded_finance_pressure` | Embedded finance pressure | 10,80 |
| `expansion_outpacing_capital` | Expansion outpacing capital | 10,00 |
| `growth_without_funding` | Growth without funding | 9,60 |
| `receivables_strong_funding_weak` | Receivables strong / funding weak | 11,20 |

### 6.2 Interpretação

#### Growth without funding

A empresa cresce, expande ou aumenta complexidade sem evidência de uma estrutura de funding proporcional.

#### Capital mismatch

O modelo de negócio exige um tipo, prazo ou volume de capital incompatível com as fontes atuais.

#### Receivables strong / funding weak

Há sinais de recebíveis recorrentes ou estruturáveis, mas não há evidência de funding institucional adequado.

#### Expansion outpacing capital

A velocidade de expansão supera a capacidade financeira da empresa.

#### Embedded finance pressure

O produto financeiro ou de crédito cria demanda por capital, risco, cobrança, compliance e infraestrutura.

### 6.3 Tipos de evidência

- explícita;
- implícita;
- narrativa;
- comportamento do produto;
- contratação;
- regulatória;
- mercado de capitais;
- funding;
- recebíveis;
- estrutura de capital.

---

## 7. Lead Score

### 7.1 Pesos atuais

| Componente | Peso |
|---|---:|
| Qualification Score | 30% |
| Source Confidence | 10% |
| Trigger Strength | 15% |
| Timing Intensity | 15% |
| Execution Readiness | 10% |
| Data Quality | 10% |
| Pipeline Readiness | 10% |
| Pattern Score | bônus de 10% antes do clamp |

### 7.2 Fórmula funcional

```text
lead_score =
    qualification_score × 0,30
  + source_confidence × 100 × 0,10
  + trigger_strength × 0,15
  + timing_intensity × 0,15
  + execution_readiness × 0,10
  + data_quality × 0,10
  + pipeline_readiness × 0,10
  + pattern_score × 0,10

resultado final limitado entre 0 e 100
```

### 7.3 Buckets

| Score mínimo | Bucket |
|---:|---|
| 85 | `immediate_priority` |
| 70 | `high_priority` |
| 55 | `monitor_closely` |
| 40 | `watchlist` |
| 0 | `low_priority` |

### 7.4 Ponto de atenção

Os pesos-base somam 100%, e o pattern score atua como bônus adicional antes do `clamp`. Essa escolha favorece empresas com sinais combinados, mas deve ser calibrada com conversão comercial real para evitar saturação excessiva em 100 pontos.

---

## 8. Ranking V2

### 8.1 Fórmula atual

```text
ranking_score =
    qualification_score × 0,40
  + lead_score × 0,35
  + trigger_strength × 0,10
  + source_confidence × 100 × 0,05
  + soma_dos_impactos_de_patterns × 0,10
```

Resultado limitado entre 0 e 100.

### 8.2 Princípios

O ranking deve ser:

- persistido;
- auditável;
- histórico;
- explicável;
- comparável;
- recalculável;
- sensível a novos sinais;
- resistente a dados fracos ou duplicados.

### 8.3 Persistência

A tabela `ranking_v2` guarda snapshots. O backend utiliza o snapshot mais recente como fonte oficial e mantém cálculo TypeScript como fallback controlado.

---

## 9. Thesis Generator

### 9.1 Perguntas que a tese deve responder

- Por que essa empresa pode precisar de crédito?
- Por que agora?
- Qual estrutura parece mais aderente?
- Qual ativo ou fluxo suporta a estrutura?
- Qual é o ângulo comercial?
- Quais riscos precisam ser validados?
- Qual é a próxima ação?

### 9.2 Estruturas possíveis

- FIDC;
- warehouse;
- bridge;
- capital de giro;
- antecipação;
- cessão fiduciária;
- debênture;
- nota comercial;
- CRI;
- CRA;
- dívida vinculada a contrato;
- operação híbrida;
- estrutura para aquisição;
- reperfilamento;
- operação com conta vinculada e waterfall.

### 9.3 Regra

A tese não pode inventar. Toda afirmação relevante precisa apontar para:

- sinal;
- documento;
- fonte;
- evento;
- métrica;
- inferência claramente identificada.

---

## 10. Pipeline comercial

### 10.1 Funil estratégico desejado no cérebro mestre

- Potenciais Interessados
- Prospecção
- Conversa Ventures
- Intro Empírica
- Conversa Empírica
- Envio de Infos
- Envio Mandato
- Mandato Assinado
- Estruturação do Produto
- Captação
- Fechado
- Não Faz Sentido
- Reciclar

### 10.2 Enum técnico atualmente implementado

```text
Identified
Qualified
Approach
Structuring
Mandated
ClosedWon
ClosedLost
Recycled
```

### 10.3 Estado vivo em 15/07/2026

- 8 empresas na tabela `pipeline`;
- as 8 estão no estágio `Qualified`;
- 13 atividades;
- 6 tarefas abertas.

### 10.4 Gap de produto

O funil estratégico e o enum técnico não são idênticos. É necessário decidir entre:

1. mapear o funil detalhado em subestágios;
2. manter o enum técnico resumido e criar fases auxiliares;
3. migrar integralmente para o funil comercial institucional.

A decisão deve preservar histórico, evitar quebra de API e manter uma única fonte de verdade.

---

# PARTE III — ARQUITETURA OFICIAL

## 11. Stack obrigatória

### Frontend

- React
- Vite
- TypeScript
- React Router

### Backend

- Node.js
- TypeScript
- Express

### Banco e autenticação

- Supabase
- PostgreSQL
- Supabase Auth
- RLS
- REST/RPC

### Deploy

- Vercel

### Código e CI/CD

- GitHub
- GitHub Actions
- PRs pequenas, limpas e baseadas na `main` atual

### Proibido nesta fase

- Snowflake;
- stack paralela;
- outro banco principal;
- outro frontend;
- outro backend;
- reabertura completa da arquitetura.

---

## 12. Estrutura do monorepo

```text
Motor-originac-srm/
├── frontend/             # React + Vite
├── backend/              # Node + Express + TypeScript
├── api/                  # entrypoints serverless Vercel
├── db/
│   ├── schema.sql
│   └── migrations/
├── config/               # scoring, heurísticas, catálogo
├── connectors/           # bases e adaptadores
├── agents/               # definições e documentação de agentes
├── docs/                 # arquitetura, runbooks e status
├── scripts/              # operação, smoke tests e utilitários
├── .github/workflows/    # CI, captura, smoke e ingestões
├── package.json          # workspaces
└── vercel.json           # build, functions, cron e rewrites
```

### 12.1 Workspaces

- `frontend`
- `backend`

### 12.2 Comandos principais

```bash
npm install

npm run dev:backend
npm run dev:frontend

npm run typecheck
npm run build
npm run lint
```

---

## 13. Versões observadas no código

### Frontend

| Pacote | Versão |
|---|---:|
| React | `^18.3.1` |
| React DOM | `^18.3.1` |
| React Router DOM | `^7.3.0` |
| Vite | `^6.2.2` |
| TypeScript | `^5.8.2` |

### Backend

| Pacote | Versão |
|---|---:|
| Express | `^4.21.2` |
| CORS | `^2.8.5` |
| TSX | `^4.19.3` |
| TypeScript | `^5.8.2` |

### Runtime drift observado

- GitHub CI geral: Node 20;
- workflow de mercado de capitais: Node 22;
- Vercel: Node 24.x.

**Recomendação:** alinhar `engines`, `.nvmrc`, CI e Vercel para reduzir diferenças de comportamento.

---

## 14. Frontend

### 14.1 Rotas atuais

| Rota | Tela |
|---|---|
| `/login` | Login |
| `/` | Dashboard |
| `/search-profiles` | Search Profiles |
| `/companies` | Companies / Leads |
| `/companies/:id` | Company Detail |
| `/watch-lists` | Watchlists |
| `/monitoring` | Monitoring |
| `/capture-inbox` | Capture Inbox |
| `/sources` | Sources |
| `/agents` | Agents |
| `/origination-os` | Origination Operating System |
| `/pipeline` | Pipeline |

Todas as rotas internas passam por `RequireAuth`.

### 14.2 Prioridade visual

1. Dashboard
2. Company Detail
3. Leads
4. Search Profiles
5. Capture Inbox
6. Pipeline
7. Sources
8. Monitoring

### 14.3 Diretriz de design

O frontend deve ser:

- institucional;
- executivo;
- claro;
- orientado à decisão;
- tolerante a falhas parciais;
- explícito sobre dado real, parcial ou indisponível;
- sem cards decorativos inúteis;
- sem clutter;
- sem inventar evidência.

### 14.4 Evoluções já incorporadas

- design system institucional grafite-petróleo e ouro;
- navegação agrupada;
- Capture Inbox roteada;
- Company Detail com navegação por âncoras;
- estados de loading, erro e vazio;
- resiliência quando rotas ABM falham;
- páginas de Pipeline e Monitoring tolerantes a falhas parciais;
- fallback de API same-origin `/api`.

---

## 15. Backend

### 15.1 Runtime

- Node;
- Express;
- TypeScript;
- modo Supabase ou memória;
- `PlatformService` como agregador central.

### 15.2 Modos

| Condição | Modo |
|---|---|
| `USE_SUPABASE=true` | `real` |
| Supabase desativado ou indisponível | `partial` / memória |

### 15.3 Famílias de endpoints

#### Saúde e autenticação

- `GET /health`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

#### Search Profiles e descoberta

- `GET /search-profiles`
- `POST /search-profiles`
- `POST /search-profiles/:id/run`
- `GET /search-profiles/:id/candidates`
- `POST /search-profiles/candidates/:id/promote`
- `GET /search-profile-runs`
- `GET /discovered-candidates`
- `POST /discovered-candidates/:id/promote`

#### Companies

- listagem;
- detalhe;
- patterns;
- fontes;
- sinais;
- monitoring;
- score;
- lead score;
- qualification;
- histórico;
- recálculo;
- tese;
- market map;
- ranking;
- atividades.

#### Dashboard

- resumo;
- top leads;
- agents;
- monitoring;
- patterns.

#### Sources

- catálogo;
- ativas;
- saúde;
- quota Mais Retorno.

#### Monitoring

- estado;
- outputs;
- triggers;
- execução global;
- execução por empresa;
- execução por fonte;
- snapshot.

#### Agents

- definições;
- runs;
- orquestração;
- health;
- comandos ABA/Paperclip/ADM.

#### Scores e ranking

- score atual;
- histórico;
- recálculo;
- lead score atual;
- histórico;
- Ranking V2;
- recálculo de ranking.

#### Pipeline e CRM

- pipeline;
- estágios;
- movimentação;
- próxima ação;
- snapshot;
- atividades;
- tarefas.

#### ABM e watchlists

- ABM War Room;
- stakeholders;
- touchpoints;
- objeções;
- briefing;
- pre-mortem;
- watchlists.

---

## 16. Supabase

### 16.1 Projeto

| Campo | Valor |
|---|---|
| Nome | `Motor_orig` |
| Project ID | `hdghpmssudrqhsbvrdyt` |
| Região | `us-west-2` |
| Status observado | `ACTIVE_HEALTHY` |
| PostgreSQL | `17.6.1.084` |
| Criado em | `2026-03-24` |

### 16.2 Modelo de camadas

```text
Bronze
  dados brutos + lineage + documentos

Silver
  normalização + deduplicação + features intermediárias

Gold
  perfis, features, momentum, ranking e benchmarks
```

### 16.3 Tabelas públicas observadas

#### Core operacional

- `companies`
- `search_profiles`
- `search_profile_runs`
- `discovered_company_candidates`
- `company_discovery_links`
- `company_entity_aliases`
- `source_catalog`
- `company_sources`
- `source_connector_runs`
- `source_documents`
- `monitoring_outputs`
- `monitoring_state`
- `company_signals`
- `enrichments`
- `qualification_snapshots`
- `score_snapshots`
- `lead_score_snapshots`
- `pattern_catalog`
- `company_patterns`
- `ranking`
- `ranking_v2`
- `thesis_outputs`
- `market_map_cards`
- `trigger_events`

#### CRM e execução

- `pipeline`
- `activities`
- `tasks`
- `notifications`
- `watchlists`
- `watchlist_companies`
- `user_profiles`

#### Dados e governança

- `bronze_historical_records`
- `data_quality_violations`
- `engine_learning_events`
- `engine_requests`
- `external_api_usage_events`
- `external_api_usage_monthly`
- `connector_usage_budgets`
- `connector_usage_events`
- `macro_series_observations`
- `company_source_metric_snapshots`
- `company_linkedin_role_snapshots`

#### Mercado de capitais

- `capital_market_dataset_runs`
- `capital_market_events`
- `capital_market_resource_checkpoints`

#### AI e vetores

- `ai_agent_runs`
- `ai_conversations`
- `ai_messages`
- `vector_documents`
- `code_improvement_proposals`

### 16.4 Views observadas

#### Bronze

- `bronze_company_signals_raw`
- `bronze_monitoring_outputs_raw`
- `bronze_source_documents_raw`

#### Silver

- `silver_company_signals_normalized`
- `silver_fidc_monthly_snapshots`
- `silver_macro_credit_features`
- `silver_monitoring_outputs_normalized`
- `silver_source_documents_deduped`

#### Gold

- `gold_company_historical_evidence`
- `gold_company_predictive_features`
- `gold_company_profiles`
- `gold_company_signal_features`
- `gold_company_signal_momentum`
- `gold_company_signal_monthly_features`
- `gold_company_source_features`
- `gold_fidc_market_benchmark`
- `gold_origination_priority_ranking`
- `gold_source_connector_run_diagnostics`

#### Operacionais

- `capital_market_ingestion_health`
- `company_intelligence_overview`
- `current_ranking`
- `dashboard_metrics`
- `latest_lead_score_snapshots`
- `latest_qualification_snapshots`
- `latest_score_snapshots`
- `pipeline_history_view`
- `pipeline_kanban`
- `sources`
- `watchlist_detail`

---

## 17. Snapshot vivo de dados — 15/07/2026

> Os números abaixo foram consultados diretamente no Supabase. Eles são uma fotografia e mudarão com novas cargas.

| Objeto | Linhas |
|---|---:|
| `companies` | 8 |
| `source_catalog` | 48 |
| `source_connector_runs` | 900 |
| `source_documents` | 6.456 |
| `monitoring_outputs` | 12.288 |
| `company_signals` | 14.606 |
| `enrichments` | 3.521 |
| `qualification_snapshots` | 808 |
| `score_snapshots` | 4.104 |
| `lead_score_snapshots` | 808 |
| `ranking_v2` | 32 |
| `vector_documents` | 2.541 |
| `data_quality_violations` | 2.025 |
| `capital_market_dataset_runs` | 7 |
| `capital_market_events` | 0 |

### 17.1 Outros volumes observados

| Objeto | Linhas aproximadas |
|---|---:|
| `company_entity_aliases` | 48 |
| `company_patterns` | 7 |
| `engine_learning_events` | 108 |
| `pipeline` | 8 |
| `activities` | 13 |
| `tasks` | 6 |
| `thesis_outputs` | 3 |
| `watchlists` | 1 |
| `watchlist_companies` | 5 |
| `search_profiles` | 1 |

### 17.2 Interpretação

A plataforma já possui volume real relevante de:

- outputs;
- sinais;
- documentos;
- enriquecimentos;
- scores;
- histórico;
- vetores.

Entretanto:

- universo de empresas ainda é pequeno;
- mercado de capitais ainda não escreveu eventos;
- Capture Inbox ainda estava sem candidatos persistidos na consulta;
- várias tabelas avançadas existem, mas não possuem carga;
- quantidade de violações de qualidade exige tratamento;
- o volume de snapshots para apenas 8 empresas indica recomputação frequente e demanda política clara de retenção.

---

# PARTE IV — FONTES E CONNECTORS

## 18. Filosofia de fontes

Prioridade obrigatória:

1. APIs públicas;
2. datasets oficiais;
3. RSS e feeds;
4. sites;
5. APIs autorizadas;
6. scraping apenas quando não houver alternativa segura.

Toda captura deve:

- registrar origem;
- persistir documento ou raw output;
- gerar hash/fingerprint;
- deduplicar;
- manter timestamps;
- separar observado de inferido;
- gerar sinais;
- permitir auditoria.

---

## 19. Catálogo vivo de fontes

### 19.1 Fontes reais ou ativas

#### Mídia de negócios

- Brazil Journal RSS
- Exame News RSS
- InfoMoney Business RSS
- NeoFeed RSS
- Valor Empresas RSS
- Bloomberg Línea RSS

#### Mídia especializada

- Finsiders RSS
- Startups BR RSS
- FIDC Market Signals RSS
- DCM Funding Signals RSS
- Credit Product Launch RSS
- VC/PE Portfolio Movement RSS

#### Sites e descoberta

- Company Websites
- Endeavor Brasil
- Distrito
- Fintechs Brasil
- Startups.com.br

#### Regulatórias e oficiais

- Receita Federal / CNPJ via BrasilAPI
- Banco Central — dados abertos
- ANBIMA Dados
- CVM Dados Abertos
- CVM Ofertas Públicas
- CVM Cadastro de Fundos
- CVM FIDC
- CVM CRI
- CVM CRA
- CVM FII

#### Market data

- Mais Retorno API

#### LinkedIn e rede profissional

- LinkedIn Company Pages
- LinkedIn Company Page Metrics
- LinkedIn Credit & Risk Role Intelligence
- Professional Network Company Posts

A camada LinkedIn é **parcial** quando depende de API oficial, export manual ou captura operador-verificada.

### 19.2 Fontes planejadas

- Banco Central SCR autorizado;
- registradoras de recebíveis autorizadas;
- SEFAZ NF-e autorizada;
- Receita Federal bulk;
- BCB SGS;
- ANBIMA debêntures;
- B3 renda fixa;
- PGFN;
- CENPROT;
- Querido Diário;
- Uqbar;
- históricos CVM;
- bases de risco jurídico e fiscal;
- APIs autorizadas de recebíveis.

### 19.3 Pontos de qualidade do catálogo

- Há fontes com status `real`, `active`, `partial` e `planned`.
- “Cadastrada” não significa “capturada”.
- “Capturada” não significa “evidência válida”.
- “Evidência” não significa “sinal comercial forte”.
- Alguns registros compartilham códigos lógicos; o catálogo precisa preservar unicidade canônica por `metadata.code`.
- `source_catalog.id` é UUID no banco vivo; códigos `src_*` são chaves lógicas em metadata.

---

## 20. Mais Retorno

### 20.1 Regra comercial

- limite mensal rígido: 500 requisições;
- meta mensal: usar até 500, sem ultrapassar;
- consumo deve ser priorizado por score e potencial de operação.

### 20.2 Componentes

- quota;
- eventos de uso;
- endpoint de status;
- card na tela Sources;
- modo `supabase` ou `memory`;
- status `real` apenas quando persistência for Supabase.

### 20.3 Regra

Nunca chamar API paga ou limitada apenas para preencher tela. Consultas devem ser direcionadas a empresas prioritárias.

---

## 21. Ingestão CVM de mercado de capitais

### 21.1 Datasets

- `cvm_offers`
- `cvm_fund_registry`
- `cvm_fidc_monthly`
- `cvm_cri_monthly`
- `cvm_cra_monthly`
- `cvm_fii_monthly`

### 21.2 Arquitetura

```text
CVM CKAN / ZIP / CSV
    ↓
descoberta de recursos
    ↓
parser
    ↓
bronze_historical_records
    ↓
capital_market_events
    ↓
resolução de emissor por CNPJ
    ↓
company_signals
    ↓
candidatos não resolvidos
    ↓
Capture Inbox
    ↓
revisão humana
    ↓
promoção seletiva para companies
```

### 21.3 Controles implementados

- prioridade para dados recentes;
- prioridade à Resolução CVM 160;
- filtros para Debênture, CRI, CRA, FIDC e FII;
- identidade natural estável;
- `content_hash`;
- inserts, updates e unchanged separados;
- checkpoints;
- lock por dataset;
- encerramento de runs obsoletos;
- canário;
- teste de idempotência;
- probe serverless leve;
- persistência no runner do GitHub Actions;
- validação do SHA publicado.

### 21.4 Cadência

- ofertas: diária;
- cadastro e informes: semanal;
- execução manual por dataset, competência e limite.

### 21.5 Estado vivo em 15/07/2026

| Dataset | Saúde |
|---|---|
| `cvm_offers` | falha mais recente; houve sucesso anterior |
| `cvm_fund_registry` | nunca executado |
| `cvm_fidc_monthly` | nunca executado |
| `cvm_cri_monthly` | nunca executado |
| `cvm_cra_monthly` | nunca executado |
| `cvm_fii_monthly` | nunca executado |

Detalhes de `cvm_offers`:

- 7 runs observados em 30 dias;
- 2 sucessos;
- 5 falhas;
- taxa de sucesso observada: 28,6%;
- último erro: fechamento de canário anterior ao lock após timeout;
- `capital_market_events`: 0 linhas no momento da consulta.

### 21.6 Bloqueador operacional

Os secrets do GitHub Actions precisam existir:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Sem esses valores, o workflow não consegue comprovar captura, persistência e idempotência no banco vivo.

---

# PARTE V — MONITORING, SINAIS E DADOS

## 22. Monitoring Engine

### 22.1 Objetivo

Detectar mudança e transformar mudança em ação.

### 22.2 Fontes monitoradas

- website;
- RSS;
- notícias;
- fontes regulatórias;
- portfólios VC/PE;
- dados de mercado;
- LinkedIn parcial;
- conectores autorizados futuros.

### 22.3 Saídas

- `source_connector_runs`;
- `source_documents`;
- `monitoring_outputs`;
- `company_signals`;
- `enrichments`;
- violações de qualidade;
- recálculo de qualification;
- recálculo de patterns;
- recálculo de lead score;
- atualização de ranking.

### 22.4 Cadência atual

- GitHub workflow de captura diário;
- Vercel cron diário;
- execuções manuais;
- mercado de capitais em workflow próprio.

### 22.5 Regra

Um fallback, erro ou consulta vazia nunca deve virar sinal comercial.

---

## 23. Entity Resolution

### 23.1 Identificadores

- CNPJ;
- domínio;
- nome normalizado;
- aliases;
- UUID;
- códigos lógicos de fonte;
- similaridade;
- revisão humana.

### 23.2 Estado

- `company_entity_aliases`: 48 registros;
- contratos de UUID foram validados no banco vivo;
- sinais tiveram lineage de fonte corrigido;
- candidatos CVM usam UUID determinístico por CNPJ ou nome na PR mais recente.

### 23.3 Regra

A mesma empresa não pode virar entidades independentes por diferenças de nome, domínio, razão social ou grafia.

---

## 24. Data quality

### 24.1 Objetivos

- impedir falso positivo;
- impedir duplicidade;
- evitar stale data;
- medir completude;
- medir lineage;
- diferenciar real e fallback;
- impedir score baseado em evidência fraca.

### 24.2 Estado

- 2.025 violações de qualidade observadas;
- views bronze/silver/gold já existem;
- quality gates estão parcialmente integrados;
- lineage de `company_signals` foi corrigido em PR anterior.

### 24.3 Próximos controles

- política de expiração;
- SLA de frescor;
- severidade;
- dono da correção;
- taxa de resolução;
- bloqueio de score para violations críticas;
- dashboards de qualidade;
- reconciliação de contagens.

---

# PARTE VI — AUTH, SEGURANÇA E GOVERNANÇA

## 25. Auth

### 25.1 Estado

**REAL**, com:

- login via Supabase;
- validação de JWT no backend;
- `/auth/me`;
- logout;
- rotas internas protegidas.

### 25.2 Gap

Ainda deve ser revisada a estratégia de armazenamento de sessão no frontend e eventual migração integral para cookie HttpOnly, desde que aplicada em PR pequena e validada contra a `main` atual.

---

## 26. RLS e advisors de segurança

### 26.1 Findings vivos em 15/07/2026

#### P0 — View com SECURITY DEFINER

`capital_market_ingestion_health` foi identificada como view SECURITY DEFINER.

**Correção recomendada:**

- recriar com `security_invoker = true`;
- revisar grants;
- testar leitura autenticada;
- rodar advisors novamente.

#### P0 — Funções SECURITY DEFINER executáveis por anon/authenticated

- `sync_capital_market_discovered_candidates(text)`
- `trigger_sync_capital_market_discovered_candidates()`

**Correção recomendada:**

- revogar `EXECUTE` de `PUBLIC`, `anon` e, se não necessário, `authenticated`;
- manter execução via `service_role`;
- considerar schema privado;
- exigir checagem de autorização dentro da função;
- evitar endpoint RPC público acidental.

#### P1 — `ranking_v2` com RLS sem policy

RLS está habilitado, mas nenhuma policy foi detectada.

**Correção recomendada:**

- definir leitura autenticada;
- restringir escrita ao `service_role`;
- testar API;
- evitar policy ampla sem predicado.

#### P1 — Leaked Password Protection desabilitada

Ativar no painel do Supabase quando o plano suportar.

### 26.2 Regras permanentes

- service-role nunca no frontend;
- toda tabela exposta deve ter RLS;
- views devem preferir security invoker;
- functions privilegiadas devem ficar fora de `public` quando possível;
- nunca usar metadata editável pelo usuário para autorização;
- migrations precisam ser idempotentes e versionadas;
- rodar advisors após DDL.

---

# PARTE VII — VERCEL E PRODUÇÃO

## 27. Projeto Vercel

| Campo | Valor |
|---|---|
| Team | `marcelo-teets-projects` |
| Team ID | `team_PJwucES3YmFbxf57HE52Bw0v` |
| Projeto | `motor-originac-srm` |
| Project ID | `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs` |
| Node | `24.x` |

### 27.1 Domínios observados

- `motor-originac-srm.vercel.app`
- `motor-originac-srm-marcelo-teets-projects.vercel.app`
- `motor-originac-srm-git-main-marcelo-teets-projects.vercel.app`

### 27.2 URL canônica operacional

Enquanto houver qualquer dúvida de alias, os workflows e runbooks usam:

```text
https://motor-originac-srm-marcelo-teets-projects.vercel.app
```

API:

```text
https://motor-originac-srm-marcelo-teets-projects.vercel.app/api
```

### 27.3 Build atual

```json
{
  "installCommand": "npm install",
  "buildCommand": "npm run build --prefix frontend",
  "outputDirectory": "frontend/dist",
  "framework": null
}
```

### 27.4 Functions

| Function | Duração | Memória |
|---|---:|---:|
| `api/index.ts` | 30 s | 512 MB |
| `api/capital-market-run.ts` | 30 s | 1.024 MB |

### 27.5 Cron Vercel

```text
/api/data-capture/cron/run
30 10 * * *
```

### 27.6 Rewrites

```text
/api/capital-markets/run → /api/capital-market-run
/api/:path*              → /api/index
SPA routes               → /index.html
```

---

## 28. Estado de deployment observado

### 28.1 Produção

O deployment de produção mais recente retornado na janela consultada estava `READY`, mas apontava para um commit anterior a vários merges recentes.

**Interpretação:** a produção deve ser comparada com a `main` atual e redeployada após os gates.

### 28.2 Preview

O preview da PR de promoção de candidatos CVM estava `READY`.

### 28.3 Erros de runtime nos últimos 7 dias

#### Timeout

- 5 ocorrências;
- rota: `/api/capital-market-run`;
- timeout de 30 segundos.

A arquitetura já foi alterada para separar:

1. probe serverless;
2. ingestão persistente no GitHub Actions.

#### Deprecation warning

- `url.parse()` / DEP0169;
- 8 ocorrências;
- rotas `/api/index` e `/api`.

**Ação:** identificar dependência ou trecho e migrar para WHATWG `URL`.

---

# PARTE VIII — CI/CD E GOVERNANÇA DE GITHUB

## 29. GitHub como fonte oficial

### 29.1 Regras

1. Sempre partir da `main` atual.
2. Uma PR por problema coerente.
3. Não empilhar arquitetura paralela.
4. Evitar branches antigas com migrations divergentes.
5. Aplicar mudanças de banco de forma controlada.
6. Verificar no Supabase vivo.
7. Validar preview.
8. Mergear somente com gates verdes.
9. Atualizar documentação na mesma PR quando necessário.
10. Fechar PRs substituídas.

---

## 30. CI geral

### Trigger

- pull request;
- push na `main`.

### Etapas

1. checkout;
2. Node 20;
3. `npm install`;
4. `npm run typecheck`;
5. `npm run build`.

### Evolução recomendada

- trocar para `npm ci`;
- incluir testes backend;
- incluir audit sem dev;
- incluir smoke de contrato;
- alinhar Node;
- exigir CI como branch protection.

---

## 31. Workflow de captura

### Trigger

- push em arquivos de captura;
- diário;
- manual.

### Execução

- chama `/api/data-capture/run`;
- autentica com `CRON_SECRET`;
- exige HTTP 2xx;
- exige payload com empresas processadas e persistência.

---

## 32. Workflow de mercado de capitais

### Funções

- ingestão diária de ofertas;
- ingestão semanal de fundos e informes;
- execução manual;
- canário;
- idempotência;
- probe do deployment exato;
- testes;
- typecheck.

### Secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

### Pontos de atenção

- workflows usam versões diferentes de Node;
- há referência de path a migration removida;
- produção precisa estar no SHA esperado;
- secrets precisam estar configurados no GitHub.

---

# PARTE IX — PRS, HISTÓRICO E ESTADO DE DESENVOLVIMENTO

## 33. Entregas recentes incorporadas

### Dados e mercado de capitais

- ingestão oficial CVM;
- CKAN;
- ZIP/CSV;
- bronze;
- eventos;
- signals;
- runs;
- RLS;
- recência;
- Resolução CVM 160;
- idempotência;
- checkpoints;
- lock;
- saúde;
- Capture Inbox para emissores não resolvidos.

### Ranking e inteligência

- Ranking V2 persistido;
- snapshots auditáveis;
- backend usando snapshot mais recente;
- Capture Inbox ativo;
- qualification;
- patterns;
- lead score;
- lineage de sinais.

### Frontend

- design system v2;
- navegação agrupada;
- Capture Inbox;
- states de erro;
- tolerância a falhas parciais;
- Company Detail executiva;
- Pipeline e Monitoring mais resilientes.

### Fontes

- mídia;
- LinkedIn parcial;
- fontes não óbvias;
- Mais Retorno;
- quota;
- observabilidade;
- CNPJ;
- websites;
- RSS.

---

## 34. PRs abertas relevantes na data de corte

### PR #161 — Promoção de candidatos CVM

**Status:** aberta, mergeável, preview READY.

Escopo:

- UUID determinístico;
- normalização de status;
- bloqueio de promoção de descartados;
- recebíveis como lista;
- lineage CVM;
- migration 047.

**Ação:** revisar advisors e permissions da função de sincronização antes do merge final.

### PR #154 — Source intelligence e decision UI

**Status:** draft.

Escopo:

- Dashboard, Leads, Sources e Monitoring;
- agregações;
- catálogo ampliado;
- hardening;
- migration 044.

**Ação:** atualizar com a `main`, separar partes conflitantes e validar após PR #161.

### PR #119 — API contracts

**Status:** draft antigo.

Escopo:

- `ApiClientError`;
- request ID;
- envelopes;
- erros JSON.

**Ação:** verificar o que já foi absorvido; reaplicar apenas gaps em PR nova.

### PR #115 — Historical backfill wave 1

**Status:** aberta, branch antiga/atrás.

Escopo:

- CVM FIDC histórico;
- BCB SGS;
- lineage mirrors;
- quality gates.

**Ação:** não mergear diretamente. Rebase conceitual e reaplicar sobre schema vivo.

### PR #113 — Voyage embeddings

**Status:** draft antigo.

Escopo:

- embeddings;
- ingestão vetorial;
- `VOYAGE_API_KEY`.

**Ação:** revisar dimensão, custos, schema e necessidade atual antes de reaplicar.

---

## 35. Issues abertas relevantes

### #133 — Release gates

Bloqueador operacional principal:

- secrets;
- conector Supabase;
- CAPTCHA;
- leaked password protection;
- monitores 401;
- smoke.

### #128 — Contrato de IDs

A premissa original foi parcialmente superada pelo diagnóstico do banco vivo e pela correção de lineage. Deve ser reescrita ou fechada com evidências atuais.

### #99 — Observabilidade e quota

Grande parte foi implementada. Deve ser fechada ou reduzida ao gap residual.

### #86 — Drift de source catalog

Ainda relevante:

- `id uuid`;
- `metadata.code`;
- migrations antigas;
- compatibilidade do runtime.

### #68 e #69 — Smoke failures

Provavelmente históricos. Devem ser triados contra a situação atual.

---

# PARTE X — STATUS FUNCIONAL CONSOLIDADO

## 36. Matriz atual

| Área | Status | Observação |
|---|---|---|
| Auth | REAL | Supabase Auth e JWT no backend. |
| Companies | REAL | Lista, detalhe e dados derivados. |
| Dashboard | REAL | KPIs e top leads com snapshots. |
| Search Profiles | REAL/PARCIAL | Persistência real; descoberta ainda precisa escala. |
| Capture Inbox | REAL/PARCIAL | Endpoints e UI; fluxo CVM em finalização. |
| Monitoring | REAL/PARCIAL | Volume real; health avançado e cobertura incompletos. |
| Sources | REAL | Catálogo vivo com 48 fontes. |
| LinkedIn | PARCIAL | API/export manual e snapshots ainda sem carga. |
| Qualification | REAL | 808 snapshots. |
| Patterns | REAL/PARCIAL | Motor real, catálogo ainda pequeno. |
| Lead Score | REAL | 808 snapshots. |
| Ranking V2 | REAL | 32 snapshots persistidos. |
| Thesis | REAL/PARCIAL | 3 outputs, precisa escala e qualidade. |
| Market Map | PARCIAL | Estrutura existe, tabela sem carga. |
| Pipeline | REAL/PARCIAL | Persistido; funil precisa alinhamento institucional. |
| Activities/Tasks | REAL | CRUD e dados reais. |
| ABM War Room | REAL/PARCIAL | Componentes operacionais; cobertura parcial. |
| Watchlists | REAL | Estrutura e dados iniciais. |
| AI Router | PARCIAL | Estrutura existe, uso avançado ainda limitado. |
| Vector store | REAL/PARCIAL | 2.541 documentos; embeddings externos não consolidados. |
| CVM connector | REAL/PARCIAL | Código robusto; cargas vivas incompletas. |
| Mais Retorno | REAL/PARCIAL | Integração e quota; depende da configuração real. |
| Data quality | REAL/PARCIAL | Violações e views existem; resolução precisa operação. |
| CI/CD | REAL/PARCIAL | Workflows existem; secrets e alinhamento faltam. |
| Vercel | REAL/PARCIAL | Deploys READY; produção precisa sincronizar com main. |
| Paperclip/ABA | PARCIAL | Rotas e comandos existem; orquestração plena ainda não. |

---

# PARTE XI — VARIÁVEIS E DEPENDÊNCIAS

## 37. Variáveis de ambiente

### Backend

```text
PORT
USE_SUPABASE
BOOTSTRAP_SUPABASE
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
MAIS_RETORNO_API_KEY
MAIS_RETORNO_API_BASE_URL
MAIS_RETORNO_API_PATH
MAIS_RETORNO_MONTHLY_QUOTA
MAIS_RETORNO_MONTHLY_TARGET
```

### Frontend

```text
VITE_API_BASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

### Experimentais ou pendentes

```text
VOYAGE_API_KEY
CAPTCHA_PROVIDER
CAPTCHA_SITE_KEY
CAPTCHA_SECRET_KEY
SMOKE_BEARER_TOKEN
```

### 37.1 Onde configurar

| Variável | GitHub Actions | Vercel | Local |
|---|---:|---:|---:|
| `SUPABASE_URL` | Sim | Sim | Sim |
| `SUPABASE_ANON_KEY` | Conforme workflow | Sim | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Sim, somente backend | Sim |
| `CRON_SECRET` | Sim | Sim | Sim |
| `MAIS_RETORNO_API_KEY` | Se workflow usar | Sim | Sim |
| `VITE_SUPABASE_URL` | Não | Sim | Sim |
| `VITE_SUPABASE_ANON_KEY` | Não | Sim | Sim |
| `VOYAGE_API_KEY` | Futuro | Futuro | Futuro |

### 37.2 Regra

- nunca usar `VITE_` para segredo;
- nunca colocar service role no browser;
- manter `CRON_SECRET` idêntico no GitHub e Vercel;
- redeploy após alterar Vercel env;
- smoke após alterar secrets.

---

# PARTE XII — ROADMAP EXECUTÁVEL

## 38. Prioridade P0 — segurança e produção

### PR 1 — Hardening Supabase

Arquivos esperados:

- nova migration;
- runbook;
- teste SQL.

Mudanças:

1. tornar `capital_market_ingestion_health` security invoker;
2. revogar funções SECURITY DEFINER de anon/authenticated;
3. criar policies de `ranking_v2`;
4. validar grants;
5. rodar advisors;
6. documentar resultado.

### PR 2 — Release gates

Ações externas:

1. configurar `SUPABASE_URL`;
2. configurar `SUPABASE_SERVICE_ROLE_KEY`;
3. configurar `CRON_SECRET`;
4. conferir mesmo valor em GitHub e Vercel;
5. ativar leaked password protection;
6. redeploy;
7. executar smoke;
8. validar endpoints 401/200.

### PR 3 — Sincronizar produção

1. confirmar `main`;
2. gerar deployment de produção;
3. validar domínio canônico;
4. abrir em sessão anônima;
5. testar `/api/health`;
6. testar login;
7. testar Dashboard;
8. testar Companies;
9. testar Sources;
10. testar Monitoring.

---

## 39. Prioridade P0 — fechar fluxo CVM

### PR 4 — Finalizar promoção de candidatos

1. atualizar PR #161;
2. aplicar migration 047;
3. corrigir findings de segurança;
4. validar UUID determinístico;
5. validar deduplicação;
6. validar “discarded não promove”;
7. validar lineage;
8. merge.

### Operação pós-merge

1. executar `cvm_offers`;
2. confirmar `capital_market_events > 0`;
3. executar novamente;
4. confirmar idempotência;
5. confirmar candidates;
6. abrir Capture Inbox;
7. promover candidato de teste;
8. confirmar company;
9. confirmar signal;
10. remover qualquer amostra sintética.

---

## 40. Prioridade P1 — escala de universo e qualidade

### PR 5 — Search Profiles e descoberta

- aumentar universo;
- executar fontes por perfil;
- deduplicar;
- medir candidates/run;
- registrar taxa de promoção;
- aumentar `companies` além da base de 8.

### PR 6 — Data quality operacional

- agrupar violations;
- identificar recorrência;
- criar severidade;
- bloquear score quando crítico;
- criar painel;
- resolver lineage residual.

### PR 7 — Alinhamento de pipeline

- decidir funil institucional;
- criar migration;
- preservar histórico;
- atualizar frontend;
- atualizar API;
- validar movimentação;
- adicionar próxima ação obrigatória.

---

## 41. Prioridade P1 — fontes reais

### Sequência

1. CVM completa;
2. BCB SGS;
3. CNPJ bulk;
4. ANBIMA;
5. B3;
6. FIDC histórico;
7. registradoras autorizadas;
8. SEFAZ autorizada;
9. LinkedIn operador-verificado;
10. portfólios VC/PE.

### Regra

Cada fonte nova precisa entregar:

- connector;
- persistência;
- lineage;
- signal mapping;
- tratamento;
- health;
- custo;
- quota;
- teste;
- runbook;
- visualização útil;
- impacto em qualification/pattern/ranking.

---

## 42. Prioridade P2 — inteligência e Copilot

Somente após base real e segura:

- AI Router mais forte;
- RAG sobre `vector_documents`;
- embeddings reais;
- Copilot por empresa;
- comparables;
- sugestões de abordagem;
- one-pager;
- memo executivo;
- feedback de resultado;
- aprendizado por conversão.

### Regra

AI não substitui:

- score determinístico;
- evidence lineage;
- regras de crédito;
- revisão humana;
- governança.

---

# PARTE XIII — DEFINITION OF DONE

## 43. MVP funcional

O MVP estará funcional quando:

### Dados

- [ ] empresas reais em escala mínima;
- [ ] sources reais capturando;
- [ ] CVM escrevendo eventos;
- [ ] candidates chegando ao Capture Inbox;
- [ ] promotion funcionando;
- [ ] lineage completo;
- [ ] quality violations críticas resolvidas.

### Inteligência

- [ ] qualification recalculada;
- [ ] patterns explicáveis;
- [ ] lead score coerente;
- [ ] ranking persistido;
- [ ] tese com evidência;
- [ ] próxima ação útil.

### Produto

- [ ] login real;
- [ ] dashboard real;
- [ ] company detail real;
- [ ] leads reais;
- [ ] search profiles funcionais;
- [ ] pipeline mutável;
- [ ] sources e monitoring claros.

### Produção

- [ ] main publicada;
- [ ] domínio público correto;
- [ ] smoke verde;
- [ ] secrets corretos;
- [ ] advisors sem erro crítico;
- [ ] runtime sem timeout recorrente;
- [ ] logs observáveis;
- [ ] CI obrigatória.

### Originação

- [ ] top leads acionáveis;
- [ ] racional comercial;
- [ ] owner;
- [ ] próxima ação;
- [ ] histórico;
- [ ] feedback de conversão;
- [ ] geração de oportunidade real.

---

# PARTE XIV — RISCOS E ANTI-PADRÕES

## 44. Riscos principais

- excesso de complexidade;
- muitos dados sem uso comercial;
- fonte cadastrada tratada como fonte capturada;
- fallback tratado como real;
- score caixa-preta;
- migrations divergentes;
- PRs antigas mergeadas sem revisão;
- secrets faltando;
- produção atrás da `main`;
- funções privilegiadas expostas;
- UI inventando champion ou evidência;
- universo de empresas pequeno;
- excesso de snapshots sem política;
- pipeline desconectado da rotina do originador.

---

## 45. Proibido

- criar stack paralela;
- usar Snowflake nesta fase;
- reabrir arquitetura sem necessidade;
- construir apenas teoria;
- ignorar Supabase;
- ignorar GitHub;
- colocar segredo em arquivo;
- promover candidato automaticamente sem governança;
- considerar source catalog como prova de captura;
- gerar sinal a partir de erro;
- usar mock sem etiqueta;
- aceitar PR antiga com drift;
- fazer scraping autenticado do LinkedIn sem base legal e técnica;
- adicionar feature que não melhore originação.

---

# PARTE XV — ROTINA OPERACIONAL

## 46. Checklist diário

1. Conferir health da produção.
2. Conferir captures.
3. Conferir runs de fontes.
4. Conferir novos signals.
5. Conferir novos candidates.
6. Revisar Capture Inbox.
7. Conferir mudanças de ranking.
8. Revisar top leads.
9. Atualizar pipeline.
10. Registrar próxima ação.

## 47. Checklist semanal

1. Executar cargas semanais CVM.
2. Revisar fontes degradadas.
3. Revisar quota Mais Retorno.
4. Resolver violations críticas.
5. Revisar patterns por empresa.
6. Revisar empresas sem tese.
7. Revisar empresas sem próxima ação.
8. Reciclar leads.
9. Atualizar Search Profiles.
10. Publicar resumo de originação.

## 48. Checklist mensal

1. Medir empresas novas.
2. Medir candidates.
3. Medir taxa de promoção.
4. Medir leads prioritários.
5. Medir reuniões.
6. Medir mandatos.
7. Medir conversão.
8. Calibrar score.
9. Calibrar patterns.
10. Repriorizar fontes.
11. Revisar custos e quotas.
12. Atualizar este documento.

---

# PARTE XVI — MÉTRICAS DE SUCESSO

## 49. Métricas de dados

- fontes catalogadas;
- fontes capturando;
- cobertura por empresa;
- freshness;
- deduplicação;
- lineage;
- violations;
- tempo de processamento;
- custo por fonte.

## 50. Métricas de inteligência

- precision de signals;
- taxa de confirmação humana;
- evolução de score;
- taxa de promoção;
- qualidade da tese;
- assertividade da estrutura sugerida.

## 51. Métricas comerciais

- leads novos;
- abordagens;
- respostas;
- reuniões;
- oportunidades;
- mandatos;
- operações;
- volume;
- receita;
- tempo até contato;
- tempo até mandato;
- origem da oportunidade.

## 52. Métrica central

> Quantas operações reais o sistema ajuda a originar com melhor timing, melhor tese e menor esforço?

---

# PARTE XVII — MAPA DE ARQUIVOS IMPORTANTES

## 53. Código

```text
backend/src/server.ts
backend/src/services/platformService.ts
backend/src/services/capturePersistenceService.ts
backend/src/services/captureDerivedSyncService.ts
backend/src/services/capitalMarketIngestionService.ts
backend/src/lib/scoring.ts
backend/src/lib/ranking.ts
backend/src/lib/qualification.ts
backend/src/lib/patterns.ts
backend/src/lib/connectors.ts
backend/src/lib/crm.ts
backend/src/lib/auth.ts
backend/src/lib/maisRetorno.ts
backend/src/modules/capital-markets/
backend/src/modules/originationOperatingSystem.ts
backend/src/routes/
frontend/src/App.tsx
frontend/src/pages/
frontend/src/lib/api.ts
frontend/src/lib/auth.tsx
config/scoring.ts
```

## 54. Infraestrutura

```text
vercel.json
.env.example
.github/workflows/ci.yml
.github/workflows/capture.yml
.github/workflows/capital-market-ingestion.yml
.github/workflows/vercel-smoke.yml
.github/workflows/supabase-smoke.yml
```

## 55. Banco

```text
db/schema.sql
db/migrations/
```

## 56. Documentação

```text
README.md
docs/architecture.md
docs/status-matrix.md
docs/origination-operating-system.md
docs/capture-persistence-smoke.md
docs/capture-runtime-operational-checklist.md
docs/non-obvious-data-sources-capture-treatment.md
```

---

# PARTE XVIII — DECISÕES CONSOLIDADAS

## 57. Decisões que não devem ser reabertas sem evidência

- Brasil-only;
- React + Vite;
- Node + TypeScript;
- Supabase;
- Vercel;
- GitHub como fonte oficial;
- monorepo;
- main atual;
- PRs pequenas;
- source lineage;
- score explicável;
- ranking persistido;
- Capture Inbox com revisão;
- mock somente como fallback;
- APIs públicas antes de scraping;
- sem Snowflake nesta fase.

## 58. Decisões que ainda precisam fechamento

- funil comercial final;
- policy de `ranking_v2`;
- exposição das functions CVM;
- cookie HttpOnly;
- estratégia de embeddings;
- source code uniqueness;
- política de retenção de snapshots;
- CAPTCHA;
- Paperclip operacional pleno;
- carga histórica;
- meta mínima de universo de empresas;
- critérios de fechamento de violations.

---

# PARTE XIX — PRÓXIMA AÇÃO RECOMENDADA

## 59. Ordem exata

1. Corrigir advisors de segurança do Supabase.
2. Configurar secrets de GitHub e Vercel.
3. Mergear a promoção de candidatos CVM.
4. Publicar a `main` atual em produção.
5. Executar carga CVM.
6. Comprovar `capital_market_events > 0`.
7. Comprovar idempotência.
8. Comprovar candidates no Capture Inbox.
9. Promover uma empresa real.
10. Recalcular qualification, patterns, lead score e ranking.
11. Validar frontend ponta a ponta.
12. Fechar PRs e issues obsoletas.
13. Expandir universo.
14. Integrar próxima fonte oficial.
15. Medir resultado comercial.

---

# APÊNDICE A — FOTOGRAFIA DO ESTADO EM 15/07/2026

## A.1 Resumo executivo

- Supabase saudável.
- 48 tabelas públicas.
- 48 fontes catalogadas.
- 14.606 sinais.
- 12.288 outputs.
- 6.456 documentos.
- 3.521 enrichments.
- 4.104 snapshots de score.
- 808 qualifications.
- 808 lead scores.
- 32 rankings V2.
- 2.541 documentos vetoriais.
- 2.025 violações.
- 8 empresas.
- 0 eventos de mercado de capitais.
- produção READY, mas aparentemente atrás de merges recentes;
- preview da PR #161 READY;
- timeout histórico na rota CVM;
- findings de segurança pendentes;
- secrets do GitHub bloqueiam prova da ingestão.

## A.2 Diagnóstico

O Motor já deixou de ser apenas protótipo. Existe:

- backend;
- frontend;
- banco;
- auth;
- dados;
- monitoring;
- score;
- ranking;
- pipeline;
- fontes;
- CI/CD;
- deploy;
- conectores.

O principal problema não é falta de arquitetura. É fechar o ciclo operacional:

```text
fonte real
→ dado persistido
→ sinal confiável
→ empresa
→ qualification
→ pattern
→ score
→ tese
→ ranking
→ abordagem
→ pipeline
→ mandato
→ operação
→ aprendizado
```

---

# APÊNDICE B — CÉREBRO MESTRE ORIGINAL

Abaixo está preservado integralmente o arquivo-base fornecido ao projeto. Em caso de divergência de status técnico, o estado vivo descrito nas seções anteriores prevalece; em visão, escopo e princípios, este cérebro permanece a referência central.

```text
ORIGINATION INTELLIGENCE PLATFORM
CÉREBRO MESTRE DO PROJETO
VERSÃO INSTITUCIONAL UNIFICADA

====================================================================
1. IDENTIDADE DO PROJETO
====================================================================

Nome do projeto:
Origination Intelligence Platform

Propósito central:
Construir um sistema institucional de inteligência de originação para mapear,
monitorar, enriquecer, classificar, priorizar e acompanhar empresas brasileiras
com potencial de demandar operações de crédito estruturado, mercado de capitais
de dívida, FIDC, nota comercial, debênture, CRA, CRI e estruturas correlatas.

Escopo geográfico atual:
Brasil apenas.

Recorte estratégico atual:
- empresas de tecnologia
- empresas tech-based
- empresas tech-backed
- middle market
- startups
- empresas com sinais de necessidade de crédito
- empresas com indícios de precisar de capital para fluxo de caixa
- empresas com produtos de crédito
- empresas com recebíveis
- empresas com dependência potencial de funding escalável
- empresas com aderência a estruturas de DCM ou FIDC

Missão operacional:
Dar ao time de originação uma vantagem estrutural na descoberta, leitura,
priorização e execução comercial de oportunidades de crédito antes do mercado.

Tese principal:
O mercado enxerga o óbvio.
Este projeto precisa enxergar:
- o óbvio antes dos outros
- o não tão óbvio com mais profundidade
- o sinal fraco antes que ele vire notícia comum
- a necessidade de crédito antes que a empresa peça capital

====================================================================
2. VISÃO ESTRATÉGICA
====================================================================

A plataforma não é apenas um CRM.
Ela também não é apenas um data room de empresas.
Ela não é apenas um agregador de notícias.
Ela não é apenas um score.

A plataforma é um sistema integrado de inteligência de originação, composto por:
- descoberta de empresas
- monitoramento contínuo
- extração de sinais
- enriquecimento analítico
- score multi-dimensional
- histórico temporal
- tese automática de crédito
- market map
- ranking dinâmico
- trigger engine
- copiloto de análise
- CRM operacional
- governança de fontes
- resolução de entidades
- preparação para escala institucional

Objetivo final:
Transformar um processo historicamente artesanal e relacional em uma máquina
de originação sistemática, explicável, versionável e escalável.

====================================================================
3. PROBLEMA QUE O PROJETO RESOLVE
====================================================================

No mercado, a originação de operações de crédito e DCM ainda depende muito de:
- networking
- reputação
- fluxo informal de informação
- percepção subjetiva
- timing manual
- leitura fragmentada do mercado
- baixa integração entre sinais públicos e trabalho comercial

Isso gera:
- cobertura incompleta do universo alvo
- perda de oportunidades
- abordagem tardia
- baixa priorização
- excesso de esforço em leads de baixa qualidade
- baixa rastreabilidade da tese
- dificuldade de explicar por que uma empresa virou prioridade
- dependência excessiva de pessoas específicas

A Origination Intelligence Platform resolve isso criando:
- um universo estruturado de empresas
- um motor de descoberta e monitoramento
- um sistema de score com memória histórica
- uma camada de tese e recomendação
- uma interface operacional para o time comercial

====================================================================
4. OBJETIVO DE NEGÓCIO
====================================================================

Objetivo macro:
Aumentar a assertividade e a velocidade da originação de operações de crédito.

Objetivos específicos:
1. Mapear empresas com fit potencial para estruturas de crédito.
2. Detectar sinais precoces de necessidade de funding.
3. Identificar empresas com recebíveis ou carteira elegível para FIDC.
4. Identificar empresas com necessidade de DCM corporativo.
5. Criar ranking dinâmico e explicável.
6. Reduzir dependência de descoberta manual.
7. Melhorar o timing de abordagem comercial.
8. Organizar execução em pipeline.
9. Gerar memória institucional do processo de originação.
10. Criar base para inteligência preditiva futura.

====================================================================
5. ESCOPO ATUAL
====================================================================

Escopo atual, até nova orientação:
- Brasil only
- Middle Market
- Tech-based / tech-backed
- Startups
- Venture-backed ou com características semelhantes
- Foco em necessidade de crédito, DCM e FIDC
- Fontes preferencialmente públicas, gratuitas e monitoráveis
- Forte uso de sites das próprias empresas, portfólios de VC, notícias e dados públicos

Fora do escopo atual:
- expansão internacional
- aquisição de data vendors pagos sem necessidade
- APIs comerciais caras como pilar central
- setores fora do recorte, salvo se houver orientação explícita
- produto genérico para todo tipo de empresa

====================================================================
6. TESE CENTRAL DE ORIGINAÇÃO
====================================================================

A hipótese estratégica do projeto é a seguinte:

Existem grupos de empresas que, mesmo antes de explicitarem uma busca por crédito,
já emitem sinais observáveis de:
- aumento de complexidade financeira
- pressão de capital de giro
- crescimento financiado
- geração de recebíveis
- expansão de produto de crédito
- dependência de funding escalável
- inadequação de funding bancário tradicional
- maturação para estruturas de mercado de capitais

Se esses sinais forem capturados, cruzados e interpretados corretamente,
é possível:
- abordar cedo
- montar tese melhor
- estruturar produto aderente
- ganhar competição de originação

====================================================================
7. UNIVERSO-ALVO
====================================================================

O universo-alvo atual inclui:

Categoria 1: Fintechs
- fintechs de crédito
- fintechs de infraestrutura financeira
- fintechs de pagamentos
- embedded finance
- receivables / antecipação
- BNPL
- lending
- financing

Categoria 2: Plataformas tech com funding implícito
- marketplaces
- plataformas B2B
- plataformas que financiam sellers, buyers ou parceiros
- empresas com capital de giro relevante

Categoria 3: Startups e growth companies
- venture-backed
- private-backed
- middle market com tração
- empresas em aceleração operacional

Categoria 4: Empresas com recebíveis
- empresas com fluxo recorrente
- empresas com carteira
- empresas com parcelamento
- empresas com assinaturas ou contratos recorrentes
- empresas com ativos potencialmente securitizáveis

Categoria 5: Empresas com fit para DCM
- necessidade de alongamento de passivo
- funding escalável
- estrutura de capital mais sofisticada
- pressão por crescimento e alocação eficiente de capital

====================================================================
8. FONTES DE DADOS — FILOSOFIA
====================================================================

Princípio:
As fontes normais todo mundo usa.
A vantagem virá da combinação entre:
- fontes óbvias
- fontes nichadas
- fontes públicas pouco exploradas
- sites das próprias empresas
- sinais indiretos
- monitoramento contínuo
- uso inteligente de Google hacking
- leitura contextual e cruzamento entre fontes

A plataforma deve preferir fontes:
- públicas
- gratuitas
- reproduzíveis
- monitoráveis
- com boa capacidade de atualização
- com ligação direta com evidência operacional

====================================================================
9. FONTES DE DADOS — CATEGORIAS
====================================================================

9.1 Fontes regulatórias e oficiais
- CNPJ / dados públicos cadastrais
- CVM
- BCB
- dados públicos federais
- juntas, cadastros e informações institucionais aplicáveis

Uso:
- base cadastral
- confirmação de identidade
- sinais regulatórios
- operações observáveis
- fundos, emissores, estruturas e cadastros relevantes

9.2 Portfólios de fundos de Venture Capital
Esta é uma fonte estratégica do projeto.

Exemplos de uso:
- mapear empresas investidas
- inferir estágio e qualidade da cap table
- detectar mudanças de portfólio
- priorizar segmentos de interesse
- cruzar portfólio com produtos de crédito e sinais de funding

O portfólio de fundos deve ser tratado como fonte central porque:
- dá pistas sobre qualidade e maturidade da empresa
- mostra clusters temáticos
- ajuda a inferir momento de crescimento
- antecipa potenciais demandas de capital

9.3 Notícias — tradicionais e nichadas
Notícias são um termômetro fundamental.

Devem ser monitorados:
- veículos tradicionais
- veículos de economia
- veículos de negócios
- veículos nichados de startup
- veículos nichados de fintech
- newsletters
- blogs setoriais
- newsroom das próprias empresas

Uso:
- funding event
- lançamento de produto
- expansão
- aquisição
- contratação de executivos
- mudança de narrativa da empresa
- sinais de produto de crédito
- sinais de recebíveis
- sinais de estrutura de capital

9.4 Sites das próprias empresas
Esta é uma das fontes mais importantes do projeto.

Fontes internas da empresa:
- home
- páginas de produto
- páginas de pricing
- newsroom
- blog
- investor / institucional
- carreiras
- páginas de documentação
- páginas de parceiros
- páginas de FAQ
- termos e políticas

Uso:
- detectar palavras-chave
- detectar mudança de posicionamento
- detectar lançamento de crédito
- detectar menções a recebíveis
- detectar expansão de produto
- detectar mudança de tese comercial
- inferir estrutura operacional

9.5 Google hacking / dorks
A plataforma deve incorporar uma mentalidade de descoberta ativa.

Exemplos conceituais:
- buscar PDFs de relatórios
- buscar planilhas esquecidas
- buscar apresentações
- buscar páginas de portfólio
- buscar documentos com termos como FIDC, venture debt, nota comercial, recebíveis, etc.
- buscar conteúdo escondido em domínios institucionais

Uso:
- expandir o universo
- encontrar dados semi-escondidos
- encontrar portfólios, relatórios, decks, páginas antigas, feeds e documentos

9.6 Redes e sinais digitais
- YouTube
- GitHub
- RSS
- blogs de produto
- newsletters públicas
- eventualmente outras fontes públicas viáveis

Uso:
- lançamentos
- webinars
- documentações
- sinais de produto
- sinais de expansão técnica
- educação de mercado

====================================================================
10. FONTES DE DADOS — PRINCÍPIOS OPERACIONAIS
====================================================================

1. Tudo precisa ter origem identificável.
2. Toda inferência importante precisa de evidência.
3. Fonte pública é preferível à fonte opaca.
4. Site da própria empresa tem peso alto.
5. Fonte regulatória tem peso altíssimo.
6. Notícia sozinha não basta; notícia corroborada vale mais.
7. Sinal sem contexto não deve dominar o score.
8. O sistema deve guardar histórico de quando a informação foi observada.
9. A plataforma precisa saber diferenciar:
   - dado observado
   - dado inferido
   - dado estimado
   - recomendação analítica

====================================================================
11. MÓDULOS DA PLATAFORMA
====================================================================

O projeto é composto pelos módulos abaixo.

11.1 Company Master
Objetivo:
Manter a entidade central da empresa.

Funções:
- cadastro
- nome legal
- nome fantasia
- CNPJ
- domínio
- setor
- subsetor
- estágio
- localização
- owner comercial
- origem da empresa

11.2 Source Catalog
Objetivo:
Catálogo governado de fontes monitoradas.

Funções:
- cadastro de fonte
- categoria
- escopo geográfico
- criticidade
- frequência
- prioridade
- governança
- validação

11.3 Monitoring Engine
Objetivo:
Monitorar continuamente empresas, fontes e sinais.

Fontes:
- site da empresa
- notícias
- RSS
- portfólios VC
- demais fontes Brasil-only monitoradas

11.4 Research Engine
Objetivo:
Transformar material bruto em resumo, fontes e sinais relevantes.

11.5 Enrichment Engine
Objetivo:
Estruturar o entendimento da empresa.

11.6 Scoring Engine
Objetivo:
Calcular scores estruturais, timing, executabilidade e score consolidado.

11.7 Score History Engine
Objetivo:
Guardar histórico de score e explicar mudança ao longo do tempo.

11.8 Trigger Engine
Objetivo:
Detectar eventos e sinais que mudam prioridade ou tese.

11.9 Ranking Engine
Objetivo:
Ordenar empresas de forma dinâmica e explicável.

11.10 Thesis Generator
Objetivo:
Gerar tese de crédito, por que agora, estruturas sugeridas e riscos.

11.11 Market Map Engine
Objetivo:
Conectar tipo de ativo, estrutura sugerida, fit de mercado e perfil de investidor.

11.12 Entity Resolution
Objetivo:
Resolver aliases, normalizar nomes e evitar duplicidade.

11.13 Source Governance
Objetivo:
Garantir disciplina, qualidade e consistência do catálogo de fontes.

11.14 Copilot
Objetivo:
Permitir consulta e análise assistida sobre empresas, rankings, sinais e teses.

11.15 CRM / Pipeline
Objetivo:
Operacionalizar o processo de originação.

====================================================================
12. PIPELINE COMERCIAL
====================================================================

Etapas do funil atual:
- Potenciais Interessados
- Prospecção
- Conversa Ventures
- Intro Empírica
- Conversa Empírica
- Envio de Infos
- Envio Mandato
- Mandato Assinado
- Estruturação do Produto
- Captação
- Fechado
- Não Faz Sentido
- Reciclar

Função do sistema:
- posicionar empresa no estágio certo
- manter owner
- registrar atividade
- registrar próxima ação
- registrar follow-up
- guardar histórico de movimentação
- conectar inteligência com execução comercial

====================================================================
13. SCORE — VISÃO GERAL
====================================================================

O score é importante, mas não é o projeto inteiro.
O score é uma camada da máquina.

O sistema atual já evoluiu para uma lógica mais rica, com:
- score estrutural
- score de timing
- score de executabilidade
- source confidence
- score history
- ranking dinâmico
- market fit
- trigger strength

Princípio:
Score precisa ser:
- explicável
- versionável
- comparável
- revisável
- auditável

====================================================================
14. SCORE V2 — ESTRUTURA
====================================================================

Bloco 1: Structural Need
Mede se a empresa, por natureza, tende a precisar de crédito.

Exemplos de componentes:
- recebíveis
- concessão de crédito
- financiamento de clientes
- financiamento de fornecedores
- intensidade de capital de giro
- dependência de funding
- carteira de crédito
- embedded finance

Bloco 2: Timing
Mede se a necessidade parece estar se intensificando agora.

Exemplos:
- rodada recente
- nova notícia relevante
- novo produto
- expansão
- trigger recente
- mudança no site
- mudança no portfólio de VC
- aumento de cobertura em veículos nichados

Bloco 3: Executability
Mede se existe viabilidade estrutural de operação.

Exemplos:
- fit para FIDC
- fit para DCM
- comparáveis
- sinais de governança
- fit de mercado
- tipo de investidor provável

====================================================================
15. SCORE HISTORY
====================================================================

O projeto deve guardar histórico de score por empresa.

O histórico deve responder:
- qual era o score antes
- qual é o score agora
- quanto mudou
- por que mudou
- qual evento provocou a mudança
- se a prioridade aumentou ou caiu

Isso é essencial porque:
- oportunidade é dinâmica
- timing importa
- a qualidade da tese melhora quando há memória temporal
- o time comercial precisa saber quando reativar empresas

====================================================================
16. RANKING DINÂMICO
====================================================================

A ordem de prioridade não pode depender só do score estático.
Ela deve considerar também:
- score atual
- tendência de score
- força dos triggers
- source confidence
- market fit
- prioridade comercial
- contexto recente

Resultado:
uma empresa com score médio, mas grande aceleração e triggers fortes,
pode subir na fila.

====================================================================
17. THESIS GENERATOR
====================================================================

A tese automática deve responder:
- por que essa empresa pode precisar de crédito
- por que agora
- qual estrutura parece mais aderente
- qual o ângulo comercial sugerido
- quais riscos precisam de validação

Princípios:
- baseada em evidências
- operacional
- não criativa sem fundamento
- útil para abordagem comercial e análise

====================================================================
18. MARKET MAP
====================================================================

O Market Map conecta:
- tipo de ativo
- recebíveis
- estrutura sugerida
- comparáveis
- perfil de investidor
- fit de mercado

Ele existe para responder:
- essa empresa parece FIDC ou DCM?
- que ativo ela aparentemente gera?
- que estrutura é mais aderente?
- que tipo de investidor poderia olhar essa oportunidade?
- quais comparáveis sustentam a tese?

====================================================================
19. ENTITY RESOLUTION
====================================================================

Sem boa resolução de entidades, o projeto perde qualidade.

Problemas que essa camada resolve:
- nomes diferentes para a mesma empresa
- domínio e nome divergentes
- aliases
- duplicidade entre fontes
- reingestão repetida da mesma companhia

Princípio:
- CNPJ quando disponível
- nome normalizado
- domínio
- similaridade textual
- revisão humana quando necessário

====================================================================
20. SOURCE GOVERNANCE
====================================================================

A governança das fontes é uma parte crítica do projeto.

Cada fonte deve ter:
- nome
- categoria
- escopo
- frequência
- criticidade
- prioridade
- status
- regra de validação

Categorias relevantes:
- regulatory
- news_traditional
- news_niche
- vc_portfolio
- company_site
- jobs
- patents
- procurement
- social_signal

Princípios:
- Brasil only
- monitorável
- justificável
- sem acumular fonte inútil
- priorização por valor real

====================================================================
21. MONITORING ENGINE
====================================================================

O monitoramento precisa ser contínuo e não episódico.

Objetivo:
- detectar mudança
- registrar mudança
- reavaliar empresa
- disparar atualização de score, tese e ranking

Tipos de monitoramento:
1. site da empresa
2. notícias
3. portfólio de VC
4. RSS
5. sinais digitais
6. mudanças no universo regulatório aplicável

Saídas do monitoramento:
- monitoring output
- sinais observados
- força do sinal
- origem
- timestamp
- recomendação de reprocessamento

====================================================================
22. NOTÍCIAS COMO TERMÔMETRO
====================================================================

Notícias são fundamentais porque mostram:
- o que a empresa quer comunicar
- como o mercado a lê
- em que fase ela parece estar
- eventos de funding
- mudança de produto
- estratégia de crescimento
- parcerias
- aquisição
- estrutura de capital

O sistema deve monitorar:
- veículos tradicionais
- veículos de negócios
- veículos nichados de startup e fintech
- newsletters especializadas
- mídia própria da empresa

====================================================================
23. PORTFÓLIOS DE VC COMO FONTE ESTRATÉGICA
====================================================================

Portfólios de VC são altamente estratégicos porque:
- mostram empresas com apoio institucional
- indicam estágio
- dão pistas de crescimento
- revelam clusters temáticos
- podem antecipar pressão de funding
- ajudam a montar o radar de middle market tech-backed

A plataforma deve:
- monitorar páginas de portfólio
- registrar empresas investidas
- detectar mudanças
- cruzar isso com score, notícias e sinais de crédito

====================================================================
24. COPILOT
====================================================================

O Copilot é a camada de interface inteligente do projeto.

Perguntas que ele deve responder:
- quais empresas parecem mais prontas para FIDC?
- quais parecem mais alinhadas a DCM?
- quais subiram no ranking?
- por que essa empresa ficou prioritária?
- o que mudou no score?
- qual tese preliminar de crédito?
- qual estrutura faz mais sentido?
- quais comparáveis sustentam isso?

O Copilot não substitui a lógica determinística.
Ele se apoia em:
- monitoring
- enrichment
- score
- score history
- triggers
- thesis
- market map

====================================================================
25. ARQUITETURA FUNCIONAL
====================================================================

Fluxo macro do sistema:

universo de empresas
-> catálogo de fontes
-> monitoramento
-> research
-> enrichment
-> sinais
-> score
-> score history
-> triggers
-> thesis
-> market map
-> ranking
-> copiloto
-> CRM

====================================================================
26. ARQUITETURA TÉCNICA
====================================================================

Camadas:
1. fontes
2. conectores
3. raw outputs
4. normalização
5. entity resolution
6. enrichment
7. feature layer
8. score layer
9. context layer
10. ranking layer
11. API layer
12. frontend
13. documentação
14. pacote operacional versionado

====================================================================
27. ESTRUTURA DE DADOS
====================================================================

Entidades principais:
- companies
- sources
- monitoring_outputs
- company_sources
- company_signals
- enrichments
- score_snapshots
- score_history
- trigger_events
- thesis_outputs
- market_map_cards
- ranking_v2
- pipeline
- activities
- tasks
- source_catalog
- monitoring_state

====================================================================
28. PRINCÍPIOS DE MODELAGEM
====================================================================

1. Versionar tudo que muda com o tempo.
2. Não sobrescrever score importante sem histórico.
3. Toda tese precisa apontar para sinais.
4. Toda recomendação precisa ser explicável.
5. Todo output importante precisa ter origem.
6. Diferenciar observação de inferência.
7. Separar camada transacional da camada analítica.
8. Permitir revisão humana.

====================================================================
29. STATUS ATUAL DO DESENVOLVIMENTO
====================================================================

O projeto já tem, em diferentes versões de pacote:
- backend inicial
- frontend inicial
- autenticação
- migrations
- seed
- docker
- replit bundle
- phase 2 brasil-only
- monitoring
- source registry
- scoring v2
- score history
- copilot inicial
- entity resolution
- source governance
- thesis generator
- market map
- assets de documentação
- planilhas e tabelas auxiliares
- pacotes zip versionados

A evolução do projeto foi organizada em versões v1 até v6,
com tentativa de consolidação v7.

====================================================================
30. O QUE AINDA FALTA PARA MATURIDADE MAIOR
====================================================================

Itens importantes para próximas fases:
- integração real total no backend principal
- persistência SQL de todas as camadas novas
- scheduler/jobs reais
- loaders mais fortes para bases Brasil-only
- ranking v2 persistido
- integração completa da tela de empresa
- painel de fontes
- painel de triggers
- painel de monitoramento
- painel de tese e market map
- feature store real
- materialized views
- comparables engine
- trigger strength mais sofisticado
- copiloto com mais contexto e memória operacional

====================================================================
31. ROADMAP IMPLÍCITO
====================================================================

Fase atual:
Construção institucional da Fase 2, Brasil-only, com monitoramento, score,
histórico, tese, market map e preparação para operação.

Próxima fase natural:
- integração final v7/v8
- jobs recorrentes
- loaders regulatórios mais robustos
- consolidação do frontend
- rankings operacionais
- copiloto contextual
- persistência forte

Fase seguinte:
- comparables
- thesis refinement
- alpha engine
- predição mais forte
- monitoramento antes do mercado

====================================================================
32. RISCO PRINCIPAL DO PROJETO
====================================================================

O risco não é técnico apenas.
Os principais riscos são:
- excesso de complexidade sem foco
- acumular fontes sem governança
- score virar caixa-preta
- dados sem utilidade operacional
- falta de integração com o time comercial
- priorização ruim do backlog
- pouca disciplina de versionamento

Resposta estratégica:
- construir em camadas
- preservar explicabilidade
- priorizar o que gera valor operacional
- manter Brasil-only até maturar
- manter o recorte de middle market tech/startups
- só expandir quando a máquina estiver consistente

====================================================================
33. PRINCÍPIOS DE DESENVOLVIMENTO
====================================================================

1. Trabalhar de forma holística.
2. Não ficar preso apenas no score.
3. Integrar dados, tese, mercado e CRM.
4. Priorizar o que é viável agora.
5. Criar assets reutilizáveis.
6. Produzir documentação junto com código.
7. Pensar como sistema institucional, não apenas como protótipo.
8. Manter a plataforma explicável e audível.
9. Construir para escala, mas sem perder pragmatismo.
10. Gerar vantagem de originação concreta.

====================================================================
34. O QUE ESTE ARQUIVO REPRESENTA
====================================================================

Este arquivo é o cérebro mestre do projeto.

Ele existe para:
- preservar a visão total
- alinhar produto, dados, tecnologia e negócio
- evitar que o projeto vire apenas um conjunto solto de scripts
- manter coerência entre módulos
- servir como memória institucional
- orientar engenharia, análise, pesquisa e priorização

Ele deve ser usado como:
- referência central
- fonte de alinhamento
- material-base para prompts
- guia para novas versões
- documento de continuidade do projeto

====================================================================
35. REGRA FINAL
====================================================================

Este projeto deve sempre buscar responder, com mais precisão do que o mercado:

1. Quem são as empresas certas?
2. O que está mudando nelas?
3. Por que isso importa financeiramente?
4. Qual estrutura de crédito faz mais sentido?
5. Por que agora?
6. Qual a melhor abordagem comercial?
7. Como transformar isso em pipeline real?

Se o sistema não melhorar a qualidade dessas respostas,
ele está ficando complexo sem gerar vantagem real.

Se o sistema melhorar essas respostas de forma explicável, recorrente e operacional,
então ele está cumprindo sua missão.

FIM DO CÉREBRO MESTRE DO PROJETO
```

---

# FIM DO DOCUMENTO
