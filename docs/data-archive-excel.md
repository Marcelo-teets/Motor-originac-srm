# Data Archive Tier — Supabase quente + Google Drive/Sheets frio

A política oficial é manter dados novos e operacionais no Supabase e dados históricos, brutos ou pesados no Google Drive/Sheets.

- Meta do banco: 400 MB.
- Alerta: 425 MB.
- Crítico: 450 MB.
- Emergência: 475 MB.
- Limite gratuito: 500 MB.

Acima de 425 MB, backfills e cargas massivas são bloqueados. O arquivamento prioriza bronze/raw, payloads pesados e depois histórico analítico já fora da janela operacional. Para dados regulatórios, a decisão de quente/frio usa `reference_date`, `event_date` ou `ref_date`, e não apenas a data de ingestão.

Nenhum dado é removido antes de upload, checksum SHA-256, reconciliação de contagem, manifesto e status `verified`.

Destinos:
- Google Drive: workbooks particionados;
- Google Sheets: catálogo e segundo banco histórico;
- Supabase Storage: staging legado e contingência.

Secrets:
```env
ARCHIVE_STORAGE_PROVIDER=google_drive
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>
GOOGLE_DRIVE_ARCHIVE_FOLDER_ID=16RwLyzLUm45BshgO5Qkr9kZunYBfDuNV
GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID=1z29lCdGlZdndvurzZP7LqGPOreyIm5onlnmFvUquY3Y
```

A externalização nunca pode quebrar qualification, patterns, score, ranking, tese ou pipeline.