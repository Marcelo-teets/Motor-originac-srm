# Agentetome — isolamento dos motores de decisão

Até existir resolução comprovada entre fundo, originador/cedente e `companies`, os dados Agentetome são limitados a:

- package e auditoria;
- bronze histórica;
- comparáveis de mercado;
- `capital_market_events` de fundos;
- Market Map FIDC;
- diligência de qualidade operacional.

Não podem alterar automaticamente:

- `company_signals`;
- `qualification_snapshots`;
- `company_patterns`;
- `score_snapshots`;
- `lead_score_snapshots`;
- thesis de empresa;
- ranking;
- pipeline.

O primeiro universo Oliveira Trust retornou zero matches exatos por CNPJ ou nome normalizado contra o Company Master. Portanto, os 201 eventos FIDC permanecem com:

```text
issuer_company_id: null
companyResolution.status: unresolved
companyResolution.reason: no_exact_company_master_match
companyResolution.scoreImpact: false
```

Qualquer promoção futura exige:

1. identificação do originador/cedente;
2. match de CNPJ ou alias governado;
3. corroboração em CVM/FNET;
4. evidence URL e lineage;
5. regra de fator aprovada;
6. snapshot explicável e auditável.
