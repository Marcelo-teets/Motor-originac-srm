# Origination Knowledge Vault

## Objetivo

O Knowledge Vault é a memória operacional conectada da Origination Intelligence Platform.
Ele foi inspirado nos princípios mais úteis do Obsidian, mas não é um editor de notas genérico.
Cada conhecimento precisa melhorar uma decisão de originação: quem priorizar, o que mudou,
por que importa financeiramente, qual estrutura faz sentido, por que agora e qual é a próxima ação.

## Capacidades reais

- notas em Markdown;
- `[[WikiLinks]]`, backlinks e grafo;
- vínculo direto com `companies`;
- tipos próprios de originação;
- tags e propriedades JSON;
- visibilidade `team` e `private`;
- histórico automático de versões;
- busca textual em português;
- filtros por tipo, empresa e tag;
- Bases privadas ou compartilhadas com filtros, ordenação e modo grafo;
- arquivamento auditável;
- RLS no Supabase;
- workspace interno em `/knowledge-vault`;
- painel de memória dentro do Company Detail;
- preservação de `monitoring_outputs` como observações auditáveis;
- captura de sinais reais em notas;
- geração de tese a partir do último `qualification_snapshot`;
- criação de atividades e tarefas reais a partir de notas;
- atualização de estágio, próxima ação e prazo pelo pipeline oficial;
- registro de resultado comercial e follow-up;
- snapshot imutável do contexto decisório de cada ação;
- Outcome Intelligence por ação, nota, estrutura, sinal, padrão e fator;
- Factor Outcome Map conservador, sem antecipar sucesso em `Structuring`;
- referências auditáveis para sinais, monitoring outputs, qualification, pipeline, activities e tasks.

## Tipos de conhecimento

| Tipo | Uso operacional |
|---|---|
| `company` | mapa qualitativo de uma empresa e suas relações |
| `thesis` | tese de crédito, por que agora, riscos e estrutura sugerida |
| `signal` | interpretação de um sinal observado ou inferido |
| `meeting` | memória de reunião, objeções e próximos passos |
| `source` | observação de fonte, documentação e avaliação de dados |
| `playbook` | processo reutilizável de originação ou estruturação |
| `structure` | estrutura de crédito, FIDC, DCM, CRI, CRA ou debênture |
| `note` | conhecimento geral que não cabe nas categorias anteriores |

## Modelo de dados

A migration `060_origination_knowledge_vault.sql` cria:

- `knowledge_nodes`: documento principal;
- `knowledge_links`: relações e WikiLinks;
- `knowledge_node_versions`: snapshots auditáveis;
- `knowledge_saved_views`: fundação para views no estilo Bases.

A migration `076_knowledge_company_workspace.sql` adiciona:

- `knowledge_references`: vínculo auditável entre uma nota e a evidência operacional que a originou;
- `knowledge_company_workspace`: leitura consolidada da memória, qualification, sinais, monitoring e pipeline de uma empresa;
- `knowledge_capture_signal_note`: transforma um `company_signal` real em nota rastreável;
- `knowledge_capture_qualification_note`: transforma o último snapshot em tese estruturada.

A migration `077_knowledge_vault_function_grants_hardening.sql` remove acesso `PUBLIC`/`anon`
de todas as funções do Vault e mantém execução apenas para `authenticated` e `service_role`.

A migration `078_knowledge_capture_concurrency_lock.sql` serializa capturas por evidência com
transaction advisory locks. Cliques ou requisições simultâneas reutilizam a mesma nota em vez de
criar duplicidades de sinais ou teses.

A migration `082_knowledge_saved_views_bases.sql` operacionaliza as Bases:

- criação, edição e exclusão via RPC;
- filtros, ordenação, colunas e modo de visualização persistidos;
- Bases privadas e compartilhadas;
- edição e exclusão restritas ao criador.

A migration `083_knowledge_monitoring_output_capture.sql` adiciona:

- `knowledge_capture_monitoring_output_note`;
- captura idempotente e concorrência-segura por `monitoring_output`;
- snapshot sanitizado sem copiar payload bruto para `knowledge_references`;
- `capturedNodeId`, fonte, status e natureza no workspace da empresa;
- separação explícita entre observação, sinal e impacto no score.

As migrations `085` a `088` conectam o Vault à execução oficial:

- referências `activity` e `task` com validação de empresa;
- `knowledge_company_execution_workspace`;
- `knowledge_create_execution_action`;
- `knowledge_complete_execution_action`;
- advisory locks e chaves de idempotência;
- bloqueio de sobrescrita de resultado concluído;
- estágio e próxima ação solicitados versus efetivamente aplicados;
- reutilização das tabelas `activities`, `tasks` e `pipeline`, sem CRM paralelo.

As migrations `089` a `092` implementam Outcome Intelligence:

