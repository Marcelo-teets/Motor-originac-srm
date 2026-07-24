# Knowledge Vault V12 — Briefing decisório company-scoped

## Objetivo

Transformar o contexto real já disponível no Company Detail em um briefing operacional para reunião, abordagem comercial e registro pós-conversa.

## Entradas oficiais

- Company Master;
- snapshot mais recente de Qualification;
- sinais da empresa;
- outputs de monitoramento;
- estágio, prioridade, ticket e próxima ação do pipeline;
- notas e referências já vinculadas no Knowledge Vault;
- `Pre-Call Briefing` do módulo ABM, incluindo resumo institucional, tese comercial, why now, buying committee, touchpoints, objeções, riscos de conversa, próximo passo e CTA.

A V12 não cria uma segunda lógica de pre-call. Ela reutiliza o serviço ABM existente e transforma seu snapshot, junto do contexto de crédito, em um documento editável e versionável.

## Fluxo

1. O usuário abre a empresa.
2. O painel carrega em paralelo o workspace do Knowledge Vault e o Pre-Call ABM.
3. O painel identifica se o ABM veio como `real`, `partial`, `mock` ou `unavailable`.
4. O sistema consolida um rascunho Markdown editável.
5. Fatos observados, inferências, lacunas e origem do snapshot permanecem explícitos.
6. O usuário revisa o texto e confirma a validação humana.
7. O briefing é salvo como nota `meeting`, vinculado ao `company_id`, versionado e visível ao time.

Ao regenerar o documento, a confirmação anterior é anulada e um salvamento anterior deixa de ser tratado como válido para o novo snapshot.

## Conteúdo do briefing

- governança e origem do snapshot;
- resumo executivo;
- diagnóstico de crédito;
- por que agora;
- sinais e outputs prioritários;
- hipótese de estrutura;
- buying committee;
- touchpoints e objeções;
- riscos comerciais e de crédito;
- próxima ação e CTA;
- memória relacionada;
- perguntas para reunião;
- decisão pós-conversa.

## Guardrails

- não altera qualification, patterns, lead score, ranking ou pipeline;
- não promove evidência a fato automaticamente;
- exige confirmação humana explícita;
- normaliza força, confiança, influência, champion e blocker para percentuais legíveis;
- identifica o template, o snapshot e a qualidade da origem ABM nas propriedades da nota;
- registra `abmPreCallIncluded`, `abmPreCallSource` e `scoreMutation=false`;
- recomenda validação em fontes primárias;
- trata data inválida como lacuna visível, em vez de quebrar a tela;
- fallback ABM permanece identificado como fallback.

## Resultado esperado

O sistema passa a responder, no fluxo da empresa:

- o que sabemos;
- o que é inferência;
- por que agora;
- quem participa da decisão;
- quais objeções e riscos comerciais já apareceram;
- qual estrutura parece aderente;
- o que ainda precisa ser validado;
- quais perguntas devem ser feitas;
- qual decisão e próxima ação devem ser registradas.

## Validação

- frontend typecheck e build;
- carregamento paralelo Vault + ABM;
- fallback ABM sem derrubar o painel;
- regeneração anulando confirmação antiga;
- bloqueio de salvamento sem confirmação;
- salvamento `meeting` com `company_id`, template, snapshot e `scoreMutation=false`;
- smoke transacional com rollback no Supabase real.
