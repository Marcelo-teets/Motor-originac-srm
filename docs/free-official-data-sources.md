# Fontes públicas gratuitas — implementação

## Objetivo

Expandir a Origination Intelligence Platform com fontes gratuitas, rastreáveis e úteis para descoberta, qualification, patterns, ranking e tese de crédito, sem criar stack paralela.

## Regra de arquitetura

- React + Vite permanece como frontend.
- Node + TypeScript permanece como backend e camada de conectores.
- Supabase permanece como catálogo, staging, histórico e persistência.
- Vercel executa apenas consultas leves por empresa.
- GitHub Actions/Paperclip deve executar loaders nacionais pesados com streaming.
- Nenhum dataset nacional grande deve ser baixado dentro de uma request serverless.

## Estado após esta entrega

### Ativos no monitoramento por empresa

| Código | Fonte | Saída |
|---|---|---|
| `src_wayback_company_history` | Wayback CDX | `monitoring_outputs` para comparação histórica |
| `src_common_crawl_company_history` | Common Crawl Index | `monitoring_outputs` para comparação histórica |
| `src_github_public_api` | GitHub REST pública | `monitoring_outputs` + `technical_product_signal` |

Os conectores leves:

1. respeitam o `source_catalog`;
2. têm timeout;
3. degradam para `partial` sem derrubar o monitoring;
4. preservam URL, horário, código da fonte e confiança;
5. não transformam ausência de resultado em sinal positivo;
6. usam token gratuito do GitHub apenas quando já estiver disponível, sem torná-lo obrigatório.

### Registrados para ingestão em lote

| Código | Fonte | Frequência-alvo | Chave principal |
|---|---|---:|---|
| `src_rfb_cnpj_bulk` | Receita Federal CNPJ | mensal | CNPJ |
| `src_pgfn_divida_ativa_bulk` | PGFN dívida ativa | trimestral | CNPJ |
| `src_bndes_financing_operations` | BNDES operações | mensal | CNPJ |
| `src_cgu_transparencia_bulk` | CGU / Transparência | diária/mensal | CNPJ |
| `src_compras_gov_contracts` | Compras.gov | diária | CNPJ |
| `src_consumidor_gov_open_data` | Consumidor.gov | periódica | nome normalizado |
| `src_inlabs_dou_xml` | DOU / INLABS | diária | CNPJ/nome |
| `src_inpi_ip_open_data` | INPI / BADEPI | anual/periódica | titular normalizado |
| `src_bcb_ifdata` | BCB IF.data | trimestral | instituição regulada |
| `src_bcb_complaints_ranking` | BCB reclamações | periódica | instituição regulada |
| `src_bcb_pix_participants` | Participantes Pix | periódica | CNPJ/nome |
| `src_transferegov_public_api` | Transferegov | diária | CNPJ |
| `src_datajud_public_api` | DataJud | por evento | número do processo |
| `src_comexstat_open_data` | ComexStat | mensal | setor/município |

`partial` significa que a fonte é válida e gratuita, mas o loader nacional ainda não deve ser tratado como produção completa. O status muda para `real` somente depois de persistência, idempotência e smoke test.

## Fluxo dos datasets pesados

```text
GitHub Actions / Paperclip
        ↓
descoberta do snapshot oficial
        ↓
download streaming + checksum
        ↓
Supabase Storage / raw manifest
        ↓
staging por fonte
        ↓
normalização de CNPJ e entidade
        ↓
comparação com snapshot anterior
        ↓
monitoring_outputs
        ↓
company_signals
        ↓
qualification → patterns → score → ranking
```

## Guardrails por fonte

### Receita Federal

A base completa deve alimentar descoberta e entity resolution. O simples fato de uma empresa existir não altera score. Somente mudança de situação, capital, CNAE, matriz/filial ou estrutura societária gera trigger.

### PGFN

Dívida ativa não reprova automaticamente. O tratamento precisa considerar valor, idade, situação, garantia, suspensão e negociação.

### BNDES

Usar para histórico de funding, prazo, carência, instrumento, comparáveis e janela de refinanciamento. Não assumir necessidade atual apenas porque houve operação histórica.

### CGU e Compras.gov

Separar duas famílias:

- compliance/sanções;
- contratos, pagamentos e recebíveis públicos.

Uma mesma empresa pode ter oportunidade de recebíveis e risco de compliance; os sinais não podem ser consolidados em um único campo.

### Consumidor.gov e BCB reclamações

Usar tendência e denominador. A ausência da empresa na base não representa boa qualidade.

### DOU e DataJud

Exigem validação de identidade, papel da parte, materialidade e status. DataJud deve atualizar processos conhecidos, não ser apresentado como busca completa por CNPJ.

### Wayback e Common Crawl

A existência de snapshots é apenas um gatilho para comparação. Quantidade de capturas não prova expansão e, por isso, esses conectores não geram sinal de score sem um diff real de conteúdo.

### ComexStat

É contexto setorial. Só gerar sinal empresarial forte quando houver outra evidência vinculando a companhia a exportações ou recebíveis internacionais.

## Arquivos alterados

- `config/source-seeds.ts`
- `backend/src/lib/connectors.ts`
- `backend/src/lib/connectors/freeOfficialDataSources.ts`
- `backend/src/lib/connectors/freeOfficialDataSources.test.ts`
- `db/migrations/054_free_official_data_sources.sql`

## Validação

```bash
npm -C backend run typecheck
npm -C backend test
npm run build
```

Depois do deploy e da migration:

1. consultar `source_catalog` pelos novos `metadata.code`;
2. rodar monitoring para uma empresa com domínio válido;
3. confirmar outputs de Wayback, Common Crawl e GitHub;
4. confirmar que falha externa vira `connectorStatus = partial` sem erro 500;
5. recalcular qualification e patterns;
6. validar rastreabilidade em `evidence_payload.sourceUrl`;
7. manter loaders pesados desativados até o respectivo smoke test.

## Próximo lote de engenharia

1. loader RFB + entity resolution de matriz/filiais;
2. loader PGFN com agregação por CNPJ e situação;
3. loader BNDES via CKAN;
4. CGU/Compras.gov com separação compliance versus recebíveis;
5. Consumidor.gov e BCB reclamações com séries temporais;
6. DOU/INPI/IF.data/Pix/Transferegov;
7. DataJud somente a partir de processos previamente identificados;
8. ComexStat como feature contextual de setor.
