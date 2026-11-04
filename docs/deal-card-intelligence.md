# SRM Deal Card Intelligence — processo operacional v1 (03/11/2026)

> **Estado desta entrega:** fundação técnica em branch de revisão. O schema Neon precisa ser homologado/aplicado, a API publicada e as conexões externas autorizadas. Não afirmar sincronização automática ou aprovação jurídica sem evidência.

## Objetivo e entidades

O Deal Card é **uma ficha viva por oportunidade**, não um resumo de empresa. Hierarquia:

```text
Empresa (Company Master; 1:N oportunidades)
 ├─ Oportunidade A (FIDC, R$ X, 2026)
 │  ├─ originadores A e B (N:N, contribuição independente)
 │  ├─ fontes vinculadas e validadas
 │  ├─ evidências por campo e período
 │  ├─ eventos, decisões, riscos e responsáveis
 │  └─ snapshots do Deal Card (v1, v2, v3...)
 ├─ Oportunidade B (debênture, fase distinta)
 └─ Revisita A2 (nova oportunidade com revisit_of = A)
Originador (N:N oportunidades e empresas; não fundir com originador do crédito)
```

**Distinguir sempre** parceiro *originador comercial* (quem apresentou o deal) e originador dos direitos creditórios (conceito jurídico/regulatório). Reapresentação por outro parceiro requer atribuição e histórico sem apagar a primeira apresentação. Nenhuma fonte de uma oportunidade deve contaminar outra automaticamente.

## Processo de ponta a ponta

| Etapa | Entrada | Tratamento automatizável | Saída | Gate humano |
|---|---|---|---|---|
| 0. Cadastro | Empresa, CNPJ, operação | Resolve identidade, verifica duplicidades e distingue novas teses de revisitas | ID único da oportunidade | Em caso de empresas homônimas ou fusão |
| 1. Seleção de fonte | Fireflies, Teams, Outlook, agenda, pasta/VDR, CRM | Descobre evento por ID, participante, assunto e intervalo com filtros autorizados | Candidato a fonte | Aprovação do vínculo se ambíguo |
| 2. Coleta | Payload da fonte, link e identificador | Paginação incremental/webhook; horário UTC; checksum SHA-256; deduplicação; reprocessamento idempotente | Registro de fonte com link e hash | Permissão e classificação de sigilo |
| 3. Normalização | Transcrições, emails, invites, docs | Extrai metadados, pessoas, data, produto, valores e unidades; grava `proposed` | Evidências por campo/período | Informação material não é automaticamente validada |
| 4. Reconciliação | Evidências concorrentes | Prioriza documentos primários, compara períodos e contexto; abre conflito material em vez de escolher silenciosamente | Campo canônico ou `disputed` | Resolve conflito e deixa justificativa |
| 5. Análise DCM | Financeiro, contratos, loan tape, garantias | Checklist por produto, cálculo exploratório com bases datadas; risco de lastro, concentração, elegibilidade e execução | Hipóteses técnicas, pendências e bloqueios | Jurídico, Crédito, Estruturação |
| 6. Publicação | Campos validados + linha do tempo | Compila sumário, glossário, decisões, fontes, pendências, riscos e status | Deal Card rascunho versionado | Dono da operação aprova conteúdo |
| 7. Handoff | Deal Card e itens pendentes | Gera pauta objetiva, introdução e trilha de documentos | Passagem para Empírica/Estruturação | Aprovação de circulação |
| 8. Monitoramento | Novos eventos / documentos / estágios | Detecta delta, cria nova versão e sinaliza desatualizações | Deal Card atualizado + log de mudanças | Revalida dados materiais |
| 9. Reciclagem | Motivo, gatilho, data de revisão | Encerra/pausa sem apagar; cria revisita vinculada quando relevante | Nova oportunidade + histórico acessível | Aprovação de reabertura |

### Etapa 1: conectores (fontes autorizadas)

