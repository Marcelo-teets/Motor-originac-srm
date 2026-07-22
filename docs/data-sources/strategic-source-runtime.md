# Runtime das fontes estratégicas

## Decisão de arquitetura

As duas fontes oficiais têm perfis operacionais diferentes e não devem compartilhar o mesmo runtime por conveniência.

| Dataset | Perfil | Runtime oficial | Cadência |
|---|---|---|---|
| `cvm_fre_capital_structure` | ZIP anual pequeno, leitura semanal | Vercel Function isolada | segunda-feira, 09:15 UTC |
| `rfb_qsa` | 10 ZIPs nacionais, aproximadamente centenas de MB compactados | GitHub Actions particionado | dia 8 de cada mês, 09:40 UTC |

A separação preserva a stack oficial e evita dois erros:

1. executar o FRE em uma Action bloqueada por secrets inexistentes;
2. tentar processar o QSA nacional dentro de uma função web com limite de memória e duração.

## CVM FRE na Vercel

Endpoint interno:

```text
GET /api/strategic-public-data-run
Authorization: Bearer ${CRON_SECRET}
```

Alias:

```text
GET /api/sources/strategic-run
```

A função:

1. descobre o ZIP anual corrente na CVM;
2. baixa o arquivo oficial;
3. valida a estrutura ZIP, limites, método de compressão e CRC;
4. lê apenas seções de capital e endividamento;
5. cruza CNPJ com o Company Master;
6. persiste bronze, records, outputs e signals;
7. recomputa qualification, patterns, scores, ranking, thesis e pipeline.

Configuração Vercel:

- runtime Node;
- `maxDuration`: 300 segundos;
- memória: 2 GB;
- autenticação pelo `CRON_SECRET` já usado no projeto;
- Supabase pelo `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente Vercel.

O modo `probe` é permitido sem `CRON_SECRET` somente em Preview protegido. Ele baixa e percorre o arquivo oficial, mas não persiste dados. Em Production, até o probe exige autenticação.

## Receita QSA no GitHub Actions

O QSA permanece no workflow `.github/workflows/strategic-public-data.yml` porque:

- a base é dividida em dez arquivos grandes;
- o loader precisa de disco temporário e execução longa;
- o matching deve acontecer antes da persistência;
- identificadores de pessoas físicas precisam ser mascarados antes da camada bronze.

Secrets obrigatórios no GitHub Actions:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Quando esses secrets não existem, o workflow:

- não executa o loader;
- não produz falha vermelha falsa;
- registra um warning e um resumo operacional;
- mantém a fonte como `waiting/degraded` no painel de Sources.

Isso distingue corretamente defeito de código de pré-requisito operacional ausente.

## Pré-requisito de dados

O matching oficial depende de CNPJs reais no `companies.cnpj`.

Enquanto o Company Master contiver CNPJs sintéticos:

- o download e o parsing podem ser validados;
- os registros oficiais aderentes serão zero por desenho;
- nenhum score deve ser artificialmente alterado;
- a fonte não deve ser promovida a cobertura real.

A correção operacional é substituir mocks por CNPJs reais durante o fluxo de descoberta/enriquecimento, preservando entity resolution e histórico.

## Comandos de validação

```bash
npm -C backend run typecheck
npm -C backend exec -- tsx --test \
  src/lib/zipArchive.test.ts \
  src/modules/public-data/strategicPublicDatasetConnector.test.ts
```

Probe em Preview:

```text
/api/strategic-public-data-run?mode=probe&reference=2026
```

Execução autenticada:

```text
/api/strategic-public-data-run?mode=run&reference=2026
```

## Critérios para promover a fonte

### CVM FRE

Promover para `real/healthy` somente quando houver:

- recurso oficial processado sem erro;
- checkpoint completo;
- `rows_scanned > 0`;
- CNPJs reais no Company Master;
- records/outputs/signals coerentes quando houver match;
- recomputação downstream concluída.

### RFB QSA

Promover para `real/healthy` somente quando houver:

- secrets do GitHub configurados;
- todos os dez arquivos da competência processados ou corretamente pulados por checkpoint;
- CPF e representante legal ausentes em claro;
- comparação entre ao menos duas competências para gerar `ownership_change`;
- cobertura por CNPJ raiz validada.
