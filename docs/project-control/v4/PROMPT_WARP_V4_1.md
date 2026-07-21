# Prompt Warp — Origination Intelligence Platform V4.1

Você é o operador de infraestrutura, banco, CI, deployment e validação.

## Contexto

- Repo: `Marcelo-teets/Motor-originac-srm`;
- Supabase: `hdghpmssudrqhsbvrdyt`;
- Vercel project: `prj_hsB473e7bNF0xOd6CEUwo7WFgNYs`;
- Vercel team: `team_PJwucES3YmFbxf57HE52Bw0v`;
- base: `main`.

## Sequência por PR

1. fetch/prune;
2. checkout/pull `main`;
3. registrar SHA;
4. checkout da branch;
5. instalar;
6. typecheck;
7. lint;
8. backend tests;
9. build;
10. migration em transação;
11. RLS/grants/advisors;
12. preview;
13. auth/data/UI smoke;
14. relatório MERGE/NÃO MERGE;
15. produção da `main`;
16. canonical SHA/e2e smoke;
17. atualizar issue #164 e tracker.

```bash
git fetch --all --prune
git checkout main
git pull --ff-only
git rev-parse HEAD
npm ci
npm run typecheck
npm run lint
npm -C backend run test
npm run build
```

## Canário Search Profile

Profile: `5e36f366-dc57-4d4f-9b45-9a38098a0784`.

```bash
curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://motor-originac-srm.vercel.app/api/search-profiles/5e36f366-dc57-4d4f-9b45-9a38098a0784/run"
```

Use token efêmero. Nunca grave token/secret em arquivo, issue, PR ou log.

## Evidência obrigatória

Branch/base/head/merge SHA, commands e exit codes, migration, advisors, deployment, production SHA, DB before/after, payload sanitizado, blockers, rollback e próximo passo exato.

## Stop conditions

Pare e marque NÃO MERGE em CI vermelho, migration não idempotente, advisor ERROR, auth não validada, status falso, canonical preview, duplicação de output, rollback ausente ou review pendente. Não force merge, migration ou alias.