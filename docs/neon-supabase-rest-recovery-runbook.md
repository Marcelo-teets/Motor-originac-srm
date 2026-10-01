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

O exportador fixa a ordenação pelas chaves primárias, exige contagem exata, detecta PK repetida, confirma que a contagem não mudou entre páginas e repete a contagem ao final. Isso reduz risco de export inconsistente, mas **não cria snapshot transacional**; antes do cutover ainda é obrigatório pausar escritas, aplicar delta final e reconciliar origem/destino.

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

O gerador usa `jsonb_populate_recordset(null::public.<table>, ...)`, preserva IDs/timestamps, verifica o SHA-256 de cada NDJSON e exige todas as tabelas solicitadas. A primeira carga usa `ON CONFLICT DO NOTHING`. Para o delta final, `--upsert` gera `ON CONFLICT (<PK>) DO UPDATE`, inclusive para PK composta. O SQL gerado contém dados reais e deve permanecer fora do Git.

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

## Estado em 2026-09-28

- Neon schema candidato: 55 tabelas public validadas em branch temporária.
- Supabase SQL administrativo: ainda com CONNECT_TIMEOUT.
- Supabase REST recovery tooling: versionado, testado em CI, ainda não executado contra dados reais nesta mudança.
- Nenhum dado real foi apagado, alterado ou migrado por estas ferramentas.


## Estado operacional — 2026-10-01

O full export executado em 01/10 **não produziu backup de dados**: os 156 objetos de banco tentados retornaram HTTP 402 por `exceed_db_size_quota` / `exceed_storage_size_quota`; Auth e Storage também ficaram bloqueados. O artifact contém somente manifesto/diagnóstico. O workflow agora possui gate de completude e não pode ficar verde quando o export estiver parcial ou vazio.

O GitHub já possui `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `NEON_API_KEY`. Continuam ausentes `MOTOR_SUPABASE_DATABASE_URL`, `MOTOR_NEON_DATABASE_URL` e `MOTOR_BACKUP_PASSPHRASE`. A ausência do URL PostgreSQL direto do Supabase é o principal bloqueio para uma recuperação por `pg_dump`/pooler enquanto o PostgREST está restrito.

Não aplicar schema/dados no Neon production antes de existir uma origem recuperável e reconciliação 100% das superfícies de decisão.
