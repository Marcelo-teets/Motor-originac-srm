# Data Archive Tier — Supabase quente + Google Drive/Sheets frio

## Política institucional

A Origination Intelligence Platform opera com duas camadas:

1. **Supabase — banco quente**
   - dados novos, atuais e operacionais;
   - janela necessária para monitoring, qualification, patterns, score, ranking e pipeline;
   - índices, hashes, lineage e colunas estruturadas usadas na tomada de decisão.

2. **Google Drive / Google Sheets — banco frio**
   - dados históricos, bronze/raw e payloads pesados;
   - workbooks particionados por tabela, dataset, competência e execução;
   - catálogo central consultável no Google Sheets;
   - manifesto com contagem, checksum, período e link privado.

A regra geral é simples: **dados novos no Supabase; dados antigos, brutos ou pesados no Google Drive/Sheets**.

## Modelo de dados

- **Supabase / quente:** empresas, usuários, pipeline, ranking, sinais atuais, qualification, patterns, scores recentes e metadados de lineage.
- **Google Drive / frio:** linhas bronze já normalizadas, payloads JSON, textos brutos, documentos-fonte e versões históricas fora da janela quente.
- **Google Sheets / catálogo e segundo banco:** manifesto humano e técnico com run, tabela, dataset, corte, arquivo, contagem, tamanho, SHA-256, status, competência e URL privada.
- **Supabase Storage / staging legado:** recebe arquivos somente enquanto o Google Drive ainda não estiver ativo ou durante contingência; não é o destino definitivo.

## Limites de proteção do plano gratuito

- meta operacional: **400 MB**;
- alerta: **425 MB**;
- crítico: **450 MB**;
- emergência: **475 MB**;
- limite do plano gratuito: **500 MB**.

### Comportamento automático

- abaixo de 400 MB: operação normal;
- de 400 a 425 MB: arquivo preventivo;
- de 425 a 450 MB: bloquear backfills e ingestões massivas; permitir apenas canários e dados prioritários;
- de 450 a 475 MB: arquivo agressivo e suspensão de cargas históricas;
- acima de 475 MB: modo de emergência; nenhuma carga histórica nova até retornar à meta.

O controle considera o tamanho real do PostgreSQL, não apenas o tamanho dos arquivos no Storage.

## Ordem de arquivamento

1. `bronze_historical_records` — linha completa após normalização;
2. payloads de `capital_market_events` — manter colunas analíticas online;
3. payloads de `source_documents` e `monitoring_outputs`;
4. snapshots e sinais antigos, preservando no Supabase o estado mais recente e a trilha de decisão;
5. vínculos e métricas históricas, somente com política por competência e teste de regressão em qualification, patterns e ranking.

## Janela quente

A janela deve ser definida pela data que representa o negócio:

- CVM e mercado de capitais: `reference_date`, `event_date` ou `ref_date`;
- monitoring e documentos: `observed_at`;
- scores e qualification: `created_at`;
- bronze: após normalização, manter apenas a janela mínima de replay.

Não usar somente `ingested_at` para decidir se uma carga histórica deve permanecer quente. Um registro de 2020 ingerido hoje continua sendo histórico.

## Estados

`queued -> running -> completed -> verified -> pruned`

Falhas terminam em `failed`.

## Regra de segurança

Nenhum dado pode ser removido do Supabase antes de:

1. todas as partes estarem registradas no Drive ou no staging;
2. cada parte possuir SHA-256 válido;
3. a soma das linhas das partes coincidir com o run;
4. a contagem coincidir com a população elegível da origem;
5. a política possuir `allow_prune = true`;
6. o run estar em `verified`;
7. o manifesto central possuir o identificador e o link do arquivo.

## Estratégias

### `full_row`

A linha inteira sai do Supabase após verificação. Usado principalmente para bronze/raw já normalizado.

### `payload_only`

Mantém no Supabase colunas estruturadas, hashes, URLs e lineage. Apenas JSON ou texto pesado é externalizado.

### `mirror_only`

Cria cópia histórica sem limpeza automática. Aplicável a evidências decisórias enquanto não houver política segura de agregação.

## Particionamento

Não concentrar todo o histórico em uma única aba. O arquivo frio deve ser particionado por:

- tabela lógica;
- dataset;
- ano/mês ou competência;
- run de arquivamento;
- partes de tamanho controlado.

A planilha `Origination Intelligence Platform — Catálogo do Arquivo Histórico` é o índice central e aponta para os workbooks privados no Drive.

## Consulta no produto

A rota GOD-MODE `/historical-archive` apresenta:

- tamanho atual do banco, meta e limite;
- estado da proteção: saudável, alerta, crítico ou emergência;
- linhas arquivadas e removidas;
- arquivos por provedor;
- políticas de retenção;
- SHA-256, período e contagem de cada parte;
- abertura no Google Drive ou download assinado do staging legado.

## Variáveis das Edge Functions

```env
ARCHIVE_STORAGE_PROVIDER=google_drive
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>
GOOGLE_DRIVE_ARCHIVE_FOLDER_ID=16RwLyzLUm45BshgO5Qkr9kZunYBfDuNV
GOOGLE_DRIVE_CATALOG_SPREADSHEET_ID=1z29lCdGlZdndvurzZP7LqGPOreyIm5onlnmFvUquY3Y
```

## Ativação segura

1. cadastrar as credenciais Google nos secrets das Edge Functions;
2. publicar `historical-excel-export` e `historical-excel-catalog`;
3. executar um run pequeno;
4. confirmar arquivo, manifesto, contagem, checksum e abertura;
5. definir `ARCHIVE_STORAGE_PROVIDER=google_drive`;
6. confirmar `storage_provider = 'google_drive'` em `data_archive_parts`;
7. migrar gradualmente os arquivos legados e só depois removê-los do Supabase Storage.

## Rotina automática

- medir o banco a cada hora;
- arquivar preventivamente acima de 400 MB;
- bloquear ingestão massiva acima de 425 MB;
- reconciliar runs a cada 15 minutos;
- executar prune somente após verificação;
- atualizar o catálogo no Sheets após cada parte e após cada run;
- revisar semanalmente crescimento por tabela, retenção e qualidade do arquivo.

## Manutenção

- `VACUUM FULL` não faz parte da rotina normal;
- após grandes prunes, executar `ANALYZE`;
- usar `VACUUM FULL` somente em emergência e janela controlada, quando for indispensável reduzir o arquivo físico;
- manter Drive, planilha e bucket privados;
- nunca expor credenciais Google ou service-role no frontend.

## Regra final

A externalização não pode quebrar qualification, patterns, score, ranking, tese ou pipeline. O objetivo é reduzir custo sem perder memória institucional nem capacidade de originar operações reais.