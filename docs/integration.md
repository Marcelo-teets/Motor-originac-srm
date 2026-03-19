# Integração frontend/backend

## Integrações reais implementadas
- `GET /health` no dashboard.
- `GET /sources` na tela de fontes e no dashboard.
- `GET /companies` e `POST /companies` na tela de empresas.
- `GET /signals` e `POST /signals` na operação de empresa.
- `GET /companies/{id}/score` e histórico.
- `GET /companies/{id}/thesis`.
- `GET /market-map` no dashboard.

## Estratégia de falha
A UI mantém mensagens simples para loading, erro e sem dados. A integração usa um client centralizado em `src/lib/api.js` com base URL por ambiente.
