# Origination Intelligence Platform — V7

Implementação base da V7 com backend em FastAPI/SQLAlchemy, migrations Alembic, persistência dos módulos novos e frontend estático integrado com a tela de empresa e a tela `/rankings-v2`.

## Estrutura

- `backend/`: API principal, service layer, models, schemas, repositories, migration e testes.
- `frontend/`: páginas HTML/JS/CSS para detalhe de empresa e rankings dinâmicos V2.

## Backend V7

### Endpoints principais

- `POST /api/v1/entity-resolution/resolve`
- `POST /api/v1/source-governance/validate`
- `POST /api/v1/thesis/generate`
- `POST /api/v1/market-map/company-card`
- `GET /api/v1/score-history/companies/{company_id}`
- `POST /api/v1/orchestration/companies/{company_id}/full-pipeline-v2`
- `GET /api/v1/rankings/v2`
- `GET /api/v1/companies/{company_id}/thesis`
- `GET /api/v1/companies/{company_id}/market-map`
- `GET /api/v1/companies/{company_id}/monitoring-output`

### Pipeline V7

A orquestração executa e registra a sequência abaixo:

1. monitoring
2. research
3. enrichment
4. scoring
5. trigger
6. ranking
7. score_history
8. thesis
9. market_map

### Persistência criada

Tabelas novas via Alembic:

- `thesis_outputs`
- `market_map_cards`
- `monitoring_outputs`
- `score_history_v2`

## Como rodar

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

Sirva a pasta `frontend/` em qualquer servidor estático, por exemplo:

```bash
cd frontend
python -m http.server 4173
```

Depois abra:

- `http://localhost:4173/company.html?companyId=1`
- `http://localhost:4173/rankings-v2.html`

## Como testar o fluxo V7

1. Suba a API FastAPI.
2. Execute `POST /api/v1/orchestration/companies/1/full-pipeline-v2`.
3. Consulte os artefatos persistidos:
   - `GET /api/v1/companies/1/monitoring-output`
   - `GET /api/v1/score-history/companies/1`
   - `GET /api/v1/companies/1/thesis`
   - `GET /api/v1/companies/1/market-map`
   - `GET /api/v1/rankings/v2`
4. Abra a tela da empresa e a tela de rankings para validar a integração frontend.

## Testes mínimos

```bash
cd backend
pytest
```
