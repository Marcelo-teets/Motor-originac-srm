# Non-obvious data sources · capture + treatment

## Objetivo

Expandir o radar de originação para além das fontes óbvias de notícias e portfólios, mantendo o projeto Brasil-only, público/monitorável e sem stack paralela.

A entrega desta frente ativa cinco camadas:

1. **Mapeamento** de fontes públicas e nichadas com tese de originação.
2. **Captura viável agora** usando o runtime existente de `source_catalog` + `rss/queryTemplate`.
3. **Tratamento** em `source_treatment_rules` e no `connectors.ts`, convertendo texto capturado em `company_signals` com tipo e força adequados.
4. **Impacto em qualification + patterns** via `backend/src/lib/sourceTreatment.ts`, `qualification.ts` e `patterns.ts`.
5. **Auditoria SQL** via views de impacto por sinal, empresa e fonte.

## O que foi ativado agora

As fontes abaixo entram como `status = real` porque já podem rodar pelo motor atual de RSS parametrizado. Quando houver API oficial/contrato/autorização, elas podem ganhar conector dedicado sem quebrar a lógica atual.

| Fonte | Código | Por que importa financeiramente | Captura atual | Tratamento |
|---|---|---|---|---|
| PNCP / contratos públicos | `src_pncp_public_contracts_rss` | Contratos, empenhos e receitas contratadas podem virar recebíveis estruturáveis. | Google News RSS com dork PNCP/contrato/empenho. | `public_contract_receivables` |
| DOU / eventos regulatórios | `src_dou_corporate_events_rss` | Credenciamento, autorização, homologação ou contrato pode mudar timing de abordagem. | RSS dork DOU/portaria/autorização. | `regulatory_event` |
| CEIS/CNEP / sanções | `src_gov_sanctions_rss` | Red flag de compliance reduz executabilidade. | RSS dork Portal da Transparência/sanção. | `legal_compliance_risk` |
| PGFN / dívida ativa | `src_pgfn_fiscal_stress_rss` | Dívida fiscal pode indicar pressão de caixa e restrição de crédito. | RSS dork PGFN/dívida ativa. | `fiscal_stress` |
| CENPROT / protestos | `src_cenprot_protest_rss` | Protesto é sinal de liquidez fraca. | RSS dork protesto/CENPROT. | `liquidity_stress` |
| Recuperação judicial/falência | `src_judicial_recovery_rss` | Red flag severa ou oportunidade distressed. | RSS dork RJ/falência/execução. | `judicial_stress` |
| Reclame Aqui / qualidade de demanda | `src_reclame_aqui_demand_quality_rss` | Chargeback, cancelamento e reclamação afetam qualidade de recebíveis. | RSS dork Reclame Aqui/chargeback/cancelamento. | `demand_quality_risk` |
| Termos/FAQ de produto de crédito | `src_terms_credit_product_rss` | Produto de crédito muitas vezes aparece primeiro em termos e políticas. | RSS dork `site:{websiteDomain}` + termos/crédito/parcelamento. | `product_credit_terms` |
| Vagas de crédito/risco/cobrança | `src_jobs_credit_hiring_rss` | Montagem de time indica produto financeiro, cobrança ou funding pressure. | RSS dork vagas/crédito/underwriting/cobrança. | `credit_team_hiring` |
| Portfólio VC / rodada | `src_vc_portfolio_change_rss` | Rodada/portfólio muda estágio, crescimento e necessidade de funding. | RSS dork portfólio/investida/venture. | `vc_portfolio_signal` |
| Open Finance / infraestrutura financeira | `src_open_finance_participants_rss` | Entrada em infraestrutura financeira sinaliza embedded finance. | RSS dork Open Finance/IP/Bacen. | `financial_infrastructure_signal` |
| GitHub / superfície técnica | `src_github_product_signal_rss` | APIs e SDKs expõem produto financeiro antes do anúncio comercial. | RSS dork GitHub/API/checkout/pix/boleto. | `technical_product_signal` |
| YouTube/webinars | `src_youtube_webinar_signal_rss` | Educação de mercado revela narrativa comercial e produto. | RSS dork YouTube/webinar/crédito/recebíveis. | `market_education_signal` |
| BNDES / financiamento público | `src_bndes_financing_rss` | Histórico de financiamento público ajuda a ler estrutura de capital. | RSS dork BNDES/operação/capital de giro. | `public_financing_signal` |
| ComexStat / exportação | `src_comexstat_exporter_rss` | Exportação pode indicar recebíveis internacionais e necessidade de working capital. | RSS dork ComexStat/exportação/câmbio. | `international_receivables_signal` |
| INPI / expansão de produto | `src_inpi_ip_signal_rss` | Registro de marca/patente pode antecipar expansão. | RSS dork INPI/marca/patente/software. | `product_expansion_signal` |

## Como a captura funciona

