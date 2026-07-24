# Production Auth Smoke — Motor Originação

## Objetivo

Provar automaticamente que o deployment canônico contém a versão correta dos fluxos de autenticação e que frontend e backend foram publicados a partir do mesmo commit.

O smoke não considera HTTP 200 isoladamente como evidência suficiente. Ele valida código, SHA, rotas, bundle e modo operacional do Auth.

## Modos operacionais

### `full`

- CAPTCHA ativo;
- site key presente no build;
- e-mail/senha disponível;
- recuperação de senha disponível;
- OAuth disponível conforme providers ativos.

Resultado do smoke:

```text
passed
```

### `oauth_fallback`

- CAPTCHA ativo;
- site key ainda ausente;
- e-mail/senha e recuperação explicitamente desabilitados;
- OAuth continua disponível;
- a interface orienta o usuário a usar o provider ativo, atualmente GitHub.

Resultado do smoke quando `REQUIRE_CAPTCHA_SITE_KEY=false`:

```text
passed_with_oauth_fallback
```

Esse resultado comprova plataforma acessível, mas **não** equivale a Auth completo.

## O que é validado

1. `GET /api/health` retorna `status=real`, `data.mode=real` e SHA de produção.
2. `GET /build-meta.json` identifica SHA, branch, ambiente e modo de Auth.
3. Frontend e backend possuem o mesmo SHA.
4. O SHA publicado corresponde ao deployment esperado.
5. As rotas públicas retornam o shell React:
   - `/login`;
   - `/forgot-password`;
   - `/reset-password`;
   - `/auth/callback`.
6. O bundle contém:
   - `gotrue_meta_security`;
   - `captcha_token`;
   - rotas de recuperação/callback;
   - `/auth/v1/settings`;
   - `github`, `google` e `god_mode`.
7. O metadata confirma:
   - `auth.mode`;
   - `emailPasswordConfigured`;
   - `oauthFallbackSupported`;
   - provider CAPTCHA;
   - presença da site key;
   - transporte `gotrue_meta_security.captcha_token`;
   - descoberta dinâmica de OAuth.

## Contrato CAPTCHA

O formato obrigatório é:

```json
{
  "gotrue_meta_security": {
    "captcha_token": "token"
  }
}
```

O smoke rejeita o contrato legado com `captcha_token` no nível superior.

## Descoberta OAuth

A tela de login consulta:

```text
/auth/v1/settings
```

Estado auditado em 24/07/2026:

- GitHub: habilitado;
- Google: desabilitado;
- e-mail/senha: habilitado no Supabase, condicionado ao CAPTCHA no frontend.

O authorize GitHub preserva o retorno:

```text
https://motor-originac-srm.vercel.app/auth/callback
```

## Execução automática

O workflow `.github/workflows/production-auth-smoke.yml` roda após deployment de produção com:

```text
REQUIRE_CAPTCHA_SITE_KEY=false
```

Assim ele aceita `oauth_fallback`, mas registra explicitamente o modo parcial.

## Execução manual — Auth completo

```bash
BASE_URL=https://motor-originac-srm.vercel.app \
EXPECTED_SHA=<sha-da-main> \
REQUIRE_CAPTCHA_SITE_KEY=true \
node scripts/smoke-auth-production.mjs
```

## Execução manual — fallback OAuth

```bash
BASE_URL=https://motor-originac-srm.vercel.app \
EXPECTED_SHA=<sha-da-main> \
REQUIRE_CAPTCHA_SITE_KEY=false \
node scripts/smoke-auth-production.mjs
```

## Build metadata

Antes do `vite build`, `frontend/scripts/write-build-meta.mjs` gera:

```text
frontend/public/build-meta.json
```

O arquivo publica apenas estado operacional e identificadores não secretos. CAPTCHA secret, OAuth secrets, service role e token da Vercel nunca entram no bundle.

## Interpretação

### `passed`

Auth completo aprovado.

### `passed_with_oauth_fallback`

Aplicação acessível por OAuth; e-mail/senha e recuperação ainda dependem da site key correta.

### `VITE_CAPTCHA_SITE_KEY is not configured`

O smoke foi executado em modo estrito, mas o build está em fallback.

### `CAPTCHA token transport is incorrect`

O bundle utiliza contrato incompatível com GoTrue.

### SHA divergente

Alias/deployment inconsistente. Não aprovar.

### Health fora de `real`

Backend em fallback/mock. Não aprovar.

## Limite do smoke

O teste não resolve um CAPTCHA real nem lê a caixa de e-mail. O teste funcional final de recuperação exige envio, abertura do link, alteração da senha e novo login autenticado.
