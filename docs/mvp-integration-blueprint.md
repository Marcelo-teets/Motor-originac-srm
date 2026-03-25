# MVP Integration Blueprint

## Objetivo do MVP
Ter um Motor de Originação utilizável de fato, com:
- catálogo real de fontes
- runs de ingestão
- documentos brutos
- entity resolution
- facts
- signals
- enrichment
- qualification, patterns, ranking e thesis
- pipeline operacional
- memória e melhoria contínua dos agentes

## Fluxo ponta a ponta
1. Seed do catálogo de conectores e endpoints no Supabase
2. Execução de connector runners por endpoint
3. Persistência de ingestion runs
4. Persistência de raw documents
5. Matching documento -> empresa
6. Geração de facts
7. Geração de signals
8. Consolidação em enrichment snapshots
9. Alimentação de qualification / patterns / ranking / thesis
10. Conversão em pipeline operacional
11. Captura de feedback e aprendizado
12. Geração de backlog de melhoria contínua

## Rotas mínimas do backend para o MVP
- /data-intelligence/catalog
- /data-intelligence/catalog/seed
- /data-intelligence/runs/start
- /data-intelligence/runs/:id/finalize
- /data-intelligence/raw-documents
- /data-intelligence/companies/:companyId/aliases
- /data-intelligence/companies/:companyId/enrich
- /data-intelligence/entity-resolution/match
- /agent-learning/memory
- /agent-learning/feedback
- /agent-learning/improvements
- /agent-learning/learn

## Próximas integrações obrigatórias
### backend
- registrar routers novos no server principal
- chamar seedCatalog no bootstrap
- criar endpoint para rodar catalog bootstrap
- plugar connector runner ao monitoring atual

### intelligence
- ligar signal_extractions e company_source_facts ao qualification agent
- alimentar pattern identification com enrichment_snapshots
- usar signals/facts no ranking e thesis

### frontend
- criar telas/abas para data intelligence
- criar telas/abas para agent learning
- mostrar health da camada de fontes e runs

### governança
- Miro para roadmap/arquitetura executiva
- Lovable para console MVP e camadas visuais do produto
- Vercel como esteira de preview e produção

## Princípio
Não separar a frente de dados do produto principal.
Tudo deve entrar no Motor oficial e aumentar capacidade de originar operações reais.
