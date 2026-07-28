# Data Archive Tier — Supabase quente + Google Drive/Sheets frio

Dados novos e operacionais ficam no Supabase. Dados históricos, brutos ou pesados ficam no Google Drive/Sheets.

Limites: meta 400 MB, alerta 425 MB, crítico 450 MB, emergência 475 MB, limite gratuito 500 MB. Acima de 425 MB, backfills e cargas massivas são bloqueados.

O arquivo prioriza bronze/raw e payloads pesados. Para dados regulatórios, a classificação quente/frio usa a data de negócio, e não apenas a data de ingestão.

Nenhum prune ocorre antes de upload, SHA-256, reconciliação, manifesto e status `verified`. Google Drive armazena os workbooks; Google Sheets é catálogo e segundo banco histórico; Supabase Storage é staging legado.

A externalização não pode quebrar qualification, patterns, score, ranking, tese ou pipeline.