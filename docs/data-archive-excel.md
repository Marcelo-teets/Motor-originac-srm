# Data Archive Tier — Supabase quente + Google Drive/Sheets frio

A política oficial é manter dados novos e operacionais no Supabase e dados históricos, brutos ou pesados no Google Drive/Sheets.

## Limites
- meta: 400 MB;
- alerta: 425 MB;
- crítico: 450 MB;
- emergência: 475 MB;
- limite gratuito: 500 MB.

## Comportamento
- abaixo de 400 MB: normal;
- 400–425 MB: arquivo preventivo;
- 425–450 MB: bloquear backfills e limitar ingestões;
- 450–475 MB: suspender cargas históricas;
- acima de 475 MB: emergência, sem carga nova até retorno à meta.

## Ordem de arquivamento
1. bronze/raw após normalização;
2. payloads pesados de eventos;
3. payloads de documentos e monitoring;
4. snapshots antigos preservando estado recente;
5. vínculos e métricas históricos somente após regressão de qualification, patterns e ranking.

## Data de corte
Usar data de negócio (`reference_date`, `event_date`, `ref_date`) para mercado de capitais; `observed_at` para monitoring; `created_at` para scores. Um registro antigo ingerido hoje continua sendo histórico.

## Segurança
Nenhum prune antes de upload, SHA-256, contagem, reconciliação, `allow_prune=true`, status `verified` e registro no MANIFESTO.

## Destinos
- Google Drive: workbooks particionados por tabela, dataset, competência e run;
- Google Sheets: catálogo/segundo banco com manifesto e links privados;
- Supabase Storage: staging legado e contingência, nunca destino definitivo.

## Secrets
```env
ARCHIVE_STORAGE_PROVIDER=google_drive
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>
GOOGLE_DRIVE_ARCHIVE_FOLDER_ID=16RwLyzLUm45BshgO5Qkr9kZunYBfDuNV
GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID=1z29lCdGlZdndvurzZP7LqGPOreyIm5onlnmFvUquY3Y
```

A externalização nunca pode quebrar qualification, patterns, score, ranking, tese ou pipeline.