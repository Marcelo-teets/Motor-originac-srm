# Knowledge Vault V13 — Briefing para execução rastreável

## Objetivo

Fechar o ciclo entre preparação e execução comercial sem criar CRM, tabela ou motor paralelo:

```text
Company Detail
→ Briefing decisório revisado
→ nota meeting versionada
→ handoff humano
→ activity + task + pipeline existentes
→ resultado observado
→ Outcome Workbench
```

## Reuso da arquitetura oficial

A V13 reutiliza integralmente:

- `knowledge_nodes` e versões do Knowledge Vault;
- `knowledge_create_execution_action`;
- `activities`;
- `tasks`;
- `pipeline`;
- `knowledge_references`;
- `KnowledgeExecutionPanel`;
- Outcome Intelligence / Outcome Workbench.

Nenhuma nova tabela, RPC ou camada de CRM foi criada.

## Fluxo de produto

1. O usuário gera e revisa o briefing decisório.
2. A confirmação humana continua obrigatória para salvar a nota.
3. A nota é persistida como `meeting`, vinculada ao `company_id`.
4. A memória da empresa é recarregada imediatamente no Company Detail.
5. O usuário escolhe **Enviar para execução**.
6. O sistema abre um handoff editável com:
   - tipo de ação;
   - título;
   - contexto / objetivo;
   - próxima ação no pipeline;
   - prazo do próximo passo.
7. O usuário confirma a criação da ação.
8. A RPC oficial cria a activity, a task opcional, as referências e atualiza somente a próxima ação explicitamente informada.
9. O Company Detail recarrega a área de execução.
10. O resultado posterior é registrado pelo fluxo oficial de conclusão e alimenta o Outcome Workbench.

## Defaults

O handoff sugere, mas não impõe:

- `activityType = follow_up`;
- título `Preparar abordagem — <empresa>`;
- contexto ligado ao briefing revisado;
- CTA do Pre-Call ABM;
- próxima ação do ABM, Qualification ou pipeline, quando disponível.

Os campos permanecem editáveis antes da escrita.

## Guardrails

- duas ações humanas explícitas: salvar briefing e criar execução;
- nenhuma criação automática após salvar;
- chave idempotente persistida no formulário até sucesso ou cancelamento;
- retry não duplica activity, task ou referência;
- nenhum estágio é sugerido ou alterado pela V13;
- prazo é rotulado como prazo do próximo passo, não como data presumida da reunião;
- `score`, `qualification`, `patterns`, `ranking` e pesos não são alterados;
- o trigger oficial de elegibilidade de empresa continua soberano;
- empresas mock, sintéticas ou não aprovadas continuam bloqueadas para novas escritas de pipeline;
- fato, inferência e lacuna permanecem separados no briefing original;
- o resultado real continua sendo capturado somente após confirmação humana.

## Atualização da interface

Arquivos:

```text
frontend/src/pages/CompanyDetailKnowledgePage.tsx
frontend/src/components/CompanyDecisionBriefPanel.tsx
frontend/src/styles/company-decision-brief.css
```

O Company Detail usa uma revisão local para remontar o painel de memória/execução após:

- salvamento do briefing;
- criação da ação rastreável.

Isso atualiza a tela sem reload completo e preserva o contexto do usuário.

## Smoke transacional no Supabase real

Projeto:

```text
hdghpmssudrqhsbvrdyt
```

### Prova do guardrail

A tentativa inicial com a empresa demonstrativa Educa Capital foi bloqueada por:

```text
company ... is not eligible for pipeline
```

A transação foi revertida. O bloqueio confirma que a V13 não contorna o gate do Company Master.

### Prova controlada de execução

Dentro de uma única transação de smoke, a metadata da empresa demonstrativa foi temporariamente ajustada para satisfazer o gate; nenhuma alteração foi commitada.

O teste confirmou:

```text
node meeting: 1
activity: 1
task: 1
activity reference: 1
task reference: 1
pipeline stage: preservado em Qualified
pipeline next action: atualizado somente com valor explícito
```

A mesma chamada repetida com a mesma chave de idempotência retornou o mesmo workspace e manteve:

```text
activity: 1
task: 1
references: 1 + 1
```

Após rollback:

```text
node residues: 0
activity residues: 0
task residues: 0
company metadata: novamente mock / synthetic / decision_eligible=false
```

## Critérios de aceite

- [x] briefing continua versionado e human-reviewed;
- [x] handoff exige clique separado;
- [x] campos de execução editáveis;
- [x] nenhum target stage automático;
- [x] idempotência reaproveitada;
- [x] CRM oficial reutilizado;
- [x] painel recarregado sem refresh completo;
- [x] guardrail de elegibilidade comprovado;
- [x] smoke atômico com repetição idempotente;
- [x] rollback com zero resíduos;
- [ ] CI frontend, serverless e build;
- [ ] merge na `main`;
- [ ] rollout Vercel após liberação da quota diária.
