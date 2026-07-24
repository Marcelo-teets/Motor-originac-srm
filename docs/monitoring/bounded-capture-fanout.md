# Bounded Capture Fan-out

## Problema

A rota legada `/api/data-capture/run` executava uma captura global dentro de uma única função serverless. Em produção, uma execução excedeu o limite de 30 segundos e retornou `504`.

## Contrato novo

```text
GitHub Actions
→ GET /api/bounded-capture-targets
→ pares monitoring-eligible company × healthy real source
→ POST /api/bounded-capture-run?companyId=...&sourceId=...
→ deadline 24s por par
→ persistência + source_connector_runs
→ resumo agregado no Actions
```

## Regras

- ambos os endpoints exigem `CRON_SECRET`;
- cada run exige `companyId` e `sourceId`;
- somente empresas `monitoringEligible` entram no fan-out;
- somente fontes `real` e `healthy` entram no fan-out;
- paralelismo máximo do workflow: 3;
- `200` e `207` são resultados processados;
- deadline retorna `504` controlado, auditável e marcado como retryable;
- qualquer falha deixa o workflow vermelho após concluir todos os pares.

## Separação de motores

Monitoring e enrichment podem ser executados para uma entidade real com identidade aprovada. Qualification, patterns, score, ranking, thesis e pipeline continuam bloqueados até `decisionEligible=true`.

## Estado observado

- erro original: `GET /api/data-capture/run` em `2026-07-24`, timeout após 30 segundos;
- causa: empresas e múltiplas famílias de conectores em um único mega-run;
- correção: fan-out bounded por empresa e fonte.
