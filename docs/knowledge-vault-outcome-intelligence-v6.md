# Knowledge Vault V6 — Outcome Intelligence

Data: 23/07/2026

## Objetivo

Medir, de forma auditável e conservadora, quais sinais, padrões, fatores, estruturas, notas e ações aparecem associados a avanços e resultados comerciais.

A V6 fecha o ciclo:

```text
evidência
→ sinal
→ tese / nota
→ atividade
→ tarefa
→ pipeline
→ resultado observado
→ mapa de conversão
```

A camada é descritiva. Ela não altera automaticamente qualification, factor weights, lead score, ranking ou prioridade.

## Contexto capturado na ação

Toda nova atividade criada pelo Knowledge Vault recebe um snapshot imutável em:

```text
activities.metadata.outcomeContext
```

O snapshot contém:

- nota que originou a ação;
- tags e tipo da nota;
- qualification mais recente;
- lead score mais recente;
- estágio, prioridade e estrutura esperada do pipeline;
- sinais explicitamente ligados à nota;
- padrões mais recentes da empresa;
- fatores mais recentes e respectivas contribuições.

Atualizações posteriores na atividade preservam o snapshot original. Registros antigos sem snapshot são marcados como contexto reconstruído e não são tratados como equivalentes a contexto capturado no momento da decisão.

## Resultados observados

A V6 usa os outcomes já registrados pela V5:

- `won`;
- `lost`;
- `progress`;
- `blocked`;
- `no_change`;
- ação ainda aberta.

Win rate observado é calculado somente como:

```text
won / (won + lost)
```

`progress`, `blocked`, `no_change` e atividades abertas permanecem visíveis, mas não entram no denominador de decisão terminal.

## Dimensões

O painel agrega resultados por:

- tipo de ação;
- tipo de nota;
- estrutura sugerida;
- tipo de sinal;
- padrão;
- fator.

Para cada dimensão são apresentados:

- ações executadas;
- empresas observadas;
- resultados concluídos;
- won, lost, progress, blocked, no change e abertas;
- win rate observado;
- taxa observada de avanço de estágio;
- ciclo médio;
- cobertura de contexto capturado;
- qualidade da amostra.

## Qualidade da amostra

```text
menos de 5 decisões terminais  → insufficient
5 a 19 decisões terminais      → directional
20 ou mais decisões terminais  → stronger
```

Esses rótulos não transformam associação em causalidade. Apenas tornam explícita a quantidade de evidência disponível.

## Factor Outcome Map V2

A V2 do mapa corrige a classificação conservadora do pipeline:

- `Mandated` e `ClosedWon` → resultado positivo;
- `ClosedLost` → resultado negativo;
- `Identified`, `Qualified`, `Approach` e `Structuring` → pipeline ativo;
- empresa sem pipeline → não trabalhada.

Assim, `Structuring` deixa de ser contado como sucesso antes de existir mandato ou fechamento.

## Objetos Supabase

Migrations `089` a `092`:

- `knowledge_build_execution_context`;
- `knowledge_hydrate_execution_context`;
- `knowledge_execution_outcomes_v1`;
- `knowledge_outcome_dimension_map_v1`;
- `factor_outcome_observations_v2`;
- `factor_outcome_map_v2`;
- `knowledge_outcome_intelligence`.

Todos os objetos de leitura usam `security_invoker`. Acesso anônimo foi removido e o RPC exige usuário autenticado.

## Smoke real

Teste autenticado e transacional com rollback confirmou:

- contexto `captured_at_action`;
- 1 sinal ligado à tese capturado;
- 1 padrão capturado;
- 5 fatores capturados;
- tentativa de sobrescrever o contexto rejeitada pelo trigger;
- `Structuring` classificado como `active_pipeline`;
- `Mandated` classificado como `positive`;
- outcome `won` refletido nas dimensões de ação, sinal e fator;
- amostra classificada como `insufficient` com apenas uma decisão;
- 9 fatores disponíveis no mapa global;
- nenhum resíduo após rollback;
- estágio original da empresa restaurado.

## Estado inicial honesto

Antes da ativação da V6 não existiam atividades de produção originadas pelo Knowledge Vault. Portanto:

- o painel de ações começa com zero outcomes reais;
- o mapa de fatores já mostra os fatores dos oito leads atuais;
- taxas permanecem vazias até o time registrar resultados reais;
- nenhum dado sintético foi inserido para preencher o painel.

## Guardrails

1. Não atribuir causalidade a uma associação.
2. Não atualizar pesos automaticamente.
3. Não promover empresa apenas porque um fator aparece em deals vencedores.
4. Separar contexto capturado de contexto reconstruído.
5. Exibir o tamanho da amostra junto da taxa.
6. Manter o pipeline oficial como fonte do estágio.
7. Preservar o outcome textual e o lineage da ação.
8. Usar a V6 para aprender, revisar hipóteses e priorizar testes — não para substituir análise de crédito.