- `knowledge_build_execution_context`;
- trigger que captura e preserva `activities.metadata.outcomeContext`;
- `knowledge_execution_outcomes_v1`;
- `knowledge_outcome_dimension_map_v1`;
- `factor_outcome_observations_v2`;
- `factor_outcome_map_v2`;
- RPC autenticada `knowledge_outcome_intelligence`;
- views `security_invoker` e acesso anônimo removido;
- nenhuma alteração automática de score, peso, qualification ou ranking.

## Fluxo manual

1. O usuário abre **Knowledge Vault** no menu.
2. Cria uma nota ou escolhe um template.
3. Vincula a nota a uma empresa.
4. Escreve em Markdown e usa `[[Nome da nota]]`.
5. Salva.
6. O Supabase cria uma versão, recompõe os links e atualiza backlinks.
7. O usuário pode salvar filtros e ordenação como uma Base reutilizável.
8. O painel Outcome Intelligence respeita o filtro de empresa da Base aplicada.

## Fluxo pelo Company Detail

1. O usuário abre uma empresa.
2. O painel **Knowledge Vault / Memória da empresa** carrega dados reais.
3. O painel mostra qualification, notas, execução, outputs monitorados e sinais.
4. **Preservar output** cria uma nota `source` com a observação e lineage do `monitoring_output`.
5. A nota deixa explícito que a observação não é um sinal confirmado e não altera score.
6. Após validação analítica, **Capturar sinal** cria uma nota `signal` baseada na evidência tratada.
7. **Gerar / abrir tese** cria uma nota `thesis` baseada no snapshot mais recente.
8. **Executar ação** transforma uma nota em activity, task e atualização do pipeline oficial.
9. O usuário registra contexto, próxima ação, prazo e estágio solicitado.
10. O motor preserva o solicitado e o estado efetivamente aceito pelos guardrails.
11. A criação da ação congela qualification, lead score, pipeline, sinais, padrões e fatores observados naquele momento.
12. **Registrar resultado** conclui a tarefa anterior e cria um follow-up opcional.
13. `knowledge_references` mantém a relação entre nota, evidência, activity, task e pipeline.
14. Requisições concorrentes e repetidas são idempotentes.
15. Os resultados alimentam somente mapas observacionais, sem reponderação automática.

## Regra observação → sinal

`monitoring_outputs` são evidências coletadas pelos conectores. Eles podem conter ruído, fallback,
baixa confiança ou informação ainda não confirmada. Por isso:

1. preservar um output cria uma nota `source`;
2. a captura não cria `company_signal`;
3. a captura não altera qualification, patterns, lead score, ranking ou pipeline;
4. somente evidência validada deve virar sinal;
5. toda inferência deve permanecer distinguível da observação original.

## Regra conhecimento → execução

1. toda ação precisa nascer de uma nota ativa, acessível e vinculada à empresa;
2. a V5 usa `activities`, `tasks` e `pipeline` existentes;
3. referências entre empresas são rejeitadas;
4. o trigger oficial do pipeline permanece soberano;
5. solicitado e efetivo são armazenados separadamente;
6. uma ação concluída não pode ser sobrescrita por outra requisição;
7. execução comercial não altera automaticamente qualification, patterns ou scores;
8. o resultado passa a ser parte auditável da memória institucional.

## Regra resultado → aprendizado

1. `won / (won + lost)` é a única taxa denominada win rate;
2. `progress`, `blocked`, `no_change` e ações abertas permanecem fora do denominador terminal;
3. menos de 5 decisões terminais significa amostra insuficiente;
4. de 5 a 19 decisões significa leitura direcional;
5. 20 ou mais decisões significa amostra mais robusta, não causalidade comprovada;
6. contexto capturado no momento da ação é distinguido de contexto reconstruído;
7. `Mandated` e `ClosedWon` são positivos no mapa de fatores;
8. `ClosedLost` é negativo;
9. `Identified`, `Qualified`, `Approach` e `Structuring` permanecem pipeline ativo;
10. nenhuma associação altera automaticamente pesos ou priorização.

## Exemplo de tese

```md
# Tese de crédito

## Diagnóstico atual
- Qualification score
- Funding need
- Urgência
- Confiança das fontes
- Funding gap
- Fit FIDC / DCM

## Rationale
Leitura da estrutura de capital e do padrão dominante.

## Estrutura sugerida
FIDC, DCM ou estrutura alternativa conforme evidências.

## Próxima ação
Diligência de carteira, funding, governança e sponsor interno.
```

## Integração com o motor

### Implementado

- Company Master por `company_id`;
- `monitoring_outputs` com preservação auditável;
- `company_signals`;
- último `qualification_snapshot`;
- estágio e próxima ação do `pipeline`;
- `activities` e `tasks` ligadas a notas;
- registro de outcome e follow-up;
- contexto decisório imutável por ação;
- mapas observacionais de conversão;
- Factor Outcome Map V2;
- histórico, visibilidade e identidade via Supabase Auth;
- Bases operacionais;
- painel operacional no Company Detail;
- painel Outcome Intelligence dentro do Vault.

### Próximas fatias

