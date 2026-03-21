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

## O que esta base já entrega
- Qualification Agent V1 com `qualification_snapshots`, `predicted_funding_need_score`, `urgency_score`, `suggested_structure_type`, rationale e evidence payload.
- Pattern Identification Agent V1 com catálogo inicial dos 10 padrões e impactos em qualification, lead score, thesis e ranking.
- Ranking V2 dinâmico ponderando qualification, lead score, trigger strength, source confidence e pattern impacts.
- Connectors iniciais para BrasilAPI CNPJ, Google News RSS e website monitoring básico.
- Dashboard e Company Detail enriquecidos, mantendo a arquitetura oficial React/Vite + Node/Express.
- Persistência preparada para Supabase REST com fallback local em memória para não deixar a plataforma vazia.

## Como rodar localmente
1. Copie o arquivo de ambiente.
   ```bash
   cp .env.example .env
   ```
2. Ajuste as variáveis conforme o modo desejado.
   - `USE_SUPABASE=false`: usa fallback em memória.
   - `USE_SUPABASE=true`: usa `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`.
3. Instale dependências e suba os apps.
   ```bash
   npm install
   npm run dev:backend
   npm run dev:frontend
   ```

Backend padrão: `http://localhost:4000`
Frontend padrão: `http://localhost:5173`

## Banco e seeds
- DDL canônico: `db/schema.sql`
- Migration base: `db/migrations/001_canonical_init.sql`
- Seeds iniciais: `db/migrations/002_seed_core.sql`
- Documentação detalhada: `docs/database.md`

## Governança de implementação
Consulte `docs/architecture.md` e `docs/status-matrix.md` para distinguir o que está real, parcial, hardcoded, mockado e planejado.

## Estratégia de merge atualizada
Como o clone local não inclui remotes nem branches históricos dos PRs antigos, a consolidação continua sendo feita em **uma nova PR em cima da `main` oficial atual**, documentada em `docs/pr-refresh.md`, sem ressuscitar arquiteturas paralelas.
