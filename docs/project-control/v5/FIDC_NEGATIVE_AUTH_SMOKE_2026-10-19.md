# V5 — Canary negativo da API de diligência FIDC

**Motivação:** testes de login/Neon Auth e de deployment não garantiam que os endpoints específicos de revisão FIDC exigiam autenticação. Uma exposição indevida de CNPJ, justificativa ou dados do revisor seria um risco para o motor de originação e a governança DCM.

## Entrega
- Script independente `scripts/smoke-fidc-audit-access.mjs` verifica apenas caminhos de falha: `GET /api/candidate-decision-queue/fidc-assignors`, `GET .../reviews`, `GET .../reviews/:cnpj`, `POST .../reviews`.
- Cada chamada ocorre **sem Authorization nem Cookie**. O POST envia apenas `{}` (corpo não autorizável), e o esperado é HTTP 401, JSON, sem campo de evidência/dados/reviewer.
- URLs que retornem redirecionamento ao login, HTML da SPA ou HTTP 200 sem Auth **reprovam**.
- Suíte `scripts/smoke-fidc-audit-access.test.mjs` está ligada ao `npm run test:auth-production-smoke` do CI, com casos positivos negativos e proteção contra vazamento.
- O workflow oficial `.github/workflows/vercel-production-deploy.yml` executa esse canary **após** a validação geral de Auth e antes do encerramento do release.

## Limites do teste
Um resultado verde só comprova o bloqueio de acesso anônimo; **não** comprova gravação, RBAC de perfil convidado, relatório completo ou usuário administrador real. A homologação positiva depende de D-07 (RB-03), janela de primeiro usuário com titular presente, registro de parecer real com consentimento, read-after-write e inspeção do ledger. Não iniciar bootstrap automático nem inventar perfis.

O fluxo de captura, busca, enriquecimento, ICP e ranking permanece intacto. Nenhuma migration, nova stack, criação de empresa, perfil ou parecer incluídos.
