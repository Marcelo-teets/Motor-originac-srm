# Governança de Deploy — Motor Originação

## Objetivo

Preservar a capacidade de deployment da Vercel para produção, incidentes e validações realmente necessárias.

A conta Hobby atingiu o limite diário de 100 deployments em 24/07/2026. Branches antigas, criadas antes da política versionada em `vercel.json`, continuaram criando deployments cancelados e consumindo quota. Por isso, a proteção oficial passou a existir também no nível central do projeto Vercel.

## Estado operacional oficial

Configuração do projeto `motor-originac-srm`:

```text
productionBranch=main
gitProviderOptions.createDeployments=disabled
```

Consequências:

- pushes e pull requests não criam deployments automaticamente;
- a aplicação em produção permanece no último deployment aprovado;
- GitHub Actions continua executando CI normalmente;
- produção é publicada manualmente por SHA exato da `main`;
- automações Git permanecem desligadas depois do deployment.

## Por que a proteção central é necessária

O `vercel.json` da branch só é interpretado depois que a Vercel recebe o evento e inicia o processo associado ao commit. Branches antigas podem carregar configuração anterior. O campo central `gitProviderOptions.createDeployments=disabled` impede a criação pelo Git provider independentemente da versão existente na branch.

## Defesa em profundidade no repositório

O repositório mantém:

```json
{
  "git": {
    "deploymentEnabled": {
      "*": false,
      "main": true,
      "preview/*": true,
      "release/*": true
    }
  },
  "ignoreCommand": "bash scripts/vercel-ignore-build.sh"
}
```

Essas regras continuam úteis caso a integração automática seja reabilitada futuramente, mas não substituem a política central atual.

## Produção manual por SHA

Controlador:

```text
scripts/vercel-production-control.mjs
```

Comandos:

```bash
npm run vercel:production-control -- status
npm run vercel:production-control -- disable-auto
npm run vercel:production-control -- enable-auto
npm run vercel:production-control -- deploy-production --sha=<40-char-sha> --wait=true
```

O controlador:

1. exige SHA completo de 40 caracteres;
2. procura deployment ativo/READY para o mesmo SHA;
3. reutiliza o deployment existente quando aplicável;
4. mantém `createDeployments=disabled`;
5. envia `gitSource` com repo, branch `main` e SHA exato;
6. pode aguardar estado terminal;
7. restaura o bloqueio em `finally` se houver habilitação temporária;
8. nunca registra o token da Vercel.

## Workflow manual

Arquivo:

```text
.github/workflows/vercel-production-deploy.yml
```

Regras:

- execução somente por `workflow_dispatch`;
- concurrency única para produção;
- exige `VERCEL_TOKEN` em GitHub Actions secrets;
- confirma que o SHA solicitado é exatamente o HEAD da `main`;
- cria no máximo um deployment por execução;
- confirma no final que automações Git permanecem desativadas.

## Fluxo recomendado

1. Desenvolver em PR limpa sobre a `main` atual.
2. Executar CI completo.
3. Fazer merge somente com checks verdes.
4. Identificar o SHA atual da `main`.
5. Confirmar quota disponível.
6. Executar o workflow manual ou o controlador com esse SHA.
7. Aguardar `READY`.
8. Validar `/api/health` e `/build-meta.json` contra o mesmo SHA.
9. Executar o smoke funcional da entrega.
10. Manter deploys Git automáticos desativados.

## Preview

Enquanto a política central estiver desativada, branches `preview/*` e `release/*` não geram preview automaticamente.

Quando um preview for indispensável, usar um deployment manual explícito ou reabilitar a integração apenas durante uma janela controlada, restaurando `disabled` imediatamente após a criação.

## Incidente de 24/07/2026

- limite alcançado: 100 deployments/dia;
- produção permaneceu no SHA anterior;
- reset informado: 25/07/2026 às 13:37, fuso `America/Sao_Paulo`;
- causa estrutural: volume de branches/agentes e branches antigas com política desatualizada;
- contenção aplicada: `gitProviderOptions.createDeployments=disabled` no projeto Vercel;
- prevenção: controlador idempotente e workflow de deployment único por SHA.

## Auth e CAPTCHA

O deployment atual pode operar em dois modos:

- `full`: CAPTCHA configurado, e-mail/senha e recuperação disponíveis;
- `oauth_fallback`: GitHub OAuth disponível, e-mail/senha e recuperação desativados até a site key ser configurada.

Variáveis já presentes:

```text
VITE_CAPTCHA_ENABLED=true
VITE_CAPTCHA_PROVIDER=turnstile
```

Pendente:

```text
VITE_CAPTCHA_SITE_KEY=<site key pública correspondente ao provider real>
```

Nunca armazenar CAPTCHA secret, OAuth secret, service role ou token Vercel no repositório.
