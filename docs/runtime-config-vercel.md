# Runtime configuration — Vercel

## Arquitetura canônica
- Banco persistente: Neon Postgres.
- Auth: Neon Managed Auth via proxy first-party do Motor.
- Superfície auxiliar: Google Sheets.
- Supabase não faz parte do runtime.

## Variáveis de produção
```bash
MOTOR_NEON_DATABASE_URL=postgresql://...
NEON_AUTH_BASE_URL=https://...neonauth.../auth
NEON_AUTH_JWKS_URL=https://...neonauth.../auth/.well-known/jwks.json
MOTOR_AUTH_BOOTSTRAP_ENABLED=false
CRON_SECRET=...
APP_BASE_URL=https://motor-originac-srm.vercel.app
```

## Google Sheets
Os workflows de controle de fontes usam OAuth Google:
```bash
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
```
O identificador da planilha é configurado no workflow/script correspondente.

## Frontend
Somente valores públicos:
```bash
VITE_API_BASE_URL=https://motor-originac-srm.vercel.app/api
VITE_NEON_AUTH_URL=https://...neonauth.../auth
```

## Regra
Não adicionar variáveis, clientes, URLs ou workflows de Supabase. O CI possui um contrato que bloqueia reintrodução no runtime ativo.
