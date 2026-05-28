# Motor Originação SRM

Plataforma de **Origination Intelligence** para originação de crédito estruturado, com foco em fintechs, recebíveis, FIDC, DCM, CRI, CRA, debêntures e debêntures incentivadas.

## Estrutura oficial consolidada
- `frontend/`: web app React/Vite.
- `backend/`: API interna consolidada em Node/Express.
- `db/`: DDL canônico e migrations para Supabase/Postgres.
- `config/`: catálogos, scoring, heurísticas e source seeds versionados.
- `connectors/`: base e adaptadores de fontes (`http`, `rss`, `sitemap`, `scraper`, `normalizers`).
- `agents/`: documentação de agentes obrigatórios.
- `docs/`: arquitetura, banco, matriz real/parcial/mock, documentação de merge e runbooks de originação.
- `scripts/`: utilitários de operação local.

## Origination Operating System
A camada operacional de originação agora está versionada no repositório e exposta por API.

### Fonte de verdade
- Código: `backend/src/modules/originationOperatingSystem.ts`
- Rotas auxiliares: `backend/src/routes/originationRouter.ts`
- Migration: `db/migrations/020_origination_operating_system.sql`
- Runbook: `docs/origination-operating-system.md`

### Endpoints principais
- `GET /api/origination/os`
- `GET /api/origination/skills`
- `GET /api/origination/flows`
- `GET /api/origination/backlog`
- `GET /api/origination/templates`
- `GET /api/origination/checklist`
- `GET /api/origination/execution-plan`

### Pendências implementadas
O backlog ORIG-001 a ORIG-020 foi convertido em contrato operacional versionado, cobrindo Company Master, templates, scorecard, pipeline, fontes, ranking semanal, tese, dashboard, triggers, one-pager, sequências de e-mail, hooks, reciclagem, VC/PE monitoring, relatório setorial, copiloto, bases externas, histórico de score e comparáveis.

## O que esta PR torna real
- Supabase REST como camada primária de leitura/escrita para `companies`, `source_catalog`, `monitoring_outputs`, `company_signals`, `score_snapshots`, `lead_score_snapshots`, `qualification_snapshots`, `pattern_catalog`, `company_patterns`, `search_profiles` e `search_profile_filters`.
- Supabase Auth real no backend (`/auth/login`, `/auth/logout`, `/auth/me`) com validação de JWT e rotas protegidas.
- Dashboard, companies, qualification, patterns e sources servidos pelo backend real, com fallback controlado apenas quando o banco não retornar dados.
- Connectors reproduzíveis para BrasilAPI CNPJ, RSS públicos e monitoramento básico de website, gravando `monitoring_outputs`, `company_signals` e `enrichments`.
- Qualification + pattern engine recalculando snapshots a partir de sinais e outputs persistidos.
- Operating System de originação com skills, fluxos, templates, scorecard e backlog consultável por API.

## O que continua parcial
- Agentes mais sofisticados ainda dependem de expansão incremental do AI Router e dos conectores.
- Monitoramento VC/PE dedicado está documentado e plugável, mas o scraper específico deve ser ativado em etapa posterior.
- Frontend ainda precisa consumir os endpoints `/api/origination/*` em uma tela própria do Command Center.

## Como rodar localmente
1. Copie o arquivo de ambiente.
   ```bash
   cp .env.example .env
   ```
2. Preencha **obrigatoriamente** as variáveis abaixo com o projeto Supabase real:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Instale dependências e suba os apps.
   ```bash
   npm install
   npm run dev:backend
   npm run dev:frontend
   ```
4. Se quiser popular o banco automaticamente com a base inicial, mantenha `BOOTSTRAP_SUPABASE=true`.

Backend padrão: `http://localhost:4000`
Frontend padrão: `http://localhost:5173`

## Deploy do frontend na Vercel (isolado)
- O deploy do frontend deve ser configurado com **Root Directory = `frontend/`**.
- Não use o `package.json` da raiz para build na Vercel.
- Build do frontend (isolado) deve executar somente:
  ```bash
  npm install
  npm run build
  ```
- A configuração recomendada está em `frontend/vercel.json`.

## Banco e seeds
- DDL canônico: `db/schema.sql`
- Migration base: `db/migrations/001_canonical_init.sql`
- Seeds iniciais: `db/migrations/002_seed_core.sql`
- Operating System: `db/migrations/020_origination_operating_system.sql`
- Arquivo de ambiente de referência: `.env.example`
- Documentação detalhada: `docs/database.md`

## Governança de implementação
Consulte `docs/architecture.md`, `docs/status-matrix.md` e `docs/origination-operating-system.md` para distinguir o que está real, parcial, hardcoded, mockado e planejado.

## Estratégia de merge atualizada
A implementação continua **em cima da `main` atual**, preservando a arquitetura oficial React/Vite + Node/Express e reduzindo o escopo visual ao mínimo necessário para ativar Supabase/Auth/DB reais e o Operating System de originação.
