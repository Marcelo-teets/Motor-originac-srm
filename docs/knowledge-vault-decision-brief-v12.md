# Knowledge Vault V12 — Briefing decisório company-scoped

## Objetivo

Transformar o contexto real já disponível no Company Detail em um briefing operacional para reunião, abordagem comercial e registro pós-conversa.

## Entradas

- Company Master;
- snapshot mais recente de Qualification;
- sinais da empresa;
- outputs de monitoramento;
- estágio, prioridade, ticket e próxima ação do pipeline;
- notas e referências já vinculadas no Knowledge Vault.

## Fluxo

1. O usuário abre a empresa.
2. O painel consolida um rascunho Markdown editável.
3. O usuário revisa fatos, inferências, lacunas e fontes.
4. A confirmação humana habilita o salvamento.
5. O briefing é salvo como nota `meeting`, vinculado ao `company_id`, versionado e visível ao time.

## Guardrails

- não altera qualification, patterns, lead score, ranking ou pipeline;
- não promove evidência a fato automaticamente;
- exige confirmação humana explícita;
- identifica o template e o snapshot usado nas propriedades da nota;
- registra `scoreMutation=false`;
- recomenda validação em fontes primárias.

## Resultado esperado

O sistema passa a responder, no fluxo da empresa:

- o que sabemos;
- o que é inferência;
- por que agora;
- qual estrutura parece aderente;
- o que ainda precisa ser validado;
- quais perguntas devem ser feitas;
- qual decisão e próxima ação devem ser registradas.
