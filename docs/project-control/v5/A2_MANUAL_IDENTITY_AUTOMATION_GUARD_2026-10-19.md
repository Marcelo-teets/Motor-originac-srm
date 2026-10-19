# A2 — Proteção contra promoção automática de identidades apenas documentadas

**Data:** 19/10/2026 · **Escopo:** empresa jurídica e análise de originação no Motor V5.

## Anomalia identificada

O resolvedor `public.auto_resolve_verified_candidate_entities_v4(integer)` pode criar vínculos no Company Master quando a fila passa a `commercial`, o website foi verificado e a confiança supera os thresholds. Entretanto as migrations A2 de entidades Asaas, DM, RP Financeira, meutudo, DM IP e RecargaPay IP registraram deliberadamente **evidência apenas documental**.

O CNPJ publicado em documento contratual e até verificação de domínio **não provam que uma determinada entidade do grupo é a detentora dos recebíveis ou atende ao ICP**. O resolvedor não deve ignorar as flags de revisão humana ao receber sinais adicionais no futuro.

## Correção

A migration `db/neon/20261019_neon_a2_human_identity_autoresolver_guard.sql` altera somente a função existente, usando `pg_get_functiondef` e anchor exato, com exceção caso a assinatura mude. Não interfere no processamento de entidades sem pendência explícita. Casos protegidos:

- `raw_payload.human_identity_review_required=true` (termos corporativos da segunda onda);
- `raw_payload.humanApprovalRequired=true` (contratos da primeira onda);
- `raw_payload.companyMasterPromotionAuthorized=false`;
- `raw_payload.identity_review_status=pending`;
- `raw_payload.official_corporate_terms.human_identity_review_required=true` (Creditas);
- `raw_payload.commercial_queue=false` (todas as capturas apenas documentais).

O resolvedor permanece inalterado para outros casos verdadeiramente verificados. A alteração **não executa** o resolvedor e não cria nem modifica `companies`, `qualification_snapshots`, score ou pipeline. Migração aditiva pelo ledger oficial Neon e allowlist reviewed; QA em PR e release segregados.

## Verificação depois da publicação

Consulta segura para conferir definição da função, sem chamá-la:

```sql
select
  position('humanApprovalRequired' in pg_get_functiondef(
    'public.auto_resolve_verified_candidate_entities_v4(integer)'::regprocedure
  )) > 0 as first_party_protected,
  position('human_identity_review_required' in pg_get_functiondef(
    'public.auto_resolve_verified_candidate_entities_v4(integer)'::regprocedure
  )) > 0 as corporate_terms_protected;
```

Revalidar `companies` invariável, novas candidatas ainda `captured`, Auth e pareceres humanos não inventados. O aceite A2–A8 exige investigação de carteira, funding, cinco revisões humanas e sete dias de monitoramento real; **não** basta CI verde.
