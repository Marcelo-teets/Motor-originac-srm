# Origination Knowledge Vault

## Objetivo

O Knowledge Vault é a memória operacional conectada da Origination Intelligence Platform.
Ele foi inspirado nos princípios mais úteis do Obsidian, mas não é um editor de notas genérico.
Cada conhecimento precisa melhorar uma decisão de originação: quem priorizar, o que mudou,
por que importa financeiramente, qual estrutura faz sentido, por que agora e qual é a próxima ação.

## O que ficou real nesta primeira entrega

- notas em Markdown;
- `[[WikiLinks]]` entre notas;
- resolução automática de links por slug;
- backlinks;
- grafo de notas e empresas;
- vínculo direto com `companies`;
- tipos próprios de originação;
- tags e propriedades JSON;
- visibilidade `team` e `private`;
- histórico automático de versões;
- busca textual em português;
- filtros por tipo e empresa;
- arquivamento sem apagar o histórico;
- RLS no Supabase;
- workspace interno em `/knowledge-vault`.

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

Funções RPC expostas somente para usuários autenticados:

- `knowledge_list_nodes`;
- `knowledge_get_node`;
- `knowledge_save_node`;
- `knowledge_archive_node`;
- `knowledge_graph_snapshot`;
- `refresh_knowledge_links`.

O frontend usa o JWT já emitido pelo Supabase Auth. As operações passam pelas políticas RLS;
não há service role no navegador.

## Fluxo de uso

1. O usuário abre **Knowledge Vault** no menu.
2. Cria uma nota ou escolhe um template de tese, reunião ou playbook.
3. Vincula a nota a uma empresa do Company Master quando aplicável.
4. Escreve em Markdown e usa `[[Nome da nota]]` para conectar conhecimentos.
5. Salva.
6. O Supabase cria uma versão, recompõe os links e atualiza os backlinks.
7. A nota passa a aparecer na busca, nos filtros e no grafo.

## Exemplo de tese

```md
# Tese preliminar

## O que mudou
- A empresa acelerou concessão de crédito aos clientes.
- O crescimento da carteira parece superar o funding disponível.

## Por que importa
O padrão se aproxima de [[Receivables strong / funding weak]].

## Estrutura sugerida
Avaliar [[FIDC de recebíveis comerciais]] com conta vinculada e critérios de elegibilidade.

## Próxima ação
Validar carteira, aging, concentração, inadimplência e estrutura atual de funding.
```

## Integração com o motor

### Agora

- Company Master: vínculo por `company_id`;
- Originação: teses, reuniões, estruturas e playbooks no mesmo grafo;
- Supabase Auth: identidade do criador e do último editor;
- Governança: versões e visibilidade.

### Próxima fatia

- criar notas automaticamente a partir de novos sinais relevantes;
- adicionar bloco do Vault no Company Detail;
- conectar notas a `company_signals`, `monitoring_outputs`, `qualification_snapshots` e pipeline;
- criar views salvas no estilo Bases;
- incluir pesquisa semântica com `pgvector`;
- usar o Vault como contexto controlado do Copilot;
- gerar briefing pré-call e memo de comitê a partir do subgrafo da empresa.

## Critérios de aceite da V1

- [x] migration aplicada no Supabase real;
- [x] tabelas e índices criados;
- [x] RLS habilitado;
- [x] RPCs autenticadas;
- [x] teste transacional de criação, versão, WikiLink e backlink;
- [x] rota frontend protegida por Auth;
- [x] busca e filtros;
- [x] editor Markdown;
- [x] preview, conexões e grafo;
- [x] PR #200 revisada pelo CI e integrada à `main`;
- [x] preview Vercel em estado `READY`, carregando `/knowledge-vault` e o bundle da funcionalidade;
- [ ] smoke test autenticado no domínio canônico após o deployment de produção.

## Evidências do rollout

- merge principal: `1964e9d4a9566cb1869502302d97d1dfede93a55`;
- CI: typecheck e build de frontend e backend concluídos com sucesso;
- Supabase: teste transacional com rollback validou criação, versionamento, WikiLink e backlink;
- Vercel preview: deployment final da branch em estado `READY`;
- produção: novo evento de deployment solicitado por esta atualização de rollout.

## Regra de produto

O Vault não deve virar um depósito de documentos. Todo conteúdo deve estar ligado a pelo menos
uma empresa, tese, sinal, estrutura, fonte, processo ou decisão comercial. Conhecimento sem impacto
na originação deve ser arquivado ou permanecer fora da plataforma.
