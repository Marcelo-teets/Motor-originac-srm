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


## v1.2 — Inbox de fontes, decisões humanas e monitoramento restrito (04/11/2026)

### Caixa de triagem de origem desconhecida

- `dcm_source_intake` guarda apenas metadados: quem apresentou, fonte, ID original, título, link HTTPS sem parâmetros, data, hash e sugestão opcional.
- `dcm_source_intake_decisions` registra as decisões `linked`/`ignored` em tabela com bloqueio de UPDATE/DELETE por trigger. Não há vínculo por nome de empresa.
- `/api/origination-ai/deal-inbox-list` (GET), `deal-inbox-add` (POST), `deal-inbox-resolve` (POST) e `deal-inbox-history` (GET) exigem token Neon; leitura/decisão restrita ao próprio usuário. Para vincular exige ser owner/editor da oportunidade e justificar; operação e auditoria são atualizadas atomicamente.
- Se o usuário tentar capturar sem confirmar o vínculo em `deal-capture`, o registro deixa de desaparecer: permanece na inbox com `status=quarantined`, sem conteúdo integral e sem alterar o Deal Card.
- Reapresentações idênticas incrementam `seen_count`, sem mudar decisões anteriores. Mudanças de versão criam um novo item para revisão; links resolvidos não são reabertos automaticamente.
- A UI mostra pendentes, vinculadas e descartadas, e permite escolher uma das oportunidades às quais o usuário já tem acesso.
- **Atribuição à mesma empresa não é atribuição ao mesmo deal.** Cada vínculo tem que ser aprovado por pessoa.

### Microsoft 365: coleta inicial antes de conhecer a oportunidade

O endpoint `POST /api/integrations/microsoft/deal-source-inbox` aceita `provider`, `externalId` e, quando necessário, `chatId` ou `driveId`. Usa o token delegado do usuário, permissões Graph do tipo de fonte, seleciona apenas o ID indicado, e envia **metadados** para a inbox, sem vínculo automático. `DEAL_CARD_MICROSOFT_ENABLED=true` continua obrigatório.

### Monitoramento incremental somente de registros explicitamente autorizados

A implementação de `dcm_source_watches` oferece o início de coleta recorrente sem varrer toda a caixa de e-mail:

1. O usuário escolhe um **ID exato** de Outlook Email, Outlook Calendar, Teams Chat ou SharePoint. Para Teams, fornece o chatId; para SharePoint, o driveId.
2. Marca uma caixa de consentimento específico: `confirmed: true` e solicita `POST /api/integrations/microsoft/deal-watch-add`. A API valida a existência da fonte com a **conta delegada daquele usuário**, confirma o escopo e adiciona uma versão inicial à inbox.
3. O watch persiste apenas IDs, proprietário, hash da versão consultada e horários/erros sanitizados. Não contém corpo, anexo, transcrição, token ou URL opaca de paginação.
4. A execução de `/api/integrations/microsoft/cron-deal-watches` exige `CRON_SECRET` no backend e `DEAL_CARD_MICROSOFT_WATCH_ENABLED=true`. A rotina busca **somente watches ativos, no máximo 6 por chamada, com limite aproximado de 18 segundos para iniciar novas consultas**. Não é uma varredura de caixas de e-mail.
5. Se o conteúdo/versão mudou, os metadados são colocados na inbox com novo fingerprint. **Nenhuma decisão de evidência ou associação é tomada automaticamente.**
6. Em três falhas consecutivas o watch é automaticamente pausado para evitar tentativas repetitivas. Desconectar Microsoft também impede nova coleta e pode pausar o monitor.
7. O usuário pode consultar `GET /api/integrations/microsoft/deal-watch-list`, forçar verificação por ID (`deal-watch-check`) e pausar (`deal-watch-pause`). A habilitação corporativa e agendamento ainda **não foram realizados**.

**Bandeiras:** `DEAL_CARD_MICROSOFT_ENABLED=false` e `DEAL_CARD_MICROSOFT_WATCH_ENABLED=false` por padrão, em ambientes novos e existentes. Um administrador autorizado deve aprovar consentimento e ativação em homologação. `CRON_SECRET` já é uma variável existente do Motor; jamais adicioná-la ao frontend.

### Limitações técnicas / jurídicas atuais

- Não há inventário de fontes da empresa, leitura de pastas completas, subscriptions Graph, delta queries ou varredura de e-mails.
- Não é válido presumir que o conector Microsoft do ChatGPT conceda acesso à aplicação Motor: são autenticações e autorizações independentes.
- Watchers exigem que o proprietário da conexão e o recurso permaneçam autorizados, e não substituem a política de retenção, LGPD e aprovação do departamento de TI.
- Arquivos SharePoint são capturados por metadados; leitura/parse da loan tape, de contratos e demonstrações ainda não foi desenvolvida.
- O cron depende de agendamento externo. Escrever a rota não significa que ela esteja ativa ou agendada. A versão em desenvolvimento **não modifica produção**.
- Antes de liberar, homologar concorrência de decisões, duas operações da mesma empresa, dois usuários com permissões distintas, revogação de consentimento, reset de token, fail-closed de Graph, incremental modificado/não modificado e falhas repetidas.
