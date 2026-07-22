# Public Data Downstream Intelligence

## Objective

Convert official public records into consistent origination decisions across the full chain:

`public_company_records → monitoring_outputs → company_signals → qualification → patterns → lead score → ranking → thesis → pipeline/tasks`.

## Decision model

The database function `get_company_public_evidence(company_id)` deduplicates official evidence and produces one canonical decision payload with:

- opportunity score;
- risk penalty and risk level;
- evidence coverage and freshness;
- amounts by public contract, public financing and fiscal debt;
- strongest opportunity and risk;
- why-now statements;
- due-diligence actions;
- recommended structures, pipeline stage and next action.

## Source-specific behavior

| Evidence | Origination treatment |
|---|---|
| Public contracts | Raises receivables/FIDC fit and opens contract-assignment diligence |
| BNDES/public financing | Opens complement, refinancing and tenor-extension angles |
| PGFN | Raises funding urgency but reduces executability until certificates and regularization are validated |
| CEIS/CNEP | Caps qualification, lead score and ranking; blocks standard approach when active/material |
| RFB material change | Creates a fresh timing window for reorganization, expansion or capital-cycle confirmation |

## Guardrails

- Baseline RFB snapshots do not score; only material changes flow downstream.
- Risk never becomes a positive lead merely because it increases urgency.
- A blocking compliance event caps qualification at 59, lead/ranking at 54 and returns the pipeline to `Identified` unless the deal is already in structuring or beyond.
- Open diligence tasks are deduplicated by company and action.
- Pipeline advancement depends on both score and executability.
- All executors are covered because the guardrails are applied through PostgreSQL triggers.

## Runtime orchestration

After each successful public bulk ingestion, `PublicDataDownstreamService` identifies affected Company Master records and calls the official `PlatformService.recomputeDerivedData(companyId)`. The database triggers then enrich every written snapshot and refresh Ranking V2.

## Validation

The dedicated workflow runs:

- downstream service unit tests;
- ranking risk-cap test;
- public-contract thesis test;
- backend typecheck;
- frontend build.
