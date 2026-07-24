# Knowledge Vault V9 — Outcome Ownership & SLA

## Objetivo

Transformar o Outcome Workbench em uma rotina operacional com responsabilidade pessoal e prazo explícito, sem criar CRM paralelo, outcome sintético ou mutação automática dos motores de decisão.

A V9 responde:

1. quem assumiu a responsabilidade por confirmar o resultado;
2. quando o item deve ser tratado;
3. quais itens estão sem dono, próximos do SLA ou vencidos;
4. como liberar ou reagendar uma responsabilidade de forma auditável;
5. como preservar a instrumentação histórica sem inferir outcome.

## Arquitetura

A V9 estende a tabela oficial `tasks`:

- `owner_user_id`: usuário autenticado responsável pela tarefa operacional;
- `claimed_at`: momento em que a responsabilidade foi assumida;
- `sla_due_at`: prazo operacional para tratamento do outcome.

`owner_name` permanece como rótulo funcional ou de equipe. O ownership pessoal não substitui Coverage, Origination ou Intelligence.

Nenhuma tabela de CRM paralela foi criada.

## Fluxo

```text
Outcome Workbench V8
        ↓
item sem dono
        ↓
ação explícita "Assumir item"
        ↓
instrumentação histórica auditável, quando necessária
        ↓
task oficial + owner_user_id + claimed_at + sla_due_at
        ↓
Minha fila / SLA vencido / Vence em 24h
        ↓
resultado confirmado no fluxo V8
        ↓
Outcome Intelligence
```

## Política de SLA

| Prioridade operacional | SLA inicial |
|---|---:|
| `immediate` | 24 horas |
| `high` | 48 horas |
| `review` | 120 horas |
| `low` | 168 horas |

A política utiliza a faixa operacional da V8 apenas para definir prazo de trabalho.

Ela não escreve em:

- `lead_score_snapshots`;
- `qualification_snapshots`;
- `company_patterns`;
- ranking;
- pesos de modelo;
- estágio do pipeline;
- classificação do outcome.

## RPCs

### `knowledge_outcome_sla_workspace`

Leitura autenticada que enriquece a fila da V8 com:

- dono atual;
- status de atribuição;
- data de claim;
- SLA;
- horas restantes;
- `myQueue`;
- `unclaimedQueue`;
- `breachedQueue`;
- `dueSoonQueue`.

A função é read-only e não assume itens.

### `knowledge_claim_outcome_work_item`

Ação explícita e concorrência-segura que:

1. valida usuário ativo;
2. bloqueia a activity com advisory lock;
3. reutiliza uma atribuição existente do mesmo usuário;
4. rejeita ownership de outro usuário;
5. instrumenta a atividade histórica quando necessário;
6. reutiliza `tasks`, `activities`, `knowledge_nodes` e `knowledge_references` oficiais;
7. calcula o SLA inicial pela faixa operacional.

Não existe claim automático ou em lote.

### `knowledge_release_outcome_work_item`

Remove ownership pessoal e SLA. A instrumentação histórica permanece, porque ela é parte da memória auditável.

Somente o dono atual ou GOD-MODE pode liberar um item atribuído.

### `knowledge_reschedule_outcome_sla`

Permite ao dono atual ou GOD-MODE reagendar o SLA:

- novo prazo precisa estar no futuro;
- limite máximo de 30 dias;
- justificativa obrigatória;
- prazo anterior, usuário, data e motivo ficam no metadata da task.

## Produto

A rota existente permanece:

```text
/outcome-operations
```

A página passa a apresentar três camadas na ordem:

1. **Ownership e SLA V9**;
2. **Captura e priorização V8**;
3. **Outcome Intelligence V6**.

Filas de ownership:

- Minha fila;
- Sem dono;
- SLA vencido;
- Vence em 24h.

Controles:

- Assumir item;
- Liberar;
- Reagendar SLA;
- Abrir Company Detail.

## Smoke autenticado com rollback

Usuário:

```text
Marcelo Pereira Antunes
7fa156a8-72ed-45f1-99b7-2c6f3e572793
```

Atividade:

```text
Educa Capital — Proposta de reunião técnica enviada
fbecdbbf-32cf-4344-8658-c128ea53e3c4
priorityScore = 86
priorityBand = immediate
```

Validações:

- primeiro claim: `claimed`;
- SLA inicial: 24 horas;
- activity histórica instrumentada explicitamente;
- segundo claim: `already_claimed`;
- mesma task e mesmo SLA reutilizados;
- `myItems` passou de 0 para 1;
- `unassignedItems` passou de 13 para 12;
- item passou de adoption para pending outcome;
- contexto preservado como `reconstructed_at_adoption`;
- reagendamento de 24h para 72h auditado;
- primeira liberação: `released`;
- segunda liberação: `already_unclaimed`.

Após `ROLLBACK`:

- zero notas de teste;
- zero referências de teste;
- zero tasks de teste;
- zero ownership persistido;
- zero outcomes sintéticos.

## Segurança

As quatro RPCs usam:

- `security invoker`;
- `auth.uid()` obrigatório;
- acesso `PUBLIC` e `anon` removido;
- execução apenas para `authenticated` e `service_role`;
- RLS das tabelas oficiais;
- advisory locks por activity;
- autorização adicional para liberar ou reagendar.

## Estado real após migration

Antes de qualquer ação humana:

- 13 itens sem dono;
- 0 itens atribuídos;
- 0 itens em Minha fila;
- 0 SLAs vencidos;
- 0 SLAs vencendo em 24h;
- 0 outcomes sintéticos;
- 0 adoções automáticas.

## Critérios de aceite

- [x] migration aplicada no Supabase real;
- [x] tabela oficial `tasks` estendida;
- [x] nenhuma tabela de CRM paralela;
- [x] workspace read-only de ownership e SLA;
- [x] claim explícito e idempotente;
- [x] instrumentação histórica somente após ação humana;
- [x] release autorizado e idempotente;
- [x] reagendamento com limite e justificativa;
- [x] smoke autenticado com rollback;
- [x] zero resíduos e zero outcomes sintéticos;
- [x] frontend conectado às RPCs;
- [ ] CI da PR funcional;
- [ ] preview validado, quando permitido pelo controle atual da Vercel;
- [ ] merge na main;
- [ ] produção validada por SHA aprovado.
