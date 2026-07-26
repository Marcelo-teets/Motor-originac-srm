# Agentetome — integração de produção finalizada

Data de validação: 26/07/2026  
Fonte oficial subjacente: CVM / FNET  
Projeto Supabase: `hdghpmssudrqhsbvrdyt`

## Estado

O Agentetome está integrado como fonte real da Origination Intelligence Platform.

```text
Supabase Vault
→ manifest/export Agentetome
→ Edge Function de ingestão
→ ZIP privado + validação de hash/schema/linhas
→ bronze_historical_records
→ capital_market_events
→ snapshot atual FIDC
→ API autenticada
→ Market Map + Sources
```

Status validado:

- `status=real`;
- `health=healthy`;
- zero blockers;
- chave apenas no Supabase Vault;
- refresh automático ativo por `pg_cron`;
- target Oliveira Trust ativo;
- 3 pacotes reais validados;
- 24.370 registros bronze deduplicados com lineage;
- 183 FIDCs únicos no snapshot atual;
- 343 eventos FIDC históricos preservados;
- competência mais recente do snapshot: 2026-06;
- 11.616 linhas reconciliadas no último refresh;
- 183 eventos promovidos no último silver sync;
- impacto automático em score: desativado.

## Runtimes

- Vercel API: `agentetome-v2`;
- ingestão: `agentetome-ingest-export-v4` — Edge Function versão implantada 5;
- recuperação de pacote: `agentetome-recover-package-v2`;
- validação XML: `agentetome-validate-xml-v1`;
- Market Map: `fidc-market-map-v2`.

## Operação automática

`agentetome_export_targets` governa administradora, formato, cadência, prioridade, próxima execução, tentativas e falhas consecutivas.

O job `agentetome-due-export-refresh` roda a cada hora, mas só enfileira targets vencidos. A cadência padrão do target Oliveira Trust é 24 horas.

Pacote idêntico também gera heartbeat real: o ZIP é baixado e validado novamente, o lineage bronze é reconciliado e o snapshot silver é reconstruído de forma idempotente.

## Snapshot atual versus histórico

O Market Map usa apenas o pacote mais recente de cada target ativo. Eventos de pacotes anteriores continuam em `capital_market_events` para auditoria e análise histórica.

Isso impede dois erros:

1. duplicação de fundos no Market Map;
2. perda de linhas inalteradas deduplicadas entre pacotes.

## Validação de XML

A tela Sources aceita informe mensal FIDC em XML, com limite de 5 MB.

Contrato de privacidade:

- XML processado em memória;
- XML bruto não persistido;
- nome do arquivo não utilizado para lineage;
- nada enviado à CVM;
- auditoria limitada a hash SHA-256, tamanho, status, leiaute e contadores;
- endpoint oficial: `POST https://www.agentetome.com/api/v1/validar-xml`;
- multipart no campo `arquivo`.

## Segurança

- API key nunca enviada ao navegador;
- API key não duplicada no Vercel;
- exports e manifest restritos a GOD-MODE;
- XML exige sessão Supabase válida;
- ingestão usa token one-time com hash SHA-256;
- bucket `agentetome-raw` privado;
- signed download URL não é persistida;
- RLS service-role only nas tabelas de controle;
- `scoreImpact=false` em todo o fluxo.

## Arquivos principais

- `db/migrations/128_agentetome_production_control_plane.sql`
- `db/migrations/129_agentetome_current_snapshot_lineage.sql`
- `db/migrations/130_agentetome_runtime_current_vs_history.sql`
- `supabase/functions/agentetome-ingest-export/index.ts`
- `supabase/functions/agentetome-validate-xml/index.ts`
- `api/agentetome.ts`
- `frontend/src/lib/agentetomeApi.ts`
- `frontend/src/components/AgentetomeOperationsPanel.tsx`
- `frontend/src/pages/SourcesPage.tsx`

## Critério de aceite

A integração só é considerada operacional quando `agentetome_runtime_status()` retorna simultaneamente:

- `status=real`;
- `health=healthy`;
- `configured=true`;
- `automaticRefresh=true`;
- `marketMapReady=true`;
- `blockers=[]`;
- `scoreImpact=false`.
