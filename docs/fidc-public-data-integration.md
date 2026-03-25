# FIDC Public Data Integration Foundation

## Objective

Add a native FIDC public-data layer to Motor so the platform can connect:

- fund registration and document datasets from CVM
- structured funds data from ANBIMA
- participant/provider enrichment from Infosimples CVM Participante
- public-sector cross checks through Portal da Transparência

This foundation is intentionally aligned with the existing Motor architecture:

Search Profile
→ Sources
→ Monitoring
→ Raw Outputs
→ Signals
→ Enrichment
→ Qualification
→ Patterns
→ Score / Lead Score
→ Thesis
→ Ranking
→ Pipeline

## Design principles

1. **No parallel stack**
   - All integrations must stay in the Node + TypeScript backend.
   - Persistence remains Supabase.
   - GitHub remains the source of truth.

2. **Public/open sources first**
   - CVM datasets and dataset metadata
   - ANBIMA developers APIs
   - Portal da Transparência API
   - Infosimples only when tokened enrichment is explicitly enabled

3. **Dataset API mindset for CVM**
   - CVM is treated as a stable dataset source rather than a classic JSON API.
   - Monthly ZIP/CSV resources should be monitored and ingested on a schedule.

4. **Explainability**
   - Every enrichment must preserve source, dataset name, reference month/date, and confidence.

## Priority sources added in this package

### FIDC / funds
- `src_cvm_fidc_informe_mensal`
- `src_cvm_fundos_cadastral`
- `src_cvm_fundos_estruturados_medidas`
- `src_cvm_fundos_documentos_entrega`
- `src_anbima_fundos_estruturados`
- `src_anbima_fundos_icvm_555`
- `src_infosimples_cvm_participante`

### Cross-check / public exposure
- `src_portal_transparencia_api`

## Canonical use cases

### 1. FIDC market map
Use CVM + ANBIMA to build:
- FIDC inventory
- active vs closed funds
- senior / mezz / subordinated class view
- managers, administrators, custodians and auditors by CNPJ
- ICVM/RCVM 175 adaptation status
- historical reference dates

### 2. Originator ↔ FIDC ↔ service provider graph
Use:
- `cnpj_fundo` from CVM / ANBIMA
- `codigo_anbima`
- `isin`
- provider `cnpj`
- participant `cnpj` from Infosimples

to connect:
- fund
- classes/series
- administrators
- managers
- custodians
- auditors
- possible commercial stakeholders and ecosystem nodes

### 3. Cross-check with company intelligence
Use existing company registry and future company master connectors to map:
- originators with existing structured funds
- service providers already active in FIDC ecosystems
- public-sector exposure of administrators/managers via Portal da Transparência

## Planned runtime wiring

### Monitoring / raw outputs
- CVM resource discovery by dataset package
- ANBIMA paginated pulls for structured funds
- periodic provider enrichment for selected funds/providers

### Enrichment
- normalize fund identities
- normalize class/series attributes
- normalize provider roster
- normalize dataset reference period

### Signals / patterns
Examples:
- existing_fidc_ecosystem_presence
- structured_funding_maturity
- service_provider_density
- rcvm_175_transition_signal
- public_sector_provider_exposure

## Next implementation steps

1. Wire the new source catalog into `sourceCatalogSeeds`.
2. Create a FIDC ingestion job for CVM monthly ZIP datasets.
3. Add ANBIMA structured funds pagination runner.
4. Normalize provider CNPJs into the Motor graph.
5. Reuse Portal da Transparência for provider exposure checks.
6. Feed qualification/patterns with explicit FIDC ecosystem evidence.
