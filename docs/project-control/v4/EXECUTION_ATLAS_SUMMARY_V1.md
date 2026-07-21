# Motor Originação — Atlas Resumido de Execução

## 1. Orquestração

```mermaid
flowchart TB
  PO[Product/Origination Supervisor] --> O[Master Orchestrator]
  O --> DS[Data Supervisor]
  O --> CS[Credit Supervisor]
  O --> OS[Commercial Supervisor]
  O --> RS[Release/Security Supervisor]
  DS --> SP[Search Profile Planner]
  DS --> SR[Source Router]
  DS --> CR[Connector Runner]
  DS --> ER[Entity Resolver]
  DS --> DQ[Data Quality]
  CS --> SE[Signal Extractor]
  CS --> TE[Trigger Evaluator]
  CS --> QA[Qualification Analyst]
  CS --> PM[Pattern Matcher]
  CS --> SC[Score Compiler]
  CS --> TG[Thesis Generator]
  CS --> MM[Market Map Structurer]
  OS --> RP[Ranking/Pipeline Planner]
  OS --> PC[Paper Clip Executor]
  RS --> AU[Auth/RLS Auditor]
  RS --> MV[Migration Validator]
  RS --> DV[Deployment Verifier]
  O --> H[Human Approval Gate]
  H --> O
```

Especialistas não se autoaprovam. Promoção fuzzy, tese, estrutura, contato externo e ação destrutiva exigem gate humano.

## 2. Search Profile run

```mermaid
sequenceDiagram
  autonumber
  participant T as Manual/Cron
  participant API as API/Auth
  participant O as Search Orchestrator
  participant DB as Supabase
  participant D as Discovery
  participant S1 as News RSS
  participant S2 as VC Portfolio
  participant ER as Entity Resolver

  T->>API: POST profile run + bearer + idempotency
  API->>O: authorize/runCapture
  O->>DB: load active profile
  O->>DB: insert run running
  par fan-out
    O->>S1: fetch query
    S1-->>D: hits/error/empty
  and
    O->>S2: fetch portfolios
    S2-->>D: hits/error/empty
  end
  D->>ER: normalized hits
  ER->>ER: CNPJ > domain > name/aliases
  ER->>DB: insert captured/deduped candidates
  ER->>DB: update run completed/partial/failed
  DB-->>API: run id and counters
```

Falhas: 401/403 sem writes; profile inativo 409; source degradada gera `partial`; todas falham gera `failed`; lease expirado gera recovery; retry não duplica run/candidato.

## 3. Candidate lifecycle

```mermaid
stateDiagram-v2
  [*] --> captured
  [*] --> deduped
  captured --> promoted: human approve
  captured --> discarded: no fit/insufficient
  deduped --> promoted: confirm match
  deduped --> discarded: false match
  discarded --> captured: supervised reopen
  promoted --> superseded: identity correction
  promoted --> [*]
```

Promotion target: company upsert + discovery link + candidate update na mesma transação lógica; monitoring/recompute como hooks pós-commit auditáveis.

## 4. Monitoring e signals

```mermaid
sequenceDiagram
  participant T as Scheduler
  participant O as Monitoring Orchestrator
  participant C as Connector
  participant V as Validator
  participant DB as Supabase
  participant S as Signal Extractor
  T->>O: run scope
  O->>DB: connector run running
  O->>C: fetch quota/timeout
  C-->>V: raw/error/empty
  alt valid
    V->>DB: outputs/documents
    V->>S: evidence
    S->>DB: signals/enrichments
    V->>DB: run completed
  else subset valid
    V->>DB: subset + run partial/error taxonomy
  else fatal
    V->>DB: run failed
  end
```

## 5. Signal → Trigger → Recompute

```mermaid
flowchart LR
  O[Output] --> E[Evidence]
  E --> S[Signal]
  S --> M[Materiality]
  M -->|weak| STORE[Signal only]
  M -->|material| F[Fingerprint]
  F --> D{Duplicate in window?}
  D -->|yes| C[Corroborate existing]
  D -->|no| T[Insert trigger]
  T --> Q[Qualification]
  Q --> P[Patterns]
  P --> R[Score/Ranking]
  R --> A[Pipeline alert/task]
```

## 6. Qualification e thesis

```mermaid
flowchart TB
  EV[Evidence bundle] --> Q[Qualification questions]
  Q --> P[Pattern Match]
  P --> S[Score + explanation]
  S --> G{Top/material?}
  G -->|no| H[History]
  G -->|yes| TH[Thesis draft]
  TH --> CR[Credit review]
  CR --> MM[Market Map]
  MM --> HR[Human approval]
  HR --> PIPE[Pipeline plan]
```

## 7. Pipeline

```mermaid
stateDiagram-v2
  [*] --> Identified
  Identified --> Qualified
  Qualified --> Contacted
  Contacted --> Meeting
  Meeting --> Diligence
  Diligence --> Structuring
  Structuring --> Committee
  Committee --> Mandated
  Mandated --> ClosedWon
  Qualified --> Monitoring
  Contacted --> Monitoring
  Monitoring --> Qualified
  Meeting --> ClosedLost
  Diligence --> ClosedLost
  Structuring --> ClosedLost
  Committee --> ClosedLost
  ClosedWon --> ROFR
  ROFR --> Monitoring
```

Toda transição registra actor, timestamp, reason, evidence, previous/new stage, next action e due date.

## 8. Paper Clip durável

```mermaid
sequenceDiagram
  autonumber
  participant U as User/Agent
  participant API as Command API
  participant Q as engine_requests
  participant W as Worker
  participant R as ai_agent_runs
  participant D as Tasks/Activities
  U->>API: command + idempotency key
  API->>API: auth + allowlist + schema
  API->>Q: queued or existing
  W->>Q: atomic lease/running
  W->>R: running audit
  alt success
    W->>D: persist output
    W->>R: completed
    W->>Q: completed
  else transient
    W->>R: failed attempt
    W->>Q: retry_scheduled
  else permanent/max attempts
    W->>R: failed final
    W->>Q: dead_letter
  end
```

## 9. Release

```mermaid
sequenceDiagram
  participant E as Engineer
  participant G as GitHub
  participant CI as CI
  participant S as Supabase
  participant V as Vercel Preview
  participant R as Reviewer
  participant P as Production
  E->>G: atomic PR from latest main
  G->>CI: typecheck/lint/tests/build
  E->>S: migration transaction/advisors
  G->>V: preview
  R->>V: auth/data/UI smoke
  R->>G: approve/merge
  G->>P: main deployment
  R->>P: canonical SHA/e2e smoke
```

## 10. Incident

```mermaid
flowchart LR
  D[Detect] --> T[Triage]
  T --> C[Contain]
  C --> E[Capture evidence]
  E --> R[Root cause]
  R --> F[Fix]
  F --> V[Validate]
  V --> REC[Recover]
  REC --> M[Monitor]
  M --> P[Postmortem]
```

O Atlas integral contém os fluxos expandidos, catálogo de agentes, state machines e 100 tarefas atômicas.