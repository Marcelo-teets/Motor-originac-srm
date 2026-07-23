# Company Master — Decision Quality Gate

## Objetivo

Impedir que empresas demonstrativas, sintéticas, parciais ou ainda não validadas alimentem:

- entity resolution;
- monitoring decisório;
- qualification;
- patterns;
- score e lead score;
- thesis;
- ranking;
- pipeline comercial real.

O fallback local continua podendo usar seeds para demonstrar a interface. No Supabase real, decisão exige aprovação explícita.

## Estado identificado em 23/07/2026

O Company Master possuía oito empresas demonstrativas, com dados e narrativas criados para a seed inicial. Esses registros foram preservados, mas receberam:

```json
{
  "data_status": "mock",
  "synthetic_seed": true,
  "decision_eligible": false,
  "excluded_from_entity_resolution": true,
  "excluded_from_monitoring": true,
  "excluded_from_qualification": true,
  "excluded_from_scoring": true,
  "decision_eligibility_reason": "synthetic_demo_seed",
  "quality_gate_version": 1
}
```

Também foi criada uma violação aberta de qualidade para cada empresa sob a regra `company_master_synthetic_seed`.

## Contrato canônico

### Função

```sql
public.is_company_decision_eligible(company_id)
```

Retorna `true` somente quando todos os requisitos abaixo são atendidos:

1. `metadata.data_status = real`;
2. `metadata.decision_eligible = true`;
3. registro não é seed sintética;
4. não há exclusão de entity resolution;
5. não há exclusão de qualification;
6. não há exclusão de scoring.

A função é acessível apenas ao `service_role`.

### View

```sql
public.company_master_decision_eligible_v1
```

Esta é a entrada canônica para novos módulos de resolução, monitoramento decisório e motores derivados. A view é restrita ao `service_role`.

## Write guards

Triggers transacionais impedem `INSERT` ou mudança de `company_id` nas tabelas:

- `qualification_snapshots`;
- `company_patterns`;
- `score_snapshots`;
- `lead_score_snapshots`;
- `ranking_v2`;
- `thesis_outputs`;
- `pipeline`.

Uma tentativa para empresa inelegível falha com SQLSTATE `23514` e instrução para promoção baseada em evidência.

Linhas históricas permanecem legíveis para auditoria; o gate impede nova contaminação.

## Como promover uma empresa real

A promoção não deve ser feita apenas por semelhança de nome. Exigir no mínimo:

- CNPJ válido e confirmado em fonte oficial ou cadastral confiável;
- razão social/nome fantasia reconciliados;
- origem e lineage registrados;
- evidência suficiente para afirmar que a entidade existe e é o alvo correto;
- revisão humana quando houver ambiguidade entre grupo, filial, fundo, originador e cedente.

Após a revisão:

```sql
update public.companies
set metadata = metadata || jsonb_build_object(
  'data_status', 'real',
  'decision_eligible', true,
  'decision_eligibility_reason', 'evidence_review_approved',
  'excluded_from_entity_resolution', false,
  'excluded_from_monitoring', false,
  'excluded_from_qualification', false,
  'excluded_from_scoring', false,
  'quality_gate_version', 1
),
updated_at = now()
where id = '<company_uuid>';
```

Antes de liberar os motores, executar:

```sql
select public.is_company_decision_eligible('<company_uuid>');
```

O resultado precisa ser `true`.

## Relação com o Market Map FIDC

Os 201 fundos do Agentetome permanecem como comparáveis de mercado. Um fundo só poderá ser ligado a uma empresa após resolução fundo → originador/cedente → Company Master elegível. Até lá:

- `issuer_company_id` permanece nulo;
- `companyResolutionStatus = unresolved`;
- `scoreImpact = false`;
- nenhum signal ou ranking é gerado.

## Evidência de validação

- oito empresas demo marcadas;
- oito violações de qualidade abertas;
- zero empresas na view elegível na data da implantação;
- sete triggers de decisão instalados;
- tentativa de regravar qualification de empresa demo rejeitada com SQLSTATE `23514`.
