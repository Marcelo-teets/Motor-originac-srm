# Decision Eligibility Hardening — Production Rollout

Date: 2026-07-24

## Release scope

This rollout publishes the runtime and database contract merged in PR #233:

- verified entity is not automatically a decision lead;
- monitoring reads identity-approved real entities;
- qualification, patterns, score, lead score, thesis and ranking read only decision-eligible companies;
- pipeline, activities and tasks use the same decision gate;
- synthetic snapshots remain available only for audit;
- memory mode keeps the local demo fallback.

## Current production data state

- Company Master rows: 9;
- verified real entities: 1;
- monitoring-eligible entities: 1;
- decision-eligible companies: 0;
- synthetic demo companies: 8;
- promoted candidates: 1;
- candidate with reconciled CNPJ: Creditas;
- credit classification for Creditas: `not_reviewed`;
- decision gate: closed.

## Acceptance criteria

- CI typecheck and build green;
- Preview READY;
- Supabase Security Advisor without new implementation warnings;
- canonical deployment includes commit `e53086043fd9e99c759211dbadd522a3f028c8af` or a direct descendant;
- `/api/health` returns HTTP 200;
- Company Master readiness remains `gateOpen=false` until credit evidence review.
