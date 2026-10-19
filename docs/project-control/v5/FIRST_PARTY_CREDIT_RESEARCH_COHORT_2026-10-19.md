# Motor V5 — Candidatas de crédito documentadas com fontes próprias

**Data da pesquisa:** 19/10/2026. **Status comercial:** identidade e estrutura em diligência, **NÃO qualificado**. **Objetivo:** tornar operacional na fila de descoberta o estudo A2 (issue #619) sem usar startups fictícias ou presumir funding gap.

O arquivo `db/neon/20261019_neon_first_party_credit_research_candidates_v5.sql` usa a tabela canônica `public.discovered_company_candidates`. Captura **quatro identidades jurídicas adicionais**, com os respectivos CNPJs divulgados nos contratos originais. A **Creditas já possui duas linhas capturadas** no Neon e não será duplicada; seu CNPJ ainda carece de confirmação diretamente com a operadora/RFB.

| Grupo de pesquisa | Entidade da documentação e CNPJ | Produto observado | Fonte primária | Diligência-chave |
|---|---|---|---|---|
| Asaas | ASAAS Gestão Financeira IP S/A · 19.540.550/0001-21 | Termo aditivo de antecipação por cessão | https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis | Qual cessionário, quem financia e qual risco econômico permanece com Asaas? |
| Grupo DM | DM SCFI S.A. · 91.669.747/0001-92 | Empréstimo pessoal | https://www.vocedm.com.br/portal/contratos/contrato-de-emprestimo-pessoal/ | Distinguir a financeira, IP e emissora do cartão; mapear lastro, carteira, FIDCs e capital |
| meutudo | TUDO Serviços S.A. · 27.852.506/0001-85 | Correspondente de crédito consignado (Parati CFI) | https://meutudo.com.br/parati/ | A distribuidora possui alguma carteira ou direito econômico próprio? |
| RecargaPay | RP Financeira S.A. · 44.431.743/0001-91 | Originadora contratual de empréstimos distribuídos pela RecargaPay IP | https://recargapay.com.br/terms/emprestimo | Distinguir credora e correspondente, CCB, fundos cedidos, crédito retido e funding atual |
| Creditas | Candidata já existente (CNPJ e titularidade ainda não reconciliados oficialmente) | Empréstimo com garantia de imóvel/veículo | https://www.creditas.com/ | Reconciliar pessoa jurídica, produto, veículos atuais, emissão/cessão e funding incremental |

## Guardas de verdade

- Nenhuma empresa entra no `companies`, `pipeline` ou nas tabelas Gold.
- Cada documento comprova **produto/participação e uma identidade jurídica divulgada**, não lucro, carteira proprietária, elegibilidade dos direitos creditórios, financiamento faltante, headcount ou ticket.
- São capturas com `candidate_status=captured`, `identity_review_status=pending`, `commercial_queue=false`, `humanApprovalRequired=true`. Permanecem na **fila de identidade**, fora da fila comercial até revisão apropriada.
- `cnpj_valid` no registro fica NULL; o checksum oficial `is_valid_cnpj_checksum` é checado pelo seed, mas **não substitui a consulta de situação cadastral RFB** nem a aprovação por revisor.
- `confidence=0.70` representa apenas confiabilidade preliminar de **captura documental**, nunca score de crédito ou lead score.
- `receivables=[]`, `fundingGap=unknown`, `portfolioOwnership=unknown`, `ticketFit=unknown`, `whyNow=unknown`. Sem inferências financeiras ou promoções.
- Migration é idempotente pelo CNPJ entre candidatas não descartadas e índice parcial `dedupe_key`; sem UPDATE de outros candidatos e sem exclusão de dados.
- Validação por CI de contrato, paridade e release pelo workflow GitHub → Neon → Vercel (PR de release separada).

## Critérios para fechar a diligência

Por cada entidade: confirmar situação RFB/CNAE e site oficial, identificar originadora x prestadora x cessionária, comprovar recebíveis/loan tape/lastro, tamanho da carteira e carteira vigente, prazo, inadimplência, funding existente e custo, porte e ticket real, documentação FIDC/DCM e gatilho temporal. Exigir revisão humana e trilha de decisão antes de Qualification → Patterns → Score → Thesis → Ranking → Pipeline.

**A2 ainda não concluído:** 4 novas capturas + Creditas já capturada são **cinco focos de pesquisa**, não cinco leads qualificados. Auth D-07 requer primeiro usuário real presente. Não declarar 100% até fatos e QA completos.
