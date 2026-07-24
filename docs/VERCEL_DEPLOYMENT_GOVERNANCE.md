# Governança de Deploy — Motor Originação

## Objetivo

Preservar a capacidade de deploy da Vercel para mudanças que realmente impactam produção ou precisam de preview explícito.

A conta Hobby possui limites de deployments e builds. Commits frequentes em branches operacionais e de agentes podem consumir essa capacidade antes de uma entrega prioritária.

## Política oficial

### Produção

A branch `main` continua gerando deployment automático de produção.

### Preview explícito

Um preview deve ser solicitado criando a branch com um dos prefixos:

- `preview/`
- `release/`

Exemplos:

```text
preview/auth-captcha-smoke
preview/company-detail-v12
release/2026-07-auth
```

### Branches sem deployment automático

Branches comuns de desenvolvimento não geram preview automaticamente, incluindo:

- `agent/*`
- `fix/*`
- `docs/*`
- `feat/*`
- branches temporárias de ingestão e conectores

Essas branches continuam passando pelo GitHub Actions para typecheck e build. A ausência de preview automático não elimina a validação de código.

## Proteção primária: `git.deploymentEnabled`

A proteção do limite diário acontece antes da criação do deployment:

```json
{
  "git": {
    "deploymentEnabled": {
      "*": false,
      "main": true,
      "preview/*": true,
      "release/*": true
    }
  }
}
```

A regra global `* = false` bloqueia branches não autorizadas. As regras específicas com valor `true` preservam produção e previews intencionais.

Essa é a barreira principal porque um build apenas cancelado pelo Ignore Build Step ainda pode consumir quota de deployment.

## Proteção secundária: Ignore Build Step

O comando versionado em `vercel.json` é:

```json
{
  "ignoreCommand": "bash scripts/vercel-ignore-build.sh"
}
```

Na Vercel:

- `exit 0` ignora o build;
- `exit 1` continua o build/deployment.

O script replica a política de branches como defesa em profundidade e permite deploys manuais/API sem referência Git.

## Fluxo recomendado

1. Desenvolver em PR limpa sobre a `main` atual.
2. Validar typecheck e build no GitHub Actions.
3. Quando houver necessidade visual ou funcional de preview, usar branch `preview/*`.
4. Fazer merge somente após os checks obrigatórios.
5. Validar o deployment de produção pelo commit exato da `main`.

## Incidente de 24/07/2026

A conta alcançou o limite diário de 100 deployments. Como consequência, a correção de Auth já incorporada à `main` não pôde ser publicada imediatamente pela Vercel.

O reset informado pela API da Vercel ocorre em 25/07/2026 às 13:37 no fuso `America/Sao_Paulo`.

Esta política reserva capacidade para:

- produção;
- incidentes;
- smoke tests explícitos;
- releases priorizadas.

## Auth e CAPTCHA

A governança de deploy não substitui a configuração externa do Auth. Para login com CAPTCHA, Production e Preview precisam possuir as variáveis públicas correspondentes ao mesmo provedor habilitado no Supabase:

```text
VITE_CAPTCHA_ENABLED=true
VITE_CAPTCHA_PROVIDER=turnstile
VITE_CAPTCHA_SITE_KEY=<site key pública>
```

Nunca armazenar secret key do CAPTCHA, credenciais OAuth ou tokens da Vercel no repositório.
