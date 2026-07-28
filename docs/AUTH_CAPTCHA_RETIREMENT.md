# Retirada do CAPTCHA do Auth

## Estado oficial

O CAPTCHA foi retirado do fluxo de autenticação da Origination Intelligence Platform.

O contrato de produção passa a ser:

- login por e-mail e senha sem token adicional;
- recuperação de senha sem token adicional;
- OAuth Google/GitHub preservado;
- Supabase Auth permanece como provedor real;
- GOD-MODE e perfis de usuário permanecem inalterados;
- rate limits nativos do Supabase continuam ativos.

## Mudanças operacionais

1. `security_captcha_enabled=false` no Supabase Auth.
2. Remoção das variáveis `VITE_*CAPTCHA*`, `VITE_TURNSTILE_SITE_KEY` e `VITE_HCAPTCHA_SITE_KEY` da Vercel.
3. Remoção do componente frontend de desafio.
4. Remoção de `gotrue_meta_security.captcha_token` dos payloads.
5. Smoke de produção rejeita qualquer marcador de CAPTCHA no bundle.

## Segurança compensatória

Como o CAPTCHA foi retirado por decisão de produto, a proteção contra abuso passa a depender de:

- rate limits nativos do Supabase Auth;
- confirmação de e-mail;
- senhas fortes;
- OAuth para usuários que preferirem;
- monitoramento dos logs de Auth;
- possibilidade futura de MFA para contas sensíveis.

Não reintroduzir CAPTCHA sem nova decisão explícita do projeto.
