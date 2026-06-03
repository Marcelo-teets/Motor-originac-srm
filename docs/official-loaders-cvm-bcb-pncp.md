# Official Loaders v1 — CVM FIDC, BCB IFData e PNCP

## Objetivo

Adicionar loaders oficiais, públicos e rastreáveis ao runtime de captura do Motor Originação, mantendo a stack oficial:

- React + Vite
- Node + TypeScript
- Supabase
- Vercel
- GitHub como fonte de código

Esta PR depende da infraestrutura de fontes da PR #96.

## Fontes cobertas

### CVM FIDC Informes Mensais

Fonte oficial usada pelo loader:

`https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_{ano}.csv`

Uso no produto:

- detectar possível presença de CNPJ em informe mensal de FIDC;
- gerar sinal `has_fidc_or_fidc_exposure` quando houver match;
- enriquecer a empresa com `cvm_fidc_dataset_check`.

### BCB IFData

Fonte oficial usada pelo loader:

`https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/IfDataCadastro`

Uso no produto:

- checar se a raiz de CNPJ aparece no cadastro IFData;
- gerar sinal `regulated_financial_institution_signal` quando houver match;
- enriquecer a empresa com `bcb_ifdata_check`.

### PNCP Contratos Públicos

Fonte oficial usada pelo loader:

`https://pncp.gov.br/api/consulta/v1/contratos`

Uso no produto:

- consultar contratos por CNPJ em janela de 12 meses;
- gerar sinal `public_contract_receivables` quando houver contratos;
- enriquecer a empresa com `pncp_contracts_check`.

## Arquivos alterados

- `backend/src/modules/data-capture/officialLoaders.ts`
- `backend/src/modules/data-capture/dataCaptureEngine.ts`

## Como entra no pipeline

```text
Sources
→ Official Loaders
→ Monitoring Outputs
→ Company Signals
→ Enrichments
→ Treatment
→ Qualification
→ Patterns
→ Scores
→ Ranking
→ Pipeline
```

## Critério de aceite

1. Rodar `/api/data-capture/run` com `CRON_SECRET` configurado.
2. Conferir `monitoring_outputs` com registros dos source ids oficiais:
   - `src_cvm_fidc_informe_mensal`
   - `src_bcb_ifdata`
   - `src_pncp_contracts`
3. Conferir `company_signals` quando houver match real:
   - `has_fidc_or_fidc_exposure`
   - `regulated_financial_institution_signal`
   - `public_contract_receivables`
4. Conferir `enrichments`:
   - `cvm_fidc_dataset_check`
   - `bcb_ifdata_check`
   - `pncp_contracts_check`

## Observações de produção

- O loader é defensivo: falhas de fonte viram output parcial com erro no payload, não derrubam o runtime.
- A busca CVM atual faz match por CNPJ no CSV anual corrente. Próxima evolução: baixar ZIP/CSV por competência e materializar tabela auxiliar de FIDC para consultas mais rápidas.
- A busca PNCP usa CNPJ e janela de 12 meses. Próxima evolução: varrer atas e PCA, além de contratos.
- A busca BCB IFData usa raiz de CNPJ. Próxima evolução: complementar com `IfDataValores` para métricas de carteira, ativos e funding quando aplicável.
