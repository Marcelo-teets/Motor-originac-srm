# Knowledge Vault V11 — Evidências no Company Detail

## Objetivo

Levar a recuperação institucional do Knowledge Vault para o ponto de decisão da empresa, sem transformar relevância de busca em score ou fato confirmado.

## Fluxo

```text
Company Detail
→ usuário escolhe uma lente financeira
→ consulta restrita ao company_id
→ knowledge-hybrid-search
→ resultados com fonte + registro + natureza + lineage
→ revisão humana
→ salvar mapa como tese no Vault, opcional
```

## Lentes

- Funding gap;
- Recebíveis / FIDC;
- Estrutura de capital;
- Por que agora?.

A consulta combina a lente escolhida com o contexto já existente de qualification:

- estrutura sugerida;
- funding gap;
- fit para FIDC;
- fit para DCM.

## Guardrails

- nenhuma busca automática ao abrir a empresa;
- custo semântico somente após ação explícita;
- company scope obrigatório;
- fallback lexical identificado;
- nenhum embedding sintético;
- nenhuma alteração de qualification, patterns, lead score, ranking ou pipeline;
- criação de tese somente após confirmação humana;
- evidências salvas com consulta, modo, modelo, dimensão, data e lineage.

## Produto

O Company Detail passa a oferecer:

- quatro lentes de decisão;
- métricas do corpus da empresa;
- modo híbrido ou lexical;
- resultados ordenados por RRF;
- fonte, tipo de sinal e natureza observada/inferida;
- criação de um mapa de evidências em Markdown;
- link para o Knowledge Vault.

## Validação real

Smoke autenticado com rollback para Educa Capital:

```text
company_id: a6000000-0000-0000-0000-000000000006
corpus company-scoped: 524 documentos
embedded: 53
resultados: 6
primeiro resultado: funding_gap_signal
fonte: company_signals
natureza: observed
lineage: preservado
```

A criação da tese retornou:

- node type `thesis`;
- visibility `team`;
- tags de contexto;
- versão 1;
- company_id correto;
- metadata `syntheticEmbedding=false`.

A transação foi revertida e nenhum dado de teste permaneceu.

## Critérios de aceite

- [x] painel integrado ao Company Detail;
- [x] busca company-scoped;
- [x] lentes financeiras aderentes à originação;
- [x] human in the loop;
- [x] criação opcional de tese auditável;
- [x] smoke real com rollback;
- [ ] CI da PR;
- [ ] merge na main;
- [ ] rollout Vercel após disponibilidade de capacidade de build.
