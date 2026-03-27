# Data Capture and Enrichment Engines Blueprint

Objective: formalize two engines plugged into the existing Motor pipeline.

1. Data Capture Engine
- collect from approved public sources
- persist raw and normalized evidence
- register runs, confidence and failures
- deduplicate by fingerprint/hash

2. Data Treatment / Enrichment Engine
- classify captured outputs
- extract signals
- enrich company profile
- separate observed, inferred and estimated fields
- prepare evidence for qualification, patterns, thesis and ranking

Plug-in points already present in the backend:
- PlatformService.refreshMonitoring() => Data Capture Engine
- PlatformService.recomputeDerivedData() => Data Treatment / Enrichment Engine

Priority sources:
- company websites
- Google News / niche RSS
- BrasilAPI / official CNPJ signals
- VC portfolio pages
- CVM / ANBIMA / FIDC public data

Recommended module layout:
- backend/src/modules/data-capture/types.ts
- backend/src/modules/data-capture/sourceConnectorRegistry.ts
- backend/src/modules/data-capture/dataCaptureEngine.ts
- backend/src/modules/data-enrichment/types.ts
- backend/src/modules/data-enrichment/dataTreatmentEngine.ts

Integration order:
1. add run control + source documents + aliases tables
2. add engine contracts
3. wire PlatformService
4. add operational routes
5. add frontend observability panels
