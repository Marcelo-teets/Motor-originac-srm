# Knowledge Vault V14 — Outcome estruturado da decisão

## Objetivo

Fechar o ciclo operacional no mesmo painel do Company Detail:

```text
Evidência
→ tese
→ briefing decisório
→ decisão humana
→ activity + task + pipeline
→ outcome observado
→ follow-up
→ Outcome Workbench
```

A V14 não cria um sistema paralelo. Ela reutiliza a conclusão oficial da execução do Knowledge Vault.

## Lacuna anterior

A V13 ativava o briefing no CRM e mostrava a ação aberta, mas o usuário precisava sair do painel para registrar o resultado.

Isso criava risco de:

- activity permanecer aberta apesar de reunião ou diligência concluída;
- task antiga não ser fechada;
- resultado permanecer em texto informal fora do lineage;
- próxima ação não ser atualizada;
- facts e gaps serem misturados;
- Outcome Workbench não receber o resultado observado.

## Implementação

Arquivo principal:

```text
frontend/src/components/CompanyDecisionActivationPanel.tsx
```

Quando o briefing mais recente possui uma execução aberta, o painel troca o formulário de ativação por um formulário de outcome.

### Campos

- classificação do resultado:
  - avanço;
  - positivo;
  - negativo;
  - bloqueado;
  - sem mudança material;
- resultado observado;
- fatos confirmados;
- lacunas remanescentes;
- próxima ação opcional;
- prazo do próximo passo;
- estágio solicitado explícito;
- confirmação humana.

### Persistência

A conclusão usa:

```text
knowledge_complete_execution_action
```

A RPC oficial:

- conclui a activity;
- fecha a task original;
- preserva outcome e status na metadata;
- atualiza a referência da activity;
- atualiza o pipeline somente quando solicitado;
- cria follow-up opcional;
- cria referência para o follow-up;
- usa advisory lock e idempotência;
- retorna o workspace atualizado.

## Estrutura do texto persistido

O campo `outcome` é composto de forma auditável:

```text
Resultado observado: ...

Fatos confirmados: ...

Lacunas remanescentes: ...

Briefing-base: ...

Ação de origem: ...

Guardrail: outcome operacional não altera motores de decisão.
```

Campos vazios de fatos ou lacunas não são fabricados.

## Governança

- outcome observado obrigatório;
- confirmação humana obrigatória;
- chave de idempotência permanece estável durante retries;
- uma activity concluída não pode ser sobrescrita por nova chamada;
- classificação operacional não recalcula qualification, patterns, lead score ou ranking;
- estágio é opcional e explicitamente selecionado;
- movimentos regressivos continuam bloqueados na interface;
- `ClosedLost` e `Recycled` permanecem decisões explícitas;
- próxima ação vazia não cria follow-up artificial;
- fatos confirmados e lacunas são separados no registro;
- o trigger de elegibilidade do Company Master continua soberano.

## Smoke transacional no Supabase real

Projeto:

```text
hdghpmssudrqhsbvrdyt
```

O teste criou, dentro de uma transação revertida:

1. briefing `meeting`;
2. decisão de avançar diligência;
3. activity e task;
4. outcome `progress`;
5. fatos confirmados;
6. lacunas remanescentes;
7. próxima ação;
8. solicitação explícita de estágio `Structuring`.

### Resultado

```text
activity status: done
execution status: done
outcome status: progress
outcome estruturado preservado: true
completion idempotency key: preservada
original task done: 1
follow-up task: 1
follow-up reference: 1
pipeline stage: Structuring
pipeline next action: Preparar data request de carteira e endividamento
```

A mesma conclusão foi chamada novamente com a mesma chave e texto divergente. O primeiro outcome permaneceu soberano e nenhum follow-up adicional foi criado.

### Rollback

```text
node residues: 0
activity residues: 0
follow-up task residues: 0
company metadata: novamente mock / synthetic / decision_eligible=false
```

## Critérios de aceite

- [x] outcome no mesmo painel da decisão;
- [x] fatos e lacunas separados;
- [x] confirmação humana;
- [x] estágio somente explícito;
- [x] activity concluída;
- [x] task original fechada;
- [x] follow-up opcional;
- [x] idempotência comprovada;
- [x] primeiro resultado não sobrescrito;
- [x] lineage preservado;
- [x] zero resíduos após rollback;
- [ ] CI completo;
- [ ] merge na `main`;
- [ ] rollout Vercel após liberação de quota.
