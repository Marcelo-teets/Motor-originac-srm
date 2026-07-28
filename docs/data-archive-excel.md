# Data Archive Tier — Supabase quente + Google Drive/Sheets frio

A política oficial é manter dados novos e operacionais no Supabase e dados históricos, brutos ou pesados no Google Drive/Sheets.

- Meta: 400 MB.
- Alerta: 425 MB.
- Crítico: 450 MB.
- Emergência: 475 MB.
- Limite gratuito: 500 MB.

Acima de 425 MB, backfills e cargas massivas são bloqueados. O arquivo prioriza bronze/raw e payloads pesados. Para dados regulatórios, a decisão quente/frio usa a data de negócio, e não apenas a data de ingestão.

Nenhum prune ocorre antes de upload, SHA-256, reconciliação, manifesto e status `verified`.

Google Drive armazena os workbooks particionados; Google Sheets funciona como catálogo e segundo banco histórico; Supabase Storage é apenas staging legado.

A externalização nunca pode quebrar qualification, patterns, score, ranking, tese ou pipeline.