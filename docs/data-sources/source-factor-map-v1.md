# Source Factor Map v1

## Objetivo

A plataforma não deve apenas acumular fontes. Ela precisa aprender quais sinais aparecem antes de:

- necessidade de funding;
- fit para FIDC;
- fit para DCM;
- aumento de urgência;
- melhora ou piora da executabilidade;
- avanço comercial, mandato, fechamento ou descarte.

Esta entrega conecta novas fontes públicas ao pipeline existente:

```text
Fonte oficial
→ public_dataset_runs / checkpoints
→ bronze_historical_records
→ public_company_records
→ monitoring_outputs
→ company_signals
→ company_factor_observations
→ company_factor_snapshots
→ qualification
→ patterns
→ lead score / ranking
→ thesis
→ pipeline / tasks
→ factor_outcome_map_v1
```

## Fontes implementadas

### 1. Receita Federal — Quadro de Sócios e Administradores (QSA)

**Dataset:** `rfb_qsa`  
**Source code:** `src_rfb_qsa_bulk`  
**Cadência:** mensal  
**Matching:** raiz CNPJ do Company Master.

Sinais produzidos:

- `ownership_structure_signal`;
- `ownership_change` para entrada ou saída entre competências.

Fatores impactados:

- mudança societária;
- visibilidade de sponsor e governança;
- timing de reorganização e novo ciclo de capital.

Tratamento de privacidade:

- CPF e documento de representante legal não são persistidos em claro;
- identificadores de pessoa física são mascarados e convertidos em fingerprint SHA-256;
- a fingerprint permite comparar competências sem reter o documento original.

### 2. CVM — Formulário de Referência (FRE)

**Dataset:** `cvm_fre_capital_structure`  
**Source code:** `src_cvm_fre_capital_structure`  
**Cadência:** semanal  
**Matching:** CNPJ do Company Master.

Seções consumidas:

- endividamento;
- obrigações;
- aumento de capital;
- redução de capital;
- posição acionária;
- distribuição de capital;
- transações com partes relacionadas.

Sinais produzidos:

- `debt_maturity_pressure`;
- `capital_structure_change`;
- `related_party_dependency`;
- `ownership_structure_signal`;
- `market_access_signal`.

Fatores impactados:

- concentração de vencimentos;
- janela de refinanciamento;
- acesso a DCM;
- mudança no ciclo de capital;
- sponsor/governança;
- risco de dependência de partes relacionadas.

## Fontes mapeadas e decisão de produto

| Fonte | Valor para originação | Decisão |
|---|---|---|
| RFB QSA | mudança societária, sponsor e governança | implementada nesta entrega |
| CVM FRE | dívida, obrigações, capital e partes relacionadas | implementada nesta entrega |
| Finep — operações contratadas e desembolsos | capex de inovação, funding público e aceleração de desembolso | próxima integração; exige parser XLSX/ODS e validação do link direto |
| PNCP contratos | recebíveis públicos, alterações e vigência | já existe no catálogo/runtime; não duplicar, evoluir eventos no conector existente |
| CVM ofertas públicas | acesso a mercado, emissões e instrumentos | já existe no catálogo/runtime; não duplicar |
| CADE atos de concentração | aquisição, mudança de controle e expansão | monitorado como oportunidade futura; API oficial exige autenticação institucional restrita |
| Novo CAGED / RAIS | expansão formal de quadro | não adotado no nível empresa enquanto não houver dado público confiável por CNPJ |

## Catálogo de fatores

O `origination_factor_catalog` separa seis dimensões:

1. `funding_need`;
2. `fidc_fit`;
3. `dcm_fit`;
4. `timing`;
5. `executability`;
6. `risk`.

Cada fator possui:

- hipótese explícita;
- direção positiva ou negativa;
- peso inicial;
- janela de decaimento;
- versão;
- status ativo.

Os pesos não são tratados como verdade definitiva. Eles são hipóteses operacionais calibráveis.

## Regras fonte → fator

`source_factor_rules` vincula cada `signal_type` a um fator. A contribuição considera:

```text
contribuição = peso-base × força do sinal × confiança da evidência
```

