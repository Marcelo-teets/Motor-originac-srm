# GitHub Secrets — mapa oficial do repositório

Este documento consolida os secrets esperados pelo fluxo do projeto no GitHub.

## Secrets individuais esperados
Crie estes secrets em `Settings -> Secrets and variables -> Actions`.

### Obrigatórios para Supabase Smoke
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Recomendados
- `PORT`
- `USE_SUPABASE`
- `BOOTSTRAP_SUPABASE`
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Valores padrão sugeridos
- `PORT=4000`
- `USE_SUPABASE=true`
- `BOOTSTRAP_SUPABASE=true`
- `VITE_API_BASE_URL=http://localhost:4000`
- `VITE_SUPABASE_URL=<mesmo valor de SUPABASE_URL>`
- `VITE_SUPABASE_ANON_KEY=<mesmo valor de SUPABASE_ANON_KEY>`

## O que já existe no código
- `scripts/bootstrap-github-env.sh`: monta `.env` a partir dos secrets do GitHub
- `.github/workflows/supabase-smoke.yml`: roda install, bootstrap, typecheck, build e backend health check
- `.github/workflows/ci.yml`: valida build/typecheck para PRs e pushes

## Fluxo recomendado
1. Criar os secrets individualmente
2. Rodar a workflow `Supabase Smoke` manualmente
3. Confirmar backend saudável
4. Seguir evoluindo por branch + PR + checks

## Observação importante
Não usar um único secret com várias linhas como substituto dos secrets individuais.
O GitHub não quebra automaticamente esse bloco em múltiplas variáveis de ambiente.
