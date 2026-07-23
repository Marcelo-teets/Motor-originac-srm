# Agentetome — integração API/MCP

## Objetivo

Adicionar o Agentetome como camada suplementar de inteligência sobre fundos e securitização, preservando CVM/FNET como origem oficial. A integração atende dois fluxos distintos:

1. **Validação preventiva de XML FIDC** antes do envio ao Fundos.net.
2. **Exportação por administradora** para market map, comparáveis, aging e qualidade operacional de fundos.

## Papel no pipeline de originação

```text
Agentetome API/MCP
→ operação autenticada
→ auditoria sem conteúdo sensível
→ manifest/export temporário
→ normalização e entity resolution (próxima etapa)
→ comparáveis / market map / tese
```

O Agentetome não altera score, qualification ou ranking apenas por estar cadastrado. Esses motores somente poderão consumir seus dados após:

- download e leitura controlada do pacote de exportação;
- preservação de `informe_id`, CNPJ e competência;
- resolução da relação fundo ↔ administradora ↔ originador/cedente ↔ empresa;
- geração de sinais observados com evidência rastreável.

## Fonte governada

- `source_catalog.metadata.code`: `src_agentetome_api`
- categoria: `funds_structured_data`
- prioridade: `1`
- criticidade: `high`
- tier: `tier_5_supplemental_enrichment`
- confiança máxima inicial: `0.78`
- origem oficial subjacente: CVM/FNET
- status inicial: `partial/degraded`

O status só deve mudar para `real/healthy` após uma chamada autenticada bem-sucedida em produção.

## Variáveis de ambiente

```bash
AGENTETOME_API_KEY=
AGENTETOME_API_BASE_URL=https://www.agentetome.com
AGENTETOME_MCP_URL=https://www.agentetome.com/api/mcp
```

Regras:

- configurar a chave somente como segredo server-side;
- nunca usar prefixo `VITE_`;
- nunca registrar a chave em logs, banco, payload de erro ou documentação;
- rotação de chave deve ser feita no Agentetome e no cofre de segredos do runtime.

## Endpoints internos

Todos exigem JWT válido do Supabase Auth.

### Status

```http
GET /api/sources/agentetome/status
Authorization: Bearer <supabase_access_token>
```

Retorna apenas presença da configuração, capacidades, limites e política de persistência. A chave nunca é retornada.

### Manifest por administradora

```http
GET /api/sources/agentetome/admin-manifest?admin=oliveira%20trust&corte=recente
Authorization: Bearer <supabase_access_token>
```

Para corte por competência:

```http
GET /api/sources/agentetome/admin-manifest?admin=oliveira%20trust&corte=competencia&competencia=2026-06
```

### Solicitar exportação

```http
POST /api/sources/agentetome/admin-export
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{
  "admin": "oliveira trust",
  "corte": "recente",
  "formato": "csv"
}
```

O retorno contém link temporário assinado. O link é entregue ao usuário autenticado, mas **não é persistido** na plataforma.

### Validar XML FIDC

```http
POST /api/sources/agentetome/validate-xml
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{
  "xmlBase64": "PD94bWwgdmVyc2lvbj0iMS4wIj8+..."
}
```

O XML bruto não é persistido. A auditoria guarda apenas:

- hash SHA-256 do arquivo;
- tamanho em bytes;
- versão de leiaute;
- status geral;
- contadores do laudo.

## Auditoria

Tabela: `public.agentetome_operation_runs`.

Campos principais:

- operação;
- status;
- usuário solicitante;
- administradora e competência, quando aplicável;
- fingerprint da requisição;
- resumo sanitizado;
- HTTP status;
- `Retry-After`;
- duração.

A tabela não é exposta a `anon` nem `authenticated`; o backend usa `service_role`.

## Limites e tratamento de erro

- validação XML: 30 requisições/minuto;
- exportação: 10 gerações/hora;
- XML: máximo de 5 MB;
- HTTP 429: respeitar `Retry-After`;
- HTTP 401: tratar como chave ausente, inválida ou revogada;
- HTTP 503: manter fonte como degradada e não fabricar resultado;
- links de exportação expiram e devem ser tratados como o próprio arquivo.

## Próxima PR de dados

Após o MCP/API estar operacional e um pacote real ser inspecionado, implementar:

1. download imediato do ZIP assinado;
2. validação de `manifest.schema_versao`;
3. leitura limitada e segura dos CSVs;
4. bronze genérico com hash/idempotência;
5. silver para fundos, classes e aging;
6. resolução CNPJ/nome com Company Master;
7. sinais `existing_fidc_structure`, `fidc_admin_relationship`, `receivables_aging_quality` e `fund_operational_quality`;
8. integração explicável em market map, thesis e comparables, sem sobrescrever evidência CVM oficial.

## Validação de Preview — 23/07/2026

- deployment Vercel da PR #209 concluído em estado `READY`;
- rota direta `/api/agentetome?operation=status` e rewrite canônico `/api/sources/agentetome/status` validados;
- chamadas sem bearer retornam `401` em JSON, como esperado;
- headers `X-Origination-Runtime: agentetome-v1` e `Cache-Control: no-store` confirmados;
- a falha inicial `FUNCTION_INVOCATION_FAILED` foi corrigida com handler Vercel resiliente, autenticação Supabase via REST e import dinâmico capturável;
- CI, Strategic Public Data e Public Data Operations Validation concluídos com sucesso.

O probe autenticado contra o provedor continua condicionado à configuração de `AGENTETOME_API_KEY` nos ambientes Vercel.
