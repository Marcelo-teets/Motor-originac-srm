# People & Capital Intelligence

## Objetivo

Transformar expansão de time, intenção de contratação e relações de capital em sinais temporais e explicáveis de originação, integrados ao pipeline existente:

`Sources → Monitoring → Signals → Enrichment → Qualification → Patterns → Score/Lead Score → Ranking → Pipeline`

A camada não cria um score ou grafo paralelo. Ela reutiliza `company_source_metric_snapshots`, `company_signals`, `qualification_snapshots`, `knowledge_nodes` e `knowledge_links`.

## Fontes governadas

| Código | Fonte | Papel | Frequência |
|---|---|---|---|
| `src_company_careers` | Páginas públicas de carreiras das companhias | vagas abertas e encerradas | weekly |
| `src_tech_signals_latam` | Tech Signals LatAm / Tech Talents | headcount, traction, funding, investidores e dívida | daily |
| `src_jobs_credit_hiring_rss` | Google News RSS parametrizado | descoberta/corroboração de hiring | weekly |
| `src_vc_portfolio_change_rss` | Google News RSS parametrizado | descoberta/corroboração de investidores e rodadas | weekly |

Páginas first-party são autoridade para o estado de uma vaga. RSS/newsletter são evidência de observação e devem preservar `source_url`, timestamp e confiança.

## Regra de interpretação

### Headcount efetivo

`headcount_total` representa o quadro observado/reportado pela fonte. Quando a fonte informa crescimento e total, ambos são persistidos.

Se a fonte disser “+23% para 48 pessoas”, o sistema armazena:

- `48` como total observado/reportado;
- `+23%` como crescimento reportado;
- aproximadamente `39` como total anterior **inferido**, nunca observado;
- `growth_basis=reported_growth_with_inferred_prior`.

Quando houver duas medições próprias sequenciais, a variação passa a usar `growth_basis=sequential_observations`.

### Hiring intent

Vaga aberta é intenção de contratar, não contratação realizada. A composição funcional das vagas é exposta como `*_hiring_intent_pct`.

Exemplo correto: “2 de 4 vagas abertas (50%) são ligadas a crédito/risco/funding/DCM”.

Exemplo proibido sem evidência de pessoas contratadas: “50% das pessoas contratadas foram para crédito”.

## Famílias de vagas

- `capital_markets`
- `funding`
- `treasury`
- `credit`
- `risk`
- `underwriting`
- `collections`
- `finance`
- `other`

Cada vaga recebe `dcm_relevance_score`, `credit_relevance_score`, senioridade, URL, `first_seen_at`, `last_seen_at`, status e eventual `closed_at`.

O crawler tenta JSON-LD `JobPosting` primeiro e usa links públicos como fallback. Uma resposta HTTP 200 só pode encerrar vagas anteriores quando a página for validada como página real de carreiras; homepages reescritas para `/careers` não contam como observação zero.

## Sinais e tratamento de qualificação

| Sinal | Leitura de originação |
|---|---|
| `headcount_acceleration` | expansão operacional; aumenta timing, exige corroboração para necessidade de dívida |
| `capital_markets_hiring` | preparação de capacidade interna para DCM/mercado de capitais |
| `funding_team_hiring` | aumento de complexidade de funding/tesouraria |
| `credit_team_hiring` | buildout de crédito, risco, underwriting ou cobrança |
| `credit_infrastructure_buildout` | múltiplas vagas estratégicas; reforça crédito como infraestrutura relevante |
| `investor_relationship_signal` | melhora mapa de capital e executabilidade comercial; não prova necessidade de dívida |
| `fidc_funding_event` | confirma uso de funding estruturado/FIDC; forte sinal de executabilidade e potencial resize/refinanciamento |
| `structured_debt_funding` | confirma capacidade/disposição de usar dívida estruturada |
| `credit_origination_acceleration` | crescimento de carteira/originação pode ampliar funding gap |
| `public_financing_signal` | mapeia funding BNDES/Finep e complementaridade com DCM |

O tratamento determinístico está em `backend/src/lib/sourceTreatment.ts`.

## Rede investidor ↔ empresa

Entidades financeiras são persistidas em:

- `investors`
- `company_investor_relationships`

Cada relacionamento preserva rodada, valor, moeda, lead/participant, data, fonte, confiança e evidência.

O Knowledge Vault existente é atualizado automaticamente:

- companhia → investidor: `backed_by`
- investidor → companhia: `portfolio_company`

Para manter compatibilidade com a UI atual do Vault, investidores usam `knowledge_nodes.node_type='source'` com `tags=['investor','capital-network']` e `properties.semanticNodeType='investor'`.

## Views operacionais

### `company_headcount_history_v1`

Histórico canônico de headcount com:

- total atual;
- total anterior;
- delta;
- crescimento calculado/reportado;
- base da comparação;
- confiança e payload de origem.

### `company_people_capital_snapshot_v1`

Snapshot orientado a decisão com:

- headcount e tendência;
- vagas abertas;
- vagas estratégicas;
- composição de hiring intent;
- investidores conhecidos;
- `people_timing_score`;
- rationale textual explicável.

### `company_investor_network_v1`

Rede tabular entre companhias e investidores para uso analítico e pelo Copilot.

## Descoberta de novas companhias

A newsletter não serve apenas para enriquecer o Company Master. `scripts/capture/tech-signals-discovery.ts` identifica menções Brasil-only, deduplica contra:

1. `companies`;
2. toda a fila `discovered_company_candidates`.

Companhias novas entram na fila existente com `source_ref='src_tech_signals_latam'`. Se o candidato já existir por outra fonte, a newsletter acrescenta `newsletterLineage` sem substituir a fonte/evidência principal.

O workflow `.github/workflows/tech-signals-people-capital.yml` executa essa descoberta diariamente.

## Validação

O contrato `npm run test:people-capital` cobre:

- classificação de cargo e senioridade;
- extração JSON-LD de vagas;
- proteção contra falso fechamento de vagas;
- headcount reportado e anterior inferido;
- sindicato completo de investidores;
- isolamento entre companhias no mesmo post;
- FIDC/FIDCs;
- debt financing;
- descoberta Brasil-only e deduplicação semântica.

Antes de merge, o PR deve passar CI, typecheck, build e audit do repositório.
