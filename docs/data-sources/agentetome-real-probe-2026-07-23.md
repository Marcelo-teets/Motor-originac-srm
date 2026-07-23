# Agentetome — probe real de produção

Data: 23/07/2026

## Resultado

O primeiro probe real do Agentetome foi executado com sucesso no Supabase de produção `hdghpmssudrqhsbvrdyt`.

Fluxo utilizado:

```text
Supabase Vault
→ private.probe_agentetome_admin_manifest
→ Agentetome REST API
→ manifest sanitizado
→ agentetome_operation_runs
→ source_catalog real/healthy
```

## Segurança

- chave armazenada no Supabase Vault com o nome `agentetome_api_key`;
- o valor descriptografado é lido somente dentro de função `SECURITY DEFINER`;
- a função pertence ao schema `private`;
- execução revogada de `public`, `anon` e `authenticated`;
- execução concedida somente ao `service_role`;
- nenhuma chave, link assinado ou XML bruto foi persistido na auditoria.

## Requisição validada

```text
Operação: admin_manifest
Administradora pesquisada: oliveira trust
Corte: recente
HTTP: 200
Content-Type: application/json; charset=utf-8
Duração: 631 ms
Schema: 1
```

## Match de administradoras

O provedor identificou cinco grafias/registros relacionados ao grupo Oliveira Trust, incluindo:

- OLIVEIRA TRUST DIST. DE TÍTULOS E VALORES MOBILIÁRIOS S/A;
- OLIVEIRA TRUST DTVM;
- Oliveira Trust DTVM S.A.;
- OLIVEIRA TRUST DTVM S.A.;
- OLIVEIRA TRUST SERVICER S/A.

## Cobertura retornada

Janela declarada pelo manifest:

- FIDC até `2026-06`;
- FII até `2026-06`;
- fundos 555 até `2026-07-21`.

Arquivos e linhas declaradas:

| Arquivo | Linhas |
|---|---:|
| `fidc_consolidado.csv` | 180 |
| `fidc_classes.csv` | 648 |
| `fidc_aging.csv` | 10.260 |
| `fii_consolidado.csv` | 111 |
| `fundos_555_consolidado.csv` | 60 |
| `qualidade_operacional.csv` | 351 |

## Auditoria

Registro criado em `public.agentetome_operation_runs`:

```text
run_id: e4ac7832-aa2b-4add-b7df-4cb652c769a7
status: completed
http_status: 200
administrator: oliveira trust
probe_channel: supabase_vault_private_function
raw_payload_persisted: false
```

## Source Catalog

A fonte `src_agentetome_api` foi promovida para:

```text
status: real
health: healthy
implementationPhase: real_probe_completed
```

Os canais estão registrados separadamente:

```text
supabaseSecureProbe: real
vercelApi: pending_environment_secret_sync
```

Portanto, a conexão com o provedor e os dados reais estão comprovados. A variável da Vercel continua sendo uma pendência específica do canal serverless, não da disponibilidade da fonte.

## Próxima etapa

1. solicitar export CSV real por administradora;
2. validar `manifest.schema_versao` antes do download;
3. hashear e normalizar o ZIP;
4. persistir bronze e silver;
5. resolver fundo, administradora e originador contra o Company Master;
6. produzir sinais com lineage;
7. alimentar Market Map, comparáveis e Thesis antes de qualquer impacto em score ou ranking.
