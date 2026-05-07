# Runtime config do frontend no Vercel

## Objetivo

Evitar que o frontend publicado tente chamar o backend em `localhost:4000`.

## Variáveis obrigatórias no Vercel

Production, Preview e Development devem receber:

```txt
VITE_API_BASE_URL=https://<backend-real>
VITE_SUPABASE_URL=https://hdghpmssudrqhsbvrdyt.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_URL=https://hdghpmssudrqhsbvrdyt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
USE_SUPABASE=true
BOOTSTRAP_SUPABASE=false
```

## Como validar

Depois do deploy, abrir o bundle JS publicado e procurar por:

```txt
localhost:4000
```

Resultado esperado: nenhuma ocorrência em arquivo de aplicação.

Também rodar localmente antes do merge:

```bash
npm run build
bash scripts/check-no-localhost.sh frontend/src
```

## Arquivos afetados

- `frontend/src/lib/runtimeConfig.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/watchlistApi.ts`
- `frontend/src/pages/CaptureInboxPage.tsx`

## Nota operacional

Sem `VITE_API_BASE_URL`, o frontend usa chamada relativa. Em produção na Vercel isso só funciona se houver proxy/rewrite para o backend. Para o MVP, configurar `VITE_API_BASE_URL` explicitamente é obrigatório.
