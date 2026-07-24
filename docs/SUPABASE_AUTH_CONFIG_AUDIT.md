# Supabase Auth Configuration Audit

## Objetivo

Ler a configuração efetiva do Supabase Auth pelo Management API sem registrar tokens, CAPTCHA secrets, senhas ou chaves privadas.

O audit resolve uma lacuna operacional importante: o endpoint público `/auth/v1/settings` informa providers OAuth, mas não revela o provider CAPTCHA configurado no projeto.

## Fonte oficial

Endpoint:

```text
GET https://api.supabase.com/v1/projects/hdghpmssudrqhsbvrdyt/config/auth
```

Autorização:

```text
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

O token precisa de permissão `auth_config_read`.

## Secret esperado no GitHub

```text
SUPABASE_ACCESS_TOKEN
```

O valor deve existir somente em:

```text
Settings → Secrets and variables → Actions
```

Nunca adicionar o token ao código, documentação, artifacts ou logs.

## Workflow

Arquivo:

```text
.github/workflows/supabase-auth-config-audit.yml
```

Pode ser executado manualmente e também valida alterações no próprio audit durante pull requests.

O artifact gerado contém apenas:

- token de gerenciamento disponível ou ausente;
- status HTTP sanitizado;
- CAPTCHA ativo/inativo;
- provider CAPTCHA;
- existência de secret CAPTCHA como booleano;
- GitHub OAuth ativo/inativo;
- Google OAuth ativo/inativo;
- nomes dos caminhos de configuração relacionados a CAPTCHA.

## Sanitização

O script nunca inclui valores cujos nomes indiquem:

- `secret`;
- `token`;
- `password`;
- `private`;
- chaves sensíveis.

Para a secret CAPTCHA, retorna somente:

```json
{
  "secretConfigured": true
}
```

## Execução local

```bash
SUPABASE_PROJECT_REF=hdghpmssudrqhsbvrdyt \
SUPABASE_ACCESS_TOKEN=<token> \
node scripts/audit-supabase-auth-config.mjs
```

Teste do sanitizador:

```bash
npm run test:auth-config-audit
```

## Uso no rollout de Auth

Antes de publicar o frontend:

1. Confirmar `captcha.enabled=true`.
2. Confirmar `captcha.provider` como `turnstile` ou `hcaptcha`.
3. Confirmar `captcha.secretConfigured=true`.
4. Configurar na Vercel o mesmo provider.
5. Configurar `VITE_CAPTCHA_SITE_KEY` do mesmo widget/site.
6. Fazer apenas um deployment de produção.
7. Executar o Production Auth Smoke.

Se o Management API não puder ser consultado, o rollout permanece bloqueado até confirmação manual no painel Supabase.