A contribuição decai com o tempo até um piso de 15%, evitando que um evento antigo continue dominando o ranking.

Evidências repetidas da mesma regra e fonte continuam auditáveis, mas o snapshot usa somente a evidência mais recente/forte por `factor_id + rule_id + source_code`. Isso impede que republicações do mesmo fato saturem o score.

O mapa também reaproveita sinais já existentes, incluindo:

- produto de crédito;
- recebíveis;
- funding gap;
- capital mismatch;
- expansão;
- contratação de time de crédito;
- portfólio VC;
- contratos públicos;
- financiamento público;
- dívida fiscal;
- sanções.

Assim, a entrega não cria uma lógica isolada apenas para as duas fontes novas.

## Aprendizado com resultados

A view `factor_outcome_map_v1` responde, para cada fator:

- quantas empresas exibiram o fator;
- quantas avançaram para estruturação, mandato, captação ou fechamento;
- quantas foram descartadas;
- quantas continuam ativas no pipeline;
- score médio;
- confiança média;
- taxa positiva observada entre outcomes concluídos.

Uso esperado:

1. manter pesos iniciais por hipótese financeira;
2. acumular histórico de sinais e resultados;
3. revisar mensalmente fatores com amostra suficiente;
4. aumentar peso de fatores com boa precisão;
5. reduzir ou desativar fatores sem poder preditivo;
6. nunca promover correlação fraca a regra automática sem revisão humana.

## Impacto nos motores

### Qualification

O mapa ajusta:

- structural need;
- capital score;
- receivables score;
- execution score;
- timing score;
- predicted funding need;
- urgency;
- source confidence;
- fit FIDC/DCM;
- estrutura sugerida e próxima ação.

### Pattern Engine

Novos padrões:

- `ownership_change_window`;
- `debt_maturity_refinancing_window`;
- `capital_structure_change_window`;
- `related_party_dependency_risk`.

### Lead Score e Ranking

- oportunidade aumenta score e prioridade;
- risco reduz score e pode limitar o bucket;
- ranking existente é atualizado após o lead score;
- a rationale registra oportunidade e penalidade do mapa de fatores.

### Thesis

A thesis consome os padrões persistidos e recebe ângulos explícitos:

- FIDC condicionado ao ativo;
- debênture/nota comercial para refinanciamento;
- confirmação de sponsor e ciclo de capital;
- diligência de partes relacionadas.

### Pipeline e tarefas

- pipeline recebe estrutura sugerida e próxima ação;
- risco material gera status de atenção;
- uma tarefa deduplicada é criada por empresa/ação;
- nenhuma empresa avança automaticamente para etapas irreversíveis.

## Operação

### Validação local

```bash
npm -C backend run typecheck
npm -C backend exec -- tsx --test src/modules/public-data/strategicPublicDatasetConnector.test.ts
```

### Descoberta sem persistência

```bash
cd backend
npx tsx src/cli/strategicPublicData.ts --dataset all --discover-only
```

### Execução CVM FRE

```bash
cd backend
npx tsx src/cli/strategicPublicData.ts \
  --dataset cvm_fre_capital_structure \
  --max-resources 2 \
  --max-matched-rows 100000 \
  --trigger manual \
  --full-coverage \
  --require-scan
```

### Execução RFB QSA

```bash
cd backend
npx tsx src/cli/strategicPublicData.ts \
  --dataset rfb_qsa \
  --reference 2026-07 \
  --max-resources 20 \
  --max-matched-rows 100000 \
  --trigger manual \
  --full-coverage \
  --require-scan
```

## Critérios de aceite

- fonte oficial descoberta sem URL fixa frágil quando houver índice disponível;
- somente CNPJs do Company Master são persistidos;
- QSA não retém CPF em claro;
- execução idempotente por `dataset_code + record_key`;
- checkpoint evita reprocessamento de recurso inalterado;
- outputs e sinais possuem lineage;
- fatores são versionados e explicáveis;
- qualification, patterns, lead score, ranking, thesis e pipeline recebem o impacto;
- outcome map permite medir a utilidade real dos fatores;
- testes cobrem matching, redaction, classificação e normalização.
