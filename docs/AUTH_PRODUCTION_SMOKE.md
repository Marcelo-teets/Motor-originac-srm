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
   - transporte do token como `gotrue_meta_security.captcha_token`;
   - descoberta dinâmica de OAuth;
   - suporte de frontend a GitHub e Google.
3. Frontend e backend possuem o mesmo SHA.
4. O SHA publicado corresponde ao deployment esperado.
5. As rotas públicas retornam o shell React:
   - `/login`;
   - `/forgot-password`;
   - `/reset-password`;
   - `/auth/callback`.
6. O bundle JavaScript contém os marcadores críticos:
   - `gotrue_meta_security`;
   - `captcha_token`;
   - `/forgot-password`;
   - `/reset-password`;
   - `/auth/callback`;
   - `/auth/v1/settings`;
   - `github`;
   - `google`;
   - `god_mode`.
7. O build declara descoberta dinâmica de providers OAuth e a camada GOD-MODE.

## Contrato CAPTCHA

O smoke rejeita o transporte legado com `captcha_token` no nível superior. O formato obrigatório é:

```json
{
  "gotrue_meta_security": {
    "captcha_token": "token"
  }
}
```

Esse formato é aplicado tanto ao password grant quanto ao pedido de recuperação de senha.

## Descoberta OAuth

A tela de login não presume que um provider esteja ativo. Ela consulta o endpoint público do Supabase:

```text
/auth/v1/settings
```

Somente providers realmente habilitados são exibidos.

Estado auditado em 24/07/2026:

- GitHub: habilitado;
- Google: desabilitado;
- e-mail/senha: habilitado.

Portanto, o rollout atual deve oferecer **Continuar com GitHub**. O botão Google aparecerá automaticamente quando o provider for configurado no Supabase, sem nova alteração de frontend.

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
- nome do provedor CAPTCHA;
- contrato do transporte CAPTCHA;
- providers OAuth suportados pelo frontend;
- capacidades funcionais esperadas.

A site key CAPTCHA é pública por natureza, mas o arquivo registra apenas se ela está configurada. CAPTCHA secret, OAuth secrets, service role e token da Vercel nunca entram no bundle.

## Falhas esperadas e interpretação

### `VITE_CAPTCHA_SITE_KEY is not configured`

O código está publicado, porém a variável pública não entrou no build da Vercel. Configurar a variável em Production e gerar novo deployment.

### `CAPTCHA token transport is incorrect`

O build ainda declara ou utiliza o contrato legado. Não aprovar o rollout.

### SHA de frontend e backend divergentes

O deployment está inconsistente ou o alias canônico aponta para artefatos diferentes. Não aprovar o rollout.

### Bundle sem `gotrue_meta_security`

A produção ainda envia o CAPTCHA em formato incompatível com o GoTrue.

### Bundle sem `/auth/v1/settings`

A produção ainda contém o botão OAuth fixo ou não possui descoberta dos providers realmente habilitados.

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
