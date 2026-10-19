# FIDC V5 — Registro de revisão humana com evidência

**Fase:** A2 (triagem comercial) · **Projeto:** Origination Intelligence Platform · **Escopo:** Brasil.
**Dependência:** `fidc_assignor_commercial_review_v5` (evidência CVM e cadastro; NÃO é uma lista de leads aprovados).

## Problema
A fila FIDC até 14/10 apresentava 85 CNPJs de cedentes, 51 razões sociais corroboradas e classificação de revisão derivada da fonte, mas **não armazenava o parecer humano sobre a elegibilidade comercial**. O protocolo de identidade `candidate_identity_reviews` pressupõe um candidato já capturado e não deve ser reutilizado para classificar cedentes que ainda não são candidatos.

## Implementação

- Migration: `db/neon/20261019_neon_fidc_assignor_human_review_log_v5.sql`, no plano oficial `scripts/lib/neon-migration-plan.mjs` e allowlist.
- `fidc_assignor_human_reviews_v5`: registro **append-only** (um evento por revisão), com CNPJ, disposição, rationale, próxima ação, usuário de fato autenticado e cópia das evidências CVM/cadastral observadas no momento.
- `fidc_assignor_latest_human_review_v5`: visão somente leitura, decisão humana mais recente por CNPJ, sem inferir qualificação ou autorizar promoção.
- `record_fidc_assignor_human_review_v5`: valida o JWT context `request.jwt.claim.sub`, o `user_profiles` ativo `god_mode`, a existência do CNPJ na view de origem e a combinação permitida de classificação cadastral e disposição. Sem escrita em `companies`, `pipeline`, `qualification_snapshots`, `lead_score_snapshots` ou `ranking_v2`.
- Backend em `backend/src/services/fidcAssignorHumanReviewService.ts`, ligado ao router existente `/candidate-decision-queue`. Não foi criada nova função Vercel nem stack alternativa.

## Rotas autenticadas

Todas exigem `Authorization: Bearer <token>` e perfil ativo `god_mode`.

- `POST /api/candidate-decision-queue/fidc-assignors/reviews`: registra uma revisão. JSON:
  ```json
  {
    "cnpj": "00000000000000",
    "disposition": "needs_evidence",
    "rationale": "A vinculação ao FIDC é observada, mas não comprova os recebíveis, o ICP ou o funding gap.",
    "nextAction": "Verificar atividade operacional, carteira, escala e fontes da empresa."
  }
  ```
  O CNPJ acima é apenas um exemplo de formato e **não** deve ser enviado à produção.
- `GET /api/candidate-decision-queue/fidc-assignors/reviews`: parecer atual por CNPJ.
- `GET /api/candidate-decision-queue/fidc-assignors/reviews/:cnpj`: histórico individual (até 50 eventos).

**Disposições possíveis:**

1. `needs_evidence`: diligência aberta, sem elegibilidade.
2. `no_go`: revisão humana apontou motivo para não priorizar; fonte e fundamento ficam preservados.
3. `refer_to_identity_review`: caso com cadastro ATIVA e fila de modelo de negócio; *encaminhamento* para avaliação de identidade, não aprovação.

A API nunca aceita disposition `eligible`, `approved` ou `promoted` neste estágio. `rationale` exige entre 30 e 3000 caracteres; `nextAction`, de 10 a 1000. O usuário responsável vem exclusivamente do JWT verificado, não do corpo da requisição.

## Segurança e QA

- RLS habilitada; acesso direto negado aos papéis públicos/anônimos/autenticados; backend usa Neon PostgreSQL existente.
- A função SQL confere identidade e papel de usuário novamente no banco para bloquear chamada autenticada atribuída a outra pessoa.
- Sinais `receivables`, `funding_gap` e ICP não são preenchidos como verdade a partir do vínculo CVM.
- Testes: `backend/src/services/fidcAssignorHumanReviewService.test.ts` (payload e antifraude de campos) e `scripts/neon-v5-release-migration-gate.test.mjs` (governança de migrations, gates e ausência de promoção).
- CI, paridade Neon e build devem passar; não aplicar SQL manual diretamente em production.
- **Sem bootstrap humano Auth D-07**, nenhum parecer real deve ser fabricado para cumprir meta.

## Aceite e dependências seguintes

1. Mesclar a PR após CI e Neon Runtime Parity aprovados.
2. Publicar via release oficial versionado; confirmar `main SHA = Vercel READY SHA`, ledger da migration e consultas read-only.
3. Integrar o formulário à aba Cedentes FIDC, preferencialmente após merge da PR #613 (filtros e checklist).
4. Fazer diligência comercial de pelo menos cinco empresas brasileiras comprovadamente tech/tech-backed, com recebíveis/crédito e porte adequados, registrando no-go onde necessário.
5. Promover empresas **individualmente**, usando revisão de identidade já existente, depois executar `enrichment → qualification → patterns → score → thesis → ranking → pipeline`.

**Este desenvolvimento fecha uma lacuna de auditabilidade, não o aceite do MVP.**
