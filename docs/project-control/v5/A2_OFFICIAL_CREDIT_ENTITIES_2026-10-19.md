# A2 — Captura de empresas reais com produto de crédito ou recebíveis (19/10/2026)

## Objetivo
Substituir descobertas genéricas do portfólio de VC por **identidade jurídica e evidência contratual primária** para análise de originação. **Esta migration é complementar à PR #624:** ela captura somente duas entidades adicionais (DM Instituição de Pagamento e RecargaPay Instituição de Pagamento), distintas das financeiras DM SCFI e RP Financeira já incluídas pela #624. Asaas e meutudo também já foram capturadas na #624. A Creditas **já existia** duas vezes em `discovered_company_candidates` e recebe apenas enriquecimento documental, preservando origem Kaszek e status anterior.

A migration versionada `db/neon/20261019_neon_official_credit_diligence_a2.sql` usa apenas `discovered_company_candidates` e `search_profiles` existentes. Não cria um CRM paralelo e não escreve `companies`, `score_snapshots`, `qualification_snapshots`, `lead_score_snapshots`, `ranking_v2` ou `pipeline`.

### Contratos próprios, identidade econômica e risco de confusão

| Identidade jurídica | CNPJ observado | Evidência pública da própria empresa | Fato contratual | Pendência de crédito |
|---|---|---|---|---|
| Creditas Sociedade de Crédito Direto S.A. | 32.997.490/0001-39 | https://www.creditas.com/legal/termos-condicoes ; [MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/credito-do-trabalhador/instituicoes-financeiras-habilitadas/instituicoes-habilitadas) | Identifica a SCD como instituição financeira parceira e entidade do grupo; o portal também pode atuar como correspondente | Separar carteira originada pela SCD, bancos parceiros e cessões; montantes e funding gap permanecem desconhecidos |
| DM Instituição de Pagamento S.A. | 16.581.207/0001-37 | https://www.vocedm.com.br/portal/wp-content/uploads/2025/12/DM.-Contrato-Cartao-de-Credito.pdf | Contrato distingue a IP, DM Cartões PL e DM Financeira; **não são a mesma pessoa jurídica** | Mapear a credora/cedente de cada classe, vínculo FIDC, garantia, carteira e estrutura de dívida |
| Asaas Gestão Financeira Instituição de Pagamento S.A. | 19.540.550/0001-21 | https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis | Antecipação mediante cessão para Asaas, FIDC Asaas ou parceiros, podendo variar o cessionário. Documento menciona **FIDC Asaas** CNPJ 29.828.802/0001-76 | Identificar cessionário efetivo, taxa, saldo, risco, documentação de lastro e capital próprio necessário |
| TUDO Serviços S.A. (meutudo) | 27.852.506/0001-85 | https://meutudo.com.br/parati/ | Plataforma de consignado presta serviço de correspondente em parceria com Parati CFI CNPJ 03.311.443/0001-91 | Não atribuir automaticamente carteira Parati à TUDO; checar carteira própria, retenção, CCB e funding |
| RecargaPay Instituição de Pagamento Ltda. | 11.275.560/0001-75 | https://recargapay.com.br/terms/emprestimo | Termos identificam **RP Financeira SCFI** CNPJ 44.431.743/0001-91 como credora originadora; a IP atua como correspondente e contratos podem ser cedidos | Mapear CCBs, cessionários, risco econômico e necessidade de funding por entidade do grupo |

## Semântica de evidências
- `cnpj_valid=true`: dígitos verificadores válidos e CNPJ publicado em documento/portal oficial. **Não** significa situação cadastral federal em dia ou aprovação humana de identidade.
- `candidate_status='captured'`: candidato potencial. `company_id=NULL`, status de aprovação `NOT_APPROVED`. Qualquer promoção exige aprovação humana na esteira existente.
- `confidence=0.70`: qualidade operacional do documento para descoberta, **não** score de lead, confiança de FIDC, funding gap ou probabilidade de negócio.
- `receivables=[]`, `receivables_ownership=unknown`, `funding_gap=unknown`: ausência de fato medido; não inventar carteira.
- Fonte e papel econômico permanecem nos campos `source_url`, `source_ref`, `raw_payload` e `metadata`; termos oficiais são sujeitos a alteração e devem ser observados/monitorados novamente.
- Contratos comprovam oferta ou **possibilidade** de cessão. Não comprovam que uma operação específica foi realizada, qual volume, qual risco ou se há necessidade atual de novas captações.

## Gate de aceite humano por empresa
1. Confirmar CNPJ, situação na Receita/BCB/CVM e mapa societário do originador, correspondente e cessionário.
2. Confirmar lastro e titularidade de direitos creditórios: CCB, duplicata, cartão, Pix, boleto, consignado ou outro.
3. Documentar carteira atual, originação mensal, prazo médio, taxa, inadimplência, concentração, cobertura, FIDC/debêntures/notas comerciais já contratadas.
4. Verificar headcount e porte, política de crédito/risco, capital/ticket, funding gap e timing; registrar fonte, data e responsável.
5. Registrar revisão de identidade de um usuário real autorizado, sem inserir empresas automaticamente; então `qualification → patterns → score → thesis → ranking → pipeline`.

**Status:** duas entidades de pagamento adicionais em diligência, duas capturas existentes da Creditas enriquecidas, quatro candidatas da PR #624 preservadas sem duplicação e cinco grupos de pesquisa, **zero empresas aprovadas automaticamente**, zero pareceres humanos nesta migration. D-07 (bootstrap humano Auth) e A3–A8 continuam pendentes. A nova captura **não encerra o MVP**.

**Governança de merge:** a PR #624 foi mesclada durante o desenvolvimento desta adição. Verificar o merge da PR #626/release para confirmar as quatro entidades já capturadas e combinar allowlist e migration plan pela main atual, sem sobrescrever entradas de migrations revisadas.