1. **Fireflies:** consultar reunião por ID/data/participantes; trazer transcrição, resumo, decisões e tarefas. Opção oficial: GraphQL e webhooks após transcrição concluída. A integração com o chat não equivale automaticamente a um webhook do Motor.
2. **Outlook Email:** Microsoft Graph `Mail.Read`; delta/subscriptions quando apropriado; preservar `messageId`, `conversationId`, remetente, data, assunto e `webLink`; limitar coleta às caixas/pastas autorizadas; não varrer toda a caixa sem escopo.
3. **Outlook Calendar:** Microsoft Graph `Calendars.Read`; `eventId`, participantes, data e `webLink`; convite/aceite não prova que uma decisão foi tomada.
4. **Microsoft Teams:** Microsoft Graph com permissões de chat/canal explicitamente consentidas; identificar `chatId`, `messageId` e metadados. Separar bate-papo de transcrição efetiva de reunião.
5. **Pasta do cliente / VDR / SharePoint / OneDrive:** enumerar arquivos e versões por pasta autorizada; registrar `driveItemId`, `eTag`, URL, tipo, data-base e checksum. Não tratar mero nome de arquivo como documento conferido.
6. **CRM Motor:** empresa, estágio, valor, responsável, lembretes e justificativas. É contexto operacional; para contrato/lastro, preferir documento primário.

**Conexão atual:** o repo contém OAuth Microsoft para Planner/To Do, não autorização ampla de Mail/Calendar/Teams/Files. Requer consentimento específico antes de expandir `MICROSOFT_SCOPES`. O Motor não deve receber nem expor chaves de APIs no frontend.

### Etapa 2: matching, quarentena e escopo

- Uma fonte só entra no card quando `opportunityId` e `mappingApproved` estiverem presentes, ou houver regra institucional explícita e auditável. Sem isso, fica em quarentena para análise; **nome da empresa isolado é evidência insuficiente**.
- Se uma reunião contempla duas oportunidades, criar associações explícitas para cada uma com recortes de evidência distintos; evitar replicação indiscriminada do texto.
- Índice de idempotência: `opportunity_id + provider + external_id + content_sha256`; nova versão de arquivo ou e-mail altera o hash e mantém histórico.
- O Motor armazena link, hash, metadados mínimos e valores extraídos. Transcrição completa, corpo de e-mail, documento e anexos permanecem na fonte original, respeitando permissões e retenção.
- Se a fonte for excluída ou a autorização revogada: remover acesso e marcar a fonte como indisponível no tratamento; não afirmar que o documento está validado quando não há acesso.

### Etapa 3: dicionário de dados

**Identidade:** `companyId`, `opportunityId`, `revisitOf`, CNPJ, razão/nome fantasia, segmento, participantes, parceiro originador, proprietário interno.

**Operação:** produto, tamanho-alvo, moeda, finalidade, prazo, estágio, datas e estrutura(s) alternativa(s). Campos críticos: `financialNeed`, `requestedAmount`, `probableProduct`, `receivables`, `collateral`, `debtStructure`.

**Carteira/risco:** `loanTape`, safra, saldo, originação, concentração, inadimplência, PDD, recuperação, DSCR/fluxo de caixa, coobrigação, garantias e vínculos/gravames.

**Jurídico-regulatório:** `contract`, `assignmentEligibility`, `legalOpinion`, titularidade, existência, exigibilidade, cessibilidade, notificações, prioridades, restrições, rescisão, obrigação condicionada, risco de performance.

**Processo:** decisão, decisão substituída, responsável, prazo, pedido documental, status de pendência, próximo contato, nota de reunião, contato-chave e origem.

Cada fato: `sourceId`, `field`, `value`, `referencePeriod`, `confidence`, `claimType`, `materiality`, `status`, `reviewedBy`, `reviewedAt`.

### Etapa 4: classificação e prioridade

- `fact`: dado afirmado pela fonte, **não significa verdade validada**.
- `analysis`: cálculo/inferência com metodologia registrada.
- `hypothesis`: alternativa proposta, não termo acordado.
- `unknown`: lacuna explícita.
- `proposed`: informação coletada, aguardando revisão; `validated`: revista por pessoa identificada; `disputed`: conflito; `superseded`: fonte substituída.
- Hierarquia inicial: contratos assinados e documentos/loan tape atualizados > manifestações formais do cliente > transcrições/atas > CRM > hipóteses. Ajustar por tipo de campo, data-base e estado da negociação; não usar um único peso fixo para vencer conflitos críticos.
- **Conflitos materiais bloqueiam avanço**. Ex.: R$ 50 milhões no e-mail e R$ 30 milhões na reunião do mesmo período. Mostrar as duas fontes, data, perguntas de confirmação e decisão humana. Valores de períodos diferentes não devem ser marcados automaticamente como contradição.
- Por ausência de data-base, moeda, unidade ou escopo, manter status pendente e solicitar confirmação.

