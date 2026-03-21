# Motor Originação SRM

Plataforma de **Origination Intelligence** para originação de crédito estruturado, com foco em fintechs, recebíveis, FIDC, DCM, nota comercial e debêntures.

## Estrutura oficial consolidada
- `frontend/`: web app React/Vite.
- `backend/`: API interna consolidada em Node/Express.
- `db/`: DDL canônico e migrations iniciais para Supabase/Postgres.
- `config/`: catálogos, scoring, heurísticas e source seeds hardcoded/documentados.
- `connectors/`: base e adaptadores de fontes (`http`, `rss`, `sitemap`, `scraper`, `normalizers`).
- `agents/`: documentação de agentes obrigatórios.
- `docs/`: arquitetura, matriz real/parcial/mock e documentação de merge.
- `scripts/`: utilitários de operação local.

## Como rodar localmente
```bash
npm install
npm run dev:backend
npm run dev:frontend
```

Backend padrão: `http://localhost:4000`
Frontend padrão: `http://localhost:5173`

## Funcional hoje
- Login demo.
- Dashboard executivo.
- Search Profiles builder.
- Lista de leads/companies.
- Company Detail rica.
- Monitoring Center.
- Sources catalog.
- Agents Control.
- Pipeline / Activities.
- API interna com os endpoints estratégicos pedidos.
- Qualification score v1 + lead score v1.
- DDL canônico sincronizado com documentação.

## Governança de implementação
Consulte `docs/architecture.md` e `docs/status-matrix.md` para distinguir o que está real, parcial, hardcoded, mockado e planejado.

## Estratégia de merge atualizada
Como o clone local não inclui remotes nem branches históricos de PR, o refresh para merge foi consolidado em um único fluxo documentado em `docs/pr-refresh.md`.

Esse fluxo registra:
- o diagnóstico do estado local encontrado;
- a decisão de consolidar tudo na branch `work`;
- os checks usados para validar ausência de conflitos locais;
- o racional para abrir um PR novo e mergeável a partir da base atual.
