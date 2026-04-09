# Fluxo direto no GitHub — Motor Originação SRM

Este fluxo elimina a dependência de Codespaces para o dia a dia de evolução do repositório.

## Objetivo
Trabalhar com:
- branch limpa
- commits no GitHub
- PR
- validação automática por GitHub Actions

## O que valida automaticamente
A workflow `CI` executa:
1. `npm install`
2. `npm run typecheck`
3. `npm run build`

## Fluxo sugerido
1. Partir sempre da `main`
2. Criar branch limpa por entrega
3. Implementar mudanças
4. Abrir PR
5. Validar status da workflow `CI`
6. Fazer merge apenas com CI verde

## Quando usar Codespaces
Somente quando for realmente necessário executar runtime interativo no navegador, debug manual ou teste de UX/local state.

## Quando não precisa usar Codespaces
- ajustes de código
- revisão de arquitetura
- PRs pequenas e médias
- documentação
- refactors
- criação de workflows
- mudanças de backend/frontend que possam ser validadas por build e typecheck

## Observação sobre secrets
O secret criado como bloco único (`MOTOR_SECR_SRM`) não vira múltiplas variáveis automaticamente.

Se um fluxo precisar de secrets no GitHub, o ideal é cadastrar cada variável separadamente, principalmente em Actions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- demais variáveis necessárias

Para o fluxo direto no GitHub, isso só é necessário se alguma workflow realmente consumir esses valores.
