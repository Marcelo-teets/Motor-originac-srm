# MVP 1.0 — checklist de ativação

## GitHub
- usar a PR #44 como trilha de fechamento da Watch List
- confirmar status do deploy na PR
- revisar diff final
- tirar de draft e seguir para merge quando o checklist estiver verde
- manter no repositório as migrations 013, 014 e 015
- manter publicado o plano do MVP e este checklist

## Supabase
### Ordem oficial de execução
1. `db/migrations/013_watchlist_mvp.sql`
2. `db/migrations/014_rls_runtime_core.sql`
3. `db/migrations/015_origination_command_center_views.sql`

### Verificações mínimas
- tabela `watchlists` criada
- tabela `watchlist_items` criada
- RLS ativa para `watchlists`, `watchlist_items`, `pipeline`, `activities`, `tasks`, `company_patterns`
- view `origination_company_command_center_v1` criada

### Variáveis obrigatórias do backend
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USE_SUPABASE=true`

## Vercel
### Configuração esperada
- Project Root Directory = `frontend/`
- framework = Vite
- build command = `npm run build`
- install command = `npm install`

### Variáveis obrigatórias do frontend
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Verificações mínimas
- build verde
- app abre a tela de login
- navegação para dashboard, leads e watch list funcionando
- requests autenticadas chegando no backend

## Smoke test do fluxo de negócio
1. fazer login
2. abrir dashboard
3. abrir leads
4. acessar uma empresa
5. salvar a empresa em uma watch list
6. abrir a tela de watch list
7. validar o item salvo
8. mover a empresa para pipeline
9. criar uma activity
10. criar uma task
11. rodar monitoring manual da empresa
12. validar sinal, score e feed recente

## Critério de liberação
### Liberar
- login real funcionando
- Supabase respondendo com dados reais
- Watch List funcional
- Pipeline, activities e tasks persistindo
- deploy Vercel navegável
- smoke test aprovado

### Não liberar
- login quebrado
- frontend publicado com env errada
- watch list sem persistência
- pipeline sem gravação
- dados principais vindo só de fallback mock