1. A migration `029_non_obvious_sources_capture_treatment.sql` insere fontes no `source_catalog` com `source_type = rss`, `status = real` e `metadata.queryTemplate`.
2. O runtime em `backend/src/lib/connectors.ts` lê fontes RSS parametrizadas.
3. O runtime resolve `{website}` e `{websiteDomain}` para permitir dorks em domínio próprio da empresa.
4. Para cada empresa, o motor gera URL de Google News RSS a partir do template.
5. Os itens capturados viram `monitoring_outputs`.
6. Os dois primeiros itens de cada fonte viram `company_signals`.
7. A classificação do sinal reconhece classes não óbvias como contrato público, stress fiscal, judicial, protesto, termos de crédito, vagas de risco e infraestrutura financeira.

## Como o tratamento impacta o produto

### Qualification

`backend/src/lib/sourceTreatment.ts` calcula, por empresa:

- `structuralScoreDelta`
- `timingScoreDelta`
- `executabilityScoreDelta`
- `totalTreatmentDelta`
- `signalTypes`
- `signalFamilies`
- `patternTags`
- `riskSignals`
- `positiveSignals`
- `nextActions`

`backend/src/lib/qualification.ts` aplica esses deltas antes da ponderação final:

- sinais como `public_contract_receivables`, `product_credit_terms`, `financial_infrastructure_signal` e `international_receivables_signal` sobem estrutura/timing;
- sinais como `legal_compliance_risk`, `fiscal_stress`, `liquidity_stress`, `judicial_stress` e `demand_quality_risk` reduzem executabilidade;
- o impacto fica auditável em `qualification.evidence_payload.sourceTreatmentImpact`.

### Pattern Engine

`backend/src/lib/patterns.ts` agora usa `sourceTreatmentImpact.patternTags` para ativar os 10 padrões do catálogo:

- Growth without structured funding
- Credit product without dedicated capital structure
- Strong receivables base with weak funding architecture
- Expansion outpacing capital structure
- Embedded finance with implicit balance-sheet pressure
- Sophisticated credit narrative, immature funding stack
- Operational maturity signals without capital market readiness yet
- Funding dependence hidden in commercial narrative
- Capital mismatch for business model
- Momentum + timing + structural gap

Isso faz as novas fontes alimentarem `company_patterns`, `lead_score_snapshots` e ranking.

### Auditoria SQL

A migration `030_source_treatment_impact_views.sql` cria três views:

| View | Uso |
|---|---|
| `company_signal_treatment_impact_v` | Auditoria sinal a sinal: fonte, tipo, força, regra, deltas aplicados e URL de evidência. |
| `company_treatment_score_impact_v` | Consolidação por empresa: deltas totais, tags, tipos de sinal e próximas ações. |
| `company_treatment_source_breakdown_v` | Quebra por empresa/fonte/tipo de sinal para diagnóstico de origem. |

## Como tratar operacionalmente

### Sinal positivo de estruturação

Usar como gatilho de abordagem quando o sinal for:

- `public_contract_receivables`
- `product_credit_terms`
- `financial_infrastructure_signal`
- `credit_team_hiring`
- `vc_portfolio_signal`
- `international_receivables_signal`

Ação recomendada: criar ou subir prioridade no ranking, pedir validação humana e gerar tese preliminar de FIDC/DCM.

### Sinal de risco

Usar como trava ou alerta quando o sinal for:

- `judicial_stress`
- `legal_compliance_risk`
- `liquidity_stress`
- `fiscal_stress`
- `demand_quality_risk`

Ação recomendada: não descartar automaticamente. Classificar como risco de executabilidade e exigir validação antes de abordagem.

### Sinal fraco de timing

Usar como reforço quando o sinal for:

- `regulatory_event`
- `market_education_signal`
- `technical_product_signal`
- `product_expansion_signal`

Ação recomendada: cruzar com site da empresa, notícias, VC e dados cadastrais antes de alterar score de forma forte.

## Validação esperada

Depois do merge e aplicação das migrations:

1. Rodar `POST /monitoring/run` para capturar outputs.
2. Rodar `POST /companies/:id/qualification/recalculate` para uma empresa específica.
3. Conferir `GET /companies/:id/qualification` e validar `evidence_payload.sourceTreatmentImpact`.
4. Conferir `GET /companies/:id/patterns` e validar padrões acionados pelos novos sinais.
5. Consultar `company_treatment_score_impact_v` no Supabase para auditar deltas por empresa.
6. Conferir ranking/top leads para confirmar que empresas com sinais positivos subiram e empresas com red flags perderam executabilidade.

## Guardrails

- Não fazer scraping pesado de tribunal, Reclame Aqui, CENPROT ou DOU.
- Usar API oficial quando houver contrato, chave, autorização ou documentação suficiente.
- Preservar `evidencePayload.sourceUrl`, `sourceCode`, `sourceName`, `timestamp` e `treatmentRule` em todo sinal.
- Sinal público fraco não deve sozinho derrubar ou aprovar lead.
- Toda inferência deve continuar marcada como evidência operacional, não como verdade definitiva.
