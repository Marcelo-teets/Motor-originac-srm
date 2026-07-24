# Company Master Triage v1

## Objetivo

Transformar candidatos capturados em entidades reais monitoráveis sem contaminar o Company Master, qualification, ranking ou pipeline com fundos, SPEs, securitizadoras, bancos ou identidades incompletas.

A triagem fica entre:

```text
Discovery / Capital Market Events
→ discovered_company_candidates
→ entity classification
→ GOD-MODE identity review
→ Company Master monitorável
→ credit classification separada
→ decision_eligible
→ qualification / score / ranking / pipeline
```

## Problema resolvido

Na implantação da fila:

- havia 9 empresas no Company Master;
- somente 1 era real e verificada;
- nenhuma era `decision_eligible`;
- havia 1.284 candidatos capturados;
- a maior parte da fila era composta por fundos e veículos identificados nas ofertas CVM.

Promover a fila original diretamente criaria falsos leads, misturaria veículo com cedente/originador e degradaria o motor de decisão.

## Tipos de entidade

| Tipo | Uso |
|---|---|
| `operating_company` | Pode seguir para revisão de identidade |
| `regulated_credit_company` | Pode seguir para revisão de identidade; confirmar autorização e produto de crédito |
| `investment_vehicle` | Contexto de transação/FIDC; não entra como empresa operacional |
| `market_infrastructure` | Securitizadora, DTVM, gestora ou infraestrutura; contexto de mercado |
| `regulated_financial_institution` | Banco/IF; contexto, fora do ICP operacional padrão |
| `special_purpose_vehicle` | Resolver sponsor, controladora ou beneficiária operacional |
| `identity_incomplete` | Enriquecer razão social/CNPJ antes da revisão |

## Lanes

- `identity_review_queue`
- `vehicle_context_only`
- `market_infrastructure_context`
- `parent_resolution_required`
- `identity_enrichment_required`

Os registros não operacionais não são descartados. Permanecem disponíveis como evidência de estrutura, fundo, emissor, sponsor ou infraestrutura de mercado.

## Classificação

A classificação automática utiliza razão social e CNPJ para identificar padrões jurídicos explícitos.

Ela é persistida em `candidate_entity_classifications` com:

- tipo automático;
- tipo final;
- status `auto`, `confirmed` ou `overridden`;
- confiança;
- racional;
- versão do classificador;
- usuário e notas de revisão.

Um override nunca é silencioso: exige ação GOD-MODE e fica auditado.

## Priorização

A view `candidate_identity_triage_v1` e o RPC `get_candidate_identity_triage` combinam:

- tipo de entidade;
- confiança da fonte;
- recência do evento;
- recorrência de eventos;
- instrumento DCM;
- status da revisão.

A prioridade organiza trabalho humano. Não é lead score e não promove automaticamente a candidata.

## Gate de promoção

`approve_candidate_identity_review` aceita apenas:

- `operating_company`;
- `regulated_credit_company`.

Os demais tipos geram constraint error antes da criação ou reconciliação da empresa.

## Separação identidade x crédito

A aprovação de identidade produz uma entidade:

- `data_status=real`;
- `identity_verified=true`;
- `entity_resolution_eligible=true`;
- `monitoring_eligible=true`;
- `decision_eligible=false`;
- `excluded_from_qualification=true`;
- `excluded_from_scoring=true`;
- `credit_classification_status=not_reviewed`.

O sistema pode monitorar e enriquecer a empresa, mas não pode colocá-la no ranking ou pipeline até a revisão de crédito preencher evidência suficiente.

## API

Endpoint: `/api/candidate-triage`

Autorização:

- bearer JWT Supabase válido;
- perfil `god_mode` ativo em `user_profiles`;
- usuários comuns recebem HTTP 403;
- ausência de token recebe HTTP 401.

Operações:

### GET

Parâmetros:

- `limit` — 1 a 500;
- `queueLane`;
- `entityType`.

### POST

Ações:

- `confirm_classification`;
- `approve_identity`;
- `reject_identity`.

O endpoint legado `/api/candidate-identity-review` permanece compatível, mas também exige GOD-MODE.

## Interface

Rota: `/identity-review`

Acesso:

- protegida por `RequireGodMode`;
- item de navegação marcado como `godOnly`;
- usuários comuns não visualizam nem acessam a tela.

A workbench mostra:

- resumo das cinco lanes;
- prioridade da candidata;
- tipo automático/final;
- evento DCM mais recente;
- instrumento, recorrência e volume;
- blockers atuais;
- próxima ação;
- confirmação/override;
- formulário de aprovação ou rejeição.

## Controles de produção

1. Nenhuma promoção automática.
2. Nenhuma classificação automática é tratada como revisão humana.
3. Fundos não viram empresas operacionais.
4. SPE exige resolução de sponsor/controladora.
5. Identidade aprovada não vira lead decisório automaticamente.
6. Toda ação privilegiada exige GOD-MODE.
7. Toda evidência mantém URL, data, usuário e racional.

## Próxima etapa

Operar a fila de empresas operacionais em lotes pequenos, começando por candidatos com:

- evento DCM recente;
- recorrência de emissões;
- CNPJ válido;
- website oficial identificável;
- aderência ao ICP Brasil-only;
- potencial de necessidade de funding, recebíveis ou nova estrutura.

Depois da identidade, executar uma revisão separada para definir `decision_eligible` e liberar qualification, patterns, ranking e pipeline.
