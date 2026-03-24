# Motor Originação SRM

Plataforma de **Origination Intelligence** para originação de crédito estruturado, com foco em fintechs, recebíveis, FIDC, DCM, nota comercial e debêntures.

## Estrutura oficial consolidada
- `frontend/`: web app React/Vite.
- `backend/`: API interna consolidada em Node/Express.
- `db/`: DDL canônico e migrations para Supabase/Postgres.
- `config/`: catálogos, scoring, heurísticas e source seeds versionados.
- `connectors/`: base e adaptadores de fontes (`http`, `rss`, `sitemap`, `scraper`, `normalizers`).
- `agents/`: documentação de agentes obrigatórios.
- `docs/`: arquitetura, banco, matriz real/parcial/mock e documentação de merge.
- `scripts/`: utilitários de operação local.

## O que esta PR torna real
- Supabase REST como camada primária de leitura/escrita para `companies`, `source_catalog`, `monitoring_outputs`, `company_signals`, `score_snapshots`, `lead_score_snapshots`, `qualification_snapshots`, `pattern_catalog`, `company_patterns`, `search_profiles` e `search_profile_filters`.
- Supabase Auth real no backend (`/auth/login`, `/auth/logout`, `/auth/me`) com validação de JWT e rotas protegidas.
- Dashboard, companies, qualification, patterns e sources servidos pelo backend real, com fallback controlado apenas quando o banco não retornar dados.
- Connectors reproduzíveis para BrasilAPI CNPJ, RSS públicos e monitoramento básico de website, gravando `monitoring_outputs`, `company_signals` e `enrichments`.
- Qualification + pattern engine recalculando snapshots a partir de sinais e outputs persistidos.

## O que continua parcial
- Pipeline operacional avançado, tasks e agentes mais sofisticados continuam com respostas parciais/controladas.
- Monitoring health mais profundo e conectores além dos prioritários ainda não foram expandidos nesta PR.
- Monitoring/agents/pipeline no frontend ainda consolidam parte da visão a partir de endpoints reais + derivação local leve.

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

## Banco e seeds
- DDL canônico: `db/schema.sql`
- Migration base: `db/migrations/001_canonical_init.sql`
- Seeds iniciais: `db/migrations/002_seed_core.sql`
- Arquivo de ambiente de referência: `.env.example`
- Documentação detalhada: `docs/database.md`

## Governança de implementação
Consulte `docs/architecture.md` e `docs/status-matrix.md` para distinguir o que está real, parcial, hardcoded, mockado e planejado.

## Estratégia de merge atualizada
A implementação continua **em cima da `main` atual**, preservando a arquitetura oficial React/Vite + Node/Express e reduzindo o escopo visual ao mínimo necessário para ativar Supabase/Auth/DB reais.
