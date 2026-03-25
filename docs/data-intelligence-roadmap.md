# Data Intelligence Roadmap

## Objetivo
Construir a frente de dados do Motor de Originação usando a stack oficial:
- Supabase
- backend Node + TypeScript
- frontend React + Vite
- GitHub + Vercel

## Escopo da frente de dados
A camada de dados deve responder:
1. quais fontes alimentam o motor
2. como cada dado entra
3. como o dado bruto é tratado
4. como o dado é vinculado a empresas
5. como o dado vira facts
6. como o dado vira signals
7. como o dado vira enrichment
8. como isso abastece qualification, patterns, ranking, thesis e pipeline

## Estrutura implementada nesta fase
### Supabase foundation
- connector_registry
- source_endpoints
- ingestion_runs
- raw_documents
- company_source_links
- company_source_facts
- enrichment_snapshots
- signal_extractions
- company_aliases

### Backend foundation
- source catalog centralizado
- signal rules centralizadas
- parsing service para JSON / RSS / HTML
- data intelligence service para:
  - seed de catálogo
  - runs de ingestão
  - gravação de raw docs
  - facts
  - signals
  - enrichment snapshots
  - aliases

## Tipos de fontes priorizadas
1. APIs públicas
2. RSS / feeds
3. websites das empresas
4. scrapers em casos específicos

## Fontes prioritárias desta fase
- BrasilAPI CNPJ
- RSS NeoFeed
- RSS Startupi
- websites das empresas
- Open Startups ranking
- Painel FIDC dataset

## Motores de análise
### 1. Engine de matching
Objetivo: vincular documentos a empresas usando:
- CNPJ
- razão social
- nome fantasia
- aliases
- domínio

### 2. Engine de facts
Objetivo: extrair fatos estruturados como:
- evidência de produto de crédito
- evidência de recebíveis
- funding event
- indício de FIDC
- geografia
- sinais de expansão

### 3. Signal engine
Objetivo: transformar narrativa em sinais operacionais com:
- signal_type
- strength
- confidence
- rationale

### 4. Enrichment engine
Objetivo: consolidar facts e signals em snapshots utilizáveis por:
- qualification
- patterns
- ranking
- thesis

## Próximos passos recomendados
1. criar rotas backend para catálogo, ingestion runs, raw docs e signals
2. plugar seed automático do catálogo no bootstrap
3. criar connector runners por tipo de endpoint
4. criar matching heurístico company <-> raw documents
5. alimentar dashboard de monitoramento com ingestion runs reais
6. ligar signals/facts ao motor atual de qualification e patterns

## Princípio
Não criar uma camada de dados paralela.
Tudo deve alimentar diretamente o Motor de Originação oficial.
