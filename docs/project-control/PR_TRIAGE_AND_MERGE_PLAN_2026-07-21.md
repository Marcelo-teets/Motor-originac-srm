# Motor Originação — PR Triage and Merge Plan

**Data:** 21/07/2026  
**Main:** `956382fa7b4f3cd679dcb29f8b7923652a9614f8`

## Resumo

As PRs #165 e #166 estão na `main`.

As PRs #161 e #162 foram abertas sobre uma `main` anterior. Mesmo quando o GitHub reportar `mergeable`, ambas precisam ser atualizadas e revalidadas contra o código e o schema vivos. Nenhuma deve ser forçada.

## Decisões

| PR | Decisão | Justificativa |
|---|---|---|
| #161 | Rebase, reconciliar e mergear primeiro | fecha promoção e lineage |
| #162 | Rebase após #161 | amplia fontes e discovery |
| #154 | Extrair e fechar como superseded | escopo amplo e sobreposição |
| #119 | Recriar PR mínima se contrato ainda faltar | antiga e divergente |
| #115 | Extrair backfill e qualidade em PRs separadas | ampla, antiga e com drift |
| #113 | Recriar embeddings após MVP | fora do critical path |
| #106 | Fechar/superseded | base não é main |
| #105 | Fechar/superseded | stack antiga |
| #104 | Fechar/superseded | stack antiga |
| #103 | Comparar com código atual e extrair lacunas | persistência pode estar absorvida |
| #101 | Comparar endpoint atual; fechar se absorvido | health evoluiu |
| #100 | Comparar UI atual; fechar se absorvido | Sources evoluiu |
| #98 | Conteúdo parcialmente coberto por #162 | não mergear diretamente |
| #96 | Conteúdo parcialmente absorvido | não mergear diretamente |
| #95 | Adiar até P4 | fora do critical path |
| #94 | Conteúdo parcialmente absorvido | não mergear diretamente |

## Procedimento para #161

1. Atualizar a branch com a `main`.
2. Resolver numeração de migrations.
3. Comparar migration 047 com o banco vivo.
4. Rodar testes de UUID, status, receivables e lineage.
5. Aplicar fixture isolada.
6. Promover um candidato.
7. Confirmar uma company e um discovery link.
8. Remover a fixture.
9. Rodar advisors.
10. Merge squash.

## Procedimento para #162

1. Rebase depois de #161.
2. Renumerar migrations 048–052 se houver colisão.
3. Auditar `source_catalog.metadata.code`.
4. Testar cada fonte isoladamente.
5. Confirmar silêncio em erro ou resposta vazia.
6. Executar Search Profile real.
7. Confirmar candidatos no Capture Inbox.
8. CI, build e preview.
9. Merge squash.
10. Aplicar migrations e realizar smoke em produção.

## Regra para PRs antigas

Não usar `mergeable=true` como critério suficiente.

Cada PR deve responder:

- o problema ainda existe?
- o código já foi absorvido?
- a migration conflita?
- a base é a `main`?
- o escopo é atômico?
- existe smoke atual?
- há rollback?

Sem respostas positivas, fechar como `superseded`.
