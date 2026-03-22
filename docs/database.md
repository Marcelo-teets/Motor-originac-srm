# Banco de dados canônico

## Fonte canônica
- DDL principal: `db/schema.sql`
- Migration base: `db/migrations/001_canonical_init.sql`
- Seeds iniciais: `db/migrations/002_seed_core.sql`

## Tabelas agora persistidas/relevantes na PR
- `companies`
- `source_catalog`
- `monitoring_outputs`
- `company_signals`
- `score_snapshots`
- `lead_score_snapshots`
- `qualification_snapshots`
- `pattern_catalog`
- `company_patterns`
- `search_profiles`
- `search_profile_filters`
- `enrichments`

## O que virou real nesta PR
- O backend grava e lê Supabase REST como primeira opção e só recorre ao fallback em memória quando o banco está vazio ou indisponível.
- `search_profiles` agora persiste também a decomposição de filtros em `search_profile_filters`.
- `monitoring_outputs` registra `normalized_payload` com `sourceUrl`, `timestamp` e `confidenceScore` para conectores rastreáveis.
- `qualification_snapshots` e `company_patterns` passaram a refletir sinais reais persistidos, impactando qualification, funding need, urgency e lead score.

## Seeds iniciais úteis
- 10+ `companies` realistas para a plataforma parecer viva mesmo antes do volume externo crescer.
- `source_catalog` com BrasilAPI, Google News RSS, Valor/Google News RSS, CVM RSS e website monitoring.
- `pattern_catalog` com catálogo inicial e detecção prioritária de 5 padrões reais.
- 3 `search_profiles` iniciais.
- `search_profile_filters` iniciais para os perfis seedados.

## O que continua parcial/mock
- `pipeline`, `tasks`, parte de `agents` e health operacional avançado ainda não têm persistência completa.
- Conectores além de BrasilAPI/RSS/website seguem fora do escopo desta PR.
