# Banco de dados canônico

## Fonte canônica
- DDL principal: `db/schema.sql`
- Migration base: `db/migrations/001_canonical_init.sql`
- Seeds iniciais: `db/migrations/002_seed_core.sql`

## Tabelas agora persistidas/relevantes na PR
- `companies`
- `search_profiles`
- `qualification_snapshots`
- `pattern_catalog`
- `company_patterns`
- `monitoring_outputs`
- `score_snapshots`
- `lead_score_snapshots`

## Observações
- `companies` recebeu `cnpj`, `stage` e `current_funding_structure` para suportar conectores reais e Qualification Agent V1.
- `qualification_snapshots` agora persiste `source_confidence_score`, `trigger_strength_score` e `pattern_summary`.
- `monitoring_outputs` agora separa `output_payload` de `normalized_payload` e registra `connector_status`.
- `pattern_catalog` e `company_patterns` persistem impactos usados pelo ranking dinâmico.
- Os IDs seedados em tabelas centrais são textuais para simplificar bootstrap, evitar conflito entre ambientes locais e manter idempotência de seed.
