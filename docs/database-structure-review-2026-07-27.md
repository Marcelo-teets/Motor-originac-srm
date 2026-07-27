# Revisão estrutural do banco — 2026-07-27

## Escopo

Revisão do Supabase produtivo `hdghpmssudrqhsbvrdyt`, cruzada com as migrations e o backend da `main` do repositório oficial.

A revisão preservou a arquitetura atual e atacou somente pontos que aumentam segurança, explicabilidade, rastreabilidade e capacidade real de originação.

## Inventário observado antes das mudanças

- PostgreSQL 17, projeto em estado saudável.
- 84 tabelas no schema `public`.
- Todas as tabelas possuíam chave primária.
- Todas as tabelas possuíam RLS habilitado.
- Aproximadamente 260 mil registros estimados.
- Aproximadamente 558 MiB entre tabelas e índices.
- Maiores relações observadas:
  - `capital_market_events`: ~243 MiB.
  - `bronze_historical_records`: ~120 MiB.
  - `source_documents`: ~47 MiB.
  - `company_signals`: ~39 MiB antes do reparo histórico.
  - `monitoring_outputs`: ~37 MiB.

## Achados

### P0 — RLS sem isolamento real por usuário

As tabelas `ai_conversations`, `ai_messages`, `ai_agent_runs` e `notifications` tinham RLS, porém as políticas aceitavam qualquer sessão autenticada. Isso impedia acesso anônimo, mas não impedia um usuário autenticado de acessar registros de outro usuário.

### P0 — privilégios excessivos na Data API

`anon` e `authenticated` possuíam privilégios amplos de tabela em superfícies internas. O RLS reduzia parte do risco, mas o princípio de menor privilégio não estava aplicado.

### P0 — RPC de função incompatível com o modelo atual de papéis

`set_user_role_by_email(text, text)` ainda utilizava os papéis legados `admin`, `originator`, `analyst` e `viewer`, enquanto o contrato atual é `god_mode` e `common`. A função também era executável por `anon` e `authenticated`.

### P1 — semântica de sinais divergente

Foram encontrados 5.868 sinais cujo `metadata.observedVsInferred` indicava `inferred`, mas a coluna canônica `observed_vs_inferred` estava como `observed`.

Esse erro afetava explicabilidade e poderia distorcer qualification, patterns, score, ranking e tese ao tratar inferência como fato observado.

### P1 — lineage recuperável não preenchido

Foram encontrados 139 sinais com `monitoring_output_id` válido e uma fonte disponível no respectivo monitoring output, mas com `source_id` vazio.

### P1 — score history sem trava de replay

O histórico possuía múltiplos registros no mesmo instante por desenho, pois existem diferentes `score_type`. Não havia duplicatas na identidade completa, mas faltava uma trava explícita para impedir replay do mesmo `(company, timestamp, score_type, versão)`.

### P2 — colunas de compatibilidade

`companies` mantém pares como `sector/segment`, `sub_sector/subsegment` e `website_url/website`. Os dados estavam sincronizados e não havia duplicidade de CNPJ ou domínio. As colunas não foram removidas para evitar quebra de compatibilidade.

### P2 — índices marcados como não utilizados

O Advisor listou diversos índices como não utilizados. Nenhum foi removido nesta revisão porque parte deles é recente e ainda não há janela de workload suficiente para distinguir índice redundante de índice preventivo ou operacional.

## Plano executado

### 1. Propriedade explícita de dados pessoais

Migration: `20260727123000_harden_user_owned_data_rls.sql`

- Adiciona `owner_user_id` em `ai_conversations` e `notifications`.
- Cria FKs para `user_profiles`.
- Recupera ownership legado por id, e-mail ou nome.
- Atribui registros antigos ao único GOD-MODE ativo somente quando a invariância de um único GOD-MODE é verdadeira.
- Cria índices de acesso por proprietário.
- Cria trigger que impede usuário comum de atribuir ou transferir registro para outro usuário.
- Substitui políticas genéricas por políticas `owner OR GOD-MODE`.
- Restringe `ai_agent_runs` a leitura pelo usuário dono da conversa.
- Remove todos os privilégios de `anon` nas tabelas-alvo.
- Reduz privilégios de `authenticated` ao necessário.