### Etapa 5: análise por produto e gates

O algoritmo não decide crédito, registrabilidade ou enforceability. Produz checklist de apoio e bloqueios para especialistas.

**FIDC:** analisar Resolução CVM 175, Anexo Normativo II, com alterações vigentes (inclusive Res. CVM 240/2026). Distinguir **carteira contratual bruta**, direitos efetivamente existentes/futuros, performados/não performados, líquidos/condicionais, carteira cedível/elegível e **valor presente antecipável**. Conferir contrato constitutivo, cessão, documentação comprobatória, autenticidade, titularidade, oponibilidade, gravames, coobrigação, critérios de elegibilidade, concentração e risco operacional. Exigir loan tape com datas-base coerentes e reconciliar com DFs.

**CRI/CRA:** averiguar vínculo e natureza imobiliária/agro do lastro, documentação, cadeia de cessão, garantias, regime de securitização aplicável e Lei 14.430/2022; não chamar recebível genérico de elegível sem análise.

**Debênture:** examinar capacidade de pagamento, covenants, endividamento, garantias, subordinação, prazo, destinação e governança societária. Não confundir risco corporativo com tese de recebíveis.

**Debênture Incentivada:** além dos itens acima, avaliar enquadramento legal e setorial atualizado, projeto elegível e destinação de recursos. Jamais afirmar benefício tributário ou enquadramento sem revisão jurídica.

**Documentos mínimos para primeira triagem, quando aplicáveis:** societário; instrumento que origina o direito creditório; loan tape histórico com safras, data-base, saldos e status; DFs/balancetes; endividamento; garantias/cessões. Q&A preliminar: até 10 questões bloqueantes, sem repetir o que já consta das fontes.

### Etapa 6: Deal Card — layout lógico

1. Cabeçalho: empresa, `dealId`, produto, estágio, status, originadores, responsável e atualização.
2. **Resumo executivo** de até 8 linhas: operação, finalidade, valor, lastro, dinâmica, racional e próximos passos.
3. **O que mudou** desde a versão anterior (datas e evidências).
4. **Estrutura em discussão** e hipóteses alternativas, sem misturar confirmado e prospectivo.
5. **KPIs** (com período e origem) e painel de carteira/risco, quando disponíveis.
6. **Lastro, contratos e jurídico** (premissas, elegibilidade, não resolvidos).
7. **Linha do tempo** (reuniões, decisões, marcos e alterações) com link à fonte.
8. **Pessoas** (cliente, SRM, Empírica, originadores comerciais, jurídicos, investidores) e papéis.
9. **Pendências, riscos e responsáveis**, com data e próximo movimento.
10. **Biblioteca de fontes** com IDs, links, status de permissão, data e hashes.
11. **Glossário contextual**: termos da estrutura aplicável, sem parecer jurídico.
12. **Histórico de versões e aprovações**, incluindo snapshot da data do handoff.

### Etapa 7: revisão, permissões e publicação

- Owner (originação): atribui fontes, revisa afirmações materiais, valida sumário, compartilha o card.
- Editor (estruturação/crédito): propõe correções, registra análise e pendências. Não pode aprovar conteúdo como dono.
- Viewer: consulta material já autorizado; não edita.
- Jurídico/compliance: confirma enquadramento, contratos e oponibilidade; aprovação do card **não é** parecer jurídico, emissão, mandato ou crédito aprovado.
- Acesso por oportunidade, com trilha de quem associou fonte, revisou afirmação e aprovou versão.
- Dados pessoais e confidenciais: necessidade, finalidade, minimização, LGPD, segregação por equipe, consentimentos/licenças de uso, logs sem corpos de e-mail, política de retenção e direito de acesso.

### Etapa 8: agendamento e alertas propostos

