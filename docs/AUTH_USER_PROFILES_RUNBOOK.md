# Auth & User Profiles Runbook — Neon

## 1. Fonte de verdade

A plataforma usa:

- Neon Managed Auth como fonte oficial de identidade;
- `neon_auth.user` e tabelas relacionadas para credenciais/sessões;
- `public.user_profiles` para perfil, status e RBAC;
- backend Node/TypeScript como proxy first-party para operações de Auth.

O frontend não autentica diretamente contra Supabase Auth.

## 2. Sessão

Fluxo:

1. frontend chama `/api/auth/login`;
2. backend autentica em Neon Managed Auth;
3. backend recebe o token opaco de sessão do Neon;
4. backend grava esse token em cookie `motor_neon_session` com `HttpOnly; Secure; SameSite=Lax`;
5. backend obtém `/token` no Neon Auth e devolve apenas o JWT curto ao frontend;
6. requests protegidos usam `Authorization: Bearer <jwt>`;
7. backend valida assinatura via JWKS/Ed25519;
8. renovação chama `/api/auth/session`, usando o cookie first-party.

O browser nunca manipula o token opaco de sessão do Neon nem um refresh token.

## 3. Perfis e RBAC

Papéis:

- `god_mode`: administrador único;
- `common`: usuário operacional.

Status:

- `active`: acesso permitido;
- `invited`: cadastro existe, mas acesso ainda não foi aprovado;
- `disabled`: acesso bloqueado.

Regras:

- novos cadastros criados por `/auth/register` entram como `common + invited`;
- login só prossegue para perfis `active`;
- `god_mode` pode listar usuários e alterar status;
- o próprio GOD-MODE não pode se desativar nem remover seu próprio papel;
- a aplicação impede promoção de outra conta para `god_mode`.

## 4. Rotas

Públicas:

- `GET /auth/bootstrap-status`
- `POST /auth/register`
- `POST /auth/bootstrap` — somente quando explicitamente habilitado
- `POST /auth/login`
- `POST /auth/session`
- `POST /auth/password/request`
- `POST /auth/password/reset`
- `POST /auth/logout`

Protegidas:

- `GET /auth/me`
- `GET /auth/profile`
- `PATCH /auth/profile`
- `GET /auth/users` — GOD-MODE
- `PATCH /auth/users/:id/access` — GOD-MODE
- `POST /auth/password/change`

## 5. Variáveis

Backend:

```text
MOTOR_NEON_DATABASE_URL
NEON_AUTH_BASE_URL
NEON_AUTH_JWKS_URL
APP_BASE_URL
MOTOR_AUTH_BOOTSTRAP_ENABLED=false
```

Frontend/build:

```text
VITE_NEON_AUTH_URL
```

Variáveis Supabase públicas podem permanecer apenas para superfícies legadas não-Auth até sua retirada. Elas não definem identidade nem sessão.

## 6. Bootstrap GOD-MODE

A tabela `private.auth_bootstrap_claim` mantém uma claim singleton irreversível no fluxo normal.

Pré-condições:

- `MOTOR_AUTH_BOOTSTRAP_ENABLED=true`;
- nenhum usuário em `neon_auth.user`;
- nenhum perfil em `public.user_profiles`;
- nenhuma claim existente.

Após a criação:

- usuário recebe `god_mode + active`;
- claim é gravada;
- variável deve voltar imediatamente para `false`;
- production smoke precisa passar.

## 7. OAuth

Google compartilhado existe no Neon Managed Auth, mas o frontend não o expõe nesta fase. O callback OAuth só será reativado quando terminar no proxy first-party do Motor e obedecer ao mesmo contrato de sessão/cookie.

## 8. Recuperação e troca de senha

- recuperação: `/auth/password/request` → Neon `/request-password-reset`;
- reset: `/auth/password/reset` → Neon `/reset-password`;
- troca autenticada: `/auth/password/change` → Neon `/change-password`;
- nova senha mínima no Motor: 10 caracteres.

## 9. Operação segura

Antes de promover mudanças de Auth:

1. CI verde;
2. production smoke verde;
3. bootstrap desligado;
4. zero chamadas diretas `/auth/v1/*` do Supabase no bundle;
5. `user_profiles` sem grants públicos indevidos;
6. nenhum usuário de teste residual em `neon_auth.user`.

Auth deve servir o objetivo do projeto: liberar acesso institucional ao motor de originação sem criar uma dependência operacional externa que interrompa ranking, qualification, patterns, thesis ou pipeline.
