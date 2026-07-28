# Política Hot/Cold de Dados

## Regra oficial

A Origination Intelligence Platform mantém:

- **dados novos e operacionais no Supabase**;
- **dados antigos, brutos ou pesados no Google Drive/Google Sheets**.

O Supabase continua sendo a fonte operacional para monitoring, qualification, patterns, score, ranking e pipeline. O Google Drive armazena workbooks históricos particionados. A planilha `Origination Intelligence Platform — Catálogo do Arquivo Histórico` funciona como manifesto, catálogo e segundo banco consultável.

## Orçamento do Supabase

| Faixa | Estado | Ingestão máxima | Ação |
|---|---|---:|---|
| abaixo de 400 MB | saudável | 20.000 linhas/dataset | operação normal |
| 400–425 MB | preventivo | 5.000 | arquivar bronze e payloads |
| 425–450 MB | alerta | 500 | bloquear backfills |
| 450–475 MB | crítico | 100 | suspender histórico novo |
| acima de 475 MB | emergência | 0 | arquivar, verificar e recuperar margem |

O limite gratuito de referência é 500 MB. O sistema não deve operar próximo desse teto.

## Ordem de externalização

1. `bronze_historical_records` após normalização;
2. payloads JSON de `capital_market_events`;
3. payloads de `source_documents` e `monitoring_outputs`;
4. versões antigas de scores, qualification, sinais e fatores, preservando o estado atual;
5. vínculos e métricas históricos somente após testes de regressão no ranking e nas teses.

## Data de corte

Para dados regulatórios e de mercado de capitais, a classificação quente/frio usa a data de negócio (`reference_date`, `event_date` ou `ref_date`). Para monitoring, usa `observed_at`. Para snapshots, usa `created_at`.

Uma linha de 2020 ingerida hoje continua sendo histórica.

## Segurança

Nenhuma exclusão ocorre antes de:

1. arquivo gerado;
2. SHA-256 confirmado;
3. tamanho e contagem reconciliados;
4. parte registrada em `data_archive_parts`;
5. link inserido no MANIFESTO do Google Sheets;
6. run compatível com `completed`, `verified` ou `pruned`;
7. confirmação de que a externalização não afeta qualification, patterns, score, ranking, tese ou pipeline.

## Fluxo operacional

```text
Supabase quente
→ exportador histórico validado
→ Supabase Storage privado (staging)
→ verificação de SHA-256 e contagem
→ migrador Google Drive
→ atualização do MANIFESTO no Sheets
→ atualização de data_archive_parts
→ limpeza controlada do staging
```

O staging preserva o fluxo atual caso o OAuth do Google esteja indisponível. O destino definitivo é `google_drive`.

## Automação

- o banco registra snapshots de uso;
- um trigger bloqueia novas execuções CVM que excedam o orçamento;
- o arquivamento existente continua particionando e verificando os dados;
- o workflow `Google Drive Cold Archive` migra partes elegíveis a cada hora;
- a planilha de catálogo é atualizada em cada migração;
- a aba `ESTRATÉGIA HOT-COLD` documenta as regras operacionais.

## Recursos oficiais

- Pasta do arquivo: `16RwLyzLUm45BshgO5Qkr9kZunYBfDuNV`
- Catálogo: `1z29lCdGlZdndvurzZP7LqGPOreyIm5onlnmFvUquY3Y`
- Supabase: `hdghpmssudrqhsbvrdyt`

## Secrets do GitHub Actions

```env
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REFRESH_TOKEN
```

Nenhuma credencial deve ser enviada ao frontend ou versionada no repositório.