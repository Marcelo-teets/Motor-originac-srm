# POC Demo Validation Playbook — 2026-03-25

## Objetivo
Validar a POC do Motor de Originação em fluxo único, do login até a próxima ação comercial.

## Pré-condições
- ambiente com Supabase configurado
- build do frontend aprovado
- usuário de teste ativo
- seed mínima carregada
- pelo menos 10 empresas no banco

## Fluxo 1 — Login e dashboard
1. abrir a aplicação
2. fazer login
3. confirmar que `/auth/me` responde
4. confirmar que o Dashboard carrega:
   - summary
   - top leads
   - monitoring widget
   - ABM war room widget

### Evidência esperada
- `status=real` ou `status=partial` sem quebra visual
- top leads com score e suggested structure

## Fluxo 2 — Company Detail analítico
1. abrir uma empresa prioritária
2. validar carregamento de:
   - qualification
   - patterns
   - thesis
   - score history
   - monitoring outputs
   - signals
3. clicar em recalculate
4. confirmar atualização do score/ranking

### Evidência esperada
- score history com novo ponto
- qualification e tese coerentes com os sinais recentes

## Fluxo 3 — Camada comercial mínima
1. na mesma empresa, validar:
   - stakeholder map
   - touchpoint timeline
   - objection intelligence
   - pre-call briefing
   - pre-mortem
2. registrar um novo touchpoint
3. confirmar que o touchpoint reaparece no detalhe

### Evidência esperada
- timeline atualizada
- weekly ABM war room refletindo o estado novo na próxima leitura

## Fluxo 4 — Pipeline e activities
1. abrir PipelinePage
2. validar contagem por estágio
3. mover uma empresa de estágio
4. criar uma activity
5. voltar ao Company Detail da empresa
6. confirmar atualização de estágio e activity

### Evidência esperada
- `/pipeline` responde estado persistido
- `/activities` responde estado persistido
- Company Detail reflete alteração operacional

## Fluxo 5 — Cockpit operacional
1. abrir a página MVP Ops
2. validar que readiness carrega
3. validar que quick actions carrega
4. validar que não há erro de `getMvpQuickActions`

### Evidência esperada
- cockpit renderiza
- quick actions listadas
- summary de readiness coerente

## Casos mínimos de teste
- 1 empresa com fit FIDC claro
- 1 empresa com fit DCM claro
- 1 empresa com objection aberta alta
- 1 empresa com momentum cooling
- 1 empresa sem champion

## Critério final de aprovação
A demo está aprovada quando o time consegue, sem fallback crítico:
1. logar
2. abrir dashboard
3. escolher um top lead
4. entender why now
5. recalcular a empresa
6. registrar interação comercial
7. mover pipeline
8. sair com próxima ação objetiva