- aumentar a amostra real registrando outcomes no Company Detail;
- pesquisa semântica com `pgvector`;
- usar Bases e subgrafos como contexto controlado do Copilot;
- briefing pré-call e memo de comitê gerados a partir das evidências, ações e resultados selecionados;
- governança humana para qualquer proposta futura de ajuste de pesos;
- regras de captura automática apenas para sinais acima de thresholds aprovados.

## Critérios de aceite

### V1

- [x] migration aplicada no Supabase real;
- [x] RLS e RPCs autenticadas;
- [x] criação, versão, WikiLink e backlink testados com rollback;
- [x] editor, preview, busca, filtros e grafo;
- [x] PR #200 integrada e produção validada.

### Company Workspace V2

- [x] schema aplicado no Supabase real;
- [x] referências auditáveis com RLS;
- [x] acesso `anon` removido de tabelas e funções do Vault;
- [x] RPC consolidada por empresa;
- [x] captura idempotente de sinal;
- [x] geração idempotente de tese por qualification snapshot;
- [x] capturas concorrentes serializadas no banco;
- [x] painel implementado no Company Detail;
- [x] PR #207, preview e produção validados.

### Bases V3

- [x] RPCs de Bases aplicadas no Supabase real;
- [x] Bases privadas e compartilhadas protegidas por RLS;
- [x] filtros por tag e ordenação persistidos;
- [x] PR #210 integrada;
- [x] produção canônica validada.

### Monitoring Capture V4

- [x] migration aplicada no Supabase real;
- [x] captura idempotente para o mesmo usuário;
- [x] captura idempotente entre usuários para notas de equipe;
- [x] uma única referência por output e nó;
- [x] `capturedNodeId` retornado pelo workspace;
- [x] rollback confirmou ausência de resíduos de teste;
- [x] frontend implementado no Company Detail;
- [x] CI e preview validados;
- [x] produção canônica validada após merge.

### Execution V5

- [x] migrations aplicadas no Supabase real;
- [x] nenhuma tabela paralela de CRM criada;
- [x] activity, task e pipeline ligados a uma nota;
- [x] criação e conclusão idempotentes;
- [x] segunda conclusão não sobrescreve resultado;
- [x] referência entre empresas rejeitada;
- [x] solicitado versus efetivo preservados;
- [x] teste transacional real com rollback;
- [x] frontend compilado no preview;
- [x] CI da PR #216 concluída com sucesso;
- [x] Company Detail do preview respondeu HTTP 200;
- [x] produção canônica validada após merge.

### Outcome Intelligence V6

- [x] migrations aplicadas no Supabase real;
- [x] contexto decisório capturado e preservado;
- [x] funções e views sem acesso anônimo;
- [x] classificação conservadora de pipeline aplicada;
- [x] smoke autenticado com rollback;
- [x] sinal, padrão e fatores refletidos nas dimensões;
- [x] tentativa de sobrescrita do contexto bloqueada;
- [x] nenhum outcome sintético inserido;
- [x] CI da PR #220 concluída com sucesso;
- [x] preview Vercel READY;
- [x] `/knowledge-vault` do preview respondeu HTTP 200;
- [x] PR #220 integrada na `main`;
- [x] domínio canônico apontado ao deployment validado sem rebuild;
- [x] bundle canônico contém o painel Outcome Intelligence;
- [x] runtime sem warnings, errors ou fatals;
- [x] credencial e funções temporárias de promoção removidas;
- [x] release audit #223 encerrado como concluído.

## Rollout de produção consolidado

- Supabase oficial: `hdghpmssudrqhsbvrdyt`;
- domínio canônico: `motor-originac-srm.vercel.app`;
- V1: PR `#200`;
- Company Workspace: PR `#207`;
- Bases: PR `#210`;
- Monitoring Capture: PR `#212`, commit `f66fc0626cc5093e50faee765c1f98e6e5b8dc6d`, deployment `dpl_94N2jNCuQ4AuW4VzphhVZ85ZaRqn`;
- Execution V5: PR `#216`, commit `16f8397068150b3857c606c762d9fb43f56ab530`, deployment `dpl_ECTrssjnmmM9wJZ7idBLZ3FBAqwJ`;
- Outcome Intelligence V6: PR `#220`, commit `c5255aa2046aba6139a80b77b1d511b8b022a5a7`, CI `#555`, deployment `dpl_7fT2FnZ6M575RpZBfXJJsiCCTHXT`, domínio canônico validado em 23/07/2026;
- rollout V6 realizado por atribuição oficial de alias ao deployment validado, evitando novo build durante limite temporário da Vercel;
- nenhuma credencial temporária permaneceu no Supabase Vault após a operação.

## Regra de produto

O Vault não deve virar um depósito de documentos. Todo conteúdo deve estar ligado a pelo menos
uma empresa, tese, sinal, estrutura, fonte, processo ou decisão comercial. Conhecimento sem impacto
na originação deve ser arquivado ou permanecer fora da plataforma.
