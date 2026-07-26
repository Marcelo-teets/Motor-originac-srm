# Governança de Deploy — Motor Originação

## Objetivo

Preservar a capacidade de deployment da Vercel para produção e impedir que pushes, PRs ou branches de agentes consumam a quota do plano Hobby.

A conta atingiu o limite diário de deployments em 24/07/2026. A política oficial passou a ser **manual-only**, com artefato prebuilt e SHA exato da `main`.

## Estado operacional oficial

Projeto `motor-originac-srm`:

```text
productionBranch=main
gitProviderOptions.createDeployments=disabled
vercel.json git.deploymentEnabled.*=false
```

Consequências:

- nenhum push ou pull request deve criar deployment Git;
- produção permanece no último artefato aprovado;
- GitHub Actions continua executando CI normalmente;
- produção é publicada somente pelo workflow prebuilt controlado;
- previews também exigem execução manual explícita;
- a integração Git permanece desativada depois de qualquer execução.

## Defesa em profundidade

O repositório mantém:

```json
{
  "git": {
    "deploymentEnabled": {
      "*": false
    }
  },
  "ignoreCommand": "bash scripts/vercel-ignore-build.sh"
}
```

O teste `scripts/vercel-deployment-config.test.mjs` falha se alguma branch voltar a ser habilitada.

O nível central da Vercel também deve permanecer:

```text
gitProviderOptions.createDeployments=disabled
```

As duas proteções são complementares.

## Produção por artefato prebuilt

Workflow oficial:

```text
.github/workflows/vercel-production-deploy.yml
```

Etapas:

1. recebe um SHA completo de 40 caracteres;
2. confirma que ele é exatamente o HEAD da `main`;
3. confirma que deploys Git estão desativados;
4. faz checkout da `main` pelo GitHub Actions;
5. executa `vercel pull --environment=production`;
6. executa `vercel build --prod`;
7. publica com `vercel deploy --prebuilt --prod`;
8. injeta o SHA no build e no runtime;
9. valida `/api/health` e `/build-meta.json` contra o mesmo SHA;
10. executa o Production Auth Smoke;
11. executa o smoke estrito do CAPTCHA quando a site key existe;
12. confirma novamente `createDeployments=disabled` em `always()`.

Esse fluxo não depende da credencial Git da Vercel.

## Limite de Serverless Functions

O plano Hobby permite no máximo 12 funções por deployment.

Gate permanente:

```text
scripts/vercel-function-budget.test.mjs
```

Estado após a consolidação:

```text
9/12 funções
```

Se o diretório `api/` voltar a ultrapassar o limite, o CI falha antes do merge.

## Estados de deployment

Somente `READY` é sucesso.

Os estados abaixo são falhas explícitas:

- `ERROR`;
- `CANCELED`;
- `DELETED`.

O controlador lança `deployment_not_ready` e não permite workflow verde em estado terminal inválido.

## Fluxo recomendado

1. Desenvolver em PR limpa sobre a `main` atual.
2. Executar CI completo.
3. Fazer merge somente com checks verdes.
4. Identificar o SHA atual da `main`.
5. Disparar `Vercel Production Deploy` com esse SHA.
6. Aguardar build, upload e smoke.
7. Confirmar o SHA no frontend e backend.
8. Confirmar que deploys Git continuam desativados.

## Auth e CAPTCHA

A aplicação opera em dois modos:

- `full`: CAPTCHA configurado; e-mail/senha e recuperação disponíveis;
- `oauth_fallback`: GitHub OAuth disponível; e-mail/senha permanece indisponível enquanto a site key não estiver configurada.

Estado publicado em 26/07/2026:

```text
mode=oauth_fallback
GitHub OAuth=enabled
Google OAuth=disabled
VITE_CAPTCHA_ENABLED=true
VITE_CAPTCHA_PROVIDER=turnstile
VITE_CAPTCHA_SITE_KEY=not configured
```

A site key deve corresponder ao secret/provider configurado no Supabase Auth. Nunca armazenar CAPTCHA secret, OAuth secret, service role ou token Vercel no repositório.
