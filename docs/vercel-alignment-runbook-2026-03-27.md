# Vercel Alignment Runbook — 2026-03-27

## Objetivo
Padronizar o estado real do deploy do Motor no Vercel e evitar drift entre:
- configuração do projeto no GitHub
- configuração ativa no Vercel
- branch strategy
- env vars mínimas para runtime funcional

## Estado validado nesta data
### Projeto Vercel ativo
- Project: `motor-originac-srm`
- Team: `marcelo-teets-projects`
- Produção alias: `motor-originac-srm.vercel.app`
- Domínio adicional: `motor.srmventures`

### Produção saudável
- Deployment id: `aC3mknmyLN5NGYptEpjqmYnf7Akc`
- Commit de produção: `19b8a9d7d4cf21ca68e78a23be2f23d79cfbea01`
- Origem: branch `main`
- Status: `READY`

### Preview quebrado observado
- PR/branch associada: `chatgpt/fix-mvp-quick-actions` / PR #24
- Sintoma: build quebrando no frontend por ausência de `getMvpQuickActions`
- Causa: branch de trabalho defasada em relação ao hotfix já mergeado em `main`

## Configuração real em uso hoje
O projeto ativo do Vercel está usando o `vercel.json` da raiz do repositório, com build de workspace para o frontend:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install",
  "buildCommand": "npm run build --workspace frontend",
  "outputDirectory": "frontend/dist",
  "framework": "vite"
}
```

## Drift detectado
A documentação do repositório ainda menciona um setup alternativo com:
- `Root Directory = frontend`
- `frontend/vercel.json`

Esse setup pode funcionar, mas **não é o setup que está em produção hoje**. Para evitar erro operacional, a equipe deve considerar o modelo de raiz como a referência corrente até que haja migração explícita do projeto Vercel.

## Estratégia recomendada
### Produção
- branch de produção: `main`
- toda correção de build que estabilize Vercel deve chegar em `main` rapidamente
- não usar branch de experimento como referência de saúde do projeto

### Preview
- previews existem para validação de branch/PR apenas
- preview quebrado não significa produção quebrada
- PRs antigas ou defasadas devem ser rebaseadas ou fechadas para não poluir leitura operacional do Vercel

## Env vars mínimas para runtime funcional do frontend
O frontend compila sem backend, mas para operar de verdade no Vercel ele precisa de envs compatíveis com o backend oficial e Supabase.

### Obrigatórias
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Observação crítica
No código atual, quando `VITE_API_BASE_URL` não existe, o frontend cai para `http://localhost:4000`.
Isso é aceitável apenas em desenvolvimento local. Em ambiente Vercel, essa ausência tende a gerar app compilado com runtime parcialmente quebrado.

## Checklist operacional do Vercel
1. Confirmar que o alias de produção aponta para deploy da `main`
2. Confirmar que o commit de produção tem status `Vercel: success`
3. Confirmar que previews quebrados são apenas de branches de trabalho
4. Confirmar envs `VITE_*` no projeto Vercel
5. Confirmar que o time entende qual `vercel.json` é a fonte real do deploy

## Próxima melhoria sugerida
Quando houver janela de ajuste, alinhar o repositório para um único caminho oficial de deploy:
- ou manter raiz + workspace e limpar a documentação antiga
- ou migrar o projeto Vercel para `Root Directory = frontend` e aposentar o `vercel.json` da raiz

Enquanto isso não for feito, a referência oficial operacional deve ser o estado real validado acima.
