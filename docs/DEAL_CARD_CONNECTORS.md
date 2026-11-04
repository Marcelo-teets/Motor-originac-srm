# Deal Card — integrações por fonte (v1.1)
Data: 2026-11-04. Branch: `feature/deal-card-intelligence-20261103`. Não implantado.

## Objetivo

Importar **um registro explicitamente indicado pelo responsável da oportunidade**, usando as permissões corporativas que já tiverem sido concedidas. Não executar varredura ampla de caixas postais, canais, transcrições ou drives. Todo registro é vinculado a `opportunityId`; outros deals da mesma empresa não recebem acesso automático.

## Estado do código

- **Fireflies**: consulta GraphQL `transcript(id: $id)` por ID exato com chave no servidor. Traz ID, título, data, URL e resumo (não traz transcrição completa). Funcionalidade *opt-in*, `DEAL_CARD_FIREFLIES_ENABLED=true` e `FIREFLIES_API_KEY`. Restrita ao **owner** do deal por usar uma chave compartilhada. Não assume que a integração Fireflies do ChatGPT é uma credencial disponível no Motor.
- **Outlook e-mail**: `GET /me/messages/{id}`, escopo `Mail.Read`, somente mensagem indicada.
- **Outlook Agenda**: `GET /me/events/{id}`, escopo `Calendars.Read`, somente evento indicado. Convite não comprova uma negociação.
- **Teams chat**: `GET /me/chats/{chatId}/messages/{messageId}`, escopo `Chat.Read`; não captura automaticamente gravações de reuniões ou transcrições do Teams.
- **SharePoint/OneDrive**: `GET /drives/{driveId}/items/{itemId}`, escopo `Files.Read`, com metadados somente. Conteúdo de PDF/XLSX/DOCX **ainda não é interpretado por este conector**.
- **Motor**: utiliza `microsoft_connections` (OAuth delegado já existente) e exige membro da oportunidade com papel owner/editor. `DEAL_CARD_MICROSOFT_ENABLED=true` para habilitar.

## Regras para ligar

1. Aprovação formal SRM/Compliance para tratamento de dados de reuniões e e-mails; definir quais usuários e pastas poderão ser consultados.
2. Configurar variáveis **somente no backend** (Vercel/GitHub secrets ou secret manager). Nunca usar `VITE_` para tokens.
3. Para Microsoft 365, incluir no `MICROSOFT_SCOPES` somente as permissões aprovadas. A configuração inicial do Motor é para Planner/To Do; ela não concede Mail, Calendar, Chat ou Files. Reabrir conexão no Task Center para **novo consentimento OAuth** após expansão. Consentimento da administração do tenant poderá ser exigido.
4. Para Fireflies, configurar chave da organização/conta autorizada com escopo contratual; restringir `DEAL_CARD_FIREFLIES_ENABLED` e revisão somente ao owner. Evitar chave de pessoa que dê acesso a dados que o time não poderia ver.
5. Habilitar feature flag somente em ambiente de homologação, após migração Neon e testes de acesso; depois considerar produção sob decisão explícita.

## Endpoints a serem expostos após merge e deploy

| Método | Endpoint | Campos | Condição |
|---|---|---|---|
| POST | `/api/origination-ai/deal-import-fireflies?dealId=UUID` | `{"meetingId":"ID"}` | owner, chave Fireflies, flag |
| POST | `/api/integrations/microsoft/deal-source-import` | `{"dealId":"UUID","provider":"outlook_email","externalId":"ID"}` | membro editor/owner, OAuth, Mail.Read e flag |
| POST | mesmo Microsoft | `{"dealId":"UUID","provider":"outlook_calendar","externalId":"ID"}` | Calendars.Read |
| POST | mesmo Microsoft | `{"dealId":"UUID","provider":"teams","chatId":"ID","externalId":"MSG_ID"}` | Chat.Read |
| POST | mesmo Microsoft | `{"dealId":"UUID","provider":"sharepoint","driveId":"ID","externalId":"ITEM_ID"}` | Files.Read (ou permissão mais ampla previamente concedida) |

