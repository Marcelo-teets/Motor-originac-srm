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

- `/login`: e-mail/senha, OAuth dinâmico e CAPTCHA.
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
VITE_CAPTCHA_PROVIDER=<turnstile ou hcaptcha>
VITE_CAPTCHA_SITE_KEY=<site key pública>
```

`VITE_CAPTCHA_PROVIDER` e `VITE_CAPTCHA_SITE_KEY` devem pertencer ao mesmo provedor configurado no Supabase Auth.

Estado auditado na Vercel em 24/07/2026:

- `VITE_CAPTCHA_ENABLED=true`: configurado em Production, Preview e Development;
- `VITE_CAPTCHA_PROVIDER=turnstile`: configurado em Production, Preview e Development;
- `VITE_CAPTCHA_SITE_KEY`: ausente.

O valor `turnstile` foi preparado como padrão do frontend, mas o rollout permanece bloqueado até a obtenção da site key real e a confirmação de que ela corresponde ao provedor selecionado no Supabase.

O frontend trabalha em modo fail-closed: com CAPTCHA ativo e sem site key/token, o botão permanece bloqueado e nenhuma chamada de autenticação é enviada.

## 5. Configuração do Supabase Auth

### CAPTCHA

1. Abra Authentication > Bot and Abuse Protection.
2. Confirme se o provedor ativo é Cloudflare Turnstile ou hCaptcha.
3. Confirme a secret key cadastrada no Supabase.
4. Copie a site key pública do mesmo widget/site.
5. Defina `VITE_CAPTCHA_PROVIDER` e `VITE_CAPTCHA_SITE_KEY` na Vercel.
6. Gere novo deployment e execute o Production Auth Smoke.

### Contrato REST do GoTrue

O token CAPTCHA **não** é enviado no nível superior do JSON. O formato aceito pelo GoTrue é:

```json
{
  "email": "usuario@empresa.com",
  "password": "senha",
  "gotrue_meta_security": {
    "captcha_token": "token-verificado"
  }
}
```

Para recuperação de senha:

```json
{
  "email": "usuario@empresa.com",
  "gotrue_meta_security": {
    "captcha_token": "token-verificado"
  }
}
```

Um probe controlado confirmou a diferença:

- campo superior `captcha_token`: `no captcha_token found`;
- campo aninhado `gotrue_meta_security.captcha_token`: token reconhecido e validado pelo provedor, retornando `invalid-input-response` para o token propositalmente inválido.

O contrato é protegido pelo teste `test:auth-captcha-payload` e pelo smoke de produção.

### OAuth dinâmico

A tela de login consulta `/auth/v1/settings` e mostra somente providers realmente habilitados no Supabase.

Estado auditado em 24/07/2026:

- GitHub OAuth: habilitado e authorize validado;
- Google OAuth: desabilitado;
- e-mail/senha: habilitado.

O authorize do GitHub foi validado com retorno para:

```text
https://motor-originac-srm.vercel.app/auth/callback
```

Por isso, o botão operacional atual deve ser **Continuar com GitHub**.

Para habilitar Google futuramente:

1. Crie o Client ID e Client Secret no Google Cloud.
2. Habilite o provider Google em Authentication > Sign In / Providers.
3. Cadastre o callback do Supabase no Google.
4. Inclua as URLs da aplicação na allow list de Redirect URLs do Supabase.

O frontend detectará Google automaticamente e exibirá o botão sem nova mudança de código.

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
4. Sair e testar “Continuar com GitHub”.
5. Confirmar retorno por `/auth/callback` e carregamento do perfil.
6. Testar “Esqueci minha senha” e abrir o link recebido.
7. Definir nova senha em `/reset-password`.
8. Editar nome/cargo/telefone em `/profile`.
9. Alterar senha em `/change-password`.
10. Como GOD-MODE, abrir `/users`.
11. Confirmar que a conta GOD-MODE não oferece opção de desativação.
12. Criar/usar um usuário comum e confirmar que `/users` redireciona para `/profile`.
13. Desativar o usuário comum e confirmar bloqueio no próximo carregamento de sessão.

## 8. Diagnóstico do incidente de CAPTCHA

Sintoma observado:

```text
captcha protection: request disallowed (no captcha_token found)
```

Causas encontradas:

1. O fluxo antigo não enviava token CAPTCHA.
2. A primeira correção enviava `captcha_token` no nível superior, formato que o GoTrue não reconhece.

Correção final: login e recuperação obtêm o token do widget no navegador e o enviam em `gotrue_meta_security.captcha_token`. O backend continua recebendo e validando apenas o JWT resultante.
