# A2 — Dossiê comercial preliminar: cinco grupos de crédito/recebíveis (19/10/2026)

**Projeto:** Origination Intelligence Platform · **Geografia:** Brasil · **Foco:** FIDC/DCM, não equity.
**Classificação:** investigação comercial interna; **nenhuma empresa foi aprovada, promovida ou qualificada para crédito**.
**Fonte de dados do Motor:** Neon production (read-only), `discovered_company_candidates`; fontes primárias abaixo.
**Regra de interpretação:** evidência contratual de produtos ≠ prova de originação efetiva, saldo de carteira, risco retido, gap de funding ou ticket estrutural.

## Cinco grupos para diligência — hipóteses, não leads Gold

| Grupo / pessoas jurídicas | Evidência observada | Hipótese financeira a testar | Restrição/risco e próxima ação |
| --- | --- | --- | --- |
| **Asaas** — ASAAS Gestão Financeira Instituição de Pagamento S/A, CNPJ **19.540.550/0001-21** | Termo aditivo (atualizado 16/09/2026) regula antecipação de cobranças de boleto, Pix e cartão. Prevê cessão para **Asaas, FIDC Asaas ou parceiros**, além de recompra e documentação de lastro | Possível demanda de capital para financiar antecipações e gestão de recourse; estrutura potencial: FIDC com direitos performados e mecanismos de recompra e cobertura | Precisamos distinguir cessionário real, saldo cedido/retido, registro, custos de funding e expectativa de novas cessões. **Não presumir titularidade integral da IP** |
| **DM** — DM SCFI, CNPJ **91.669.747/0001-92**, e DM Instituição de Pagamento, CNPJ **16.581.207/0001-37** | Contratos próprios exibem empréstimo pessoal, cartão e diferentes pessoas jurídicas do conglomerado; IP aparece como cedente em evidência CVM | Avaliar cessão de CCBs/cartões, relação com FIDC e otimização da estrutura de passivos | Segregar credora por produto: DM SCFI, DM SCD, DM Cartões PL e IP; conciliar cedente CVM com titular do recebível, saldo, garantias, inadimplência, funding existente |
| **RecargaPay** — RP Financeira SCFI, CNPJ **44.431.743/0001-91**, e RecargaPay IP, CNPJ **11.275.560/0001-75** | Contrato de empréstimo define **RP Financeira como credora originadora**, e IP como correspondente; prevê CCB e grupo sujeito a regras financeiras | Estruturar funding de carteira de CCBs caso a carteira permaneça no originador e exista demanda adicional; investigar FIDC/estrutura de crédito financeiro | **Não atribuir carteira à IP**. Precisamos de loan tape, cessões, custo de depósitos/linhas, elegibilidade, limites e necessidade incremental de capital |
| **Creditas** — Creditas SCD, CNPJ **32.997.490/0001-39**, distinta da Creditas Soluções | Termos corporativos listam SCD como instituição financeira parceira, junto a bancos. Motor tem duas capturas do portfólio Kaszek e a PR #625 reconcilia a identidade | Eventual funding de carteira própria com garantias (imobiliária/veículos etc.) ou alívio de capital; comparar linhas, FIDC e securitização quando aplicável | Identificar cada credora, garantias, carteira própria vs parceiros, estrutura de passivos, empréstimos e escala; manter dedupe das capturas VC |
| **meutudo / TUDO Serviços S.A.**, CNPJ **27.852.506/0001-85**, e **Parati CFI**, CNPJ **03.311.443/0001-91** | Site oficial descreve correspondente na distribuição de consignado e Parati como instituição financeira parceira | Avaliar economia de originação e eventual funding de uma carteira própria, **somente se houver** direitos e risco de crédito atribuídos à entidade | A TUDO pode ser distribuidora, e não detentora da carteira. Solicitar contrato de correspondência, titularidade CCB, comissões, estrutura de passivos, relação com outras financeiras |

## Fontes primárias (verificadas em 19/10/2026)

1. Asaas — https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis
2. DM crédito pessoal — https://www.vocedm.com.br/portal/contratos/contrato-de-emprestimo-pessoal/
3. DM cartão e grupo — https://www.vocedm.com.br/portal/wp-content/uploads/2025/12/DM.-Contrato-Cartao-de-Credito.pdf
4. RecargaPay empréstimo — https://recargapay.com.br/terms/emprestimo
5. RecargaPay termos gerais — https://recargapay.com.br/terms
6. Creditas termos e instituições parceiras — https://www.creditas.com/legal/termos-condicoes
7. meutudo + Parati — https://meutudo.com.br/parati/
8. CVM mensal FIDC (fonte primária de vínculo, **não** de elegibilidade): https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_202609.zip

**Observação:** CNPJ indicado em termos contratuais e dígitos verificadores válidos não substituem validação da situação atual na Receita ou verificação regulatória BCB/CVM por CNPJ.

## Sequência estrita de investigação (sem criar falso score)

1. **Entidade jurídica / papel econômico:** validar CNPJ e situação cadastral da empresa, financiadora, correspondente, fundo e cessionário; deduplicar por raiz/domínio com evidência.
2. **Ativo elegível:** obter ou evidenciar contrato/modelo de originação, CCB/duplicata/cartão/Pix/boleto, loan tape, lastro, registro, alienação, recourse e risco de crédito.
3. **Funding stack:** levantar saldo e custo de linhas, FIDC existente, títulos emitidos, funding bancário, capital subordinado, estrutura atual e vencimentos.
4. **Dimensões comerciais:** carteiras e ticket potencial, volume mensal, crescimento, capital gap, headcount/porte, prazo, timing, executabilidade, histórico de cessões e contraparte decisória. Desconhecido continua `unknown`.
5. **Revisão humana:** registrar parecer com fatos, fontes e próxima ação; prosseguir ao fluxo de identidade existente. **Só depois** promover individualmente e recalcular qualification → patterns → score/lead score → tese → ranking → pipeline.

## Status de execução

- **Concluído:** fontes primárias suficientes para classificar os cinco grupos como **alvos de diligência**, com CNPJ e entidade credora/correspondente discriminados; candidatas registradas ou versionadas nas migrations PR #624/#625.
- **Pendente:** confirmação de 5 empresas *elegíveis ao ICP com necessidade/escala de crédito comprovada*; 5 revisões administrativas Auth `god_mode`; promoção ao Company Master; 5 snapshots; pipeline ativo.
- **Controle operacional:** sem inserir usuário ou parecer sintético; PR de release separada; zero writes diretos de produção. Se não houver lastro ou funding gap comprovável, encerrar como `needs_evidence` ou `no_go` fundamentado, não como lead.
