# API consolidada

Base URL local: `http://localhost:8000/api/v1`

## Endpoints principais
- `GET /health`: healthcheck da API.
- `GET /sources`: lista fontes BR disponíveis; suporta `category`.
- `GET /companies`: lista empresas; suporta `sector` e `stage`.
- `POST /companies`: cria empresa com deduplicação por CNPJ e nome normalizado.
- `GET /signals`: lista sinais; suporta `company_id`.
- `POST /signals`: cria sinal para empresa e recalcula score.
- `GET /companies/{company_id}/score`: score atual.
- `GET /companies/{company_id}/score/history`: histórico de score.
- `GET /companies/{company_id}/thesis`: síntese de tese comercial.
- `GET /market-map`: agregação por setor.

## Exemplo de criação de empresa
```json
{
  "name": "Gamma Energia",
  "cnpj": "11222333000181",
  "sector": "energy",
  "stage": "qualified"
}
```

## Exemplo de criação de sinal
```json
{
  "company_id": "<uuid>",
  "source_id": "cvm",
  "signal_type": "expansion",
  "strength": 80,
  "summary": "Nova expansão regional confirmada"
}
```
