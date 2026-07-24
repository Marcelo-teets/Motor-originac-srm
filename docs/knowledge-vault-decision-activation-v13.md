# Knowledge Vault V13 — Briefing para execução

## Objetivo

Eliminar a ruptura entre preparar o briefing decisório e executar a próxima ação comercial.

A V13 transforma uma nota `meeting` validada e versionada em uma ação rastreável no CRM existente, reaproveitando as RPCs do Knowledge Vault e as tabelas reais de `activities`, `tasks` e `pipeline`.

## Fluxo

1. O usuário gera e revisa o briefing company-scoped.
2. O briefing é salvo no Vault com confirmação humana.
3. A V13 identifica a versão mais recente vinculada à empresa.
4. O usuário escolhe uma decisão estruturada.
5. O racional humano, a próxima ação e o prazo são obrigatórios.
6. Uma confirmação explícita autoriza a ativação.
7. O sistema cria activity, task e próxima ação, registrando o estágio solicitado e o estágio efetivo.
8. O outcome continua sendo registrado no painel de execução já existente.

## Decisões suportadas

- avançar diligência;
- estruturar alternativa FIDC;
- estruturar alternativa DCM;
- manter em monitoramento;
- reciclar oportunidade;
- não faz sentido.

Cada decisão possui um objetivo operacional e uma próxima ação padrão, mas o usuário pode editar a ação antes da ativação.

## Guardrails

- somente briefing salvo e versionado pode sustentar a execução;
- nenhuma ação é criada sem racional humano;
- nenhuma ação é criada sem confirmação explícita;
- um briefing com ação aberta não pode ser ativado novamente até o registro do outcome;
- movimentos regressivos de pipeline são bloqueados no frontend;
- `ClosedLost` e `Recycled` permanecem decisões humanas explícitas;
- a RPC registra solicitado versus efetivo e mantém lineage;
- a ativação não recalcula qualification, patterns, score ou ranking;
- a funcionalidade não cria stack, pipeline ou task engine paralelos.

## Resultado esperado

O Company Detail passa a fechar o ciclo:

`evidência → tese → briefing → decisão humana → activity → task → pipeline → outcome`

Isso reduz retrabalho, preserva contexto e transforma memória institucional em execução comercial mensurável.

## Validação

- frontend typecheck;
- frontend build;
- identificação do briefing company-scoped mais recente;
- bloqueio sem briefing salvo;
- bloqueio sem racional e confirmação;
- bloqueio quando já existe ação aberta;
- criação via `knowledge_create_execution_action`;
- exibição do estágio efetivo, task e próxima ação após os guardrails.
