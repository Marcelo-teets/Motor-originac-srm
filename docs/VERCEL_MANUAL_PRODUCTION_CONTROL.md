# Vercel Manual Production Control

## Objetivo

Publicar exatamente um commit aprovado da `main` no projeto Vercel `motor-originac-srm`, sem reabilitar permanentemente a enxurrada de deployments automáticos.

## Identificadores oficiais

```text
Project ID: prj_hsB473e7bNF0xOd6CEUwo7WFgNYs
Team ID: team_PJwucES3YmFbxf57HE52Bw0v
Project name: motor-originac-srm
GitHub repository ID: 1185535233
Production branch: main
```

## Pré-requisitos

Variável segura disponível no ambiente de execução:

```text
VERCEL_TOKEN
```

No GitHub Actions, cadastrar em:

```text
Settings → Secrets and variables → Actions → VERCEL_TOKEN
```

O token nunca deve ser passado por argumento CLI, URL, commit, artifact ou log.

## Comandos

### Estado do projeto

```bash
VERCEL_TOKEN=<token> npm run vercel:production-control -- status
```

Saída sanitizada:

- projeto;
- branch de produção;
- `createDeployments`;
- deployment mais recente sem valores sensíveis.

### Desativar deployments Git

```bash
VERCEL_TOKEN=<token> npm run vercel:production-control -- disable-auto
```

### Reabilitar deployments Git

```bash
VERCEL_TOKEN=<token> npm run vercel:production-control -- enable-auto
```

Esse comando é excepcional. A política oficial permanece `disabled`.

### Criar production deployment

O caminho oficial é o workflow manual `.github/workflows/vercel-production-deploy.yml`. Ele recebe o SHA completo que precisa coincidir com o HEAD da `main`.

O workflow executa: checkout da `main`, `vercel pull --environment=production`, `vercel build --prod` e `vercel deploy --prebuilt --prod`. O artefato é construído no GitHub Actions e enviado pelo Build Output API, sem depender da credencial Git da Vercel.

O SHA é injetado no build e no runtime como `GITHUB_SHA`, `VERCEL_GIT_COMMIT_SHA` e `GIT_SHA`. Depois do upload, o workflow valida o domínio canônico com `scripts/smoke-auth-production.mjs`.

A publicação direta por `gitSource` permanece disponível apenas como ferramenta legada de diagnóstico e não é o caminho operacional de produção.

## Idempotência

Antes de criar um deployment, o controlador lista os deployments recentes e procura o mesmo SHA nos estados:

- `READY`;
- `BUILDING`;
- `QUEUED`;
- `INITIALIZING`.

Quando encontra, reutiliza o recurso e não cria outro deployment.

Deployments `ERROR`, `CANCELED` ou `DELETED` não impedem uma nova tentativa controlada.

## Proteção contra corrida

O workflow usa:

```yaml
concurrency:
  group: vercel-production-deploy
  cancel-in-progress: false
```

Assim apenas uma execução de produção avança por vez.

## Integração Git desativada

O projeto permanece configurado com:

```text
gitProviderOptions.createDeployments=disabled
```

O workflow prebuilt não precisa habilitar a integração Git. Ele usa o checkout autenticado do GitHub Actions e faz upload do Build Output API com o token da Vercel. A etapa final executa `disable-auto` mesmo quando build, deploy ou smoke falham.

## Estados de espera

O controlador encerra a espera em:

- `READY`: sucesso de build;
- `ERROR`: falha;
- `CANCELED`: cancelado;
- `DELETED`: removido.

`READY` ainda precisa ser seguido pelos smokes funcionais da aplicação.

## Validação pós-deployment

### Plataforma

```text
GET /api/health
GET /build-meta.json
```

Os dois precisam reportar o SHA solicitado.

### Auth

```bash
BASE_URL=https://motor-originac-srm.vercel.app \
EXPECTED_SHA=<sha> \
REQUIRE_CAPTCHA_SITE_KEY=false \
node scripts/smoke-auth-production.mjs
```

Resultados possíveis:

- `passed`: Auth completo;
- `passed_with_oauth_fallback`: GitHub OAuth funcional, CAPTCHA/site key ainda pendente;
- erro: rollout não aprovado.

## Rollback

O controlador desta versão não promove automaticamente um SHA antigo. Para rollback:

1. selecionar explicitamente um commit válido da linha oficial;
2. confirmar impacto das migrations e contratos;
3. criar uma PR/revert quando necessário;
4. usar um SHA que seja o HEAD atual da `main` no workflow protegido;
5. executar os mesmos smokes.

Essa restrição evita rollback visual que deixe banco, APIs e frontend em versões incompatíveis.

## Testes

```bash
npm run test:vercel-production-control
```

Cobertura:

- SHA inválido;
- leitura sanitizada;
- PATCH enable/disable;
- reutilização de deployment existente;
- payload de produção exato;
- habilitação temporária e restauração;
- polling até `READY`;
- ausência de token em resultados e logs de teste.
