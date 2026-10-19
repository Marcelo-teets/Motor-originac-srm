# Motor V5 — UI do parecer humano FIDC (integração ao histórico auditável)

**Objetivo:** permitir que um usuário autorizado registre diligências a partir da fila CVM sem promover automaticamente empresas nem confundir a existência do FIDC com elegibilidade.

## Implementação

A tela existente `/capture-inbox`, aba **Cedentes FIDC**, passa a incorporar `FidcHumanReviewPanel`. O componente fica em `frontend/src/components/FidcHumanReviewPanel.tsx` e usa o mesmo frontend React + Vite e a mesma API Neon existente.

Contrato backend (PR #614, necessário antes do funcionamento de escrita):
- `GET /api/candidate-decision-queue/fidc-assignors` — lista de CNPJs com evidência e origem CVM, já publicada.
- `GET /api/candidate-decision-queue/fidc-assignors/reviews` — últimos pareceres de cada CNPJ.
- `GET /api/candidate-decision-queue/fidc-assignors/reviews/:cnpj` — histórico de até 50 pareceres.
- `POST /api/candidate-decision-queue/fidc-assignors/reviews` — registra um parecer humano com disposição, fundamentação e próxima ação.

A UI carrega a lista do backend (não gera cadastros), mostra a fonte CVM e exige confirmação humana explícita. Somente o usuário com perfil ativo `god_mode` vê o formulário. Se a API ainda não existir (HTTP 404) ou falhar, a tela **bloqueia qualquer gravação** e informa o erro. Após um POST confirmado (`reviewRecorded=true`), consulta de novo o histórico persistido, sem preencher estado fictício.

## Disposições

- `needs_evidence`: diligência pendente; não equivale a qualificação.
- `no_go`: não priorizar; permanece histórico.
- `refer_to_identity_review`: permitido na interface só quando `review_lane=business_model_due_diligence` e situação cadastral `ATIVA`. Ainda depende de aprovação humana separada para entrar no Company Master.

A justificativa deve ter 30–3000 caracteres; a próxima ação, 10–1000. O reviewer não é enviado no corpo; é resolvido no backend via token autenticado e validado no banco.

## Ordem de publicação

Esta PR foi criada **diretamente da main** em 19/10/2026, independente das PRs #613 (melhor filtro e checklist) e #614 (backend/auditoria). Para evitar formulário inoperante em produção:

1. Aprovar e mergear #613 e #614 na ordem de integração validada; resolver eventuais conflitos com a main.
2. Reexecutar CI e Neon parity desta PR contra a main atual. Se a API auditável não estiver ativa, o formulário continuará indisponível por desenho.
3. Publicar a migration da #614 pelo fluxo oficial de release e verificar o ledger; **não executar SQL manual no banco de produção**.
4. Publicar o frontend via deploy versionado oficial e conferir o SHA READY.
5. Com administrador humano D-07 ativo, registrar um parecer real e confirmar: histórico preservado, ausência de promoção automática, nenhuma qualificação/score/pipeline fabricado.

## Aceite

- Sem falsos scores, empresas ou usuários;
- painel renderiza para usuário comum como somente-leitura/restrito;
- erros de autorização ou API indisponível são visíveis e bloqueiam gravação;
- seleção de CNPJ só aceita universo CVM carregado;
- envios duplos são bloqueados no estado local durante a requisição;
- parecer confirmado só aparece após confirmação do backend e refresh do histórico;
- teste unitário cobre requisitos de justificativa e encaminhamento;
- os gates A2–A8 do MVP permanecem pendentes de QA humano e comprovação de empresas reais.
