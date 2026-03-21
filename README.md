# Motor-originac-srm

Motor de originação SRM para mapeamento, enriquecimento e monitoramento de startups, empresas de base tecnológica e middle market brasileiro com foco em operações de mercado de capitais, especialmente DCM.

## Estado atual

O projeto agora possui um **backend TypeScript funcional** com:
- modelo de domínio para empresas, scores, sinais e watchlists;
- persistência local em arquivo JSON para manter o estado entre execuções;
- API HTTP com leitura, criação e refresh de entidades principais;
- testes automatizados com `node:test` para repositório e servidor;
- blueprint de evolução técnica em `docs/plano-evolucao-dados.md`.

## Como rodar

```bash
npm run build
npm start
```

A API sobe por padrão em `http://localhost:3000`.

### Arquivo de dados

Por padrão a API persiste os dados em `var/srm-db.json`.
Se quiser usar outro arquivo, defina a variável `SRM_DATA_FILE`.

```bash
SRM_DATA_FILE=./var/dev-srm-db.json npm start
```

## Endpoints disponíveis

### Leitura
- `GET /health`
- `GET /companies`
- `GET /companies?q=energia`
- `GET /companies?stage=middle_market&minScore=80`
- `GET /companies/:id`
- `GET /companies/:id/signals`
- `GET /companies/:id/timeline`
- `GET /companies/:id/scores`
- `GET /watchlists`

### Mutações
- `POST /companies`
- `POST /companies/:id/refresh`
- `POST /watchlists`

## Exemplos de uso

```bash
curl http://localhost:3000/health
curl http://localhost:3000/companies
curl "http://localhost:3000/companies?q=energia&minScore=80"
curl -X POST http://localhost:3000/companies \
  -H 'content-type: application/json' \
  -d '{
    "legalName": "Radar API S.A.",
    "tradingName": "RadarAPI",
    "cnpj": "56.789.012/0001-56",
    "sector": "Developer Tools",
    "subsector": "APIs",
    "headquarters": "Florianópolis, SC",
    "stage": "growth",
    "website": "https://radarapi.example.com",
    "thesisTags": ["apis", "developer-tools"],
    "dcmThesis": "Expansão de base enterprise com potencial de funding para crescimento.",
    "fundingNeedIndicators": ["expansão internacional"],
    "governanceHighlights": ["board mensal"]
  }'
curl -X POST http://localhost:3000/companies/cmp-neofin/refresh \
  -H 'content-type: application/json' \
  -d '{"summary": "Atualização manual após reunião com CFO."}'
```

## Testes

```bash
npm test
```

## Documento principal

- [Plano de evolução da solução SRM para originação DCM](docs/plano-evolucao-dados.md)

## Próximos entregáveis recomendados

- migrar a persistência para PostgreSQL;
- adicionar pipeline de ingestão e normalização real;
- incluir jobs de monitoramento e refresh automático;
- expor endpoints para scores explicáveis e revisão humana;
- integrar extração estruturada com LLM + evidência.
