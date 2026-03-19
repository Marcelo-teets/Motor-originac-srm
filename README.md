# Motor-originac-srm

Motor de originação SRM para mapeamento, enriquecimento e monitoramento de startups, empresas de base tecnológica e middle market brasileiro com foco em operações de mercado de capitais, especialmente DCM.

## Estado atual

O projeto agora possui um **MVP backend em TypeScript** com:
- modelo de domínio para empresas, scores, sinais e watchlists;
- base seed em memória para simular dados de originação;
- API HTTP inicial para consulta da base;
- blueprint de evolução técnica em `docs/plano-evolucao-dados.md`.

## Como rodar

```bash
npm run build
npm start
```

A API sobe por padrão em `http://localhost:3000` e, nesta primeira versão, não depende de bibliotecas externas para responder aos endpoints HTTP.

## Endpoints disponíveis

- `GET /health`
- `GET /companies`
- `GET /companies?sector=Fintech`
- `GET /companies?stage=middle_market&minScore=80`
- `GET /companies/:id`
- `GET /companies/:id/signals`
- `GET /companies/:id/timeline`
- `GET /companies/:id/scores`
- `GET /watchlists`

## Exemplos de uso

```bash
curl http://localhost:3000/health
curl http://localhost:3000/companies
curl "http://localhost:3000/companies?thesisTag=capex&minScore=80"
curl http://localhost:3000/companies/cmp-greenbyte
curl http://localhost:3000/watchlists
```

## Documento principal

- [Plano de evolução da solução SRM para originação DCM](docs/plano-evolucao-dados.md)

## Próximo entregável recomendado

Estruturar a próxima versão com:
- persistência em PostgreSQL;
- pipeline de ingestão e normalização real;
- fila de jobs para monitoramento;
- endpoints de atualização e refresh;
- integração com LLM para extração estruturada com evidência.
