# Candidate Identity Review Workflow

## Objetivo

Transformar candidatas de discovery em entidades reais e auditáveis sem inferir produto de crédito, recebíveis, funding, FIDC ou DCM a partir de nome, portfólio de VC ou similaridade textual.

## Fluxo

```text
discovered_company_candidates
→ revisão jurídica humana
→ razão social + CNPJ + domínio + fonte oficial
→ aprovação transacional
→ companies + candidate_identity_reviews + company_discovery_links
→ candidata promovida
→ classificação de crédito permanece pendente
```

## Requisitos de aprovação

- razão social verificada;
- CNPJ válido com checksum;
- website oficial;
- domínio normalizado;
- URL da evidência de identidade;
- resumo de evidência com pelo menos 80 caracteres;
- confiança entre 0,70 e 1,00;
- candidata não descartada ou promovida.

## Garantias

A RPC `approve_candidate_identity_review` executa em uma única transação:

1. bloqueia a candidata para revisão;
2. valida identidade;
3. reconcilia por CNPJ ou cria a empresa real;
4. grava metadados de elegibilidade e lineage;
5. registra `candidate_identity_reviews`;
6. cria `company_discovery_links`;
7. promove a candidata;
8. resolve violações de qualidade relacionadas.

Falhas não deixam empresa, review ou vínculo parcial.

## Separação de identidade e crédito

A empresa aprovada recebe:

- `data_status = real`;
- `decision_eligible = true`;
- `qualification_status = pending_evidence`;
- `credit_classification_status = not_reviewed`.

Nenhum dos campos abaixo é ativado automaticamente:

- `credit_product`;
- `has_receivables`;
- `has_fidc`;
- `fit_fidc`;
- `fit_dcm`.

## Primeira promoção real

A candidata **Creditas** foi reconciliada com fonte oficial da própria companhia:

- razão social: `Creditas Soluções Ltda.`;
- CNPJ: `17.770.708/0001-24`;
- domínio canônico: `creditas.com`;
- fonte: `https://www.creditas.com/legal/termos-condicoes`;
- Company Master ID: `fdac3e35-1d23-41d1-a9fd-0376445d3992`;
- classificação de crédito: pendente.

Após a aprovação, o Company Master passou de 0 para 1 empresa real elegível e o gate de decisão foi reaberto sem reintroduzir snapshots sintéticos.

## Segurança

- tabela de reviews com RLS;
- RPCs acessíveis apenas por `service_role`;
- endpoint exige access token Supabase válido;
- rejeição exige justificativa substantiva;
- payload limitado a 64 KB;
- nenhuma promoção automática.
