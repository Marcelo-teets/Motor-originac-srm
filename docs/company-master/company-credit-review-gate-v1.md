# Company Credit Review Gate v1

## Objetivo

Separar definitivamente três estados:

1. identidade jurídica verificada;
2. entidade elegível para monitoramento;
3. empresa elegível para qualification, score, ranking, tese e pipeline.

Uma empresa real e monitorável não entra automaticamente no universo decisório. O terceiro estado exige revisão humana de crédito com evidências, racional, scorecard e próxima ação.

## Contrato

A revisão é versionada em `company_credit_reviews` e pode terminar em:

- `eligible`: libera os motores decisórios;
- `monitor_only`: mantém monitoramento e enrichment, sem score ou pipeline;
- `ineligible`: exclui a empresa das superfícies decisórias atuais.

A aprovação exige:

- produto de crédito e centralidade do crédito;
- existência e estruturabilidade de recebíveis;
- estrutura atual de funding;
- existência de FIDC ou dívida estruturada;
- avaliação de funding gap;
- fit FIDC e DCM;
- timing;
- scorecard de cinco dimensões;
- confiança mínima de 75%;
- rationale e próxima ação;
- ao menos quatro evidências, cobrindo produto, recebíveis, funding e timing.

## Segurança

- RLS ativo;
- política explícita de negação para `anon` e `authenticated`;
- acesso direto e execução de RPCs restritos a `service_role`;
- API autenticada;
- mutações restritas a usuário GOD-MODE ativo;
- `security definer` com `search_path=''` e referências totalmente qualificadas;
- nenhum score é gerado antes da aprovação.

## Fluxo operacional

```text
Company Master real
→ monitoring + enrichment
→ Credit Review draft
→ blockers de evidência
→ aprovação GOD-MODE
→ decision_eligible=true
→ recomputeDerivedData(companyId)
→ qualification + patterns + scores + ranking
```

## Creditas — primeira revisão real

Empresa:

- Creditas Soluções Ltda.
- CNPJ 17.770.708/0001-24
- Company ID `fdac3e35-1d23-41d1-a9fd-0376445d3992`

Outcome aprovado:

- `eligible`
- confiança 96%
- produto de crédito core: sim;
- recebíveis estruturáveis: sim;
- FIDC existente: sim;
- dívida estruturada: sim;
- fit FIDC: sim;
- fit DCM: sim;
- funding gap corporativo: baixo;
- timing de funding de ativos: alto.

A tese correta não é “primeiro FIDC”. A Creditas já é emissora recorrente e possui estrutura madura de funding. O ângulo de originação é:

- novas safras de Auto, Home e consignado;
- emissões recorrentes de FIDC/CRI;
- warehouse ou club deal;
- refinanciamento e muro de vencimentos;
- eficiência de capital e diversificação de investidores.

Próxima ação:

> Mapear o calendário de emissões e vencimentos de 2026–2027 e abordar Tesouraria/DCM para discutir o próximo veículo, warehouse ou refinanciamento.

## Evidências oficiais usadas

- Produtos de crédito: `https://www.creditas.com/emprestimo-pessoal`
- Resultados Q1 2026: `https://www.creditas.com/ir/financial-reports/creditas-financial-results-q1-2026/`
- FIDC Creditas Auto XII e histórico de funding: `https://www.creditas.com/ir/non-regulatory/creditas-anuncia-novo-fidc-de-rusd-800-milhoes-para-impulsionar-operacao-de/`

## Artefatos

- `db/migrations/108_company_credit_review_gate.sql`
- `backend/src/lib/companyCreditReview.ts`
- `backend/src/services/companyCreditReviewRuntime.ts`
- `api/company-credit-review.ts`
- `frontend/src/pages/CompanyCreditReviewPage.tsx`

## Estado de produção em 24/07/2026

A migration 108 está aplicada no Supabase e a revisão v1 da Creditas está aprovada. O Company Master registra `decision_eligible=true` e `decision_eligibility_reason=credit_review_approved`.

A interface e o endpoint dependem do rollout da branch na Vercel. Enquanto o deployment não estiver confirmado, não declarar a tela como publicada.
