# Auth, perfis e acessos — Runbook operacional

## 1. Objetivo

Este fluxo usa o Supabase Auth como fonte oficial de identidade e `public.user_profiles` como fonte oficial de perfil e autorização da Origination Intelligence Platform.

Não existe sistema paralelo de usuários. O mesmo JWT emitido pelo Supabase protege o frontend, o backend Node/TypeScript e as consultas REST/RPC.

## 2. Tipos de usuário

### GOD-MODE

- Conta única e protegida.
- Acesso integral à plataforma.
- Pode visualizar usuários e ativar/desativar usuários comuns.
- Não pode ser desativada, rebaixada ou delegada pela interface/RPC.
- A unicidade também é garantida por índice parcial no Postgres.

### Usuário comum

- Acesso operacional padrão.
- Edita apenas o próprio perfil.
- Não altera `role`, `status`, e-mail ou ID.
- Não visualiza a página de administração de usuários.

## 3. Rotas

### Públicas

- `/login`: e-mail/senha, Google OAuth e CAPTCHA.
- `/forgot-password`: solicita link de recuperação.
- `/reset-password`: valida o link e define nova senha.
- `/auth/callback`: conclui a sessão OAuth.

### Autenticadas

- `/profile`: perfil e preferências do usuário.
- `/change-password`: troca de senha autenticada.
- `/users`: administração exclusiva do GOD-MODE.

## 4. Variáveis da Vercel

Configurar em Production e Preview:

```dotenv
VITE_SUPABASE_URL=https://hdghpmssudrqhsbvrdyt.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable ou anon key ativa>
VITE_CAPTCHA_ENABLED=true
VITE_CAPTCHA_PROVIDER=turnstile
VITE_CAPTCHA_SITE_KEY=<site key pública>
```

`VITE_CAPTCHA_PROVIDER` aceita `turnstile` ou `hcaptcha`. A site key deve pertencer ao mesmo provedor configurado no Supabase Auth.

O frontend trabalha em modo fail-closed: com CAPTCHA ativo e sem site key/token, o botão permanece bloqueado e nenhuma chamada inválida é enviada ao `/auth/v1/token`.

## 5. Configuração do Supabase Auth

### CAPTCHA

1. Abra Authentication > Bot and Abuse Protection.
2. Escolha Cloudflare Turnstile ou hCaptcha.
3. Cadastre a secret key do provedor.
4. Use a site key correspondente em `VITE_CAPTCHA_SITE_KEY` na Vercel.
5. Confirme que `VITE_CAPTCHA_ENABLED` reflete o estado real do Supabase.

### Google OAuth

1. Crie o Client ID e Client Secret no Google Cloud.
2. Habilite o provider Google em Authentication > Sign In / Providers.
3. Cadastre o callback do Supabase no Google.
4. Inclua as URLs da aplicação na allow list de Redirect URLs do Supabase.

URLs usadas pela aplicação:

- `https://motor-originac-srm.vercel.app/auth/callback`
- `https://motor-originac-srm.vercel.app/reset-password`
- equivalentes dos domínios canônico e preview autorizados.

## 6. Modelo de segurança

- Autorização usa `public.user_profiles.role`; não usa `raw_user_meta_data` para decisões.
- Novos usuários sempre nascem como `common`.
- RLS permite leitura do próprio perfil ou leitura total pelo GOD-MODE.
- Trigger bloqueia edição de campos privilegiados por usuário comum.
- RPC `set_user_access` usa `SECURITY INVOKER`, RLS e verificação explícita do GOD-MODE.
- A conta GOD-MODE é protegida contra desativação ou delegação.

## 7. Checklist de validação

1. Abrir `/login` em aba anônima.
2. Confirmar que o desafio CAPTCHA aparece.
3. Entrar com e-mail/senha e validar carregamento do dashboard.
4. Sair e testar “Continuar com Google”.
5. Testar “Esqueci minha senha” e abrir o link recebido.
6. Definir nova senha em `/reset-password`.
7. Editar nome/cargo/telefone em `/profile`.
8. Alterar senha em `/change-password`.
9. Como GOD-MODE, abrir `/users`.
10. Confirmar que a conta GOD-MODE não oferece opção de desativação.
11. Criar/usar um usuário comum e confirmar que `/users` redireciona para `/profile`.
12. Desativar o usuário comum e confirmar bloqueio no próximo carregamento de sessão.

## 8. Diagnóstico do incidente de CAPTCHA

Sintoma observado:

```text
captcha protection: request disallowed (no captcha_token found)
```

Causa: o fluxo anterior enviava e-mail e senha ao backend, e o backend chamava o endpoint de token do Supabase sem `captcha_token`.

Correção: login e recuperação agora obtêm o token do widget no navegador e enviam `captcha_token` no corpo da requisição ao Supabase Auth. O backend continua recebendo e validando o JWT resultante.
