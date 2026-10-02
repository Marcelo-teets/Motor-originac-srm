# Auth Production Smoke — Neon Managed Auth

## Objetivo

Validar que o Auth de produção da Origination Intelligence Platform está completamente desacoplado do Supabase Auth e opera com:

- Neon Managed Auth;
- cookie HttpOnly first-party no domínio do Motor;
- JWT curto emitido pelo Neon e validado por JWKS/Ed25519;
- `public.user_profiles` como fonte de perfil e RBAC;
- novos cadastros pendentes até aprovação;
- bootstrap GOD-MODE desabilitado por padrão;
- ausência de chamadas diretas do frontend para `/auth/v1/*` do Supabase.

## Contrato de produção

O smoke `scripts/smoke-auth-production.mjs` exige:

1. `/api/health` com `status=real`, `mode=real` e `dataProvider=neon`.
2. Mesmo SHA entre frontend e backend.
3. Build metadata com:
   - `auth.provider=neon`;
   - `auth.mode=email_password`;
   - `registrationRequiresApproval=true`;
   - `oauthProviderDiscovery=false`;
   - `supportedOAuthProviders=[]`;
   - `captchaEnabled=false`;
   - `privilegedBootstrapDefault=false`;
   - `sessionTransport=first_party_httponly_cookie_plus_short_lived_jwt`.
4. Rotas públicas React:
   - `/login`;
   - `/forgot-password`;
   - `/reset-password`.
5. `/api/auth/bootstrap-status` reportando `enabled=false` e `available=false` em produção.
6. OpenAPI do próprio Neon Auth contendo:
   - `/sign-in/email`;
   - `/get-session`;
   - `/token`;
   - `/sign-out`;
   - `/request-password-reset`;
   - `/reset-password`.
7. Bundle contendo apenas chamadas para o proxy first-party do Motor e sem:
   - `/auth/v1/token`;
   - `/auth/v1/user`;
   - `/auth/v1/settings`;
   - marcadores CAPTCHA legados.

## Execução

```bash
BASE_URL=https://motor-originac-srm.vercel.app \
EXPECTED_SHA=<sha-da-main> \
npm run test:auth-production-smoke
```

O workflow de deploy deve executar o mesmo smoke após promover o SHA correto.

## Bootstrap GOD-MODE

O bootstrap privilegiado é uma operação excepcional. A variável `MOTOR_AUTH_BOOTSTRAP_ENABLED` deve permanecer `false` em produção. Quando for necessário inicializar a primeira conta GOD-MODE:

1. habilitar a variável por janela controlada;
2. confirmar que `neon_auth.user` e `public.user_profiles` ainda estão vazios;
3. usar `/auth/bootstrap` uma única vez;
4. confirmar a claim em `private.auth_bootstrap_claim`;
5. voltar a variável para `false`;
6. executar novamente o production smoke.

Nunca deixar o bootstrap habilitado de forma permanente.

## Interpretação

### passed

Auth Neon, SHA, data plane e fronteira first-party consistentes.

### falha em bootstrap

Não promover enquanto `MOTOR_AUTH_BOOTSTRAP_ENABLED=true`.

### falha em bundle boundary

Algum código voltou a chamar Supabase Auth diretamente. Corrigir antes do merge.

### falha no OpenAPI

O endpoint Managed Auth ou sua configuração mudou; revisar integração antes de promover.
