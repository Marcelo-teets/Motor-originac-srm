# Arquitetura do Motor Originação SRM

## Objetivo desta fase
Esta primeira iteração implementa um backend funcional para originação e inteligência comercial, com foco em resolução de entidades, governança de fontes, ingestão de sinais, score, tese determinística e fundação de market map.

## Domínio principal

### Company
Representa a empresa monitorada. A resolução evita duplicidade por CNPJ normalizado e por nome normalizado.

### Source
Representa uma fonte BR governada. O catálogo inicial combina bases regulatórias, cadastro, jurídico, notícias e mercado.

### Signal
Representa um evento ou evidência associada à empresa, sempre vinculado a uma fonte permitida.

### ScoreSnapshot
Representa um cálculo histórico do score da empresa após cada novo sinal.

### Thesis
Representa a síntese textual gerada de forma determinística com base em score, sinais e qualidade das fontes.

### MarketMapCard
Representa um resumo operacional para visão futura de mapa de mercado.

## Camadas

### API
Rotas FastAPI finas. Fazem validação HTTP, delegam a services e retornam modelos de resposta.

### Services
Contêm a lógica de produto:
- `EntityResolutionService`: normalização, deduplicação e busca de empresas.
- `SourceGovernanceService`: seed e validação de fontes BR-only.
- `MonitoringService`: ingestão de sinais e disparo do recálculo de score.
- `ScoringService`: cálculo explícito e histórico de snapshots.
- `ThesisService`: tese determinística, cache em memória e regeneração quando necessário.
- `MarketMapService`: consolidação resumida para evolução futura.

### Repository
`InMemoryRepository` centraliza todo o estado em memória. Isso evita estado global espalhado e simplifica a futura substituição por persistência real.

## Fluxo principal
1. A aplicação sobe e semeia o catálogo inicial de fontes.
2. `POST /companies` cria ou resolve empresa já existente.
3. `POST /signals` valida empresa e fonte, persiste o sinal e recalcula o score.
4. `GET /scores/{company_id}` e `/history` expõem score atual e histórico.
5. `GET /thesis/{company_id}` gera ou reutiliza tese coerente com os dados atuais.
6. `GET /market-map/{company_id}` monta um card resumido com score e sinais-chave.

## Decisões arquiteturais
- **FastAPI + Pydantic** para velocidade, clareza e documentação automática.
- **Estado em memória único** porque a rodada pede simplicidade operacional e zero dependência externa.
- **Deduplicação por CNPJ e nome normalizado** como fundação real de entity resolution.
- **Score por sinais ponderados por confiabilidade da fonte** para conectar monitoramento e governança desde o início.
- **Tese determinística** para facilitar teste, previsibilidade e auditoria.

## Limites desta fase
- Sem banco persistente.
- Sem autenticação.
- Sem ingestão externa automatizada.
- Sem UI.
- Sem workflow de revisão humana.

## Evolução natural
A base já está preparada para trocar o repositório em memória por persistência real, adicionar versionamento de tese, novas categorias de fontes, regras de score mais sofisticadas e jornadas assistidas por copilot.
