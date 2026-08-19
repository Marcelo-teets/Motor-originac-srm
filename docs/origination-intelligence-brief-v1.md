# Origination Intelligence Brief v1

## Objective

Turn observed People & Capital data into an explainable origination decision artifact without creating a parallel scoring or CRM stack.

Flow:

`Monitoring -> Signals -> Enrichment -> Qualification -> Patterns -> Origination Brief -> Lead Score / Thesis -> Ranking / Pipeline`

## Outputs

For every Company Master entity with sufficient decision context the system generates:

- why credit;
- why now;
- probable pattern;
- suggested structure;
- commercial angle;
- next action;
- origination conviction score;
- brief confidence;
- People & Capital evidence snapshot.

The brief is stored as a derived `origination_brief` signal with `observed_vs_inferred = recommended`. Observed headcount/jobs/investor data remain separate from analytical recommendations.

## Hiring evidence guard

Hiring signals are actionable only when evidence explicitly refers to a vacancy/careers context (for example `vaga aberta`, `job posting`, `open position`, `careers`). Editorial keyword matches such as “bank contracts R$ X billion in credit operations” are rejected as hiring signals. Raw monitoring evidence is preserved; only the incorrect derived classification is removed/suppressed.

## Commercial handoff

The brief enriches automated `lead_score_snapshots` with:

- `commercial_angle`;
- `suggested_structure`;
- `next_action`;
- an auditable rationale.

Pipeline next actions are updated only when the current value is blank or a generic machine placeholder. Human-entered next actions are never overwritten.

## Thesis handoff

`buildThesisOutput` prioritizes the deterministic `origination_brief` signal when available. This makes the existing Company Detail surface the consolidated rationale without adding a parallel frontend or endpoint.

## Triggers

The brief refreshes when material evidence changes in:

- `company_signals`;
- `qualification_snapshots`;
- `company_job_openings`;
- `company_source_metric_snapshots` (headcount metrics only);
- `company_investor_relationships`;
- `company_patterns`.

## Governance

- Brazil-only scope remains unchanged.
- No LLM is required to decide the brief.
- Evidence is deterministic and source-backed.
- Observed/inferred/recommended semantics remain explicit.
- No human CRM decision is overwritten.
