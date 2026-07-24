# Knowledge Vault V8 — Outcome Workbench

## Objetivo

Transformar a fila criada na V7 em uma rotina diária priorizada para registrar resultados comerciais reais.

A V8 responde:

1. qual resultado deve ser confirmado primeiro;
2. por que esse item está acima dos demais;
3. qual contexto oficial sustenta essa prioridade;
4. como registrar o fato, atualizar pipeline e criar o próximo passo em uma única operação;
5. como preservar a distinção entre contexto capturado e contexto histórico reconstruído.

A implementação não cria outcomes sintéticos e não altera automaticamente lead score, qualification, patterns, ranking, estágio ou pesos dos motores.

## Fluxo operacional

```text
activities / tasks / pipeline
        ↓
knowledge_outcome_operations
        ↓
prioridade operacional explicável
        ↓
Fila do dia
        ↓
confirmação humana do resultado
        ↓
knowledge_capture_existing_activity_outcome
        ↓
nota + references + activity + task + pipeline
        ↓
Outcome Intelligence observacional
```

## Migration

Arquivo:

```text
db/migrations/094_knowledge_outcome_workbench.sql
```

Aplicada no projeto oficial:

```text
hdghpmssudrqhsbvrdyt
```

## Priorização operacional

A RPC `knowledge_outcome_operations` foi ampliada para cruzar:

- estágio do pipeline;
- prioridade do pipeline;
- lead score mais recente;
- qualification score mais recente;
- urgency score;
- predicted funding need score;
- tipo da atividade;
- tarefas abertas;
- tarefas vencidas;
- idade da atividade;
- estrutura esperada.

O resultado é uma ordenação operacional de `0` a `100` com:

- `priorityScore`;
- `priorityBand`;
- `priorityReasons`;
- `suggestedHandling`.

Faixas:

| Faixa | Regra | Uso |
|---|---:|---|
| `immediate` | ≥ 80 | confirmar o resultado agora |
| `high` | 65–79 | trabalhar na fila diária |
| `review` | 45–64 | revisar contexto antes de instrumentar |
| `low` | < 45 | manter fora do foco imediato |

### Guardrail

O score da fila não é um novo lead score.

Ele serve apenas para ordenar trabalho humano e nunca escreve em:

- `lead_score_snapshots`;
- `qualification_snapshots`;
- `company_patterns`;
- `company_factor_snapshots`;
- `ranking`;
- pesos de modelo;
- estágio do pipeline.

## Fila do dia

A aba **Fila do dia** reúne:

1. ações já instrumentadas e aguardando resultado;
2. atividades históricas nas bandas `immediate` ou `high`;
3. tarefas vencidas que ainda não são tarefas de outcome.

A summary da RPC expõe:

- `dailyQueueItems`;
- `immediateCandidates`;
- `highPriorityCandidates`;
- `pendingOutcomes`;
- `overdueTasks`;
- `dueSoonTasks`;
- `stalePipelines`;
- `adoptionCandidates`.

## Captura direta de resultado

Nova RPC:

```text
knowledge_capture_existing_activity_outcome
```

A operação é atômica:

1. bloqueia concorrência por activity com advisory lock;
2. valida autenticação e chaves de idempotência;
3. carrega e bloqueia a activity;
4. reutiliza uma conclusão existente quando aplicável;
5. instrumenta a atividade histórica caso ainda não esteja no Vault;
6. preserva `contextMode = reconstructed_at_adoption`;
7. registra o outcome confirmado pelo usuário;
8. conclui a tarefa de tracking;
9. cria follow-up quando o usuário informa próxima ação;
10. atualiza estágio, próxima ação e prazo somente quando informados explicitamente;
11. devolve workspace e fila atualizados.

Campos exigidos ao usuário:

- classificação do resultado;
- descrição factual do que aconteceu.

Campos opcionais e explícitos:

- próxima ação;
- prazo;
- estágio solicitado.

O banco não infere nenhum desses campos.

## Estados de resultado

- `progress`;
- `won`;
- `lost`;
- `blocked`;
- `no_change`.

A definição de win rate permanece:

```text
won / (won + lost)
```

`progress`, `blocked`, `no_change` e ações abertas ficam fora do denominador terminal.

## Produto

Rota:

```text
/outcome-operations
```

A tela passou a se chamar **Outcome Workbench** e inclui:

- métricas da fila diária;
- score operacional e faixa de prioridade;
- razões explicáveis da prioridade;
- scores oficiais usados apenas como contexto;
- captura inline de resultado;
- botão alternativo para somente instrumentar;
- atualização imediata do painel Outcome Intelligence após uma conclusão;
- links para Company Detail quando é necessária análise mais profunda.

## Estado real na implantação

Na janela de 365 dias:

- 13 atividades históricas elegíveis;
- 1 atividade em prioridade imediata;
- 9 atividades em prioridade imediata ou alta;
- 6 tarefas vencidas;
- 8 tarefas nos próximos sete dias;
- 15 itens na fila diária;
- nenhum outcome sintético;
- nenhuma atividade instrumentada automaticamente.

O primeiro item observado foi:

```text
Educa Capital — Proposta de reunião técnica enviada
priorityScore = 86
priorityBand = immediate
```

Razões retornadas:

- pipeline em alta prioridade;
- necessidade de funding elevada;
- urgência relevante;
- lead score elevado;
- tarefa vencida;
- atividade histórica fora do aprendizado.

## Smoke autenticado com rollback

Atividade:

```text
fbecdbbf-32cf-4344-8658-c128ea53e3c4
Educa Capital — Proposta de reunião técnica enviada
```

Resultado da primeira chamada:

- `status = completed`;
- `adoptionStatus = instrumented`;
- `contextMode = reconstructed_at_adoption`;
- `outcomeStatus = progress`.

Resultado da segunda chamada com a mesma chave de conclusão:

- `status = already_completed`;
- nenhum resultado sobrescrito;
- nenhuma duplicidade criada.

Dentro da transação foram validados:

- uma nota histórica;
- uma referência de activity;
- uma tarefa de tracking concluída;
- uma tarefa de follow-up;
- activity marcada como `done`;
- pipeline atualizado para `Approach` porque esse estágio foi explicitamente solicitado;
- próxima ação atualizada porque foi explicitamente informada;
- `stage_advanced = true` na view observacional.

Após `ROLLBACK`:

- zero notas de teste;
- zero referências de teste;
- zero tarefas de tracking;
- zero follow-ups;
- activity sem outcome;
- nenhum resíduo no banco.

## Segurança

- funções `security invoker`;
- `auth.uid()` obrigatório;
- `PUBLIC` e `anon` sem `EXECUTE`;
- `authenticated` e `service_role` com `EXECUTE`;
- advisory locks por activity;
- idempotência separada para adoção e conclusão;
- nenhuma tabela paralela;
- RLS das tabelas oficiais permanece soberana.

## Critérios de aceite

- [x] migration aplicada no Supabase real;
- [x] prioridade determinística e explicável;
- [x] fila diária calculada com dados oficiais;
- [x] captura atômica de activity histórica + outcome;
- [x] campos de resultado dependentes de confirmação humana;
- [x] segunda conclusão não sobrescreve resultado;
- [x] nota, references, task e pipeline ligados ao mesmo lineage;
- [x] smoke autenticado com rollback;
- [x] zero resíduos de teste;
- [x] frontend com captura inline;
- [ ] CI da PR funcional;
- [ ] preview Vercel;
- [ ] merge na main;
- [ ] produção canônica validada.
