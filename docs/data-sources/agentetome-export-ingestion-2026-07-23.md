# Agentetome — export real, bronze e Market Map FIDC

Data operacional: 23/07/2026

## Resultado

A integração avançou do probe para ingestão real de pacote por administradora:

```text
Agentetome MCP exportar_admin
→ link assinado temporário
→ Edge Function com token descartável
→ validação de host, expiração, tamanho, hash e schema
→ Supabase Storage privado
→ seis CSVs validados
→ bronze_historical_records
→ source_documents + connector/dataset/operation runs
→ capital_market_events FIDC
→ view agentetome_fidc_market_map_v1
```

A fonte oficial subjacente continua sendo CVM/FNET. O Agentetome permanece como camada suplementar de normalização e qualidade.

## Pacote principal

```text
Administradora: Oliveira Trust DTVM
CNPJ de consulta: 36.113.876/0001-91
Package ID: 7bb4b5cd-2497-4498-82cd-40892f1e09ee
SHA-256: 9479e997a974f01dc48bc09c136d6fd4afe224244c70df7d1c48f444554d7adf
Tamanho: 117.293 bytes
Schema: 1
Status: parsed
Bucket: agentetome-raw (private)
Signed URL persistida: não
```

## Cobertura persistida

| Dataset | Linhas | CNPJs distintos | Janela |
|---|---:|---:|---|
| `agentetome_fidc_consolidado_v1` | 201 | 201 | 2024-01 a 2026-06 |
| `agentetome_fidc_classes_v1` | 743 | 192 | 2024-01 a 2026-06 |
| `agentetome_fidc_aging_v1` | 11.520 | 192 | 2024-01 a 2026-06 |
| `agentetome_fii_consolidado_v1` | 109 | 109 | 2021-08 a 2026-06 |
| `agentetome_fundos_555_consolidado_v1` | 58 | 58 | 2021-12-27 a 2026-07-22 |
| `agentetome_qualidade_operacional_v1` | 368 | 357 | conforme última entrega |
| **Total bronze** | **12.999** | — | — |

Cada linha contém lineage com:

- provedor;
- package hash;
- arquivo;
- número físico da linha;
- versão do schema;
- hash do conteúdo;
- URL lógica do objeto privado.

## Silver FIDC

Foram criados 201 eventos em `capital_market_events`:

```text
dataset_code: agentetome_fidc_consolidado_v1
event_type: fund_portfolio_snapshot
instrument_type: FIDC
```

Campos normalizados:

- CNPJ e nome do fundo;
- competência e entrega;
- PL e carteira;
- inadimplência total e inadimplência/PL;
- PDD;
- subordinação;
- cotistas;
- administradora, gestor e custodiante;
- silêncio, atrasos e reapresentações;
- violações operacionais declaradas pelo Tomé;
- lineage até o ZIP e o informe.

A view `agentetome_fidc_market_map_v1` é `security_invoker` e está liberada somente ao `service_role` até existir endpoint backend autenticado.

## Métricas iniciais do universo

Sobre os 201 FIDCs:

| Métrica | Resultado |
|---|---:|
| Fundos com PL declarado | 192 |
| PL agregado | R$ 108,12 bilhões |
| PL mediano | R$ 109,63 milhões |
| Inadimplência/PL ≥ 5% | 64 |
| Inadimplência/PL ≥ 10% | 51 |
| Subordinação < 10% | 21 |
| Defasados ou em silêncio | 32 |
| Entregas marcadas como entregues | 201 |

Essas métricas servem para comparáveis, estrutura de mercado, diligência e tese. Não são, isoladamente, sinal de irregularidade ou recomendação de crédito.

## Resolução contra Company Master

Resultado inicial:

```text
exact CNPJ matches: 0
exact normalized-name matches: 0
safe automatic score impact: false
```

Fundos e administradoras não foram inseridos como leads automaticamente. Nenhum campo `has_fidc`, qualification, pattern, score, thesis, ranking ou pipeline foi alterado.

A próxima resolução deve ligar:

```text
fundo
→ originador/cedente
→ empresa operacional
→ companies
```

Somente após evidência corroborada por CVM/FNET e resolução de entidade poderá existir signal empresarial.

## Segurança

- chave Agentetome no Supabase Vault;
- funções privadas e `SECURITY DEFINER` restritas ao `service_role`;
- Edge Functions usam tokens SHA-256 de uso único e curta duração;
- bucket privado com limite de 25 MB;
- validação de host `www.agentetome.com` antes do download direto;
- schema diferente de `1` é bloqueado;
- tamanho, hash, arquivos e linhas são validados;
- XML bruto e links assinados nunca são persistidos;
- tabelas de package/token com RLS e sem grants para `anon`/`authenticated`;
- view silver sem acesso direto de usuário.

## Recuperação e idempotência

O pipeline possui uma função separada de recuperação de package privado. O smoke idempotente confirmou:

```text
HTTP 200
package já parsed
bronze reprocessada sem duplicação
resultado final: already_parsed
```

Tentativas anteriores que chegaram ao Storage, mas não concluíram bronze, foram catalogadas como `failed/quarantined`, com motivo e ação de recuperação. Nenhum objeto ficou sem referência de governança.

## Limite do provedor

O Agentetome bloqueou novas exportações após o teto operacional documentado de 10 gerações por 60 minutos. O sistema:

- não contorna o rate limit;
- não fabrica dados;
- mantém o package validado disponível;
- possui recovery pelo Storage privado;
- deve honrar `Retry-After` quando fornecido.

## Próximas entregas

1. Endpoint backend autenticado para Market Map FIDC.
2. Tela executiva no Dashboard/Leads para comparáveis FIDC.
3. Resolução fundo → originador/cedente → Company Master.
4. Sinais empresariais somente após corroboração.
5. Rotina mensal por administradora com budget de uso.
6. Detecção de mudança entre competências, sem duplicar snapshots.
