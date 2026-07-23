# Knowledge Vault V5 — Execução da Tese

## Objetivo

Conectar conhecimento governado a execução comercial real sem criar CRM paralelo.

A V5 fecha o ciclo:

```text
Evidência
→ Sinal
→ Tese / Nota
→ Atividade
→ Tarefa
→ Mudança de estágio
→ Resultado
→ Próxima ação
```

## Princípio de arquitetura

A implementação reutiliza as tabelas oficiais já existentes:

- `knowledge_nodes` e `knowledge_references` para memória e lineage;
- `activities` para registrar a ação comercial;
- `tasks` para materializar o próximo passo;
- `pipeline` para estágio, status, prioridade e prazo.

Nenhuma tabela paralela de CRM foi criada.

## Supabase

### Migrations

- `085_knowledge_execution_actions.sql`:
  - adiciona referências `activity` e `task`;
  - cria RPCs de leitura, criação e conclusão;
  - adiciona idempotência e índices operacionais.
- `086_knowledge_execution_reference_validation.sql`:
  - mantém as validações anteriores;
  - exige que activity/task existam e pertençam à mesma empresa da nota;
  - melhora a seleção da tarefa mais recente.
- `087_knowledge_execution_completion_guard.sql`:
  - impede que uma ação concluída seja sobrescrita com outra chave;
  - impede follow-ups duplicados.
- `088_knowledge_execution_result_lineage.sql`:
  - expõe estágio e próxima ação solicitados versus efetivamente aplicados.

### RPCs

```sql
knowledge_company_execution_workspace(company_id)
knowledge_create_execution_action(...)
knowledge_complete_execution_action(...)
```

Todas usam `security invoker`, exigem autenticação e têm execução removida de `PUBLIC` e `anon`.

## Fluxo no produto

Dentro do Company Detail, a seção **Execução da tese** permite:

1. selecionar a nota que sustenta a ação;
2. escolher reunião, ligação, e-mail, follow-up, análise, comitê ou outra atividade;
3. registrar objetivo e contexto;
4. criar próxima ação e prazo;
5. solicitar mudança de estágio;
6. registrar o resultado posteriormente;
7. concluir a tarefa anterior;
8. criar um follow-up, quando necessário;
9. visualizar o solicitado e o efetivamente aplicado pelos guardrails do motor.

## Guardrails

- uma ação precisa nascer de uma nota ativa vinculada à empresa;
- referências entre empresas são rejeitadas;
- criação e conclusão usam advisory locks e chaves de idempotência;
- um resultado concluído não pode ser sobrescrito por nova requisição;
- o trigger oficial do pipeline continua soberano;
- estágio e próxima ação solicitados são preservados junto do estado efetivo;
- nenhuma alteração é feita em qualification, patterns ou score por esta camada.

## Validação real executada

Teste transacional autenticado com rollback confirmou:

- criação de nota temporária;
- criação de uma atividade e tarefa;
- segunda chamada de criação retornando a mesma atividade;
- conclusão da atividade;
- tarefa original marcada como concluída;
- follow-up criado uma única vez;
- pipeline avançando para `Structuring`;
- resultado preservado no lineage;
- nova conclusão com chave diferente sem sobrescrever o primeiro resultado;
- referência de activity de outra empresa rejeitada;
- uma referência de activity, referências de tasks e uma referência de pipeline;
- ausência de qualquer resíduo após rollback.

## Resultado para originação

A plataforma passa a responder também:

- qual conhecimento gerou uma ação;
- qual ação foi executada;
- qual tarefa ficou aberta;
- qual estágio foi solicitado;
- qual estágio o motor efetivamente aceitou;
- qual foi o resultado comercial;
- qual é o próximo passo;
- quais teses estão gerando tração ou bloqueios.

## Próxima evolução

Usar essa trilha para:

- medir conversão por tipo de sinal, tese e estrutura sugerida;
- construir briefing pré-call a partir de ações e resultados;
- gerar memo de comitê com evidências e histórico comercial selecionados;
- alimentar o Copilot com um subgrafo controlado e auditável;
- calibrar o factor/outcome map com resultados reais, sem causalidade automática indevida.