- Fireflies: webhook de transcrição finalizada; verificação incremental diária como contingência.
- Microsoft: change notifications ou delta para caixas/pastas autorizadas; renovação da assinatura e reconciliação de falhas.
- Pasta: notificação de alteração + verificação diária de versão.
- Card: reconstruir após evento relevante e consolidar diariamente; registro de `last_successful_sync`, backlog e rejeições.
- Alertas: conflito crítico; documentação vencida; tarefa vencida; estágio sem movimento; alterações materiais após aprovação; nova informação de empresa com oportunidade reciclada.
- Política de falha: retries limitados, backoff, fila de dead-letter, idempotência, quarentena e recuperação a partir do último checkpoint.
- Nenhum envio de e-mail, update de CRM, concessão de acesso, publicação ou alteração de estágio automaticamente sem aprovação/regras explícitas.

## API da branch de implementação

Exigência: sessão com identidade Neon ativa; autorização por membro do `dealId`. Prefixo: `/api/origination-ai/:action` encaminhado ao `serverless/origination-ai.ts`.

| Método/ação | Papel | Efeito |
|---|---|---|
| GET `deal-list?companyId=` | membro | Oportunidades visíveis |
| POST `deal-create` | logado | Oportunidade e owner vinculados |
| POST `deal-add-member?dealId=` | owner | Libera viewer/editor institucional |
| POST `deal-create-originator?dealId=` | editor | Cadastra originador comercial |
| POST `deal-link-originator?dealId=` | editor | Atribuição N:N com contribuição |
| POST `deal-capture?dealId=` | editor | Ingestão explícita, hash, propostas |
| GET `deal-evidence?dealId=` | membro | Evidências propostas/validadas |
| POST `deal-review-claim?dealId=` | editor | Revisão com justificativa |
| POST `deal-add-event?dealId=` | editor | Histórico, pendência e decisão |
| POST `deal-rebuild?dealId=` | editor | Snapshot idempotente |
| GET `deal-card?dealId=` | membro | Última versão |
| POST `deal-approve?dealId=` | owner | Aprova conteúdo se não houver gates pendentes |

**Exemplo de importação consentida, sem conteúdo integral:**

```json
{
  "provider": "fireflies",
  "externalId": "meeting-123",
  "opportunityId": "<uuid-da-oportunidade>",
  "mappingApproved": true,
  "title": "Cliente | estrutura inicial",
  "sourceRef": "https://app.fireflies.ai/",
  "occurredAt": "2026-11-03T13:00:00Z",
  "claims": [
    {"field": "requestedAmount", "value": 50000000, "materiality": "critical", "confidence": 0.85},
    {"field": "financialNeed", "value": "Funding de recebíveis", "materiality": "high"}
  ]
}
```

As alegações entram como **`proposed`**, inclusive quando o próprio extrator as classifica como fato. Aprovador revisa no endpoint de evidência antes de reconstruir. Textos, anexos e transcrições brutas não são persistidos.

## Implementação / ativação (na ordem)

1. Revisar/mesclar a branch de feature somente após checagem TypeScript/testes e auditoria de segurança.
2. Executar `db/neon/20261103_deal_card_intelligence.sql` no Neon **de homologação**, validar todas as 8 tabelas e as políticas de acesso, simular rollback. Fazer backup antes de qualquer produção.
3. Homologar a API usando dois usuários internos e duas oportunidades da **mesma empresa**; confirmar que viewer não edita e editor não aprova; testar fonte vinculada à oportunidade errada.
4. Conectar Fireflies e selecionar apenas reuniões autorizadas. Conectar Outlook Email, Outlook Calendar, Teams e SharePoint em suas próprias contas institucionais com consentimento admin onde necessário.
5. Implementar jobs de coleta com secret manager, checkpoint por fonte, taxa/limites, webhook autenticado e fila; habilitar inicialmente em leitura e com poucos deals.
6. Conectar frontend do Motor ao JSON do card; revisão por campo, seleção de fonte, resolução de conflito e compartilhamento de snapshots.
7. Testar com operação piloto, validar análise de lastro com Jurídico/Estruturação, executar handoff real e depois ampliar.
8. Configurar alarmes, métricas, backup, retenção, governança de dados e monitoração de custo.

