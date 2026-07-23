# Knowledge Vault V3 — Bases Operacionais

## Objetivo

A V3 transforma `knowledge_saved_views`, já existente desde a V1, em uma capacidade real do produto.
Uma **Base** é uma visão reutilizável do Knowledge Vault que preserva filtros, ordenação e modo de leitura.

O ganho para originação é reduzir retrabalho e institucionalizar perguntas recorrentes, por exemplo:

- teses de crédito de uma empresa;
- sinais capturados com uma tag específica;
- reuniões recentes;
- playbooks FIDC;
- subgrafos por empresa.

## Entrega

### Supabase

A migration `082_knowledge_saved_views_bases.sql` adiciona:

- índices por owner e compartilhamento;
- `knowledge_list_saved_views()`;
- `knowledge_save_view(...)`;
- `knowledge_delete_view(uuid)`;
- execução apenas para `authenticated` e `service_role`;
- bloqueio explícito de `PUBLIC` e `anon`;
- manutenção do RLS já existente em `knowledge_saved_views`.

### Frontend

A rota `/knowledge-vault` passa a oferecer:

- filtro por tag;
- ordenação por atualização ou título;
- criação de Base a partir da visão atual;
- Base privada ou compartilhada com a equipe;
- aplicação com um clique;
- edição e exclusão apenas pelo criador;
- modo grafo preservado dentro da Base;
- contagem de Bases disponíveis no cabeçalho.

## Segurança

- usuário autenticado vê Bases compartilhadas e suas próprias Bases privadas;
- apenas o criador pode editar ou excluir;
- RPCs usam `security invoker`;
- nenhuma função é executável por `anon`;
- a aplicação usa o JWT real do Supabase no frontend;
- excluir uma Base nunca exclui notas, links ou histórico.

## Fluxo operacional

1. O analista ajusta busca, tipo, empresa, tag e ordenação.
2. Opcionalmente abre o grafo.
3. Clica em **Salvar visão atual**.
4. Define nome, descrição e compartilhamento.
5. A Base é persistida no Supabase.
6. Em uso futuro, um clique reaplica a mesma análise.

## Próximas fatias

1. templates institucionais de Bases para FIDC, DCM, sinais e reuniões;
2. captura direta de `monitoring_outputs`;
3. contexto selecionável da Base para o Copilot;
4. briefing pré-call e memo de comitê;
5. busca semântica com `pgvector` sobre o corpus governado do Vault.