Todos exigem `Authorization: Bearer <token Neon do usuário>`. Mesmo IDs válidos não permitem ler dados sem autorização Microsoft/Fireflies e vínculo com a oportunidade.

## Tratamento de dados

1. Consultar o registro remoto **em memória**, apenas por ID previamente selecionado e com a credencial autorizada.
2. Projetar `provider`, `externalId`, título, data, link HTTPS validado e fingerprint da versão. Não persistir corpo integral, transcrição nem anexos.
3. Identificar, quando existente, **um único valor monetário** diretamente associado a captação/funding/linha de crédito; se surgirem dois valores, não propor valor. Um valor detectado é **hipótese** (35% de confiança), nunca confirmação.
4. Gerar `CaptureInput` com `opportunityId` nomeado e `mappingApproved=true` (aprovação é a ação explícita do usuário no card). Persistir fonte e evidência como `proposed`; calcular novo snapshot.
5. Revisar em equipe. O botão **Validar hipótese** registra o exame mas não satisfaz requisitos obrigatórios. Só **Confirmar como fato**, com justificativa mínima de 30 caracteres e conferência da fonte primária, altera a classificação para `fact`.
6. Conflitos de valor do mesmo período bloqueiam o card até decisão. Períodos diferentes são preservados separadamente.
7. Reimportação do mesmo ID+mesma versão não altera avaliações humanas; versões distintas preservam os dois registros.

**Aviso:** regex é auxiliar, não é análise jurídica/contábil ou decisão de crédito. Qualquer número de e-mail/resumo transcrito deve ser confrontado com documento primário e período.

## Escopo explicitamente NÃO implementado

- Descoberta/varredura automática de mensagens, pastas e reuniões sem seleção do usuário;
- Watchers e sincronização recorrente, webhooks/Graph change notifications, delta tokens e backfill;
- OCR, extração de loan tape, cálculo de métricas de carteira, reconciliação de DFs e análise documental completa;
- Roteamento automático de mensagens com dúvidas de qual oportunidade pertence; fila de quarentena persistida;
- Importação de vídeos, áudio e transcrição completa de Teams/Fireflies;
- Consentimentos, chaves ou credenciais já configurados no runtime de produção;
- Teste ponta a ponta com contas Microsoft/Fireflies reais;
- Aprovação jurídica, crédito, mandato e distribuição.

## Homologação obrigatória

1. Rodar CI de backend+frontend+serverless na branch, e parity Neon.
2. Com flags `false`, comprovar HTTP 503 sem iniciar consulta de dados.
3. Com flags `true` sem OAuth ou chave, comprovar falha segura, sem credenciais nos logs.
4. Verificar a exigência de permission scopes por provider (403 se ausente).
5. Ter duas oportunidades da mesma empresa, dois usuários e um registro do Outlook; importar em uma e confirmar ausência na outra.
6. Repetir mesma importação e validar idempotência por hash, incluindo uma evidência já revisada.
7. Testar IDs malformados, cross-tenant, retorno com ID divergente, link `javascript:`, HTML de mensagem e erro GraphQL.
8. Confirmar que `validated hypothesis` não gera status `INFORMATIONAL`, que conflito crítico bloqueia aprovação e que a confirmação documentada promove apenas o campo revisado.
9. Após homologação, aplicar migration e conectar frontend. Não ativar produção sem observabilidade, gestão de incidentes e LGPD/segregação corporativa validados.

## Fontes de referência técnica

- Microsoft Graph [Get message](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0)
- Microsoft Graph [Get event](https://learn.microsoft.com/en-us/graph/api/event-get?view=graph-rest-1.0)
- Microsoft Graph [Get chat message](https://learn.microsoft.com/en-us/graph/api/chatmessage-get?view=graph-rest-1.0)
- Microsoft Graph [Get drive item](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0)
- Fireflies [GraphQL/API](https://fireflies.ai/api)
