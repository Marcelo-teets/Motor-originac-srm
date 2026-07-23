# Runbook — Agentetome export ingestion

## Operação normal

Executar somente com `service_role`:

```sql
select private.run_agentetome_export_ingestion(
  '<cnpj ou nome da administradora>',
  'recente',
  null,
  'csv'
);
```

O retorno é assíncrono e contém `pg_net_request_id`. Consultar:

```sql
select id, status_code, timed_out, error_msg, content, created
from net._http_response
where id=<request_id>;
```

## Resultado esperado

```text
HTTP 200
status: real
package status: parsed
connector run: completed
operation run: completed
source document: parsed/validated
capital market dataset run: completed
rawDownloadLinkPersisted: false
```

## Rate limit

O provedor documenta limite aproximado de 10 exports por 60 minutos. Em `export_request_limit_reached`:

- não repetir em loop;
- não contornar o limite;
- reutilizar package já armazenado quando aplicável;
- manter status `blocked`/`failed` com evidência;
- executar novamente apenas após a janela do provedor.

## Recuperação de package privado

Para package `stored` ou `failed` cujo ZIP foi validado e armazenado:

```sql
select private.queue_agentetome_package_recovery('<package_id>'::uuid);
```

A recovery:

- usa token descartável;
- relê o ZIP do bucket `agentetome-raw`;
- valida tamanho, SHA-256, schema, arquivos e linhas;
- reescreve bronze idempotentemente;
- finaliza package, auditoria, source document, dataset run e connector run.

## Validações pós-execução

```sql
select status, row_counts, content_hash, storage_path, metadata
from public.agentetome_export_packages
where id='<package_id>'::uuid;
```

```sql
select dataset_code, count(*)
from public.bronze_historical_records
where payload#>>'{_lineage,package_hash}'='<package_hash>'
group by dataset_code
order by dataset_code;
```

```sql
select status, items_collected, outputs_written, error_message, metadata
from public.source_connector_runs
where id='<connector_run_id>'::uuid;
```

## Regras de segurança

- nunca consultar ou retornar `vault.decrypted_secrets` fora das funções privadas;
- nunca gravar `link_download` em tabela, log ou documentação;
- nunca tornar `agentetome-raw` público;
- não conceder acesso de `anon` ou `authenticated` às tabelas de package/token;
- não aceitar schema diferente de `1` sem migration e parser revisados;
- não gerar signal empresarial antes de resolver fundo/originador/cedente contra `companies`.

## Promoção downstream

A sequência obrigatória é:

```text
bronze validada
→ capital_market_events / view silver
→ entity resolution
→ evidência corroborada CVM/FNET
→ company signal observado
→ qualification/pattern/thesis/ranking
```

A ausência de match exato no Company Master mantém `scoreImpact=false`.