### 2. Corpus vetorial e papéis

Migration: `20260727123100_harden_vector_corpus_and_role_rpc.sql`

- `vector_documents` passa a ser somente leitura para `authenticated`.
- Escrita permanece exclusivamente para `service_role`.
- Remove a RPC legada `set_user_role_by_email`.

### 3. Reparo histórico de sinais

Migration: `20260727123200_repair_company_signal_history.sql`

- Preenche os 139 `source_id` recuperáveis.
- Corrige a classificação histórica observada/inferida.
- Sincroniza coluna canônica e metadata.
- Adiciona constraint para os modos permitidos.
- Suspende os triggers de aprendizado e factor observation apenas dentro da transação, evitando criar milhares de jobs artificiais por causa de um reparo histórico.
- Reativa os triggers antes do commit.

### 4. Guardrails futuros e idempotência

Migration: `20260727123300_signal_quality_guardrails_and_score_identity.sql`

- Cria trigger para manter `observed_vs_inferred` e metadata sincronizados.
- Recupera automaticamente `source_id` a partir de `monitoring_output_id` quando possível.
- Cria as views `company_signal_lineage_quality_v1` e `company_signal_quality_summary_v1`, ambas com `security_invoker=true`.
- Cria o índice único `uq_score_snapshots_identity`.

### 5. Backend e teste de contrato

- `backend/src/ai/copilotQueryEngine.ts` passa a persistir `owner_user_id` em novas conversas.
- Criado `scripts/database-ownership-lineage-contract.test.mjs`.
- Criado o comando `npm run test:database-hardening`.

## Validações concluídas

- As quatro migrations foram aplicadas no Supabase produtivo.
- `owner_user_id` existe nas duas tabelas-alvo.
- Existem 4 notificações e 0 notificações sem proprietário.
- Existem 0 conversas sem proprietário.
- A RPC legada não existe mais.
- Não restaram grants de tabela para `anon` nas cinco superfícies endurecidas.
- Privilégios de `authenticated` confirmados:
  - `ai_conversations`: SELECT, INSERT, UPDATE, DELETE.
  - `ai_messages`: SELECT, INSERT, UPDATE, DELETE.
  - `ai_agent_runs`: SELECT.
  - `notifications`: SELECT, INSERT, UPDATE, DELETE.
  - `vector_documents`: SELECT.
- Políticas owner/GOD-MODE e service-role foram confirmadas no catálogo.
- `company_signal_quality_summary_v1` e `uq_score_snapshots_identity` existem.
- Os triggers de aprendizado e factor observation foram reativados antes do commit.

## Observação operacional do rollout

O backfill histórico gerou escrita relevante e checkpoints demorados no plano atual. Durante essa janela, consultas analíticas completas e o Advisor sofreram timeout, embora o projeto tenha permanecido `ACTIVE_HEALTHY` e as migrations tenham concluído.

Não foi criado um job paralelo nem um novo sistema de dados. A carga foi tratada dentro do PostgreSQL existente e com transações atômicas.

## Pendências fora do SQL

1. Ativar **Leaked Password Protection** no painel de Auth do Supabase. O Security Advisor já indicava essa configuração antes da revisão e ela depende da configuração do projeto, não de migration SQL.
2. Reavaliar índices classificados como não utilizados somente após uma janela mínima de workload de produção. Não remover automaticamente.
3. Planejar a depreciação gradual das colunas de compatibilidade de `companies`, com telemetria de leitura/escrita antes de qualquer remoção.
4. Integrar a visão de qualidade de sinais ao painel de governança/monitoring, sem transformá-la em um card genérico no dashboard principal.

## Critério de sucesso

A mudança melhora diretamente as perguntas centrais da plataforma:

- fatos e inferências deixam de ser confundidos;
- sinais ganham lineage recuperável e guardrail futuro;
- histórico de score se torna idempotente;
- dados pessoais do Copilot e notificações ficam realmente isolados por usuário;
- GOD-MODE preserva supervisão institucional;
- o corpus de conhecimento não pode ser alterado por clientes comuns.
