# GitHub Actions secrets

## Obrigatórios para runtime/deploy
- `MOTOR_NEON_DATABASE_URL`
- `CRON_SECRET`
- `VERCEL_TOKEN`

## Neon Managed Auth
A configuração pública é sincronizada para a Vercel pelo fluxo de deploy. Segredos de bootstrap privilegiado devem permanecer desabilitados por padrão.

## Google Sheets
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

Essas credenciais atendem o sync Neon → Sheets e outras rotinas Google autorizadas.

## Conectores opcionais
Configure apenas quando a integração correspondente estiver ativa, por exemplo:
- `AGENTETOME_API_KEY`
- credenciais Microsoft server-side
- chaves de APIs públicas/terceiras aprovadas

## Regra arquitetural
Supabase foi removido do runtime do Motor. Não cadastrar novos segredos `SUPABASE_*` e não criar fallback para Supabase.
