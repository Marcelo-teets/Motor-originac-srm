# Production Auth Smoke — Motor Originação

## Objetivo

Provar automaticamente que o deployment canônico contém a versão correta dos fluxos de autenticação e que frontend e backend foram publicados a partir do mesmo commit.

O smoke é deliberadamente fail-closed: uma página que apenas retorna HTTP 200 não é considerada evidência suficiente.

## O que é validado

1. `GET /api/health` retorna:
   - `status=real`;
   - `data.mode=real`;
   - SHA de produção.
2. `GET /build-meta.json` identifica:
   - SHA do frontend;
   - branch;
   - ambiente;
   - rotas de Auth incluídas;
   - provedor CAPTCHA;
   - presença da site key pública no build;
   - transporte do token como `captcha_token`.
3. Frontend e backend possuem o mesmo SHA.
4. O SHA publicado corresponde ao deployment esperado.
5. As rotas públicas retornam o shell React:
   - `/login`;
   - `/forgot-password`;
   - `/reset-password`;
   - `/auth/callback`.
6. O bundle JavaScript contém os marcadores críticos:
   - `captcha_token`;
   - `/forgot-password`;
   - `/reset-password`;
   - `/auth/callback`;
   - `god_mode`.
7. O build declara o botão Google OAuth e a camada GOD-MODE.

## Execução automática

O workflow `.github/workflows/production-auth-smoke.yml` roda quando:

- um deployment de produção/main é marcado como `success` pelo GitHub/Vercel;
- houver execução manual por `workflow_dispatch`.

O relatório é escrito no GitHub Actions Job Summary.

## Execução manual

```bash
BASE_URL=https://motor-originac-srm.vercel.app \
EXPECTED_SHA=<sha-da-main> \
REQUIRE_CAPTCHA_SITE_KEY=true \
node scripts/smoke-auth-production.mjs
```

## Build metadata

Antes do `vite build`, o script `frontend/scripts/write-build-meta.mjs` gera:

```text
frontend/public/build-meta.json
```

A Vite copia esse arquivo para o output estático. Nenhuma credencial secreta é exposta.

São publicados apenas:

- identificadores de build;
- estado booleano da site key pública;
- nome do provedor;
- capacidades funcionais esperadas.

A site key CAPTCHA é pública por natureza, mas o arquivo registra apenas se ela está configurada. Secret key do CAPTCHA, Google OAuth secret, service role e token da Vercel nunca entram no bundle.

## Falhas esperadas e interpretação

### `VITE_CAPTCHA_SITE_KEY is not configured`

O código está publicado, porém a variável pública não entrou no build da Vercel. Configurar a variável em Production e gerar novo deployment.

### SHA de frontend e backend divergentes

O deployment está inconsistente ou o alias canônico aponta para artefatos diferentes. Não aprovar o rollout.

### Bundle sem `captcha_token`

A produção ainda serve uma versão anterior ao conserto do CAPTCHA.

### Rota retorna conteúdo diferente do shell React

Rewrites, proteção de deployment ou domínio canônico estão incorretos.

### Health não está em modo real

O backend está em fallback/mock e o rollout não deve ser aceito.

## Limite do smoke

O teste confirma código, configuração pública e publicação. Ele não resolve um CAPTCHA real nem lê a caixa de e-mail do usuário.

O teste funcional final de recuperação de senha continua sendo comprovado por:

- envio aceito pelo Supabase Auth;
- evento `mail.send`;
- acesso ao link de recuperação;
- atualização da senha;
- novo login autenticado.
