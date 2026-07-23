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
- filtros por tipo e empresa;
- arquivamento auditável;
- RLS no Supabase;
- workspace interno em `/knowledge-vault`;
- painel de memória dentro do Company Detail;
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
| `source` | documentação e avaliação de uma fonte de dados |
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

## Fluxo manual

1. O usuário abre **Knowledge Vault** no menu.
2. Cria uma nota ou escolhe um template.
3. Vincula a nota a uma empresa.
4. Escreve em Markdown e usa `[[Nome da nota]]`.
5. Salva.
6. O Supabase cria uma versão, recompõe os links e atualiza backlinks.

## Fluxo pelo Company Detail

1. O usuário abre uma empresa.
2. O painel **Knowledge Vault / Memória da empresa** carrega dados reais.
3. O painel mostra o último snapshot de qualificação, notas e sinais.
4. **Gerar / abrir tese** cria uma nota `thesis` baseada no snapshot mais recente.
5. **Capturar sinal** cria uma nota `signal` baseada na evidência real.
6. `knowledge_references` preserva o ID e um snapshot da evidência original.
7. Uma segunda captura da mesma evidência é idempotente: abre/reutiliza a nota existente.

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
- `company_signals`;
- último `qualification_snapshot`;
- leitura de `monitoring_outputs`;
- leitura do estágio e próxima ação do `pipeline`;
- histórico, visibilidade e identidade via Supabase Auth;
- painel operacional no Company Detail.

### Próximas fatias

- capturar `monitoring_outputs` diretamente no Vault;
- vincular notas a atividades e mudanças de estágio do pipeline;
- criar views salvas no estilo Bases;
- pesquisa semântica com `pgvector`;
- usar o subgrafo como contexto controlado do Copilot;
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
- [x] teste transacional real com criação de duas notas e rollback;
- [x] painel implementado no Company Detail;
- [ ] CI da PR concluído;
- [ ] preview e produção validados após merge.

## Regra de produto

O Vault não deve virar um depósito de documentos. Todo conteúdo deve estar ligado a pelo menos
uma empresa, tese, sinal, estrutura, fonte, processo ou decisão comercial. Conhecimento sem impacto
na originação deve ser arquivado ou permanecer fora da plataforma.
