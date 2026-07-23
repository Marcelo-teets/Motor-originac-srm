# Agentetome — contrato de dados v1

## Schema aceito

```text
manifest.schema_versao = 1
```

Qualquer outro schema bloqueia a ingestão.

## Package

Um package é identificado por SHA-256 do ZIP. Idempotência:

```text
content_hash unique
storage bucket + path unique
```

## Bronze

Dataset codes:

```text
agentetome_fidc_consolidado_v1
agentetome_fidc_classes_v1
agentetome_fidc_aging_v1
agentetome_fii_consolidado_v1
agentetome_fundos_555_consolidado_v1
agentetome_qualidade_operacional_v1
```

Cada registro contém:

```text
dataset_code
record_key físico + row SHA-256
ref_date
entity_cnpj
payload
source_url lógico privado
content_hash
```

Lineage mínimo:

```json
{
  "provider": "agentetome",
  "package_hash": "<sha256>",
  "file_name": "<csv>",
  "row_number": 1,
  "schema_version": 1
}
```

## Silver FIDC

Destino:

```text
capital_market_events
agentetome_fidc_market_map_v1
```

Contrato:

```text
dataset_code = agentetome_fidc_consolidado_v1
event_type = fund_portfolio_snapshot
instrument_type = FIDC
source_code = src_agentetome_api
```

## Confiança

```text
source confidence cap: 0.78
underlying official source: CVM/FNET
```

O Agentetome não substitui a fonte oficial e não gera score empresarial sem resolução e corroboração.
