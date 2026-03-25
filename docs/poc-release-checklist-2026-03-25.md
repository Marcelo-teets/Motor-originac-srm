# POC Release Checklist — 2026-03-25

## Objetivo
Checklist de fechamento para colocar o Motor de Originação em estado demonstrável para POC.

## Bloco 1 — Ambiente e persistência
- [ ] `SUPABASE_URL` configurada
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurada
- [ ] `SUPABASE_ANON_KEY` configurada
- [ ] `USE_SUPABASE=true`
- [ ] migrations aplicadas
- [ ] seeds mínimas carregadas
- [ ] usuário de teste criado

## Bloco 2 — Caminho crítico do produto
- [ ] login real funcionando
- [ ] dashboard carregando do backend oficial
- [ ] companies carregando do banco
- [ ] company detail carregando qualification, patterns, thesis e score history
- [ ] monitoring por empresa funcionando
- [ ] recálculo por empresa funcionando
- [ ] ranking atualizado após recálculo

## Bloco 3 — Pipeline / activities
- [ ] `/pipeline` responde estado persistido
- [ ] `/activities` responde estado persistido
- [ ] mover estágio altera estado da empresa
- [ ] criar atividade altera Company Detail
- [ ] PipelinePage consome backend real

## Bloco 4 — Camada comercial mínima
- [ ] stakeholders carregam
- [ ] touchpoints carregam
- [ ] objections carregam
- [ ] pre-call briefing responde
- [ ] pre-mortem responde
- [ ] weekly ABM war room responde

## Bloco 5 — Cockpit operacional
- [ ] `/mvp-readiness` responde
- [ ] `/company-intelligence/:id/summary` responde
- [ ] `/company-decision-memo/:id` responde
- [ ] `/qualification-intelligence-bridge/:id` responde
- [ ] `getMvpQuickActions` implementado no frontend api client
- [ ] MvpOpsPage compila e carrega

## Bloco 6 — Frontend / build
- [ ] build local do frontend passa
- [ ] build da branch operacional passa na Vercel
- [ ] build do main passa na Vercel
- [ ] nenhuma página crítica quebra em TypeScript

## Bloco 7 — Demo data
- [ ] 10–20 empresas seedadas
- [ ] pelo menos 3 empresas com sinais recentes
- [ ] pelo menos 3 empresas com touchpoints
- [ ] pelo menos 2 empresas com objections abertas
- [ ] pelo menos 1 caso claro com fit FIDC
- [ ] pelo menos 1 caso claro com fit DCM

## Definição de pronto
A POC está pronta quando o fluxo abaixo funciona sem fallback crítico:
1. logar
2. abrir dashboard
3. abrir empresa prioritária
4. rodar recálculo
5. ver score/ranking/tese atualizados
6. registrar touchpoint
7. mover pipeline
8. sair com próxima ação clara
