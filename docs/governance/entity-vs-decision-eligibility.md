# Entity Eligibility vs Decision Eligibility

## Regra

Uma empresa pode ser uma entidade real, verificável e monitorável sem estar pronta para qualification, score, ranking ou pipeline.

## Entity eligible

Requisitos:

- `data_status = real`;
- identidade revisada e aprovada;
- CNPJ e domínio reconciliados;
- não sintética;
- não excluída de entity resolution.

Permite:

- Company Master;
- entity resolution;
- monitoring;
- enrichment;
- lineage e source governance.

## Decision eligible

Além dos requisitos de entidade, exige:

- revisão de produto de crédito;
- evidência de recebíveis;
- avaliação de funding e estrutura de capital;
- revisão de fit FIDC/DCM;
- liberação explícita de qualification e scoring.

Permite:

- qualification snapshots;
- patterns;
- score e lead score;
- thesis;
- ranking;
- pipeline, atividades e tarefas decisórias.

## Creditas

Estado atual após revisão de identidade:

- entidade real: sim;
- monitoring eligible: sim;
- decision eligible: não;
- qualification status: `pending_evidence`;
- credit classification status: `not_reviewed`;
- campos de crédito e fit: não ativados.

## Proteção de produção

Em modo Supabase, o runtime:

- filtra monitoring por `monitoringEligible`;
- filtra qualification, score, ranking, thesis e listagem de leads por `decisionEligible`;
- filtra pipeline, atividades e tarefas pelo mesmo gate;
- preserva snapshots sintéticos apenas para auditoria;
- mantém o fallback demonstrativo somente no modo memória local.

## Validação final

- branch sincronizada com a `main` corrente;
- Company Master: 1 entidade real e 0 empresas decisoriamente elegíveis;
- gate de Dashboard/Leads/Pipeline fechado;
- Creditas liberada apenas para monitoring e enrichment;
- CI e Preview obrigatórios antes do merge.
