# Checkpoint de ativação MVP — 14/10/2026

**Projeto:** Origination Intelligence Platform · **Cérebro mestre:** `origination_project_brain_master.txt`
**Fonte canônica:** GitHub `Marcelo-teets/Motor-originac-srm/main` + Neon `production` + deploy Vercel oficial.
**Não declarar 100% funcional por um deploy READY; verificar o funil comercial ponta a ponta.**

## 1. Evidência operacional (14/10/2026)

| Controle | Resultado confirmado | Interpretação |
| --- | --- | --- |
| main e produção antes da PR #608 | `f64713a7f27cf88e4571fbb49a5ed0afa6ad86dd`, READY | baseline de infraestrutura |
| Neon guard | `normal`, ~79,2 MB físicos | ingestão limitada permitida |
| Branches Neon | 6, incluindo `production` e backup | abaixo do limite de 10 |
| FIDC CVM Tab I | 85 CNPJs distintos | identidade fiscal + origem CVM, não ICP |
| Identidades cadastrais corroboradas | **51/85** | meta de cobertura registral >=50 atingida |
| Situação cadastral | **44 ativas e 7 inaptas** | não aceitar status cadastral irregular automaticamente |
| Sem razão social cadastrada | 34 CNPJs | pesquisa adicional opcional, com orçamento |
| Candidatos totais | 50 | 31 `market_vehicle`, 14 `operating_company`, 3 `operating_issuer` capturados e 2 promovidos |
| Candidatos com CNPJ marcado válido | **0/50** | impedir score prematuro |
| Company Master | **2** (emissores imobiliários) | não demonstram 5 ICP tech |
| qualification, lead score, score, ranking, pipeline | **0** | funil comercial não operacional |
| user_profiles | **0** | Auth humano D-07 pendente |

PR #608 adiciona `fidc_assignor_commercial_review_v5`: **view somente leitura**, sem duplicação, com rastreabilidade CVM/registro, raízes de CNPJ e filas de diligência. `ICP = unverified`, `receivables/funding_gap = unknown`, `auto_promotion_authorized = false`. O release foi solicitado pela PR #609; o estado de produção **precisa ser verificado após o run**, não se presume por merge.

## 2. Ordem de execução até aceite 100% do MVP

| Gate | Entrega executável | Dependência | Aceite estrito |
| --- | --- | --- | --- |
| A0 Infra e source control | GitHub main + Vercel READY no SHA exato, Neon parity e storage guard | nenhuma | build, runtime e Auth smoke verdes em release oficial |
| A1 Identidade fiscal/cadastral | 51 registros e evidência registral, 85 vínculos CVM, revisão de duplicatas por raiz CNPJ | concluído parcialmente | >=50 nomes corroborados **não significa** elegibilidade; validar fonte e status |
| **A2 Seleção comercial (agora)** | triagem `fidc_assignor_commercial_review_v5` + sites/recebíveis + filtro ICP | A1, source_trace | 5 empresas operacionais Brasil tech/tech-backed com evidências de crédito/recebíveis e revisão registrada, no-go fundamentado |
| A3 Promoção individual | utilizar `candidate_decision_queue_v4` e o fluxo de aprovação de identidade/empresa | A2 e RLS | >=5 `companies` com CNPJ válido, não duplicadas, sem promoção automática |
| A4 Enrichment financeiro | headcount ≥50 quando aplicável, produto de crédito core, recebíveis estruturáveis, FIDC/dívida atual, funding gap, timing/ticket | A3 | fatos com fonte e data, `unknown` se faltar evidência, sem inferências tratadas como fatos |
| A5 Motor comercial | materializar qualification → patterns → score → lead score → thesis → ranking → pipeline | A4 | >=5 empresas reais com rationale, score versionado, por que agora, estrutura de FIDC/DCM e próxima ação/owner |
| A6 Auth e UI real | bootstrap D-07 com Marcelo presente; Dashboard, Company Detail, Leads, Search Profiles, Pipeline sem mock silencioso | A3–A5; colaboração humana | login real, RLS, owner e histórico; navegação e CRUD com dados reais |
| A7 Operação continuada | revalidar agenda da Onda A, 3 dias verdes antes da B, 7 dias reais de runs monitorados | guard `normal` | zero contaminação, erros controlados, custos/storage dentro dos limites, logs e alertas |
| A8 Aceite da operação | QA de ponta a ponta e aceite comercial documentado | A0–A7 | **MVP 100%**: todos os gates com evidência reproduzível; não extrapolar para o roadmap inteiro |

**Gates intransponíveis por automação isolada:** Auth D-07 exige login e aprovação humanos; seleção/validação comercial da empresa exige revisão fundamentada; 7 dias de execução saudável precisam efetivamente transcorrer. Não fabricar usuários, empresas ou resultados para bater metas.

## 3. Política de execução, qualidade e implantação

1. **Um objetivo por PR**, sempre a partir da `main` corrente; revisar alterações de fonte para evitar sinais herdados incorretamente (PRs #604 e #607 corrigiram contaminação VC).
2. Se houver DDL: `db/neon/*.sql` + `scripts/lib/neon-migration-plan.mjs`, allowlist e runtime contract + Neon Runtime Parity em preview.
3. CI completo (tipos, testes unitários, integração e contratos) verde antes de mesclar.
4. **Deploy somente** por PR alterando `.github/deploy-requests/motor-production.txt`, merge em `main` e workflow `.github/workflows/vercel-production-deploy.yml`. Nunca deploy direto nem SQL avulso.
5. Verificar `main_sha = deployment_READY_sha`, ledger, guard `normal`, Auth smoke e SQL de negócio. Em falha, bloquear escala, corrigir via PR, registrar incidente.
6. Não deletar mais dados sem nova autorização nem tocar em `backup/production-20261008`. `dataset=all` não é rota de recuperação.
7. Aceitar leads somente com `source_trace`, razão social/CNPJ, sinal econômico explícito, estrutura possível, prazo, ação e responsável.

## 4. Próximos artefatos por equipe

- **Engenharia de dados:** fila de revisão por evidências com no-go provisório, consolidação de raiz CNPJ, fonte e status cadastral; base para revisão humana, sem duplicar dados.
- **Originação/crédito:** revisar casos e selecionar ≥5 empresas com recebíveis/funding gap/porte demonstrados; devolver razão e fonte de no-go.
- **Backend/produto:** criar snapshots de qualificação e ranking **somente** após aprovação de empresas, e remover dependências de mocks no fluxo crítico.
- **Infra/segurança:** concluir Auth D-07 com Marcelo; registrar roles/RLS reais e validar schedulers de Onda A.
- **QA/PM:** manter tracker com checks por run/PR e evidências de 7 dias; recusar qualquer gate sem prova.

O avanço da próxima etapa deve ser medido em **empresas de originação qualificadas**, não em CNPJs resolvidos ou linhas CVM armazenadas.