## Critérios objetivos de aceite

- [ ] 1 empresa com 2 operações independentes sem contaminação.
- [ ] 1 oportunidade com 2 originadores e atribuições individualizadas.
- [ ] Reimportar fonte idêntica sem duplicar evidência nem perder revisão humana.
- [ ] Valor contraditório do mesmo período bloqueia card; outro período não.
- [ ] Fonte sem vínculo explícito fica em quarentena.
- [ ] Apenas evidências validadas preenchem checklist.
- [ ] Risco jurídico-regulatório não pode ser aprovado automaticamente.
- [ ] Snapshot anterior recuperável e aprovado apenas por owner.
- [ ] Troca de fase e reciclagem preservam histórico e vínculo da revisita.
- [ ] Acesso de usuários testado; payload sem mensagens/transcrições completas.
- [ ] Conectores recuperam erros, limites e renovação de subscriptions.
- [ ] Handoff com referências primárias, pendências e versão aprovada.

## Referências normativas/técnicas

- CVM, Resolução 175, Anexo Normativo II (texto consolidado): https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html
- CVM, Resolução 240/2026 (FIDC): https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/cvm-edita-norma-com-ajustes-pontuais-no-anexo-ii-da-resolucao-175-sobre-fidc
- Lei 14.430/2022: https://www2.camara.leg.br/legin/fed/lei/2022/lei-14430-3-agosto-2022-793067-normaatualizada-pl.html
- Microsoft Graph, Outlook change notifications: https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview
- Fireflies API: https://fireflies.ai/api

## Limitações atuais (não omitir ao apresentar)

Implementado nesta branch: schema proposto, engine determinístico, workflow de ingestão manual/API, interface no frontend, revisão humana, timeline, ações, ACL e snapshots. Também há **consultas sob demanda por ID explícito** ao Fireflies e Microsoft Graph (Outlook, Agenda, Teams chat e metadados de SharePoint), por meio de credenciais autorizadas e *feature flags desligadas por padrão*. Detalhes em [DEAL_CARD_CONNECTORS.md](./DEAL_CARD_CONNECTORS.md).

**Não implementado/ligado ainda**: varredura autorizada/recorrente, webhooks/jobs, extração de documentos, transcrições completas, matching persistente/quarentena de fontes ambíguas, integração com credenciais reais de produção, migração em banco real, deploy e homologação de ponta a ponta. A revisão de hipótese não equivale à validação documental de fato; é necessária reclassificação explícita e fundamentada. Evitar chamar de produção até concluir o aceite.


## Evolução 04/11/2026 — triagem persistente e watchlist restrita (branch, não produção)

A arquitetura evoluiu com `dcm_source_intake` e `dcm_source_intake_decisions`: agora a fonte sem vínculo fica persistida como **metadados em quarentena**, privada para o usuário que a recebeu. A decisão de `link` (com acesso ao deal) ou `ignore` exige justificativa e gera registro imutável. O processo não confunde empresa, oportunidade ou revisita.

Foi incluída também a tabela `dcm_source_watches` e endpoints que permitem **monitorar apenas IDs exatos de recursos Microsoft autorizados individualmente pelo usuário**, com checkpoint por versão, limite de consultas e pausa por erros. Alterações são encaminhadas à inbox para triagem. Não há mineração de caixas postais, canais, drives ou agregação automática de fontes.

A interface `/deal-cards` tem inclusão, seleção, descarte e histórico de fontes, coleta pontual Microsoft e opções de ativar/pausar/checar um watch específico.

Migrações adicionais: `db/neon/20261104_deal_source_inbox.sql` e `db/neon/20261104_deal_source_watches.sql`. Flags novas: `DEAL_CARD_MICROSOFT_WATCH_ENABLED=false` por padrão.

**Próximos gates inalterados:** migração Neon de homologação, teste com dados corporativos reais autorizados, autorização TI/Jurídico/LGPD, configuração de agendamento protegido por `CRON_SECRET`, observabilidade, aprovação expressa para produção. Não houve aplicação de migração nem deploy neste trabalho. Ver [manual técnico específico](./DEAL_CARD_CONNECTORS.md).
