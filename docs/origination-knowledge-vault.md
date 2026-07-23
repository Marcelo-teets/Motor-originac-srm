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
- referências auditáveis para sinais, monitoring outputs, qualification e pipeline.

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

## Fluxo manual

1. O usuário abre **Knowledge Vault** no menu.
2. Cria uma nota ou escolhe um template.
3. Vincula a nota a uma empresa.
4. Escreve em Markdown e usa `[[Nome da nota]]`.
5. Salva.
6. O Supabase cria uma versão, recompõe os links e atualiza backlinks.
7. O usuário pode salvar filtros e ordenação como uma Base reutilizável.

## Fluxo pelo Company Detail

1. O usuário abre uma empresa.
2. O painel **Knowledge Vault / Memória da empresa** carrega dados reais.
3. O painel mostra qualification, notas, outputs monitorados e sinais.
4. **Preservar output** cria uma nota `source` com a observação e lineage do `monitoring_output`.
5. A nota deixa explícito que a observação não é um sinal confirmado e não altera score.
6. Após validação analítica, **Capturar sinal** cria uma nota `signal` baseada na evidência tratada.
7. **Gerar / abrir tese** cria uma nota `thesis` baseada no snapshot mais recente.
8. `knowledge_references` preserva o ID e um snapshot sanitizado da evidência original.
9. Uma segunda captura da mesma evidência é idempotente: abre/reutiliza a nota existente.
10. Requisições concorrentes são serializadas no banco para impedir notas duplicadas.

## Regra observação → sinal

`monitoring_outputs` são evidências coletadas pelos conectores. Eles podem conter ruído, fallback,
baixa confiança ou informação ainda não confirmada. Por isso:

1. preservar um output cria uma nota `source`;
2. a captura não cria `company_signal`;
3. a captura não altera qualification, patterns, lead score, ranking ou pipeline;
4. somente evidência validada deve virar sinal;
5. toda inferência deve permanecer distinguível da observação original.

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
- leitura do estágio e próxima ação do `pipeline`;
- histórico, visibilidade e identidade via Supabase Auth;
- Bases operacionais;
- painel operacional no Company Detail.

### Próximas fatias

- vincular notas a atividades e mudanças de estágio do pipeline;
- pesquisa semântica com `pgvector`;
- usar Bases e subgrafos como contexto controlado do Copilot;
- briefing pré-call e memo de comitê gerados a partir das evidências selecionadas;
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
- [ ] CI e preview validados;
- [ ] produção canônica validada após merge.

## Rollout de produção consolidado

- Supabase oficial: `hdghpmssudrqhsbvrdyt`;
- domínio canônico: `motor-originac-srm.vercel.app`;
- V1: PR `#200`;
- Company Workspace: PR `#207`;
- Bases: PR `#210`.

## Regra de produto

O Vault não deve virar um depósito de documentos. Todo conteúdo deve estar ligado a pelo menos
uma empresa, tese, sinal, estrutura, fonte, processo ou decisão comercial. Conhecimento sem impacto
na originação deve ser arquivado ou permanecer fora da plataforma.
