# Recuperação de dados Supabase -> Neon via REST

## Contexto

O projeto Supabase de produção `hdghpmssudrqhsbvrdyt` continua reportando `ACTIVE_HEALTHY`, mas as consultas SQL administrativas seguem falhando por `Connection terminated due to connection timeout`. O runtime do Motor usa a Data API/REST do Supabase, então a trilha de recuperação mais segura antes de qualquer cutover é tentar leitura paginada via PostgREST, sem DDL e sem depender da conexão SQL administrativa.

Esta trilha é **read-only na origem**.

## Ferramentas

- `scripts/migration/neon-migration-manifest.mjs`
- `scripts/migration/supabase-rest-export.mjs`
- `scripts/migration/neon-json-import-sql.mjs`

O manifest ordena as tabelas pelo encadeamento de FKs do runtime UUID reconstruído no Neon.

## 1. Probe sem exportar dados

Executar apenas contagens/legibilidade:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/migration/supabase-rest-export.mjs --probe --out=tmp/supabase-rest-probe
```

A chave nunca é escrita no manifest ou no log pelo script.

## 2. Export privado

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/migration/supabase-rest-export.mjs \
  --out=tmp/supabase-rest-export \
  --page-size=1000
```

Saída:
- um `.ndjson` por tabela;
- `manifest.json` com contagem e SHA-256 por tabela.

O exportador fixa a ordenação pelas chaves primárias, detecta IDs repetidos, exige contagem exata e repete a contagem após exportar. **Isso não constitui snapshot transacional**: uma carga final precisa de pausa de escritas, delta e reconciliação.

### Segurança

- não commitar `tmp/supabase-rest-export`;
- não publicar bundle como artifact público;
- não imprimir `SUPABASE_SERVICE_ROLE_KEY`;
- tratar o bundle como dado confidencial do projeto.

## 3. Gerar SQL de carga para Neon

Com o schema UUID já existente no destino:

```bash
node scripts/migration/neon-json-import-sql.mjs \
  --bundle=tmp/supabase-rest-export \
  --out=tmp/neon-import.sql \
  --batch-size=250
```

O gerador usa `jsonb_populate_recordset(null::public.<table>, ...)`, preserva IDs/timestamps e gera `ON CONFLICT DO NOTHING` para permitir uma primeira carga idempotente em destino vazio.

O gerador agora verifica o SHA-256 de cada NDJSON, exige as tabelas solicitadas e recusa arquivos trocados ou incompletos.\n\nPara a **carga final de delta**, após conferir o snapshot inicial, gerar o SQL com `--upsert` para atualizar registros existentes pela PK (inclusive PK composta). Sem `--upsert`, o modo inicial é `ON CONFLICT DO NOTHING` e **não substitui** o delta final.\n\nO SQL gerado contém dados reais e também deve permanecer fora do Git.

## 4. Critério obrigatório antes de executar a carga

A carga só deve ser executada depois de:

1. schema UUID validado no Neon production;
2. contagem de todas as tabelas do bundle disponível;
3. tamanho do bundle compatível com as quotas rígidas Neon;
4. Supabase mantido intacto para rollback;
5. import inicialmente feito em branch temporária Neon;
6. reconciliação de contagens e amostras;
7. aprovação explícita imediatamente antes de aplicar schema/dados em `production`.

## 5. Reconciliação mínima

Para cada tabela:
- contagem origem;
- contagem branch Neon;
- hash do arquivo de export;
- 3 amostras determinísticas por PK quando aplicável;
- FKs órfãs = 0;
- IDs preservados;
- timestamps preservados.

Para superfícies de decisão:
- `companies`
- `company_signals`
- `qualification_snapshots`
- `company_patterns`
- `score_snapshots`
- `lead_score_snapshots`
- `ranking_v2`
- `pipeline`

a reconciliação deve ser 100% antes do cutover.

## Preflight operacional de 30/09/2026\n\nO workflow `.github/workflows/neon-source-recovery-preflight.yml` tenta primeiro a leitura REST de `companies` e `source_catalog`; separadamente tenta `SELECT 1` em transação read-only via PostgreSQL quando `MOTOR_SUPABASE_DATABASE_URL` existir no cofre GitHub. Ele **não exporta dados, não altera o Supabase e não faz o cutover**.\n\nNa verificação direta de 30/09, o SQL administrativo do Supabase retornou timeout e a produção Vercel reportou HTTP 402 por `exceed_db_size_quota` e `exceed_storage_size_quota`. Isso bloqueia a extração REST enquanto durar a restrição. Uma conexão PostgreSQL via pooler ou um backup pré-existente precisa ser confirmada antes de prosseguir. Nunca apague dados da origem para contornar a quota sem backup conferido.\n\nO limite rígido configurado no Neon é 480 MB: uma origem excedendo 500 MB não cabe automaticamente. Arquivar históricos verificáveis fora do banco quente antes da importação, conforme política cold archive do Motor. Storage e usuários de Auth são migrações separadas, não cobertas pelo NDJSON `public`.\n\n## Estado em 2026-09-28

- Neon schema candidato: 55 tabelas public validadas em branch temporária.
- Supabase SQL administrativo: ainda com CONNECT_TIMEOUT.
- Supabase REST recovery tooling: versionado, testado em CI, ainda não executado contra dados reais nesta mudança.
- Nenhum dado real foi apagado, alterado ou migrado por estas ferramentas.
