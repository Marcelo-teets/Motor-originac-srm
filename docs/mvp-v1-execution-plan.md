# MVP 1.0 — plano de execução

## Objetivo
Sair do estado atual da plataforma e chegar em uma versão **usável, institucional e com dados reais** para o fluxo:

**descoberta → monitoramento → score → ranking → watch list → pipeline → atividade/tarefa → tese comercial**

O MVP 1.0 não precisa resolver tudo.
Ele precisa resolver, de forma confiável e demonstrável, as perguntas centrais do projeto:
1. quais empresas parecem mais promissoras;
2. o que mudou nelas;
3. por que isso importa financeiramente;
4. qual estrutura faz sentido;
5. qual a próxima ação comercial.

---

## Leitura do estado atual

### Já está utilizável com base real
- Auth real via Supabase
- backend principal Node + TypeScript
- frontend React + Vite
- dashboard e company detail estruturados
- companies, sources, qualification, patterns, ranking e thesis com base persistida
- monitoring com conectores iniciais reais e reprocessamento manual
- pipeline, activities e tasks persistentes

### Ainda precisa fechar para o MVP 1.0
- Watch List como camada operacional oficial entre ranking e pipeline
- trilha explícita de ativação em Supabase + Vercel
- validação final de dados operacionais e smoke tests
- visão SQL consolidada para operação diária do time
- disciplina de deploy / migração / checklist de aceite

---

## Princípios de execução
1. **Sem stack paralela**.
2. **Main como base oficial**.
3. **Supabase real como fonte primária**.
4. **Frontend orientado a decisão, não a demo vazia**.
5. **Toda entrega precisa melhorar a originação real**.
6. **Tudo que for crítico precisa ser explicável e auditável**.

---

## Escopo do MVP 1.0

### Bloco A — núcleo de dados reais
**Objetivo:** garantir que a plataforma opere com persistência real e leitura consistente.

Entregas:
- migrations aplicadas no Supabase
- variáveis de ambiente corretas em backend e Vercel
- seeds mínimas controladas
- `/mvp-readiness` respondendo com quadro claro do estado da plataforma

Critério de aceite:
- login funciona
- dashboard abre
- leads carregam do backend
- company detail abre com score / thesis / signals
- monitoring manual produz outputs persistidos

### Bloco B — camada comercial operacional
**Objetivo:** fechar a jornada comercial mínima do produto.

Entregas:
- ranking funcional
- watch list funcional
- pipeline persistente
- activities e tasks persistentes
- ação clara de avanço comercial por empresa

Critério de aceite:
- usuário consegue salvar empresa na watch list
- usuário consegue ver updates de empresas observadas
- usuário consegue levar empresa para pipeline
- usuário consegue criar activity / task operacional

### Bloco C — governança de deploy
**Objetivo:** permitir ativação e demonstração sem improviso.

Entregas:
- checklist de ativação no GitHub / Supabase / Vercel
- ordem oficial de migrations
- smoke test do MVP
- critério de Go / No-Go

Critério de aceite:
- qualquer pessoa do time consegue repetir a ativação seguindo documentação

---

## Sequência oficial de execução

### Etapa 1 — Fechamento da Watch List
**Status alvo:** pronto para merge

Itens:
- concluir o encaixe final da Watch List na navegação
- manter salvamento em listas e feed de updates
- consolidar a Watch List como camada entre ranking e pipeline
- validar Vercel status e preparar merge

Resultado esperado:
- PR #44 vira a PR de fechamento funcional do fluxo ranking → watch list → pipeline

### Etapa 2 — Ativação das migrations operacionais
**Status alvo:** banco pronto para operação do MVP

Itens:
- rodar `013_watchlist_mvp.sql`
- rodar `014_rls_runtime_core.sql`
- rodar `015_origination_command_center_views.sql`

Resultado esperado:
- watch lists persistidas
- RLS mínima aplicada nas tabelas operacionais
- views de comando disponíveis para leitura operacional

### Etapa 3 — Deploy e variáveis de ambiente
**Status alvo:** ambiente navegável sem fallback indevido

Itens:
- confirmar frontend na Vercel com root `frontend/`
- garantir `VITE_API_BASE_URL`
- garantir `VITE_SUPABASE_URL`
- garantir `VITE_SUPABASE_ANON_KEY`
- garantir backend com `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Resultado esperado:
- frontend publicado com dados reais
- backend apontando para Supabase real

### Etapa 4 — Smoke test orientado ao negócio
**Status alvo:** MVP demonstrável para operação

Fluxo de teste:
1. login
2. abrir dashboard
3. abrir leads
4. entrar em uma empresa
5. salvar empresa em watch list
6. abrir watch list
7. mover empresa para pipeline
8. criar activity
9. criar task
10. rodar monitoring manual
11. validar mudança em score / sinais / feed

Resultado esperado:
- fluxo ponta a ponta funcional

---

## Definition of Done do MVP 1.0

O MVP 1.0 será considerado pronto quando os itens abaixo estiverem verdes:

- [ ] Auth real ativo
- [ ] Supabase real operando como fonte principal
- [ ] Dashboard com dados reais
- [ ] Leads e Company Detail com dados reais
- [ ] Ranking persistido e visível
- [ ] Watch List operacional
- [ ] Pipeline / Activities / Tasks operacionais
- [ ] Monitoring manual gerando outputs persistidos
- [ ] Thesis / structure suggestion visíveis
- [ ] Vercel com build estável
- [ ] Runbook de ativação publicado
- [ ] Smoke test do fluxo principal executado

---

## O que fica fora do MVP 1.0
- scheduler avançado com cadências sofisticadas
- comparables engine completo
- copiloto institucional completo com memória operacional profunda
- loaders regulatórios mais pesados
- painel analítico avançado de fonte / trigger / comparables

Esses itens continuam no backlog pós-MVP.

---

## Próximo marco após o MVP 1.0
Após a ativação do MVP, a prioridade passa a ser:
1. scheduler recorrente de monitoring;
2. ampliação de conectores reais;
3. consolidação do painel de monitoramento;
4. copiloto contextual com dados reais da empresa;
5. ranking e thesis mais fortes com histórico temporal.
