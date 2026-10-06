# Motor Originação SRM — Revisão completa + saída do Supabase para o Neon (06/10/2026)

Documento único com **tudo o que precisa ser corrigido e as correções já aplicadas** (patches verbatim, testados).
Base: branch `chore/neon-db-cutover` (PR #528) em `b0a40648f6`. Resultado: 216 files changed, 6601 insertions(+), 5923 deletions(-).

> O push direto para o GitHub foi bloqueado pelo proxy desta sessão (repositório fora do conjunto autorizado),
> por isso a entrega é este MD + `motor-revisao-neon-2026-10-06.mbox` + `.bundle` (mesmo conteúdo).

## 1. Situação encontrada (verificada em 06/10/2026)

| Item | Estado |
|---|---|
| Neon produção (`steep-poetry-38942951`) | Schema **parcial**: 37 relações, 8 migrações registradas; o migrador do PR #528 parou na `076`. Sem dados de negócio (só seeds: 11 fontes, 10 padrões, 4 perfis). |
| O que o código exige e não existe no Neon | **39 relações e 60 funções** (medido com `scripts/neon-runtime-parity-check.mjs` contra uma réplica idêntica à produção). Ingestão pública, bronze, IA/vetores, fila de decisão, revisão de crédito, Agentetome, embeddings etc. dariam erro 500. |
| Supabase (`hdghpmssudrqhsbvrdyt`) | Control plane ativo, mas banco recusa conexão e a REST devolve **HTTP 402** (cota do plano Free). Os dados ainda **não foram migrados**. |
| PR #528 | Remove o Supabase do runtime (correto), mas tem 1 bug crítico (placeholders de RPC), plano de migração que não completa, workflows quebrados e apagou as ferramentas de recuperação. |

### Principais defeitos corrigidos

| # | Gravidade | Defeito | Onde | Tarefa |
|---|---|---|---|---|
| 1 | Crítica | RPCs recebiam constantes `1,2,3…` no lugar dos argumentos | `backend/src/lib/postgres.ts` | 02 |
| 2 | Crítica | json/jsonb gravados errado (`[]`→`{}`, JSON inválido, filtros perdidos) | `postgres.ts` | 02 |
| 3 | Crítica | Schema do Neon incompleto; plano de migração não completa | `db/`, `scripts/` | 15 |
| 4 | Crítica | Triggers PL/pgSQL referenciam colunas inexistentes (inserts em `lead_score_snapshots`/`pipeline` falhariam) | SQL | 15–16 |
| 5 | Alta | Usuário `invited`/`disabled` acessava rotas Express com token válido; JWT sem `exp` aceito | auth | 03 |
| 6 | Alta | Agentetome (manifest/export/refresh) quebrado: dependia de vault, pg_net, http, pg_cron e Edge Function apagada | Agentetome | 16 |
| 7 | Alta | Jobs do pg_cron sem agendador no Neon (reprocessamento, resolução de entidades, Agentetome) | — | 16 |
| 8 | Alta | Workflows de capital markets/CVM chamavam script apagado → falha em toda execução | `.github/workflows` | 16 |
| 9 | Alta | Ferramentas de recuperação apagadas com o Neon vazio e o Supabase bloqueado | `scripts/migration` | 17 |
| 10 | Média | Lock de ingestão preso 6h após erro; um dataset com falha derrubava os outros | ingestão | 07 |
| 11 | Média | `knowledge_agent_upsert_node`: “column reference node_id is ambiguous” | SQL 104 | 16 |
| 12 | Média | `CRON_SECRET` comparado sem tempo constante; helpers HTTP duplicados em 12 funções | `api/`, `serverless/` | 04 |
| 13 | Média | Ranking comercial sempre no fallback (tabela `ranking_snapshots` não existe) | `commercialPriorityService.ts` | 16 |
| 14 | Média | Busca vetorial com 1536 dimensões contra embeddings de 1024 | `db/neon` | 15 |
| 15 | Baixa | ~3,7 mil linhas mortas/duplicadas; parsing de CLI/conectores duplicado; 8 vulnerabilidades npm | vários | 06, 08–13 |

## 2. Regras para quem executar (pessoa ou agente)

1. **Não reconstrua nem “melhore” código.** Aplique os patches exatamente como estão. Se um patch não aplicar,
   **pare** e reporte tarefa, arquivo e saída do `git apply` — não edite à mão.
2. **Ordem:** tarefas 01 → 17, um commit por tarefa com a mensagem indicada.
3. **Não toque em produção durante a aplicação:** nada de SQL no Neon, nada de deploy, nada de env na Vercel.
   O schema é aplicado depois, na seção 5, por decisão explícita do Marcelo.
4. **Atenção ao workflow `Neon Runtime Parity`:** num PR cujo branch de origem seja `chore/neon-db-cutover`, ele
   **aplica as migrações na produção** automaticamente. Para revisar sem efeito colateral, abra o PR a partir de
   `claude/revisao-neon-2026-10-06` (como abaixo) — esse branch só roda a checagem.
5. Árvore final esperada: tree `c8994ee4376618f17ab84cb8dfe7b244ced48b74` quando aplicado sobre `b0a40648f6`.

## 3. Como aplicar

Caminho rápido (mesmo resultado, já com os commits):

```bash
git fetch origin chore/neon-db-cutover
git checkout -b claude/revisao-neon-2026-10-06 origin/chore/neon-db-cutover
git am motor-revisao-neon-2026-10-06.mbox          # ou: git pull motor-revisao-neon-2026-10-06.bundle claude/revisao-neon-2026-10-06
git rev-parse HEAD^{tree}                         # deve ser c8994ee4376618f17ab84cb8dfe7b244ced48b74
```

Caminho por tarefas (este documento): cada tarefa tem `git rm` (quando há remoções), um bloco de patch entre cinco
crases rotulado `patch tarefa-NN`, a verificação e o commit. Extração automática dos patches:

```bash
python3 - "MOTOR-REVISAO-NEON-2026-10-06.md" <<'PY'
import re, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
for num, body in re.findall(r"^`````patch tarefa-(\d\d)\n(.*?)^`````$", text, flags=re.S | re.M):
    pathlib.Path(f"/tmp/tarefa-{num}.patch").write_text(body, encoding='utf-8')
    print(f"/tmp/tarefa-{num}.patch")
PY
```

Preparação:

```bash
git fetch origin chore/neon-db-cutover
git checkout -b claude/revisao-neon-2026-10-06 origin/chore/neon-db-cutover
git log -1 --format=%H     # deve começar com b0a40648f6
npm ci
```


## 4. Tarefas


---

### Tarefa 01 — Testes: deadline de captura e contratos obsoletos dos growth guards

**Por quê:** `withCaptureDeadline` usava `timer.unref()`: com uma captura travada o processo podia encerrar antes do timeout disparar (o teste `boundedCapture.test.ts` era cancelado pelo runner). Dois contratos de growth guard verificavam um desenho antigo (comentário com a palavra TRUNCATE e `pg_cron` no Neon).

**Arquivos alterados/criados:**

```
 backend/src/lib/boundedCapture.ts                              |  5 ++++-
 scripts/database-growth-circuit-breaker-contract.test.mjs      |  9 ++++++---
 scripts/neon-database-growth-circuit-breaker-contract.test.mjs | 12 ++++++++----
 3 files changed, 18 insertions(+), 8 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-01
diff --git a/backend/src/lib/boundedCapture.ts b/backend/src/lib/boundedCapture.ts
index 6249818a03d5ddfce9059ec00f0bd09dc2febe1d..f62fba2931e889d651d712b7b8d7ce1f78499d93 100644
--- a/backend/src/lib/boundedCapture.ts
+++ b/backend/src/lib/boundedCapture.ts
@@ -73,11 +73,14 @@ export const assertBoundedCaptureScope = (companyId?: string | null, sourceId?:
 export async function withCaptureDeadline<T>(task: Promise<T>, budgetMs = CAPTURE_RUNTIME_BUDGET_MS): Promise<T> {
   let timer: NodeJS.Timeout | undefined;
   try {
+    // The deadline timer must keep the event loop alive: an unref'd timer lets the
+    // process exit while a hung capture is still pending, so the deadline never
+    // fires and the caller never receives the controlled 504. The finally block
+    // clears it as soon as the task settles, so it never outlives the capture.
     return await Promise.race([
       task,
       new Promise<never>((_, reject) => {
         timer = setTimeout(() => reject(new CaptureRuntimeDeadlineError(budgetMs)), budgetMs);
-        timer.unref?.();
       }),
     ]);
   } finally {
diff --git a/scripts/database-growth-circuit-breaker-contract.test.mjs b/scripts/database-growth-circuit-breaker-contract.test.mjs
index 09b710a6049325f15d7d0e03a058213625859216..38236b45fc0ae8b1907d544e778b4b1e6092d638 100644
--- a/scripts/database-growth-circuit-breaker-contract.test.mjs
+++ b/scripts/database-growth-circuit-breaker-contract.test.mjs
@@ -49,7 +49,10 @@ test('state refresh is bounded and cron-driven', () => {
 });
 
 test('guard remains non-destructive', () => {
-  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
-  assert.doesNotMatch(sql, /\btruncate\b/i);
-  assert.doesNotMatch(sql, /vacuum\s+full/i);
+  // The header comment documents "no DELETE/TRUNCATE/VACUUM FULL"; only executable
+  // SQL must be free of destructive statements.
+  const executableSql = sql.replace(/--[^\n]*/g, '');
+  assert.doesNotMatch(executableSql, /\bdelete\s+from\b/i);
+  assert.doesNotMatch(executableSql, /\btruncate\b/i);
+  assert.doesNotMatch(executableSql, /vacuum\s+full/i);
 });
diff --git a/scripts/neon-database-growth-circuit-breaker-contract.test.mjs b/scripts/neon-database-growth-circuit-breaker-contract.test.mjs
index 8d8292de76835f5c0198212e264d3f1c21c265d5..8474628e085f0f801154ceb585ee495220b58b91 100644
--- a/scripts/neon-database-growth-circuit-breaker-contract.test.mjs
+++ b/scripts/neon-database-growth-circuit-breaker-contract.test.mjs
@@ -39,9 +39,13 @@ test('Neon guard covers raw-heavy surfaces and not decision layers', () => {
   }
 });
 
-test('Neon guard supports shrinking cleanup and cron refresh', () => {
+test('Neon guard supports shrinking cleanup and trigger-driven refresh without pg_cron', () => {
   assert.match(sql, /v_new_bytes <= v_old_bytes/);
-  assert.match(sql, /create extension if not exists pg_cron/);
-  assert.match(sql, /database-growth-guard-refresh/);
-  assert.match(sql, /'11,41 \* \* \* \*'/);
+  // Neon only allows pg_cron in the `postgres` database, so the guard refreshes its
+  // cached measurement from the trigger itself when it is older than 30 minutes.
+  const executableSql = sql.replace(/--[^\n]*/g, '');
+  assert.doesNotMatch(executableSql, /create extension if not exists pg_cron/i);
+  assert.doesNotMatch(executableSql, /\bcron\.schedule\b/i);
+  assert.match(sql, /checked_at < now\(\) - interval '30 minutes'/);
+  assert.match(sql, /select private\.refresh_database_growth_guard\(\);/);
 });
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-01.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/lib/boundedCapture.test.ts && npm run test:database-hardening
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
fix(tests): keep capture deadline timer alive and update obsolete guard contracts

- withCaptureDeadline: drop timer.unref(). An unref'd deadline lets the event
  loop drain while a hung capture is pending, so the 504 never fires (the
  boundedCapture test was being cancelled by the runner). The timer is still
  cleared in `finally` as soon as the task settles.
- database growth guard contract: ignore SQL comments when asserting the
  migration has no DELETE/TRUNCATE/VACUUM FULL (the header documents those
  words).
- Neon growth guard contract: assert the current design (no pg_cron on Neon,
  trigger-driven refresh when the cached measurement is >30 min old) instead of
  the removed pg_cron schedule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
(cherry picked from commit 9dffe2127cdb7797678a83cdc3e87cbc14bdfa53)
MSG
```


---

### Tarefa 02 — Neon: placeholders das RPCs e json/jsonb no NeonPostgresClient (crítico)

**Por quê:** **Bug introduzido no PR #528:** `rpc()`/`rpcAsUser()` montavam `p_x => 1, p_y => 2` (literais inteiros) em vez de `$1, $2` — toda RPC com argumentos recebia constantes no lugar dos valores do chamador. Além disso, o node-postgres envia arrays JS como array Postgres: `['a']` vira JSON inválido (`pattern_summary`, payloads de RPC), `[]` vira `{}` em silêncio (`source_trace`, `evidence`) e strings são rejeitadas em jsonb (nenhum `search_profile_filters` era gravado). O cliente consulta o catálogo e só serializa json/jsonb; chaves `undefined` deixam de virar NULL; linhas com formatos diferentes são gravadas em transação.

**Arquivos alterados/criados:**

```
 backend/src/lib/postgres.jsonb.integration.test.ts |  52 ++++++++++++++++++++++
 backend/src/lib/postgres.test.ts                   | 135 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/lib/postgres.ts                        | 337 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------------------------------------------
 3 files changed, 403 insertions(+), 121 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-02
diff --git a/backend/src/lib/postgres.jsonb.integration.test.ts b/backend/src/lib/postgres.jsonb.integration.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..53d3aa3741dfc39ab4bd30c639efcd8dbfedd7a1
--- /dev/null
+++ b/backend/src/lib/postgres.jsonb.integration.test.ts
@@ -0,0 +1,52 @@
+import assert from 'node:assert/strict';
+import { randomUUID } from 'node:crypto';
+import test from 'node:test';
+import { NeonPostgresClient } from './postgres.js';
+
+// Disposable Postgres only (local/CI service container). Never point this at
+// the Motor production database: the test creates and drops a scratch table.
+const url = process.env.MOTOR_TEST_POSTGRES_URL ?? '';
+
+test('NeonPostgresClient round-trips json/jsonb and text[] values against a real Postgres', { skip: !url }, async () => {
+  const client = new NeonPostgresClient(url);
+  const table = `motor_jsonb_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
+  const { Pool } = await import('pg');
+  const admin = new Pool({ connectionString: url, max: 1 });
+
+  try {
+    await admin.query(`create table public.${table} (
+      id text primary key,
+      tags text[] not null default '{}',
+      evidence jsonb not null default '[]'::jsonb,
+      filter_value jsonb,
+      metadata jsonb not null default '{}'::jsonb
+    )`);
+    await admin.query(`create function public.${table}_echo(p_records jsonb, p_label text)
+      returns jsonb language sql as $$ select jsonb_build_object('records', p_records, 'label', p_label) $$`);
+
+    await client.upsert(table, [
+      { id: 'strings', evidence: ['x', 'y'], filter_value: 'FIDC', tags: ['a', 'b'] },
+      { id: 'empty', evidence: [], metadata: { nested: [1, 2] } },
+      { id: 'objects', evidence: [{ k: 1 }], filter_value: 42 },
+    ], 'id');
+    await client.update(table, { evidence: ['updated'] }, [{ column: 'id', value: 'objects' }]);
+
+    const rows = await client.select(table, { orderBy: { column: 'id' } });
+    const byId = Object.fromEntries(rows.map((row: any) => [row.id, row]));
+    assert.deepEqual(byId.strings.evidence, ['x', 'y']);
+    assert.equal(byId.strings.filter_value, 'FIDC');
+    assert.deepEqual(byId.strings.tags, ['a', 'b']);
+    assert.deepEqual(byId.empty.evidence, []);
+    assert.deepEqual(byId.empty.metadata, { nested: [1, 2] });
+    assert.deepEqual(byId.objects.evidence, ['updated']);
+    assert.equal(byId.objects.filter_value, 42);
+
+    const echoed = await client.rpc<Record<string, unknown>>(`${table}_echo`, { p_records: [{ id: 1 }], p_label: 'cvm' });
+    assert.deepEqual(echoed, { records: [{ id: 1 }], label: 'cvm' });
+  } finally {
+    await admin.query(`drop function if exists public.${table}_echo(jsonb, text)`).catch(() => undefined);
+    await admin.query(`drop table if exists public.${table}`).catch(() => undefined);
+    await admin.end();
+    await client.close();
+  }
+});
diff --git a/backend/src/lib/postgres.test.ts b/backend/src/lib/postgres.test.ts
index 10feb5ed74ff6e0a894207b373188767a9f07210..11f7a4c0c75e73f95a60fe4a63dda5127c7e84ed 100644
--- a/backend/src/lib/postgres.test.ts
+++ b/backend/src/lib/postgres.test.ts
@@ -30,3 +30,138 @@ test('postgres adapter deduplicates conflict keys with last row winning', () =>
   ], ['id']);
   assert.deepEqual(rows, [{ id: '1', value: 'new' }]);
 });
+
+type RecordedQuery = { sql: string; values: unknown[] };
+
+const fakePool = (catalog: { jsonColumns?: string[]; jsonParams?: string[]; failCatalog?: boolean } = {}) => {
+  const queries: RecordedQuery[] = [];
+  const pool = {
+    async query(sql: string, values: unknown[] = []) {
+      queries.push({ sql, values });
+      if (sql.includes('information_schema.columns')) {
+        if (catalog.failCatalog) throw new Error('catalog unavailable');
+        return { rows: (catalog.jsonColumns ?? []).map((column_name) => ({ column_name })), fields: [] };
+      }
+      if (sql.includes('information_schema.routines')) {
+        return { rows: (catalog.jsonParams ?? []).map((parameter_name) => ({ parameter_name })), fields: [] };
+      }
+      return { rows: [], fields: [] };
+    },
+  };
+  return { pool: pool as never, queries };
+};
+
+const statements = (queries: RecordedQuery[]) => queries.filter((query) => !query.sql.includes('information_schema') && !query.sql.includes('set_config('));
+
+test('postgres adapter JSON-encodes values bound to json/jsonb columns only', async () => {
+  const { pool, queries } = fakePool({ jsonColumns: ['evidence', 'filter_value', 'metadata'] });
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', pool);
+
+  await client.upsert('demo', [{
+    id: 'a',
+    evidence: ['x', 'y'],
+    filter_value: 'FIDC',
+    metadata: { nested: [1, 2] },
+    tags: ['text', 'array'],
+    note: undefined,
+  }], 'id');
+
+  const [insert] = statements(queries);
+  // Columns are sorted; `note: undefined` is absent (JSON semantics), not NULL.
+  assert.match(insert.sql, /\("evidence", "filter_value", "id", "metadata", "tags"\)/);
+  assert.deepEqual(insert.values, ['["x","y"]', '"FIDC"', 'a', '{"nested":[1,2]}', ['text', 'array']]);
+});
+
+test('postgres adapter keeps empty arrays as JSON arrays instead of objects', async () => {
+  const { pool, queries } = fakePool({ jsonColumns: ['evidence'] });
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', pool);
+
+  await client.insert('demo', [{ id: 'b', evidence: [] }]);
+  await client.update('demo', { evidence: [] }, [{ column: 'id', value: 'b' }]);
+
+  const [insert, update] = statements(queries);
+  assert.deepEqual(insert.values, ['[]', 'b']);
+  assert.deepEqual(update.values, ['[]', 'b']);
+});
+
+test('postgres adapter JSON-encodes jsonb RPC parameters and caches the catalog lookup', async () => {
+  const { pool, queries } = fakePool({ jsonParams: ['p_records'] });
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', pool);
+
+  await client.rpc('persist_batch', { p_records: [{ id: 1 }], p_dataset_code: 'cvm' });
+  await client.rpc('persist_batch', { p_records: [], p_dataset_code: 'cvm' });
+
+  const catalogLookups = queries.filter((query) => query.sql.includes('information_schema.routines'));
+  assert.equal(catalogLookups.length, 1);
+  const [first, second] = statements(queries);
+  assert.match(first.sql, /public\."persist_batch"\("p_records" => \$1, "p_dataset_code" => \$2\)/);
+  assert.deepEqual(first.values, ['[{"id":1}]', 'cvm']);
+  assert.deepEqual(second.values, ['[]', 'cvm']);
+});
+
+test('postgres adapter binds RPC arguments as placeholders and sets request claims', async () => {
+  const { pool, queries } = fakePool();
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', pool);
+
+  await client.rpcAsUser('save_review', { p_company_id: 'c1', p_notes: 'x' }, { id: 'u1', email: 'a@b.c' });
+  const claims = queries.find((query) => query.sql.includes('set_config('));
+  assert.deepEqual(claims?.values.slice(0, 2), ['u1', 'authenticated']);
+  assert.deepEqual(JSON.parse(String(claims?.values[2])), { sub: 'u1', email: 'a@b.c', role: 'authenticated' });
+  const [call] = statements(queries);
+  // Regression: arguments were rendered as literal integers (`=> 1`), so every
+  // RPC with arguments failed with "function … does not exist".
+  assert.match(call.sql, /"p_company_id" => \$1, "p_notes" => \$2/);
+  assert.deepEqual(call.values, ['c1', 'x']);
+});
+
+test('postgres adapter falls back to native encoding when the catalog lookup fails', async () => {
+  const { pool, queries } = fakePool({ failCatalog: true });
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', pool);
+
+  await client.insert('demo', [{ id: 'c', tags: ['a'] }]);
+  await client.insert('demo', [{ id: 'd', tags: ['b'] }]);
+
+  // A failed lookup is retried on the next call rather than cached.
+  assert.equal(queries.filter((query) => query.sql.includes('information_schema.columns')).length, 2);
+  assert.deepEqual(statements(queries)[0].values, ['c', ['a']]);
+});
+
+test('postgres adapter writes rows with different shapes atomically without forcing NULLs', async () => {
+  const { pool, queries } = fakePool();
+  const transactional = Object.assign(pool as object, {
+    async connect() {
+      return { query: (pool as any).query, release() { queries.push({ sql: 'release', values: [] }); } };
+    },
+  });
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', transactional as never);
+
+  await client.upsert('demo', [
+    { id: '1', name: 'a', metadata: undefined },
+    { id: '2', name: 'b', metadata: { x: 1 } },
+    { id: '3', name: 'c' },
+  ], 'id');
+
+  const sql = statements(queries).map((query) => query.sql.replace(/\s+/g, ' ').trim());
+  assert.equal(sql[0], 'begin');
+  assert.match(sql[1], /^insert into public\."demo" \("id", "name"\) values \(\$1, \$2\), \(\$3, \$4\) on conflict \("id"\) do update set "name" = excluded\."name"/);
+  assert.match(sql[2], /^insert into public\."demo" \("id", "metadata", "name"\) values \(\$1, \$2, \$3\)/);
+  assert.equal(sql[3], 'commit');
+  assert.equal(sql[4], 'release');
+});
+
+test('postgres adapter update skips undefined keys but keeps explicit nulls', async () => {
+  const { pool, queries } = fakePool();
+  const { NeonPostgresClient } = await import('./postgres.js');
+  const client = new NeonPostgresClient('postgres://unused', pool);
+
+  await client.update('tasks', { title: undefined, description: null, status: 'done' }, [{ column: 'id', value: 't1' }]);
+  const [update] = statements(queries);
+  assert.match(update.sql, /set "description" = \$1, "status" = \$2 where "id" = \$3/);
+  assert.deepEqual(update.values, [null, 'done', 't1']);
+});
diff --git a/backend/src/lib/postgres.ts b/backend/src/lib/postgres.ts
index 52e982633f974f88cac7af6e46fcc631e46caf9f..9c213f2e7bd82987e8e234b7c9068c3e4d90e3cf 100644
--- a/backend/src/lib/postgres.ts
+++ b/backend/src/lib/postgres.ts
@@ -1,4 +1,4 @@
-import { Pool } from 'pg';
+import { Pool, type QueryResult } from 'pg';
 
 export type QueryOptions = {
   select?: string;
@@ -74,8 +74,32 @@ const buildWhere = (filters: FilterDefinition[] = [], startAt = 1) => {
   };
 };
 
-const unionColumns = (rows: Record<string, unknown>[]) => (
-  [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
+// JSON semantics (what PostgREST received): a key whose value is `undefined` is
+// absent, so the column keeps its database default on insert and is left
+// untouched on update/upsert instead of being forced to NULL.
+const withoutUndefined = (row: Record<string, unknown>) => Object.fromEntries(
+  Object.entries(row).filter(([, value]) => value !== undefined),
+);
+
+const shapeKey = (row: Record<string, unknown>) => Object.keys(row).sort().join(',');
+
+// Rows with different key sets are written in separate statements so a column
+// missing from one row never becomes an explicit NULL (which breaks NOT NULL
+// DEFAULT columns and, on upsert, would wipe the stored value).
+const groupByShape = (rows: Record<string, unknown>[]) => {
+  const groups = new Map<string, Record<string, unknown>[]>();
+  for (const row of rows) {
+    const key = shapeKey(row);
+    if (!key) continue;
+    const group = groups.get(key);
+    if (group) group.push(row);
+    else groups.set(key, [row]);
+  }
+  return [...groups.values()];
+};
+
+const isPlainRow = (row: unknown): row is Record<string, unknown> => (
+  Boolean(row && typeof row === 'object' && !Array.isArray(row))
 );
 
 const dedupeByConflict = (rows: Record<string, unknown>[], conflictColumns: string[]) => {
@@ -92,11 +116,53 @@ const dedupeByConflict = (rows: Record<string, unknown>[], conflictColumns: stri
   return [...map.values()];
 };
 
+type QueryClient = Pick<Pool, 'query'>;
+type Queryable = QueryClient & {
+  connect?: () => Promise<QueryClient & { release: (error?: Error | boolean) => void }>;
+  end?: () => Promise<void>;
+};
+
+/**
+ * node-postgres serializes JS arrays as Postgres array literals (`{a,b}`) and
+ * passes strings through untouched. Both are wrong for json/jsonb targets:
+ * `['a']` becomes the invalid JSON `{"a"}`, `[]` silently becomes the object
+ * `{}` and a plain string such as `FIDC` is rejected as invalid JSON. PostgREST
+ * (the previous Supabase data plane) always sent JSON, so callers rely on JSON
+ * semantics. Values bound to json/jsonb columns or RPC parameters are therefore
+ * JSON-encoded explicitly; everything else (text[], uuid[], scalars) keeps the
+ * native node-postgres encoding.
+ */
+const toParam = (value: unknown, json: boolean) => {
+  if (value === undefined || value === null) return null;
+  return json ? JSON.stringify(value) : value;
+};
+
+const JSON_COLUMNS_SQL = `
+  select column_name
+  from information_schema.columns
+  where table_schema = 'public'
+    and table_name = $1
+    and data_type in ('json', 'jsonb')`;
+
+const JSON_PARAMS_SQL = `
+  select distinct p.parameter_name
+  from information_schema.routines r
+  join information_schema.parameters p
+    on p.specific_schema = r.specific_schema
+   and p.specific_name = r.specific_name
+  where r.routine_schema = 'public'
+    and r.routine_name = $1
+    and p.parameter_mode in ('IN', 'INOUT')
+    and p.parameter_name is not null
+    and p.data_type in ('json', 'jsonb')`;
+
 export class NeonPostgresClient {
-  private readonly pool: Pool;
+  private readonly pool: Queryable;
+  private readonly jsonColumnCache = new Map<string, Promise<Set<string>>>();
+  private readonly jsonParamCache = new Map<string, Promise<Set<string>>>();
 
-  constructor(connectionString: string) {
-    this.pool = new Pool({
+  constructor(connectionString: string, pool?: Queryable) {
+    this.pool = pool ?? new Pool({
       connectionString,
       max: 5,
       idleTimeoutMillis: 30_000,
@@ -105,6 +171,39 @@ export class NeonPostgresClient {
     });
   }
 
+  private cachedNameSet(cache: Map<string, Promise<Set<string>>>, key: string, sql: string, column: string) {
+    const cached = cache.get(key);
+    if (cached) return cached;
+    const loading = this.pool.query(sql, [key])
+      .then((result) => new Set(result.rows.map((row) => String(row[column]))))
+      .catch((error: unknown) => {
+        // Never cache a failed catalog lookup; the next call retries it.
+        cache.delete(key);
+        throw error;
+      });
+    cache.set(key, loading);
+    return loading;
+  }
+
+  // A failed catalog lookup degrades to the native encoding (the pre-existing
+  // behaviour) instead of failing the write itself; the real statement still
+  // surfaces any connectivity error.
+  /** json/jsonb column names of `public.<table>` (cached per table for the pool lifetime). */
+  private jsonColumns(table: string) {
+    return this.cachedNameSet(this.jsonColumnCache, table, JSON_COLUMNS_SQL, 'column_name')
+      .catch(() => new Set<string>());
+  }
+
+  /** json/jsonb IN parameter names of `public.<fn>` across all overloads. */
+  private jsonParams(fn: string) {
+    return this.cachedNameSet(this.jsonParamCache, fn, JSON_PARAMS_SQL, 'parameter_name')
+      .catch(() => new Set<string>());
+  }
+
+  async close() {
+    await this.pool.end?.();
+  }
+
   async select(table: string, options: QueryOptions = {}) {
     const selected = selectList(options.select);
     const where = buildWhere(options.filters);
@@ -119,32 +218,71 @@ export class NeonPostgresClient {
     return result.rows;
   }
 
-  async insert(table: string, inputRows: unknown[]) {
-    const rows = inputRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
-    if (!rows.length) return [];
-    const columns = unionColumns(rows);
-    if (!columns.length) return [];
-
-    const values: unknown[] = [];
-    const tuples = rows.map((row) => {
-      const placeholders = columns.map((column) => {
-        values.push(row[column] ?? null);
-        return `$${values.length}`;
+  private async writeRows(table: string, rows: Record<string, unknown>[], conflictColumns: string[] | null) {
+    const groups = groupByShape(rows);
+    if (!groups.length) return [];
+    const jsonColumns = await this.jsonColumns(table);
+
+    const statements = groups.map((group) => {
+      const columns = Object.keys(group[0]).sort();
+      const values: unknown[] = [];
+      const tuples = group.map((row) => {
+        const placeholders = columns.map((column) => {
+          values.push(toParam(row[column], jsonColumns.has(column)));
+          return `$${values.length}`;
+        });
+        return `(${placeholders.join(', ')})`;
       });
-      return `(${placeholders.join(', ')})`;
-    });
 
-    const result = await this.pool.query(
-      `insert into public.${ident(table)} (${columns.map(ident).join(', ')})
-       values ${tuples.join(', ')}
+      let conflictSql = '';
+      if (conflictColumns?.length) {
+        const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
+        conflictSql = ` on conflict (${conflictColumns.map(ident).join(', ')}) ${updateColumns.length
+          ? `do update set ${updateColumns.map((column) => `${ident(column)} = excluded.${ident(column)}`).join(', ')}`
+          : 'do nothing'}`;
+      }
+
+      return {
+        sql: `insert into public.${ident(table)} (${columns.map(ident).join(', ')})
+       values ${tuples.join(', ')}${conflictSql}
        returning *`,
-      values,
-    );
-    return result.rows;
+        values,
+      };
+    });
+
+    if (statements.length === 1 || !this.pool.connect) {
+      const output: Record<string, unknown>[] = [];
+      for (const statement of statements) {
+        output.push(...(await this.pool.query(statement.sql, statement.values)).rows);
+      }
+      return output;
+    }
+
+    // Several shapes: keep the call atomic, as a single multi-row INSERT was.
+    const connection = await this.pool.connect();
+    try {
+      await connection.query('begin');
+      const output: Record<string, unknown>[] = [];
+      for (const statement of statements) {
+        output.push(...(await connection.query(statement.sql, statement.values)).rows);
+      }
+      await connection.query('commit');
+      return output;
+    } catch (error) {
+      await connection.query('rollback').catch(() => undefined);
+      throw error;
+    } finally {
+      connection.release();
+    }
+  }
+
+  async insert(table: string, inputRows: unknown[]) {
+    const rows = inputRows.filter(isPlainRow).map(withoutUndefined);
+    return this.writeRows(table, rows, null);
   }
 
   async upsert(table: string, inputRows: unknown[], onConflict?: string) {
-    const rows = inputRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
+    const rows = inputRows.filter(isPlainRow).map(withoutUndefined);
     if (!rows.length) return [];
 
     const conflictColumns = String(onConflict ?? '')
@@ -153,38 +291,15 @@ export class NeonPostgresClient {
       .filter(Boolean);
     conflictColumns.forEach(ident);
 
-    const deduped = dedupeByConflict(rows, conflictColumns);
-    const columns = unionColumns(deduped);
-    const values: unknown[] = [];
-    const tuples = deduped.map((row) => {
-      const placeholders = columns.map((column) => {
-        values.push(row[column] ?? null);
-        return `$${values.length}`;
-      });
-      return `(${placeholders.join(', ')})`;
-    });
-
-    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
-    const conflictSql = conflictColumns.length
-      ? ` on conflict (${conflictColumns.map(ident).join(', ')}) ${updateColumns.length
-          ? `do update set ${updateColumns.map((column) => `${ident(column)} = excluded.${ident(column)}`).join(', ')}`
-          : 'do nothing'}`
-      : '';
-
-    const result = await this.pool.query(
-      `insert into public.${ident(table)} (${columns.map(ident).join(', ')})
-       values ${tuples.join(', ')}
-       ${conflictSql}
-       returning *`,
-      values,
-    );
-    return result.rows;
+    return this.writeRows(table, dedupeByConflict(rows, conflictColumns), conflictColumns);
   }
 
   async update(table: string, payload: Record<string, unknown>, filters: FilterDefinition[]) {
-    const columns = Object.keys(payload).sort();
+    const defined = withoutUndefined(payload);
+    const columns = Object.keys(defined).sort();
     if (!columns.length) return [];
-    const values = columns.map((column) => payload[column]);
+    const jsonColumns = await this.jsonColumns(table);
+    const values = columns.map((column) => toParam(defined[column], jsonColumns.has(column)));
     const setSql = columns.map((column, index) => `${ident(column)} = $${index + 1}`).join(', ');
     const where = buildWhere(filters, values.length + 1);
     const result = await this.pool.query(
@@ -209,86 +324,66 @@ export class NeonPostgresClient {
     return result.rows as T[];
   }
 
-  async rpcAsUser<T = unknown>(
-    fn: string,
-    args: Record<string, unknown>,
-    identity: { id: string; email?: string; role?: string },
-  ) {
+  /**
+   * Calls `public.<fn>` inside a transaction with request.jwt.* claims set, so
+   * functions ported from Supabase that read `auth.uid()`/role claims keep
+   * working. Arguments are bound as `$n` placeholders (never interpolated) and
+   * json/jsonb parameters are JSON-encoded.
+   */
+  private async callFunction<T>(fn: string, args: Record<string, unknown>, claims: Record<string, string | null>) {
     const fnName = ident(fn);
     const entries = Object.entries(args);
     entries.forEach(([name]) => ident(name));
-    const values = entries.map(([, value]) => value);
-    const namedArgs = entries.map(([name], index) => `${ident(name)} => ${index + 1}`).join(', ');
-    const client = await this.pool.connect();
+    const jsonParams = entries.length ? await this.jsonParams(fn) : new Set<string>();
+    const values = entries.map(([name, value]) => toParam(value, jsonParams.has(name)));
+    const namedArgs = entries.map(([name], index) => `${ident(name)} => $${index + 1}`).join(', ');
 
-    try {
-      await client.query('begin');
-      await client.query(
+    const runInTransaction = async (connection: QueryClient): Promise<QueryResult> => {
+      await connection.query(
         `select
            set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claim.role', $2, true),
            set_config('request.jwt.claims', $3, true)`,
-        [
-          identity.id,
-          identity.role ?? 'authenticated',
-          JSON.stringify({
-            sub: identity.id,
-            email: identity.email ?? null,
-            role: identity.role ?? 'authenticated',
-          }),
-        ],
+        [claims.sub ?? '', claims.role ?? '', JSON.stringify(claims)],
       );
-      const result = await client.query(
-        `select * from public.${fnName}(${namedArgs})`,
-        values,
-      );
-      await client.query('commit');
-
-      if (result.fields.length === 1 && result.fields[0]?.name === fn) {
-        if (result.rows.length === 1) return result.rows[0][fn] as T;
-        return result.rows.map((row) => row[fn]) as T;
+      return connection.query(`select * from public.${fnName}(${namedArgs})`, values);
+    };
+
+    let result: QueryResult;
+    if (!this.pool.connect) {
+      result = await runInTransaction(this.pool);
+    } else {
+      const connection = await this.pool.connect();
+      try {
+        await connection.query('begin');
+        result = await runInTransaction(connection);
+        await connection.query('commit');
+      } catch (error) {
+        await connection.query('rollback').catch(() => undefined);
+        throw error;
+      } finally {
+        connection.release();
       }
-      return result.rows as T;
-    } catch (error) {
-      await client.query('rollback').catch(() => undefined);
-      throw error;
-    } finally {
-      client.release();
     }
-  }
 
-  async rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
-    const fnName = ident(fn);
-    const entries = Object.entries(args);
-    entries.forEach(([name]) => ident(name));
-    const values = entries.map(([, value]) => value);
-    const namedArgs = entries.map(([name], index) => `${ident(name)} => ${index + 1}`).join(', ');
-    const client = await this.pool.connect();
+    if (result.fields.length === 1 && result.fields[0]?.name === fn) {
+      if (result.rows.length === 1) return result.rows[0][fn] as T;
+      return result.rows.map((row) => row[fn]) as T;
+    }
+    return result.rows as T;
+  }
 
-    try {
-      await client.query('begin');
-      await client.query(
-        `select
-           set_config('request.jwt.claim.role', 'service_role', true),
-           set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
-      );
-      const result = await client.query(
-        `select * from public.${fnName}(${namedArgs})`,
-        values,
-      );
-      await client.query('commit');
+  async rpcAsUser<T = unknown>(
+    fn: string,
+    args: Record<string, unknown>,
+    identity: { id: string; email?: string; role?: string },
+  ) {
+    const role = identity.role ?? 'authenticated';
+    return this.callFunction<T>(fn, args, { sub: identity.id, email: identity.email ?? null, role });
+  }
 
-      if (result.fields.length === 1 && result.fields[0]?.name === fn) {
-        if (result.rows.length === 1) return result.rows[0][fn] as T;
-        return result.rows.map((row) => row[fn]) as T;
-      }
-      return result.rows as T;
-    } catch (error) {
-      await client.query('rollback').catch(() => undefined);
-      throw error;
-    } finally {
-      client.release();
-    }
+  async rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
+    return this.callFunction<T>(fn, args, { sub: null, role: 'service_role' });
   }
 
   async health() {
@@ -309,4 +404,4 @@ export const getNeonPostgresClient = (connectionString: string) => {
   return singleton;
 };
 
-export const __test = { ident, selectList, buildWhere, dedupeByConflict };
+export const __test = { ident, selectList, buildWhere, dedupeByConflict, toParam, groupByShape, withoutUndefined };
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-02.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/lib/postgres.test.ts
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
fix(neon): encode json/jsonb values correctly in NeonPostgresClient

Also fixes the RPC placeholders introduced in the Neon cutover: named
arguments were rendered as `p_x => 1`, `p_y => 2` (integer literals) instead of
`$1`, `$2`, so every rpc()/rpcAsUser() call with arguments sent constants
instead of the caller's values. Covered by postgres.test.ts.

node-postgres binds JS arrays as Postgres array literals and strings as raw
text. For json/jsonb targets that meant:
- ['a','b'] -> '{"a","b"}' -> "invalid input syntax for type json"
  (e.g. qualification_snapshots.pattern_summary, RPC p_records payloads);
- [] -> '{}' -> silently stored as an empty *object* (source_trace, evidence…);
- 'FIDC' -> invalid JSON (search_profile_filters.filter_value; the failure was
  swallowed, so no filter was ever persisted on Neon).

PostgREST always sent JSON, so callers rely on JSON semantics. The client now
looks up json/jsonb columns (information_schema.columns) and json/jsonb RPC
parameters (information_schema.parameters), caches the result per table/
function, and JSON-encodes only those values; text[]/uuid[] and scalars keep
the native encoding. A failed catalog lookup is not cached and degrades to the
previous behaviour.

Also aligned with PostgREST/JSON semantics:
- keys whose value is `undefined` are treated as absent (column default on
  insert, untouched on update) instead of being forced to NULL;
- rows with different key sets are written in separate statements inside one
  transaction, so a column missing from one row no longer becomes an explicit
  NULL (NOT NULL DEFAULT violations) or wipes stored values on upsert.

Verified against PostgreSQL 16 + pgvector with the db/neon schema applied:
before the fix qualification snapshots failed, source_trace [] became {} and 0
search profile filters were persisted; after it all repository writes
round-trip. New unit tests use an injected fake pool; the new integration test
runs only when MOTOR_TEST_POSTGRES_URL points at a disposable database.

Also fixes a regression from the Neon cutover branch: rpc()/rpcAsUser()
rendered arguments as literal integers (`"p_x" => 1` instead of `$1`), so every
RPC with arguments failed with "function … does not exist". Both now share one
callFunction() that binds `$n` placeholders, JSON-encodes jsonb parameters and
sets the request.jwt.* claims inside a transaction (verified on PostgreSQL 16).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
(cherry picked from commit f27a7d029babaaccf50183e52efe9caec4318052)
MSG
```


---

### Tarefa 03 — Auth: verificador JWT único e endurecido + exigência de perfil ativo nas rotas Express

**Por quê:** As rotas Express só validavam o JWT; um usuário `invited`/`disabled` podia obter token direto no Neon Auth e acessar dados. Havia dois verificadores JWT duplicados que aceitavam token sem `exp`. Novo `backend/src/lib/neonJwt.ts` (exige exp/nbf, amarra alg↔chave, seleção por kid com refresh do JWKS, curva EC correta). Também: handler final de erro em JSON, validação de `dueDate`, `/mvp-readiness` com o provedor real de auth.

**Arquivos alterados/criados:**

```
 backend/src/lib/auth.ts         |  77 ++++++------------------------------------------------------------
 backend/src/lib/neonJwt.test.ts | 139 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/lib/neonJwt.ts      | 188 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/server.ts           |  86 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 serverless/neon-auth.ts         | 147 +++++++++++++++++++----------------------------------------------------------------------------------------------------------
 5 files changed, 434 insertions(+), 203 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-03
diff --git a/backend/src/lib/auth.ts b/backend/src/lib/auth.ts
index 8e5b5ba6b89e39e089d1c1019854beb41d149e29..6c22a4d7bd6ed8ba10db53187153555cf813d886 100644
--- a/backend/src/lib/auth.ts
+++ b/backend/src/lib/auth.ts
@@ -1,7 +1,7 @@
 import type { NextFunction, Request, Response as ExpressResponse } from 'express';
 import { env } from './env.js';
+import { decodeBase64Url, verifyNeonAccessToken } from './neonJwt.js';
 
-type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
 export type AuthUser = { id: string; email?: string; role?: string; raw: Record<string, unknown> };
 export type AuthSession = {
   access_token: string;
@@ -24,8 +24,6 @@ declare global {
 
 export const AUTH_SESSION_COOKIE_NAME = 'motor_neon_session';
 const NEON_UPSTREAM_COOKIE_NAME = '__Secure-neon-auth.session_token';
-const encoder = new TextEncoder();
-let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;
 
 const requireAuthEnv = () => {
   if (!env.neonAuthBaseUrl || !env.neonAuthJwksUrl) {
@@ -33,12 +31,6 @@ const requireAuthEnv = () => {
   }
 };
 
-const decodeBase64Url = (value: string) => {
-  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
-  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
-  return Buffer.from(padded, 'base64');
-};
-
 const readJsonObject = async (response: globalThis.Response): Promise<Record<string, any>> => {
   const raw = await response.text();
   if (!raw.trim()) return {};
@@ -128,70 +120,13 @@ const buildSession = (
   };
 };
 
-const getNeonJwks = async () => {
-  requireAuthEnv();
-  if (jwksCache && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
-  const response = await fetch(env.neonAuthJwksUrl, {
-    headers: { Accept: 'application/json' },
-    signal: AbortSignal.timeout(8_000),
-  });
-  if (!response.ok) throw new Error(`Unable to load Neon Auth JWKS: ${response.status}`);
-  const payload = await readJsonObject(response) as { keys?: Jwk[] };
-  const keys = Array.isArray(payload.keys) ? payload.keys : [];
-  if (!keys.length) throw new Error('Neon Auth JWKS is empty.');
-  jwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys };
-  return keys;
-};
-
-const importVerificationKey = async (jwk: Jwk) => {
-  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
-    return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
-  }
-  if (jwk.kty === 'RSA') {
-    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
-  }
-  if (jwk.kty === 'EC') {
-    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
-  }
-  throw new Error(`Unsupported JWT key type: ${jwk.kty ?? 'unknown'}`);
-};
-
 export const verifyNeonJwt = async (token: string): Promise<AuthUser> => {
   requireAuthEnv();
-  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
-  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('Malformed token');
-
-  const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as { alg?: string; kid?: string };
-  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as Record<string, unknown>;
-  const expectedOrigin = new URL(env.neonAuthBaseUrl).origin;
-
-  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('Token expired');
-  if (payload.iss && payload.iss !== expectedOrigin) throw new Error('Invalid issuer');
-  if (payload.aud) {
-    const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud)];
-    if (!audiences.includes(expectedOrigin)) throw new Error('Invalid audience');
-  }
-
-  const jwks = await getNeonJwks();
-  const jwk = jwks.find((item) => item.kid === header.kid) ?? jwks[0];
-  if (!jwk) throw new Error('No JWKS available for verification');
-  if (header.alg === 'EdDSA' && !(jwk.kty === 'OKP' && jwk.crv === 'Ed25519')) {
-    throw new Error('JWT algorithm/key mismatch');
-  }
-
-  const key = await importVerificationKey(jwk);
-  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
-  const signature = decodeBase64Url(encodedSignature);
-  const verified = jwk.kty === 'OKP'
-    ? await crypto.subtle.verify('Ed25519', key, signature, data)
-    : jwk.kty === 'EC'
-      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data)
-      : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
-
-  if (!verified) throw new Error('Invalid token signature');
-  const user = mapAuthUser(payload);
-  if (!user.id) throw new Error('JWT subject is missing');
-  return user;
+  const claims = await verifyNeonAccessToken(token, {
+    authBaseUrl: env.neonAuthBaseUrl,
+    jwksUrl: env.neonAuthJwksUrl,
+  });
+  return { id: claims.id, email: claims.email, role: claims.role, raw: claims.payload };
 };
 
 export const readAuthSessionCookie = (req: Pick<Request, 'headers'>) => {
diff --git a/backend/src/lib/neonJwt.test.ts b/backend/src/lib/neonJwt.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4f41da78fe66329901243daf6ca57c8cea9adb86
--- /dev/null
+++ b/backend/src/lib/neonJwt.test.ts
@@ -0,0 +1,139 @@
+import assert from 'node:assert/strict';
+import test from 'node:test';
+import { NeonJwtError, resetNeonJwksCache, verifyNeonAccessToken } from './neonJwt.js';
+
+const AUTH_BASE_URL = 'https://ep-test.neonauth.example.tech/neondb/auth';
+const ISSUER = new URL(AUTH_BASE_URL).origin;
+const JWKS_URL = `${AUTH_BASE_URL}/.well-known/jwks.json`;
+const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
+
+const b64url = (value: string | Uint8Array) => (typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)).toString('base64url');
+
+type KeyKind = 'EdDSA' | 'RS256' | 'ES256';
+
+const generate = async (alg: KeyKind, kid: string) => {
+  const params = alg === 'EdDSA'
+    ? { name: 'Ed25519' }
+    : alg === 'RS256'
+      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
+      : { name: 'ECDSA', namedCurve: 'P-256' };
+  const pair = await crypto.subtle.generateKey(params as never, true, ['sign', 'verify']) as CryptoKeyPair;
+  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg };
+  const sign = async (header: Record<string, unknown>, payload: Record<string, unknown>) => {
+    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
+    const signParams = alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : params;
+    const signature = await crypto.subtle.sign(signParams as never, pair.privateKey, new TextEncoder().encode(signingInput));
+    return `${signingInput}.${b64url(new Uint8Array(signature))}`;
+  };
+  return { alg, kid, publicJwk, sign };
+};
+
+const claims = (overrides: Record<string, unknown> = {}) => ({
+  sub: 'user-1',
+  email: 'analyst@example.com',
+  iss: ISSUER,
+  aud: ISSUER,
+  exp: Math.floor(NOW / 1000) + 600,
+  ...overrides,
+});
+
+const jwksFetch = (keysByCall: unknown[][]) => {
+  let calls = 0;
+  const fetchImpl = (async () => {
+    const keys = keysByCall[Math.min(calls, keysByCall.length - 1)];
+    calls += 1;
+    return new Response(JSON.stringify({ keys }), { status: 200, headers: { 'content-type': 'application/json' } });
+  }) as typeof fetch;
+  return { fetchImpl, calls: () => calls };
+};
+
+const config = (fetchImpl: typeof fetch, now = NOW) => ({ authBaseUrl: AUTH_BASE_URL, jwksUrl: JWKS_URL, fetchImpl, now: () => now });
+
+const rejects = (promise: Promise<unknown>, message: RegExp, statusCode = 401) => assert.rejects(
+  promise,
+  (error: unknown) => error instanceof NeonJwtError && message.test(error.message) && error.statusCode === statusCode,
+);
+
+for (const alg of ['EdDSA', 'RS256', 'ES256'] as const) {
+  test(`verifies a valid ${alg} Neon Auth token`, async () => {
+    resetNeonJwksCache();
+    const key = await generate(alg, `kid-${alg}`);
+    const { fetchImpl } = jwksFetch([[key.publicJwk]]);
+    const token = await key.sign({ alg, kid: key.kid, typ: 'JWT' }, claims({ role: 'authenticated' }));
+    const verified = await verifyNeonAccessToken(token, config(fetchImpl));
+    assert.equal(verified.id, 'user-1');
+    assert.equal(verified.email, 'analyst@example.com');
+    assert.equal(verified.role, 'authenticated');
+  });
+}
+
+test('rejects tampered payloads, missing/expired expiry, wrong issuer/audience and alg none', async () => {
+  resetNeonJwksCache();
+  const key = await generate('EdDSA', 'kid-1');
+  const { fetchImpl } = jwksFetch([[key.publicJwk]]);
+  const header = { alg: 'EdDSA', kid: 'kid-1' };
+
+  const valid = await key.sign(header, claims());
+  const [h, , s] = valid.split('.');
+  await rejects(verifyNeonAccessToken(`${h}.${b64url(JSON.stringify(claims({ sub: 'attacker' })))}.${s}`, config(fetchImpl)), /signature/);
+
+  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ exp: undefined })), config(fetchImpl)), /expiry is missing/);
+  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ exp: Math.floor(NOW / 1000) - 3600 })), config(fetchImpl)), /expired/);
+  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ nbf: Math.floor(NOW / 1000) + 3600 })), config(fetchImpl)), /not valid yet/);
+  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ iss: 'https://evil.example' })), config(fetchImpl)), /issuer/);
+  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ aud: 'https://evil.example' })), config(fetchImpl)), /audience/);
+  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ sub: '' })), config(fetchImpl)), /subject/);
+  await rejects(verifyNeonAccessToken(`${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(claims()))}.x`, config(fetchImpl)), /algorithm/);
+  await rejects(verifyNeonAccessToken('not-a-jwt', config(fetchImpl)), /Malformed/);
+  await rejects(verifyNeonAccessToken('a.b.c', config(fetchImpl)), /Malformed token header/);
+});
+
+test('rejects an algorithm that does not match the selected key type', async () => {
+  resetNeonJwksCache();
+  const key = await generate('EdDSA', 'kid-1');
+  const { fetchImpl } = jwksFetch([[key.publicJwk]]);
+  const token = await key.sign({ alg: 'RS256', kid: 'kid-1' }, claims());
+  await rejects(verifyNeonAccessToken(token, config(fetchImpl)), /Unknown token signing key/);
+});
+
+test('refreshes the JWKS once when a rotated kid appears, then caches it', async () => {
+  resetNeonJwksCache();
+  const oldKey = await generate('EdDSA', 'old');
+  const newKey = await generate('EdDSA', 'new');
+  const jwks = jwksFetch([[oldKey.publicJwk], [oldKey.publicJwk, newKey.publicJwk]]);
+
+  await verifyNeonAccessToken(await oldKey.sign({ alg: 'EdDSA', kid: 'old' }, claims()), config(jwks.fetchImpl));
+  assert.equal(jwks.calls(), 1);
+
+  const rotated = await newKey.sign({ alg: 'EdDSA', kid: 'new' }, claims({ sub: 'user-2' }));
+  assert.equal((await verifyNeonAccessToken(rotated, config(jwks.fetchImpl))).id, 'user-2');
+  assert.equal(jwks.calls(), 2);
+
+  await verifyNeonAccessToken(rotated, config(jwks.fetchImpl));
+  assert.equal(jwks.calls(), 2);
+});
+
+test('does not hammer the JWKS endpoint for unknown kids within the cooldown', async () => {
+  resetNeonJwksCache();
+  const key = await generate('EdDSA', 'known');
+  const stranger = await generate('EdDSA', 'stranger');
+  const jwks = jwksFetch([[key.publicJwk]]);
+  const forged = await stranger.sign({ alg: 'EdDSA', kid: 'stranger' }, claims());
+
+  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl)), /Unknown token signing key/);
+  assert.equal(jwks.calls(), 2); // initial load + one forced refresh
+  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl)), /Unknown token signing key/);
+  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl, NOW + 30_000)), /Unknown token signing key/);
+  assert.equal(jwks.calls(), 2); // no further fetches inside the 60s cooldown
+  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl, NOW + 61_000)), /Unknown token signing key/);
+  assert.equal(jwks.calls(), 3);
+});
+
+test('reports JWKS/configuration outages as 503', async () => {
+  resetNeonJwksCache();
+  const key = await generate('EdDSA', 'kid-1');
+  const token = await key.sign({ alg: 'EdDSA', kid: 'kid-1' }, claims());
+  const failing = (async () => new Response('down', { status: 502 })) as typeof fetch;
+  await rejects(verifyNeonAccessToken(token, config(failing)), /Unable to load Neon Auth JWKS: 502/, 503);
+  await rejects(verifyNeonAccessToken(token, { authBaseUrl: '', jwksUrl: '' }), /not configured/, 503);
+});
diff --git a/backend/src/lib/neonJwt.ts b/backend/src/lib/neonJwt.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a4ed8b2241f812703997bb73ba8235dad9075794
--- /dev/null
+++ b/backend/src/lib/neonJwt.ts
@@ -0,0 +1,188 @@
+/**
+ * Single Neon Managed Auth access-token verifier, shared by the Express backend
+ * (backend/src/lib/auth.ts) and the standalone Vercel functions
+ * (serverless/neon-auth.ts). It is intentionally free of env/DB imports so both
+ * runtimes can pass their own configuration.
+ */
+type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
+
+export type NeonJwtConfig = {
+  /** Neon Auth base URL; its origin is the expected `iss`/`aud`. */
+  authBaseUrl: string;
+  jwksUrl: string;
+  fetchImpl?: typeof fetch;
+  now?: () => number;
+};
+
+export type NeonJwtClaims = {
+  id: string;
+  email?: string;
+  role: string;
+  payload: Record<string, unknown>;
+};
+
+export class NeonJwtError extends Error {
+  constructor(message: string, readonly statusCode = 401) {
+    super(message);
+    this.name = 'NeonJwtError';
+  }
+}
+
+const JWKS_TTL_MS = 60 * 60 * 1000;
+// A token signed by a key we have not seen triggers one JWKS refresh (key
+// rotation), but never more than once per minute per JWKS URL.
+const JWKS_FORCED_REFRESH_COOLDOWN_MS = 60 * 1000;
+const CLOCK_SKEW_SECONDS = 60;
+
+const encoder = new TextEncoder();
+const jwksCache = new Map<string, { expiresAt: number; keys: Jwk[] }>();
+const lastForcedRefreshAt = new Map<string, number>();
+
+export const resetNeonJwksCache = () => {
+  jwksCache.clear();
+  lastForcedRefreshAt.clear();
+};
+
+export const decodeBase64Url = (value: string) => {
+  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
+  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
+  return Buffer.from(padded, 'base64');
+};
+
+const decodeJsonSegment = (segment: string, label: string) => {
+  let parsed: unknown;
+  try {
+    parsed = JSON.parse(decodeBase64Url(segment).toString('utf8'));
+  } catch {
+    throw new NeonJwtError(`Malformed token ${label}.`);
+  }
+  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
+    throw new NeonJwtError(`Malformed token ${label}.`);
+  }
+  return parsed as Record<string, unknown>;
+};
+
+const fetchJwks = async (config: NeonJwtConfig, now: number) => {
+  const fetchImpl = config.fetchImpl ?? fetch;
+  let response: Response;
+  try {
+    response = await fetchImpl(config.jwksUrl, {
+      headers: { Accept: 'application/json' },
+      signal: AbortSignal.timeout(8_000),
+    });
+  } catch (error) {
+    throw new NeonJwtError(`Unable to load Neon Auth JWKS: ${error instanceof Error ? error.message : String(error)}`, 503);
+  }
+  if (!response.ok) throw new NeonJwtError(`Unable to load Neon Auth JWKS: ${response.status}`, 503);
+
+  let payload: unknown;
+  try {
+    payload = await response.json();
+  } catch {
+    throw new NeonJwtError('Neon Auth JWKS is not valid JSON.', 503);
+  }
+  const keys = Array.isArray((payload as { keys?: unknown })?.keys) ? (payload as { keys: Jwk[] }).keys : [];
+  if (!keys.length) throw new NeonJwtError('Neon Auth JWKS is empty.', 503);
+  jwksCache.set(config.jwksUrl, { expiresAt: now + JWKS_TTL_MS, keys });
+  return keys;
+};
+
+const loadJwks = async (config: NeonJwtConfig, now: number, forceRefresh = false) => {
+  const cached = jwksCache.get(config.jwksUrl);
+  if (cached && now < cached.expiresAt) {
+    if (!forceRefresh) return cached.keys;
+    const lastForced = lastForcedRefreshAt.get(config.jwksUrl);
+    if (lastForced !== undefined && now - lastForced < JWKS_FORCED_REFRESH_COOLDOWN_MS) return cached.keys;
+  }
+  if (forceRefresh) lastForcedRefreshAt.set(config.jwksUrl, now);
+  return fetchJwks(config, now);
+};
+
+type Verifier = {
+  importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
+  verifyParams: AlgorithmIdentifier | EcdsaParams;
+};
+
+const verifierFor = (alg: string, jwk: Jwk): Verifier | null => {
+  if (alg === 'EdDSA' && jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
+    return { importParams: { name: 'Ed25519' }, verifyParams: { name: 'Ed25519' } };
+  }
+  if (alg === 'RS256' && jwk.kty === 'RSA') {
+    return {
+      importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
+      verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
+    };
+  }
+  if (alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256') {
+    return { importParams: { name: 'ECDSA', namedCurve: 'P-256' }, verifyParams: { name: 'ECDSA', hash: 'SHA-256' } };
+  }
+  if (alg === 'ES384' && jwk.kty === 'EC' && jwk.crv === 'P-384') {
+    return { importParams: { name: 'ECDSA', namedCurve: 'P-384' }, verifyParams: { name: 'ECDSA', hash: 'SHA-384' } };
+  }
+  return null;
+};
+
+const selectKey = async (config: NeonJwtConfig, now: number, kid: string | undefined, alg: string) => {
+  const compatible = (keys: Jwk[]) => keys.find((key) => (kid ? key.kid === kid : true) && verifierFor(alg, key));
+  let jwk = compatible(await loadJwks(config, now));
+  if (!jwk && kid) jwk = compatible(await loadJwks(config, now, true));
+  if (!jwk) throw new NeonJwtError(kid ? 'Unknown token signing key.' : 'No compatible token signing key.');
+  return jwk;
+};
+
+const audiencesOf = (aud: unknown) => (Array.isArray(aud) ? aud.map(String) : [String(aud)]);
+
+export const verifyNeonAccessToken = async (token: string, config: NeonJwtConfig): Promise<NeonJwtClaims> => {
+  if (!config.authBaseUrl || !config.jwksUrl) {
+    throw new NeonJwtError('Neon Managed Auth environment is not configured. Set NEON_AUTH_BASE_URL.', 503);
+  }
+
+  const parts = String(token ?? '').split('.');
+  if (parts.length !== 3 || parts.some((part) => !part)) throw new NeonJwtError('Malformed token.');
+  const [encodedHeader, encodedPayload, encodedSignature] = parts;
+
+  const header = decodeJsonSegment(encodedHeader, 'header');
+  const payload = decodeJsonSegment(encodedPayload, 'payload');
+  const alg = typeof header.alg === 'string' ? header.alg : '';
+  if (!alg || alg === 'none') throw new NeonJwtError('Unsupported token algorithm.');
+
+  const now = (config.now ?? Date.now)();
+  const nowSeconds = now / 1000;
+  const expectedOrigin = new URL(config.authBaseUrl).origin;
+
+  if (typeof payload.exp !== 'number') throw new NeonJwtError('Token expiry is missing.');
+  if (payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new NeonJwtError('Token expired.');
+  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > nowSeconds) {
+    throw new NeonJwtError('Token is not valid yet.');
+  }
+  if (payload.iss !== undefined && payload.iss !== expectedOrigin) throw new NeonJwtError('Invalid token issuer.');
+  if (payload.aud !== undefined && !audiencesOf(payload.aud).includes(expectedOrigin)) {
+    throw new NeonJwtError('Invalid token audience.');
+  }
+
+  const jwk = await selectKey(config, now, typeof header.kid === 'string' ? header.kid : undefined, alg);
+  const verifier = verifierFor(alg, jwk)!;
+  let verified = false;
+  try {
+    const key = await crypto.subtle.importKey('jwk', jwk, verifier.importParams, false, ['verify']);
+    verified = await crypto.subtle.verify(
+      verifier.verifyParams,
+      key,
+      decodeBase64Url(encodedSignature),
+      encoder.encode(`${encodedHeader}.${encodedPayload}`),
+    );
+  } catch {
+    verified = false;
+  }
+  if (!verified) throw new NeonJwtError('Invalid token signature.');
+
+  const id = typeof payload.sub === 'string' ? payload.sub : '';
+  if (!id) throw new NeonJwtError('JWT subject is missing.');
+
+  return {
+    id,
+    email: typeof payload.email === 'string' ? payload.email : undefined,
+    role: typeof payload.role === 'string' ? payload.role : 'authenticated',
+    payload,
+  };
+};
diff --git a/backend/src/server.ts b/backend/src/server.ts
index dd53ca162fcb0f87a1802396830c86ce0884f8e7..a9eab3e0effd7485fe0281031c16a2f93b76ad68 100644
--- a/backend/src/server.ts
+++ b/backend/src/server.ts
@@ -30,8 +30,6 @@ import {
 } from './lib/userProfiles.js';
 import { env } from './lib/env.js';
 import { getBuildInfo } from './lib/buildInfo.js';
-import { discoveryHitToCandidateDraft } from './lib/candidatePromotion.js';
-import { runSearchProfileDiscovery } from './lib/discoveryCapture.js';
 import { createPlatformRepository } from './repositories/platformRepository.js';
 import { asOwner, isActivityStatus, isActivityType, isPipelineStage, isTaskStatus } from './lib/crm.js';
 import { getMaisRetornoQuotaStatus, quotaEnvelopeStatus } from './lib/maisRetorno.js';
@@ -67,17 +65,28 @@ const wrap = (handler: express.Handler): express.Handler => async (req, res, nex
   try {
     await Promise.resolve(handler(req, res, next));
   } catch (error) {
-    console.error(error);
     const candidateStatus = error && typeof error === 'object' && 'statusCode' in error
       ? Number((error as { statusCode?: unknown }).statusCode)
       : 500;
     const statusCode = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
       ? candidateStatus
       : 500;
+    // Expected 4xx rejections (auth, validation) are not server faults; keep the
+    // logs for real failures.
+    if (statusCode >= 500) console.error(error);
+    else console.warn(`[motor-backend] ${req.method} ${req.path} -> ${statusCode}: ${error instanceof Error ? error.message : String(error)}`);
     res.status(statusCode).json(fail(statusCode, error instanceof Error ? error.message : 'Unexpected error'));
   }
 };
 const assertNonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
+// null/'' clear the date; a parseable date is normalized to ISO; anything else
+// returns undefined so the route can answer 400 instead of a database 500.
+const parseOptionalDate = (value: unknown): string | null | undefined => {
+  if (value === null || value === undefined || value === '') return null;
+  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
+  const timestamp = new Date(value).getTime();
+  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
+};
 
 await service.bootstrap().catch((error) => {
   console.warn('Bootstrap warning:', error instanceof Error ? error.message : error);
@@ -222,6 +231,35 @@ app.post('/auth/logout', wrap(async (req, res) => {
 }));
 
 app.use(authMiddleware);
+
+// A valid Neon Auth JWT only proves identity. Access to platform data also
+// requires an *active* application profile — otherwise an invited or disabled
+// user could mint a token directly at Neon Auth and call every route below.
+// Mirrors serverless/neon-auth.ts (verifyActiveIdentity). Positive results are
+// cached briefly per warm instance to avoid a profile lookup on every request.
+const ACTIVE_PROFILE_CACHE_MS = 30_000;
+const activeProfileCache = new Map<string, number>();
+app.use(wrap(async (req, _res, next) => {
+  if (!env.usePersistentData) {
+    next();
+    return;
+  }
+  const userId = req.authUser!.id;
+  const now = Date.now();
+  if ((activeProfileCache.get(userId) ?? 0) > now) {
+    next();
+    return;
+  }
+  const profile = await getUserProfileById(userId);
+  if (!profile || profile.status !== 'active') {
+    activeProfileCache.delete(userId);
+    throw Object.assign(new Error('Este acesso está desativado ou ainda não foi aprovado.'), { statusCode: 403 });
+  }
+  if (activeProfileCache.size > 1_000) activeProfileCache.clear();
+  activeProfileCache.set(userId, now + ACTIVE_PROFILE_CACHE_MS);
+  next();
+}));
+
 app.use('/ai', createAiRouter(service));
 app.use('/abm', createAbmWarRoomRouter());
 app.use('/watchlists', createWatchlistRouter(repository));
@@ -646,6 +684,11 @@ app.post('/activities', wrap(async (req, res) => {
     res.status(400).json(fail(400, `Invalid activity status: ${rawStatus}`));
     return;
   }
+  const activityDueDate = parseOptionalDate(req.body?.dueDate ?? req.body?.due_date);
+  if (activityDueDate === undefined) {
+    res.status(400).json(fail(400, 'dueDate must be a valid ISO date.'));
+    return;
+  }
   const created = await service.saveActivity({
     companyId,
     type: rawType,
@@ -653,7 +696,7 @@ app.post('/activities', wrap(async (req, res) => {
     description: String(req.body?.description ?? ''),
     owner: asOwner(req.body?.owner ?? 'Unknown'),
     status: rawStatus,
-    dueDate: req.body?.dueDate ?? req.body?.due_date ?? null,
+    dueDate: activityDueDate,
   });
   res.status(201).json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: created }));
 }));
@@ -676,13 +719,18 @@ app.post('/tasks', wrap(async (req, res) => {
     res.status(400).json(fail(400, `Invalid task status: ${rawStatus}`));
     return;
   }
+  const taskDueDate = parseOptionalDate(req.body?.dueDate ?? req.body?.due_date);
+  if (taskDueDate === undefined) {
+    res.status(400).json(fail(400, 'dueDate must be a valid ISO date.'));
+    return;
+  }
   const created = await service.saveTask({
     companyId,
     title,
     description: String(req.body?.description ?? ''),
     owner: asOwner(req.body?.owner ?? 'Unknown'),
     status: rawStatus,
-    dueDate: req.body?.dueDate ?? req.body?.due_date ?? null,
+    dueDate: taskDueDate,
   });
   res.status(201).json(ok(crmRuntimeMode, { mode: crmRuntimeMode, item: created }));
 }));
@@ -695,12 +743,19 @@ app.patch('/tasks/:id', wrap(async (req, res) => {
     res.status(400).json(fail(400, 'title cannot be empty.'));
     return;
   }
+  // `in` instead of `??`: an explicit `dueDate: null` must clear the date.
+  const rawDueDate = req.body && 'dueDate' in req.body ? req.body.dueDate : req.body?.due_date;
+  const patchedDueDate = rawDueDate === undefined ? undefined : parseOptionalDate(rawDueDate);
+  if (rawDueDate !== undefined && patchedDueDate === undefined) {
+    res.status(400).json(fail(400, 'dueDate must be a valid ISO date.'));
+    return;
+  }
   const updated = await service.updateTask(param(req.params.id), {
     title: req.body?.title,
     description: req.body?.description,
     owner: req.body?.owner ? asOwner(req.body.owner) : undefined,
     status: req.body?.status,
-    dueDate: req.body?.dueDate ?? req.body?.due_date,
+    dueDate: patchedDueDate,
   });
   if (!updated) {
     res.status(404).json(fail(404, 'Task not found.'));
@@ -718,7 +773,7 @@ app.get('/mvp-readiness', wrap(async (_req, res) => {
   const [dashboard, sources, pipelineRows] = await Promise.all([service.getDashboard(), service.listSources(), service.listPipelineRows()]);
   const degradedSources = sources.filter((source) => source.health !== 'healthy').length;
   res.json(ok(platformMode, {
-    auth: { status: 'real', provider: 'supabase' },
+    auth: { status: env.authProvider === 'none' ? 'partial' : 'real', provider: env.authProvider },
     database: { status: env.usePersistentData ? 'real' : 'partial', mode: env.dataProvider },
     sources: { total: sources.length, degraded: degradedSources, status: degradedSources ? 'attention' : 'healthy' },
     monitoring: { outputs24h: dashboard.monitoring.outputs24h, triggers24h: dashboard.monitoring.triggers24h, status: dashboard.monitoring.outputs24h > 0 ? 'active' : 'idle' },
@@ -770,6 +825,23 @@ app.get('/platform/status', wrap(async (_req, res) => res.json(ok(platformMode,
   persistence: platformMode,
 }))));
 
+// Final error handler: malformed JSON bodies (express.json) and any error that
+// escapes a route must still produce the platform JSON envelope, never
+// Express' default HTML page.
+app.use(((error, _req, res, next) => {
+  if (res.headersSent) {
+    next(error);
+    return;
+  }
+  const candidate = Number((error as { statusCode?: unknown; status?: unknown })?.statusCode ?? (error as { status?: unknown })?.status);
+  const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
+  if (statusCode >= 500) console.error(error);
+  const message = statusCode === 400 && (error as { type?: unknown })?.type === 'entity.parse.failed'
+    ? 'Invalid JSON body.'
+    : error instanceof Error ? error.message : 'Unexpected error';
+  res.status(statusCode).json(fail(statusCode, message));
+}) as express.ErrorRequestHandler);
+
 // ── Exportação para Vercel serverless ──────────────────────────────────────
 export { app };
 
diff --git a/serverless/neon-auth.ts b/serverless/neon-auth.ts
index 92432648c7e5f26afe048e59d4f219ce0053ac57..85c37e755ff7cb609d8b8c095f94a4499fece6c3 100644
--- a/serverless/neon-auth.ts
+++ b/serverless/neon-auth.ts
@@ -1,6 +1,10 @@
-import { Pool } from 'pg';
+// Vercel bundles api/ and serverless/ as CommonJS while backend/ is an ESM
+// package, so backend modules are loaded with dynamic import() (a static import
+// would compile to require() of an ES module). Node caches them after the first
+// request of a warm instance.
+const loadVerifier = () => import('../backend/src/lib/neonJwt.js');
+const loadPostgres = () => import('../backend/src/lib/postgres.js');
 
-type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
 type NeonUser = {
   id: string;
   email?: string;
@@ -17,12 +21,8 @@ type NeonIdentity = {
   profile: NeonProfile;
 };
 
-const encoder = new TextEncoder();
-let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;
-let pool: Pool | null = null;
-let poolUrl = '';
-
-const authBaseUrl = () => String(process.env.NEON_AUTH_BASE_URL ?? '').replace(/\/$/, '');
+// Read at call time (not module load) so Vercel env changes and tests apply.
+const authBaseUrl = () => String(process.env.NEON_AUTH_BASE_URL ?? '').trim().replace(/\/$/, '');
 const jwksUrl = () => String(process.env.NEON_AUTH_JWKS_URL ?? (
   authBaseUrl() ? `${authBaseUrl()}/.well-known/jwks.json` : ''
 )).trim();
@@ -33,127 +33,24 @@ const databaseUrl = () => (
   || ''
 ).trim();
 
-const getPool = () => {
-  const url = databaseUrl();
-  if (!url) throw Object.assign(new Error('Neon database is not configured.'), { statusCode: 503 });
-  if (!pool || poolUrl !== url) {
-    pool = new Pool({
-      connectionString: url,
-      max: 2,
-      idleTimeoutMillis: 30_000,
-      connectionTimeoutMillis: 8_000,
-      application_name: 'motor-serverless-auth',
-    });
-    poolUrl = url;
-  }
-  return pool;
-};
-
-const decodeBase64Url = (value: string) => {
-  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
-  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
-  return Buffer.from(padded, 'base64');
-};
-
-const readJson = async (response: Response) => {
-  const text = await response.text();
-  if (!text.trim()) return {};
-  try {
-    const parsed = JSON.parse(text) as unknown;
-    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
-      ? parsed as Record<string, unknown>
-      : {};
-  } catch {
-    return {};
-  }
-};
-
-const getJwks = async () => {
-  const url = jwksUrl();
-  if (!url) throw Object.assign(new Error('Neon Auth JWKS is not configured.'), { statusCode: 503 });
-  if (jwksCache && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
-
-  const response = await fetch(url, {
-    headers: { Accept: 'application/json' },
-    signal: AbortSignal.timeout(8_000),
-  });
-  if (!response.ok) throw Object.assign(new Error(`Unable to load Neon Auth JWKS: ${response.status}`), { statusCode: 503 });
-  const payload = await readJson(response) as { keys?: Jwk[] };
-  const keys = Array.isArray(payload.keys) ? payload.keys : [];
-  if (!keys.length) throw Object.assign(new Error('Neon Auth JWKS is empty.'), { statusCode: 503 });
-  jwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys };
-  return keys;
-};
-
-const importVerificationKey = async (jwk: Jwk) => {
-  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
-    return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
-  }
-  if (jwk.kty === 'RSA') {
-    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
-  }
-  if (jwk.kty === 'EC') {
-    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
-  }
-  throw Object.assign(new Error(`Unsupported JWT key type: ${jwk.kty ?? 'unknown'}`), { statusCode: 401 });
-};
-
-const verifyJwt = async (token: string) => {
-  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
-  if (!encodedHeader || !encodedPayload || !encodedSignature) {
-    throw Object.assign(new Error('Malformed token.'), { statusCode: 401 });
-  }
-
-  const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as { alg?: string; kid?: string };
-  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as Record<string, unknown>;
-  const base = authBaseUrl();
-  if (!base) throw Object.assign(new Error('Neon Auth is not configured.'), { statusCode: 503 });
-  const expectedOrigin = new URL(base).origin;
-
-  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
-    throw Object.assign(new Error('Token expired.'), { statusCode: 401 });
-  }
-  if (payload.iss && payload.iss !== expectedOrigin) {
-    throw Object.assign(new Error('Invalid token issuer.'), { statusCode: 401 });
-  }
-  if (payload.aud) {
-    const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud)];
-    if (!audiences.includes(expectedOrigin)) {
-      throw Object.assign(new Error('Invalid token audience.'), { statusCode: 401 });
-    }
-  }
-
-  const keys = await getJwks();
-  const jwk = keys.find((item) => item.kid === header.kid) ?? keys[0];
-  if (!jwk) throw Object.assign(new Error('No Auth verification key is available.'), { statusCode: 503 });
-
-  const key = await importVerificationKey(jwk);
-  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
-  const signature = decodeBase64Url(encodedSignature);
-  const verified = jwk.kty === 'OKP'
-    ? await crypto.subtle.verify('Ed25519', key, signature, data)
-    : jwk.kty === 'EC'
-      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data)
-      : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
-
-  if (!verified) throw Object.assign(new Error('Invalid token signature.'), { statusCode: 401 });
-
-  const id = typeof payload.sub === 'string' ? payload.sub : '';
-  if (!id) throw Object.assign(new Error('JWT subject is missing.'), { statusCode: 401 });
-  return {
-    id,
-    email: typeof payload.email === 'string' ? payload.email : undefined,
-    role: typeof payload.role === 'string' ? payload.role : 'authenticated',
-  };
+const verifyJwt = async (token: string): Promise<NeonUser> => {
+  const { verifyNeonAccessToken } = await loadVerifier();
+  const claims = await verifyNeonAccessToken(token, { authBaseUrl: authBaseUrl(), jwksUrl: jwksUrl() });
+  return { id: claims.id, email: claims.email, role: claims.role };
 };
 
 export const verifyActiveIdentity = async (accessToken: string): Promise<NeonIdentity> => {
   const user = await verifyJwt(accessToken);
-  const result = await getPool().query(
-    'select role, status from public.user_profiles where id = $1 limit 1',
-    [user.id],
-  );
-  const profile = result.rows[0] as { role?: string; status?: string } | undefined;
+  const { getNeonPostgresClient } = await loadPostgres();
+  const client = getNeonPostgresClient(databaseUrl());
+  if (!client) throw Object.assign(new Error('Neon database is not configured.'), { statusCode: 503 });
+
+  const rows = await client.select('user_profiles', {
+    select: 'role,status',
+    filters: [{ column: 'id', operator: 'eq', value: user.id }],
+    limit: 1,
+  });
+  const profile = rows[0] as { role?: string; status?: string } | undefined;
   if (!profile) throw Object.assign(new Error('User profile not found.'), { statusCode: 403 });
   if (profile.status !== 'active') throw Object.assign(new Error('User access is not active.'), { statusCode: 403 });
 
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-03.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/lib/neonJwt.test.ts && npm -C backend run typecheck && npm run typecheck:serverless
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
fix(auth): single hardened Neon JWT verifier and active-profile gate

Security
- Express routes only checked that the Neon Auth JWT was valid. Any invited or
  disabled user could mint a token directly at Neon Auth and call every data
  route (/companies, /pipeline, /tasks…). A middleware now requires an active
  user_profiles row (cached 30s per warm instance), mirroring
  serverless/neon-auth.ts verifyActiveIdentity.
- The JWT verifier existed twice (backend/src/lib/auth.ts and
  serverless/neon-auth.ts). Both now use backend/src/lib/neonJwt.ts, which also:
  * requires `exp` (a token without expiry was accepted forever) and checks
    `nbf`, with 60s clock skew;
  * binds the header `alg` to the key type (EdDSA/RS256/ES256/ES384) and
    rejects `none`;
  * selects the key strictly by `kid`, refreshing the JWKS once on an unknown
    kid (key rotation) with a 60s cooldown instead of silently trying jwks[0];
  * honours the EC curve from the JWK instead of assuming P-256;
  * reports JWKS/config outages as 503 and token problems as 401
    (previously generic 500s in the Express auth routes).
  Verified against the production JWKS shape (EdDSA/Ed25519 with kid).
- serverless/neon-auth.ts reuses the backend Neon client instead of opening a
  second pg Pool per function instance, and loads backend modules with dynamic
  import() (the CJS/ESM boundary documented in fidc-market-map.ts).

Express API
- Final JSON error handler: malformed JSON bodies return 400 JSON instead of
  Express' HTML page.
- POST /activities, POST /tasks, PATCH /tasks/:id validate dueDate (400 instead
  of a database 500); PATCH accepts an explicit `dueDate: null` to clear it.
- /mvp-readiness reports the configured auth provider (was hard-coded
  "supabase" after the Neon cutover).
- 4xx rejections are logged as warnings, not stack traces.
- Removed unused imports.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
(cherry picked from commit d6f9aeecd93b5fcfb7ae82acdc817e2da4f5211c)
MSG
```


---

### Tarefa 04 — Funções Vercel: helpers HTTP compartilhados e CRON_SECRET em tempo constante

**Por quê:** Cerca de 20 cópias de getHeader/parseUrl/readJsonBody/isAuthorized; o `CRON_SECRET` era comparado com `===` em 5 funções. Novo `serverless/http.ts`. Body inválido/grande passa a responder 400/413, erros de auth deixam de virar 500. `api/index.ts` não memoriza mais falha de inicialização e limpa os timers do health. A CI passa a rodar testes do backend, serverless e growth guards.

**Arquivos alterados/criados:**

```
 .github/workflows/ci.yml                 |  9 +++++++++
 api/agentetome.ts                        | 11 +++--------
 api/capital-market-health.ts             |  6 +-----
 api/capital-market-run.ts                | 16 +++-------------
 api/dcm-daily-leads.ts                   | 32 ++++----------------------------
 api/dcm-daily-operating-loop.ts          | 15 ++-------------
 api/fidcs.ts                             | 12 ++----------
 api/index.ts                             | 54 ++++++++++++++++++++++++++----------------------------
 api/knowledge-embedding-worker.ts        | 21 ++-------------------
 api/microsoft.ts                         | 10 +---------
 api/public-data-operations.ts            | 17 +----------------
 api/strategic-public-data-run.ts         | 10 ++--------
 package.json                             |  2 ++
 serverless/bounded-capture-run.ts        | 18 ++----------------
 serverless/bounded-capture-targets.ts    | 13 ++-----------
 serverless/candidate-identity-review.ts  | 35 +++++++++++------------------------
 serverless/company-credit-review.ts      | 37 +++++++------------------------------
 serverless/company-decision-readiness.ts |  8 +-------
 serverless/fidc-market-map.ts            |  8 +-------
 serverless/historical-archive.ts         | 20 ++++----------------
 serverless/http.test.ts                  | 54 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 serverless/http.ts                       | 59 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 serverless/knowledge-rpc.ts              | 29 ++++-------------------------
 serverless/knowledge-search.ts           | 22 +++-------------------
 24 files changed, 206 insertions(+), 312 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-04
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index e02b13505288e40b9d6e96fea240e72a945b4547..52b72e411e56892df4c235016d6a9ada0ee69899 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -106,6 +106,15 @@ jobs:
       - name: Validate Neon UUID runtime core contract
         run: node --test scripts/neon-uuid-runtime-core-contract.test.mjs
 
+      - name: Validate database growth guard contracts
+        run: npm run test:database-hardening
+
+      - name: Run backend unit tests
+        run: npm run test:backend
+
+      - name: Run serverless helper tests
+        run: npm run test:serverless
+
       - name: Typecheck backend
         run: npm -C backend run typecheck
 
diff --git a/api/agentetome.ts b/api/agentetome.ts
index 2a43aa45bd4f6372ecfac0670e692ab45c2a7549..a697504b4b56adb231c26828138bf0a3f3dfaf97 100644
--- a/api/agentetome.ts
+++ b/api/agentetome.ts
@@ -1,7 +1,8 @@
-import { createHash, timingSafeEqual } from 'node:crypto';
+import { createHash } from 'node:crypto';
 import type { VercelRequest, VercelResponse } from './vercelTypes.js';
 import { verifyActiveIdentity, verifyGodModeIdentity } from '../serverless/neon-auth.js';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { isCronAuthorized } from '../serverless/http.js';
 
 type AgentetomeRequest = VercelRequest & { body?: unknown };
 type AuthenticatedUser = { id: string; email?: string; authorization: string };
@@ -60,13 +61,7 @@ const authenticate = async (req: AgentetomeRequest): Promise<AuthenticatedUser>
 }
 
 const authenticateCron = (req: AgentetomeRequest) => {
-  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
-  const received = requestValue(req.headers.authorization) ?? '';
-  const expectedBuffer = Buffer.from(expected);
-  const receivedBuffer = Buffer.from(received);
-  if (!process.env.CRON_SECRET || expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
-    throw new ApiError('Unauthorized learning worker.', 401);
-  }
+  if (!isCronAuthorized(req)) throw new ApiError('Unauthorized learning worker.', 401);
 };
 
 const serviceRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
diff --git a/api/capital-market-health.ts b/api/capital-market-health.ts
index d52acd76445d6d377a6d1bb3b1e24e1139441539..2bba0cb7e706b4495e44659f62be2f79081d71f8 100644
--- a/api/capital-market-health.ts
+++ b/api/capital-market-health.ts
@@ -1,6 +1,7 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from '../serverless/neon-auth.js';
 import { isNeonDatabaseConfigured, requireNeonDataClient } from '../serverless/neon-data.js';
+import { getHeader } from '../serverless/http.js';
 
 type HealthStatus = 'healthy' | 'stale' | 'failed' | 'partial' | 'stale_running' | 'never_succeeded' | 'never_run';
 
@@ -46,11 +47,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
 const numberValue = (value: string | number | null | undefined) => {
   const parsed = Number(value ?? 0);
   return Number.isFinite(parsed) ? parsed : 0;
diff --git a/api/capital-market-run.ts b/api/capital-market-run.ts
index a9aeb30dcb020034ee0407ef07985d87c14384c4..164aa43fa52ab6939d047f44eb20e2487c1b3d24 100644
--- a/api/capital-market-run.ts
+++ b/api/capital-market-run.ts
@@ -1,20 +1,11 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
+import { isCronAuthorized, parseRequestUrl } from '../serverless/http.js';
 
 const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
   res.writeHead(statusCode, { 'Content-Type': 'application/json' });
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const isAuthorized = (req: IncomingMessage) => {
-  const secret = process.env.CRON_SECRET;
-  return Boolean(secret && getHeader(req, 'authorization') === `Bearer ${secret}`);
-};
-
 const deploymentMetadata = () => ({
   deploymentCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
   deploymentEnvironment: process.env.VERCEL_ENV ?? null,
@@ -22,7 +13,7 @@ const deploymentMetadata = () => ({
 });
 
 export default async function handler(req: IncomingMessage, res: ServerResponse) {
-  if (!isAuthorized(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, {
       status: 'partial',
       generatedAt: new Date().toISOString(),
@@ -32,8 +23,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     return;
   }
 
-  const host = getHeader(req, 'host') ?? 'localhost';
-  const url = new URL((req as any).url ?? '/', `https://${host}`);
+  const url = parseRequestUrl(req);
   const requestedDataset = String(url.searchParams.get('dataset') ?? 'cvm_offers');
   const mode = String(url.searchParams.get('mode') ?? 'run');
 
diff --git a/api/dcm-daily-leads.ts b/api/dcm-daily-leads.ts
index 2bec94613b539118c7e859c3c9a5710d4a894a60..ac3777f05a06f9e3c6466127d0d4f35fbbc75dbc 100644
--- a/api/dcm-daily-leads.ts
+++ b/api/dcm-daily-leads.ts
@@ -1,6 +1,7 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from '../serverless/neon-auth.js';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { getHeader, parseRequestUrl, readJsonBody } from '../serverless/http.js';
 
 const RUNTIME = 'dcm-daily-leads-v1';
 const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@@ -25,16 +26,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const parseUrl = (req: IncomingMessage) => {
-  const host = getHeader(req, 'host') ?? 'localhost';
-  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
-};
-
 const asObject = (value: unknown): JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
   ? value as JsonObject
   : {};
@@ -42,21 +33,6 @@ const text = (...values: unknown[]) => String(values.find((value) => typeof valu
 const nullableText = (...values: unknown[]) => text(...values) || null;
 const asArray = (value: unknown) => Array.isArray(value) ? value : [];
 
-const readJsonBody = async (req: IncomingMessage): Promise<JsonObject> => {
-  const chunks: Buffer[] = [];
-  let bytes = 0;
-  for await (const chunk of req) {
-    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
-    bytes += buffer.length;
-    if (bytes > 256_000) throw new Error('Request body exceeds 256 KB.');
-    chunks.push(buffer);
-  }
-  if (!chunks.length) return {};
-  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
-  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
-  return parsed as JsonObject;
-};
-
 const requireAuth = async (req: IncomingMessage): Promise<DataContext> => {
   const authorization = getHeader(req, 'authorization');
   if (!authorization?.startsWith('Bearer ')) throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
@@ -110,7 +86,7 @@ const buildBriefing = (items: JsonObject[]) => {
 };
 
 const listQueue = async (_context: DataContext, req: IncomingMessage) => {
-  const url = parseUrl(req);
+  const url = parseRequestUrl(req);
   const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
   if (!DATE_PATTERN.test(date)) throw Object.assign(new Error('Invalid date. Use YYYY-MM-DD.'), { statusCode: 400 });
   const requestedStatus = url.searchParams.get('status');
@@ -270,7 +246,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     }
 
     if (method === 'POST') {
-      const body = await readJsonBody(req);
+      const body = await readJsonBody(req, 256_000);
       const action = text(body.action, 'create');
       const data = action === 'send' ? await sendLead(context, body) : action === 'create' ? await createLead(context, body) : null;
       if (!data) throw Object.assign(new Error('Unsupported action.'), { statusCode: 400 });
@@ -279,7 +255,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     }
 
     if (method === 'PATCH') {
-      const body = await readJsonBody(req);
+      const body = await readJsonBody(req, 256_000);
       const data = await updateLead(context, body);
       writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
       return;
diff --git a/api/dcm-daily-operating-loop.ts b/api/dcm-daily-operating-loop.ts
index 756271bf67947e1e3445956aadd93b8d5736ddce..9df31e75456fbf6d59d2cabaeb2afb9088573647 100644
--- a/api/dcm-daily-operating-loop.ts
+++ b/api/dcm-daily-operating-loop.ts
@@ -1,5 +1,6 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from '../serverless/neon-auth.js';
+import { getHeader, parseRequestUrl } from '../serverless/http.js';
 
 const RUNTIME = 'dcm-daily-operating-loop-v1';
 
@@ -13,18 +14,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const parseUrl = (req: IncomingMessage) => {
-  const host = getHeader(req, 'host') ?? 'localhost';
-  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
-};
-
-const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
-
 export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
     writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
@@ -40,7 +29,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
   try {
     await verifyActiveIdentity(authorization.slice('Bearer '.length));
 
-    const view = parseUrl(req).searchParams.get('view') ?? 'loop';
+    const view = parseRequestUrl(req).searchParams.get('view') ?? 'loop';
     const module = await import('../backend/src/modules/dcmDailyOperatingLoop.js');
     const data = view === 'business-analyst'
       ? module.getBusinessAnalystAgent()
diff --git a/api/fidcs.ts b/api/fidcs.ts
index 203a12f52a7a2cfdcb30c517da2ff9eebaca115e..2246b2ee8bcba8375b24de232cc43861d808729a 100644
--- a/api/fidcs.ts
+++ b/api/fidcs.ts
@@ -1,8 +1,9 @@
-import { randomUUID, timingSafeEqual } from 'node:crypto';
+import { randomUUID } from 'node:crypto';
 import type { VercelRequest, VercelResponse } from './vercelTypes.js';
 import type { FidcsFundSnapshot } from '../backend/src/lib/fidcsComBr.js';
 import { verifyActiveIdentity, verifyGodModeIdentity } from '../serverless/neon-auth.js';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { isCronAuthorized } from '../serverless/http.js';
 
 type FidcsRequest = VercelRequest & { body?: unknown };
 type SourceRow = { id: string; name: string; status: string; health: string | null; metadata?: Record<string, unknown> };
@@ -37,15 +38,6 @@ const authenticate = async (req: FidcsRequest) => {
   return { id: user.id, authorization };
 }
 
-const isCronAuthorized = (req: FidcsRequest) => {
-  const secret = process.env.CRON_SECRET ?? '';
-  const received = requestValue(req.headers.authorization) ?? '';
-  const expected = `Bearer ${secret}`;
-  const left = Buffer.from(received);
-  const right = Buffer.from(expected);
-  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
-};
-
 const requireGodMode = async (authorization: string) => {
   await verifyGodModeIdentity(authorization.slice('Bearer '.length));
 }
diff --git a/api/index.ts b/api/index.ts
index 669658973caa2dcf1232bc80900ff3c3eea95e8a..943ebf2eca301e4b049ec1b12858057d006b3ae8 100644
--- a/api/index.ts
+++ b/api/index.ts
@@ -15,6 +15,7 @@ import fidcMarketMapHandler from '../serverless/fidc-market-map.js';
 import historicalArchiveHandler from '../serverless/historical-archive.js';
 import knowledgeRpcHandler from '../serverless/knowledge-rpc.js';
 import knowledgeSearchHandler from '../serverless/knowledge-search.js';
+import { isCronAuthorized, parseRequestUrl } from '../serverless/http.js';
 
 type ExpressLike = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;
 
@@ -27,22 +28,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const parseUrl = (req: IncomingMessage) => {
-  const host = getHeader(req, 'host') ?? 'localhost';
-  return new URL(req.url ?? '/', `https://${host}`);
-};
-
-const isAuthorizedCron = (req: IncomingMessage) => {
-  const cronSecret = process.env.CRON_SECRET;
-  const auth = getHeader(req, 'authorization');
-  return Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
-};
-
 const envFlag = (key: string) => Boolean(process.env[key] && String(process.env[key]).trim().length > 0);
 const hasPersistentDataCredentials = () => Boolean(
   envFlag('MOTOR_NEON_DATABASE_URL')
@@ -59,10 +44,16 @@ async function dataTableProbe(table: string) {
     const client = getDataClient();
     if (!client) return { table, ok: false, count: null, error: 'missing_persistent_data_env' };
 
-    await Promise.race([
-      client.select(table, { select: 'id', limit: 1 }),
-      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout_after_${CAPTURE_HEALTH_QUERY_TIMEOUT_MS}ms`)), CAPTURE_HEALTH_QUERY_TIMEOUT_MS)),
-    ]);
+    let timer: ReturnType<typeof setTimeout> | undefined;
+    try {
+      await Promise.race([
+        client.select(table, { select: 'id', limit: 1 }),
+        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout_after_${CAPTURE_HEALTH_QUERY_TIMEOUT_MS}ms`)), CAPTURE_HEALTH_QUERY_TIMEOUT_MS); }),
+      ]);
+    } finally {
+      // Do not leave a pending 4s timer behind for every probed table.
+      if (timer) clearTimeout(timer);
+    }
     return { table, ok: true, count: null, error: null };
   } catch (error) {
     return { table, ok: false, count: null, error: error instanceof Error ? error.message : String(error) };
@@ -118,7 +109,7 @@ async function captureHealth(req: IncomingMessage, res: ServerResponse) {
   // CRON_SECRET configurado o endpoint permanece fechado (fail-closed) —
   // nunca expor env/tabelas sem credencial. Espelha o gate de
   // backend/src/serverless/vercelServerlessHandler.ts (captureHealth).
-  if (!isAuthorizedCron(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, {
       status: 'partial',
       generatedAt: new Date().toISOString(),
@@ -152,7 +143,7 @@ async function captureHealth(req: IncomingMessage, res: ServerResponse) {
   writeJson(res, persistentDataConfigured && canAccessCoreTables ? 200 : 207, {
     status: persistentDataConfigured && canAccessCoreTables ? 'real' : 'partial',
     generatedAt: new Date().toISOString(),
-    requestPath: parseUrl(req).pathname,
+    requestPath: parseRequestUrl(req).pathname,
     env: {
       dataProvider,
       MOTOR_NEON_DATABASE_URL: envFlag('MOTOR_NEON_DATABASE_URL'),
@@ -171,13 +162,13 @@ async function captureHealth(req: IncomingMessage, res: ServerResponse) {
 }
 
 async function runCaptureRuntime(req: IncomingMessage, res: ServerResponse, triggerType: 'cron' | 'manual') {
-  if (!isAuthorizedCron(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized capture runtime request.' });
     return;
   }
 
   const startedAt = new Date().toISOString();
-  const url = parseUrl(req);
+  const url = parseRequestUrl(req);
   const requestedCompanyId = url.searchParams.get('companyId');
   const requestedSourceId = url.searchParams.get('sourceId');
 
@@ -252,7 +243,7 @@ async function runCaptureRuntime(req: IncomingMessage, res: ServerResponse, trig
 }
 
 async function originationRuntime(req: IncomingMessage, res: ServerResponse) {
-  const pathname = parseUrl(req).pathname.replace(/^\/api/, '');
+  const pathname = parseRequestUrl(req).pathname.replace(/^\/api/, '');
   const mod = await import('../backend/src/modules/originationOperatingSystem.js');
   const payload = (() => {
     if (pathname === '/origination/os') return mod.getOriginationOperatingSystem();
@@ -316,13 +307,20 @@ async function ensureApp(): Promise<void> {
         'Adicione "export { app };" no final do arquivo.'
       );
     }
-  })();
+  })().catch((error: unknown) => {
+    // Do not memoize a failed initialization in this loader: otherwise one
+    // transient failure answers 503 for the rest of the warm instance's life.
+    // (An ES module whose evaluation throws stays errored in Node's own module
+    // cache; this only stops our wrapper from pinning the rejection.)
+    loadingPromise = null;
+    throw error;
+  });
 
   return loadingPromise;
 }
 
 async function runScheduledDiscovery(req: IncomingMessage, res: ServerResponse) {
-  if (!isAuthorizedCron(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized discovery runtime request.' });
     return;
   }
@@ -358,7 +356,7 @@ async function runScheduledDiscovery(req: IncomingMessage, res: ServerResponse)
 
 export default async function handler(req: IncomingMessage, res: ServerResponse) {
   const originalUrl = req.url ?? '/';
-  const pathname = parseUrl(req).pathname;
+  const pathname = parseRequestUrl(req).pathname;
 
   if (pathname === '/api/search-profiles/cron/run') {
     await runScheduledDiscovery(req, res);
diff --git a/api/knowledge-embedding-worker.ts b/api/knowledge-embedding-worker.ts
index 7753199e979e27bbfbf1f32046f26140974d0e32..43d5609d4ffec27e6fc8fb2624045346cd22ae42 100644
--- a/api/knowledge-embedding-worker.ts
+++ b/api/knowledge-embedding-worker.ts
@@ -1,6 +1,6 @@
-import { timingSafeEqual } from 'node:crypto';
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { isCronAuthorized } from '../serverless/http.js';
 
 const RUNTIME = 'knowledge-embedding-worker-v10-vercel';
 const VOYAGE_MODEL = 'voyage-3.5';
@@ -14,23 +14,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const safeEqual = (left: string, right: string) => {
-  const leftBuffer = Buffer.from(left);
-  const rightBuffer = Buffer.from(right);
-  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
-};
-
-const isAuthorized = (req: IncomingMessage) => {
-  const secret = process.env.CRON_SECRET ?? '';
-  const authorization = getHeader(req, 'authorization') ?? '';
-  return Boolean(secret && safeEqual(authorization, `Bearer ${secret}`));
-};
-
 const deploymentMetadata = () => ({
   deploymentCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
   deploymentEnvironment: process.env.VERCEL_ENV ?? null,
@@ -141,7 +124,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     return;
   }
 
-  if (!isAuthorized(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, {
       status: 'error',
       error: 'unauthorized',
diff --git a/api/microsoft.ts b/api/microsoft.ts
index fc171e15c630588d6bab318ab2777da700c1eaa3..b1cca1efbbcf8be6eed06106f3dd4cb6698c4b34 100644
--- a/api/microsoft.ts
+++ b/api/microsoft.ts
@@ -10,6 +10,7 @@ import type { VercelRequest, VercelResponse } from './vercelTypes.js';
 import { verifyActiveIdentity } from '../serverless/neon-auth.js';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
 import type { FilterDefinition } from '../backend/src/lib/postgres.js';
+import { isCronAuthorized } from '../serverless/http.js';
 
 type MicrosoftRequest = VercelRequest & { body?: Record<string, unknown> };
 type JsonRecord = Record<string, any>;
@@ -103,15 +104,6 @@ const authenticate = async (req: MicrosoftRequest) => {
   return { id: user.id, email: user.email };
 }
 
-const isCronAuthorized = (req: MicrosoftRequest) => {
-  const secret = process.env.CRON_SECRET ?? '';
-  const received = requestValue(req.headers.authorization) ?? '';
-  const expected = `Bearer ${secret}`;
-  const left = Buffer.from(received);
-  const right = Buffer.from(expected);
-  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
-};
-
 const encodeBase64Url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
 const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url');
 
diff --git a/api/public-data-operations.ts b/api/public-data-operations.ts
index 484d26e7c5b48aa10db92ab0ff98f3fa153cac9c..62028b856adcf94b58f0ef30f3d45af0836ed51d 100644
--- a/api/public-data-operations.ts
+++ b/api/public-data-operations.ts
@@ -1,6 +1,6 @@
-import { timingSafeEqual } from 'node:crypto';
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from '../serverless/neon-auth.js';
+import { getHeader, isCronAuthorized, normalizeBaseUrl } from '../serverless/http.js';
 
 const CANONICAL_MAIS_RETORNO_BASE = 'https://data.maisretorno.com/mr-data/v4/api';
 const CANONICAL_APP_BASE = 'https://motor-originac-srm.vercel.app';
@@ -17,12 +17,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
 const safeError = (error: unknown) => error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
 const extractText = (payload: Record<string, any>) => {
   const content = payload?.choices?.[0]?.message?.content;
@@ -31,15 +25,6 @@ const extractText = (payload: Record<string, any>) => {
   return '';
 };
 
-const isCronAuthorized = (req: IncomingMessage) => {
-  const secret = process.env.CRON_SECRET ?? '';
-  const received = getHeader(req, 'authorization') ?? '';
-  const expected = `Bearer ${secret}`;
-  const left = Buffer.from(received);
-  const right = Buffer.from(expected);
-  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
-};
-
 const paidProviderStatus = (name: 'openai' | 'anthropic' | 'vercel-ai-gateway') => ({
   provider: name,
   configured: false,
diff --git a/api/strategic-public-data-run.ts b/api/strategic-public-data-run.ts
index 788730712943f9499bf77a192db35c8b9c7e6d3e..0d8ca8e1183c30a89fed61d019abbe47409488c6 100644
--- a/api/strategic-public-data-run.ts
+++ b/api/strategic-public-data-run.ts
@@ -1,4 +1,5 @@
 import type { VercelRequest, VercelResponse } from './vercelTypes.js';
+import { isCronAuthorized } from '../serverless/http.js';
 
 // Node 24 emits DEP0169 from a legacy transitive dependency during ZIP discovery.
 // The handler and connectors use WHATWG URL; filter only that known warning code.
@@ -18,13 +19,6 @@ const ALLOWED_MODES = ['run', 'probe', 'qsa-fallback'] as const;
 const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
 const booleanValue = (value: string | undefined) => ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());
 
-const isAuthorized = (req: VercelRequest) => {
-  const secret = process.env.CRON_SECRET;
-  if (!secret) return false;
-  const authorization = req.headers.authorization;
-  return authorization === `Bearer ${secret}`;
-};
-
 const isProtectedPreviewProbe = (mode: string) => mode === 'probe' && process.env.VERCEL_ENV === 'preview';
 const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
 
@@ -40,7 +34,7 @@ export default async function handler(req: VercelRequest, res: VercelResponse) {
   if (!ALLOWED_MODES.includes(mode as typeof ALLOWED_MODES[number])) {
     return res.status(400).json({ status: 'error', error: 'invalid_mode', allowed: ALLOWED_MODES });
   }
-  if (!isAuthorized(req) && !isProtectedPreviewProbe(mode)) {
+  if (!isCronAuthorized(req) && !isProtectedPreviewProbe(mode)) {
     return res.status(401).json({ status: 'error', error: 'unauthorized' });
   }
 
diff --git a/package.json b/package.json
index e9af54283851151d8e560e5eaa370d5436fdb467..06dafce203226327ba639e1bbb63aef377401a8c 100644
--- a/package.json
+++ b/package.json
@@ -17,6 +17,8 @@
     "build:frontend": "npm -C frontend run build",
     "build:backend": "npm -C backend run build",
     "lint": "npm -C backend run lint && npm -C frontend run lint",
+    "test:backend": "npm -C backend test",
+    "test:serverless": "tsx --test \"serverless/**/*.test.ts\"",
     "test:frontend-quality": "node --test scripts/frontend-quality-contract.test.mjs",
     "test:search-discovery-quality": "tsx --test backend/src/lib/searchDiscoveryQuality.test.ts backend/src/lib/candidateRediscoveryLineage.test.ts backend/src/lib/discoverySourceRouting.test.ts backend/src/services/searchProfileRunMapping.test.ts backend/src/services/searchProfileScheduledRunner.test.ts",
     "test:people-capital": "tsx --test backend/src/lib/peopleCapitalSignals.test.ts backend/src/lib/techSignalsDiscovery.test.ts backend/src/lib/originationBriefThesis.test.ts && node --test scripts/origination-brief-migration-contract.test.mjs scripts/universal-origination-reasoning-contract.test.mjs",
diff --git a/serverless/bounded-capture-run.ts b/serverless/bounded-capture-run.ts
index 78df56ea93414be7be561b4b0ff69447e66f80e9..6c4277ce1a82991feba777fe188fa6473de06173 100644
--- a/serverless/bounded-capture-run.ts
+++ b/serverless/bounded-capture-run.ts
@@ -1,4 +1,5 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
+import { isCronAuthorized, parseRequestUrl } from './http.js';
 
 const RUNTIME = 'bounded-capture-run-v2';
 
@@ -12,27 +13,12 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const authorized = (req: IncomingMessage) => {
-  const secret = process.env.CRON_SECRET;
-  return Boolean(secret && getHeader(req, 'authorization') === `Bearer ${secret}`);
-};
-
-const parseRequestUrl = (req: IncomingMessage) => {
-  const host = getHeader(req, 'host') ?? 'localhost';
-  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
-};
-
 export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
     writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
     return;
   }
-  if (!authorized(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized bounded capture request.' });
     return;
   }
diff --git a/serverless/bounded-capture-targets.ts b/serverless/bounded-capture-targets.ts
index 64b7fb40ca0010129254ef766b4600533bc17dd3..365e34e957c974688db399460a18ace186e8bd0c 100644
--- a/serverless/bounded-capture-targets.ts
+++ b/serverless/bounded-capture-targets.ts
@@ -1,4 +1,5 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
+import { isCronAuthorized } from './http.js';
 
 const RUNTIME = 'bounded-capture-targets-v2';
 
@@ -12,16 +13,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const authorized = (req: IncomingMessage) => {
-  const secret = process.env.CRON_SECRET;
-  return Boolean(secret && getHeader(req, 'authorization') === `Bearer ${secret}`);
-};
-
 const cadenceFrom = (req: IncomingMessage) => {
   const value = new URL(req.url ?? '/', 'https://runtime.local').searchParams.get('cadence') ?? 'all';
   return new Set(['frequent', 'daily', 'weekly', 'monthly', 'all']).has(value) ? value : 'all';
@@ -32,7 +23,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
     return;
   }
-  if (!authorized(req)) {
+  if (!isCronAuthorized(req)) {
     writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized capture target request.' });
     return;
   }
diff --git a/serverless/candidate-identity-review.ts b/serverless/candidate-identity-review.ts
index 58cd826fcb67b9988c74ba045d248085fd85de21..23801e3150064de2b76973f5f13123c46f2ed81f 100644
--- a/serverless/candidate-identity-review.ts
+++ b/serverless/candidate-identity-review.ts
@@ -1,5 +1,6 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from './neon-auth.js';
+import { getHeader, readJsonBody } from './http.js';
 
 const RUNTIME = 'candidate-identity-review-v1';
 
@@ -13,28 +14,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
-
-const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
-  const chunks: Buffer[] = [];
-  let bytes = 0;
-  for await (const chunk of req) {
-    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
-    bytes += buffer.length;
-    if (bytes > 64_000) throw new Error('Request body exceeds 64 KB.');
-    chunks.push(buffer);
-  }
-  if (!chunks.length) return {};
-  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
-  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
-  return parsed as Record<string, unknown>;
-};
-
 export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
     writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
@@ -55,7 +34,6 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     const reviewer = { userId: user.id, email: user.email };
 
     const {
-      CandidateIdentityReviewValidationError,
       normalizeCandidateIdentityApprovalInput,
       normalizeCandidateIdentityRejectionInput,
     } = await import('../backend/src/lib/candidateIdentityReview.js');
@@ -77,7 +55,16 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     const data = await runtime.approve(input);
     writeJson(res, 201, { status: 'real', generatedAt: new Date().toISOString(), data });
   } catch (error) {
-    const validationError = typeof error === 'object' && error !== null && 'statusCode' in error && Number((error as { statusCode?: unknown }).statusCode) === 422;
+    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
+      ? Number((error as { statusCode?: unknown }).statusCode)
+      : undefined;
+    // Auth (401/403), malformed body (400/413) and similar client errors keep
+    // their status instead of being reported as a 500.
+    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 422) {
+      writeJson(res, statusCode, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
+      return;
+    }
+    const validationError = statusCode === 422;
     const databaseConstraint = error instanceof Error && /23514|identity|CNPJ|candidate/i.test(error.message);
     if (validationError || databaseConstraint) {
       writeJson(res, 422, {
diff --git a/serverless/company-credit-review.ts b/serverless/company-credit-review.ts
index 4b08862f9ed4b7cced5c29b16d2032dab571a993..9186a07aae917f567a6e992e7eeb574d21c84311 100644
--- a/serverless/company-credit-review.ts
+++ b/serverless/company-credit-review.ts
@@ -1,5 +1,6 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from './neon-auth.js';
+import { getHeader, parseRequestUrl, readJsonBody } from './http.js';
 
 const RUNTIME = 'company-credit-review-v1';
 
@@ -13,33 +14,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
-
-const parseUrl = (req: IncomingMessage) => {
-  const host = getHeader(req, 'host') ?? 'localhost';
-  return new URL((req as IncomingMessage & { url?: string }).url ?? '/', `https://${host}`);
-};
-
-const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
-  const chunks: Buffer[] = [];
-  let bytes = 0;
-  for await (const chunk of req) {
-    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
-    bytes += buffer.length;
-    if (bytes > 128_000) throw new Error('Request body exceeds 128 KB.');
-    chunks.push(buffer);
-  }
-  if (!chunks.length) return {};
-  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
-  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
-  return parsed as Record<string, unknown>;
-};
-
 const authenticate = async (req: IncomingMessage) => {
   const authorization = getHeader(req, 'authorization');
   if (!authorization?.startsWith('Bearer ')) return null;
@@ -70,7 +44,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     const runtime = new CompanyCreditReviewRuntime();
 
     if (method === 'GET') {
-      const url = parseUrl(req);
+      const url = parseRequestUrl(req);
       const companyId = url.searchParams.get('companyId');
       const limit = Number(url.searchParams.get('limit') ?? 100);
       const data = companyId
@@ -80,9 +54,8 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
       return;
     }
 
-    const body = await readJsonBody(req);
+    const body = await readJsonBody(req, 128_000);
     const {
-      CompanyCreditReviewValidationError,
       normalizeCompanyCreditReviewAction,
       normalizeCompanyCreditReviewApproval,
       normalizeCompanyCreditReviewDraft,
@@ -120,6 +93,10 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
       ? (error as { blockers?: unknown }).blockers
       : [];
 
+    if (statusCode === 400 || statusCode === 413) {
+      writeJson(res, statusCode, { status: 'partial', generatedAt: new Date().toISOString(), error: message });
+      return;
+    }
     if (message === 'god_mode_required' || statusCode === 403) {
       writeJson(res, 403, { status: 'partial', generatedAt: new Date().toISOString(), error: 'god_mode_required' });
       return;
diff --git a/serverless/company-decision-readiness.ts b/serverless/company-decision-readiness.ts
index 5095b04123d1984ba3e99f7a032b9cb132a88d4e..0be796eee466a35ec0d75694d6315c109120f1a4 100644
--- a/serverless/company-decision-readiness.ts
+++ b/serverless/company-decision-readiness.ts
@@ -1,13 +1,9 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from './neon-auth.js';
+import { getHeader } from './http.js';
 
 const RUNTIME = 'company-decision-readiness-v1';
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
 const corsHeaders = (req: IncomingMessage) => ({
   'Access-Control-Allow-Origin': getHeader(req, 'origin') ?? '*',
   'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
@@ -35,8 +31,6 @@ const writeNoContent = (req: IncomingMessage, res: ServerResponse) => {
   res.end();
 };
 
-const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
-
 const statusCodeFromError = (error: unknown) => {
   if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
   const value = Number((error as { statusCode?: unknown }).statusCode);
diff --git a/serverless/fidc-market-map.ts b/serverless/fidc-market-map.ts
index 742a536d3353cbea5213caf7731d84e15254506e..e9f7e5316a79088e36c3367346573f96c7f988ac 100644
--- a/serverless/fidc-market-map.ts
+++ b/serverless/fidc-market-map.ts
@@ -1,5 +1,6 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from './neon-auth.js';
+import { getHeader } from './http.js';
 
 const RUNTIME = 'agentetome-fidc-market-map-v1';
 
@@ -12,13 +13,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
-
 const queryRecord = (req: IncomingMessage): Record<string, unknown> => {
   const host = getHeader(req, 'host') ?? 'localhost';
   const url = new URL(req.url ?? '/', `https://${host}`);
diff --git a/serverless/historical-archive.ts b/serverless/historical-archive.ts
index 6567491702499ff5d8d04a3c4db9efbffcdc7dc7..d2bcbd3330318fbc197e9c655bbfdcc1deeb547b 100644
--- a/serverless/historical-archive.ts
+++ b/serverless/historical-archive.ts
@@ -1,6 +1,7 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyGodModeIdentity } from '../serverless/neon-auth.js';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { getHeader, parseRequestUrl, readJsonBody } from './http.js';
 
 const RUNTIME = 'historical-archive-neon-drive-v1';
 const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@@ -14,21 +15,8 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const header = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const requestUrl = (req: IncomingMessage) => new URL(req.url ?? '/', `https://${header(req, 'host') ?? 'localhost'}`);
-
-const readBody = async (req: IncomingMessage) => {
-  const chunks: Buffer[] = [];
-  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
-  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> : {};
-};
-
 const requireGodMode = async (req: IncomingMessage) => {
-  const authorization = header(req, 'authorization') ?? '';
+  const authorization = getHeader(req, 'authorization') ?? '';
   if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('authentication_required'), { statusCode: 401 });
   return verifyGodModeIdentity(authorization.slice('Bearer '.length));
 };
@@ -262,7 +250,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
     const method = (req.method ?? 'GET').toUpperCase();
 
     if (method === 'GET') {
-      writeJson(res, 200, await listCatalog(requestUrl(req)));
+      writeJson(res, 200, await listCatalog(parseRequestUrl(req)));
       return;
     }
     if (method !== 'POST') {
@@ -270,7 +258,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
       return;
     }
 
-    const body = await readBody(req);
+    const body = await readJsonBody(req);
     const action = String(body.action ?? '');
     if (action === 'download') {
       writeJson(res, 200, await downloadInfo(String(body.partId ?? '')));
diff --git a/serverless/http.test.ts b/serverless/http.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f7ef3f6c01628663b0e9c2e19cf2576d6c0ef9f8
--- /dev/null
+++ b/serverless/http.test.ts
@@ -0,0 +1,54 @@
+import assert from 'node:assert/strict';
+import type { IncomingMessage } from 'node:http';
+import { Readable } from 'node:stream';
+import test from 'node:test';
+import { getHeader, isCronAuthorized, normalizeBaseUrl, parseRequestUrl, readJsonBody, safeEqual } from './http.js';
+
+const withCronSecret = (secret: string | undefined, run: () => void) => {
+  const previous = process.env.CRON_SECRET;
+  if (secret === undefined) delete process.env.CRON_SECRET;
+  else process.env.CRON_SECRET = secret;
+  try {
+    run();
+  } finally {
+    if (previous === undefined) delete process.env.CRON_SECRET;
+    else process.env.CRON_SECRET = previous;
+  }
+};
+
+const bodyRequest = (body: string) => Object.assign(Readable.from([Buffer.from(body)]), { headers: {} }) as unknown as IncomingMessage;
+
+test('isCronAuthorized is fail-closed and exact', () => {
+  withCronSecret(undefined, () => {
+    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer ' } }), false);
+  });
+  withCronSecret('s3cret', () => {
+    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer s3cret' } }), true);
+    assert.equal(isCronAuthorized({ headers: { authorization: ['Bearer s3cret', 'x'] } }), true);
+    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer s3cres' } }), false);
+    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer s3cret-longer' } }), false);
+    assert.equal(isCronAuthorized({ headers: {} }), false);
+  });
+});
+
+test('safeEqual compares strings of different lengths without throwing', () => {
+  assert.equal(safeEqual('abc', 'abc'), true);
+  assert.equal(safeEqual('abc', 'abcd'), false);
+});
+
+test('request helpers normalize headers, URLs and base URLs', () => {
+  assert.equal(getHeader({ headers: { host: ['a.example', 'b.example'] } }, 'Host'), 'a.example');
+  const url = parseRequestUrl({ headers: { host: 'motor.example' }, url: '/api/x?view=loop' });
+  assert.equal(url.origin, 'https://motor.example');
+  assert.equal(url.searchParams.get('view'), 'loop');
+  assert.equal(parseRequestUrl({ headers: {} }).href, 'https://localhost/');
+  assert.equal(normalizeBaseUrl('https://a.example///'), 'https://a.example');
+});
+
+test('readJsonBody maps malformed and oversized bodies to client errors', async () => {
+  assert.deepEqual(await readJsonBody(bodyRequest('{"a":1}')), { a: 1 });
+  assert.deepEqual(await readJsonBody(bodyRequest('')), {});
+  await assert.rejects(readJsonBody(bodyRequest('{bad')), (error: any) => error.statusCode === 400);
+  await assert.rejects(readJsonBody(bodyRequest('[1,2]')), (error: any) => error.statusCode === 400);
+  await assert.rejects(readJsonBody(bodyRequest(JSON.stringify({ blob: 'x'.repeat(200) })), 100), (error: any) => error.statusCode === 413);
+});
diff --git a/serverless/http.ts b/serverless/http.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b8c0e6688212b9bc7e7845077df75387bf1c62d2
--- /dev/null
+++ b/serverless/http.ts
@@ -0,0 +1,59 @@
+import { timingSafeEqual } from 'node:crypto';
+import type { IncomingMessage } from 'node:http';
+
+/** Shared request helpers for the Vercel functions in api/ and serverless/. */
+
+export const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
+
+type HeaderSource = { headers: Record<string, string | string[] | undefined> };
+
+export const getHeader = (req: HeaderSource, key: string) => {
+  const value = req.headers[key.toLowerCase()];
+  return Array.isArray(value) ? value[0] : value;
+};
+
+export const parseRequestUrl = (req: HeaderSource & { url?: string }) => {
+  const host = getHeader(req, 'host') ?? 'localhost';
+  return new URL(req.url ?? '/', `https://${host}`);
+};
+
+/** Constant-time string comparison (length is the only leaked property). */
+export const safeEqual = (received: string, expected: string) => {
+  const left = Buffer.from(received);
+  const right = Buffer.from(expected);
+  return left.length === right.length && timingSafeEqual(left, right);
+};
+
+/**
+ * Vercel Cron / GitHub Actions authorization. Fail-closed when CRON_SECRET is
+ * not configured and compare in constant time so the secret cannot be probed
+ * byte by byte through response timing.
+ */
+export const isCronAuthorized = (req: HeaderSource) => {
+  const secret = process.env.CRON_SECRET ?? '';
+  return Boolean(secret) && safeEqual(getHeader(req, 'authorization') ?? '', `Bearer ${secret}`);
+};
+
+export const readJsonBody = async (req: IncomingMessage, maxBytes = 64_000): Promise<Record<string, unknown>> => {
+  const chunks: Buffer[] = [];
+  let bytes = 0;
+  for await (const chunk of req) {
+    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
+    bytes += buffer.length;
+    if (bytes > maxBytes) {
+      throw Object.assign(new Error(`Request body exceeds ${Math.round(maxBytes / 1000)} KB.`), { statusCode: 413 });
+    }
+    chunks.push(buffer);
+  }
+  if (!bytes) return {};
+  let parsed: unknown;
+  try {
+    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
+  } catch {
+    throw Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 });
+  }
+  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
+    throw Object.assign(new Error('JSON body must be an object.'), { statusCode: 400 });
+  }
+  return parsed as Record<string, unknown>;
+};
diff --git a/serverless/knowledge-rpc.ts b/serverless/knowledge-rpc.ts
index 5aa7f3bc409a277090f7093abfde92cb945db8c3..d3254227b369e6ff871d57fb7d0305d42254b9fb 100644
--- a/serverless/knowledge-rpc.ts
+++ b/serverless/knowledge-rpc.ts
@@ -1,6 +1,7 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
-import { verifyActiveIdentity } from '../serverless/neon-auth.js';
-import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { verifyActiveIdentity } from './neon-auth.js';
+import { requireNeonDataClient } from './neon-data.js';
+import { getHeader, readJsonBody } from './http.js';
 
 const RUNTIME = 'knowledge-rpc-neon-v1';
 
@@ -38,28 +39,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const getHeader = (req: IncomingMessage, name: string) => {
-  const value = req.headers[name.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const readBody = async (req: IncomingMessage) => {
-  const chunks: Buffer[] = [];
-  let total = 0;
-  for await (const chunk of req) {
-    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
-    total += buffer.length;
-    if (total > 256_000) throw Object.assign(new Error('Request body exceeds 256 KB.'), { statusCode: 413 });
-    chunks.push(buffer);
-  }
-  if (!chunks.length) return {} as Record<string, unknown>;
-  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
-  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
-    throw Object.assign(new Error('JSON body must be an object.'), { statusCode: 400 });
-  }
-  return parsed as Record<string, unknown>;
-};
-
 export default async function handler(req: IncomingMessage, res: ServerResponse) {
   if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
     writeJson(res, 405, { status: 'partial', error: 'Method not allowed.' });
@@ -74,7 +53,7 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
 
     const accessToken = authorization.slice('Bearer '.length);
     const identity = await verifyActiveIdentity(accessToken);
-    const body = await readBody(req);
+    const body = await readJsonBody(req, 256_000);
     const functionName = String(body.functionName ?? '').trim();
     const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args)
       ? body.args as Record<string, unknown>
diff --git a/serverless/knowledge-search.ts b/serverless/knowledge-search.ts
index 9a1fddcef5d70d683776db2369aba7b3a60c681b..cce41f10daf728429f7c96e648aff7cd57bfe31d 100644
--- a/serverless/knowledge-search.ts
+++ b/serverless/knowledge-search.ts
@@ -1,6 +1,7 @@
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import { verifyActiveIdentity } from '../serverless/neon-auth.js';
 import { requireNeonDataClient } from '../serverless/neon-data.js';
+import { getHeader, readJsonBody } from './http.js';
 
 const RUNTIME = 'knowledge-hybrid-search-neon-v1';
 const VOYAGE_MODEL = 'voyage-3.5';
@@ -15,23 +16,6 @@ const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) =>
   res.end(JSON.stringify(payload));
 };
 
-const header = (req: IncomingMessage, key: string) => {
-  const value = req.headers[key.toLowerCase()];
-  return Array.isArray(value) ? value[0] : value;
-};
-
-const readBody = async (req: IncomingMessage) => {
-  const chunks: Buffer[] = [];
-  let total = 0;
-  for await (const chunk of req) {
-    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
-    total += buffer.length;
-    if (total > 64_000) throw Object.assign(new Error('Request body exceeds 64 KB.'), { statusCode: 413 });
-    chunks.push(buffer);
-  }
-  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> : {};
-};
-
 const parseLimit = (value: unknown) => {
   const parsed = Number(value ?? 12);
   return Number.isFinite(parsed) ? Math.min(30, Math.max(1, Math.trunc(parsed))) : 12;
@@ -76,12 +60,12 @@ export default async function handler(req: IncomingMessage, res: ServerResponse)
   }
 
   try {
-    const authorization = header(req, 'authorization') ?? '';
+    const authorization = getHeader(req, 'authorization') ?? '';
     if (!authorization.startsWith('Bearer ')) {
       throw Object.assign(new Error('authentication_required'), { statusCode: 401 });
     }
     const identity = await verifyActiveIdentity(authorization.slice('Bearer '.length));
-    const body = await readBody(req);
+    const body = await readJsonBody(req);
     const query = String(body.query ?? '').trim();
     const companyId = body.companyId ? String(body.companyId).trim() : null;
     const limit = parseLimit(body.limit);
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-04.patch
```

**Verificar:**

```bash
npm run typecheck:serverless && npm run test:serverless && node --test scripts/vercel-runtime-stability-contract.test.mjs scripts/vercel-function-budget.test.mjs
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
refactor(api): share request helpers across Vercel functions; timing-safe cron auth

Ported onto the Neon cutover branch (originally a8238b88).

- New serverless/http.ts (getHeader, parseRequestUrl, normalizeBaseUrl,
  readJsonBody, safeEqual, isCronAuthorized) replaces the copy-pasted helper
  definitions in api/*.ts and serverless/*.ts, including the new Neon
  knowledge-rpc, knowledge-search and historical-archive handlers.
- CRON_SECRET was compared with `===` in api/index.ts, capital-market-run,
  strategic-public-data-run and both bounded-capture handlers; every cron gate
  now uses the same constant-time, fail-closed check.
- readJsonBody answers 400 for malformed/non-object JSON and 413 for oversized
  bodies. historical-archive read request bodies without any size limit.
  candidate-identity-review and company-credit-review keep client error statuses
  (401/403/400/413) instead of reporting them as 500.
- api/index.ts: a failed Express initialization is no longer memoized for the
  life of the warm instance, and the capture-health probes clear their timers.
- CI runs the backend unit suite, the serverless helper tests and the database
  growth-guard contracts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 05 — Repositório: consultas de uma linha para pipeline/tarefas e guardas de CRM reaproveitados

**Por quê:** `getPipelineByCompany` lia a tabela `pipeline` inteira a cada chamada e `updateTask` recarregava todas as tarefas. Os guardas `asOwner/asPipelineStage/asActivityStatus` duplicavam `lib/crm.ts`.

**Arquivos alterados/criados:**

```
 backend/src/repositories/platformRepository.ts | 64 ++++++++++++++++++++++++++++++++++------------------------------
 1 file changed, 34 insertions(+), 30 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-05
diff --git a/backend/src/repositories/platformRepository.ts b/backend/src/repositories/platformRepository.ts
index b5c5c84ffe9de5e4b5dfadae0ea0038611f59968..21ffdba9dd5481de3c57c138433caa31523391b4 100644
--- a/backend/src/repositories/platformRepository.ts
+++ b/backend/src/repositories/platformRepository.ts
@@ -3,6 +3,7 @@ import { companySeeds, patternCatalogSeeds, searchProfileFilterSeeds, searchProf
 import { env } from '../lib/env.js';
 import { attachCompanyDecisionMetadata } from '../lib/companyDecisionEligibility.js';
 import { getDataClient } from '../lib/dataClient.js';
+import { asOwner, isActivityStatus, isPipelineStage } from '../lib/crm.js';
 import type {
   ActivityRecord,
   CompanyPattern,
@@ -19,7 +20,6 @@ import type {
   SearchProfile,
   SearchProfileFilter,
   SourceCatalogEntry,
-  Owner,
   ActivityStatus,
   TaskRecord,
 } from '../types/platform.js';
@@ -136,18 +136,8 @@ export const searchProfileToRow = (profile: SearchProfile) => ({
   },
   updated_at: new Date().toISOString(),
 });
-const asPipelineStage = (value: string): PipelineStage => {
-  const allowed: PipelineStage[] = ['Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'];
-  return allowed.includes(value as PipelineStage) ? value as PipelineStage : 'Identified';
-};
-const asOwner = (value: string): Owner => {
-  const allowed: Owner[] = ['Origination', 'Coverage', 'Analytics', 'Intelligence', 'Credit', 'Unknown'];
-  return allowed.includes(value as Owner) ? value as Owner : 'Unknown';
-};
-const asActivityStatus = (value: string): ActivityStatus => {
-  const allowed: ActivityStatus[] = ['open', 'done', 'cancelled'];
-  return allowed.includes(value as ActivityStatus) ? value as ActivityStatus : 'open';
-};
+const asPipelineStage = (value: string): PipelineStage => (isPipelineStage(value) ? value : 'Identified');
+const asActivityStatus = (value: string): ActivityStatus => (isActivityStatus(value) ? value : 'open');
 
 class MemoryPlatformRepository implements PlatformRepository {
   private companies = structuredClone(seededCompanies);
@@ -757,11 +747,8 @@ class DatabasePlatformRepository implements PlatformRepository {
     return profile;
   }
 
-  async listPipelineRows() {
-    if (this.shouldUseFallbackForRuntime()) return this.fallback.listPipelineRows();
-    const client = this.ensureClient();
-    const data = await client.select('pipeline', { select: '*', orderBy: { column: 'updated_at', ascending: false } });
-    return (data ?? []).map((row: any) => ({
+  private mapPipelineRow(row: any): PipelineRow {
+    return {
       id: row.id,
       companyId: row.company_id,
       stage: asPipelineStage(row.stage),
@@ -769,12 +756,25 @@ class DatabasePlatformRepository implements PlatformRepository {
       nextAction: row.next_action ?? '',
       createdAt: row.created_at,
       updatedAt: row.updated_at,
-    } satisfies PipelineRow));
+    };
+  }
+
+  async listPipelineRows() {
+    if (this.shouldUseFallbackForRuntime()) return this.fallback.listPipelineRows();
+    const client = this.ensureClient();
+    const data = await client.select('pipeline', { select: '*', orderBy: { column: 'updated_at', ascending: false } });
+    return (data ?? []).map((row: any) => this.mapPipelineRow(row));
   }
 
   async getPipelineByCompany(companyId: string) {
-    const rows = await this.listPipelineRows();
-    return rows.find((item: PipelineRow) => item.companyId === companyId) ?? null;
+    if (this.shouldUseFallbackForRuntime()) return this.fallback.getPipelineByCompany(companyId);
+    // Single-row lookup instead of loading and scanning the whole pipeline table.
+    const rows = await this.ensureClient().select('pipeline', {
+      select: '*',
+      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
+      limit: 1,
+    });
+    return rows?.[0] ? this.mapPipelineRow(rows[0]) : null;
   }
 
   async savePipelineRow(row: Omit<PipelineRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
@@ -866,11 +866,8 @@ class DatabasePlatformRepository implements PlatformRepository {
     return saved;
   }
 
-  async listTasks(companyId?: string) {
-    if (this.shouldUseFallbackForRuntime()) return this.fallback.listTasks(companyId);
-    const client = this.ensureClient();
-    const data = await client.select('tasks', { select: '*', ...(companyId ? { filters: [{ column: 'company_id', operator: 'eq', value: companyId }] } : {}), orderBy: { column: 'created_at', ascending: false } });
-    return (data ?? []).map((row: any) => ({
+  private mapTaskRow(row: any): TaskRecord {
+    return {
       id: row.id,
       companyId: row.company_id,
       title: row.title,
@@ -880,7 +877,14 @@ class DatabasePlatformRepository implements PlatformRepository {
       dueDate: row.due_date ?? row.payload?.due_date ?? null,
       createdAt: row.created_at,
       updatedAt: row.updated_at ?? row.created_at,
-    } satisfies TaskRecord));
+    };
+  }
+
+  async listTasks(companyId?: string) {
+    if (this.shouldUseFallbackForRuntime()) return this.fallback.listTasks(companyId);
+    const client = this.ensureClient();
+    const data = await client.select('tasks', { select: '*', ...(companyId ? { filters: [{ column: 'company_id', operator: 'eq', value: companyId }] } : {}), orderBy: { column: 'created_at', ascending: false } });
+    return (data ?? []).map((row: any) => this.mapTaskRow(row));
   }
 
   async saveTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
@@ -906,7 +910,8 @@ class DatabasePlatformRepository implements PlatformRepository {
   async updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>) {
     if (this.shouldUseFallbackForRuntime()) return this.fallback.updateTask(taskId, updates);
     const client = this.ensureClient();
-    await client.update('tasks', {
+    // `update ... returning *` already yields the row; no need to reload every task.
+    const rows = await client.update('tasks', {
       ...(updates.title !== undefined ? { title: updates.title } : {}),
       ...(updates.description !== undefined ? { description: updates.description } : {}),
       ...(updates.owner !== undefined ? { owner: updates.owner } : {}),
@@ -914,8 +919,7 @@ class DatabasePlatformRepository implements PlatformRepository {
       ...(updates.dueDate !== undefined ? { due_date: updates.dueDate } : {}),
       updated_at: new Date().toISOString(),
     }, [{ column: 'id', operator: 'eq', value: taskId }]);
-    const allTasks = await this.listTasks();
-    return allTasks.find((item: TaskRecord) => item.id === taskId) ?? null;
+    return Array.isArray(rows) && rows[0] ? this.mapTaskRow(rows[0]) : null;
   }
 
   async seedBaseData() {
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-05.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/repositories/*.test.ts && npm -C backend run typecheck
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
perf(repository): single-row pipeline/task lookups; reuse CRM guards

- getPipelineByCompany loaded the whole `pipeline` table and scanned it in JS
  on every move/next-action call; it now selects one row by company_id.
- updateTask reloaded every task after the update; it now maps the row
  returned by `update … returning *`.
- Shared row mappers replace the duplicated inline mapping.
- asOwner/asPipelineStage/asActivityStatus duplicated the guards in
  lib/crm.ts; the repository now uses those.

Verified against the db/neon schema on a local PostgreSQL 16.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
(cherry picked from commit ede219f1a3e66aba51cc26123ddad53da5098c1a)
MSG
```


---

### Tarefa 06 — Remover código duplicado e substituído (~3,7 mil linhas)

**Por quê:** Todos os arquivos removidos são inalcançáveis a partir de qualquer entrypoint (api/*, server.ts, frontend, workflows, scripts npm) e são cópias ou versões substituídas de código vivo: shims Vercel (`backend/api`, `backend/frontend`), cópia do dispatcher (`vercelServerlessHandler.ts`, cujos testes foram portados para `serverless/api-index.test.ts`), `connectors/` da raiz, variantes `*.highSignal.ts`, routers nunca montados, helpers v1 de `modules/data-capture`, scrapers cobertos pelo deep scraper, `lib/agenteTome.ts` (substituído por `api/agentetome.ts`), páginas/painéis do frontend desligados no #386, `tmp/` e `patches/2026-03-25`.

**Arquivos alterados/criados:**

```
 .env.example                         |  7 ++-----
 .gitignore                           |  2 ++
 api/index.ts                         |  4 ++--
 backend/src/lib/env.ts               |  3 ---
 backend/tsconfig.json                |  3 +--
 docs/origination-operating-system.md | 16 ++++++----------
 serverless/api-index.test.ts         | 88 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 7 files changed, 101 insertions(+), 22 deletions(-)
```

**Passo 1 — remover 70 arquivo(s):**

```bash
git rm -q -- \
  'backend/api/data-capture/health.ts' \
  'backend/api/data-capture/run.ts' \
  'backend/api/index.ts' \
  'backend/frontend/api/data-capture/cron/run.ts' \
  'backend/frontend/api/data-capture/health.ts' \
  'backend/frontend/api/data-capture/run.ts' \
  'backend/frontend/api/index.ts' \
  'backend/frontend/package.json' \
  'backend/frontend/vercel.json' \
  'backend/src/data/mockData.ts' \
  'backend/src/lib/agenteTome.test.ts' \
  'backend/src/lib/agenteTome.ts' \
  'backend/src/lib/connectors.runtime.highSignal.ts' \
  'backend/src/lib/discoveryPublicSources.ts' \
  'backend/src/lib/ingestCompanyMonitoring.highSignal.ts' \
  'backend/src/lib/originationSignalScrapers.ts' \
  'backend/src/lib/scrapers/companyCareersScraper.ts' \
  'backend/src/lib/scrapers/companyDocsScraper.ts' \
  'backend/src/lib/scrapers/companyNewsroomScraper.ts' \
  'backend/src/lib/userSync.ts' \
  'backend/src/modules/data-capture/companySiteSeedBuilder.ts' \
  'backend/src/modules/data-capture/companySourcePlanBuilder.ts' \
  'backend/src/modules/data-capture/connectorSourceSeeds.ts' \
  'backend/src/modules/data-capture/contentSectionsExtractor.ts' \
  'backend/src/modules/data-capture/crawlPlanBuilder.ts' \
  'backend/src/modules/data-capture/documentFingerprint.ts' \
  'backend/src/modules/data-capture/feedItemNormalizer.ts' \
  'backend/src/modules/data-capture/monitoringOutputMapper.ts' \
  'backend/src/modules/data-capture/originationSignalLexicon.ts' \
  'backend/src/modules/data-capture/pageClassifier.ts' \
  'backend/src/modules/data-capture/runSummaryBuilder.ts' \
  'backend/src/modules/data-capture/signalExtraction.ts' \
  'backend/src/modules/data-capture/sourceConnectorRegistry.highSignal.ts' \
  'backend/src/modules/data-capture/sourceConnectorRegistry.ts' \
  'backend/src/modules/data-capture/sourceConnectorRunBuilder.ts' \
  'backend/src/modules/data-capture/sourceDocumentMapper.ts' \
  'backend/src/modules/data-capture/sourceDocumentPriority.ts' \
  'backend/src/modules/data-capture/sourceHealthHeuristics.ts' \
  'backend/src/modules/data-capture/sourcePathProfiles.ts' \
  'backend/src/modules/data-capture/urlNormalization.ts' \
  'backend/src/routes/highSignalScraperRouter.ts' \
  'backend/src/routes/originationRouter.ts' \
  'backend/src/routes/searchProfileCaptureRouter.ts' \
  'backend/src/scripts/highSignalSmokeTest.ts' \
  'backend/src/serverless/vercelServerlessHandler.test.ts' \
  'backend/src/serverless/vercelServerlessHandler.ts' \
  'backend/src/types/domain.ts' \
  'backend/src/types/watchlist.ts' \
  'connectors/base/connector.ts' \
  'connectors/http/httpConnector.ts' \
  'connectors/normalizers/companySignalNormalizer.ts' \
  'connectors/rss/rssConnector.ts' \
  'connectors/scraper/scraperConnector.ts' \
  'connectors/sitemap/sitemapConnector.ts' \
  'docs/HIGH_SIGNAL_ACTIVATION_CHECKLIST.txt' \
  'frontend/src/components/CapitalMarketHealthPanel.tsx' \
  'frontend/src/components/VercelOpsPanel.tsx' \
  'frontend/src/components/WatchListWidget.tsx' \
  'frontend/src/config/company-detail-layout.ts' \
  'frontend/src/config/company-detail-sections.ts' \
  'frontend/src/config/dashboard-widgets.ts' \
  'frontend/src/config/nav.foundation.ts' \
  'frontend/src/lib/captureHealthApi.ts' \
  'frontend/src/pages/CaptureInboxPage.tsx' \
  'patches/2026-03-25/step-01-hotfix-mvp-ops-api.diff' \
  'patches/2026-03-25/step-02-pipeline-activities-hardening.md' \
  'patches/2026-03-25/step-03-readiness-intelligence-routes.diff' \
  'patches/2026-03-25/step-04-consolidated-mvp-poc-execution-pack.md' \
  'tmp/noop-removal-marker.txt' \
  'tmp/noop.txt'
```

**Passo 2 — aplicar o patch:**

`````patch tarefa-06
diff --git a/.env.example b/.env.example
index 374ea881adec24bdf2228e01e60dc0091768d307..36db848a6179b6c549caef3c9b8964ce11ca7fc5 100644
--- a/.env.example
+++ b/.env.example
@@ -32,11 +32,8 @@ MAIS_RETORNO_API_BASE_URL=https://data.maisretorno.com/mr-data/v4/api
 MAIS_RETORNO_MONTHLY_QUOTA=500
 MAIS_RETORNO_MONTHLY_TARGET=500
 
-# Agentetome API / MCP
-# Store the real credential only as a server-side secret. Never prefix it with VITE_.
-AGENTETOME_API_KEY=your-agentetome-key
-AGENTETOME_API_BASE_URL=https://www.agentetome.com
-AGENTETOME_MCP_URL=https://www.agentetome.com/api/mcp
+# Agentetome: the API credential lives only in Supabase Vault and is used by the
+# agentetome-* Edge Functions (see db/migrations/128_*). No backend env var.
 
 # Microsoft Planner + To Do — server-side only
 MICROSOFT_CLIENT_ID=your-microsoft-application-client-id
diff --git a/.gitignore b/.gitignore
index dd4ed36bee428da7e3662a9216e9abd574d18a6a..e979e519b339df3f26c82715a6fa76d6ff6ccd4d 100644
--- a/.gitignore
+++ b/.gitignore
@@ -3,3 +3,5 @@ dist
 coverage
 .env
 .DS_Store
+# generated by frontend/scripts/write-build-meta.mjs on every build
+frontend/public/build-meta.json
diff --git a/api/index.ts b/api/index.ts
index 943ebf2eca301e4b049ec1b12858057d006b3ae8..20c173bd4700a3c49dad05eb585a7e387d883ab1 100644
--- a/api/index.ts
+++ b/api/index.ts
@@ -107,8 +107,8 @@ async function insertCaptureAuditRun(input: CaptureAuditRunInput) {
 async function captureHealth(req: IncomingMessage, res: ServerResponse) {
   // Contrato 401 (issue #133 §12): diagnóstico só com bearer válido. Sem
   // CRON_SECRET configurado o endpoint permanece fechado (fail-closed) —
-  // nunca expor env/tabelas sem credencial. Espelha o gate de
-  // backend/src/serverless/vercelServerlessHandler.ts (captureHealth).
+  // nunca expor env/tabelas sem credencial (isCronAuthorized em
+  // serverless/http.ts; contrato coberto por serverless/api-index.test.ts).
   if (!isCronAuthorized(req)) {
     writeJson(res, 401, {
       status: 'partial',
diff --git a/backend/src/lib/env.ts b/backend/src/lib/env.ts
index 18b0a93c0cc0730016dbcfca8c67776998356f6b..b30139b7becc0b83bf1989285e148fb7c51d4559 100644
--- a/backend/src/lib/env.ts
+++ b/backend/src/lib/env.ts
@@ -44,7 +44,4 @@ export const env = {
   maisRetornoApiPath: process.env.MAIS_RETORNO_API_PATH ?? '',
   maisRetornoMonthlyQuota: process.env.MAIS_RETORNO_MONTHLY_QUOTA ?? '500',
   maisRetornoMonthlyTarget: process.env.MAIS_RETORNO_MONTHLY_TARGET ?? '500',
-  agenteTomeApiKey: process.env.AGENTETOME_API_KEY ?? '',
-  agenteTomeApiBaseUrl: process.env.AGENTETOME_API_BASE_URL ?? '',
-  agenteTomeMcpUrl: process.env.AGENTETOME_MCP_URL ?? '',
 };
diff --git a/backend/tsconfig.json b/backend/tsconfig.json
index 665135c8ba0ef30453437c6b5db30515fb1d10f2..9ebfdc227d034178cafe6f228002eb773582f814 100644
--- a/backend/tsconfig.json
+++ b/backend/tsconfig.json
@@ -13,6 +13,5 @@
     "resolveJsonModule": true,
     "types": ["node"]
   },
-  "include": ["src", "../config"],
-  "exclude": ["src/**/*.highSignal.ts"]
+  "include": ["src", "../config"]
 }
diff --git a/docs/origination-operating-system.md b/docs/origination-operating-system.md
index 0cac9470c7544f1fa2b1ec74b1edaff075e697a8..b5f286f6dc136ac6dd80b16cfebaf525f94a5bd4 100644
--- a/docs/origination-operating-system.md
+++ b/docs/origination-operating-system.md
@@ -12,20 +12,16 @@ A implementação transforma o documento operacional em uma camada versionada e
    - Arquivo: `backend/src/modules/originationOperatingSystem.ts`
    - Função: centraliza produtos, estruturas SRM, skills, fluxos, scorecard, templates, comandos, rotinas, backlog e plano de execução.
 
-2. **Rotas Express preparadas**
-   - Arquivo: `backend/src/routes/originationRouter.ts`
-   - Função: expõe o Operating System em rotas internas reaproveitáveis.
+2. **Rotas serverless de produção**
+   - Arquivo: `api/index.ts` (`originationRuntime`), com o loop diário em `api/dcm-daily-operating-loop.ts`.
+   - Função: expõe o Operating System em `/api/origination/*` no único projeto Vercel (raiz do repositório).
+   - O router Express (`originationRouter.ts`) e o shim `backend/frontend/` foram removidos em 05/10/2026: eram cópias não montadas destas rotas.
 
-3. **Rotas serverless de produção**
-   - Arquivo raiz: `api/index.ts`
-   - Arquivo backend-root: `backend/frontend/api/index.ts`
-   - Função: garante que o framework esteja disponível em Vercel nos dois formatos de deploy usados no projeto.
-
-4. **Migration Supabase**
+3. **Migration Supabase**
    - Arquivo: `db/migrations/020_origination_operating_system.sql`
    - Função: cria a tabela `origination_os_artifacts` para persistir artefatos do framework.
 
-5. **Documentação operacional**
+4. **Documentação operacional**
    - Arquivo: `docs/origination-operating-system.md`
    - Função: orientar uso, endpoints e próximos passos.
 
diff --git a/serverless/api-index.test.ts b/serverless/api-index.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e0ef3f840fd4a2055f35a80c6df65f958ceb0dd0
--- /dev/null
+++ b/serverless/api-index.test.ts
@@ -0,0 +1,88 @@
+import assert from 'node:assert/strict';
+import type { IncomingMessage, ServerResponse } from 'node:http';
+import test, { before } from 'node:test';
+
+// Contract tests for the real Vercel dispatcher (api/index.ts). They replace the
+// tests of the removed backend/src/serverless/vercelServerlessHandler.ts copy.
+// Lives outside api/ because every api/*.ts file is a billable Vercel Function.
+for (const key of ['MOTOR_NEON_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']) {
+  delete process.env[key];
+}
+process.env.CRON_SECRET = 'test-secret';
+
+type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
+let handler: Handler;
+before(async () => {
+  // Dynamic import: this file compiles as CommonJS (no top-level await) and the
+  // env above must be in place before the dispatcher loads backend modules.
+  const mod = await import('../api/index.js') as { default: unknown };
+  // ESM interop yields the function; CommonJS interop wraps module.exports.
+  const exported = mod.default as Handler | { default: Handler };
+  handler = typeof exported === 'function' ? exported : exported.default;
+});
+
+const request = (path: string, headers: Record<string, string> = {}) => ({
+  url: path,
+  method: 'GET',
+  headers: { host: 'localhost', ...headers },
+}) as unknown as IncomingMessage;
+
+const response = () => {
+  const captured: { statusCode: number; payload: any } = { statusCode: 0, payload: null };
+  const res = {
+    writeHead(statusCode: number) {
+      captured.statusCode = statusCode;
+      return res;
+    },
+    end(body?: string) {
+      captured.payload = body ? JSON.parse(body) : null;
+    },
+  } as unknown as ServerResponse;
+  return { res, captured };
+};
+
+test('data-capture/health is closed without the cron credential', async () => {
+  const { res, captured } = response();
+  await handler(request('/api/data-capture/health'), res);
+  assert.equal(captured.statusCode, 401);
+  assert.equal(captured.payload.status, 'partial');
+  assert.equal(captured.payload.tables, undefined);
+  assert.equal(captured.payload.env, undefined);
+});
+
+test('data-capture/health rejects a wrong credential', async () => {
+  const { res, captured } = response();
+  await handler(request('/api/data-capture/health', { authorization: 'Bearer wrong-secret' }), res);
+  assert.equal(captured.statusCode, 401);
+  assert.equal(captured.payload.tables, undefined);
+});
+
+test('data-capture/health returns diagnostics for the authorized runtime', async () => {
+  const { res, captured } = response();
+  await handler(request('/api/data-capture/health', { authorization: 'Bearer test-secret' }), res);
+  assert.equal(captured.statusCode, 207);
+  assert.equal(captured.payload.status, 'partial');
+  assert.equal(captured.payload.env.dataProvider, 'memory');
+  assert.ok(Array.isArray(captured.payload.tables));
+  assert.ok(captured.payload.tables.every((table: { ok: boolean }) => table.ok === false));
+  assert.equal(captured.payload.captureRuntime.queryTimeoutMs, 4_000);
+});
+
+test('cron runtimes stay closed without the credential', async () => {
+  for (const path of ['/api/data-capture/run', '/api/data-capture/cron/run', '/api/search-profiles/cron/run']) {
+    const { res, captured } = response();
+    await handler(request(path, { authorization: 'Bearer nope' }), res);
+    assert.equal(captured.statusCode, 401, path);
+  }
+});
+
+test('origination routes answer from the static operating-system module', async () => {
+  const { res, captured } = response();
+  await handler(request('/api/origination/os'), res);
+  assert.equal(captured.statusCode, 200);
+  assert.equal(captured.payload.status, 'real');
+
+  const missing = response();
+  await handler(request('/api/origination/unknown'), missing.res);
+  assert.equal(missing.captured.statusCode, 404);
+});
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-06.patch
```

**Verificar:**

```bash
npm run typecheck && npm run build && npm run test:serverless
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
chore: remove duplicated and superseded code (~3.7k lines)

Every removed file was unreachable from all entry points (api/*, server.ts,
frontend main, workflows, npm scripts) and is a copy or a superseded version of
live code. Verified with an import-graph scan, typecheck, build and all tests.

Vercel shims / duplicated dispatcher
- backend/api/** and backend/frontend/** — shims for a backend-rooted Vercel
  project that no longer exists (only prj_hsB473… with root = repo root).
- backend/src/serverless/vercelServerlessHandler.ts (+test) — a stale copy of
  api/index.ts. Its contract tests now run against the real dispatcher in
  serverless/api-index.test.ts.

Parallel implementations
- connectors/** (root) — never imported; backend/src/lib/connectors* is live.
- *.highSignal.ts, highSignalScraperRouter, highSignalSmokeTest and
  docs/HIGH_SIGNAL_ACTIVATION_CHECKLIST.txt — an unmerged alternative of
  lib/connectors.ts (also drops the tsconfig exclude).
- routes/originationRouter.ts, routes/searchProfileCaptureRouter.ts — never
  mounted; the same routes live in api/index.ts and server.ts.
- modules/data-capture v1 helper cluster (19 files: urlNormalization,
  pageClassifier, signalExtraction, sourceDocumentMapper, …) — re-implemented
  inside dataCaptureEngine.ts / lib/scrapers.
- lib/scrapers/company{Careers,Docs,Newsroom}Scraper — covered by
  companyWebsiteDeepScraper (same paths, with timeouts).
- lib/agenteTome.ts (+test) and the AGENTETOME_* backend env — superseded by
  api/agentetome.ts + Supabase Edge Functions with the key in Vault.
- data/mockData.ts, lib/userSync.ts, lib/discoveryPublicSources.ts,
  types/domain.ts, types/watchlist.ts (copy of the router's types), empty
  lib/originationSignalScrapers.ts.
- frontend: CaptureInboxPage + captureHealthApi (route now renders the
  Candidate Decision Queue), CapitalMarketHealthPanel, WatchListWidget,
  VercelOpsPanel (unwired in #386), four unused config drafts and
  supabaseAuthPayload (Supabase Auth retired).

Leftovers
- tmp/ noop markers and patches/2026-03-25 (diffs already applied in March).
- frontend/public/build-meta.json is generated on every build; now ignored.

Intentionally kept although unused (unique, FIDC/enrichment WIP): services/fidc,
lib/connectors/fidc/{anbima,infosimples,portalTransparencia}, data-enrichment
alias builders, engine-orchestration, self-improvement/learningEventBuilder,
config/catalogs.ts, scripts/smoke/capture-persistence-smoke.mjs, neon.ts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
(cherry picked from commit 1e65490daee8d70afd6aa338bcd83727efd08cdc)
MSG
```


---

### Tarefa 07 — Ingestão: um runner único para os loaders public bulk e strategic

**Por quê:** Os dois serviços eram ~90% iguais (~350 linhas duplicadas). Novo `publicDatasetIngestionRunner.ts`; cada serviço vira um adapter. Corrige: lock `running` preso por 6h após erro inesperado; um dataset com falha descartava os demais; o bulk lançava erro em `--discover-only` sem banco. Os dois serviços passam a usar `getDataClient()` (Neon).

**Arquivos alterados/criados:**

```
 backend/src/services/publicBulkIngestionService.ts        | 426 +++++++++-----------------------------------------------------------------------------------------------------
 backend/src/services/publicDatasetIngestionRunner.test.ts | 188 +++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/services/publicDatasetIngestionRunner.ts      | 516 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/services/strategicPublicIngestionService.ts   | 480 ++++++++++++----------------------------------------------------------------------------------------------------------------
 4 files changed, 784 insertions(+), 826 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-07
diff --git a/backend/src/services/publicBulkIngestionService.ts b/backend/src/services/publicBulkIngestionService.ts
index c655f873d9fa6932a38d5cd3618ff67ad248989f..59c8eb14c97a46960074a9577188ca1c6ceec6fe 100644
--- a/backend/src/services/publicBulkIngestionService.ts
+++ b/backend/src/services/publicBulkIngestionService.ts
@@ -1,16 +1,17 @@
-import { createHash } from 'node:crypto';
 import { getDataClient } from '../lib/dataClient.js';
 import {
   discoverPublicBulkResources,
   streamPublicBulkResource,
   type PublicBulkDatasetCode,
   type PublicBulkRecord,
-  type PublicBulkResource,
 } from '../modules/public-data/publicBulkDatasetConnector.js';
+import {
+  PublicDatasetIngestionRunner,
+  type DataClient,
+  type PublicDatasetIngestionAdapter,
+  type PublicDatasetIngestionOptions,
+} from './publicDatasetIngestionRunner.js';
 
-const STALE_RUN_MS = 6 * 60 * 60 * 1_000;
-const BATCH_SIZE = 100;
-const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
 const sourceCodeFor = (dataset: PublicBulkDatasetCode) => ({
   rfb_cnpj: 'src_rfb_cnpj_bulk',
   pgfn_debt: 'src_pgfn_divida_ativa_bulk',
@@ -20,398 +21,39 @@ const sourceCodeFor = (dataset: PublicBulkDatasetCode) => ({
   compras_contracts: 'src_compras_gov_contracts',
 })[dataset];
 
-export type PublicBulkIngestionOptions = {
-  datasets: PublicBulkDatasetCode[];
-  reference?: string;
-  maxMatchedRows?: number;
-  maxResources?: number;
-  triggerType?: 'manual' | 'schedule' | 'backfill';
-  discoverOnly?: boolean;
-  fullCoverage?: boolean;
-};
-
-type Summary = {
-  datasetCode: PublicBulkDatasetCode;
-  status: 'completed' | 'partial' | 'failed' | 'discovered';
-  resourcesDiscovered: number;
-  resourcesProcessed: number;
-  resourcesSkipped: number;
-  rowsScanned: number;
-  recordsMatched: number;
-  recordsInserted: number;
-  recordsUpdated: number;
-  recordsUnchanged: number;
-  bronzeRowsWritten: number;
-  normalizedRowsWritten: number;
-  outputsWritten: number;
-  signalsWritten: number;
-  errors: string[];
-  resources?: PublicBulkResource[];
-};
-
-type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
-type CheckpointRow = {
-  resource_key: string;
-  resource_modified_at: string | null;
-  etag: string | null;
-  content_hash: string | null;
-  status: string;
-  last_successful_run_at: string | null;
-};
-
-const blank = (datasetCode: PublicBulkDatasetCode): Summary => ({
-  datasetCode,
-  status: 'failed',
-  resourcesDiscovered: 0,
-  resourcesProcessed: 0,
-  resourcesSkipped: 0,
-  rowsScanned: 0,
-  recordsMatched: 0,
-  recordsInserted: 0,
-  recordsUpdated: 0,
-  recordsUnchanged: 0,
-  bronzeRowsWritten: 0,
-  normalizedRowsWritten: 0,
-  outputsWritten: 0,
-  signalsWritten: 0,
-  errors: [],
-});
-
-export class PublicBulkIngestionService {
-  private readonly client = getDataClient();
-
-  async run(options: PublicBulkIngestionOptions) {
-    if (!this.client) throw new Error('Supabase client not configured for public bulk ingestion.');
-    const datasets = [...new Set(options.datasets)];
-    const limits = {
-      maxMatchedRows: Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000)),
-      maxResources: Math.max(1, Math.min(options.maxResources ?? 20, 100)),
-    };
-    const summaries: Summary[] = [];
-    for (const datasetCode of datasets) {
-      summaries.push(await this.runDataset(datasetCode, {
-        ...limits,
-        reference: options.reference,
-        triggerType: options.triggerType ?? 'manual',
-        discoverOnly: options.discoverOnly ?? false,
-        fullCoverage: options.fullCoverage ?? false,
-      }));
-    }
-    const sum = (key: keyof Summary) => summaries.reduce((total, item) => total + Number(item[key] ?? 0), 0);
+export type PublicBulkIngestionOptions = PublicDatasetIngestionOptions<PublicBulkDatasetCode>;
+
+export const publicBulkIngestionAdapter: PublicDatasetIngestionAdapter<PublicBulkDatasetCode, PublicBulkRecord> = {
+  missingClientMessage: 'Persistent data client not configured for public bulk ingestion.',
+  noTargetsMessage: 'Company Master has no valid CNPJ targets.',
+  partialImplementationPhase: 'bulk_loader_active_partial_coverage',
+  sourceCodeFor,
+  discover: (datasetCode, options) => discoverPublicBulkResources(datasetCode, options),
+  stream: (input) => streamPublicBulkResource(input),
+  loadTargetCnpjs: async (client) => {
+    const rows = await client.select('companies', { select: 'id,cnpj', limit: 50_000 }) as Array<{ id: string; cnpj: string | null }>;
+    return new Set(rows.map((row) => String(row.cnpj ?? '').replace(/\D/g, '')).filter((cnpj) => cnpj.length === 14));
+  },
+  syncOutputs: async (client, datasetCode) => {
+    const synced = await client.rpc<{ outputs_written?: number; signals_written?: number }>(
+      'sync_public_dataset_company_outputs',
+      { p_dataset_code: datasetCode },
+    );
     return {
-      status: summaries.every((item) => ['completed', 'discovered'].includes(item.status))
-        ? 'real'
-        : summaries.some((item) => item.status !== 'failed') ? 'partial' : 'failed',
-      generatedAt: new Date().toISOString(),
-      requested: { datasets, reference: options.reference ?? null, ...limits },
-      totals: {
-        resourcesDiscovered: sum('resourcesDiscovered'),
-        resourcesProcessed: sum('resourcesProcessed'),
-        resourcesSkipped: sum('resourcesSkipped'),
-        rowsScanned: sum('rowsScanned'),
-        recordsMatched: sum('recordsMatched'),
-        recordsInserted: sum('recordsInserted'),
-        recordsUpdated: sum('recordsUpdated'),
-        recordsUnchanged: sum('recordsUnchanged'),
-        outputsWritten: sum('outputsWritten'),
-        signalsWritten: sum('signalsWritten'),
-      },
-      datasets: summaries,
+      outputsWritten: Number(synced?.outputs_written ?? 0),
+      signalsWritten: Number(synced?.signals_written ?? 0),
     };
-  }
-
-  private async runDataset(datasetCode: PublicBulkDatasetCode, options: {
-    reference?: string;
-    maxMatchedRows: number;
-    maxResources: number;
-    triggerType: 'manual' | 'schedule' | 'backfill';
-    discoverOnly: boolean;
-    fullCoverage: boolean;
-  }): Promise<Summary> {
-    const summary = blank(datasetCode);
-    let resources: PublicBulkResource[];
-    try {
-      resources = await discoverPublicBulkResources(datasetCode, options);
-      summary.resourcesDiscovered = resources.length;
-      if (options.discoverOnly) {
-        summary.status = 'discovered';
-        summary.resources = resources;
-        return summary;
-      }
-    } catch (error) {
-      summary.errors.push(`discovery: ${errorMessage(error)}`);
-      return summary;
-    }
-
-    const targetRows = await this.client!.select('companies', { select: 'id,cnpj', limit: 50_000 }) as Array<{ id: string; cnpj: string | null }>;
-    const targetCnpjs = new Set(targetRows.map((row) => String(row.cnpj ?? '').replace(/\D/g, '')).filter((cnpj) => cnpj.length === 14));
-    const targetRoots = new Set([...targetCnpjs].map((cnpj) => cnpj.slice(0, 8)));
-    if (!targetCnpjs.size) {
-      summary.errors.push('Company Master has no valid CNPJ targets.');
-      return summary;
-    }
-
-    const sourceCode = sourceCodeFor(datasetCode);
-    const sources = await this.client!.select('source_catalog', { select: 'id,status,health,metadata', limit: 1_000 }) as SourceRow[];
-    const source = sources.find((row) => row.metadata?.code === sourceCode);
-    if (!source) {
-      summary.errors.push(`Source catalog entry not found: ${sourceCode}.`);
-      return summary;
-    }
-
-    const runId = crypto.randomUUID();
-    const startedAt = new Date().toISOString();
-    await this.closeStaleRuns(datasetCode, startedAt);
-    try {
-      await this.client!.insert('public_dataset_runs', [{
-        id: runId,
-        dataset_code: datasetCode,
-        source_id: source.id,
-        trigger_type: options.triggerType,
-        status: 'running',
-        started_at: startedAt,
-        metadata: {
-          reference: options.reference ?? null,
-          maxMatchedRows: options.maxMatchedRows,
-          maxResources: options.maxResources,
-          targetCompanyCount: targetCnpjs.size,
-          fullCoverageRequested: options.fullCoverage,
-        },
-      }]);
-    } catch (error) {
-      summary.status = 'partial';
-      summary.errors.push(`run_lock: ${errorMessage(error)}`);
-      return summary;
-    }
-
-    const checkpointRows = await this.client!.select('public_dataset_resource_checkpoints', {
-      select: 'resource_key,resource_modified_at,etag,content_hash,status,last_successful_run_at',
-      limit: 1_000,
-      filters: [{ column: 'dataset_code', value: datasetCode }],
-    }) as CheckpointRow[];
-    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));
-
-    for (const resource of resources) {
-      if (summary.recordsMatched >= options.maxMatchedRows) break;
-      const previous = checkpoints.get(resource.key);
-      const unchangedResource = options.triggerType === 'schedule'
-        && previous?.status === 'completed'
-        && Boolean(resource.etag || resource.modifiedAt)
-        && (!resource.etag || previous.etag === resource.etag)
-        && (!resource.modifiedAt || previous.resource_modified_at === resource.modifiedAt);
-      if (unchangedResource) {
-        summary.resourcesSkipped += 1;
-        continue;
-      }
-
-      const aggregateHash = createHash('sha256');
-      let pending: PublicBulkRecord[] = [];
-      const flush = async () => {
-        if (!pending.length) return;
-        const result = await this.persistBatch(pending);
-        summary.recordsInserted += result.inserted;
-        summary.recordsUpdated += result.updated;
-        summary.recordsUnchanged += result.unchanged;
-        summary.bronzeRowsWritten += result.written;
-        summary.normalizedRowsWritten += result.written;
-        pending = [];
-      };
-
-      try {
-        const stats = await streamPublicBulkResource({
-          datasetCode,
-          resource,
-          targetCnpjs,
-          targetRoots,
-          maxMatchedRows: options.maxMatchedRows - summary.recordsMatched,
-          onRecord: async (record) => {
-            aggregateHash.update(record.contentHash);
-            pending.push(record);
-            if (pending.length >= BATCH_SIZE) await flush();
-          },
-        });
-        await flush();
-        summary.resourcesProcessed += 1;
-        summary.rowsScanned += stats.rowsScanned;
-        summary.recordsMatched += stats.recordsMatched;
-        await this.saveCheckpoint(datasetCode, source.id, resource, {
-          status: 'completed',
-          contentHash: aggregateHash.digest('hex'),
-          rowsScanned: stats.rowsScanned,
-          recordsMatched: stats.recordsMatched,
-          lastSuccessfulRunAt: startedAt,
-        });
-      } catch (error) {
-        const message = `${resource.name}: ${errorMessage(error)}`;
-        summary.errors.push(message);
-        await this.saveCheckpoint(datasetCode, source.id, resource, {
-          status: 'failed',
-          contentHash: previous?.content_hash ?? null,
-          rowsScanned: 0,
-          recordsMatched: 0,
-          lastSuccessfulRunAt: previous?.last_successful_run_at ?? null,
-          error: message,
-        }).catch(() => undefined);
-      }
-    }
-
-    if (summary.normalizedRowsWritten > 0 || summary.recordsUnchanged > 0) {
-      try {
-        const synced = await this.client!.rpc<{ outputs_written?: number; signals_written?: number }>(
-          'sync_public_dataset_company_outputs',
-          { p_dataset_code: datasetCode },
-        );
-        summary.outputsWritten = Number(synced?.outputs_written ?? 0);
-        summary.signalsWritten = Number(synced?.signals_written ?? 0);
-      } catch (error) {
-        summary.errors.push(`signal_sync: ${errorMessage(error)}`);
-      }
-    }
-
-    const successful = summary.resourcesProcessed > 0 || summary.resourcesSkipped > 0;
-    summary.status = !successful ? 'failed' : summary.errors.length ? 'partial' : 'completed';
-    const finishedAt = new Date().toISOString();
-    await this.client!.update('public_dataset_runs', {
-      status: summary.status,
-      finished_at: finishedAt,
-      resources_discovered: summary.resourcesDiscovered,
-      resources_processed: summary.resourcesProcessed,
-      resources_skipped: summary.resourcesSkipped,
-      rows_scanned: summary.rowsScanned,
-      records_matched: summary.recordsMatched,
-      bronze_rows_written: summary.bronzeRowsWritten,
-      normalized_rows_written: summary.normalizedRowsWritten,
-      outputs_written: summary.outputsWritten,
-      signals_written: summary.signalsWritten,
-      error_message: summary.errors.length ? summary.errors.slice(0, 10).join(' | ') : null,
-      metadata: { reference: options.reference ?? null, targetCompanyCount: targetCnpjs.size, errors: summary.errors },
-      updated_at: finishedAt,
-    }, [{ column: 'id', value: runId }]);
-
-    const fullCoverage = options.fullCoverage
-      && summary.status === 'completed'
-      && summary.resourcesProcessed + summary.resourcesSkipped === summary.resourcesDiscovered;
-    await this.client!.update('source_catalog', {
-      status: fullCoverage ? 'real' : source.status,
-      health: summary.status === 'failed' ? 'degraded' : 'healthy',
-      metadata: {
-        ...(source.metadata ?? {}),
-        implementedRuntime: true,
-        implementationPhase: fullCoverage ? 'runtime_active' : 'bulk_loader_active_partial_coverage',
-        lastLoaderRunAt: finishedAt,
-        lastLoaderStatus: summary.status,
-        lastRowsScanned: summary.rowsScanned,
-        lastRecordsMatched: summary.recordsMatched,
-        fullCoverageAchieved: fullCoverage,
-      },
-      updated_at: finishedAt,
-    }, [{ column: 'id', value: source.id }]);
-    return summary;
-  }
+  },
+};
 
-  private async closeStaleRuns(datasetCode: string, now: string) {
-    const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
-    await this.client!.update('public_dataset_runs', {
-      status: 'failed',
-      finished_at: now,
-      error_message: 'Automatically closed as stale.',
-      updated_at: now,
-    }, [
-      { column: 'dataset_code', value: datasetCode },
-      { column: 'status', value: 'running' },
-      { column: 'started_at', operator: 'lt', value: staleBefore },
-    ]).catch(() => undefined);
-  }
+export class PublicBulkIngestionService {
+  private readonly runner: PublicDatasetIngestionRunner<PublicBulkDatasetCode, PublicBulkRecord>;
 
-  private async persistBatch(records: PublicBulkRecord[]) {
-    const existingRows = await this.client!.select('public_company_records', {
-      select: 'record_key,content_hash',
-      limit: records.length,
-      filters: [
-        { column: 'dataset_code', value: records[0].datasetCode },
-        { column: 'record_key', operator: 'in', value: records.map((record) => record.recordKey) },
-      ],
-    }) as Array<{ record_key: string; content_hash: string | null }>;
-    const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
-    let inserted = 0;
-    let updated = 0;
-    let unchanged = 0;
-    const changed = records.filter((record) => {
-      const previous = existing.get(record.recordKey);
-      if (previous === undefined) { inserted += 1; return true; }
-      if (previous !== record.contentHash) { updated += 1; return true; }
-      unchanged += 1;
-      return false;
-    });
-    if (!changed.length) return { inserted, updated, unchanged, written: 0 };
-    const now = new Date().toISOString();
-    await this.client!.upsert('bronze_historical_records', changed.map((record) => ({
-      dataset_code: record.datasetCode,
-      record_key: record.recordKey,
-      ref_date: record.referenceDate,
-      entity_cnpj: record.entityCnpj,
-      payload: record.rawPayload,
-      source_url: record.sourceUrl,
-      content_hash: record.contentHash,
-      ingested_at: now,
-    })), 'dataset_code,record_key');
-    await this.client!.upsert('public_company_records', changed.map((record) => ({
-      dataset_code: record.datasetCode,
-      source_code: record.sourceCode,
-      record_key: record.recordKey,
-      entity_cnpj: record.entityCnpj,
-      entity_name: record.entityName,
-      record_type: record.recordType,
-      reference_date: record.referenceDate,
-      amount: record.amount,
-      status: record.status,
-      source_url: record.sourceUrl,
-      resource_key: record.resourceKey,
-      content_hash: record.contentHash,
-      raw_payload: record.rawPayload,
-      normalized_payload: record.normalizedPayload,
-      observed_at: now,
-      updated_at: now,
-    })), 'dataset_code,record_key');
-    return { inserted, updated, unchanged, written: changed.length };
+  constructor(client: DataClient | null = getDataClient()) {
+    this.runner = new PublicDatasetIngestionRunner(client, publicBulkIngestionAdapter);
   }
 
-  private async saveCheckpoint(
-    datasetCode: PublicBulkDatasetCode,
-    sourceId: string,
-    resource: PublicBulkResource,
-    state: {
-      status: 'completed' | 'partial' | 'failed';
-      contentHash: string | null;
-      rowsScanned: number;
-      recordsMatched: number;
-      lastSuccessfulRunAt: string | null;
-      error?: string;
-    },
-  ) {
-    const checkedAt = new Date().toISOString();
-    await this.client!.upsert('public_dataset_resource_checkpoints', [{
-      dataset_code: datasetCode,
-      source_id: sourceId,
-      resource_key: resource.key,
-      resource_name: resource.name,
-      resource_url: resource.url,
-      resource_modified_at: resource.modifiedAt ?? null,
-      etag: resource.etag ?? null,
-      content_hash: state.contentHash,
-      status: state.status,
-      last_successful_run_at: state.lastSuccessfulRunAt,
-      last_checked_at: checkedAt,
-      rows_scanned: state.rowsScanned,
-      records_matched: state.recordsMatched,
-      error_message: state.error ?? null,
-      metadata: {
-        format: resource.format,
-        encoding: resource.encoding,
-        delimiter: resource.delimiter,
-        referenceDate: resource.referenceDate,
-      },
-      updated_at: checkedAt,
-    }], 'dataset_code,resource_key');
+  run(options: PublicBulkIngestionOptions) {
+    return this.runner.run(options);
   }
 }
diff --git a/backend/src/services/publicDatasetIngestionRunner.test.ts b/backend/src/services/publicDatasetIngestionRunner.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3da42d2b24df8894114b38b1266cad7b1969a46e
--- /dev/null
+++ b/backend/src/services/publicDatasetIngestionRunner.test.ts
@@ -0,0 +1,188 @@
+import assert from 'node:assert/strict';
+import test from 'node:test';
+import type { PublicBulkResource } from '../modules/public-data/publicBulkDatasetConnector.js';
+import {
+  isUnchangedResource,
+  PublicDatasetIngestionRunner,
+  type DataClient,
+  type PublicDatasetIngestionAdapter,
+  type PublicDatasetRecord,
+} from './publicDatasetIngestionRunner.js';
+
+type Call = { method: string; table: string; payload?: unknown; filters?: unknown };
+
+const resource = (key: string, extra: Partial<PublicBulkResource> = {}): PublicBulkResource => ({
+  key,
+  name: `${key}.csv`,
+  url: `https://data.example/${key}.csv`,
+  format: 'csv',
+  encoding: 'utf-8',
+  delimiter: ';',
+  referenceDate: '2026-09-01',
+  ...extra,
+});
+
+const record = (recordKey: string, contentHash: string): PublicDatasetRecord => ({
+  datasetCode: 'demo',
+  sourceCode: 'src_demo',
+  recordKey,
+  entityCnpj: '17770708000124',
+  entityName: 'Demo SA',
+  recordType: 'registration',
+  referenceDate: '2026-09-01',
+  amount: null,
+  status: 'active',
+  sourceUrl: 'https://data.example/a.csv',
+  resourceKey: 'a',
+  contentHash,
+  rawPayload: { cnpj: '17770708000124' },
+  normalizedPayload: {},
+});
+
+const fakeClient = (overrides: {
+  checkpoints?: unknown[];
+  existingRecords?: Array<{ record_key: string; content_hash: string }>;
+  failInsertRun?: boolean;
+  failCheckpointSelect?: boolean;
+} = {}) => {
+  const calls: Call[] = [];
+  const client = {
+    async select(table: string, options: { filters?: unknown } = {}) {
+      calls.push({ method: 'select', table, filters: options.filters });
+      if (table === 'source_catalog') return [{ id: 'source-1', status: 'partial', health: 'healthy', metadata: { code: 'src_demo', keep: true } }];
+      if (table === 'public_dataset_resource_checkpoints') {
+        if (overrides.failCheckpointSelect) throw new Error('checkpoint table unavailable');
+        return overrides.checkpoints ?? [];
+      }
+      if (table === 'public_company_records') return overrides.existingRecords ?? [];
+      return [];
+    },
+    async insert(table: string, rows: unknown[]) {
+      calls.push({ method: 'insert', table, payload: rows });
+      if (table === 'public_dataset_runs' && overrides.failInsertRun) throw new Error('duplicate running run');
+      return rows;
+    },
+    async upsert(table: string, rows: unknown[]) {
+      calls.push({ method: 'upsert', table, payload: rows });
+      return rows;
+    },
+    async update(table: string, payload: unknown, filters: unknown) {
+      calls.push({ method: 'update', table, payload, filters });
+      return [];
+    },
+    async rpc() {
+      calls.push({ method: 'rpc', table: 'sync' });
+      return null;
+    },
+  };
+  return { client: client as unknown as DataClient, calls };
+};
+
+const adapter = (overrides: Partial<PublicDatasetIngestionAdapter<'demo' | 'other', PublicDatasetRecord>> = {}) => {
+  const synced: string[] = [];
+  const value: PublicDatasetIngestionAdapter<'demo' | 'other', PublicDatasetRecord> = {
+    missingClientMessage: 'no client',
+    noTargetsMessage: 'no targets',
+    partialImplementationPhase: 'partial_phase',
+    runMetadata: { connectorFamily: 'test_family' },
+    sourceCodeFor: () => 'src_demo',
+    discover: async () => [resource('a'), resource('b', { etag: 'etag-b' })],
+    stream: async ({ resource: current, onRecord }) => {
+      if (current.key === 'a') {
+        await onRecord(record('new', 'h1'));
+        await onRecord(record('changed', 'h2-new'));
+        await onRecord(record('same', 'h3'));
+      }
+      return { rowsScanned: 10, recordsMatched: current.key === 'a' ? 3 : 0 };
+    },
+    loadTargetCnpjs: async () => new Set(['17770708000124']),
+    syncOutputs: async (_client, datasetCode) => {
+      synced.push(datasetCode);
+      return { outputsWritten: 2, signalsWritten: 1 };
+    },
+    ...overrides,
+  };
+  return { value, synced };
+};
+
+test('skips unchanged scheduled resources and counts inserted/updated/unchanged records', async () => {
+  const { client, calls } = fakeClient({
+    checkpoints: [{ resource_key: 'b', status: 'completed', etag: 'etag-b', resource_modified_at: null, content_hash: 'x', last_successful_run_at: null }],
+    existingRecords: [{ record_key: 'changed', content_hash: 'h2-old' }, { record_key: 'same', content_hash: 'h3' }],
+  });
+  const { value, synced } = adapter();
+  const result = await new PublicDatasetIngestionRunner(client, value).run({ datasets: ['demo'], triggerType: 'schedule' });
+
+  const [summary] = result.datasets;
+  assert.equal(result.status, 'real');
+  assert.equal(summary.status, 'completed');
+  assert.equal(summary.resourcesProcessed, 1);
+  assert.equal(summary.resourcesSkipped, 1);
+  assert.deepEqual(
+    [summary.recordsInserted, summary.recordsUpdated, summary.recordsUnchanged, summary.normalizedRowsWritten],
+    [1, 1, 1, 2],
+  );
+  assert.deepEqual([summary.outputsWritten, summary.signalsWritten], [2, 1]);
+  assert.deepEqual(synced, ['demo']);
+
+  const bronze = calls.find((call) => call.method === 'upsert' && call.table === 'bronze_historical_records');
+  assert.deepEqual((bronze?.payload as Array<{ record_key: string }>).map((row) => row.record_key), ['new', 'changed']);
+
+  const runInsert = calls.find((call) => call.method === 'insert' && call.table === 'public_dataset_runs');
+  assert.equal((runInsert?.payload as Array<{ metadata: Record<string, unknown> }>)[0].metadata.connectorFamily, 'test_family');
+  const runUpdate = calls.find((call) => call.method === 'update' && call.table === 'public_dataset_runs' && (call.payload as { status: string }).status !== 'failed');
+  assert.equal((runUpdate?.payload as { status: string }).status, 'completed');
+  const sourceUpdate = calls.find((call) => call.method === 'update' && call.table === 'source_catalog');
+  assert.equal((sourceUpdate?.payload as { metadata: Record<string, unknown> }).metadata.implementationPhase, 'partial_phase');
+  assert.equal((sourceUpdate?.payload as { metadata: Record<string, unknown> }).metadata.keep, true);
+});
+
+test('reports a run-lock conflict as partial without touching the run', async () => {
+  const { client, calls } = fakeClient({ failInsertRun: true });
+  const result = await new PublicDatasetIngestionRunner(client, adapter().value).run({ datasets: ['demo'] });
+  assert.equal(result.datasets[0].status, 'partial');
+  assert.match(result.datasets[0].errors[0], /^run_lock: duplicate running run/);
+  assert.equal(calls.some((call) => call.method === 'update' && call.table === 'source_catalog'), false);
+});
+
+test('finalizes the run row when processing fails unexpectedly (no stuck lock)', async () => {
+  const { client, calls } = fakeClient({ failCheckpointSelect: true });
+  const result = await new PublicDatasetIngestionRunner(client, adapter().value).run({ datasets: ['demo'] });
+  assert.equal(result.datasets[0].status, 'failed');
+  assert.match(result.datasets[0].errors.join(' '), /runtime: checkpoint table unavailable/);
+  const finalUpdate = calls.filter((call) => call.method === 'update' && call.table === 'public_dataset_runs').at(-1);
+  assert.equal((finalUpdate?.payload as { status: string }).status, 'failed');
+});
+
+test('keeps other datasets when one dataset throws and supports discovery without a client', async () => {
+  const { client } = fakeClient();
+  let calls = 0;
+  const { value } = adapter({
+    loadTargetCnpjs: async () => {
+      calls += 1;
+      if (calls === 1) throw new Error('companies unavailable');
+      return new Set(['17770708000124']);
+    },
+  });
+  const result = await new PublicDatasetIngestionRunner(client, value).run({ datasets: ['demo', 'other'] });
+  assert.equal(result.datasets.length, 2);
+  assert.match(result.datasets[0].errors[0], /runtime: companies unavailable/);
+  assert.equal(result.datasets[1].status, 'completed');
+  assert.equal(result.status, 'partial');
+
+  const discovered = await new PublicDatasetIngestionRunner(null, adapter().value).run({ datasets: ['demo'], discoverOnly: true });
+  assert.equal(discovered.status, 'real');
+  assert.equal(discovered.datasets[0].resources?.length, 2);
+
+  const missingClient = await new PublicDatasetIngestionRunner(null, adapter().value).run({ datasets: ['demo'] });
+  assert.deepEqual(missingClient.datasets[0].errors, ['no client']);
+});
+
+test('isUnchangedResource only skips scheduled runs with a matching completed checkpoint', () => {
+  const previous = { status: 'completed', etag: 'e1', resource_modified_at: '2026-09-01' };
+  assert.equal(isUnchangedResource('schedule', previous, { etag: 'e1', modifiedAt: '2026-09-01' }), true);
+  assert.equal(isUnchangedResource('manual', previous, { etag: 'e1', modifiedAt: '2026-09-01' }), false);
+  assert.equal(isUnchangedResource('schedule', previous, { etag: 'e2', modifiedAt: '2026-09-01' }), false);
+  assert.equal(isUnchangedResource('schedule', previous, { etag: null, modifiedAt: null }), false);
+  assert.equal(isUnchangedResource('schedule', { ...previous, status: 'failed' }, { etag: 'e1' }), false);
+});
diff --git a/backend/src/services/publicDatasetIngestionRunner.ts b/backend/src/services/publicDatasetIngestionRunner.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ed76b20f0b8f21f61d28e3258618b1f562c6eb34
--- /dev/null
+++ b/backend/src/services/publicDatasetIngestionRunner.ts
@@ -0,0 +1,516 @@
+import { createHash, randomUUID } from 'node:crypto';
+import type { getDataClient } from '../lib/dataClient.js';
+import type { PublicBulkResource } from '../modules/public-data/publicBulkDatasetConnector.js';
+
+/**
+ * Shared runner for the checkpointed public-dataset loaders (public bulk and
+ * strategic public sources). Both services used to carry a ~350-line copy of
+ * this flow; they now only provide an adapter with what actually differs:
+ * discovery/streaming connector, target-company policy, outputs sync and
+ * metadata labels.
+ */
+
+export type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
+export type IngestionTrigger = 'manual' | 'schedule' | 'backfill';
+
+export type PublicDatasetRecord = {
+  datasetCode: string;
+  sourceCode: string;
+  recordKey: string;
+  entityCnpj: string;
+  entityName: string | null;
+  recordType: string;
+  referenceDate: string | null;
+  amount: number | null;
+  status: string | null;
+  sourceUrl: string;
+  resourceKey: string;
+  contentHash: string;
+  rawPayload: Record<string, string>;
+  normalizedPayload: Record<string, unknown>;
+};
+
+export type PublicDatasetIngestionOptions<TCode extends string> = {
+  datasets: TCode[];
+  reference?: string;
+  maxMatchedRows?: number;
+  maxResources?: number;
+  triggerType?: IngestionTrigger;
+  discoverOnly?: boolean;
+  fullCoverage?: boolean;
+};
+
+export type DatasetRunOptions = {
+  reference?: string;
+  maxMatchedRows: number;
+  maxResources: number;
+  triggerType: IngestionTrigger;
+  discoverOnly: boolean;
+  fullCoverage: boolean;
+};
+
+export type IngestionSummary<TCode extends string> = {
+  datasetCode: TCode;
+  status: 'completed' | 'partial' | 'failed' | 'discovered';
+  resourcesDiscovered: number;
+  resourcesProcessed: number;
+  resourcesSkipped: number;
+  rowsScanned: number;
+  recordsMatched: number;
+  recordsInserted: number;
+  recordsUpdated: number;
+  recordsUnchanged: number;
+  bronzeRowsWritten: number;
+  normalizedRowsWritten: number;
+  outputsWritten: number;
+  signalsWritten: number;
+  errors: string[];
+  resources?: PublicBulkResource[];
+};
+
+export type PublicDatasetIngestionAdapter<TCode extends string, TRecord extends PublicDatasetRecord> = {
+  /** Error recorded when no persistent data client is configured. */
+  missingClientMessage: string;
+  /** Error recorded when the target policy yields no company. */
+  noTargetsMessage: string;
+  /** `implementationPhase` written to source_catalog while coverage is partial. */
+  partialImplementationPhase: string;
+  /** Extra metadata merged into run, checkpoint and source rows (labels only). */
+  runMetadata?: Record<string, unknown>;
+  checkpointMetadata?: Record<string, unknown>;
+  sourceMetadata?: (targetCompanyCount: number) => Record<string, unknown>;
+  sourceCodeFor: (datasetCode: TCode) => string;
+  discover: (datasetCode: TCode, options: { reference?: string; maxResources: number }) => Promise<PublicBulkResource[]>;
+  stream: (input: {
+    datasetCode: TCode;
+    resource: PublicBulkResource;
+    targetCnpjs: Set<string>;
+    targetRoots: Set<string>;
+    maxMatchedRows: number;
+    onRecord: (record: TRecord) => Promise<void>;
+  }) => Promise<{ rowsScanned: number; recordsMatched: number }>;
+  /** 14-digit CNPJs of the companies this loader may match. */
+  loadTargetCnpjs: (client: DataClient) => Promise<Set<string>>;
+  syncOutputs: (client: DataClient, datasetCode: TCode) => Promise<{ outputsWritten: number; signalsWritten: number }>;
+};
+
+type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
+type CheckpointRow = {
+  resource_key: string;
+  resource_modified_at: string | null;
+  etag: string | null;
+  content_hash: string | null;
+  status: string;
+  last_successful_run_at: string | null;
+};
+
+const STALE_RUN_MS = 6 * 60 * 60 * 1_000;
+const BATCH_SIZE = 100;
+const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
+
+export const blankIngestionSummary = <TCode extends string>(datasetCode: TCode): IngestionSummary<TCode> => ({
+  datasetCode,
+  status: 'failed',
+  resourcesDiscovered: 0,
+  resourcesProcessed: 0,
+  resourcesSkipped: 0,
+  rowsScanned: 0,
+  recordsMatched: 0,
+  recordsInserted: 0,
+  recordsUpdated: 0,
+  recordsUnchanged: 0,
+  bronzeRowsWritten: 0,
+  normalizedRowsWritten: 0,
+  outputsWritten: 0,
+  signalsWritten: 0,
+  errors: [],
+});
+
+/** A scheduled run skips a resource whose etag/modified date match the last completed checkpoint. */
+export const isUnchangedResource = (
+  triggerType: IngestionTrigger,
+  previous: Pick<CheckpointRow, 'status' | 'etag' | 'resource_modified_at'> | undefined,
+  resource: Pick<PublicBulkResource, 'etag' | 'modifiedAt'>,
+) => triggerType === 'schedule'
+  && previous?.status === 'completed'
+  && Boolean(resource.etag || resource.modifiedAt)
+  && (!resource.etag || previous.etag === resource.etag)
+  && (!resource.modifiedAt || previous.resource_modified_at === resource.modifiedAt);
+
+export class PublicDatasetIngestionRunner<TCode extends string, TRecord extends PublicDatasetRecord> {
+  constructor(
+    private readonly client: DataClient | null,
+    private readonly adapter: PublicDatasetIngestionAdapter<TCode, TRecord>,
+  ) {}
+
+  async run(options: PublicDatasetIngestionOptions<TCode>) {
+    const datasets = [...new Set(options.datasets)];
+    const limits = {
+      maxMatchedRows: Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000)),
+      maxResources: Math.max(1, Math.min(options.maxResources ?? 20, 100)),
+    };
+    const summaries: IngestionSummary<TCode>[] = [];
+
+    for (const datasetCode of datasets) {
+      try {
+        summaries.push(await this.runDataset(datasetCode, {
+          ...limits,
+          reference: options.reference,
+          triggerType: options.triggerType ?? 'manual',
+          discoverOnly: options.discoverOnly ?? false,
+          fullCoverage: options.fullCoverage ?? false,
+        }));
+      } catch (error) {
+        // One dataset failing (e.g. Company Master unreachable) must not discard
+        // the summaries of the datasets already processed.
+        const failed = blankIngestionSummary(datasetCode);
+        failed.errors.push(`runtime: ${errorMessage(error)}`);
+        summaries.push(failed);
+      }
+    }
+
+    const sum = (key: keyof IngestionSummary<TCode>) => summaries.reduce((total, item) => total + Number(item[key] ?? 0), 0);
+    return {
+      status: summaries.every((item) => ['completed', 'discovered'].includes(item.status))
+        ? 'real'
+        : summaries.some((item) => item.status !== 'failed') ? 'partial' : 'failed',
+      generatedAt: new Date().toISOString(),
+      requested: { datasets, reference: options.reference ?? null, ...limits },
+      totals: {
+        resourcesDiscovered: sum('resourcesDiscovered'),
+        resourcesProcessed: sum('resourcesProcessed'),
+        resourcesSkipped: sum('resourcesSkipped'),
+        rowsScanned: sum('rowsScanned'),
+        recordsMatched: sum('recordsMatched'),
+        recordsInserted: sum('recordsInserted'),
+        recordsUpdated: sum('recordsUpdated'),
+        recordsUnchanged: sum('recordsUnchanged'),
+        outputsWritten: sum('outputsWritten'),
+        signalsWritten: sum('signalsWritten'),
+      },
+      datasets: summaries,
+    };
+  }
+
+  private async runDataset(datasetCode: TCode, options: DatasetRunOptions): Promise<IngestionSummary<TCode>> {
+    const summary = blankIngestionSummary(datasetCode);
+    let resources: PublicBulkResource[];
+    try {
+      resources = await this.adapter.discover(datasetCode, options);
+      summary.resourcesDiscovered = resources.length;
+      if (options.discoverOnly) {
+        summary.status = 'discovered';
+        summary.resources = resources;
+        return summary;
+      }
+    } catch (error) {
+      summary.errors.push(`discovery: ${errorMessage(error)}`);
+      return summary;
+    }
+
+    const client = this.client;
+    if (!client) {
+      summary.errors.push(this.adapter.missingClientMessage);
+      return summary;
+    }
+
+    const targetCnpjs = await this.adapter.loadTargetCnpjs(client);
+    const targetRoots = new Set([...targetCnpjs].map((cnpj) => cnpj.slice(0, 8)));
+    if (!targetCnpjs.size) {
+      summary.errors.push(this.adapter.noTargetsMessage);
+      return summary;
+    }
+
+    const sourceCode = this.adapter.sourceCodeFor(datasetCode);
+    const sources = await client.select('source_catalog', { select: 'id,status,health,metadata', limit: 1_000 }) as SourceRow[];
+    const source = sources.find((row) => row.metadata?.code === sourceCode);
+    if (!source) {
+      summary.errors.push(`Source catalog entry not found: ${sourceCode}.`);
+      return summary;
+    }
+
+    const runId = randomUUID();
+    const startedAt = new Date().toISOString();
+    await this.closeStaleRuns(client, datasetCode, startedAt);
+    try {
+      await client.insert('public_dataset_runs', [{
+        id: runId,
+        dataset_code: datasetCode,
+        source_id: source.id,
+        trigger_type: options.triggerType,
+        status: 'running',
+        started_at: startedAt,
+        metadata: {
+          reference: options.reference ?? null,
+          maxMatchedRows: options.maxMatchedRows,
+          maxResources: options.maxResources,
+          targetCompanyCount: targetCnpjs.size,
+          fullCoverageRequested: options.fullCoverage,
+          ...this.adapter.runMetadata,
+        },
+      }]);
+    } catch (error) {
+      summary.status = 'partial';
+      summary.errors.push(`run_lock: ${errorMessage(error)}`);
+      return summary;
+    }
+
+    try {
+      await this.processResources(client, datasetCode, source.id, resources, targetCnpjs, targetRoots, options, startedAt, summary);
+    } catch (error) {
+      // Previously an unexpected error here escaped before the run row was
+      // finalized, leaving it `running` (and the dataset locked) for 6 hours.
+      summary.errors.push(`runtime: ${errorMessage(error)}`);
+    }
+
+    if (summary.normalizedRowsWritten > 0 || summary.recordsUnchanged > 0) {
+      try {
+        const synced = await this.adapter.syncOutputs(client, datasetCode);
+        summary.outputsWritten = synced.outputsWritten;
+        summary.signalsWritten = synced.signalsWritten;
+      } catch (error) {
+        summary.errors.push(`signal_sync: ${errorMessage(error)}`);
+      }
+    }
+
+    const successful = summary.resourcesProcessed > 0 || summary.resourcesSkipped > 0;
+    summary.status = !successful ? 'failed' : summary.errors.length ? 'partial' : 'completed';
+    const finishedAt = new Date().toISOString();
+    await client.update('public_dataset_runs', {
+      status: summary.status,
+      finished_at: finishedAt,
+      resources_discovered: summary.resourcesDiscovered,
+      resources_processed: summary.resourcesProcessed,
+      resources_skipped: summary.resourcesSkipped,
+      rows_scanned: summary.rowsScanned,
+      records_matched: summary.recordsMatched,
+      bronze_rows_written: summary.bronzeRowsWritten,
+      normalized_rows_written: summary.normalizedRowsWritten,
+      outputs_written: summary.outputsWritten,
+      signals_written: summary.signalsWritten,
+      error_message: summary.errors.length ? summary.errors.slice(0, 10).join(' | ') : null,
+      metadata: {
+        reference: options.reference ?? null,
+        targetCompanyCount: targetCnpjs.size,
+        ...this.adapter.runMetadata,
+        errors: summary.errors,
+      },
+      updated_at: finishedAt,
+    }, [{ column: 'id', value: runId }]);
+
+    const fullCoverage = options.fullCoverage
+      && summary.status === 'completed'
+      && summary.resourcesProcessed + summary.resourcesSkipped === summary.resourcesDiscovered;
+    await client.update('source_catalog', {
+      status: fullCoverage ? 'real' : source.status,
+      health: summary.status === 'failed' ? 'degraded' : 'healthy',
+      metadata: {
+        ...(source.metadata ?? {}),
+        implementedRuntime: true,
+        implementationPhase: fullCoverage ? 'runtime_active' : this.adapter.partialImplementationPhase,
+        ...this.adapter.sourceMetadata?.(targetCnpjs.size),
+        lastLoaderRunAt: finishedAt,
+        lastLoaderStatus: summary.status,
+        lastRowsScanned: summary.rowsScanned,
+        lastRecordsMatched: summary.recordsMatched,
+        fullCoverageAchieved: fullCoverage,
+      },
+      updated_at: finishedAt,
+    }, [{ column: 'id', value: source.id }]);
+
+    return summary;
+  }
+
+  private async processResources(
+    client: DataClient,
+    datasetCode: TCode,
+    sourceId: string,
+    resources: PublicBulkResource[],
+    targetCnpjs: Set<string>,
+    targetRoots: Set<string>,
+    options: DatasetRunOptions,
+    startedAt: string,
+    summary: IngestionSummary<TCode>,
+  ) {
+    const checkpointRows = await client.select('public_dataset_resource_checkpoints', {
+      select: 'resource_key,resource_modified_at,etag,content_hash,status,last_successful_run_at',
+      limit: 1_000,
+      filters: [{ column: 'dataset_code', value: datasetCode }],
+    }) as CheckpointRow[];
+    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));
+
+    for (const resource of resources) {
+      if (summary.recordsMatched >= options.maxMatchedRows) break;
+      const previous = checkpoints.get(resource.key);
+      if (isUnchangedResource(options.triggerType, previous, resource)) {
+        summary.resourcesSkipped += 1;
+        continue;
+      }
+
+      const aggregateHash = createHash('sha256');
+      let pending: TRecord[] = [];
+      const flush = async () => {
+        if (!pending.length) return;
+        const result = await this.persistBatch(client, pending);
+        summary.recordsInserted += result.inserted;
+        summary.recordsUpdated += result.updated;
+        summary.recordsUnchanged += result.unchanged;
+        summary.bronzeRowsWritten += result.written;
+        summary.normalizedRowsWritten += result.written;
+        pending = [];
+      };
+
+      try {
+        const stats = await this.adapter.stream({
+          datasetCode,
+          resource,
+          targetCnpjs,
+          targetRoots,
+          maxMatchedRows: options.maxMatchedRows - summary.recordsMatched,
+          onRecord: async (record) => {
+            aggregateHash.update(record.contentHash);
+            pending.push(record);
+            if (pending.length >= BATCH_SIZE) await flush();
+          },
+        });
+        await flush();
+        summary.resourcesProcessed += 1;
+        summary.rowsScanned += stats.rowsScanned;
+        summary.recordsMatched += stats.recordsMatched;
+        await this.saveCheckpoint(client, datasetCode, sourceId, resource, {
+          status: 'completed',
+          contentHash: aggregateHash.digest('hex'),
+          rowsScanned: stats.rowsScanned,
+          recordsMatched: stats.recordsMatched,
+          lastSuccessfulRunAt: startedAt,
+        });
+      } catch (error) {
+        const message = `${resource.name}: ${errorMessage(error)}`;
+        summary.errors.push(message);
+        await this.saveCheckpoint(client, datasetCode, sourceId, resource, {
+          status: 'failed',
+          contentHash: previous?.content_hash ?? null,
+          rowsScanned: 0,
+          recordsMatched: 0,
+          lastSuccessfulRunAt: previous?.last_successful_run_at ?? null,
+          error: message,
+        }).catch(() => undefined);
+      }
+    }
+  }
+
+  private async closeStaleRuns(client: DataClient, datasetCode: string, now: string) {
+    const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
+    await client.update('public_dataset_runs', {
+      status: 'failed',
+      finished_at: now,
+      error_message: 'Automatically closed as stale.',
+      updated_at: now,
+    }, [
+      { column: 'dataset_code', value: datasetCode },
+      { column: 'status', value: 'running' },
+      { column: 'started_at', operator: 'lt', value: staleBefore },
+    ]).catch(() => undefined);
+  }
+
+  private async persistBatch(client: DataClient, records: TRecord[]) {
+    const existingRows = await client.select('public_company_records', {
+      select: 'record_key,content_hash',
+      limit: records.length,
+      filters: [
+        { column: 'dataset_code', value: records[0].datasetCode },
+        { column: 'record_key', operator: 'in', value: records.map((record) => record.recordKey) },
+      ],
+    }) as Array<{ record_key: string; content_hash: string | null }>;
+    const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
+    let inserted = 0;
+    let updated = 0;
+    let unchanged = 0;
+    const changed = records.filter((record) => {
+      const previous = existing.get(record.recordKey);
+      if (previous === undefined) {
+        inserted += 1;
+        return true;
+      }
+      if (previous !== record.contentHash) {
+        updated += 1;
+        return true;
+      }
+      unchanged += 1;
+      return false;
+    });
+    if (!changed.length) return { inserted, updated, unchanged, written: 0 };
+
+    const now = new Date().toISOString();
+    await client.upsert('bronze_historical_records', changed.map((record) => ({
+      dataset_code: record.datasetCode,
+      record_key: record.recordKey,
+      ref_date: record.referenceDate,
+      entity_cnpj: record.entityCnpj,
+      payload: record.rawPayload,
+      source_url: record.sourceUrl,
+      content_hash: record.contentHash,
+      ingested_at: now,
+    })), 'dataset_code,record_key');
+    await client.upsert('public_company_records', changed.map((record) => ({
+      dataset_code: record.datasetCode,
+      source_code: record.sourceCode,
+      record_key: record.recordKey,
+      entity_cnpj: record.entityCnpj,
+      entity_name: record.entityName,
+      record_type: record.recordType,
+      reference_date: record.referenceDate,
+      amount: record.amount,
+      status: record.status,
+      source_url: record.sourceUrl,
+      resource_key: record.resourceKey,
+      content_hash: record.contentHash,
+      raw_payload: record.rawPayload,
+      normalized_payload: record.normalizedPayload,
+      observed_at: now,
+      updated_at: now,
+    })), 'dataset_code,record_key');
+    return { inserted, updated, unchanged, written: changed.length };
+  }
+
+  private async saveCheckpoint(
+    client: DataClient,
+    datasetCode: TCode,
+    sourceId: string,
+    resource: PublicBulkResource,
+    state: {
+      status: 'completed' | 'partial' | 'failed';
+      contentHash: string | null;
+      rowsScanned: number;
+      recordsMatched: number;
+      lastSuccessfulRunAt: string | null;
+      error?: string;
+    },
+  ) {
+    const checkedAt = new Date().toISOString();
+    await client.upsert('public_dataset_resource_checkpoints', [{
+      dataset_code: datasetCode,
+      source_id: sourceId,
+      resource_key: resource.key,
+      resource_name: resource.name,
+      resource_url: resource.url,
+      resource_modified_at: resource.modifiedAt ?? null,
+      etag: resource.etag ?? null,
+      content_hash: state.contentHash,
+      status: state.status,
+      last_successful_run_at: state.lastSuccessfulRunAt,
+      last_checked_at: checkedAt,
+      rows_scanned: state.rowsScanned,
+      records_matched: state.recordsMatched,
+      error_message: state.error ?? null,
+      metadata: {
+        format: resource.format,
+        encoding: resource.encoding,
+        delimiter: resource.delimiter,
+        referenceDate: resource.referenceDate,
+        ...this.adapter.checkpointMetadata,
+      },
+      updated_at: checkedAt,
+    }], 'dataset_code,resource_key');
+  }
+}
diff --git a/backend/src/services/strategicPublicIngestionService.ts b/backend/src/services/strategicPublicIngestionService.ts
index 84c08817b04357bad9f77b50495734137ad0ad20..dd47e0e96139cf1c05b77d8243ca5b1d3b278a21 100644
--- a/backend/src/services/strategicPublicIngestionService.ts
+++ b/backend/src/services/strategicPublicIngestionService.ts
@@ -1,4 +1,3 @@
-import { createHash, randomUUID } from 'node:crypto';
 import { getDataClient } from '../lib/dataClient.js';
 import {
   discoverStrategicPublicResources,
@@ -6,27 +5,22 @@ import {
   type StrategicPublicDatasetCode,
   type StrategicPublicRecord,
 } from '../modules/public-data/strategicPublicDatasetConnector.js';
-import type { PublicBulkResource } from '../modules/public-data/publicBulkDatasetConnector.js';
+import {
+  PublicDatasetIngestionRunner,
+  type DataClient,
+  type PublicDatasetIngestionAdapter,
+  type PublicDatasetIngestionOptions,
+} from './publicDatasetIngestionRunner.js';
 
-const STALE_RUN_MS = 6 * 60 * 60 * 1_000;
-const BATCH_SIZE = 100;
 const TARGET_ELIGIBILITY_POLICY = 'real_identity_verified_monitoring_v1';
-const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
+const CONNECTOR_FAMILY = 'strategic_public_sources_v1';
 
 const sourceCodeFor = (dataset: StrategicPublicDatasetCode) => ({
   rfb_qsa: 'src_rfb_qsa_bulk',
   cvm_fre_capital_structure: 'src_cvm_fre_capital_structure',
 })[dataset];
 
-export type StrategicPublicIngestionOptions = {
-  datasets: StrategicPublicDatasetCode[];
-  reference?: string;
-  maxMatchedRows?: number;
-  maxResources?: number;
-  triggerType?: 'manual' | 'schedule' | 'backfill';
-  discoverOnly?: boolean;
-  fullCoverage?: boolean;
-};
+export type StrategicPublicIngestionOptions = PublicDatasetIngestionOptions<StrategicPublicDatasetCode>;
 
 export type StrategicTargetCompanyRow = {
   id: string;
@@ -62,432 +56,50 @@ export const isEligibleStrategicMonitoringTarget = (row: StrategicTargetCompanyR
     && metadata.entity_resolution_eligible !== false;
 };
 
-type Summary = {
-  datasetCode: StrategicPublicDatasetCode;
-  status: 'completed' | 'partial' | 'failed' | 'discovered';
-  resourcesDiscovered: number;
-  resourcesProcessed: number;
-  resourcesSkipped: number;
-  rowsScanned: number;
-  recordsMatched: number;
-  recordsInserted: number;
-  recordsUpdated: number;
-  recordsUnchanged: number;
-  bronzeRowsWritten: number;
-  normalizedRowsWritten: number;
-  outputsWritten: number;
-  signalsWritten: number;
-  errors: string[];
-  resources?: PublicBulkResource[];
-};
-
-type SourceRow = {
-  id: string;
-  status: string;
-  health: string;
-  metadata?: Record<string, unknown>;
-};
-
-type CheckpointRow = {
-  resource_key: string;
-  resource_modified_at: string | null;
-  etag: string | null;
-  content_hash: string | null;
-  status: string;
-  last_successful_run_at: string | null;
-};
-
-const blank = (datasetCode: StrategicPublicDatasetCode): Summary => ({
-  datasetCode,
-  status: 'failed',
-  resourcesDiscovered: 0,
-  resourcesProcessed: 0,
-  resourcesSkipped: 0,
-  rowsScanned: 0,
-  recordsMatched: 0,
-  recordsInserted: 0,
-  recordsUpdated: 0,
-  recordsUnchanged: 0,
-  bronzeRowsWritten: 0,
-  normalizedRowsWritten: 0,
-  outputsWritten: 0,
-  signalsWritten: 0,
-  errors: [],
-});
-
-export class StrategicPublicIngestionService {
-  private readonly client = getDataClient();
-
-  async run(options: StrategicPublicIngestionOptions) {
-    const datasets = [...new Set(options.datasets)];
-    const limits = {
-      maxMatchedRows: Math.max(1, Math.min(options.maxMatchedRows ?? 100_000, 1_000_000)),
-      maxResources: Math.max(1, Math.min(options.maxResources ?? 20, 100)),
-    };
-    const summaries: Summary[] = [];
-
-    for (const datasetCode of datasets) {
-      summaries.push(await this.runDataset(datasetCode, {
-        ...limits,
-        reference: options.reference,
-        triggerType: options.triggerType ?? 'manual',
-        discoverOnly: options.discoverOnly ?? false,
-        fullCoverage: options.fullCoverage ?? false,
-      }));
-    }
-
-    const sum = (key: keyof Summary) => summaries.reduce((total, item) => total + Number(item[key] ?? 0), 0);
-    return {
-      status: summaries.every((item) => ['completed', 'discovered'].includes(item.status))
-        ? 'real'
-        : summaries.some((item) => item.status !== 'failed') ? 'partial' : 'failed',
-      generatedAt: new Date().toISOString(),
-      requested: { datasets, reference: options.reference ?? null, ...limits },
-      totals: {
-        resourcesDiscovered: sum('resourcesDiscovered'),
-        resourcesProcessed: sum('resourcesProcessed'),
-        resourcesSkipped: sum('resourcesSkipped'),
-        rowsScanned: sum('rowsScanned'),
-        recordsMatched: sum('recordsMatched'),
-        recordsInserted: sum('recordsInserted'),
-        recordsUpdated: sum('recordsUpdated'),
-        recordsUnchanged: sum('recordsUnchanged'),
-        outputsWritten: sum('outputsWritten'),
-        signalsWritten: sum('signalsWritten'),
-      },
-      datasets: summaries,
-    };
-  }
-
-  private async runDataset(datasetCode: StrategicPublicDatasetCode, options: {
-    reference?: string;
-    maxMatchedRows: number;
-    maxResources: number;
-    triggerType: 'manual' | 'schedule' | 'backfill';
-    discoverOnly: boolean;
-    fullCoverage: boolean;
-  }): Promise<Summary> {
-    const summary = blank(datasetCode);
-    let resources: PublicBulkResource[];
-
-    try {
-      resources = await discoverStrategicPublicResources(datasetCode, options);
-      summary.resourcesDiscovered = resources.length;
-      if (options.discoverOnly) {
-        summary.status = 'discovered';
-        summary.resources = resources;
-        return summary;
-      }
-    } catch (error) {
-      summary.errors.push(`discovery: ${errorMessage(error)}`);
-      return summary;
-    }
-
-    if (!this.client) {
-      summary.errors.push('Supabase client not configured for strategic public-data ingestion.');
-      return summary;
-    }
-
-    const targetRows = await this.client.select('companies', {
+export const strategicPublicIngestionAdapter: PublicDatasetIngestionAdapter<StrategicPublicDatasetCode, StrategicPublicRecord> = {
+  missingClientMessage: 'Persistent data client not configured for strategic public-data ingestion.',
+  noTargetsMessage: 'Company Master has no real, identity-verified, monitoring-eligible CNPJ targets.',
+  partialImplementationPhase: 'loader_active_partial_coverage',
+  runMetadata: { targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY, connectorFamily: CONNECTOR_FAMILY },
+  checkpointMetadata: { connectorFamily: CONNECTOR_FAMILY },
+  sourceMetadata: (targetCompanyCount) => ({
+    targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY,
+    lastTargetCompanyCount: targetCompanyCount,
+  }),
+  sourceCodeFor,
+  discover: (datasetCode, options) => discoverStrategicPublicResources(datasetCode, options),
+  stream: (input) => streamStrategicPublicResource(input),
+  loadTargetCnpjs: async (client) => {
+    const rows = await client.select('companies', {
       select: 'id,cnpj,metadata',
       limit: 50_000,
     }) as StrategicTargetCompanyRow[];
-    const eligibleTargets = targetRows.filter(isEligibleStrategicMonitoringTarget);
-    const targetCnpjs = new Set(eligibleTargets.map((row) => normalizeCnpj(row.cnpj)));
-    const targetRoots = new Set([...targetCnpjs].map((cnpj) => cnpj.slice(0, 8)));
-    if (!targetCnpjs.size) {
-      summary.errors.push('Company Master has no real, identity-verified, monitoring-eligible CNPJ targets.');
-      return summary;
-    }
-
-    const sourceCode = sourceCodeFor(datasetCode);
-    const sources = await this.client.select('source_catalog', {
-      select: 'id,status,health,metadata',
-      limit: 1_000,
-    }) as SourceRow[];
-    const source = sources.find((row) => row.metadata?.code === sourceCode);
-    if (!source) {
-      summary.errors.push(`Source catalog entry not found: ${sourceCode}.`);
-      return summary;
-    }
-
-    const runId = randomUUID();
-    const startedAt = new Date().toISOString();
-    await this.closeStaleRuns(datasetCode, startedAt);
-    try {
-      await this.client.insert('public_dataset_runs', [{
-        id: runId,
-        dataset_code: datasetCode,
-        source_id: source.id,
-        trigger_type: options.triggerType,
-        status: 'running',
-        started_at: startedAt,
-        metadata: {
-          reference: options.reference ?? null,
-          maxMatchedRows: options.maxMatchedRows,
-          maxResources: options.maxResources,
-          targetCompanyCount: targetCnpjs.size,
-          targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY,
-          fullCoverageRequested: options.fullCoverage,
-          connectorFamily: 'strategic_public_sources_v1',
-        },
-      }]);
-    } catch (error) {
-      summary.status = 'partial';
-      summary.errors.push(`run_lock: ${errorMessage(error)}`);
-      return summary;
-    }
-
-    const checkpointRows = await this.client.select('public_dataset_resource_checkpoints', {
-      select: 'resource_key,resource_modified_at,etag,content_hash,status,last_successful_run_at',
-      limit: 1_000,
-      filters: [{ column: 'dataset_code', value: datasetCode }],
-    }) as CheckpointRow[];
-    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));
-
-    for (const resource of resources) {
-      if (summary.recordsMatched >= options.maxMatchedRows) break;
-      const previous = checkpoints.get(resource.key);
-      const unchangedResource = options.triggerType === 'schedule'
-        && previous?.status === 'completed'
-        && Boolean(resource.etag || resource.modifiedAt)
-        && (!resource.etag || previous.etag === resource.etag)
-        && (!resource.modifiedAt || previous.resource_modified_at === resource.modifiedAt);
-      if (unchangedResource) {
-        summary.resourcesSkipped += 1;
-        continue;
-      }
-
-      const aggregateHash = createHash('sha256');
-      let pending: StrategicPublicRecord[] = [];
-      const flush = async () => {
-        if (!pending.length) return;
-        const result = await this.persistBatch(pending);
-        summary.recordsInserted += result.inserted;
-        summary.recordsUpdated += result.updated;
-        summary.recordsUnchanged += result.unchanged;
-        summary.bronzeRowsWritten += result.written;
-        summary.normalizedRowsWritten += result.written;
-        pending = [];
-      };
-
-      try {
-        const stats = await streamStrategicPublicResource({
-          datasetCode,
-          resource,
-          targetCnpjs,
-          targetRoots,
-          maxMatchedRows: options.maxMatchedRows - summary.recordsMatched,
-          onRecord: async (record) => {
-            aggregateHash.update(record.contentHash);
-            pending.push(record);
-            if (pending.length >= BATCH_SIZE) await flush();
-          },
-        });
-        await flush();
-        summary.resourcesProcessed += 1;
-        summary.rowsScanned += stats.rowsScanned;
-        summary.recordsMatched += stats.recordsMatched;
-        await this.saveCheckpoint(datasetCode, source.id, resource, {
-          status: 'completed',
-          contentHash: aggregateHash.digest('hex'),
-          rowsScanned: stats.rowsScanned,
-          recordsMatched: stats.recordsMatched,
-          lastSuccessfulRunAt: startedAt,
-        });
-      } catch (error) {
-        const message = `${resource.name}: ${errorMessage(error)}`;
-        summary.errors.push(message);
-        await this.saveCheckpoint(datasetCode, source.id, resource, {
-          status: 'failed',
-          contentHash: previous?.content_hash ?? null,
-          rowsScanned: 0,
-          recordsMatched: 0,
-          lastSuccessfulRunAt: previous?.last_successful_run_at ?? null,
-          error: message,
-        }).catch(() => undefined);
-      }
-    }
-
-    if (summary.normalizedRowsWritten > 0 || summary.recordsUnchanged > 0) {
-      try {
-        const genericSync = await this.client.rpc<{ outputs_written?: number; signals_written?: number }>(
-          'sync_public_dataset_company_outputs',
-          { p_dataset_code: datasetCode },
-        );
-        const strategicSync = await this.client.rpc<{ signals_written?: number }>(
-          'sync_strategic_dataset_company_signals',
-          { p_dataset_code: datasetCode },
-        );
-        summary.outputsWritten = Number(genericSync?.outputs_written ?? 0);
-        summary.signalsWritten = Number(genericSync?.signals_written ?? 0)
-          + Number(strategicSync?.signals_written ?? 0);
-      } catch (error) {
-        summary.errors.push(`signal_sync: ${errorMessage(error)}`);
-      }
-    }
-
-    const successful = summary.resourcesProcessed > 0 || summary.resourcesSkipped > 0;
-    summary.status = !successful ? 'failed' : summary.errors.length ? 'partial' : 'completed';
-    const finishedAt = new Date().toISOString();
-    await this.client.update('public_dataset_runs', {
-      status: summary.status,
-      finished_at: finishedAt,
-      resources_discovered: summary.resourcesDiscovered,
-      resources_processed: summary.resourcesProcessed,
-      resources_skipped: summary.resourcesSkipped,
-      rows_scanned: summary.rowsScanned,
-      records_matched: summary.recordsMatched,
-      bronze_rows_written: summary.bronzeRowsWritten,
-      normalized_rows_written: summary.normalizedRowsWritten,
-      outputs_written: summary.outputsWritten,
-      signals_written: summary.signalsWritten,
-      error_message: summary.errors.length ? summary.errors.slice(0, 10).join(' | ') : null,
-      metadata: {
-        reference: options.reference ?? null,
-        targetCompanyCount: targetCnpjs.size,
-        targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY,
-        connectorFamily: 'strategic_public_sources_v1',
-        errors: summary.errors,
-      },
-      updated_at: finishedAt,
-    }, [{ column: 'id', value: runId }]);
-
-    const fullCoverage = options.fullCoverage
-      && summary.status === 'completed'
-      && summary.resourcesProcessed + summary.resourcesSkipped === summary.resourcesDiscovered;
-    await this.client.update('source_catalog', {
-      status: fullCoverage ? 'real' : source.status,
-      health: summary.status === 'failed' ? 'degraded' : 'healthy',
-      metadata: {
-        ...(source.metadata ?? {}),
-        implementedRuntime: true,
-        implementationPhase: fullCoverage ? 'runtime_active' : 'loader_active_partial_coverage',
-        targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY,
-        lastTargetCompanyCount: targetCnpjs.size,
-        lastLoaderRunAt: finishedAt,
-        lastLoaderStatus: summary.status,
-        lastRowsScanned: summary.rowsScanned,
-        lastRecordsMatched: summary.recordsMatched,
-        fullCoverageAchieved: fullCoverage,
-      },
-      updated_at: finishedAt,
-    }, [{ column: 'id', value: source.id }]);
-
-    return summary;
-  }
-
-  private async closeStaleRuns(datasetCode: string, now: string) {
-    const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
-    await this.client!.update('public_dataset_runs', {
-      status: 'failed',
-      finished_at: now,
-      error_message: 'Automatically closed as stale.',
-      updated_at: now,
-    }, [
-      { column: 'dataset_code', value: datasetCode },
-      { column: 'status', value: 'running' },
-      { column: 'started_at', operator: 'lt', value: staleBefore },
-    ]).catch(() => undefined);
-  }
+    return new Set(rows.filter(isEligibleStrategicMonitoringTarget).map((row) => normalizeCnpj(row.cnpj)));
+  },
+  syncOutputs: async (client, datasetCode) => {
+    const genericSync = await client.rpc<{ outputs_written?: number; signals_written?: number }>(
+      'sync_public_dataset_company_outputs',
+      { p_dataset_code: datasetCode },
+    );
+    const strategicSync = await client.rpc<{ signals_written?: number }>(
+      'sync_strategic_dataset_company_signals',
+      { p_dataset_code: datasetCode },
+    );
+    return {
+      outputsWritten: Number(genericSync?.outputs_written ?? 0),
+      signalsWritten: Number(genericSync?.signals_written ?? 0) + Number(strategicSync?.signals_written ?? 0),
+    };
+  },
+};
 
-  private async persistBatch(records: StrategicPublicRecord[]) {
-    const existingRows = await this.client!.select('public_company_records', {
-      select: 'record_key,content_hash',
-      limit: records.length,
-      filters: [
-        { column: 'dataset_code', value: records[0].datasetCode },
-        { column: 'record_key', operator: 'in', value: records.map((record) => record.recordKey) },
-      ],
-    }) as Array<{ record_key: string; content_hash: string | null }>;
-    const existing = new Map(existingRows.map((row) => [row.record_key, row.content_hash]));
-    let inserted = 0;
-    let updated = 0;
-    let unchanged = 0;
-    const changed = records.filter((record) => {
-      const previous = existing.get(record.recordKey);
-      if (previous === undefined) {
-        inserted += 1;
-        return true;
-      }
-      if (previous !== record.contentHash) {
-        updated += 1;
-        return true;
-      }
-      unchanged += 1;
-      return false;
-    });
-    if (!changed.length) return { inserted, updated, unchanged, written: 0 };
+export class StrategicPublicIngestionService {
+  private readonly runner: PublicDatasetIngestionRunner<StrategicPublicDatasetCode, StrategicPublicRecord>;
 
-    const now = new Date().toISOString();
-    await this.client!.upsert('bronze_historical_records', changed.map((record) => ({
-      dataset_code: record.datasetCode,
-      record_key: record.recordKey,
-      ref_date: record.referenceDate,
-      entity_cnpj: record.entityCnpj,
-      payload: record.rawPayload,
-      source_url: record.sourceUrl,
-      content_hash: record.contentHash,
-      ingested_at: now,
-    })), 'dataset_code,record_key');
-    await this.client!.upsert('public_company_records', changed.map((record) => ({
-      dataset_code: record.datasetCode,
-      source_code: record.sourceCode,
-      record_key: record.recordKey,
-      entity_cnpj: record.entityCnpj,
-      entity_name: record.entityName,
-      record_type: record.recordType,
-      reference_date: record.referenceDate,
-      amount: record.amount,
-      status: record.status,
-      source_url: record.sourceUrl,
-      resource_key: record.resourceKey,
-      content_hash: record.contentHash,
-      raw_payload: record.rawPayload,
-      normalized_payload: record.normalizedPayload,
-      observed_at: now,
-      updated_at: now,
-    })), 'dataset_code,record_key');
-    return { inserted, updated, unchanged, written: changed.length };
+  constructor(client: DataClient | null = getDataClient()) {
+    this.runner = new PublicDatasetIngestionRunner(client, strategicPublicIngestionAdapter);
   }
 
-  private async saveCheckpoint(
-    datasetCode: StrategicPublicDatasetCode,
-    sourceId: string,
-    resource: PublicBulkResource,
-    state: {
-      status: 'completed' | 'partial' | 'failed';
-      contentHash: string | null;
-      rowsScanned: number;
-      recordsMatched: number;
-      lastSuccessfulRunAt: string | null;
-      error?: string;
-    },
-  ) {
-    const checkedAt = new Date().toISOString();
-    await this.client!.upsert('public_dataset_resource_checkpoints', [{
-      dataset_code: datasetCode,
-      source_id: sourceId,
-      resource_key: resource.key,
-      resource_name: resource.name,
-      resource_url: resource.url,
-      resource_modified_at: resource.modifiedAt ?? null,
-      etag: resource.etag ?? null,
-      content_hash: state.contentHash,
-      status: state.status,
-      last_successful_run_at: state.lastSuccessfulRunAt,
-      last_checked_at: checkedAt,
-      rows_scanned: state.rowsScanned,
-      records_matched: state.recordsMatched,
-      error_message: state.error ?? null,
-      metadata: {
-        format: resource.format,
-        encoding: resource.encoding,
-        delimiter: resource.delimiter,
-        referenceDate: resource.referenceDate,
-        connectorFamily: 'strategic_public_sources_v1',
-      },
-      updated_at: checkedAt,
-    }], 'dataset_code,resource_key');
+  run(options: StrategicPublicIngestionOptions) {
+    return this.runner.run(options);
   }
 }
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-07.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/services/publicDatasetIngestionRunner.test.ts backend/src/services/strategicPublicIngestionService.test.ts
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
refactor(ingestion): one checkpointed runner for public bulk and strategic loaders

PublicBulkIngestionService and StrategicPublicIngestionService were ~90%
identical (~350 duplicated lines: run aggregation, run lock, checkpoints,
batch diffing, bronze/normalized upserts, source catalog update). The shared
flow now lives in PublicDatasetIngestionRunner; each service is a small adapter
with what really differs (connector, target-company policy, outputs sync,
metadata labels). Persisted rows, metadata keys, RPCs and messages are
unchanged.

Bugs fixed on the way
- An unexpected error after the `running` row was inserted (e.g. checkpoint
  read failure) escaped before finalization, leaving the dataset locked as
  `running` until the 6h stale sweep. The run is now always finalized.
- One dataset throwing (e.g. Company Master unreachable) aborted the whole run
  and discarded the summaries of datasets already processed; it is now
  reported as that dataset's failure.
- Public bulk threw when no data client existed even for --discover-only;
  discovery now works without a database, like the strategic loader.

New tests cover skip/insert/update/unchanged accounting, run-lock conflicts,
stuck-lock prevention, per-dataset isolation and discovery without a client.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 08 — Dependências: correções não-breaking do npm audit

**Por quê:** 7 vulnerabilidades (4 altas) em dependências transitivas (qs, postcss, nanoid, picomatch, browserslist, @babel/core…). Só o `package-lock.json` muda (patch/minor).

**Arquivos alterados/criados:**

```
 package-lock.json | 247 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------------------------------------------------------------------------------
 1 file changed, 125 insertions(+), 122 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-08
diff --git a/package-lock.json b/package-lock.json
index 2f11a1d5671bf8f03576ea390442d702999339d5..2c1bcf3d5f2786144ad9340ca384663c8d621dfa 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -230,13 +230,13 @@
       }
     },
     "node_modules/@babel/code-frame": {
-      "version": "7.29.0",
-      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz",
-      "integrity": "sha512-9NhCeYjq9+3uxgdtp20LSiJXJvN0FeCtNGpJxuMFZ1Kv3cWUNb6DOhJwUvcVCzKGR66cw4njwM6hrJLqgOwbcw==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz",
+      "integrity": "sha512-Aup7aUOfpbAUg2ROOJN6Iw5f9DMBlzu0mIkm/malLQFN/YQgO48wCj0Kxa3sEHJvPVFg7siR+qRInwXd2qhQKw==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/helper-validator-identifier": "^7.28.5",
+        "@babel/helper-validator-identifier": "^7.29.7",
         "js-tokens": "^4.0.0",
         "picocolors": "^1.1.1"
       },
@@ -245,9 +245,9 @@
       }
     },
     "node_modules/@babel/compat-data": {
-      "version": "7.29.0",
-      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.0.tgz",
-      "integrity": "sha512-T1NCJqT/j9+cn8fvkt7jtwbLBfLC/1y1c7NtCeXFRgzGTsafi68MRv8yzkYSapBnFA6L3U2VSc02ciDzoAJhJg==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.7.tgz",
+      "integrity": "sha512-locTkQyKvwIEgBzVrn8693ebc97F2U8ZHjbXwDXJ5Fn2TCpNwTlKcaKLkdHop5c/icOFE7qt7Q9JC5hnKNa6Gg==",
       "dev": true,
       "license": "MIT",
       "engines": {
@@ -255,21 +255,21 @@
       }
     },
     "node_modules/@babel/core": {
-      "version": "7.29.0",
-      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.0.tgz",
-      "integrity": "sha512-CGOfOJqWjg2qW/Mb6zNsDm+u5vFQ8DxXfbM09z69p5Z6+mE1ikP2jUXw+j42Pf1XTYED2Rni5f95npYeuwMDQA==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.7.tgz",
+      "integrity": "sha512-RgHBCvtjbOK2gXSNBNIkNoEc9qoVEtau3hj8gEqKQuL3HZAibKarWFEI3Lfm6EYKkLalOh8eSrj9b+ch9H/VBA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/code-frame": "^7.29.0",
-        "@babel/generator": "^7.29.0",
-        "@babel/helper-compilation-targets": "^7.28.6",
-        "@babel/helper-module-transforms": "^7.28.6",
-        "@babel/helpers": "^7.28.6",
-        "@babel/parser": "^7.29.0",
-        "@babel/template": "^7.28.6",
-        "@babel/traverse": "^7.29.0",
-        "@babel/types": "^7.29.0",
+        "@babel/code-frame": "^7.29.7",
+        "@babel/generator": "^7.29.7",
+        "@babel/helper-compilation-targets": "^7.29.7",
+        "@babel/helper-module-transforms": "^7.29.7",
+        "@babel/helpers": "^7.29.7",
+        "@babel/parser": "^7.29.7",
+        "@babel/template": "^7.29.7",
+        "@babel/traverse": "^7.29.7",
+        "@babel/types": "^7.29.7",
         "@jridgewell/remapping": "^2.3.5",
         "convert-source-map": "^2.0.0",
         "debug": "^4.1.0",
@@ -286,14 +286,14 @@
       }
     },
     "node_modules/@babel/generator": {
-      "version": "7.29.1",
-      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.1.tgz",
-      "integrity": "sha512-qsaF+9Qcm2Qv8SRIMMscAvG4O3lJ0F1GuMo5HR/Bp02LopNgnZBC/EkbevHFeGs4ls/oPz9v+Bsmzbkbe+0dUw==",
+      "version": "7.29.8",
+      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.8.tgz",
+      "integrity": "sha512-gZbepsdh3WDtgZKWL+vTPh71LSBrm/Y4/QDZBVCcYfmeTEEuoOYwlSy+G1StfJg+/Zy550u/3TATbm7qDbbMtg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/parser": "^7.29.0",
-        "@babel/types": "^7.29.0",
+        "@babel/parser": "^7.29.8",
+        "@babel/types": "^7.29.8",
         "@jridgewell/gen-mapping": "^0.3.12",
         "@jridgewell/trace-mapping": "^0.3.28",
         "jsesc": "^3.0.2"
@@ -303,14 +303,14 @@
       }
     },
     "node_modules/@babel/helper-compilation-targets": {
-      "version": "7.28.6",
-      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.28.6.tgz",
-      "integrity": "sha512-JYtls3hqi15fcx5GaSNL7SCTJ2MNmjrkHXg4FSpOA/grxK8KwyZ5bubHsCq8FXCkua6xhuaaBit+3b7+VZRfcA==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.29.7.tgz",
+      "integrity": "sha512-wem6WaBj4NaVYVdNhLPPVacES6ZJ+KBBfSkTMD3YZxbP3rm3Di85tJU5ljaUNhaOynt+Aj0xruhYuzQBt8n71g==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/compat-data": "^7.28.6",
-        "@babel/helper-validator-option": "^7.27.1",
+        "@babel/compat-data": "^7.29.7",
+        "@babel/helper-validator-option": "^7.29.7",
         "browserslist": "^4.24.0",
         "lru-cache": "^5.1.1",
         "semver": "^6.3.1"
@@ -320,9 +320,9 @@
       }
     },
     "node_modules/@babel/helper-globals": {
-      "version": "7.28.0",
-      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz",
-      "integrity": "sha512-+W6cISkXFa1jXsDEdYA8HeevQT/FULhxzR99pxphltZcVaugps53THCeiWA8SguxxpSp3gKPiuYfSWopkLQ4hw==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.29.7.tgz",
+      "integrity": "sha512-3nQVUAtvkKH9zahfWgw96Jc/uFOmjACE1kQz82E2lqWmHBgjzbNlsC22nuQTfahmWeQtTq5nQ/4Nnd2A1wj4zA==",
       "dev": true,
       "license": "MIT",
       "engines": {
@@ -330,29 +330,29 @@
       }
     },
     "node_modules/@babel/helper-module-imports": {
-      "version": "7.28.6",
-      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.28.6.tgz",
-      "integrity": "sha512-l5XkZK7r7wa9LucGw9LwZyyCUscb4x37JWTPz7swwFE/0FMQAGpiWUZn8u9DzkSBWEcK25jmvubfpw2dnAMdbw==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.29.7.tgz",
+      "integrity": "sha512-ejHwrQQYcm9xnTivShn2IDOlIzInN34AXskvq9QicvCtEzq1Vzclu/tKF8Jq1Cg8JG2GL6/EmjgsCT7lXepE3g==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/traverse": "^7.28.6",
-        "@babel/types": "^7.28.6"
+        "@babel/traverse": "^7.29.7",
+        "@babel/types": "^7.29.7"
       },
       "engines": {
         "node": ">=6.9.0"
       }
     },
     "node_modules/@babel/helper-module-transforms": {
-      "version": "7.28.6",
-      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.6.tgz",
-      "integrity": "sha512-67oXFAYr2cDLDVGLXTEABjdBJZ6drElUSI7WKp70NrpyISso3plG9SAGEF6y7zbha/wOzUByWWTJvEDVNIUGcA==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.29.7.tgz",
+      "integrity": "sha512-UPUVSyXbOh627KiCIGQSgwWzGeBKLkaJ9PJEdrngIwMSzxLR4jS4+f1f1jb7VzBbg8nFLaYotvVPFCTqdrmTAg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/helper-module-imports": "^7.28.6",
-        "@babel/helper-validator-identifier": "^7.28.5",
-        "@babel/traverse": "^7.28.6"
+        "@babel/helper-module-imports": "^7.29.7",
+        "@babel/helper-validator-identifier": "^7.29.7",
+        "@babel/traverse": "^7.29.7"
       },
       "engines": {
         "node": ">=6.9.0"
@@ -372,9 +372,9 @@
       }
     },
     "node_modules/@babel/helper-string-parser": {
-      "version": "7.27.1",
-      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz",
-      "integrity": "sha512-qMlSxKbpRlAridDExk92nSobyDdpPijUq2DW6oDnUqd0iOGxmQjyqhMIihI9+zv4LPyZdRje2cavWPbCbWm3eA==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.29.7.tgz",
+      "integrity": "sha512-Pb5ijPrZ89GDH8223L4UP8i6QApWxs04RbPQJTeWDV0/keR2E36MeKnyr6LYmUUvqRRI+Iv87SuF1W6ErINzYw==",
       "dev": true,
       "license": "MIT",
       "engines": {
@@ -382,9 +382,9 @@
       }
     },
     "node_modules/@babel/helper-validator-identifier": {
-      "version": "7.28.5",
-      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.28.5.tgz",
-      "integrity": "sha512-qSs4ifwzKJSV39ucNjsvc6WVHs6b7S03sOh2OcHF9UHfVPqWWALUsNUVzhSBiItjRZoLHx7nIarVjqKVusUZ1Q==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.29.7.tgz",
+      "integrity": "sha512-qehxGkRj55h/ff8EMaJ+cYhyaKlHIxqYDn682wQD7RNp9UujOQsHog2uS0r2vzr4pW+sXf90NeeayjcNaX3fFg==",
       "dev": true,
       "license": "MIT",
       "engines": {
@@ -392,9 +392,9 @@
       }
     },
     "node_modules/@babel/helper-validator-option": {
-      "version": "7.27.1",
-      "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz",
-      "integrity": "sha512-YvjJow9FxbhFFKDSuFnVCe2WxXk1zWc22fFePVNEaWJEu8IrZVlda6N0uHwzZrUM1il7NC9Mlp4MaJYbYd9JSg==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.29.7.tgz",
+      "integrity": "sha512-N9ZErrD+yW5geCDtBqnOoxmR8+tNKiGuxKlDpuJxfsqpa2dFcexaziGAE/qoHLiDDreVNMupxGmSoNlyvsA3gw==",
       "dev": true,
       "license": "MIT",
       "engines": {
@@ -402,27 +402,27 @@
       }
     },
     "node_modules/@babel/helpers": {
-      "version": "7.29.2",
-      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.2.tgz",
-      "integrity": "sha512-HoGuUs4sCZNezVEKdVcwqmZN8GoHirLUcLaYVNBK2J0DadGtdcqgr3BCbvH8+XUo4NGjNl3VOtSjEKNzqfFgKw==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.7.tgz",
+      "integrity": "sha512-1k2lAGRMfHTcwuNYcCNUmaUffmQv8KWMfh2iJUUeRlwlwH4FdNG7mfPI10NPfLHJFThE4Tyr4mv7kTNZOiPuBg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/template": "^7.28.6",
-        "@babel/types": "^7.29.0"
+        "@babel/template": "^7.29.7",
+        "@babel/types": "^7.29.7"
       },
       "engines": {
         "node": ">=6.9.0"
       }
     },
     "node_modules/@babel/parser": {
-      "version": "7.29.2",
-      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.2.tgz",
-      "integrity": "sha512-4GgRzy/+fsBa72/RZVJmGKPmZu9Byn8o4MoLpmNe1m8ZfYnz5emHLQz3U4gLud6Zwl0RZIcgiLD7Uq7ySFuDLA==",
+      "version": "7.29.9",
+      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.9.tgz",
+      "integrity": "sha512-CjXrNHTnvqBVqHgdBysY3vk2T8tpJHb5/RMeHJBTyVa9xgugCB0CJTx/3oO8RV2QRQP391RWpB7D6hLjm8V9uA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/types": "^7.29.0"
+        "@babel/types": "^7.29.8"
       },
       "bin": {
         "parser": "bin/babel-parser.js"
@@ -464,33 +464,33 @@
       }
     },
     "node_modules/@babel/template": {
-      "version": "7.28.6",
-      "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.28.6.tgz",
-      "integrity": "sha512-YA6Ma2KsCdGb+WC6UpBVFJGXL58MDA6oyONbjyF/+5sBgxY/dwkhLogbMT2GXXyU84/IhRw/2D1Os1B/giz+BQ==",
+      "version": "7.29.7",
+      "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.29.7.tgz",
+      "integrity": "sha512-puq+Gf35oI24FeN11LkoUQFqv9uwNeWpxXZi/Ji3rRIoKAzKnxRaZ+Gkj0vKS9ZCiTESfng1N9LyOyXvo+m+Gg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/code-frame": "^7.28.6",
-        "@babel/parser": "^7.28.6",
-        "@babel/types": "^7.28.6"
+        "@babel/code-frame": "^7.29.7",
+        "@babel/parser": "^7.29.7",
+        "@babel/types": "^7.29.7"
       },
       "engines": {
         "node": ">=6.9.0"
       }
     },
     "node_modules/@babel/traverse": {
-      "version": "7.29.0",
-      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.0.tgz",
-      "integrity": "sha512-4HPiQr0X7+waHfyXPZpWPfWL/J7dcN1mx9gL6WdQVMbPnF3+ZhSMs8tCxN7oHddJE9fhNE7+lxdnlyemKfJRuA==",
+      "version": "7.29.8",
+      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.8.tgz",
+      "integrity": "sha512-I5z7H3bf/41ktsNVLtpN0wAa336HkqIHQ5BuPLEhTkt1jVSyZpeNKIzTgEWmlxjdg81R0IgUCcaE+Ok3NvrfZg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/code-frame": "^7.29.0",
-        "@babel/generator": "^7.29.0",
-        "@babel/helper-globals": "^7.28.0",
-        "@babel/parser": "^7.29.0",
-        "@babel/template": "^7.28.6",
-        "@babel/types": "^7.29.0",
+        "@babel/code-frame": "^7.29.7",
+        "@babel/generator": "^7.29.8",
+        "@babel/helper-globals": "^7.29.7",
+        "@babel/parser": "^7.29.8",
+        "@babel/template": "^7.29.7",
+        "@babel/types": "^7.29.8",
         "debug": "^4.3.1"
       },
       "engines": {
@@ -498,14 +498,14 @@
       }
     },
     "node_modules/@babel/types": {
-      "version": "7.29.0",
-      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.0.tgz",
-      "integrity": "sha512-LwdZHpScM4Qz8Xw2iKSzS+cfglZzJGvofQICy7W7v4caru4EaAmyUuO6BGrbyQ2mYV11W0U8j5mBhd14dd3B0A==",
+      "version": "7.29.8",
+      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.8.tgz",
+      "integrity": "sha512-Vj1jF3cPfxg7OAfoI7QnVKLoILlm2JF9pnVHrX8qx7AHMiYWT+NDAA7jChlNgRS4WTLc/fD1lXLmPixluj+3Gg==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
-        "@babel/helper-string-parser": "^7.27.1",
-        "@babel/helper-validator-identifier": "^7.28.5"
+        "@babel/helper-string-parser": "^7.29.7",
+        "@babel/helper-validator-identifier": "^7.29.7"
       },
       "engines": {
         "node": ">=6.9.0"
@@ -1525,9 +1525,9 @@
       }
     },
     "node_modules/baseline-browser-mapping": {
-      "version": "2.10.9",
-      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.10.9.tgz",
-      "integrity": "sha512-OZd0e2mU11ClX8+IdXe3r0dbqMEznRiT4TfbhYIbcRPZkqJ7Qwer8ij3GZAmLsRKa+II9V1v5czCkvmHH3XZBg==",
+      "version": "2.11.27",
+      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.27.tgz",
+      "integrity": "sha512-ElY12DaROGuan+lMmZ8Cvo/ZUbXPe7Enc/9VU/b1T3Kp4dwytRcNdR8DoSJN5SNJT/CuvcCA0DHDVmMOCePdRQ==",
       "dev": true,
       "license": "Apache-2.0",
       "bin": {
@@ -1575,9 +1575,9 @@
       }
     },
     "node_modules/browserslist": {
-      "version": "4.28.1",
-      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.28.1.tgz",
-      "integrity": "sha512-ZC5Bd0LgJXgwGqUknZY/vkUQ04r8NXnJZ3yYi4vDmSiZmC/pdSN0NbNRPxZpbtO4uAfDUAFffO8IZoM3Gj8IkA==",
+      "version": "4.29.3",
+      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.29.3.tgz",
+      "integrity": "sha512-1R4kiYKXGViqEN0CnoDrXc1StD9niAwu+j2dukWzrD4bJgsD4lDmEp0CRbc6E/vYJIfTHwPmwyaKtVSudICdPA==",
       "dev": true,
       "funding": [
         {
@@ -1595,11 +1595,11 @@
       ],
       "license": "MIT",
       "dependencies": {
-        "baseline-browser-mapping": "^2.9.0",
-        "caniuse-lite": "^1.0.30001759",
-        "electron-to-chromium": "^1.5.263",
-        "node-releases": "^2.0.27",
-        "update-browserslist-db": "^1.2.0"
+        "baseline-browser-mapping": "^2.11.26",
+        "caniuse-lite": "^1.0.30001813",
+        "electron-to-chromium": "^1.5.439",
+        "node-releases": "^2.0.57",
+        "update-browserslist-db": "^1.3.3"
       },
       "bin": {
         "browserslist": "cli.js"
@@ -1647,9 +1647,9 @@
       }
     },
     "node_modules/caniuse-lite": {
-      "version": "1.0.30001780",
-      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001780.tgz",
-      "integrity": "sha512-llngX0E7nQci5BPJDqoZSbuZ5Bcs9F5db7EtgfwBerX9XGtkkiO4NwfDDIRzHTTwcYC8vC7bmeUEPGrKlR/TkQ==",
+      "version": "1.0.30001814",
+      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001814.tgz",
+      "integrity": "sha512-/Uaf1lAzr59XcMpW0o96WoEfr+VXK2OX4U9AgFoiSHsVJ4HppnIFUjtYzsyDH2+tgANaQb2/oxYGwCPapN1FpA==",
       "dev": true,
       "funding": [
         {
@@ -1774,9 +1774,9 @@
       "license": "MIT"
     },
     "node_modules/electron-to-chromium": {
-      "version": "1.5.321",
-      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.321.tgz",
-      "integrity": "sha512-L2C7Q279W2D/J4PLZLk7sebOILDSWos7bMsMNN06rK482umHUrh/3lM8G7IlHFOYip2oAg5nha1rCMxr/rs6ZQ==",
+      "version": "1.5.444",
+      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.444.tgz",
+      "integrity": "sha512-5ss/uJfoDYDHT0lfJzT6FbcskIzROIOPf0BbbFkGcvDzoJU7i//9GDrwwIHQVmIsrAGiF3ihpADBRIsrEFt1rQ==",
       "dev": true,
       "license": "ISC"
     },
@@ -2272,9 +2272,9 @@
       "license": "MIT"
     },
     "node_modules/nanoid": {
-      "version": "3.3.11",
-      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.11.tgz",
-      "integrity": "sha512-N8SpfPUnUp1bK+PMYW8qSWdl9U+wwNWI4QKxOYDy9JAro3WMX7p2OeVRF9v+347pnakNevPmiHhNmZ2HbFA76w==",
+      "version": "3.3.20",
+      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.20.tgz",
+      "integrity": "sha512-uKdg2G3GNCKQn9byYOpxbGqrT2fGO5KRt5J/8b3pok8rT6qxGWF6hxMyJiEYtAf+FVyYuD9hRaDqX5uPFYJ4ZQ==",
       "dev": true,
       "funding": [
         {
@@ -2300,11 +2300,14 @@
       }
     },
     "node_modules/node-releases": {
-      "version": "2.0.36",
-      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.36.tgz",
-      "integrity": "sha512-TdC8FSgHz8Mwtw9g5L4gR/Sh9XhSP/0DEkQxfEFXOpiul5IiHgHan2VhYYb6agDSfp4KuvltmGApc8HMgUrIkA==",
+      "version": "2.0.57",
+      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.57.tgz",
+      "integrity": "sha512-kQK9LGGFiHtrWiNhZtA7Qbw17AQz+dmsEKODRIVTXA9+e5MS/2gZEBhYJt13GrAz5/IOZKddH/0Z3TP/Zgo+yw==",
       "dev": true,
-      "license": "MIT"
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
     },
     "node_modules/object-assign": {
       "version": "4.1.1",
@@ -2464,9 +2467,9 @@
       "license": "ISC"
     },
     "node_modules/picomatch": {
-      "version": "4.0.3",
-      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.3.tgz",
-      "integrity": "sha512-5gTmgEY/sqK6gFXLIsQNH19lWb4ebPDLA4SdLP7dsWkIXHWlG66oPuVvXSGFPppYZz8ZDZq0dYYrbHfBCVUb1Q==",
+      "version": "4.0.7",
+      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz",
+      "integrity": "sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==",
       "dev": true,
       "license": "MIT",
       "engines": {
@@ -2477,9 +2480,9 @@
       }
     },
     "node_modules/postcss": {
-      "version": "8.5.8",
-      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.8.tgz",
-      "integrity": "sha512-OW/rX8O/jXnm82Ey1k44pObPtdblfiuWnrd8X7GJ7emImCOstunGbXUpp7HdBrFQX6rJzn3sPT397Wp5aCwCHg==",
+      "version": "8.5.29",
+      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.29.tgz",
+      "integrity": "sha512-49cGhUbXj8Qenv0iTMxA1cFBzxXoctpC9Ujd77t1WcbJIr6nF/eI7g/8MgxrYldFRuAXvja7xQRwavoW7kgrxQ==",
       "dev": true,
       "funding": [
         {
@@ -2497,9 +2500,9 @@
       ],
       "license": "MIT",
       "dependencies": {
-        "nanoid": "^3.3.11",
+        "nanoid": "^3.3.19",
         "picocolors": "^1.1.1",
-        "source-map-js": "^1.2.1"
+        "source-map-js": "^1.2.2"
       },
       "engines": {
         "node": "^10 || ^12 || >=14"
@@ -2558,9 +2561,9 @@
       }
     },
     "node_modules/qs": {
-      "version": "6.15.3",
-      "resolved": "https://registry.npmjs.org/qs/-/qs-6.15.3.tgz",
-      "integrity": "sha512-O9gl3zCl5h5blw1KGUzQKhA5oUXSl8rwUIM5o0S3nCXMliSvy5Dzx7/DJcI+SwgICv+IneSZwhBh1oSyEHA71A==",
+      "version": "6.16.0",
+      "resolved": "https://registry.npmjs.org/qs/-/qs-6.16.0.tgz",
+      "integrity": "sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==",
       "license": "BSD-3-Clause",
       "dependencies": {
         "es-define-property": "^1.0.1",
@@ -2812,9 +2815,9 @@
       }
     },
     "node_modules/source-map-js": {
-      "version": "1.2.1",
-      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
-      "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
+      "version": "1.2.2",
+      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz",
+      "integrity": "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==",
       "dev": true,
       "license": "BSD-3-Clause",
       "engines": {
@@ -2933,9 +2936,9 @@
       }
     },
     "node_modules/update-browserslist-db": {
-      "version": "1.2.3",
-      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.2.3.tgz",
-      "integrity": "sha512-Js0m9cx+qOgDxo0eMiFGEueWztz+d4+M3rGlmKPT+T4IS/jP4ylw3Nwpu6cpTTP8R1MAC1kF4VbdLt3ARf209w==",
+      "version": "1.3.3",
+      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.3.3.tgz",
+      "integrity": "sha512-pJ2sYawQS0R/WI928Gj5GlPhTGzbMelq0+4INtSYNDV9ErKJcX6xjGWkoG/VnB3dpUm00zALaqkrUD77pO5TDQ==",
       "dev": true,
       "funding": [
         {
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-08.patch
```

**Se falhar:** Se este patch não aplicar (lockfile divergente), rode `npm audit fix` (sem `--force`), pule a tarefa 14 e confirme `found 0 vulnerabilities`.

**Verificar:**

```bash
npm ci   # o gate de auditoria completo é conferido na tarefa 14
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
chore(deps): apply non-breaking npm audit fixes

npm audit reported 7 advisories (4 high) in transitive dependencies: qs (via
express), postcss, nanoid, picomatch, browserslist, baseline-browser-mapping
and @babel/core (Vite/React tooling). `npm audit fix` (no --force) moves them
to patched patch/minor releases; only package-lock.json changes. 0
vulnerabilities after the fix; npm ci, build and tests pass.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 09 — CLIs: parser de argumentos compartilhado

**Por quê:** 14 CLIs carregavam sua própria cópia do parser `--nome valor` (duas variantes) e de `positiveNumber/integerOption`. Novo `backend/src/cli/args.ts`; os flags usados pelos workflows continuam idênticos.

**Arquivos alterados/criados:**

```
 backend/src/cli/args.test.ts                   | 20 ++++++++++++++++++++
 backend/src/cli/args.ts                        | 25 +++++++++++++++++++++++++
 backend/src/cli/bndesAutomaticDatastore.ts     | 15 ++-------------
 backend/src/cli/candidateBcbIdentity.ts        |  9 +++------
 backend/src/cli/candidateCvmRegistry.ts        |  9 +++------
 backend/src/cli/candidateDomainIntelligence.ts | 11 ++++-------
 backend/src/cli/candidateNewsSemantics.ts      |  9 +++------
 backend/src/cli/candidateWebsiteIdentity.ts    |  9 +++------
 backend/src/cli/capitalMarketDelivery.ts       |  9 ++-------
 backend/src/cli/capitalMarkets.ts              |  9 ++-------
 backend/src/cli/finepPublicData.ts             |  9 ++-------
 backend/src/cli/probeRfbQsa.ts                 | 16 ++--------------
 backend/src/cli/probeStrategicPublicData.ts    |  9 ++-------
 backend/src/cli/publicBulkData.ts              | 15 ++-------------
 backend/src/cli/qsaFallback.ts                 | 15 ++-------------
 backend/src/cli/strategicPublicData.ts         | 15 ++-------------
 16 files changed, 79 insertions(+), 125 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-09
diff --git a/backend/src/cli/args.test.ts b/backend/src/cli/args.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..49d4ec1cf54c2bbcf17c87d1530de9c469575ce6
--- /dev/null
+++ b/backend/src/cli/args.test.ts
@@ -0,0 +1,20 @@
+import assert from 'node:assert/strict';
+import test from 'node:test';
+import { parseCliArgs } from './args.js';
+
+test('parseCliArgs reads --name value and --name=value forms', () => {
+  const cli = parseCliArgs(['--limit', '30', '--tiers=P1,P2', '--force']);
+  assert.equal(cli.valueFor('limit'), '30');
+  assert.equal(cli.valueFor('tiers'), 'P1,P2');
+  assert.equal(cli.valueFor('missing'), undefined);
+  assert.ok(cli.args.includes('--force'));
+});
+
+test('numeric options validate and clamp', () => {
+  const cli = parseCliArgs(['--limit', '30', '--bad', 'abc', '--zero', '0']);
+  assert.equal(cli.integerOption('limit', 5, 10), 10);
+  assert.equal(cli.integerOption('absent', 5, 10), 5);
+  assert.throws(() => cli.integerOption('bad', 1, 5), /Invalid --bad/);
+  assert.equal(cli.positiveNumber('limit', 1), 30);
+  assert.throws(() => cli.positiveNumber('zero', 1), /--zero must be a positive number/);
+});
diff --git a/backend/src/cli/args.ts b/backend/src/cli/args.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3c8c1d4d163c1f776fcde9ff34e28db4a1d930d1
--- /dev/null
+++ b/backend/src/cli/args.ts
@@ -0,0 +1,25 @@
+/** Minimal `--name value` / `--name=value` parser shared by the operational CLIs. */
+export const parseCliArgs = (argv: string[] = process.argv.slice(2)) => {
+  const valueFor = (name: string) => {
+    const inline = argv.find((argument) => argument.startsWith(`--${name}=`));
+    if (inline) return inline.slice(name.length + 3);
+    const index = argv.indexOf(`--${name}`);
+    return index >= 0 ? argv[index + 1] : undefined;
+  };
+
+  /** Finite number > 0, or throws. */
+  const positiveNumber = (name: string, fallback: number) => {
+    const value = Number(valueFor(name) ?? fallback);
+    if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
+    return value;
+  };
+
+  /** Integer clamped to [1, maximum], or throws when not numeric. */
+  const integerOption = (name: string, fallback: number, maximum: number) => {
+    const parsed = Number(valueFor(name) ?? fallback);
+    if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${valueFor(name)}`);
+    return Math.max(1, Math.min(Math.trunc(parsed), maximum));
+  };
+
+  return { args: argv, valueFor, positiveNumber, integerOption };
+};
diff --git a/backend/src/cli/bndesAutomaticDatastore.ts b/backend/src/cli/bndesAutomaticDatastore.ts
index f0eb5cbff82c712d3ec9ce6d5ec3875ea6a69967..87c0a0b69a34732f04bd2ac5d4f54bbcf4e27d59 100644
--- a/backend/src/cli/bndesAutomaticDatastore.ts
+++ b/backend/src/cli/bndesAutomaticDatastore.ts
@@ -1,19 +1,8 @@
 import { BndesAutomaticDatastoreService } from '../services/bndesAutomaticDatastoreService.js';
 import { PublicDataDownstreamService } from '../services/publicDataDownstreamService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
-const positiveNumber = (name: string, fallback: number) => {
-  const value = Number(valueFor(name) ?? fallback);
-  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
-  return value;
-};
-
+const { args, valueFor, positiveNumber } = parseCliArgs();
 const ingestion = await new BndesAutomaticDatastoreService().run({
   targetBatchSize: positiveNumber('target-batch-size', 25),
   maxTargetBatches: positiveNumber('max-target-batches', 100),
diff --git a/backend/src/cli/candidateBcbIdentity.ts b/backend/src/cli/candidateBcbIdentity.ts
index a1390ee1fa63f8bd7952eb621b91c80f1a72c31f..b7b9e564a03c4e92a208146cd7e9907848b43788 100644
--- a/backend/src/cli/candidateBcbIdentity.ts
+++ b/backend/src/cli/candidateBcbIdentity.ts
@@ -1,12 +1,9 @@
 import { CandidateBcbIdentityService } from '../services/candidateBcbIdentityService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (flag: string) => {
-  const index = args.indexOf(flag);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 
-const parsedLimit = Number(valueFor('--limit') ?? 100);
+const parsedLimit = Number(valueFor('limit') ?? 100);
 const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100;
 
 const service = new CandidateBcbIdentityService();
diff --git a/backend/src/cli/candidateCvmRegistry.ts b/backend/src/cli/candidateCvmRegistry.ts
index 02ed376bc827d07c94385066bbcaef7170785067..b54f2abfd8a00c383194bc925536ffbbf9d6f84a 100644
--- a/backend/src/cli/candidateCvmRegistry.ts
+++ b/backend/src/cli/candidateCvmRegistry.ts
@@ -1,11 +1,8 @@
 import { CandidateCvmRegistryService } from '../services/candidateCvmRegistryService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (flag: string) => {
-  const index = args.indexOf(flag);
-  return index >= 0 ? args[index + 1] : undefined;
-};
-const trigger = valueFor('--trigger');
+const { args, valueFor } = parseCliArgs();
+const trigger = valueFor('trigger');
 const triggerType = trigger === 'schedule' || trigger === 'backfill' ? trigger : 'manual';
 const force = args.includes('--force');
 
diff --git a/backend/src/cli/candidateDomainIntelligence.ts b/backend/src/cli/candidateDomainIntelligence.ts
index 585cec232c183a437d21d1f1f2eaa099f6c334f6..20432dcad8819839161adaf0723821d98f86d8d7 100644
--- a/backend/src/cli/candidateDomainIntelligence.ts
+++ b/backend/src/cli/candidateDomainIntelligence.ts
@@ -1,15 +1,12 @@
 import { CandidateDomainIntelligenceService } from '../services/candidateDomainIntelligenceService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (flag: string) => {
-  const index = args.indexOf(flag);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 const hasFlag = (flag: string) => args.includes(flag);
 
-const parsedLimit = Number(valueFor('--limit') ?? 50);
+const parsedLimit = Number(valueFor('limit') ?? 50);
 const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 50;
-const tiers = String(valueFor('--tiers') ?? 'P1,P2,P3')
+const tiers = String(valueFor('tiers') ?? 'P1,P2,P3')
   .split(',')
   .map((value) => value.trim())
   .filter(Boolean);
diff --git a/backend/src/cli/candidateNewsSemantics.ts b/backend/src/cli/candidateNewsSemantics.ts
index 9dab352363eee177a5d41cc586e4110a3d784558..24bb9f64e6c8d81f07f98ec9c3fd71e8cc40026c 100644
--- a/backend/src/cli/candidateNewsSemantics.ts
+++ b/backend/src/cli/candidateNewsSemantics.ts
@@ -1,12 +1,9 @@
 import { CandidateNewsSemanticsService } from '../services/candidateNewsSemanticsService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (flag: string) => {
-  const index = args.indexOf(flag);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 
-const parsedLimit = Number(valueFor('--limit') ?? 250);
+const parsedLimit = Number(valueFor('limit') ?? 250);
 const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 250;
 const force = args.includes('--force');
 
diff --git a/backend/src/cli/candidateWebsiteIdentity.ts b/backend/src/cli/candidateWebsiteIdentity.ts
index a53c4a090c7056229ea330c4632cdd9b2b8a8515..c8b698a24afa8df626f35a7729065de0fffaa3f6 100644
--- a/backend/src/cli/candidateWebsiteIdentity.ts
+++ b/backend/src/cli/candidateWebsiteIdentity.ts
@@ -1,12 +1,9 @@
 import { CandidateWebsiteIdentityService } from '../services/candidateWebsiteIdentityService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (flag: string) => {
-  const index = args.indexOf(flag);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 
-const parsedLimit = Number(valueFor('--limit') ?? 30);
+const parsedLimit = Number(valueFor('limit') ?? 30);
 const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 30;
 
 const service = new CandidateWebsiteIdentityService();
diff --git a/backend/src/cli/capitalMarketDelivery.ts b/backend/src/cli/capitalMarketDelivery.ts
index ab955144b4c0913249483e648bf3516e99ba0476..c055f32189241877c2098ab1356146920f0dd418 100644
--- a/backend/src/cli/capitalMarketDelivery.ts
+++ b/backend/src/cli/capitalMarketDelivery.ts
@@ -1,13 +1,8 @@
 import { CVM_DATASETS, type CvmDatasetCode } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
 import { CapitalMarketDeliveryService } from '../services/capitalMarketDeliveryService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 
 const datasetArgument = valueFor('dataset') ?? 'all';
 const datasets = datasetArgument === 'all'
diff --git a/backend/src/cli/capitalMarkets.ts b/backend/src/cli/capitalMarkets.ts
index 217b5f31909a003fae47950084550efe4d3ffdb1..6bddfb1e18c35733a57df6852bd79356836a1331 100644
--- a/backend/src/cli/capitalMarkets.ts
+++ b/backend/src/cli/capitalMarkets.ts
@@ -2,14 +2,9 @@ import { CVM_DATASETS, type CvmDatasetCode } from '../modules/capital-markets/cv
 import { evaluateCapitalMarketDeliveryAssertions } from '../services/capitalMarketAssertions.js';
 import { CapitalMarketDeliveryService } from '../services/capitalMarketDeliveryService.js';
 import { CapitalMarketIngestionService } from '../services/capitalMarketIngestionService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 
 const datasetArgument = valueFor('dataset') ?? 'all';
 const datasets = datasetArgument === 'all'
diff --git a/backend/src/cli/finepPublicData.ts b/backend/src/cli/finepPublicData.ts
index 141300f6fde049b8cc96ef69ba581403fb9840bf..5fceeb8dd83a1412ea0bf5ae9cdffacd85e6b6f2 100644
--- a/backend/src/cli/finepPublicData.ts
+++ b/backend/src/cli/finepPublicData.ts
@@ -1,12 +1,7 @@
 import { FinepPublicIngestionService } from '../services/finepPublicIngestionService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 const positiveInteger = (name: string, fallback: number, maximum: number) => {
   const parsed = Number(valueFor(name) ?? fallback);
   if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive number.`);
diff --git a/backend/src/cli/probeRfbQsa.ts b/backend/src/cli/probeRfbQsa.ts
index 660efa0909aa83dd9802ca6cd2465a4f64ba4ff5..d4a351b87023164de703ee11f37e64556cfbf080 100644
--- a/backend/src/cli/probeRfbQsa.ts
+++ b/backend/src/cli/probeRfbQsa.ts
@@ -4,22 +4,10 @@ import {
   streamStrategicPublicResource,
 } from '../modules/public-data/strategicPublicDatasetConnector.js';
 import { isValidCnpj, normalizeCnpj } from '../services/strategicPublicIngestionService.js';
+import { parseCliArgs } from './args.js';
 
 const DATASET = 'rfb_qsa' as const;
-const args = process.argv.slice(2);
-
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
-
-const integerOption = (name: string, fallback: number, maximum: number) => {
-  const parsed = Number(valueFor(name) ?? fallback);
-  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${valueFor(name)}`);
-  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
-};
+const { args, valueFor, integerOption } = parseCliArgs();
 
 const requestedCnpj = valueFor('cnpj');
 if (!requestedCnpj || !isValidCnpj(requestedCnpj)) {
diff --git a/backend/src/cli/probeStrategicPublicData.ts b/backend/src/cli/probeStrategicPublicData.ts
index a04e531043efe6e9d6c10bd7a2a8f3618a948532..38e0a2483011499e639d873fe65d68cc201ae397 100644
--- a/backend/src/cli/probeStrategicPublicData.ts
+++ b/backend/src/cli/probeStrategicPublicData.ts
@@ -3,14 +3,9 @@ import {
   streamStrategicPublicResource,
   type StrategicPublicDatasetCode,
 } from '../modules/public-data/strategicPublicDatasetConnector.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor } = parseCliArgs();
 
 const dataset = (valueFor('dataset') ?? 'cvm_fre_capital_structure') as StrategicPublicDatasetCode;
 if (dataset !== 'cvm_fre_capital_structure') {
diff --git a/backend/src/cli/publicBulkData.ts b/backend/src/cli/publicBulkData.ts
index 7c9bb46be035e4ccb18f3647b8662c70ac26224c..9be1fc6c89d8b6b90877074c7290fffdb6c2c66e 100644
--- a/backend/src/cli/publicBulkData.ts
+++ b/backend/src/cli/publicBulkData.ts
@@ -3,6 +3,7 @@ import {
 } from '../modules/public-data/publicBulkDatasetConnector.js';
 import { PublicBulkIngestionService } from '../services/publicBulkIngestionService.js';
 import { PublicDataDownstreamService } from '../services/publicDataDownstreamService.js';
+import { parseCliArgs } from './args.js';
 
 const DATASETS: PublicBulkDatasetCode[] = [
   'rfb_cnpj',
@@ -13,13 +14,7 @@ const DATASETS: PublicBulkDatasetCode[] = [
   'compras_contracts',
 ];
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor, positiveNumber } = parseCliArgs();
 
 const datasetArgument = valueFor('dataset') ?? 'all';
 const datasets = datasetArgument === 'all'
@@ -28,12 +23,6 @@ const datasets = datasetArgument === 'all'
 const invalid = datasets.filter((dataset) => !DATASETS.includes(dataset));
 if (invalid.length) throw new Error(`Invalid dataset(s): ${invalid.join(', ')}.`);
 
-const positiveNumber = (name: string, fallback: number) => {
-  const value = Number(valueFor(name) ?? fallback);
-  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
-  return value;
-};
-
 const discoverOnly = args.includes('--discover-only');
 const ingestion = await new PublicBulkIngestionService().run({
   datasets,
diff --git a/backend/src/cli/qsaFallback.ts b/backend/src/cli/qsaFallback.ts
index 11aa0215102a48744be16c3e3b3dafde696f62b3..d7d0df49c3d598a0d33e226bb4525e1e95851f30 100644
--- a/backend/src/cli/qsaFallback.ts
+++ b/backend/src/cli/qsaFallback.ts
@@ -1,18 +1,7 @@
 import { QsaFallbackIngestionService } from '../services/qsaFallbackIngestionService.js';
+import { parseCliArgs } from './args.js';
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
-
-const integerOption = (name: string, fallback: number, maximum: number) => {
-  const parsed = Number(valueFor(name) ?? fallback);
-  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${valueFor(name)}`);
-  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
-};
+const { args, valueFor, integerOption } = parseCliArgs();
 
 const trigger = (valueFor('trigger') ?? 'manual') as 'manual' | 'schedule' | 'backfill';
 if (!['manual', 'schedule', 'backfill'].includes(trigger)) {
diff --git a/backend/src/cli/strategicPublicData.ts b/backend/src/cli/strategicPublicData.ts
index a275a80b5c6a3df4110256886d1eaa23d26bb01d..d2483caedc074f3edfc009f7ac8fe40620759c51 100644
--- a/backend/src/cli/strategicPublicData.ts
+++ b/backend/src/cli/strategicPublicData.ts
@@ -1,19 +1,14 @@
 import { PublicDataDownstreamService } from '../services/publicDataDownstreamService.js';
 import { StrategicPublicIngestionService } from '../services/strategicPublicIngestionService.js';
 import type { StrategicPublicDatasetCode } from '../modules/public-data/strategicPublicDatasetConnector.js';
+import { parseCliArgs } from './args.js';
 
 const DATASETS: StrategicPublicDatasetCode[] = [
   'rfb_qsa',
   'cvm_fre_capital_structure',
 ];
 
-const args = process.argv.slice(2);
-const valueFor = (name: string) => {
-  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
-  if (inline) return inline.slice(name.length + 3);
-  const index = args.indexOf(`--${name}`);
-  return index >= 0 ? args[index + 1] : undefined;
-};
+const { args, valueFor, positiveNumber } = parseCliArgs();
 
 const datasetArgument = valueFor('dataset') ?? 'all';
 const datasets = datasetArgument === 'all'
@@ -22,12 +17,6 @@ const datasets = datasetArgument === 'all'
 const invalid = datasets.filter((dataset) => !DATASETS.includes(dataset));
 if (invalid.length) throw new Error(`Invalid strategic dataset(s): ${invalid.join(', ')}.`);
 
-const positiveNumber = (name: string, fallback: number) => {
-  const value = Number(valueFor(name) ?? fallback);
-  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
-  return value;
-};
-
 const discoverOnly = args.includes('--discover-only');
 const ingestion = await new StrategicPublicIngestionService().run({
   datasets,
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-09.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/cli/args.test.ts && npm -C backend run typecheck
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
refactor(cli): share argument parsing across the operational CLIs

Fourteen CLIs carried their own copy of the `--name value` parser (two
different flavours), plus duplicated positiveNumber/integerOption helpers.
backend/src/cli/args.ts now provides them once (with tests). The five
candidate-* CLIs also gain `--name=value` support; the flags used by the
GitHub workflows (`--limit 30`, `--tiers …`, `--trigger …`, `--force`) parse
exactly as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 10 — Conectores públicos: helpers de parsing compartilhados (valores em R$ e timeout de discovery)

**Por quê:** Cópias divergentes de parseNumber/parseDate/fetchText etc. O bulk lia "R$ 1.234,56" como null e o strategic fazia discovery sem timeout. Novo `modules/public-data/publicDataParsing.ts`.

**Arquivos alterados/criados:**

```
 backend/src/modules/public-data/publicBulkDatasetConnector.ts      | 60 ++++++++++++------------------------------------------------
 backend/src/modules/public-data/publicDataParsing.test.ts          | 32 ++++++++++++++++++++++++++++++++
 backend/src/modules/public-data/publicDataParsing.ts               | 77 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/modules/public-data/strategicPublicDatasetConnector.ts | 76 ++++++++++++----------------------------------------------------------------
 4 files changed, 133 insertions(+), 112 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-10
diff --git a/backend/src/modules/public-data/publicBulkDatasetConnector.ts b/backend/src/modules/public-data/publicBulkDatasetConnector.ts
index e97910077f3eee41fc257614dd12150e32ee470f..0a41faf5412dcbcaf0b79e8a7fe43542bd90e4c4 100644
--- a/backend/src/modules/public-data/publicBulkDatasetConnector.ts
+++ b/backend/src/modules/public-data/publicBulkDatasetConnector.ts
@@ -1,4 +1,3 @@
-import { createHash } from 'node:crypto';
 import { spawn } from 'node:child_process';
 import { createWriteStream } from 'node:fs';
 import { mkdtemp, rm } from 'node:fs/promises';
@@ -6,6 +5,18 @@ import { tmpdir } from 'node:os';
 import { basename, join } from 'node:path';
 import { Readable } from 'node:stream';
 import { pipeline } from 'node:stream/promises';
+import {
+  clean,
+  fetchText,
+  hash,
+  linksFromHtml,
+  normalizeHeader,
+  parseDate,
+  parseNumber,
+  pick,
+  rowObject,
+  targetMatch,
+} from './publicDataParsing.js';
 
 export type PublicBulkDatasetCode =
   | 'rfb_cnpj'
@@ -69,50 +80,7 @@ const RFB_ESTABLISHMENT_HEADERS = [
   'ddd_fax', 'fax', 'correio_eletronico', 'situacao_especial', 'data_situacao_especial',
 ];
 
-const normalizeHeader = (value: string) => value
-  .replace(/^\uFEFF/, '')
-  .normalize('NFD')
-  .replace(/[\u0300-\u036f]/g, '')
-  .toLowerCase()
-  .replace(/[^a-z0-9]+/g, '_')
-  .replace(/^_+|_+$/g, '');
 export const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
-const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
-const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
-const parseNumber = (value: unknown) => {
-  const text = clean(value);
-  if (!text) return null;
-  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/[^0-9.-]/g, '');
-  const parsed = Number(normalized);
-  return Number.isFinite(parsed) ? parsed : null;
-};
-const parseDate = (value: unknown) => {
-  const text = clean(value);
-  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
-  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
-  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
-  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
-  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
-  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
-};
-const pick = (row: Record<string, string>, aliases: string[]) => {
-  for (const alias of aliases) {
-    const value = row[normalizeHeader(alias)];
-    if (value !== undefined && clean(value)) return clean(value);
-  }
-  return '';
-};
-const linksFromHtml = (html: string, base: string) => [...html.matchAll(/href=["']([^"']+)["']/gi)]
-  .map((match) => { try { return new URL(match[1], base).toString(); } catch { return null; } })
-  .filter((value): value is string => Boolean(value));
-const fetchText = async (url: string) => {
-  const response = await fetch(url, {
-    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
-    signal: AbortSignal.timeout(20_000),
-  });
-  if (!response.ok) throw new Error(`Discovery failed: ${response.status} ${url}`);
-  return response.text();
-};
 
 async function probeResource(url: string) {
   const headers = { 'User-Agent': 'OriginationIntelligencePlatform/1.0' };
@@ -378,11 +346,7 @@ const commandOutput = (command: string, args: string[]) => new Promise<string>((
   child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}: ${err}`)));
 });
 const nodeRows = (stream: NodeJS.ReadableStream, encoding: string, delimiter: string) => parseDelimitedText(decodeNode(stream, encoding), delimiter);
-const rowObject = (headers: string[], values: string[]) => Object.fromEntries(headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]));
 const rfbHeaders = (name: string) => /(Estabelecimentos|ESTABELE)/i.test(name) ? RFB_ESTABLISHMENT_HEADERS : RFB_COMPANY_HEADERS;
-const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => cnpj.length === 14
-  ? targets.has(cnpj) || roots.has(cnpj.slice(0, 8))
-  : roots.has(cnpj.slice(0, 8));
 
 export function normalizePublicBulkRow(input: {
   datasetCode: PublicBulkDatasetCode;
diff --git a/backend/src/modules/public-data/publicDataParsing.test.ts b/backend/src/modules/public-data/publicDataParsing.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8ffbab2b41d66aa8d17f4716f6da0b44e2d56f16
--- /dev/null
+++ b/backend/src/modules/public-data/publicDataParsing.test.ts
@@ -0,0 +1,32 @@
+import assert from 'node:assert/strict';
+import test from 'node:test';
+import { normalizeHeader, parseDate, parseNumber, pick, rowObject, targetMatch } from './publicDataParsing.js';
+
+test('parseNumber handles Brazilian currency, plain decimals and garbage', () => {
+  assert.equal(parseNumber('R$ 1.234,56'), 1234.56); // the bulk connector used to return null here
+  assert.equal(parseNumber('1.234.567,8'), 1234567.8);
+  assert.equal(parseNumber('1234.5'), 1234.5);
+  assert.equal(parseNumber('-12,5'), -12.5);
+  assert.equal(parseNumber(''), null);
+  assert.equal(parseNumber('n/d'), null);
+});
+
+test('parseDate normalizes compact, Brazilian and ISO dates', () => {
+  assert.equal(parseDate('20260930'), '2026-09-30');
+  assert.equal(parseDate('30/09/2026'), '2026-09-30');
+  assert.equal(parseDate('2026-09-30T10:00:00Z'), '2026-09-30');
+  assert.equal(parseDate('setembro'), null);
+});
+
+test('header normalization, row objects and target matching', () => {
+  assert.equal(normalizeHeader('﻿Razão Social'), 'razao_social');
+  const row = rowObject(['CNPJ', 'Razão Social'], ['  17770708000124 ', 'Demo   SA']);
+  assert.deepEqual(row, { cnpj: '17770708000124', razao_social: 'Demo SA' });
+  assert.equal(pick(row, ['Nome', 'Razão Social']), 'Demo SA');
+  const targets = new Set(['17770708000124']);
+  const roots = new Set(['17770708']);
+  assert.equal(targetMatch('17770708000124', targets, roots), true);
+  assert.equal(targetMatch('17770708000205', targets, roots), true);
+  assert.equal(targetMatch('17770708', targets, roots), true);
+  assert.equal(targetMatch('99999999000199', targets, roots), false);
+});
diff --git a/backend/src/modules/public-data/publicDataParsing.ts b/backend/src/modules/public-data/publicDataParsing.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bc3c22364187ecee4888e43b9f3d90afb0f13c8a
--- /dev/null
+++ b/backend/src/modules/public-data/publicDataParsing.ts
@@ -0,0 +1,77 @@
+import { createHash } from 'node:crypto';
+
+/**
+ * Parsing/fetch helpers shared by the public bulk and strategic public-data
+ * connectors (they used to keep diverging copies of each one).
+ */
+
+export const normalizeHeader = (value: string) => value
+  .replace(/^\uFEFF/, '')
+  .normalize('NFD')
+  .replace(/[\u0300-\u036f]/g, '')
+  .toLowerCase()
+  .replace(/[^a-z0-9]+/g, '_')
+  .replace(/^_+|_+$/g, '');
+
+export const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
+export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
+
+/** Brazilian ("R$ 1.234,56") and plain ("1234.56") amounts; null when not numeric. */
+export const parseNumber = (value: unknown) => {
+  const text = clean(value);
+  if (!text) return null;
+  const normalized = text.includes(',')
+    ? text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
+    : text.replace(/[^0-9.-]/g, '');
+  if (!normalized) return null;
+  const parsed = Number(normalized);
+  return Number.isFinite(parsed) ? parsed : null;
+};
+
+/** YYYYMMDD, DD/MM/YYYY, DD-MM-YYYY or ISO prefixes to YYYY-MM-DD. */
+export const parseDate = (value: unknown) => {
+  const text = clean(value);
+  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
+  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
+  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
+  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
+  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
+  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
+};
+
+export const pick = (row: Record<string, string>, aliases: string[]) => {
+  for (const alias of aliases) {
+    const value = row[normalizeHeader(alias)];
+    if (value !== undefined && clean(value)) return clean(value);
+  }
+  return '';
+};
+
+export const rowObject = (headers: string[], values: string[]) => Object.fromEntries(
+  headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]),
+);
+
+/** Full CNPJs match exactly or by root; 8-digit roots match by root. */
+export const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => (cnpj.length === 14
+  ? targets.has(cnpj) || roots.has(cnpj.slice(0, 8))
+  : roots.has(cnpj.slice(0, 8)));
+
+export const linksFromHtml = (html: string, base: string) => [...html.matchAll(/href=["']([^"']+)["']/gi)]
+  .map((match) => {
+    try {
+      return new URL(match[1], base).toString();
+    } catch {
+      return null;
+    }
+  })
+  .filter((value): value is string => Boolean(value));
+
+/** Discovery page fetch, bounded so a stalled portal cannot hang the run. */
+export const fetchText = async (url: string) => {
+  const response = await fetch(url, {
+    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
+    signal: AbortSignal.timeout(20_000),
+  });
+  if (!response.ok) throw new Error(`Discovery failed: ${response.status} ${url}`);
+  return response.text();
+};
diff --git a/backend/src/modules/public-data/strategicPublicDatasetConnector.ts b/backend/src/modules/public-data/strategicPublicDatasetConnector.ts
index 3f88e658a667ed35d860335ad1a29a1facf6eafa..c37b53ac15370dadba5eb4e8f3dcea3310d278c0 100644
--- a/backend/src/modules/public-data/strategicPublicDatasetConnector.ts
+++ b/backend/src/modules/public-data/strategicPublicDatasetConnector.ts
@@ -15,6 +15,18 @@ import {
   parseDelimitedText,
   type PublicBulkResource,
 } from './publicBulkDatasetConnector.js';
+import {
+  clean,
+  fetchText,
+  hash,
+  linksFromHtml,
+  normalizeHeader,
+  parseDate,
+  parseNumber,
+  pick,
+  rowObject,
+  targetMatch,
+} from './publicDataParsing.js';
 
 export type StrategicPublicDatasetCode = 'rfb_qsa' | 'cvm_fre_capital_structure';
 
@@ -70,64 +82,8 @@ const CVM_FRE_ENTRY_TYPES: Array<{ pattern: RegExp; recordType: string }> = [
   { pattern: /fre_cia_aberta_distribuicao_capital/i, recordType: 'cvm_fre_capital_distribution' },
 ];
 
-const normalizeHeader = (value: string) => value
-  .replace(/^\uFEFF/, '')
-  .normalize('NFD')
-  .replace(/[\u0300-\u036f]/g, '')
-  .toLowerCase()
-  .replace(/[^a-z0-9]+/g, '_')
-  .replace(/^_+|_+$/g, '');
-
-const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
-const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const hashText = (value: string) => createHash('sha256').update(value).digest('hex');
 
-const parseNumber = (value: unknown) => {
-  const text = clean(value);
-  if (!text) return null;
-  const normalized = text.includes(',')
-    ? text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
-    : text.replace(/[^0-9.-]/g, '');
-  const parsed = Number(normalized);
-  return Number.isFinite(parsed) ? parsed : null;
-};
-
-const parseDate = (value: unknown) => {
-  const text = clean(value);
-  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
-  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
-  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
-  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
-  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
-  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
-};
-
-const pick = (row: Record<string, string>, aliases: string[]) => {
-  for (const alias of aliases) {
-    const value = row[normalizeHeader(alias)];
-    if (value !== undefined && clean(value)) return clean(value);
-  }
-  return '';
-};
-
-const linksFromHtml = (html: string, base: string) => [...html.matchAll(/href=["']([^"']+)["']/gi)]
-  .map((match) => {
-    try {
-      return new URL(match[1], base).toString();
-    } catch {
-      return null;
-    }
-  })
-  .filter((value): value is string => Boolean(value));
-
-const fetchText = async (url: string) => {
-  const response = await fetch(url, {
-    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
-  });
-  if (!response.ok) throw new Error(`Discovery failed: ${response.status} ${url}`);
-  return response.text();
-};
-
 async function probeResource(url: string) {
   const headers = { 'User-Agent': 'OriginationIntelligencePlatform/1.0' };
   let response = await fetch(url, { method: 'HEAD', redirect: 'follow', headers }).catch(() => null);
@@ -146,14 +102,6 @@ async function probeResource(url: string) {
   };
 }
 
-const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => cnpj.length === 14
-  ? targets.has(cnpj) || roots.has(cnpj.slice(0, 8))
-  : roots.has(cnpj.slice(0, 8));
-
-const rowObject = (headers: string[], values: string[]) => Object.fromEntries(
-  headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]),
-);
-
 const maskDocument = (value: string) => {
   const normalized = digits(value);
   if (!normalized) return '';
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-10.patch
```

**Verificar:**

```bash
npx tsx --test backend/src/modules/public-data/*.test.ts
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
refactor(public-data): share connector parsing helpers; fix amounts and discovery timeout

The public bulk and strategic connectors each kept a copy of normalizeHeader,
clean, hash, parseNumber, parseDate, pick, rowObject, targetMatch,
linksFromHtml and fetchText. The copies had drifted into two bugs:
- bulk parseNumber did not strip currency/text when a comma was present, so
  "R$ 1.234,56" was stored as amount null;
- strategic fetchText had no timeout, so a stalled RFB/CVM portal could hold a
  discovery until the function's 300s limit.
Both now import one publicDataParsing.ts (with the fixed parser and a 20s
discovery timeout) and new unit tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 11 — Limpeza: imports e variáveis não usados

**Por quê:** Itens apontados pelo lint após as tarefas anteriores.

**Arquivos alterados/criados:**

```
 backend/src/cli/candidateBcbIdentity.ts              | 2 +-
 backend/src/cli/candidateWebsiteIdentity.ts          | 2 +-
 backend/src/cli/probeStrategicPublicData.ts          | 2 +-
 backend/src/lib/approvedCreditReviewQualification.ts | 2 +-
 backend/src/services/platformService.ts              | 1 -
 5 files changed, 4 insertions(+), 5 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-11
diff --git a/backend/src/cli/candidateBcbIdentity.ts b/backend/src/cli/candidateBcbIdentity.ts
index b7b9e564a03c4e92a208146cd7e9907848b43788..3901ee9b07006e7b47809e54f24c89d50089a418 100644
--- a/backend/src/cli/candidateBcbIdentity.ts
+++ b/backend/src/cli/candidateBcbIdentity.ts
@@ -1,7 +1,7 @@
 import { CandidateBcbIdentityService } from '../services/candidateBcbIdentityService.js';
 import { parseCliArgs } from './args.js';
 
-const { args, valueFor } = parseCliArgs();
+const { valueFor } = parseCliArgs();
 
 const parsedLimit = Number(valueFor('limit') ?? 100);
 const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100;
diff --git a/backend/src/cli/candidateWebsiteIdentity.ts b/backend/src/cli/candidateWebsiteIdentity.ts
index c8b698a24afa8df626f35a7729065de0fffaa3f6..83e1f8c65481b8b8cb957a874703953f7cf9bf5f 100644
--- a/backend/src/cli/candidateWebsiteIdentity.ts
+++ b/backend/src/cli/candidateWebsiteIdentity.ts
@@ -1,7 +1,7 @@
 import { CandidateWebsiteIdentityService } from '../services/candidateWebsiteIdentityService.js';
 import { parseCliArgs } from './args.js';
 
-const { args, valueFor } = parseCliArgs();
+const { valueFor } = parseCliArgs();
 
 const parsedLimit = Number(valueFor('limit') ?? 30);
 const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 30;
diff --git a/backend/src/cli/probeStrategicPublicData.ts b/backend/src/cli/probeStrategicPublicData.ts
index 38e0a2483011499e639d873fe65d68cc201ae397..51ad1308f352b1c8a3a697c3b12d3abbfb99bb6e 100644
--- a/backend/src/cli/probeStrategicPublicData.ts
+++ b/backend/src/cli/probeStrategicPublicData.ts
@@ -5,7 +5,7 @@ import {
 } from '../modules/public-data/strategicPublicDatasetConnector.js';
 import { parseCliArgs } from './args.js';
 
-const { args, valueFor } = parseCliArgs();
+const { valueFor } = parseCliArgs();
 
 const dataset = (valueFor('dataset') ?? 'cvm_fre_capital_structure') as StrategicPublicDatasetCode;
 if (dataset !== 'cvm_fre_capital_structure') {
diff --git a/backend/src/lib/approvedCreditReviewQualification.ts b/backend/src/lib/approvedCreditReviewQualification.ts
index 80c8ff99fa5ed02e4e70388d7a8c6f7d850bef10..0fbb79f0449aa8ef788cc8564a4fc4138fbededf 100644
--- a/backend/src/lib/approvedCreditReviewQualification.ts
+++ b/backend/src/lib/approvedCreditReviewQualification.ts
@@ -1,5 +1,5 @@
 import { qualificationWeights } from '../../../config/scoring.js';
-import type { ApprovedCompanyCreditReview, DecisionAwareCompany } from './companyDecisionEligibility.js';
+import type { DecisionAwareCompany } from './companyDecisionEligibility.js';
 import { average, clamp, levelFromScore } from './helpers.js';
 import { qualificationWeightTotal } from './scoring.js';
 import { computeSourceTreatmentImpact } from './sourceTreatment.js';
diff --git a/backend/src/services/platformService.ts b/backend/src/services/platformService.ts
index ab642a1535e2413b1b2065cb366840a3eea39bd6..74a8286955960215e0013a3e107bc326f3a0ad41 100644
--- a/backend/src/services/platformService.ts
+++ b/backend/src/services/platformService.ts
@@ -18,7 +18,6 @@ import type {
   CompanySeed,
   CompanySignal,
   DashboardView,
-  EnrichmentRecord,
   LeadScoreSnapshot,
   MonitoringOutput,
   PatternCatalogEntry,
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-11.patch
```

**Verificar:**

```bash
npm -C backend run typecheck
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
chore: drop unused imports and bindings flagged by lint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 12 — API: manter `dueDate` válido exatamente como enviado

**Por quê:** A validação de data não deve reformatar valores corretos (ex.: "2026-10-10"); só rejeita inválidos com 400.

**Arquivos alterados/criados:**

```
 backend/src/server.ts | 11 ++++++-----
 1 file changed, 6 insertions(+), 5 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-12
diff --git a/backend/src/server.ts b/backend/src/server.ts
index a9eab3e0effd7485fe0281031c16a2f93b76ad68..a23cba790332106e6c3d461f27a2edb698230c8a 100644
--- a/backend/src/server.ts
+++ b/backend/src/server.ts
@@ -79,13 +79,14 @@ const wrap = (handler: express.Handler): express.Handler => async (req, res, nex
   }
 };
 const assertNonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
-// null/'' clear the date; a parseable date is normalized to ISO; anything else
-// returns undefined so the route can answer 400 instead of a database 500.
+// null/'' clear the date; a parseable date string is kept as sent (numbers
+// become ISO); anything else returns undefined so the route can answer 400
+// instead of a database 500.
 const parseOptionalDate = (value: unknown): string | null | undefined => {
   if (value === null || value === undefined || value === '') return null;
-  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
-  const timestamp = new Date(value).getTime();
-  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
+  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
+  if (typeof value !== 'string') return undefined;
+  return Number.isFinite(new Date(value.trim()).getTime()) ? value.trim() : undefined;
 };
 
 await service.bootstrap().catch((error) => {
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-12.patch
```

**Verificar:**

```bash
npm -C backend run typecheck
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
fix(api): keep valid dueDate strings as sent

Validation should not reformat dates the client already sends correctly
(e.g. "2026-10-10" stays as is); only invalid values are rejected with 400.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 13 — Dependências: proxy-addr 2.0.8 (alerta crítico publicado em 06/10)

**Por quê:** O alerta GHSA-jqcg-44mw-7w3h (IP spoofing, crítico) atinge `proxy-addr` ≤ 2.0.7, usado pelo express 5. Ele faz o último passo da CI (`npm run audit:production`) falhar também na `main` atual. Só o lockfile muda.

**Arquivos alterados/criados:**

```
 package-lock.json | 10 +++++++---
 1 file changed, 7 insertions(+), 3 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-13
diff --git a/package-lock.json b/package-lock.json
index 2c1bcf3d5f2786144ad9340ca384663c8d621dfa..91dd234242b7f3ee63cbd72c67f119432a2f9d7f 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -2548,9 +2548,9 @@
       }
     },
     "node_modules/proxy-addr": {
-      "version": "2.0.7",
-      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz",
-      "integrity": "sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==",
+      "version": "2.0.8",
+      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz",
+      "integrity": "sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==",
       "license": "MIT",
       "dependencies": {
         "forwarded": "0.2.0",
@@ -2558,6 +2558,10 @@
       },
       "engines": {
         "node": ">= 0.10"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
       }
     },
     "node_modules/qs": {
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-13.patch
```

**Se falhar:** Se não aplicar, rode `npm audit fix` (sem `--force`) e confirme `found 0 vulnerabilities`.

**Verificar:**

```bash
npm ci && npm run audit:production
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
chore(deps): bump proxy-addr to 2.0.8 (GHSA-jqcg-44mw-7w3h)

A critical advisory published on 2026-10-06 (IP spoofing via IPv4-mapped IPv6
trust subnets) affects proxy-addr <= 2.0.7, pulled in by express 5. It made
`npm run audit:production` (the last CI step) fail. `npm audit fix` moves the
lockfile to 2.0.8; no other package changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 14 — Teste do dispatcher sem variáveis SUPABASE_*

**Por quê:** O contrato `no-supabase-runtime` falhava porque `serverless/api-index.test.ts` ainda limpava `SUPABASE_URL`/`SUPABASE_*` do ambiente.

**Arquivos alterados/criados:**

```
 serverless/api-index.test.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

**Aplicar o patch:**

`````patch tarefa-14
diff --git a/serverless/api-index.test.ts b/serverless/api-index.test.ts
index e0ef3f840fd4a2055f35a80c6df65f958ceb0dd0..5d151f4f8fb39ff52774304adac95048f41584fb 100644
--- a/serverless/api-index.test.ts
+++ b/serverless/api-index.test.ts
@@ -5,7 +5,7 @@ import test, { before } from 'node:test';
 // Contract tests for the real Vercel dispatcher (api/index.ts). They replace the
 // tests of the removed backend/src/serverless/vercelServerlessHandler.ts copy.
 // Lives outside api/ because every api/*.ts file is a billable Vercel Function.
-for (const key of ['MOTOR_NEON_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']) {
+for (const key of ['MOTOR_NEON_DATABASE_URL', 'DATABASE_URL']) {
   delete process.env[key];
 }
 process.env.CRON_SECRET = 'test-secret';
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-14.patch
```

**Verificar:**

```bash
npm run test:no-supabase-runtime && npm run test:serverless
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
test(api): stop clearing removed Supabase env vars in dispatcher contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 15 — Schema Neon: replay testado de todo o histórico de migrações (paridade com o legado)

**Por quê:** O Neon de produção tem só 37 relações e 8 migrações registradas: o migrador do PR #528 parou na `076` (`column p.status does not exist`) e o plano dele nunca completaria (colunas que só existiam no banco vivo do Supabase, funções nunca versionadas, `auth.role()` inexistente, índice com nome colidindo na 132, sondas 151/152 que nunca casavam, seeds com id texto). **O código atual exige 39 relações e 60 funções que não existem no Neon.** Esta tarefa cria a camada de compatibilidade testada (`scripts/lib/neon-sql-compat.mjs`, `neon-migration-patches.mjs`, `neon-migration-plan.mjs`) e o arquivo `db/neon/20261006_neon_legacy_runtime_objects.sql` com os objetos que só existiam no banco vivo. O plano (199 arquivos) aplica do zero sobre uma réplica fiel da produção, roda como dono não-superuser e é idempotente.

**Arquivos alterados/criados:**

```
 db/neon/20260928_neon_match_vector_documents.sql |   3 +-
 db/neon/20261006_neon_legacy_runtime_objects.sql | 373 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 scripts/apply-neon-runtime-migrations.mjs        | 174 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 scripts/lib/neon-migration-patches.mjs           |  59 +++++++++++++++++++++++
 scripts/lib/neon-sql-compat.mjs                  |  56 ++++++++++++++++++++++
 5 files changed, 660 insertions(+), 5 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-15
diff --git a/db/neon/20260928_neon_match_vector_documents.sql b/db/neon/20260928_neon_match_vector_documents.sql
index baea9d8e57a4191a9605b021e60516e81ba0bb62..8e41cfb6fde22b29a1eafe39c6e32b548ea19d9c 100644
--- a/db/neon/20260928_neon_match_vector_documents.sql
+++ b/db/neon/20260928_neon_match_vector_documents.sql
@@ -1,6 +1,7 @@
 -- Neon-compatible deferred vector search function.
+-- 1024 dims: same Voyage embeddings as vector_documents (098 / knowledge-embedding-worker).
 create or replace function public.match_vector_documents(
-  query_embedding vector(1536),
+  query_embedding vector(1024),
   match_count integer default 5
 )
 returns table(id uuid, content text)
diff --git a/db/neon/20261006_neon_legacy_runtime_objects.sql b/db/neon/20261006_neon_legacy_runtime_objects.sql
new file mode 100644
index 0000000000000000000000000000000000000000..e83fb480dfb56779c9a11bdc10689cde5dc5ddeb
--- /dev/null
+++ b/db/neon/20261006_neon_legacy_runtime_objects.sql
@@ -0,0 +1,373 @@
+-- Neon parity for runtime objects that existed only in the legacy (Supabase) live schema.
+--
+-- These objects were applied live through the dashboard/MCP and were never versioned
+-- in db/migrations (or only as "mirror-only" lineage files on unmerged branches).
+-- The backend writes to all of them, so on Neon every call failed with
+-- "relation does not exist" / "column does not exist".
+--
+-- Sources used to reconstruct the shapes:
+--   * ai_conversations / ai_messages / ai_agent_runs / vector_documents:
+--     lineage mirror db/migrations/027_ai_layer_conversations_model.sql (commit 0caab2e8)
+--     + 20260727123000_harden_user_owned_data_rls.sql (owner_user_id).
+--   * bronze_historical_records: lineage mirror 035_historical_backfill_landing_layer.sql
+--     (commit db49c3ba) + columns written by the public-data ingestion services.
+--   * pipeline extra columns: written by captureDerivedSyncService/companyCreditReviewRuntime
+--     and read by migrations 063/071/076/083/085.
+--   * thesis_outputs / code_improvement_proposals: UUID shapes of 001/011.
+--   * data_treatment_runs columns: 20260812053000_data_treatment_enrichment_v2.sql.
+--
+-- Additive and idempotent. No Supabase roles, auth schema writes, pg_cron or vault.
+
+begin;
+
+-- Deterministic uuid for legacy text source ids ('src_*'), identical to the
+-- expression used by 20261001_neon_runtime_bootstrap_seed.sql. Used by the
+-- migrator rewrite in scripts/lib/neon-sql-compat.mjs.
+create or replace function private.legacy_source_uuid(p_code text)
+returns uuid
+language sql
+immutable
+strict
+set search_path = pg_catalog
+as $function$
+  select (substr(md5(p_code), 1, 8) || '-' || substr(md5(p_code), 9, 4) || '-4' || substr(md5(p_code), 14, 3)
+          || '-a' || substr(md5(p_code), 18, 3) || '-' || substr(md5(p_code), 21, 12))::uuid;
+$function$;
+revoke all on function private.legacy_source_uuid(text) from public;
+
+-- Legacy live constraint used by "on conflict (name, url)" seeds (065+).
+create unique index if not exists source_catalog_name_url_key
+  on public.source_catalog (name, url);
+
+-- AI conversation layer -----------------------------------------------------
+create table if not exists public.ai_conversations (
+  id uuid primary key default gen_random_uuid(),
+  owner_name text,
+  owner_user_id uuid references public.user_profiles(id) on delete set null,
+  context_type text,
+  context_id uuid,
+  title text,
+  metadata jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default now(),
+  updated_at timestamptz not null default now()
+);
+create index if not exists idx_ai_conversations_context
+  on public.ai_conversations (context_type, context_id, updated_at desc);
+create index if not exists idx_ai_conversations_owner_user_updated
+  on public.ai_conversations (owner_user_id, updated_at desc);
+
+create table if not exists public.ai_messages (
+  id uuid primary key default gen_random_uuid(),
+  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
+  role text not null,
+  content text not null,
+  tokens_in integer not null default 0,
+  tokens_out integer not null default 0,
+  model text,
+  metadata jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default now()
+);
+create index if not exists idx_ai_messages_conversation_created
+  on public.ai_messages (conversation_id, created_at desc);
+
+create table if not exists public.ai_agent_runs (
+  id uuid primary key default gen_random_uuid(),
+  conversation_id uuid references public.ai_conversations(id) on delete cascade,
+  context_type text,
+  context_id uuid,
+  agent_key text,
+  plugins jsonb not null default '[]'::jsonb,
+  input jsonb not null default '{}'::jsonb,
+  output jsonb not null default '{}'::jsonb,
+  metadata jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default now()
+);
+create index if not exists idx_ai_agent_runs_conversation_created
+  on public.ai_agent_runs (conversation_id, created_at desc);
+create index if not exists idx_ai_agent_runs_agent_created
+  on public.ai_agent_runs (agent_key, created_at desc);
+
+-- Vector corpus (pgvector lives in schema public on Neon) -------------------
+-- Live shape: 1024-dim Voyage embeddings (098_knowledge_embedding_coverage_v10,
+-- api/knowledge-embedding-worker.ts) plus a stored Portuguese tsvector used by
+-- 097_knowledge_hybrid_search_v9. content_tsv/build_pt_search_query and the
+-- lexical/hybrid helpers were applied live without any versioned DDL.
+create table if not exists public.vector_documents (
+  id uuid primary key default gen_random_uuid(),
+  company_id text,
+  content text not null,
+  embedding vector(1024),
+  metadata jsonb not null default '{}'::jsonb,
+  content_tsv tsvector generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored,
+  created_at timestamptz not null default now()
+);
+create index if not exists idx_vector_documents_company
+  on public.vector_documents (company_id);
+create index if not exists idx_vector_documents_content_tsv
+  on public.vector_documents using gin (content_tsv);
+
+create or replace function public.build_pt_search_query(p_query text)
+returns tsquery
+language sql
+immutable
+set search_path = public, pg_temp
+as $function$
+  select case
+    when nullif(btrim(coalesce(p_query, '')), '') is null then null
+    else websearch_to_tsquery('portuguese', btrim(p_query))
+  end;
+$function$;
+
+-- Lexical retrieval used by backend/src/ai/vectorIndexService.ts. Never fabricates vectors.
+create or replace function public.match_vector_documents_lexical(
+  query_text text,
+  match_count integer default 5,
+  company_id text default null
+)
+returns table(id uuid, content text, company_id text, metadata jsonb, lexical_score double precision)
+language sql
+stable
+set search_path = public, pg_temp
+as $function$
+  select vd.id, vd.content, vd.company_id, vd.metadata,
+         ts_rank(vd.content_tsv, q.tsq)::double precision as lexical_score
+  from public.vector_documents vd
+  cross join (select public.build_pt_search_query(query_text) as tsq) q
+  where q.tsq is not null
+    and vd.content_tsv @@ q.tsq
+    and (match_vector_documents_lexical.company_id is null
+         or vd.company_id = match_vector_documents_lexical.company_id)
+  order by lexical_score desc, vd.created_at desc, vd.id
+  limit least(greatest(coalesce(match_count, 5), 1), 50);
+$function$;
+
+-- Reciprocal-rank fusion of lexical + semantic candidates (signature granted by 097).
+create or replace function public.match_vector_documents_hybrid(
+  query_text text,
+  query_embedding vector,
+  match_count integer default 10,
+  rrf_k integer default 60,
+  company_id text default null
+)
+returns table(id uuid, content text, company_id text, metadata jsonb, rrf_score double precision)
+language sql
+stable
+set search_path = public, pg_temp
+as $function$
+  with lexical as (
+    select l.id, row_number() over (order by l.lexical_score desc, l.id) as rnk
+    from public.match_vector_documents_lexical(query_text, greatest(coalesce(match_count, 10), 1) * 6, company_id) l
+  ), semantic as (
+    select vd.id, row_number() over (order by vd.embedding <=> query_embedding, vd.id) as rnk
+    from public.vector_documents vd
+    where query_embedding is not null
+      and vd.embedding is not null
+      and (match_vector_documents_hybrid.company_id is null
+           or vd.company_id = match_vector_documents_hybrid.company_id)
+    order by vd.embedding <=> query_embedding, vd.id
+    limit greatest(coalesce(match_count, 10), 1) * 6
+  ), fused as (
+    select coalesce(l.id, s.id) as id,
+           (coalesce(1.0 / (coalesce(rrf_k, 60) + l.rnk), 0.0)
+            + coalesce(1.0 / (coalesce(rrf_k, 60) + s.rnk), 0.0))::double precision as rrf_score
+    from lexical l
+    full outer join semantic s on s.id = l.id
+  )
+  select vd.id, vd.content, vd.company_id, vd.metadata, f.rrf_score
+  from fused f
+  join public.vector_documents vd on vd.id = f.id
+  order by f.rrf_score desc, vd.id
+  limit least(greatest(coalesce(match_count, 10), 1), 50);
+$function$;
+
+-- Raw landing layer for public datasets ------------------------------------
+create table if not exists public.bronze_historical_records (
+  id uuid primary key default gen_random_uuid(),
+  dataset_code text not null,
+  record_key text not null,
+  ref_date date not null,
+  entity_cnpj text,
+  payload jsonb not null default '{}'::jsonb,
+  source_url text not null,
+  content_hash text not null,
+  ingested_at timestamptz not null default now(),
+  unique (dataset_code, record_key)
+);
+create index if not exists bronze_historical_records_dataset_ref_idx
+  on public.bronze_historical_records (dataset_code, ref_date desc);
+create index if not exists bronze_historical_records_entity_ref_idx
+  on public.bronze_historical_records (entity_cnpj, ref_date desc)
+  where entity_cnpj is not null;
+
+-- Heavy raw table: protect with the Neon growth circuit breaker (20261001).
+do $$
+begin
+  if to_regprocedure('private.guard_heavy_table_growth()') is not null then
+    drop trigger if exists trg_database_growth_guard_bronze_historical_records on public.bronze_historical_records;
+    create trigger trg_database_growth_guard_bronze_historical_records
+      before insert or update on public.bronze_historical_records
+      for each row execute function private.guard_heavy_table_growth();
+    drop trigger if exists trg_database_growth_guard_capital_market_events on public.capital_market_events;
+    create trigger trg_database_growth_guard_capital_market_events
+      before insert or update on public.capital_market_events
+      for each row execute function private.guard_heavy_table_growth();
+  end if;
+end;
+$$;
+
+-- Company Master columns used by identity review/entity resolution (099-152) --
+alter table public.companies
+  add column if not exists normalized_name text,
+  add column if not exists website_url text,
+  add column if not exists country text,
+  add column if not exists origin text,
+  add column if not exists notes text,
+  add column if not exists sector text,
+  add column if not exists sub_sector text;
+
+-- CRM columns written by the runtime and by migrations 063/071/085-094 -------
+alter table public.pipeline
+  add column if not exists status text not null default 'active',
+  add column if not exists priority text,
+  add column if not exists owner_name text,
+  add column if not exists next_action_due_at timestamptz,
+  add column if not exists expected_structure text,
+  add column if not exists expected_ticket numeric;
+
+alter table public.activities
+  add column if not exists owner_name text,
+  add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null,
+  add column if not exists occurred_at timestamptz not null default now();
+
+alter table public.tasks
+  add column if not exists owner_name text,
+  add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null;
+
+-- qualification_snapshots columns written by captureDerivedSyncService and read by 141-143.
+alter table public.qualification_snapshots
+  add column if not exists snapshot_version text,
+  add column if not exists receivables_structurable boolean,
+  add column if not exists timing text,
+  add column if not exists created_by text;
+
+-- score_snapshots columns written by captureDerivedSyncService (and indexed by 20260727123300).
+alter table public.score_snapshots
+  add column if not exists score_version text,
+  add column if not exists structural_need_score numeric,
+  add column if not exists timing_score numeric,
+  add column if not exists executability_score numeric,
+  add column if not exists source_confidence_score numeric,
+  add column if not exists trigger_strength_score numeric,
+  add column if not exists drivers jsonb not null default '[]'::jsonb;
+
+-- company_discovery_links: live shape from 046 (named unique constraint used by 151).
+alter table public.company_discovery_links
+  add column if not exists metadata jsonb not null default '{}'::jsonb,
+  add column if not exists updated_at timestamptz not null default now();
+do $$
+begin
+  if exists (select 1 from pg_constraint
+             where conrelid = 'public.company_discovery_links'::regclass
+               and conname = 'company_discovery_links_company_id_discovered_candidate_id_key') then
+    alter table public.company_discovery_links
+      rename constraint company_discovery_links_company_id_discovered_candidate_id_key
+      to company_discovery_links_company_candidate_unique;
+  end if;
+end;
+$$;
+
+-- Decision layers -------------------------------------------------------------
+create table if not exists public.thesis_outputs (
+  id uuid primary key default gen_random_uuid(),
+  company_id uuid not null references public.companies(id) on delete cascade,
+  thesis_summary text not null,
+  structure_type text,
+  market_map_summary text,
+  confidence_score numeric(5,2),
+  metadata jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default now()
+);
+create index if not exists idx_thesis_outputs_company_created
+  on public.thesis_outputs (company_id, created_at desc);
+
+create table if not exists public.code_improvement_proposals (
+  id uuid primary key default gen_random_uuid(),
+  engine_name text not null,
+  proposal_type text not null,
+  title text not null,
+  rationale text,
+  target_module text,
+  status text not null default 'draft',
+  risk_level text not null default 'medium',
+  proposal_payload jsonb not null default '{}'::jsonb,
+  test_plan jsonb not null default '[]'::jsonb,
+  branch_name text,
+  pr_url text,
+  created_at timestamptz not null default now(),
+  updated_at timestamptz not null default now()
+);
+create index if not exists idx_code_improvement_proposals_engine
+  on public.code_improvement_proposals (engine_name, created_at desc);
+
+-- Data treatment v2 (20260812053000) on top of the Neon core run table --------
+alter table public.data_treatment_runs
+  add column if not exists trigger_type text not null default 'manual',
+  add column if not exists scope_type text not null default 'company',
+  add column if not exists outputs_seen integer not null default 0,
+  add column if not exists outputs_relevant integer not null default 0,
+  add column if not exists outputs_decision_eligible integer not null default 0,
+  add column if not exists signals_generated integer not null default 0,
+  add column if not exists enrichments_generated integer not null default 0,
+  add column if not exists average_relevance_score numeric(6,2) not null default 0,
+  add column if not exists average_quality_score numeric(6,2) not null default 0;
+
+-- Objects applied live from unmerged branches (lineage mirrors) ---------------
+-- data_quality_violations: mirror 031_data_quality_gate_expansion.sql (commit 1a5bb2a0,
+-- branch codex/data-platform-frente-d); used by 093/112 decision quality gates.
+create table if not exists public.data_quality_violations (
+  id uuid primary key default gen_random_uuid(),
+  rule_code text not null,
+  entity_table text not null,
+  entity_id text not null,
+  source_id uuid,
+  severity text not null default 'medium',
+  status text not null default 'open',
+  reason text not null,
+  observed_value jsonb not null default '{}'::jsonb,
+  detected_at timestamptz not null default now(),
+  resolved_at timestamptz
+);
+create index if not exists idx_data_quality_violations_open
+  on public.data_quality_violations (entity_table, rule_code, detected_at desc)
+  where resolved_at is null;
+create index if not exists idx_data_quality_violations_source
+  on public.data_quality_violations (source_id, detected_at desc)
+  where source_id is not null;
+
+-- normalize_cnpj_digits: mirror 029_company_entity_aliases_cnpj_backfill.sql (commit 1a5bb2a0);
+-- used by the candidate identity gates (096+).
+create or replace function public.normalize_cnpj_digits(p_cnpj text)
+returns text
+language sql
+immutable
+as $$
+  select case
+    when length(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')) = 14
+      then regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
+    else null
+  end;
+$$;
+
+-- notifications: legacy dashboard-only table, hardened by 20260727123000 (owner RLS).
+create table if not exists public.notifications (
+  id uuid primary key default gen_random_uuid(),
+  owner_name text,
+  title text,
+  body text,
+  notification_type text,
+  is_read boolean not null default false,
+  metadata jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default now()
+);
+
+commit;
diff --git a/scripts/apply-neon-runtime-migrations.mjs b/scripts/apply-neon-runtime-migrations.mjs
index a0eff45a8e603e18093df859c7ea88903c7f1692..53b9eca247ca25f8813b508e183b02c39fcd0a72 100644
--- a/scripts/apply-neon-runtime-migrations.mjs
+++ b/scripts/apply-neon-runtime-migrations.mjs
@@ -1,5 +1,7 @@
 import { readFileSync } from 'node:fs';
 import pg from 'pg';
+import { findUnsupportedSql, toNeonSql } from './lib/neon-sql-compat.mjs';
+import { applyMigrationPatches } from './lib/neon-migration-patches.mjs';
 
 const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
 if (!connectionString) throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');
@@ -13,6 +15,61 @@ const migrations = [
   'db/migrations/060_origination_knowledge_vault.sql',
   'db/neon/20261005_neon_qualification_compatibility.sql',
   'db/neon/20261005_neon_signal_compatibility.sql',
+  'db/neon/20260928_neon_uuid_extended_runtime.sql',
+  'db/neon/20260928_neon_origination_intelligence_modules.sql',
+  'db/neon/20261006_neon_legacy_runtime_objects.sql',
+  'db/neon/20260928_neon_match_vector_documents.sql',
+  'db/migrations/019_capture_treatment_runtime_alignment.sql',
+  'db/migrations/020_runtime_capture_repository_alignment.sql',
+  'db/migrations/020_origination_operating_system.sql',
+  'db/migrations/021_rss_source_expansion.sql',
+  'db/migrations/022_data_platform_d0_d1_foundation.sql',
+  'db/migrations/023_data_quality_gates_minimum.sql',
+  'db/migrations/024_mais_retorno_usage_tables.sql',
+  'db/migrations/025_reserve_external_api_request.sql',
+  'db/migrations/026_seed_mais_retorno_source.sql',
+  'db/migrations/029_non_obvious_sources_capture_treatment.sql',
+  'db/migrations/030_source_treatment_impact_views.sql',
+  'db/migrations/031_linkedin_media_source_expansion.sql',
+  'db/migrations/033_ranking_v2_persistence.sql',
+  'db/migrations/034_ranking_v2_live_schema.sql',
+  'db/migrations/032_company_signals_source_lineage_backfill.sql',
+  'db/migrations/043_capital_market_single_running_guard.sql',
+  'db/migrations/044_cvm_capture_inbox_candidates.sql',
+  'db/migrations/045_repair_cvm_capture_inbox_candidate_sync.sql',
+  'db/migrations/046_company_discovery_links_live_schema.sql',
+  'db/migrations/047_normalize_cvm_candidate_contract.sql',
+  'db/migrations/048_b2b_scraper_fidc_source_expansion.sql',
+  'db/migrations/049_bcb_sgs_macro_treatment.sql',
+  'db/migrations/050_public_records_api_sources.sql',
+  'db/migrations/051_vc_portfolio_monitor_activation.sql',
+  'db/migrations/052_open_finance_participants_api_source.sql',
+  'db/migrations/053_reconcile_bcb_vc_source_foundation.sql',
+  'db/migrations/054_free_official_data_sources.sql',
+  'db/migrations/055_reconcile_free_official_source_registry.sql',
+  'db/migrations/056_free_source_evidence_guardrails.sql',
+  'db/migrations/057_public_bulk_ingestion.sql',
+  'db/migrations/058_public_bulk_signal_sync.sql',
+  'db/migrations/059_public_data_operations_snapshot.sql',
+  'db/migrations/060_public_evidence_intelligence.sql',
+  'db/migrations/061_public_qualification_patterns.sql',
+  'db/migrations/062_public_score_lead_guardrails.sql',
+  'db/migrations/063_public_pipeline_ranking.sql',
+  'db/migrations/064_score_compatibility_columns.sql',
+  'db/migrations/065_strategic_source_governance.sql',
+  'db/migrations/066_origination_factor_map_schema.sql',
+  'db/migrations/067_strategic_record_signal_sync.sql',
+  'db/migrations/068_factor_map_runtime.sql',
+  'db/migrations/069_factor_qualification_integration.sql',
+  'db/migrations/070_factor_pattern_integration.sql',
+  'db/migrations/071_factor_lead_pipeline_integration.sql',
+  'db/migrations/072_factor_outcome_map.sql',
+  'db/migrations/073_factor_map_backfill.sql',
+  'db/migrations/074_factor_map_dedup_calibration.sql',
+  'db/migrations/075_factor_map_security_hardening.sql',
+  'db/migrations/076_factor_map_foreign_key_indexes.sql',
+  'db/migrations/077_strategic_source_runtime_governance.sql',
+  'db/migrations/078_strategic_source_probe_status.sql',
   'db/migrations/076_knowledge_company_workspace.sql',
   'db/migrations/077_knowledge_vault_function_grants_hardening.sql',
   'db/migrations/078_knowledge_capture_concurrency_lock.sql',
@@ -24,20 +81,122 @@ const migrations = [
   'db/migrations/088_knowledge_execution_result_lineage.sql',
   'db/migrations/089_knowledge_execution_context.sql',
   'db/migrations/090_knowledge_execution_outcome_views.sql',
+  'db/migrations/091_factor_outcome_map_v2.sql',
   'db/migrations/092_knowledge_outcome_intelligence_rpc.sql',
+  'db/migrations/093_company_master_decision_quality_gate.sql',
+  'db/migrations/094_company_decision_write_guards.sql',
+  'db/migrations/095_company_decision_readiness_snapshot.sql',
+  'db/migrations/096_candidate_identity_quality_gate.sql',
+  'db/migrations/097_candidate_eligible_company_link_gate.sql',
+  'db/migrations/098_candidate_identity_trigger_security.sql',
   'db/migrations/093_knowledge_outcome_operations.sql',
+  'db/migrations/099_candidate_identity_review_workflow.sql',
+  'db/migrations/100_fix_candidate_identity_review_generated_columns.sql',
+  'db/migrations/101_fix_identity_domain_normalization.sql',
+  'db/migrations/102_candidate_identity_reviews_explicit_deny_policy.sql',
   'db/migrations/094_knowledge_outcome_workbench.sql',
+  'db/migrations/103_separate_entity_and_decision_eligibility.sql',
+  'db/migrations/097_knowledge_hybrid_search_v9.sql',
+  'db/migrations/092_cvm_delivery_hardening.sql',
+  'db/migrations/096_qualification_score_semantics.sql',
+  'db/migrations/098_knowledge_embedding_coverage_v10.sql',
+  'db/migrations/099_knowledge_embedding_budget_baseline_fix.sql',
+  'db/migrations/100_knowledge_embedding_vector_comparison_fix.sql',
+  'db/migrations/101_knowledge_embedding_security_hardening.sql',
+  'db/migrations/102_qsa_fallback_governance.sql',
+  'db/migrations/103_qsa_fallback_idempotency.sql',
+  'db/migrations/093_cvm_checkpoint_timestamp_contract.sql',
+  'db/migrations/20260724152000_user_profiles_god_mode_auth_flows.sql',
+  'db/migrations/20260724153500_user_access_security_invoker.sql',
+  'db/migrations/20260724155000_fix_user_access_invoker_column_grants.sql',
+  'db/migrations/20260724160500_harden_god_mode_direct_updates.sql',
+  'db/migrations/104_finep_public_funding.sql',
+  'db/migrations/105_finep_operations_panel_performance.sql',
+  'db/migrations/106_anbima_public_source_governance.sql',
+  'db/migrations/119_candidate_decision_queue.sql',
+  'db/migrations/120_candidate_decision_queue_filter_hardening.sql',
+  'db/migrations/121_candidate_decision_queue_calibration_v2.sql',
+  'db/migrations/104_knowledge_learning_agent.sql',
+  'db/migrations/105_knowledge_learning_agent_link_fix.sql',
+  'db/migrations/106_knowledge_learning_agent_enqueue_rls.sql',
+  'db/migrations/107_knowledge_learning_agent_pgcrypto_schema.sql',
+  'db/migrations/122_candidate_cvm_company_registry.sql',
+  'db/migrations/123_candidate_decision_queue_cvm_coverage_v3.sql',
+  'db/migrations/124_candidate_cvm_registry_determinism.sql',
   'db/migrations/108_dcm_daily_outreach_operating_loop.sql',
+  'db/migrations/109_dcm_daily_outreach_view_security.sql',
+  'db/migrations/20260724195500_dcm_daily_outreach_rls_hardening.sql',
+  'db/migrations/095_index_dcm_outreach_feedback_daily_lead.sql',
+  'db/migrations/125_cvm_production_intelligence_foundation.sql',
+  'db/migrations/126_cvm_production_intelligence_signals.sql',
+  'db/migrations/127_cvm_production_intelligence_delivery_views.sql',
+  'db/migrations/128_cvm_explicit_candidate_delivery.sql',
+  'db/migrations/129_cvm_atomic_batch_persistence.sql',
+  'db/migrations/108_company_credit_review_gate.sql',
+  'db/migrations/109_filter_ranking_v2_by_decision_eligibility.sql',
+  'db/migrations/110_align_credit_review_with_decision_engines.sql',
+  'db/migrations/111_harden_credit_review_trigger_privileges.sql',
+  'db/migrations/112_enforce_authenticated_credit_review_finalization.sql',
+  'db/migrations/113_reclassify_empty_successful_capture_runs.sql',
+  'db/migrations/114_quarantine_unattributed_credit_reviews.sql',
+  'db/migrations/115_fix_knowledge_learning_service_role_detection.sql',
+  'db/migrations/116_harden_pipeline_eligibility_surfaces.sql',
+  'db/migrations/117_govern_knowledge_learning_queue.sql',
+  'db/migrations/118_circuit_break_knowledge_provider_billing.sql',
+  'db/migrations/119_harden_knowledge_learning_governance_security.sql',
+  'db/migrations/20260727123000_harden_user_owned_data_rls.sql',
+  'db/migrations/20260727123100_harden_vector_corpus_and_role_rpc.sql',
+  'db/migrations/20260727123200_repair_company_signal_history.sql',
+  'db/migrations/20260727123300_signal_quality_guardrails_and_score_identity.sql',
   'db/neon/20261005_neon_microsoft_runtime.sql',
   'db/neon/20261005_neon_archive_metadata.sql',
   'db/migrations/20260727173000_source_control_sheet_sync.sql',
+  'db/migrations/130_cvm_batch_deduplicate_input.sql',
+  'db/migrations/131_activate_bcb_sgs_credit_series.sql',
   'db/migrations/132_fidcs_source_and_catalog_governance.sql',
   'db/migrations/133_cvm_fund_documents_and_source_schedules.sql',
+  'db/migrations/134_source_probe_schedule_alignment.sql',
+  'db/migrations/135_source_schedule_registry_service_role_policy.sql',
+  'db/migrations/136_cvm_free_tier_storage_guard.sql',
+  'db/migrations/138_compact_existing_cvm_event_payloads.sql',
+  'db/migrations/20260810232500_agfeed_source_governance.sql',
+  'db/migrations/20260811235500_agfeed_search_discovery_schedule.sql',
+  'db/migrations/20260812003000_optimize_candidate_event_uuid_join.sql',
+  'db/migrations/20260812005500_backfill_identity_review_prefill.sql',
+  'db/migrations/20260812011000_rss_operating_company_commercial_queue.sql',
+  'db/migrations/20260812012500_rss_operating_company_commercial_queue_v2.sql',
+  'db/migrations/20260812014500_rss_first_party_identity_seed.sql',
+  'db/migrations/20260812053000_data_treatment_enrichment_v2.sql',
+  'db/migrations/20260812021000_bull_media_alias_dedupe.sql',
+  'db/migrations/20260812022500_bull_alias_reassert_after_semantics_v3.sql',
+  'db/migrations/20260812024500_rss_first_party_identity_batch_v2.sql',
+  'db/migrations/130_debentures_snd_source_catalog.sql',
+  'db/migrations/131_debentures_snd_signal_treatment.sql',
+  'db/migrations/132_debentures_snd_candidate_delivery.sql',
+  'db/migrations/133_debentures_snd_delivery_whitelist.sql',
+  'db/migrations/134_debentures_snd_cold_archive_policy.sql',
+  'db/migrations/134_people_capital_intelligence.sql',
+  'db/migrations/135_people_capital_job_history_guard.sql',
+  'db/migrations/136_people_capital_vault_ui_compat.sql',
+  'db/migrations/137_people_capital_hiring_mix.sql',
+  'db/migrations/139_origination_intelligence_brief.sql',
+  'db/migrations/138_people_capital_candidate_promotion_graph.sql',
+  'db/migrations/140_origination_brief_real_company_gate.sql',
+  'db/migrations/141_universal_origination_reasoning_v2.sql',
+  'db/migrations/142_universal_origination_reasoning_calibration.sql',
+  'db/migrations/143_universal_origination_reasoning_conflict_resolution.sql',
+  'db/migrations/144_origination_reprocessing_queue.sql',
+  'db/migrations/145_origination_reprocessing_schedule.sql',
+  'db/migrations/146_automatic_candidate_entity_resolution.sql',
+  'db/migrations/147_origination_entity_eligibility_gate.sql',
+  'db/migrations/148_operating_issuer_resolution_and_analytics_fix.sql',
+  'db/migrations/149_candidate_entity_resolution_v3.sql',
+  'db/migrations/150_candidate_entity_resolution_v4.sql',
+  'db/migrations/151_candidate_entity_resolution_v5_conflict_constraint.sql',
+  'db/migrations/152_regulated_issuer_identity_calibration.sql',
+  'db/migrations/145_entity_relevance_v3_historical_remediation.sql',
 ];
 
-const cleanSql = (sql) => sql
-  .replace(/^\s*begin;\s*$/gim, '')
-  .replace(/^\s*commit;\s*$/gim, '');
 
 const pool = new pg.Pool({
   connectionString,
@@ -69,7 +228,14 @@ try {
       continue;
     }
 
-    const sql = cleanSql(readFileSync(file, 'utf8'));
+    const source = readFileSync(file, 'utf8');
+    const unsupported = findUnsupportedSql(source);
+    if (unsupported.length) {
+      console.error('failed', file, `unsupported on Neon: ${unsupported.join('; ')}`);
+      process.exitCode = 1;
+      break;
+    }
+    const sql = toNeonSql(applyMigrationPatches(file, source));
     console.log('apply', file);
     try {
       await client.query('begin');
diff --git a/scripts/lib/neon-migration-patches.mjs b/scripts/lib/neon-migration-patches.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..c60c0b6360b7c4594fe89a00694eb8a5522ab4a6
--- /dev/null
+++ b/scripts/lib/neon-migration-patches.mjs
@@ -0,0 +1,59 @@
+// Exact-string patches applied by scripts/apply-neon-runtime-migrations.mjs to
+// historical migrations that were written for an older shape of the legacy
+// schema (text ids, missing columns) and therefore do not apply verbatim on the
+// Neon UUID runtime. Each patch must match at least once, so a drifted file
+// fails loudly instead of silently diverging.
+//
+// SKIPPED lists migrations that are intentionally not replayed on Neon, with the
+// reason and (when applicable) the db/neon file that replaces them.
+
+export const PATCHES = {
+  'db/migrations/030_source_treatment_impact_views.sql': [
+    // company_signals.source_id became uuid; the rule key is text.
+    ["sc.metadata->>'code', cs.source_id)", "sc.metadata->>'code', cs.source_id::text)"],
+  ],
+  'db/migrations/064_score_compatibility_columns.sql': [
+    // These aliases are already plain columns in the Neon core schema.
+    ['alter table public.qualification_snapshots\n  alter column qualification_score_total drop expression;', '-- neon: qualification_score_total is already a plain column'],
+    ['alter table public.qualification_snapshots\n  alter column urgency_score drop expression;', '-- neon: urgency_score is already a plain column'],
+    ['alter table public.lead_score_snapshots\n  alter column bucket drop expression;', '-- neon: bucket is already a plain column'],
+  ],
+  'db/migrations/116_harden_pipeline_eligibility_surfaces.sql': [
+    // pipeline_kanban served direct PostgREST consumers of the legacy provider and joins
+    // dashboard-only views (latest_score_snapshots); the Neon Data API stays default-deny.
+    { removeFrom: '-- Keep the Kanban view fail-closed for direct Supabase consumers.', removeThrough: 'grant select on public.pipeline_kanban to authenticated, service_role;' },
+  ],
+  'db/migrations/132_fidcs_source_and_catalog_governance.sql': [
+    // 022 already created an index with this name but a different predicate ("metadata ? 'code'"),
+    // so "if not exists" skipped it and the ON CONFLICT below had no matching arbiter.
+    ['create unique index if not exists uq_source_catalog_metadata_code\n', 'create unique index if not exists uq_source_catalog_metadata_code_nonempty\n'],
+  ],
+  'db/migrations/151_candidate_entity_resolution_v5_conflict_constraint.sql': [
+    // 150 writes "on conflict (company_id,discovered_candidate_id)" (space after "conflict");
+    // the original position() probe only matched the no-space spelling and always raised.
+    ["elsif position('on conflict(company_id,discovered_candidate_id)' in lower(v_definition)) > 0 then", "elsif lower(v_definition) ~ 'on\\s+conflict\\s*\\(\\s*company_id\\s*,\\s*discovered_candidate_id\\s*\\)' then"],
+  ],
+  'db/migrations/152_regulated_issuer_identity_calibration.sql': [
+    // The probe text was copied from the live function layout; 150 in the repository is formatted differently.
+    ["  v_old text := $old$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92))$old$;\n  v_new text := $new$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and (\n          coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92\n          or (\n            c.candidate_role='operating_issuer'\n            and c.cvm_code is not null\n            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null\n            and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.90\n          )\n        )))$new$;", "  -- neon: matched against the repository text of 150 (the live function had a different layout)\n  v_old text := $old$(c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain'\n          and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92)$old$;\n  v_new text := $new$(c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain' and (\n          coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92\n          or (\n            c.candidate_role='operating_issuer'\n            and c.cvm_code is not null\n            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null\n            and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.90\n          )\n        ))$new$;"],
+  ],
+  'db/migrations/113_reclassify_empty_successful_capture_runs.sql': [
+    // The diagnostics view only existed as a dashboard object in the legacy provider and is not used by the runtime.
+    ["comment on view public.gold_source_connector_run_diagnostics is\n  'Connector run diagnostics. Completed runs with zero outputs are valid empty results and resolve to needs_review, not failed.';", '-- neon: gold_source_connector_run_diagnostics is not part of the Neon runtime'],
+  ],
+};
+
+const applyPatch = (file, current, patch) => {
+  if (Array.isArray(patch)) {
+    const [from, to] = patch;
+    if (!current.includes(from)) throw new Error(`Neon patch for ${file} no longer matches: ${from}`);
+    return current.split(from).join(to);
+  }
+  const start = current.indexOf(patch.removeFrom);
+  const end = start < 0 ? -1 : current.indexOf(patch.removeThrough, start);
+  if (start < 0 || end < 0) throw new Error(`Neon removal for ${file} no longer matches: ${patch.removeFrom}`);
+  return `${current.slice(0, start)}-- neon: removed block "${patch.removeFrom.slice(0, 60)}"${current.slice(end + patch.removeThrough.length)}`;
+};
+
+export const applyMigrationPatches = (file, sql) => (PATCHES[file] ?? [])
+  .reduce((current, patch) => applyPatch(file, current, patch), sql);
diff --git a/scripts/lib/neon-sql-compat.mjs b/scripts/lib/neon-sql-compat.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..1f91eb80ea570f486c160dcc4bf071c4e6a02cda
--- /dev/null
+++ b/scripts/lib/neon-sql-compat.mjs
@@ -0,0 +1,56 @@
+// Deterministic rewrites that let historical migrations (written for the legacy
+// Postgres provider) run unchanged on Neon. Every rule is covered by
+// scripts/neon-sql-compat.test.mjs. Anything that cannot be rewritten safely
+// (pg_cron jobs, vault secrets, pg_net/http calls, storage buckets) is rejected
+// so the file has to be ported by hand into db/neon/.
+
+const UNSUPPORTED = [
+  [/\bcron\.(?:schedule|unschedule|alter_job|job)\b/i, 'pg_cron (Neon only allows it in database "postgres"; use Vercel Cron)'],
+  [/\bvault\.[a-z_]+/i, 'vault secrets (use Vercel environment variables)'],
+  [/\bnet\.http_[a-z_]+/i, 'pg_net HTTP calls (call the API from Vercel/GitHub Actions)'],
+  [/\bextensions\.http(?:_[a-z_]+)?\b/i, 'pgsql-http extension'],
+  [/\bstorage\.(?:buckets|objects)\b/i, 'storage buckets'],
+  [/\bauth\.users\b/i, 'auth.users (identity lives in neon_auth + public.user_profiles)'],
+];
+
+const REWRITES = [
+  // Neon installs pgcrypto/vector in schema public; the legacy provider used "extensions".
+  [/\bcreate\s+extension\s+if\s+not\s+exists\s+(\w+)\s+with\s+schema\s+extensions\s*;/gi, 'create extension if not exists $1;'],
+  [/\bextensions\.(digest|gen_random_bytes|gen_random_uuid|hmac|crypt|gen_salt|vector|halfvec|vector_cosine_ops|vector_l2_ops|vector_ip_ops|cosine_distance)\b/gi, 'public.$1'],
+  // pg_session_jwt exposes the verified claims through auth.session(); there is no auth.role().
+  [/\bauth\.role\(\)/gi, "(auth.session() ->> 'role')"],
+  // Transactions are owned by the migrator.
+  [/^\s*begin\s*;\s*$/gim, ''],
+  [/^\s*commit\s*;\s*$/gim, ''],
+];
+
+// pg_cron blocks wrapped in "if exists (... extname = 'pg_cron')" are inert on Neon
+// (the extension is not installed in neondb); their jobs run from
+// .github/workflows/neon-scheduled-jobs.yml instead.
+const GUARDED_CRON = /extname\s*=\s*'pg_cron'/i;
+
+export const findUnsupportedSql = (sql) => {
+  const code = stripSqlComments(sql);
+  return UNSUPPORTED
+    .filter(([pattern, reason]) => pattern.test(code) && !(reason.startsWith('pg_cron') && GUARDED_CRON.test(code)))
+    .map(([, reason]) => reason);
+};
+
+export const stripSqlComments = (sql) => sql
+  .replace(/\/\*[\s\S]*?\*\//g, '')
+  .replace(/--[^\n]*/g, '');
+
+// Legacy seeds inserted text ids ('src_*') into source_catalog. On Neon the id is
+// uuid; the same deterministic md5-derived uuid used by
+// db/neon/20261001_neon_runtime_bootstrap_seed.sql is produced by
+// private.legacy_source_uuid(code) (db/neon/20261006_neon_legacy_runtime_objects.sql).
+const SOURCE_CATALOG_INSERT = /insert\s+into\s+(?:public\.)?source_catalog\s*\(\s*id\s*,[\s\S]*?;[ \t]*$/gim;
+const TEXT_SOURCE_ID_TUPLE = /\(\s*'(src_[a-z0-9_]+)'/g;
+
+const rewriteLegacySourceIds = (sql) => sql.replace(SOURCE_CATALOG_INSERT, (statement) => (
+  statement.replace(TEXT_SOURCE_ID_TUPLE, "(private.legacy_source_uuid('$1')")
+));
+
+export const toNeonSql = (sql) => rewriteLegacySourceIds(
+  REWRITES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), sql),
+);
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-15.patch
```

**Verificar:**

```bash
node --test scripts/neon-migration-plan-contract.test.mjs 2>/dev/null || true   # o contrato completo entra na tarefa 16
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
feat(neon): replay the legacy migration history on Neon with tested compat layer

- scripts/lib/neon-sql-compat.mjs: deterministic rewrites (extensions.* -> public,
  auth.role() -> pg_session_jwt claims, legacy text source ids -> md5 uuid) and
  rejection of constructs that need a hand port (vault, pg_net, http, storage,
  auth.users, unguarded pg_cron).
- scripts/lib/neon-migration-patches.mjs: exact-string patches for historical
  migrations whose text no longer matches the schema (fail loudly on drift).
- db/neon/20261006_neon_legacy_runtime_objects.sql: objects that only existed in
  the live legacy schema (ai_*, vector corpus at 1024 dims + lexical/hybrid
  search, bronze landing layer, CRM/Company Master/score columns, lineage-mirror
  helpers).
- apply-neon-runtime-migrations.mjs: chronological plan from 019 onwards (184
  files), keeping the 8 migrations already recorded in production first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 16 — Agentetome em Vercel + Neon, jobs agendados sem pg_cron, contrato de runtime

**Por quê:** O control plane do Agentetome dependia de vault, pg_net, pgsql-http, pg_cron e de uma Edge Function (apagada no PR #528): manifest/export/refresh estavam quebrados e a API chamava funções inexistentes. Novo pipeline `backend/src/services/agentetomePipeline.ts` (manifest, MCP `exportar_admin`, download validado, ZIP, bronze, finalize/silver/Market Map, reexecução idempotente) + SQL Neon sem rede/vault/cron. Os jobs do pg_cron (reprocessamento a cada 5 min, resolução de entidades a cada 15 min, Agentetome de hora em hora) passam para `.github/workflows/neon-scheduled-jobs.yml`. Os workflows de capital markets e CVM chamavam um script apagado (`check-supabase-storage-budget.mjs`) e falhavam em toda execução — novo `check-neon-storage-budget.mjs` com o mesmo contrato. Correções achadas com `plpgsql_check`: colunas que faltavam (triggers de `lead_score_snapshots`/`pipeline` falhariam em todo insert) e conflito ambíguo em `knowledge_agent_upsert_node`. `commercialPriorityService` lia a tabela inexistente `ranking_snapshots`. Removido `db/neon/20261005_neon_auth_rls_compatibility.sql` (não roda no Neon e sobrescreveria o `auth.uid()` do pg_session_jwt).

**Arquivos alterados/criados:**

```
 .github/workflows/capital-market-ingestion.yml        |   9 ++-
 .github/workflows/cvm-fund-documents-schedule.yml     |   6 +-
 .github/workflows/neon-scheduled-jobs.yml             |  76 +++++++++++++++++++++
 .github/workflows/strategic-public-data.yml           |   2 +-
 api/agentetome.ts                                     |  75 +++++++++++++-------
 backend/src/services/agentetomePipeline.test.ts       | 212 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/services/agentetomePipeline.ts            | 516 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 backend/src/services/commercialPriorityService.ts     |   2 +-
 db/neon/20261006_neon_agentetome_runtime.sql          | 383 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 db/neon/20261006_neon_legacy_runtime_objects.sql      |  14 ++++
 db/neon/20261006_neon_runtime_cleanup.sql             |  13 ++++
 frontend/src/components/AgentetomeOperationsPanel.tsx |   8 ++-
 frontend/src/lib/agentetomeApi.ts                     |  23 ++++---
 scripts/agentetome-production-contract.test.mjs       |  25 ++++++-
 scripts/apply-neon-runtime-migrations.mjs             | 196 ++---------------------------------------------------
 scripts/check-neon-storage-budget.mjs                 |  71 +++++++++++++++++++
 scripts/check-neon-storage-budget.test.mjs            |  41 +++++++++++
 scripts/lib/neon-migration-patches.mjs                |  24 ++++++-
 scripts/lib/neon-migration-plan.mjs                   | 269 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 scripts/lib/neon-runtime-contract.mjs                 | 148 ++++++++++++++++++++++++++++++++++++++++
 scripts/neon-migration-plan-contract.test.mjs         |  77 +++++++++++++++++++++
 scripts/neon-runtime-contract.test.mjs                |  52 ++++++++++++++
 scripts/neon-runtime-parity-check.mjs                 |  77 +--------------------
 scripts/run-neon-scheduled-jobs.mjs                   |  78 +++++++++++++++++++++
 scripts/run-neon-scheduled-jobs.test.mjs              |  54 +++++++++++++++
 25 files changed, 2133 insertions(+), 318 deletions(-)
```

**Passo 1 — remover 1 arquivo(s):**

```bash
git rm -q -- \
  'db/neon/20261005_neon_auth_rls_compatibility.sql'
```

**Passo 2 — aplicar o patch:**

`````patch tarefa-16
diff --git a/.github/workflows/capital-market-ingestion.yml b/.github/workflows/capital-market-ingestion.yml
index 59c37ab6662e326e92e83d3b736b0c2a8c74a4e5..ac7d4d988f8d27a5df7a7b82d33aa88a166bdaf3 100644
--- a/.github/workflows/capital-market-ingestion.yml
+++ b/.github/workflows/capital-market-ingestion.yml
@@ -6,7 +6,7 @@ on:
       - main
     paths:
       - .github/workflows/capital-market-ingestion.yml
-      - scripts/check-supabase-storage-budget.mjs
+      - scripts/check-neon-storage-budget.mjs
       - api/capital-market-run.ts
       - vercel.json
       - backend/src/cli/capitalMarkets.ts
@@ -118,7 +118,7 @@ jobs:
       - name: Check storage budget for push canaries
         if: github.event_name == 'push'
         id: storage_push
-        run: node scripts/check-supabase-storage-budget.mjs --requested-rows=500 --trigger=manual
+        run: node scripts/check-neon-storage-budget.mjs --requested-rows=500 --trigger=manual
 
       - name: Publish paused push summary
         if: github.event_name == 'push' && steps.storage_push.outputs.blocked == 'true'
@@ -237,7 +237,7 @@ jobs:
             exit 0
           fi
 
-          PREFLIGHT="$(node scripts/check-supabase-storage-budget.mjs --requested-rows=20000 --trigger=backfill)"
+          PREFLIGHT="$(node scripts/check-neon-storage-budget.mjs --requested-rows=20000 --trigger=backfill)"
           echo "$PREFLIGHT" | jq .
           if [ "$(echo "$PREFLIGHT" | jq -r '.blocked')" = "true" ]; then
             echo "Backfill paused by storage budget; no write attempted."
@@ -321,7 +321,7 @@ jobs:
         id: storage
         shell: bash
         run: |
-          node scripts/check-supabase-storage-budget.mjs \
+          node scripts/check-neon-storage-budget.mjs \
             --requested-rows="${{ steps.scope.outputs.max_rows }}" \
             --trigger="${{ steps.scope.outputs.trigger }}"
 
@@ -399,6 +399,5 @@ jobs:
           name: capital-market-ingestion-diagnostics-${{ github.run_id }}
           path: |
             /tmp/cvm-ingestion.log
-            /tmp/supabase-probe.json
           if-no-files-found: ignore
           retention-days: 7
diff --git a/.github/workflows/cvm-fund-documents-schedule.yml b/.github/workflows/cvm-fund-documents-schedule.yml
index b058b43c1ad6957065adb3b3ca58ba1b5a7d1966..2e555812f53dbc4bc0eff5bf1188be924787380a 100644
--- a/.github/workflows/cvm-fund-documents-schedule.yml
+++ b/.github/workflows/cvm-fund-documents-schedule.yml
@@ -5,7 +5,7 @@ on:
     branches: [main]
     paths:
       - .github/workflows/cvm-fund-documents-schedule.yml
-      - scripts/check-supabase-storage-budget.mjs
+      - scripts/check-neon-storage-budget.mjs
       - backend/src/modules/capital-markets/**
       - backend/src/services/capitalMarketIngestionService.ts
       - backend/src/cli/capitalMarkets.ts
@@ -14,7 +14,7 @@ on:
     branches: [main]
     paths:
       - .github/workflows/cvm-fund-documents-schedule.yml
-      - scripts/check-supabase-storage-budget.mjs
+      - scripts/check-neon-storage-budget.mjs
       - backend/src/modules/capital-markets/**
       - backend/src/services/capitalMarketIngestionService.ts
       - backend/src/cli/capitalMarkets.ts
@@ -151,7 +151,7 @@ SCHEDULE_EXPRESSION: ${{ github.event.schedule || '' }}
         id: storage
         shell: bash
         run: |
-          node scripts/check-supabase-storage-budget.mjs \
+          node scripts/check-neon-storage-budget.mjs \
             --requested-rows="${{ steps.scope.outputs.max_rows }}" \
             --trigger="${{ steps.scope.outputs.trigger }}"
 
diff --git a/.github/workflows/neon-scheduled-jobs.yml b/.github/workflows/neon-scheduled-jobs.yml
new file mode 100644
index 0000000000000000000000000000000000000000..b1051c7797c64dce5e97ba8df3a2ec995aef302f
--- /dev/null
+++ b/.github/workflows/neon-scheduled-jobs.yml
@@ -0,0 +1,76 @@
+name: Neon Scheduled Jobs
+
+# Replaces the legacy pg_cron jobs. Neon only allows pg_cron in the "postgres"
+# database, so the Motor runtime (database "neondb") is driven from here.
+# Each schedule string selects its own job (github.event.schedule).
+on:
+  schedule:
+    - cron: '*/5 * * * *'    # origination-derived-reprocessing
+    - cron: '*/15 * * * *'   # candidate-automatic-entity-resolution
+    - cron: '17 * * * *'     # agentetome-due-export-refresh
+  workflow_dispatch:
+    inputs:
+      jobs:
+        description: 'Comma-separated jobs: reprocessing, entity-resolution, agentetome'
+        required: true
+        default: 'reprocessing,entity-resolution'
+
+permissions:
+  contents: read
+
+concurrency:
+  group: neon-scheduled-jobs-${{ github.event.schedule || inputs.jobs }}
+  cancel-in-progress: false
+
+jobs:
+  run:
+    runs-on: ubuntu-latest
+    timeout-minutes: 10
+    env:
+      MOTOR_NEON_DATABASE_URL: ${{ secrets.MOTOR_NEON_DATABASE_URL }}
+      CRON_SECRET: ${{ secrets.CRON_SECRET }}
+      MOTOR_API_BASE_URL: https://motor-originac-srm-marcelo-teets-projects.vercel.app
+    steps:
+      - uses: actions/checkout@v6
+
+      - uses: actions/setup-node@v6
+        with:
+          node-version: 24
+          cache: npm
+
+      - name: Install dependencies
+        run: npm ci --ignore-scripts
+
+      - name: Resolve jobs for this trigger
+        id: jobs
+        shell: bash
+        env:
+          SCHEDULE: ${{ github.event.schedule }}
+          INPUT_JOBS: ${{ inputs.jobs }}
+        run: |
+          case "$SCHEDULE" in
+            '*/5 * * * *') JOBS='reprocessing' ;;
+            '*/15 * * * *') JOBS='entity-resolution' ;;
+            '17 * * * *') JOBS='agentetome' ;;
+            *) JOBS="$INPUT_JOBS" ;;
+          esac
+          if ! printf '%s' "$JOBS" | grep -Eq '^[a-z,-]+$'; then echo "Invalid jobs: $JOBS"; exit 1; fi
+          echo "jobs=${JOBS}" >> "$GITHUB_OUTPUT"
+          echo "Resolved jobs: ${JOBS}"
+
+      - name: Validate secrets
+        shell: bash
+        env:
+          JOBS: ${{ steps.jobs.outputs.jobs }}
+        run: |
+          case "$JOBS" in
+            *reprocessing*|*entity-resolution*) test -n "$MOTOR_NEON_DATABASE_URL" || (echo "MOTOR_NEON_DATABASE_URL is missing" && exit 1) ;;
+          esac
+          case "$JOBS" in
+            *agentetome*) test -n "$CRON_SECRET" || (echo "CRON_SECRET is missing" && exit 1) ;;
+          esac
+
+      - name: Run jobs
+        env:
+          JOBS: ${{ steps.jobs.outputs.jobs }}
+        run: node scripts/run-neon-scheduled-jobs.mjs "--jobs=$JOBS"
diff --git a/.github/workflows/strategic-public-data.yml b/.github/workflows/strategic-public-data.yml
index 9969e9bd2fd9fb32f6740702da007f8ebf3c3b3c..805d410f03edcd935a308d0821cd6cb4cf458cde 100644
--- a/.github/workflows/strategic-public-data.yml
+++ b/.github/workflows/strategic-public-data.yml
@@ -119,7 +119,7 @@ REQUESTED_DATASET: ${{ inputs.dataset || '' }}
         run: |
           if [ -n "$MOTOR_NEON_DATABASE_URL" ]; then
             echo "configured=true" >> "$GITHUB_OUTPUT"
-            echo "Supabase ingestion credentials are configured."
+            echo "Neon ingestion credentials are configured."
           else
             echo "configured=false" >> "$GITHUB_OUTPUT"
             echo "::warning title=QSA ingestion blocked::Configure MOTOR_NEON_DATABASE_URL as GitHub Actions secrets. The source remains visible as waiting/degraded in the Sources control plane."
diff --git a/api/agentetome.ts b/api/agentetome.ts
index a697504b4b56adb231c26828138bf0a3f3dfaf97..fe7522cdce97262ea58ce332b91c38d72a5a6e6f 100644
--- a/api/agentetome.ts
+++ b/api/agentetome.ts
@@ -18,7 +18,10 @@ class ApiError extends Error {
   }
 }
 
-const RUNTIME = 'agentetome-v2';
+// backend/ is an ES module package; load it lazily from this CommonJS function.
+const loadPipeline = () => import('../backend/src/services/agentetomePipeline.js');
+
+const RUNTIME = 'agentetome-v3';
 const ZERO_COST_POLICY = 'locked';
 const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
 const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error.';
@@ -61,7 +64,7 @@ const authenticate = async (req: AgentetomeRequest): Promise<AuthenticatedUser>
 }
 
 const authenticateCron = (req: AgentetomeRequest) => {
-  if (!isCronAuthorized(req)) throw new ApiError('Unauthorized learning worker.', 401);
+  if (!isCronAuthorized(req)) throw new ApiError('Unauthorized scheduler request.', 401);
 };
 
 const serviceRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
@@ -175,10 +178,23 @@ export default async function handler(req: AgentetomeRequest, res: VercelRespons
       });
     }
 
+    if (operation === 'due-exports' && ['GET', 'POST'].includes(req.method ?? '')) {
+      authenticateCron(req);
+      const pipeline = await loadPipeline();
+      const summary = await pipeline.runDueExports(pipeline.requirePipelineDeps(), 1);
+      return writeJson(res, summary.status === 'blocked' ? 503 : 200, {
+        status: summary.status === 'completed' ? 'real' : 'partial',
+        generatedAt: new Date().toISOString(),
+        data: summary,
+      });
+    }
+
     const user = await authenticate(req);
 
     if (operation === 'status' && req.method === 'GET') {
-      const runtimeStatus = await serviceRpc<Record<string, unknown>>('agentetome_runtime_status', {});
+      const runtimeStatus = await serviceRpc<Record<string, unknown>>('agentetome_runtime_status', {
+        p_secret_configured: Boolean(process.env.AGENTETOME_API_KEY),
+      });
       return writeJson(res, 200, {
         status: runtimeStatus.status ?? 'partial',
         generatedAt: new Date().toISOString(),
@@ -188,14 +204,22 @@ export default async function handler(req: AgentetomeRequest, res: VercelRespons
 
     if (operation === 'admin-manifest' && req.method === 'GET') {
       await requireGodMode(user.authorization);
-      const administrator = String(requestValue(req.query.admin) ?? 'oliveira trust').trim();
-      const cut = String(requestValue(req.query.corte) ?? 'recente');
-      const competence = requestValue(req.query.competencia) ?? null;
-      const result = await serviceRpc<Record<string, any>>('agentetome_admin_manifest_secure', {
-        p_admin: administrator,
-        p_cut: cut,
-        p_competence: competence,
+      const pipeline = await loadPipeline();
+      const request = pipeline.validateExportRequest({
+        admin: String(requestValue(req.query.admin) ?? 'oliveira trust'),
+        cut: String(requestValue(req.query.corte) ?? 'recente'),
+        competence: requestValue(req.query.competencia) ?? null,
+        format: 'csv',
+      });
+      const probe = await pipeline.probeAdminManifest(request, { apiKey: process.env.AGENTETOME_API_KEY ?? '' });
+      const result = await serviceRpc<Record<string, any>>('record_agentetome_admin_manifest', {
+        p_admin: request.admin,
+        p_cut: request.cut,
+        p_competence: request.competence,
         p_requested_by: user.id,
+        p_http_status: probe.httpStatus,
+        p_duration_ms: probe.durationMs,
+        p_payload: probe.payload,
       });
       const providerError = result.provider_error === true || Number(result.http_status ?? 0) >= 400;
       return writeJson(res, providerError ? 502 : 200, {
@@ -208,24 +232,25 @@ export default async function handler(req: AgentetomeRequest, res: VercelRespons
     if ((operation === 'admin-export' || operation === 'refresh') && req.method === 'POST') {
       await requireGodMode(user.authorization);
       const body = readBody(req);
-      const administrator = String(body.admin ?? body.administrator ?? 'oliveira trust').trim();
-      const cut = String(body.corte ?? body.cut ?? 'recente');
-      const competence = typeof (body.competencia ?? body.competence) === 'string' ? String(body.competencia ?? body.competence) : null;
-      const format = String(body.formato ?? body.format ?? 'csv');
-      const result = await serviceRpc<Record<string, any>>('queue_agentetome_admin_export', {
-        p_admin: administrator,
-        p_cut: cut,
-        p_competence: competence,
-        p_format: format,
-        p_requested_by: user.id,
-        p_trigger_type: 'manual',
-      });
-      const failed = result.status === 'failed' || result.provider_error === true;
-      return writeJson(res, failed ? 502 : 202, {
+      const pipeline = await loadPipeline();
+      const result = await pipeline.runAdminExport({
+        admin: String(body.admin ?? body.administrator ?? 'oliveira trust'),
+        cut: String(body.corte ?? body.cut ?? 'recente'),
+        competence: typeof (body.competencia ?? body.competence) === 'string' ? String(body.competencia ?? body.competence) : null,
+        format: String(body.formato ?? body.format ?? 'csv'),
+        requestedBy: user.id,
+        triggerType: 'manual',
+      }, pipeline.requirePipelineDeps());
+      const failed = result.status === 'failed';
+      // 200 even on provider failure: the run was executed and its diagnosis recorded;
+      // the UI shows data.stage/data.error instead of a generic transport error.
+      return writeJson(res, 200, {
         status: failed ? 'partial' : 'real',
         generatedAt: new Date().toISOString(),
         data: result,
-        note: failed ? 'O refresh não foi enfileirado.' : 'Refresh real enfileirado no Neon. O pacote será validado, persistido e promovido ao Market Map.',
+        note: failed
+          ? 'A exportação não foi concluída; a falha foi registrada no control plane.'
+          : 'Pacote validado, persistido no Neon (bronze) e promovido ao Market Map.',
       });
     }
 
diff --git a/backend/src/services/agentetomePipeline.test.ts b/backend/src/services/agentetomePipeline.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b879699b6b7b2818d4776d0023e6798a7deba5f4
--- /dev/null
+++ b/backend/src/services/agentetomePipeline.test.ts
@@ -0,0 +1,212 @@
+import assert from 'node:assert/strict';
+import { deflateRawSync } from 'node:zlib';
+import test from 'node:test';
+import { calculateCrc32 } from '../lib/zipArchive.js';
+import {
+  AgentetomeError,
+  assertDownloadUrl,
+  parseAgentetomeArchive,
+  parseCsv,
+  runAdminExport,
+  runDueExports,
+  validateExportRequest,
+  type DataClient,
+} from './agentetomePipeline.js';
+
+const zip = (files: Record<string, string>) => {
+  const locals: Buffer[] = [];
+  const centrals: Buffer[] = [];
+  let offset = 0;
+  for (const [name, content] of Object.entries(files)) {
+    const data = Buffer.from(content, 'utf8');
+    const compressed = deflateRawSync(data);
+    const nameBytes = Buffer.from(name, 'utf8');
+    const crc = calculateCrc32(data);
+    const local = Buffer.alloc(30);
+    local.writeUInt32LE(0x04034b50, 0);
+    local.writeUInt16LE(20, 4);
+    local.writeUInt16LE(0x0800, 6);
+    local.writeUInt16LE(8, 8);
+    local.writeUInt32LE(crc, 14);
+    local.writeUInt32LE(compressed.length, 18);
+    local.writeUInt32LE(data.length, 22);
+    local.writeUInt16LE(nameBytes.length, 26);
+    const central = Buffer.alloc(46);
+    central.writeUInt32LE(0x02014b50, 0);
+    central.writeUInt16LE(20, 4);
+    central.writeUInt16LE(20, 6);
+    central.writeUInt16LE(0x0800, 8);
+    central.writeUInt16LE(8, 10);
+    central.writeUInt32LE(crc, 16);
+    central.writeUInt32LE(compressed.length, 20);
+    central.writeUInt32LE(data.length, 24);
+    central.writeUInt16LE(nameBytes.length, 28);
+    central.writeUInt32LE(offset, 42);
+    locals.push(local, nameBytes, compressed);
+    centrals.push(central, nameBytes);
+    offset += local.length + nameBytes.length + compressed.length;
+  }
+  const centralBuffer = Buffer.concat(centrals);
+  const end = Buffer.alloc(22);
+  end.writeUInt32LE(0x06054b50, 0);
+  end.writeUInt16LE(Object.keys(files).length, 8);
+  end.writeUInt16LE(Object.keys(files).length, 10);
+  end.writeUInt32LE(centralBuffer.length, 12);
+  end.writeUInt32LE(offset, 16);
+  return Buffer.concat([...locals, centralBuffer, end]);
+};
+
+const CSV = 'cnpj_fundo,data_posicao,valor\n"12.345.678/0001-90",2026-09-30,"1,5"\n12345678000190,2026-09-30,2\n';
+
+test('parseCsv handles quotes, BOM and CRLF', () => {
+  const parsed = parseCsv('﻿a,b\r\n"x, ""y""",2\r\n');
+  assert.deepEqual(parsed.headers, ['a', 'b']);
+  assert.deepEqual(parsed.rows, [{ a: 'x, "y"', b: '2' }]);
+});
+
+test('parseAgentetomeArchive keeps the legacy bronze lineage contract', () => {
+  const bytes = zip({ 'fidc_consolidado.csv': CSV });
+  const parsed = parseAgentetomeArchive({
+    zipBytes: bytes,
+    expectedSize: bytes.length,
+    expectedRows: { 'fidc_consolidado.csv': { linhas: 2 } },
+    sourceUrl: 'agentetome://not_persisted/x.zip',
+    schemaVersion: 1,
+  });
+  assert.equal(parsed.fileCount, 1);
+  assert.deepEqual(parsed.rowCounts, { 'fidc_consolidado.csv': 2 });
+  const [first] = parsed.bronzeRows;
+  assert.equal(first.dataset_code, 'agentetome_fidc_consolidado_v1');
+  assert.equal(first.record_key, 'fidc_consolidado.csv:line=1');
+  assert.equal(first.entity_cnpj, '12345678000190');
+  assert.equal(first.ref_date, '2026-09-30');
+  assert.equal(first.source_url, 'agentetome://not_persisted/x.zip#fidc_consolidado.csv');
+  assert.equal((first.payload._lineage as { package_hash: string }).package_hash, parsed.packageHash);
+
+  assert.throws(() => parseAgentetomeArchive({ zipBytes: bytes, expectedRows: { 'fidc_consolidado.csv': 3 }, sourceUrl: 'x', schemaVersion: 1 }), /row_count_mismatch/);
+  assert.throws(() => parseAgentetomeArchive({ zipBytes: bytes, expectedRows: { 'outro.csv': 1 }, sourceUrl: 'x', schemaVersion: 1 }), /missing_expected_file/);
+  assert.throws(() => parseAgentetomeArchive({ zipBytes: bytes, expectedSize: 1, expectedRows: {}, sourceUrl: 'x', schemaVersion: 1 }), /size_mismatch/);
+});
+
+test('request validation and download URL allow-list', () => {
+  assert.deepEqual(validateExportRequest({ admin: ' Oliveira Trust ' }), { admin: 'Oliveira Trust', cut: 'recente', competence: null, format: 'csv' });
+  assert.throws(() => validateExportRequest({ admin: 'x', cut: 'competencia', competence: '2026-1' }), AgentetomeError);
+  assert.throws(() => validateExportRequest({ admin: '' }), /admin_required/);
+  assert.ok(assertDownloadUrl('https://www.agentetome.com/api/export/download?t=abc'));
+  assert.throws(() => assertDownloadUrl('https://evil.example/api/export/download?t=abc'), /invalid_agentetome_download_url/);
+  assert.throws(() => assertDownloadUrl('https://www.agentetome.com/api/export/download'), /invalid_agentetome_download_url/);
+});
+
+type Call = { method: string; name: string; payload?: unknown };
+
+const fakeClient = (options: { existingParsed?: boolean } = {}) => {
+  const calls: Call[] = [];
+  const client = {
+    async rpc(name: string, args: Record<string, unknown>) {
+      calls.push({ method: 'rpc', name, payload: args });
+      if (name === 'record_agentetome_export_attempt') return { status: args.p_status, sourceId: '00000000-0000-4000-a000-000000000001' };
+      if (name === 'claim_due_agentetome_targets') return [{ administrator: 'oliveira trust', cut: 'recente', competence: null, format: 'csv', trigger_type: 'scheduled' }];
+      return { status: 'ok' };
+    },
+    async select(table: string) {
+      calls.push({ method: 'select', name: table });
+      return options.existingParsed ? [{ id: 'pkg-1', status: 'parsed' }] : [];
+    },
+    async insert(table: string, rows: unknown[]) {
+      calls.push({ method: 'insert', name: table, payload: rows });
+      return rows;
+    },
+    async upsert(table: string, rows: unknown[]) {
+      calls.push({ method: 'upsert', name: table, payload: rows });
+      return table === 'agentetome_export_packages' ? [{ id: 'pkg-new' }] : rows;
+    },
+    async update(table: string, payload: unknown) {
+      calls.push({ method: 'update', name: table, payload });
+      return [];
+    },
+  };
+  return { client: client as unknown as DataClient, calls };
+};
+
+const providerFetch = (bytes: Buffer, overrides: { exportStatus?: number } = {}) => (async (input: URL | string, init?: RequestInit) => {
+  const url = new URL(String(input));
+  if (url.pathname === '/api/mcp') {
+    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer key-1');
+    const body = JSON.parse(String(init?.body));
+    assert.equal(body.params.name, 'exportar_admin');
+    const text = JSON.stringify({
+      manifest: { schema_versao: 1, gerado_em: '2026-10-06T10:00:00Z', arquivos: { 'fidc_consolidado.csv': { linhas: 2 } } },
+      link_download: 'https://www.agentetome.com/api/export/download?t=signed',
+      tamanho_bytes: bytes.length,
+      arquivo: 'oliveira.zip',
+      expira_em: '2999-01-01T00:00:00Z',
+    });
+    return new Response(JSON.stringify({ jsonrpc: '2.0', result: { content: [{ type: 'text', text }] } }), { status: overrides.exportStatus ?? 200 });
+  }
+  if (url.pathname === '/api/export/download') return new Response(bytes, { status: 200, headers: { 'content-type': 'application/zip' } });
+  throw new Error(`unexpected ${url}`);
+}) as typeof fetch;
+
+test('runAdminExport persists a new package, bronze rows and finalizes it', async () => {
+  const bytes = zip({ 'fidc_consolidado.csv': CSV });
+  const { client, calls } = fakeClient();
+  const result = await runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv', triggerType: 'manual', requestedBy: 'u1' }, { client, apiKey: 'key-1', fetchImpl: providerFetch(bytes) });
+  assert.equal(result.status, 'real');
+  assert.equal(result.packageId, 'pkg-new');
+  assert.equal(result.bronzeRowsWritten, 2);
+  const names = calls.map((call) => `${call.method}:${call.name}`);
+  assert.deepEqual(names, [
+    'rpc:record_agentetome_export_attempt',
+    'select:agentetome_export_packages',
+    'insert:source_connector_runs',
+    'upsert:agentetome_export_packages',
+    'upsert:bronze_historical_records',
+    'rpc:finalize_agentetome_direct_package_v2',
+  ]);
+  const pkg = (calls.find((call) => call.name === 'agentetome_export_packages' && call.method === 'upsert')?.payload as Array<Record<string, unknown>>)[0];
+  assert.equal(pkg.storage_bucket, 'not_persisted');
+  assert.equal(JSON.stringify(pkg).includes('signed'), false);
+});
+
+test('runAdminExport reuses an already parsed package idempotently', async () => {
+  const bytes = zip({ 'fidc_consolidado.csv': CSV });
+  const { client, calls } = fakeClient({ existingParsed: true });
+  const result = await runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv' }, { client, apiKey: 'key-1', fetchImpl: providerFetch(bytes) });
+  assert.equal(result.mode, 'idempotent_existing_package');
+  assert.ok(calls.some((call) => call.name === 'refresh_agentetome_existing_package'));
+  assert.equal(calls.some((call) => call.name === 'source_connector_runs'), false);
+});
+
+test('runAdminExport records provider failures instead of throwing', async () => {
+  const bytes = zip({ 'fidc_consolidado.csv': CSV });
+  const { client, calls } = fakeClient();
+  const result = await runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv', triggerType: 'scheduled' }, { client, apiKey: 'key-1', fetchImpl: providerFetch(bytes, { exportStatus: 503 }) });
+  assert.equal(result.status, 'failed');
+  assert.equal(result.stage, 'request_export');
+  const failure = calls.filter((call) => call.name === 'record_agentetome_export_attempt').at(-1)?.payload as Record<string, unknown>;
+  assert.equal(failure.p_status, 'failed');
+  assert.equal(failure.p_http_status, 503);
+  assert.equal(failure.p_trigger_type, 'scheduled');
+});
+
+test('runAdminExport refuses to run without the provider key and records nothing', async () => {
+  const { client, calls } = fakeClient();
+  await assert.rejects(
+    runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv' }, { client, apiKey: '', fetchImpl: providerFetch(zip({ 'a.csv': 'x\n1\n' })) }),
+    (error: AgentetomeError) => error.statusCode === 503 && /AGENTETOME_API_KEY/.test(error.message),
+  );
+  assert.equal(calls.length, 0);
+  const due = await runDueExports({ client, apiKey: '' }, 1);
+  assert.equal(due.status, 'blocked');
+  assert.equal(calls.length, 0);
+});
+
+test('runDueExports processes the claimed targets with their trigger type', async () => {
+  const bytes = zip({ 'fidc_consolidado.csv': CSV });
+  const { client, calls } = fakeClient();
+  const summary = await runDueExports({ client, apiKey: 'key-1', fetchImpl: providerFetch(bytes) }, 1);
+  assert.equal(summary.targetsProcessed, 1);
+  assert.equal(summary.results[0].status, 'real');
+  const attempt = calls.find((call) => call.name === 'record_agentetome_export_attempt')?.payload as Record<string, unknown>;
+  assert.equal(attempt.p_trigger_type, 'scheduled');
+});
diff --git a/backend/src/services/agentetomePipeline.ts b/backend/src/services/agentetomePipeline.ts
new file mode 100644
index 0000000000000000000000000000000000000000..13068a23c4a0dc2bd76c8ef9ecb97c9a9697cb9e
--- /dev/null
+++ b/backend/src/services/agentetomePipeline.ts
@@ -0,0 +1,516 @@
+import { createHash, randomUUID } from 'node:crypto';
+import { getDataClient } from '../lib/dataClient.js';
+import { extractZipArchiveEntry, listZipArchiveEntries } from '../lib/zipArchive.js';
+
+/**
+ * Agentetome export pipeline running on Vercel + Neon.
+ *
+ * Replaces the legacy database-side HTTP calls (pgsql-http/pg_net), the vault
+ * secret and the Edge Function that downloaded, validated and persisted the
+ * administrator export package. The provider contract is unchanged:
+ *   - GET  /api/v1/export/admin/manifest       (manifest probe)
+ *   - POST /api/mcp tools/call "exportar_admin" (signed download link)
+ *   - GET  /api/export/download?t=...           (ZIP with one CSV per dataset)
+ * The signed link and the raw ZIP are never persisted; the package hash, row
+ * counts, headers and every CSV row (bronze_historical_records) are.
+ */
+
+export const AGENTETOME_ORIGIN = 'https://www.agentetome.com';
+export const PIPELINE_RUNTIME = 'vercel-agentetome-pipeline-v1';
+export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
+const BRONZE_CHUNK = 200;
+const NOT_PERSISTED_BUCKET = 'not_persisted';
+
+export type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
+export type TriggerType = 'manual' | 'scheduled' | 'retry';
+export type ExportRequest = {
+  admin: string;
+  cut: string;
+  competence: string | null;
+  format: string;
+};
+
+export type PipelineDeps = {
+  client: DataClient;
+  apiKey: string;
+  fetchImpl?: typeof fetch;
+  now?: () => Date;
+};
+
+export class AgentetomeError extends Error {
+  constructor(message: string, readonly statusCode = 502) {
+    super(message);
+    this.name = 'AgentetomeError';
+  }
+}
+
+const sha256Hex = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
+const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
+
+export const slug = (value: string) => value
+  .normalize('NFD').replace(/[̀-ͯ]/g, '')
+  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
+
+export const validateExportRequest = (input: Partial<ExportRequest>): ExportRequest => {
+  const admin = String(input.admin ?? '').trim();
+  const cut = String(input.cut ?? 'recente');
+  const format = String(input.format ?? 'csv');
+  const competence = input.competence ? String(input.competence) : null;
+  if (!admin) throw new AgentetomeError('admin_required', 400);
+  if (!['recente', 'competencia'].includes(cut)) throw new AgentetomeError('invalid_cut', 400);
+  if (!['csv', 'xlsx'].includes(format)) throw new AgentetomeError('invalid_format', 400);
+  if (cut === 'competencia' && !/^\d{4}-\d{2}$/.test(competence ?? '')) throw new AgentetomeError('invalid_competence', 400);
+  return { admin, cut, competence, format };
+};
+
+// --- CSV / ZIP --------------------------------------------------------------
+
+export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };
+
+/** RFC 4180 CSV (comma separated, double-quote escaping, CRLF or LF). */
+export const parseCsv = (text: string): ParsedCsv => {
+  const matrix: string[][] = [];
+  let row: string[] = [];
+  let field = '';
+  let quoted = false;
+  for (let index = 0; index < text.length; index += 1) {
+    const char = text[index];
+    if (char === '"') {
+      if (quoted && text[index + 1] === '"') {
+        field += '"';
+        index += 1;
+      } else quoted = !quoted;
+    } else if (char === ',' && !quoted) {
+      row.push(field);
+      field = '';
+    } else if ((char === '\n' || char === '\r') && !quoted) {
+      if (char === '\r' && text[index + 1] === '\n') index += 1;
+      row.push(field);
+      field = '';
+      if (row.some((value) => value.length > 0)) matrix.push(row);
+      row = [];
+    } else field += char;
+  }
+  row.push(field);
+  if (row.some((value) => value.length > 0)) matrix.push(row);
+  if (!matrix.length) return { headers: [], rows: [] };
+  const headers = matrix.shift()!.map((value, index) => (index === 0 ? value.replace(/^﻿/, '').trim() : value.trim()));
+  return {
+    headers,
+    rows: matrix.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))),
+  };
+};
+
+const normalizeCnpj = (row: Record<string, string>) => {
+  for (const key of ['cnpj', 'cnpj_fundo', 'cnpj_fundo_classe', 'cnpj_emissor', 'cnpj_administrador']) {
+    const digits = String(row[key] ?? '').replace(/\D/g, '');
+    if (digits.length === 14) return digits;
+  }
+  return null;
+};
+
+const resolveRefDate = (row: Record<string, string>) => {
+  for (const key of ['data_posicao', 'data_referencia', 'data_competencia', 'dt_comptc']) {
+    const value = String(row[key] ?? '').trim();
+    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
+  }
+  const competence = String(row.competencia ?? '').trim();
+  return /^\d{4}-\d{2}$/.test(competence) ? `${competence}-01` : null;
+};
+
+export type BronzeRow = {
+  dataset_code: string;
+  record_key: string;
+  ref_date: string | null;
+  entity_cnpj: string | null;
+  payload: Record<string, unknown>;
+  source_url: string;
+  content_hash: string;
+};
+
+export type ParsedArchive = {
+  packageHash: string;
+  rowCounts: Record<string, number>;
+  headers: Record<string, string[]>;
+  bronzeRows: BronzeRow[];
+  fileCount: number;
+};
+
+/**
+ * Same validation and bronze lineage as the legacy Edge Function, so packages
+ * ingested before and after the migration share dataset codes, record keys and
+ * content hashes (idempotent upserts on dataset_code,record_key).
+ */
+export const parseAgentetomeArchive = (input: {
+  zipBytes: Buffer;
+  expectedSize?: number;
+  expectedRows: Record<string, { linhas?: number } | number>;
+  sourceUrl: string;
+  schemaVersion: number;
+}): ParsedArchive => {
+  const { zipBytes, expectedSize, expectedRows, sourceUrl, schemaVersion } = input;
+  if (!zipBytes.length || zipBytes.length > MAX_ZIP_BYTES) throw new AgentetomeError('agentetome_zip_size_invalid');
+  if (expectedSize && zipBytes.length !== expectedSize) throw new AgentetomeError('agentetome_zip_size_mismatch');
+
+  const packageHash = sha256Hex(zipBytes);
+  const decoder = new TextDecoder('utf-8', { fatal: true });
+  const csvEntries = listZipArchiveEntries(zipBytes, { maxEntries: 200 })
+    .filter((entry) => entry.name.toLowerCase().endsWith('.csv'));
+  if (!csvEntries.length) throw new AgentetomeError('agentetome_zip_without_csv');
+
+  const rowCounts: Record<string, number> = {};
+  const headers: Record<string, string[]> = {};
+  const bronzeRows: BronzeRow[] = [];
+  for (const entry of csvEntries) {
+    const fileName = entry.name;
+    const parsed = parseCsv(decoder.decode(extractZipArchiveEntry(zipBytes, entry)));
+    rowCounts[fileName] = parsed.rows.length;
+    headers[fileName] = parsed.headers;
+    const rawExpected = expectedRows[fileName];
+    const expected = typeof rawExpected === 'number' ? rawExpected : Number(rawExpected?.linhas ?? -1);
+    if (expected >= 0 && expected !== parsed.rows.length) throw new AgentetomeError(`row_count_mismatch_${fileName}`);
+
+    const datasetCode = `agentetome_${fileName.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}_v${schemaVersion}`;
+    parsed.rows.forEach((row, rowIndex) => {
+      bronzeRows.push({
+        dataset_code: datasetCode,
+        record_key: `${fileName}:line=${rowIndex + 1}`,
+        ref_date: resolveRefDate(row),
+        entity_cnpj: normalizeCnpj(row),
+        payload: {
+          ...row,
+          _lineage: {
+            provider: 'agentetome',
+            package_hash: packageHash,
+            file_name: fileName,
+            row_number: rowIndex + 1,
+            schema_version: schemaVersion,
+          },
+        },
+        source_url: `${sourceUrl}#${fileName}`,
+        content_hash: sha256Hex(JSON.stringify(row)),
+      });
+    });
+  }
+  for (const fileName of Object.keys(expectedRows)) {
+    if (!(fileName in rowCounts)) throw new AgentetomeError(`missing_expected_file_${fileName}`);
+  }
+  return { packageHash, rowCounts, headers, bronzeRows, fileCount: csvEntries.length };
+};
+
+// --- Provider calls -----------------------------------------------------------
+
+const providerHeaders = (apiKey: string, extra: Record<string, string> = {}) => {
+  if (!apiKey) throw new AgentetomeError('AGENTETOME_API_KEY não está configurada.', 503);
+  return { authorization: `Bearer ${apiKey}`, accept: 'application/json', ...extra };
+};
+
+export const probeAdminManifest = async (request: ExportRequest, deps: Pick<PipelineDeps, 'apiKey' | 'fetchImpl'>) => {
+  const fetchImpl = deps.fetchImpl ?? fetch;
+  const url = new URL('/api/v1/export/admin/manifest', AGENTETOME_ORIGIN);
+  url.searchParams.set('admin', request.admin);
+  url.searchParams.set('corte', request.cut);
+  if (request.competence) url.searchParams.set('competencia', request.competence);
+  const startedAt = Date.now();
+  const response = await fetchImpl(url, { headers: providerHeaders(deps.apiKey) });
+  const text = await response.text();
+  let payload: Record<string, unknown>;
+  try {
+    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
+  } catch {
+    payload = { unparsed_body: text.slice(0, 2000) };
+  }
+  return { httpStatus: response.status, durationMs: Date.now() - startedAt, payload };
+};
+
+export type ExportPayload = {
+  manifest: { schema_versao?: number; gerado_em?: string; arquivos?: Record<string, { linhas?: number } | number> };
+  link_download: string;
+  tamanho_bytes?: number;
+  arquivo?: string;
+  expira_em?: string;
+};
+
+export const requestAdminExport = async (request: ExportRequest, deps: Pick<PipelineDeps, 'apiKey' | 'fetchImpl'>) => {
+  const fetchImpl = deps.fetchImpl ?? fetch;
+  const response = await fetchImpl(new URL('/api/mcp', AGENTETOME_ORIGIN), {
+    method: 'POST',
+    headers: providerHeaders(deps.apiKey, { 'content-type': 'application/json' }),
+    body: JSON.stringify({
+      jsonrpc: '2.0',
+      id: randomUUID(),
+      method: 'tools/call',
+      params: {
+        name: 'exportar_admin',
+        arguments: Object.fromEntries(Object.entries({
+          admin: request.admin,
+          corte: request.cut,
+          competencia: request.competence,
+          formato: request.format,
+        }).filter(([, value]) => value !== null && value !== undefined)),
+      },
+    }),
+  });
+  const text = await response.text();
+  let rpc: any;
+  try {
+    rpc = text ? JSON.parse(text) : {};
+  } catch {
+    throw new AgentetomeError('agentetome_invalid_rpc_response');
+  }
+  if (response.status < 200 || response.status >= 300 || rpc?.error) {
+    throw Object.assign(new AgentetomeError(`agentetome_export_request_failed:http_${response.status}`), { httpStatus: response.status });
+  }
+  if (rpc?.result?.isError) throw new AgentetomeError('agentetome_export_tool_error');
+  const toolText = (rpc?.result?.content ?? []).find((item: any) => item?.type === 'text')?.text;
+  if (!toolText) throw new AgentetomeError('agentetome_empty_tool_response');
+  let payload: ExportPayload;
+  try {
+    payload = JSON.parse(toolText) as ExportPayload;
+  } catch {
+    throw new AgentetomeError('agentetome_unparseable_tool_response');
+  }
+  if (Number(payload?.manifest?.schema_versao ?? 0) !== 1) throw new AgentetomeError('unsupported_agentetome_schema');
+  return payload;
+};
+
+export const assertDownloadUrl = (value: string) => {
+  let url: URL;
+  try {
+    url = new URL(value);
+  } catch {
+    throw new AgentetomeError('invalid_agentetome_download_url');
+  }
+  if (url.protocol !== 'https:' || url.hostname !== 'www.agentetome.com' || url.pathname !== '/api/export/download' || !url.searchParams.get('t')) {
+    throw new AgentetomeError('invalid_agentetome_download_url');
+  }
+  return url;
+};
+
+// --- Orchestration ------------------------------------------------------------
+
+const writeBronze = async (client: DataClient, rows: BronzeRow[]) => {
+  for (let index = 0; index < rows.length; index += BRONZE_CHUNK) {
+    await client.upsert('bronze_historical_records', rows.slice(index, index + BRONZE_CHUNK), 'dataset_code,record_key');
+  }
+};
+
+export type ExportResult = Record<string, unknown> & { status: 'real' | 'failed' };
+
+export const runAdminExport = async (
+  input: ExportRequest & { requestedBy?: string | null; triggerType?: TriggerType },
+  deps: PipelineDeps,
+): Promise<ExportResult> => {
+  const request = validateExportRequest(input);
+  if (!deps.apiKey) throw new AgentetomeError('AGENTETOME_API_KEY não está configurada.', 503);
+  const triggerType: TriggerType = input.triggerType ?? 'manual';
+  const { client } = deps;
+  const fetchImpl = deps.fetchImpl ?? fetch;
+  const now = deps.now ?? (() => new Date());
+  const startedAt = now();
+  let stage = 'record_attempt';
+  let connectorRunId: string | null = null;
+
+  try {
+    const attempt = await client.rpc<Record<string, unknown>>('record_agentetome_export_attempt', {
+      p_admin: request.admin,
+      p_cut: request.cut,
+      p_competence: request.competence,
+      p_format: request.format,
+      p_requested_by: input.requestedBy ?? null,
+      p_trigger_type: triggerType,
+      p_status: 'started',
+    });
+    const sourceId = typeof attempt?.sourceId === 'string' ? attempt.sourceId : null;
+    if (!sourceId) throw new AgentetomeError('agentetome_source_missing', 503);
+
+    stage = 'request_export';
+    const payload = await requestAdminExport(request, deps);
+    const downloadUrl = assertDownloadUrl(String(payload.link_download ?? ''));
+    if (payload.expira_em && Date.parse(payload.expira_em) <= now().getTime()) throw new AgentetomeError('provider_download_link_expired');
+
+    stage = 'download_provider_zip';
+    const download = await fetchImpl(downloadUrl, { headers: { accept: 'application/zip, application/octet-stream' } });
+    if (!download.ok) throw new AgentetomeError(`agentetome_download_http_${download.status}`);
+    const declared = Number(download.headers.get('content-length') ?? 0);
+    if (declared > MAX_ZIP_BYTES) throw new AgentetomeError('agentetome_zip_size_invalid');
+    const zipBytes = Buffer.from(await download.arrayBuffer());
+
+    stage = 'validate_archive';
+    const schemaVersion = Number(payload.manifest.schema_versao);
+    const packageHash = sha256Hex(zipBytes);
+    const generatedAt = payload.manifest.gerado_em ? String(payload.manifest.gerado_em) : startedAt.toISOString();
+    const storagePath = `administrator=${slug(request.admin)}/cut=${request.cut}/generated=${generatedAt.slice(0, 10)}/${packageHash}.zip`;
+    const parsed = parseAgentetomeArchive({
+      zipBytes,
+      expectedSize: Number(payload.tamanho_bytes ?? 0) || undefined,
+      expectedRows: payload.manifest.arquivos ?? {},
+      sourceUrl: `agentetome://${NOT_PERSISTED_BUCKET}/${storagePath}`,
+      schemaVersion,
+    });
+
+    const existing = await client.select('agentetome_export_packages', {
+      select: 'id,status',
+      filters: [{ column: 'content_hash', value: packageHash }],
+      limit: 1,
+    }) as Array<{ id: string; status: string }>;
+    if (existing[0]?.status === 'parsed') {
+      stage = 'refresh_bronze_lineage';
+      await writeBronze(client, parsed.bronzeRows);
+      stage = 'refresh_existing_package';
+      const refresh = await client.rpc('refresh_agentetome_existing_package', {
+        p_package_hash: packageHash,
+        p_runtime: PIPELINE_RUNTIME,
+        p_trigger_type: `agentetome_${triggerType}`,
+      });
+      return {
+        status: 'real',
+        mode: 'idempotent_existing_package',
+        packageId: existing[0].id,
+        packageHash,
+        rows: parsed.rowCounts,
+        bronzeRowsReconciled: parsed.bronzeRows.length,
+        refresh,
+        rawDownloadLinkPersisted: false,
+      };
+    }
+
+    stage = 'create_connector_run';
+    connectorRunId = randomUUID();
+    await client.insert('source_connector_runs', [{
+      id: connectorRunId,
+      company_id: null,
+      source_id: sourceId,
+      scope_type: 'administrator',
+      trigger_type: `agentetome_${triggerType}`,
+      status: 'running',
+      started_at: startedAt.toISOString(),
+      items_collected: 0,
+      outputs_written: 0,
+      signals_written: 0,
+      enrichments_written: 0,
+      metadata: {
+        source_code: 'src_agentetome_api',
+        administrator: request.admin,
+        cut: request.cut,
+        competence: request.competence,
+        format: request.format,
+        trigger_type: triggerType,
+        schema_version: schemaVersion,
+        runtime: PIPELINE_RUNTIME,
+      },
+    }]);
+
+    stage = 'register_package';
+    const packageRows = await client.upsert('agentetome_export_packages', [{
+      source_id: sourceId,
+      connector_run_id: connectorRunId,
+      administrator: request.admin,
+      cut: request.cut,
+      competence: request.competence,
+      format: request.format,
+      schema_version: schemaVersion,
+      provider_file_name: String(payload.arquivo ?? 'agentetome-export.zip'),
+      provider_generated_at: generatedAt,
+      provider_expires_at: payload.expira_em ?? null,
+      storage_bucket: NOT_PERSISTED_BUCKET,
+      storage_path: storagePath,
+      content_hash: packageHash,
+      size_bytes: zipBytes.length,
+      mime_type: download.headers.get('content-type') ?? 'application/zip',
+      file_count: parsed.fileCount,
+      row_counts: parsed.rowCounts,
+      headers: parsed.headers,
+      status: 'stored',
+      metadata: {
+        manifest: payload.manifest,
+        runtime: PIPELINE_RUNTIME,
+        trigger_type: triggerType,
+        ingestion_mode: 'direct_export',
+        raw_zip_persisted: false,
+        raw_download_link_persisted: false,
+      },
+    }], 'content_hash') as Array<{ id?: string }>;
+    const packageId = String(packageRows[0]?.id ?? existing[0]?.id ?? '');
+    if (!packageId) throw new AgentetomeError('package_registration_failed');
+
+    stage = 'write_bronze';
+    await writeBronze(client, parsed.bronzeRows);
+
+    stage = 'finalize_and_sync_silver';
+    const result = await client.rpc('finalize_agentetome_direct_package_v2', {
+      p_package_id: packageId,
+      p_headers: parsed.headers,
+      p_row_counts: parsed.rowCounts,
+      p_bronze_rows: parsed.bronzeRows.length,
+      p_runtime: PIPELINE_RUNTIME,
+    });
+
+    return {
+      status: 'real',
+      packageId,
+      connectorRunId,
+      schemaVersion,
+      packageHash,
+      sizeBytes: zipBytes.length,
+      files: parsed.rowCounts,
+      bronzeRowsWritten: parsed.bronzeRows.length,
+      result,
+      rawZipPersisted: false,
+      rawDownloadLinkPersisted: false,
+    };
+  } catch (error) {
+    const detail = `${stage}:${errorText(error)}`.slice(0, 900);
+    if (connectorRunId) {
+      await client.update('source_connector_runs', {
+        status: 'failed',
+        finished_at: now().toISOString(),
+        error_message: detail,
+      }, [{ column: 'id', value: connectorRunId }]).catch(() => undefined);
+    }
+    if (stage !== 'record_attempt') {
+      await client.rpc('record_agentetome_export_attempt', {
+        p_admin: request.admin,
+        p_cut: request.cut,
+        p_competence: request.competence,
+        p_format: request.format,
+        p_requested_by: input.requestedBy ?? null,
+        p_trigger_type: triggerType,
+        p_status: 'failed',
+        p_error: detail,
+        p_http_status: (error as { httpStatus?: number })?.httpStatus ?? 502,
+        p_duration_ms: now().getTime() - startedAt.getTime(),
+        p_summary: { stage, runtime: PIPELINE_RUNTIME },
+      }).catch(() => undefined);
+    }
+    return { status: 'failed', stage, error: errorText(error), administrator: request.admin, triggerType };
+  }
+};
+
+export const runDueExports = async (deps: PipelineDeps, limit = 1) => {
+  const ranAt = (deps.now ?? (() => new Date()))().toISOString();
+  if (!deps.apiKey) return { status: 'blocked', reason: 'AGENTETOME_API_KEY não está configurada.', targetsProcessed: 0, results: [], ranAt };
+  const claimed = await deps.client.rpc<Array<{ administrator: string; cut: string; competence: string | null; format: string; trigger_type: TriggerType }>>(
+    'claim_due_agentetome_targets',
+    { p_limit: limit },
+  );
+  const targets = Array.isArray(claimed) ? claimed : [];
+  const results: ExportResult[] = [];
+  for (const target of targets) {
+    results.push(await runAdminExport({
+      admin: target.administrator,
+      cut: target.cut,
+      competence: target.competence,
+      format: target.format,
+      triggerType: target.trigger_type,
+      requestedBy: null,
+    }, deps));
+  }
+  return { status: 'completed', targetsProcessed: results.length, results, ranAt };
+};
+
+export const requirePipelineDeps = (): PipelineDeps => {
+  const client = getDataClient();
+  if (!client) throw new AgentetomeError('Neon database is not configured. Set MOTOR_NEON_DATABASE_URL or DATABASE_URL.', 503);
+  return { client, apiKey: String(process.env.AGENTETOME_API_KEY ?? '') };
+};
diff --git a/backend/src/services/commercialPriorityService.ts b/backend/src/services/commercialPriorityService.ts
index d888f5468ec00b796469d530b77f3b69eb5e05e2..43e49e4bef7db5c8f869331968eaaf59c845b75e 100644
--- a/backend/src/services/commercialPriorityService.ts
+++ b/backend/src/services/commercialPriorityService.ts
@@ -17,7 +17,7 @@ export class CommercialPriorityService {
 
     const [lead, ranking, trigger, company, stakeholders, touchpoints, objections] = await Promise.all([
       this.client.select('lead_score_snapshots', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []),
-      this.client.select('ranking_snapshots', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []),
+      this.client.select('ranking_v2', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 1 }).catch(() => []),
       this.client.select('trigger_events', { select: '*', filters: [{ column: 'company_id', value: companyId }], orderBy: { column: 'created_at', ascending: false }, limit: 5 }).catch(() => []),
       this.client.select('companies', { select: 'id,estimated_ticket_size,next_step_due_at,priority_reason', filters: [{ column: 'id', value: companyId }], limit: 1 }).catch(() => []),
       this.client.select('account_stakeholders', { select: '*', filters: [{ column: 'company_id', value: companyId }] }).catch(() => []),
diff --git a/db/neon/20261006_neon_agentetome_runtime.sql b/db/neon/20261006_neon_agentetome_runtime.sql
new file mode 100644
index 0000000000000000000000000000000000000000..91ccb8fdb2d12b91c802b4da9f630fbd51337bc6
--- /dev/null
+++ b/db/neon/20261006_neon_agentetome_runtime.sql
@@ -0,0 +1,383 @@
+-- Agentetome control plane on Neon + Vercel.
+--
+-- Replaces the legacy pieces that depended on the old provider runtime:
+--   * vault secret            -> AGENTETOME_API_KEY in the Vercel environment
+--   * pgsql-http / pg_net      -> provider calls made by serverless/agentetome-pipeline.ts
+--   * Edge Function ingestion  -> same pipeline (download ZIP, validate, bronze, finalize)
+--   * pg_cron hourly refresh   -> .github/workflows/neon-scheduled-jobs.yml calling
+--                                 /api/agentetome?operation=due-exports (CRON_SECRET)
+--   * private storage bucket   -> raw ZIP is not persisted; hash + row counts + bronze rows are.
+--
+-- Tables, finalize/silver/market-map functions come verbatim from 079-092/128/129
+-- (patched by scripts/lib/neon-migration-patches.mjs). This file only defines the
+-- functions whose legacy versions performed network I/O or read vault/cron.
+
+begin;
+
+-- Runtime status ---------------------------------------------------------------
+-- p_secret_configured comes from the Vercel runtime (Boolean(process.env.AGENTETOME_API_KEY)).
+-- When called from SQL (refresh_agentetome_source_status) the last value reported by
+-- the runtime is used. "automaticRefresh" is true only when the scheduler really ran a
+-- scheduled/retry attempt in the last 36 hours.
+create or replace function public.agentetome_runtime_status(p_secret_configured boolean default null)
+returns jsonb
+language plpgsql
+security definer
+set search_path = pg_catalog, public
+as $$
+declare
+  v_source public.source_catalog%rowtype;
+  v_secret_configured boolean;
+  v_active_targets integer;
+  v_parsed_packages integer;
+  v_failed_packages integer;
+  v_bronze_rows bigint;
+  v_fidc_events integer;
+  v_historical_fidc_events integer;
+  v_last_package_at timestamptz;
+  v_last_check_at timestamptz;
+  v_last_success_at timestamptz;
+  v_last_scheduled_at timestamptz;
+  v_latest_reference_date date;
+  v_latest_observed_at timestamptz;
+  v_scheduler_active boolean;
+  v_ready boolean;
+  v_fresh boolean;
+  v_blockers jsonb := '[]'::jsonb;
+begin
+  select * into v_source
+  from public.source_catalog
+  where metadata->>'code' = 'src_agentetome_api'
+  limit 1;
+
+  v_secret_configured := coalesce(
+    p_secret_configured,
+    nullif(v_source.metadata->>'secretConfigured', '')::boolean,
+    false
+  );
+
+  select count(*) filter (where active), max(last_success_at),
+         max(last_attempt_at) filter (where metadata->>'lastTriggerType' in ('scheduled', 'retry'))
+  into v_active_targets, v_last_success_at, v_last_scheduled_at
+  from public.agentetome_export_targets;
+
+  select count(*) filter (where status = 'parsed'), count(*) filter (where status = 'failed'), max(updated_at)
+  into v_parsed_packages, v_failed_packages, v_last_package_at
+  from public.agentetome_export_packages;
+
+  select count(*)::bigint into v_bronze_rows
+  from public.bronze_historical_records
+  where dataset_code like 'agentetome\_%' escape '\';
+
+  select count(*)::integer, max(reference_date), max(observed_at)
+  into v_fidc_events, v_latest_reference_date, v_latest_observed_at
+  from public.agentetome_fidc_market_map_v1;
+
+  select count(*)::integer into v_historical_fidc_events
+  from public.capital_market_events
+  where dataset_code = 'agentetome_fidc_consolidado_v1'
+    and source_code = 'src_agentetome_api';
+
+  select max(finished_at) filter (where status = 'completed')
+  into v_last_check_at
+  from public.source_connector_runs
+  where source_id = v_source.id;
+
+  v_last_success_at := greatest(v_last_success_at, v_last_check_at);
+  v_scheduler_active := v_last_scheduled_at is not null and v_last_scheduled_at >= now() - interval '36 hours';
+
+  if not v_secret_configured then
+    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
+      'code', 'secret_missing', 'title', 'Chave do Agentetome ausente no runtime',
+      'nextAction', 'Cadastrar AGENTETOME_API_KEY nas variáveis de ambiente do projeto na Vercel.'
+    ));
+  end if;
+  if v_active_targets = 0 then
+    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
+      'code', 'no_active_target', 'title', 'Nenhuma administradora ativa',
+      'nextAction', 'Ativar ao menos um registro em agentetome_export_targets.'
+    ));
+  end if;
+  if v_parsed_packages = 0 then
+    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
+      'code', 'no_parsed_package', 'title', 'Nenhum pacote validado',
+      'nextAction', 'Executar uma ingestão real por administradora.'
+    ));
+  end if;
+  if v_fidc_events = 0 then
+    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
+      'code', 'no_fidc_events', 'title', 'Snapshot FIDC vazio',
+      'nextAction', 'Sincronizar o pacote atual para o Market Map.'
+    ));
+  end if;
+  if not v_scheduler_active then
+    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
+      'code', 'scheduler_inactive', 'title', 'Refresh automático sem execução nas últimas 36 horas',
+      'nextAction', 'Verificar o workflow neon-scheduled-jobs e o CRON_SECRET do endpoint /api/agentetome.'
+    ));
+  end if;
+
+  v_ready := v_secret_configured and v_active_targets > 0 and v_parsed_packages > 0
+    and v_fidc_events > 0 and v_scheduler_active;
+  v_fresh := v_last_check_at is not null and v_last_check_at >= now() - interval '36 hours';
+
+  if v_ready and not v_fresh then
+    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
+      'code', 'refresh_stale', 'title', 'Última verificação acima de 36 horas',
+      'nextAction', 'Executar refresh manual ou validar o worker agendado.'
+    ));
+  end if;
+
+  return jsonb_build_object(
+    'provider', 'agentetome', 'sourceCode', 'src_agentetome_api',
+    'status', case when v_ready then 'real' else 'partial' end,
+    'health', case when v_ready and v_fresh then 'healthy' else 'degraded' end,
+    'configured', v_secret_configured, 'secretMode', 'vercel_env',
+    'automaticRefresh', v_scheduler_active, 'lastScheduledAttemptAt', v_last_scheduled_at,
+    'activeTargets', v_active_targets,
+    'parsedPackages', v_parsed_packages, 'failedPackages', v_failed_packages,
+    'bronzeRows', v_bronze_rows, 'fidcEvents', v_fidc_events,
+    'historicalFidcEvents', v_historical_fidc_events,
+    'lastPackageAt', v_last_package_at, 'lastCheckAt', v_last_check_at,
+    'lastSuccessAt', v_last_success_at, 'latestReferenceDate', v_latest_reference_date,
+    'latestObservedAt', v_latest_observed_at, 'marketMapReady', v_fidc_events > 0,
+    'scoreImpact', false,
+    'capabilities', jsonb_build_array('validate_fidc_xml', 'admin_manifest', 'admin_export_ingestion', 'fidc_market_map'),
+    'runtime', jsonb_build_object(
+      'api', 'api/agentetome.ts',
+      'pipeline', 'serverless/agentetome-pipeline.ts',
+      'scheduler', '.github/workflows/neon-scheduled-jobs.yml',
+      'rawZipPersisted', false
+    ),
+    'blockers', v_blockers, 'generatedAt', now()
+  );
+end;
+$$;
+revoke all on function public.agentetome_runtime_status(boolean) from public, anon, authenticated;
+grant execute on function public.agentetome_runtime_status(boolean) to service_role;
+
+-- Source catalog mirror of the runtime status (same contract as 128, Neon channels).
+create or replace function private.refresh_agentetome_source_status()
+returns jsonb
+language plpgsql
+security definer
+set search_path = pg_catalog, public, private
+as $$
+declare
+  v_status jsonb;
+begin
+  v_status := public.agentetome_runtime_status(null);
+
+  update public.source_catalog
+  set
+    frequency = 'hourly_control_daily_export',
+    status = v_status->>'status',
+    health = v_status->>'health',
+    metadata = (metadata
+      - 'marketMapVercelStatus'
+      - 'vercelBuildChannelStatus'
+      - 'marketMapProductStatus'
+      - 'implementationPhase'
+      - 'downstreamPhase'
+      - 'runtimeChannels'
+      - 'supabaseRuntimeStatus') || jsonb_build_object(
+        'implementationPhase', 'production_operational',
+        'downstreamPhase', 'scheduled_export_bronze_silver_market_map',
+        'implementedRuntime', true,
+        'runtimeCodeReady', true,
+        'runtimeStatus', v_status->>'status',
+        'runtimeChannels', jsonb_build_object(
+          'vercelApi', 'vercel_env',
+          'ingestion', 'vercel_pipeline',
+          'xmlValidation', 'vercel_proxy'
+        ),
+        'automaticRefresh', coalesce((v_status->>'automaticRefresh')::boolean, false),
+        'activeTargets', coalesce((v_status->>'activeTargets')::integer, 0),
+        'parsedPackages', coalesce((v_status->>'parsedPackages')::integer, 0),
+        'bronzeRowsAvailable', coalesce((v_status->>'bronzeRows')::bigint, 0),
+        'fidcMarketEventsAvailable', coalesce((v_status->>'fidcEvents')::integer, 0),
+        'lastSuccessfulExportAt', v_status->>'lastSuccessAt',
+        'latestReferenceDate', v_status->>'latestReferenceDate',
+        'automaticScoreImpact', false,
+        'marketMapScoreImpact', false,
+        'runtimeStatusValidatedAt', now()
+      ),
+    updated_at = now()
+  where metadata->>'code' = 'src_agentetome_api';
+
+  return v_status;
+end;
+$$;
+revoke all on function private.refresh_agentetome_source_status() from public, anon, authenticated;
+
+-- Admin manifest: the provider call happens in Vercel; this records the audit row.
+create or replace function public.record_agentetome_admin_manifest(
+  p_admin text,
+  p_cut text,
+  p_competence text,
+  p_requested_by uuid,
+  p_http_status integer,
+  p_duration_ms integer,
+  p_payload jsonb
+)
+returns jsonb
+language plpgsql
+security definer
+set search_path = pg_catalog, public
+as $$
+declare
+  v_source_id uuid;
+  v_ok boolean;
+begin
+  select id into v_source_id
+  from public.source_catalog
+  where metadata->>'code' = 'src_agentetome_api'
+  limit 1;
+
+  v_ok := coalesce(p_http_status, 502) between 200 and 299
+    and coalesce(nullif(p_payload->>'schema_versao', '')::integer, 0) = 1;
+
+  insert into public.agentetome_operation_runs (
+    source_id, requested_by, operation, status, administrator, competence,
+    request_fingerprint, response_summary, http_status, duration_ms
+  ) values (
+    v_source_id, p_requested_by, 'admin_manifest', case when v_ok then 'completed' else 'failed' end,
+    trim(p_admin), p_competence,
+    encode(digest(jsonb_build_object(
+      'administrator', trim(p_admin), 'cut', p_cut, 'competence', p_competence
+    )::text, 'sha256'), 'hex'),
+    jsonb_build_object(
+      'schema_version', p_payload->>'schema_versao',
+      'filter', coalesce(p_payload->'filtro', '{}'::jsonb),
+      'files', coalesce(p_payload->'arquivos', '{}'::jsonb),
+      'provider_error', not v_ok,
+      'raw_download_link_persisted', false
+    ),
+    coalesce(p_http_status, 502), greatest(0, coalesce(p_duration_ms, 0))
+  );
+
+  return jsonb_build_object(
+    'provider', 'agentetome', 'operation', 'admin_manifest',
+    'admin', trim(p_admin), 'cut', p_cut, 'competence', p_competence,
+    'http_status', coalesce(p_http_status, 502), 'duration_ms', greatest(0, coalesce(p_duration_ms, 0)),
+    'payload', coalesce(p_payload, '{}'::jsonb), 'provider_error', not v_ok
+  );
+end;
+$$;
+revoke all on function public.record_agentetome_admin_manifest(text, text, text, uuid, integer, integer, jsonb)
+  from public, anon, authenticated;
+grant execute on function public.record_agentetome_admin_manifest(text, text, text, uuid, integer, integer, jsonb)
+  to service_role;
+
+-- Export attempt bookkeeping (replaces the queue/exception branches of 128).
+create or replace function public.record_agentetome_export_attempt(
+  p_admin text,
+  p_cut text,
+  p_competence text,
+  p_format text,
+  p_requested_by uuid,
+  p_trigger_type text,
+  p_status text,
+  p_error text default null,
+  p_http_status integer default null,
+  p_duration_ms integer default null,
+  p_summary jsonb default '{}'::jsonb
+)
+returns jsonb
+language plpgsql
+security definer
+set search_path = pg_catalog, public, private
+as $$
+declare
+  v_source_id uuid;
+begin
+  if p_trigger_type not in ('manual', 'scheduled', 'retry') then
+    raise exception 'invalid_agentetome_trigger_type';
+  end if;
+  if p_status not in ('started', 'failed') then
+    raise exception 'invalid_agentetome_attempt_status';
+  end if;
+
+  select id into v_source_id
+  from public.source_catalog
+  where metadata->>'code' = 'src_agentetome_api'
+  limit 1;
+
+  if p_status = 'started' then
+    update public.source_catalog
+    set metadata = metadata || jsonb_build_object('secretConfigured', true), updated_at = now()
+    where id = v_source_id;
+
+    update public.agentetome_export_targets
+    set last_attempt_at = now(), last_queued_at = now(), last_status = 'queued', last_error = null,
+        metadata = metadata || jsonb_build_object('lastTriggerType', p_trigger_type, 'lastQueuedAt', now()),
+        updated_at = now()
+    where lower(administrator) = lower(trim(p_admin));
+    return jsonb_build_object('status', 'started', 'sourceId', v_source_id, 'administrator', trim(p_admin), 'trigger_type', p_trigger_type);
+  end if;
+
+  insert into public.agentetome_operation_runs (
+    source_id, requested_by, operation, status, administrator, competence, format,
+    response_summary, http_status, duration_ms
+  ) values (
+    v_source_id, p_requested_by, 'admin_export', 'failed', trim(p_admin), p_competence, p_format,
+    coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
+      'error', left(coalesce(p_error, 'unknown_error'), 900), 'trigger_type', p_trigger_type,
+      'raw_download_link_persisted', false
+    ),
+    coalesce(p_http_status, 502), greatest(0, coalesce(p_duration_ms, 0))
+  );
+
+  perform public.record_agentetome_target_failure(p_admin, p_error, 'vercel-agentetome-pipeline-v1');
+  update public.agentetome_export_targets
+  set metadata = metadata || jsonb_build_object('lastTriggerType', p_trigger_type), updated_at = now()
+  where lower(administrator) = lower(trim(p_admin));
+
+  perform private.refresh_agentetome_source_status();
+  return jsonb_build_object(
+    'status', 'failed', 'provider', 'agentetome', 'provider_error', true,
+    'administrator', trim(p_admin), 'trigger_type', p_trigger_type, 'error', p_error
+  );
+end;
+$$;
+revoke all on function public.record_agentetome_export_attempt(text, text, text, text, uuid, text, text, text, integer, integer, jsonb)
+  from public, anon, authenticated;
+grant execute on function public.record_agentetome_export_attempt(text, text, text, text, uuid, text, text, text, integer, integer, jsonb)
+  to service_role;
+
+-- Scheduler claim (replaces private.run_agentetome_due_exports + pg_cron).
+-- Moves next_run_at forward while claiming so overlapping scheduler runs never pick
+-- the same administrator twice.
+create or replace function public.claim_due_agentetome_targets(p_limit integer default 1)
+returns table(administrator text, cut text, competence text, format text, trigger_type text)
+language plpgsql
+security definer
+set search_path = pg_catalog, public
+as $$
+begin
+  return query
+  with due as (
+    select t.id
+    from public.agentetome_export_targets t
+    where t.active and t.next_run_at <= now()
+    order by t.priority asc, t.next_run_at asc
+    limit least(greatest(coalesce(p_limit, 1), 1), 3)
+    for update skip locked
+  ), claimed as (
+    update public.agentetome_export_targets t
+    set next_run_at = now() + interval '30 minutes', updated_at = now()
+    from due
+    where t.id = due.id
+    returning t.administrator, t.cut, t.competence, t.format, t.consecutive_failures
+  )
+  select c.administrator, c.cut, c.competence, c.format,
+         case when c.consecutive_failures > 0 then 'retry' else 'scheduled' end
+  from claimed c;
+end;
+$$;
+revoke all on function public.claim_due_agentetome_targets(integer) from public, anon, authenticated;
+grant execute on function public.claim_due_agentetome_targets(integer) to service_role;
+
+select private.refresh_agentetome_source_status();
+
+commit;
diff --git a/db/neon/20261006_neon_legacy_runtime_objects.sql b/db/neon/20261006_neon_legacy_runtime_objects.sql
index e83fb480dfb56779c9a11bdc10689cde5dc5ddeb..bc037155691721f991f99ac09135c434a1f55f0a 100644
--- a/db/neon/20261006_neon_legacy_runtime_objects.sql
+++ b/db/neon/20261006_neon_legacy_runtime_objects.sql
@@ -243,6 +243,20 @@ alter table public.tasks
   add column if not exists owner_name text,
   add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null;
 
+-- Columns referenced by PL/pgSQL bodies (found with plpgsql_check on the replay).
+alter table public.lead_score_snapshots
+  add column if not exists priority_tier text,
+  add column if not exists suggested_structure text,
+  add column if not exists commercial_angle text;
+alter table public.source_documents
+  add column if not exists confidence numeric;
+alter table public.monitoring_outputs
+  add column if not exists search_profile_id text;
+alter table public.tasks
+  add column if not exists completed_at timestamptz;
+alter table public.pipeline
+  add column if not exists last_contact_at timestamptz;
+
 -- qualification_snapshots columns written by captureDerivedSyncService and read by 141-143.
 alter table public.qualification_snapshots
   add column if not exists snapshot_version text,
diff --git a/db/neon/20261006_neon_runtime_cleanup.sql b/db/neon/20261006_neon_runtime_cleanup.sql
new file mode 100644
index 0000000000000000000000000000000000000000..8e00e17a17e76b5e5ad66ff2fcf06687e3cad223
--- /dev/null
+++ b/db/neon/20261006_neon_runtime_cleanup.sql
@@ -0,0 +1,13 @@
+-- Neon runtime cleanup after the legacy replay.
+-- Superseded entity resolvers: only auto_resolve_verified_candidate_entities_v4 is
+-- scheduled (149/150/151/152). The earlier versions still reference "company_id"
+-- ambiguously (plpgsql_check: column reference "company_id" is ambiguous), so any
+-- manual call would fail at runtime. Nothing in the database or the codebase calls them.
+
+begin;
+
+drop function if exists public.auto_resolve_verified_candidate_entities(integer);
+drop function if exists public.auto_resolve_verified_candidate_entities_v3(integer);
+drop function if exists public.auto_resolve_verified_operating_issuers(integer);
+
+commit;
diff --git a/frontend/src/components/AgentetomeOperationsPanel.tsx b/frontend/src/components/AgentetomeOperationsPanel.tsx
index 25540afe49b01609aa138b96dc4725d3f65c7ed8..3c94f5c65a235ed418a4a3fd733870638593d4aa 100644
--- a/frontend/src/components/AgentetomeOperationsPanel.tsx
+++ b/frontend/src/components/AgentetomeOperationsPanel.tsx
@@ -62,8 +62,10 @@ export function AgentetomeOperationsPanel() {
     try {
       const result = await queueAgentetomeRefresh(session);
       setRefreshMessage(result.status === 'failed'
-        ? `Falha ao enfileirar: ${result.error ?? 'erro desconhecido'}`
-        : 'Refresh real enfileirado. O control plane validará o pacote e atualizará o Market Map automaticamente.');
+        ? `Falha na exportação (${result.stage ?? 'etapa desconhecida'}): ${result.error ?? 'erro desconhecido'}`
+        : result.mode === 'idempotent_existing_package'
+          ? 'Pacote já processado anteriormente; bronze e Market Map reconciliados.'
+          : `Pacote validado e promovido ao Market Map (${result.bronzeRowsWritten ?? 0} linhas em bronze).`);
       await loadRuntime();
     } catch (currentError) {
       setRefreshMessage(currentError instanceof Error ? currentError.message : String(currentError));
@@ -88,7 +90,7 @@ export function AgentetomeOperationsPanel() {
     }
   };
 
-  if (loading) return <Card title="Agentetome" subtitle="Carregando control plane, ingestão e Market Map">Consultando runtime seguro no Supabase...</Card>;
+  if (loading) return <Card title="Agentetome" subtitle="Carregando control plane, ingestão e Market Map">Consultando runtime seguro no Neon...</Card>;
   if (error || !runtime) {
     return (
       <Card title="Agentetome" subtitle="Falha controlada ao consultar a integração" actions={<Pill tone="warning">atenção</Pill>}>
diff --git a/frontend/src/lib/agentetomeApi.ts b/frontend/src/lib/agentetomeApi.ts
index 9a9a068e76ef4faae1f8a7fe70ebd294dff8d87f..82e9eb4b8a83befe31f1d3456bae00aee93effdd 100644
--- a/frontend/src/lib/agentetomeApi.ts
+++ b/frontend/src/lib/agentetomeApi.ts
@@ -14,7 +14,7 @@ export type AgentetomeRuntimeStatus = {
   status: 'real' | 'partial';
   health: 'healthy' | 'degraded';
   configured: boolean;
-  secretMode: 'supabase_vault';
+  secretMode: 'vercel_env';
   automaticRefresh: boolean;
   activeTargets: number;
   parsedPackages: number;
@@ -29,20 +29,21 @@ export type AgentetomeRuntimeStatus = {
   marketMapReady: boolean;
   scoreImpact: false;
   capabilities: string[];
-  edgeFunctions: Record<string, string>;
+  runtime: Record<string, string | boolean>;
   blockers: AgentetomeBlocker[];
   generatedAt: string;
 };
 
 export type AgentetomeRefreshResult = {
-  status: 'queued' | 'failed' | 'real';
-  provider?: string;
-  operation?: string;
-  pg_net_request_id?: number | string;
-  token_expires_at?: string;
-  trigger_type?: string;
+  status: 'real' | 'failed';
+  mode?: 'idempotent_existing_package';
+  packageId?: string;
+  packageHash?: string;
+  bronzeRowsWritten?: number;
+  bronzeRowsReconciled?: number;
+  stage?: string;
   administrator?: string;
-  raw_download_link_persisted?: false;
+  rawDownloadLinkPersisted?: false;
   error?: string;
 };
 
@@ -102,7 +103,9 @@ export async function queueAgentetomeRefresh(
       competencia: input.competence,
       formato: input.format ?? 'csv',
     }),
-  }, { timeoutMs: 28_000 });
+  }, { timeoutMs: 290_000 });
+  // The export runs synchronously (download, validation, bronze, Market Map) within the
+  // function's 300 s budget; a failed run still returns its recorded diagnosis.
   return (await parseEnvelope<AgentetomeRefreshResult>(response)).data!;
 }
 
diff --git a/scripts/agentetome-production-contract.test.mjs b/scripts/agentetome-production-contract.test.mjs
index 370ace0fce36180bb1392d85dbb847195eee6939..1f2f5da50e36f0194dfa59299ea68430b20bf7ef 100644
--- a/scripts/agentetome-production-contract.test.mjs
+++ b/scripts/agentetome-production-contract.test.mjs
@@ -7,6 +7,8 @@ const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), '
 const api = read('api/agentetome.ts');
 const neonAuth = read('serverless/neon-auth.ts');
 const panel = read('frontend/src/components/AgentetomeOperationsPanel.tsx');
+const pipeline = read('backend/src/services/agentetomePipeline.ts');
+const controlPlane = read('db/neon/20261006_neon_agentetome_runtime.sql');
 
 test('Agentetome secret is server-side and the runtime is Neon-authenticated', () => {
   assert.match(api, /process\.env\.AGENTETOME_API_KEY/);
@@ -16,11 +18,28 @@ test('Agentetome secret is server-side and the runtime is Neon-authenticated', (
   assert.match(neonAuth, /NEON_AUTH_/);
 });
 
-test('admin operations require GOD-MODE and execute through the canonical Neon RPC layer', () => {
+test('admin operations require GOD-MODE and run the Vercel pipeline against Neon', () => {
   assert.match(api, /requireGodMode\(user\.authorization\)/);
-  assert.match(api, /queue_agentetome_admin_export/);
-  assert.match(api, /agentetome_admin_manifest_secure/);
+  assert.match(api, /runAdminExport\(/);
+  assert.match(api, /record_agentetome_admin_manifest/);
   assert.match(api, /requireNeonDataClient/);
+  assert.match(api, /operation === 'due-exports'[\s\S]*authenticateCron\(req\)/);
+});
+
+test('the pipeline keeps the provider contract and never persists the signed link or the raw ZIP', () => {
+  assert.match(pipeline, /\/api\/v1\/export\/admin\/manifest/);
+  assert.match(pipeline, /name: 'exportar_admin'/);
+  assert.match(pipeline, /url\.hostname !== 'www\.agentetome\.com'/);
+  assert.match(pipeline, /finalize_agentetome_direct_package_v2/);
+  assert.match(pipeline, /refresh_agentetome_existing_package/);
+  assert.match(pipeline, /raw_download_link_persisted: false/);
+  assert.doesNotMatch(pipeline, /link_download:\s*payload/);
+});
+
+test('the Neon control plane has no vault, pg_net, http or pg_cron dependency', () => {
+  assert.doesNotMatch(controlPlane, /vault\.|net\.http|extensions\.http|cron\.(schedule|job)/);
+  assert.match(controlPlane, /function public\.claim_due_agentetome_targets/);
+  assert.match(controlPlane, /'secretMode', 'vercel_env'/);
 });
 
 test('XML validation follows the official Agentetome privacy and upload contract', () => {
diff --git a/scripts/apply-neon-runtime-migrations.mjs b/scripts/apply-neon-runtime-migrations.mjs
index 53b9eca247ca25f8813b508e183b02c39fcd0a72..bac23179a98ed7e4ad267f0fe15ad6212a494cb8 100644
--- a/scripts/apply-neon-runtime-migrations.mjs
+++ b/scripts/apply-neon-runtime-migrations.mjs
@@ -2,200 +2,12 @@ import { readFileSync } from 'node:fs';
 import pg from 'pg';
 import { findUnsupportedSql, toNeonSql } from './lib/neon-sql-compat.mjs';
 import { applyMigrationPatches } from './lib/neon-migration-patches.mjs';
+import { MIGRATIONS } from './lib/neon-migration-plan.mjs';
 
 const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
 if (!connectionString) throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');
 
-const migrations = [
-  'db/neon/20261005_neon_runtime_roles.sql',
-  'db/migrations/035_capital_market_public_data.sql',
-  'db/migrations/036_capital_market_dataset_runs_source_index.sql',
-  'db/migrations/037_capital_market_incremental_checkpoints.sql',
-  'db/migrations/044_capital_market_ingestion_health.sql',
-  'db/migrations/060_origination_knowledge_vault.sql',
-  'db/neon/20261005_neon_qualification_compatibility.sql',
-  'db/neon/20261005_neon_signal_compatibility.sql',
-  'db/neon/20260928_neon_uuid_extended_runtime.sql',
-  'db/neon/20260928_neon_origination_intelligence_modules.sql',
-  'db/neon/20261006_neon_legacy_runtime_objects.sql',
-  'db/neon/20260928_neon_match_vector_documents.sql',
-  'db/migrations/019_capture_treatment_runtime_alignment.sql',
-  'db/migrations/020_runtime_capture_repository_alignment.sql',
-  'db/migrations/020_origination_operating_system.sql',
-  'db/migrations/021_rss_source_expansion.sql',
-  'db/migrations/022_data_platform_d0_d1_foundation.sql',
-  'db/migrations/023_data_quality_gates_minimum.sql',
-  'db/migrations/024_mais_retorno_usage_tables.sql',
-  'db/migrations/025_reserve_external_api_request.sql',
-  'db/migrations/026_seed_mais_retorno_source.sql',
-  'db/migrations/029_non_obvious_sources_capture_treatment.sql',
-  'db/migrations/030_source_treatment_impact_views.sql',
-  'db/migrations/031_linkedin_media_source_expansion.sql',
-  'db/migrations/033_ranking_v2_persistence.sql',
-  'db/migrations/034_ranking_v2_live_schema.sql',
-  'db/migrations/032_company_signals_source_lineage_backfill.sql',
-  'db/migrations/043_capital_market_single_running_guard.sql',
-  'db/migrations/044_cvm_capture_inbox_candidates.sql',
-  'db/migrations/045_repair_cvm_capture_inbox_candidate_sync.sql',
-  'db/migrations/046_company_discovery_links_live_schema.sql',
-  'db/migrations/047_normalize_cvm_candidate_contract.sql',
-  'db/migrations/048_b2b_scraper_fidc_source_expansion.sql',
-  'db/migrations/049_bcb_sgs_macro_treatment.sql',
-  'db/migrations/050_public_records_api_sources.sql',
-  'db/migrations/051_vc_portfolio_monitor_activation.sql',
-  'db/migrations/052_open_finance_participants_api_source.sql',
-  'db/migrations/053_reconcile_bcb_vc_source_foundation.sql',
-  'db/migrations/054_free_official_data_sources.sql',
-  'db/migrations/055_reconcile_free_official_source_registry.sql',
-  'db/migrations/056_free_source_evidence_guardrails.sql',
-  'db/migrations/057_public_bulk_ingestion.sql',
-  'db/migrations/058_public_bulk_signal_sync.sql',
-  'db/migrations/059_public_data_operations_snapshot.sql',
-  'db/migrations/060_public_evidence_intelligence.sql',
-  'db/migrations/061_public_qualification_patterns.sql',
-  'db/migrations/062_public_score_lead_guardrails.sql',
-  'db/migrations/063_public_pipeline_ranking.sql',
-  'db/migrations/064_score_compatibility_columns.sql',
-  'db/migrations/065_strategic_source_governance.sql',
-  'db/migrations/066_origination_factor_map_schema.sql',
-  'db/migrations/067_strategic_record_signal_sync.sql',
-  'db/migrations/068_factor_map_runtime.sql',
-  'db/migrations/069_factor_qualification_integration.sql',
-  'db/migrations/070_factor_pattern_integration.sql',
-  'db/migrations/071_factor_lead_pipeline_integration.sql',
-  'db/migrations/072_factor_outcome_map.sql',
-  'db/migrations/073_factor_map_backfill.sql',
-  'db/migrations/074_factor_map_dedup_calibration.sql',
-  'db/migrations/075_factor_map_security_hardening.sql',
-  'db/migrations/076_factor_map_foreign_key_indexes.sql',
-  'db/migrations/077_strategic_source_runtime_governance.sql',
-  'db/migrations/078_strategic_source_probe_status.sql',
-  'db/migrations/076_knowledge_company_workspace.sql',
-  'db/migrations/077_knowledge_vault_function_grants_hardening.sql',
-  'db/migrations/078_knowledge_capture_concurrency_lock.sql',
-  'db/migrations/082_knowledge_saved_views_bases.sql',
-  'db/migrations/083_knowledge_monitoring_output_capture.sql',
-  'db/migrations/085_knowledge_execution_actions.sql',
-  'db/migrations/086_knowledge_execution_reference_validation.sql',
-  'db/migrations/087_knowledge_execution_completion_guard.sql',
-  'db/migrations/088_knowledge_execution_result_lineage.sql',
-  'db/migrations/089_knowledge_execution_context.sql',
-  'db/migrations/090_knowledge_execution_outcome_views.sql',
-  'db/migrations/091_factor_outcome_map_v2.sql',
-  'db/migrations/092_knowledge_outcome_intelligence_rpc.sql',
-  'db/migrations/093_company_master_decision_quality_gate.sql',
-  'db/migrations/094_company_decision_write_guards.sql',
-  'db/migrations/095_company_decision_readiness_snapshot.sql',
-  'db/migrations/096_candidate_identity_quality_gate.sql',
-  'db/migrations/097_candidate_eligible_company_link_gate.sql',
-  'db/migrations/098_candidate_identity_trigger_security.sql',
-  'db/migrations/093_knowledge_outcome_operations.sql',
-  'db/migrations/099_candidate_identity_review_workflow.sql',
-  'db/migrations/100_fix_candidate_identity_review_generated_columns.sql',
-  'db/migrations/101_fix_identity_domain_normalization.sql',
-  'db/migrations/102_candidate_identity_reviews_explicit_deny_policy.sql',
-  'db/migrations/094_knowledge_outcome_workbench.sql',
-  'db/migrations/103_separate_entity_and_decision_eligibility.sql',
-  'db/migrations/097_knowledge_hybrid_search_v9.sql',
-  'db/migrations/092_cvm_delivery_hardening.sql',
-  'db/migrations/096_qualification_score_semantics.sql',
-  'db/migrations/098_knowledge_embedding_coverage_v10.sql',
-  'db/migrations/099_knowledge_embedding_budget_baseline_fix.sql',
-  'db/migrations/100_knowledge_embedding_vector_comparison_fix.sql',
-  'db/migrations/101_knowledge_embedding_security_hardening.sql',
-  'db/migrations/102_qsa_fallback_governance.sql',
-  'db/migrations/103_qsa_fallback_idempotency.sql',
-  'db/migrations/093_cvm_checkpoint_timestamp_contract.sql',
-  'db/migrations/20260724152000_user_profiles_god_mode_auth_flows.sql',
-  'db/migrations/20260724153500_user_access_security_invoker.sql',
-  'db/migrations/20260724155000_fix_user_access_invoker_column_grants.sql',
-  'db/migrations/20260724160500_harden_god_mode_direct_updates.sql',
-  'db/migrations/104_finep_public_funding.sql',
-  'db/migrations/105_finep_operations_panel_performance.sql',
-  'db/migrations/106_anbima_public_source_governance.sql',
-  'db/migrations/119_candidate_decision_queue.sql',
-  'db/migrations/120_candidate_decision_queue_filter_hardening.sql',
-  'db/migrations/121_candidate_decision_queue_calibration_v2.sql',
-  'db/migrations/104_knowledge_learning_agent.sql',
-  'db/migrations/105_knowledge_learning_agent_link_fix.sql',
-  'db/migrations/106_knowledge_learning_agent_enqueue_rls.sql',
-  'db/migrations/107_knowledge_learning_agent_pgcrypto_schema.sql',
-  'db/migrations/122_candidate_cvm_company_registry.sql',
-  'db/migrations/123_candidate_decision_queue_cvm_coverage_v3.sql',
-  'db/migrations/124_candidate_cvm_registry_determinism.sql',
-  'db/migrations/108_dcm_daily_outreach_operating_loop.sql',
-  'db/migrations/109_dcm_daily_outreach_view_security.sql',
-  'db/migrations/20260724195500_dcm_daily_outreach_rls_hardening.sql',
-  'db/migrations/095_index_dcm_outreach_feedback_daily_lead.sql',
-  'db/migrations/125_cvm_production_intelligence_foundation.sql',
-  'db/migrations/126_cvm_production_intelligence_signals.sql',
-  'db/migrations/127_cvm_production_intelligence_delivery_views.sql',
-  'db/migrations/128_cvm_explicit_candidate_delivery.sql',
-  'db/migrations/129_cvm_atomic_batch_persistence.sql',
-  'db/migrations/108_company_credit_review_gate.sql',
-  'db/migrations/109_filter_ranking_v2_by_decision_eligibility.sql',
-  'db/migrations/110_align_credit_review_with_decision_engines.sql',
-  'db/migrations/111_harden_credit_review_trigger_privileges.sql',
-  'db/migrations/112_enforce_authenticated_credit_review_finalization.sql',
-  'db/migrations/113_reclassify_empty_successful_capture_runs.sql',
-  'db/migrations/114_quarantine_unattributed_credit_reviews.sql',
-  'db/migrations/115_fix_knowledge_learning_service_role_detection.sql',
-  'db/migrations/116_harden_pipeline_eligibility_surfaces.sql',
-  'db/migrations/117_govern_knowledge_learning_queue.sql',
-  'db/migrations/118_circuit_break_knowledge_provider_billing.sql',
-  'db/migrations/119_harden_knowledge_learning_governance_security.sql',
-  'db/migrations/20260727123000_harden_user_owned_data_rls.sql',
-  'db/migrations/20260727123100_harden_vector_corpus_and_role_rpc.sql',
-  'db/migrations/20260727123200_repair_company_signal_history.sql',
-  'db/migrations/20260727123300_signal_quality_guardrails_and_score_identity.sql',
-  'db/neon/20261005_neon_microsoft_runtime.sql',
-  'db/neon/20261005_neon_archive_metadata.sql',
-  'db/migrations/20260727173000_source_control_sheet_sync.sql',
-  'db/migrations/130_cvm_batch_deduplicate_input.sql',
-  'db/migrations/131_activate_bcb_sgs_credit_series.sql',
-  'db/migrations/132_fidcs_source_and_catalog_governance.sql',
-  'db/migrations/133_cvm_fund_documents_and_source_schedules.sql',
-  'db/migrations/134_source_probe_schedule_alignment.sql',
-  'db/migrations/135_source_schedule_registry_service_role_policy.sql',
-  'db/migrations/136_cvm_free_tier_storage_guard.sql',
-  'db/migrations/138_compact_existing_cvm_event_payloads.sql',
-  'db/migrations/20260810232500_agfeed_source_governance.sql',
-  'db/migrations/20260811235500_agfeed_search_discovery_schedule.sql',
-  'db/migrations/20260812003000_optimize_candidate_event_uuid_join.sql',
-  'db/migrations/20260812005500_backfill_identity_review_prefill.sql',
-  'db/migrations/20260812011000_rss_operating_company_commercial_queue.sql',
-  'db/migrations/20260812012500_rss_operating_company_commercial_queue_v2.sql',
-  'db/migrations/20260812014500_rss_first_party_identity_seed.sql',
-  'db/migrations/20260812053000_data_treatment_enrichment_v2.sql',
-  'db/migrations/20260812021000_bull_media_alias_dedupe.sql',
-  'db/migrations/20260812022500_bull_alias_reassert_after_semantics_v3.sql',
-  'db/migrations/20260812024500_rss_first_party_identity_batch_v2.sql',
-  'db/migrations/130_debentures_snd_source_catalog.sql',
-  'db/migrations/131_debentures_snd_signal_treatment.sql',
-  'db/migrations/132_debentures_snd_candidate_delivery.sql',
-  'db/migrations/133_debentures_snd_delivery_whitelist.sql',
-  'db/migrations/134_debentures_snd_cold_archive_policy.sql',
-  'db/migrations/134_people_capital_intelligence.sql',
-  'db/migrations/135_people_capital_job_history_guard.sql',
-  'db/migrations/136_people_capital_vault_ui_compat.sql',
-  'db/migrations/137_people_capital_hiring_mix.sql',
-  'db/migrations/139_origination_intelligence_brief.sql',
-  'db/migrations/138_people_capital_candidate_promotion_graph.sql',
-  'db/migrations/140_origination_brief_real_company_gate.sql',
-  'db/migrations/141_universal_origination_reasoning_v2.sql',
-  'db/migrations/142_universal_origination_reasoning_calibration.sql',
-  'db/migrations/143_universal_origination_reasoning_conflict_resolution.sql',
-  'db/migrations/144_origination_reprocessing_queue.sql',
-  'db/migrations/145_origination_reprocessing_schedule.sql',
-  'db/migrations/146_automatic_candidate_entity_resolution.sql',
-  'db/migrations/147_origination_entity_eligibility_gate.sql',
-  'db/migrations/148_operating_issuer_resolution_and_analytics_fix.sql',
-  'db/migrations/149_candidate_entity_resolution_v3.sql',
-  'db/migrations/150_candidate_entity_resolution_v4.sql',
-  'db/migrations/151_candidate_entity_resolution_v5_conflict_constraint.sql',
-  'db/migrations/152_regulated_issuer_identity_calibration.sql',
-  'db/migrations/145_entity_relevance_v3_historical_remediation.sql',
-];
+const migrations = MIGRATIONS;
 
 
 const pool = new pg.Pool({
@@ -228,14 +40,14 @@ try {
       continue;
     }
 
-    const source = readFileSync(file, 'utf8');
+    const source = applyMigrationPatches(file, readFileSync(file, 'utf8'));
     const unsupported = findUnsupportedSql(source);
     if (unsupported.length) {
       console.error('failed', file, `unsupported on Neon: ${unsupported.join('; ')}`);
       process.exitCode = 1;
       break;
     }
-    const sql = toNeonSql(applyMigrationPatches(file, source));
+    const sql = toNeonSql(source);
     console.log('apply', file);
     try {
       await client.query('begin');
diff --git a/scripts/check-neon-storage-budget.mjs b/scripts/check-neon-storage-budget.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..f5da7826fa7a192c51e12b2a8ea9843ed54d07e1
--- /dev/null
+++ b/scripts/check-neon-storage-budget.mjs
@@ -0,0 +1,71 @@
+// Neon storage-budget preflight for GitHub Actions ingestion jobs.
+// Replaces scripts/check-supabase-storage-budget.mjs (removed with the legacy
+// provider) and keeps its CLI and GITHUB_OUTPUT contract:
+//   node scripts/check-neon-storage-budget.mjs --requested-rows=500 --trigger=manual
+// Outputs: state, database_mb, allowed_rows, requested_rows, effective_rows,
+// trigger, blocked, capped. The source of truth is the Neon growth circuit
+// breaker (db/neon/20261001_neon_database_growth_circuit_breaker.sql).
+import { appendFileSync } from 'node:fs';
+import { pathToFileURL } from 'node:url';
+
+// Row allowance per guard status. "degraded" keeps small incremental runs alive;
+// "block_raw" stops every raw/heavy write (the database trigger would reject them).
+export const ROW_ALLOWANCE = Object.freeze({ normal: 50_000, degraded: 2_000, block_raw: 0, unknown: 0 });
+const STATE_BY_STATUS = Object.freeze({ normal: 'healthy', degraded: 'degraded', block_raw: 'blocked', unknown: 'unknown' });
+
+export const parseArgs = (argv) => {
+  const args = new Map(argv.map((arg) => {
+    const [key, ...rest] = arg.replace(/^--/, '').split('=');
+    return [key, rest.join('=')];
+  }));
+  return {
+    requestedRows: Math.max(0, Number.parseInt(args.get('requested-rows') || '0', 10) || 0),
+    triggerType: String(args.get('trigger') || 'manual').trim() || 'manual',
+  };
+};
+
+export const evaluateBudget = ({ guard, requestedRows, triggerType }) => {
+  const status = String(guard?.status ?? 'unknown');
+  const state = STATE_BY_STATUS[status] ?? 'unknown';
+  const allowedRows = ROW_ALLOWANCE[status] ?? 0;
+  const databaseMb = Math.round((Number(guard?.current_bytes ?? 0) / 1_000_000) * 100) / 100;
+  const backfillBlocked = triggerType === 'backfill' && state !== 'healthy';
+  const effectiveRows = backfillBlocked ? 0 : Math.min(requestedRows, allowedRows);
+  const blocked = requestedRows > 0 && effectiveRows <= 0;
+  const capped = effectiveRows > 0 && effectiveRows < requestedRows;
+  return { state, guardStatus: status, databaseMb, allowedRows, requestedRows, effectiveRows, triggerType, blocked, capped };
+};
+
+export const githubOutputLines = (result) => [
+  `state=${result.state}`,
+  `database_mb=${result.databaseMb}`,
+  `allowed_rows=${result.allowedRows}`,
+  `requested_rows=${result.requestedRows}`,
+  `effective_rows=${result.effectiveRows}`,
+  `trigger=${result.triggerType}`,
+  `blocked=${result.blocked}`,
+  `capped=${result.capped}`,
+  '',
+].join('\n');
+
+const main = async () => {
+  const { requestedRows, triggerType } = parseArgs(process.argv.slice(2));
+  const { query, closeNeonPool } = await import('./lib/neon-db.mjs');
+  let guard;
+  try {
+    const rows = await query('select private.refresh_database_growth_guard() as guard');
+    guard = rows[0]?.guard ?? {};
+  } finally {
+    await closeNeonPool();
+  }
+  const result = evaluateBudget({ guard, requestedRows, triggerType });
+  console.log(JSON.stringify(result));
+  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, githubOutputLines(result));
+};
+
+if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
+  main().catch((error) => {
+    console.error(`Neon storage budget preflight failed: ${error instanceof Error ? error.message : error}`);
+    process.exit(1);
+  });
+}
diff --git a/scripts/check-neon-storage-budget.test.mjs b/scripts/check-neon-storage-budget.test.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..64b3b5ca4e26da59abc4b684b8c9f06818ca0f02
--- /dev/null
+++ b/scripts/check-neon-storage-budget.test.mjs
@@ -0,0 +1,41 @@
+import assert from 'node:assert/strict';
+import { readFileSync, readdirSync } from 'node:fs';
+import test from 'node:test';
+import { evaluateBudget, githubOutputLines, parseArgs } from './check-neon-storage-budget.mjs';
+
+test('parses the legacy CLI contract', () => {
+  assert.deepEqual(parseArgs(['--requested-rows=500', '--trigger=backfill']), { requestedRows: 500, triggerType: 'backfill' });
+  assert.deepEqual(parseArgs([]), { requestedRows: 0, triggerType: 'manual' });
+});
+
+test('maps the Neon growth guard to the preflight decision', () => {
+  const healthy = evaluateBudget({ guard: { status: 'normal', current_bytes: 123_450_000 }, requestedRows: 500, triggerType: 'manual' });
+  assert.deepEqual([healthy.state, healthy.effectiveRows, healthy.blocked, healthy.capped, healthy.databaseMb], ['healthy', 500, false, false, 123.45]);
+
+  const degraded = evaluateBudget({ guard: { status: 'degraded' }, requestedRows: 20_000, triggerType: 'schedule' });
+  assert.deepEqual([degraded.state, degraded.effectiveRows, degraded.capped], ['degraded', 2_000, true]);
+
+  const backfill = evaluateBudget({ guard: { status: 'degraded' }, requestedRows: 20_000, triggerType: 'backfill' });
+  assert.equal(backfill.blocked, true);
+
+  const blocked = evaluateBudget({ guard: { status: 'block_raw' }, requestedRows: 10, triggerType: 'manual' });
+  assert.deepEqual([blocked.state, blocked.blocked], ['blocked', true]);
+
+  const unknown = evaluateBudget({ guard: null, requestedRows: 1, triggerType: 'manual' });
+  assert.equal(unknown.blocked, true);
+});
+
+test('writes every GITHUB_OUTPUT key consumed by the workflows', () => {
+  const lines = githubOutputLines(evaluateBudget({ guard: { status: 'normal' }, requestedRows: 5, triggerType: 'manual' }));
+  for (const key of ['state', 'database_mb', 'allowed_rows', 'requested_rows', 'effective_rows', 'trigger', 'blocked', 'capped']) {
+    assert.match(lines, new RegExp(`^${key}=`, 'm'));
+  }
+});
+
+test('no workflow references the removed legacy preflight script', () => {
+  const dir = new URL('../.github/workflows/', import.meta.url);
+  for (const file of readdirSync(dir)) {
+    const content = readFileSync(new URL(file, dir), 'utf8');
+    assert.doesNotMatch(content, /check-supabase-storage-budget/, file);
+  }
+});
diff --git a/scripts/lib/neon-migration-patches.mjs b/scripts/lib/neon-migration-patches.mjs
index c60c0b6360b7c4594fe89a00694eb8a5522ab4a6..f1ff01310be5cc24b2f85cf4899637fe6fed46ca 100644
--- a/scripts/lib/neon-migration-patches.mjs
+++ b/scripts/lib/neon-migration-patches.mjs
@@ -37,6 +37,27 @@ export const PATCHES = {
     // The probe text was copied from the live function layout; 150 in the repository is formatted differently.
     ["  v_old text := $old$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92))$old$;\n  v_new text := $new$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and (\n          coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92\n          or (\n            c.candidate_role='operating_issuer'\n            and c.cvm_code is not null\n            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null\n            and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.90\n          )\n        )))$new$;", "  -- neon: matched against the repository text of 150 (the live function had a different layout)\n  v_old text := $old$(c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain'\n          and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92)$old$;\n  v_new text := $new$(c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain' and (\n          coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92\n          or (\n            c.candidate_role='operating_issuer'\n            and c.cvm_code is not null\n            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null\n            and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.90\n          )\n        ))$new$;"],
   ],
+  // Agentetome: HTTP/vault/pg_net/storage pieces are replaced by api/agentetome.ts +
+  // serverless/agentetome-pipeline.ts (Vercel) and db/neon/20261006_neon_agentetome_runtime.sql.
+  'db/migrations/079_agentetome_source_integration.sql': [
+    ['requested_by uuid references auth.users(id) on delete set null,', 'requested_by uuid references public.user_profiles(id) on delete set null,'],
+  ],
+  'db/migrations/089_agentetome_export_ingestion.sql': [
+    { removeFrom: "insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)", removeThrough: "  allowed_mime_types=excluded.allowed_mime_types;" },
+    { removeFrom: "create or replace function private.request_agentetome_admin_export(", removeThrough: "grant execute on function private.run_agentetome_export_ingestion(text,text,text,text)\n  to service_role;" },
+    { removeFrom: "create or replace function private.queue_agentetome_package_recovery(p_package_id uuid)", removeThrough: "grant execute on function private.queue_agentetome_package_recovery(uuid)\n  to service_role;" },
+  ],
+  'db/migrations/128_agentetome_production_control_plane.sql': [
+    { removeFrom: "create or replace function public.get_agentetome_runtime_secret()", removeThrough: "grant execute on function public.get_agentetome_runtime_secret() to service_role;" },
+    { removeFrom: "create or replace function public.agentetome_admin_manifest_secure(", removeThrough: "grant execute on function public.agentetome_runtime_status() to service_role;" },
+    { removeFrom: "create or replace function public.queue_agentetome_admin_export(", removeThrough: "$$select private.run_agentetome_due_exports();$$\n);" },
+    { removeFrom: "select private.refresh_agentetome_source_status();\nnotify pgrst,'reload schema';", removeThrough: "notify pgrst,'reload schema';" },
+  ],
+  'db/migrations/104_knowledge_learning_agent.sql': [
+    // Local variables node_id/reference_type/reference_id shadow the conflict-target columns:
+    // "column reference node_id is ambiguous" whenever references are applied (plpgsql_check).
+    ['    on conflict (node_id, reference_type, reference_id) do update set label = excluded.label, snapshot = excluded.snapshot;', '    on conflict on constraint knowledge_references_node_id_reference_type_reference_id_key do update set label = excluded.label, snapshot = excluded.snapshot;'],
+  ],
   'db/migrations/113_reclassify_empty_successful_capture_runs.sql': [
     // The diagnostics view only existed as a dashboard object in the legacy provider and is not used by the runtime.
     ["comment on view public.gold_source_connector_run_diagnostics is\n  'Connector run diagnostics. Completed runs with zero outputs are valid empty results and resolve to needs_review, not failed.';", '-- neon: gold_source_connector_run_diagnostics is not part of the Neon runtime'],
@@ -52,7 +73,8 @@ const applyPatch = (file, current, patch) => {
   const start = current.indexOf(patch.removeFrom);
   const end = start < 0 ? -1 : current.indexOf(patch.removeThrough, start);
   if (start < 0 || end < 0) throw new Error(`Neon removal for ${file} no longer matches: ${patch.removeFrom}`);
-  return `${current.slice(0, start)}-- neon: removed block "${patch.removeFrom.slice(0, 60)}"${current.slice(end + patch.removeThrough.length)}`;
+  const label = patch.removeFrom.split('\n')[0].slice(0, 60);
+  return `${current.slice(0, start)}-- neon: removed block "${label}"${current.slice(end + patch.removeThrough.length)}`;
 };
 
 export const applyMigrationPatches = (file, sql) => (PATCHES[file] ?? [])
diff --git a/scripts/lib/neon-migration-plan.mjs b/scripts/lib/neon-migration-plan.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..4a485db0b237c2f436ca7e9e57cf9c54145b8554
--- /dev/null
+++ b/scripts/lib/neon-migration-plan.mjs
@@ -0,0 +1,269 @@
+// Ordered Neon migration plan used by scripts/apply-neon-runtime-migrations.mjs.
+//
+// * The first entries are already recorded in private.motor_neon_migrations on the
+//   production branch (2026-10-05) and must stay first and unchanged.
+// * After them: the Neon-native bootstrap files (db/neon) and the legacy history
+//   from 019 onwards in commit order, rewritten on the fly by
+//   scripts/lib/neon-sql-compat.mjs and patched by scripts/lib/neon-migration-patches.mjs.
+// * NOT_REPLAYED documents every legacy migration intentionally left out.
+
+export const PRODUCTION_APPLIED = Object.freeze([
+  'db/neon/20261005_neon_runtime_roles.sql',
+  'db/migrations/035_capital_market_public_data.sql',
+  'db/migrations/036_capital_market_dataset_runs_source_index.sql',
+  'db/migrations/037_capital_market_incremental_checkpoints.sql',
+  'db/migrations/044_capital_market_ingestion_health.sql',
+  'db/migrations/060_origination_knowledge_vault.sql',
+  'db/neon/20261005_neon_qualification_compatibility.sql',
+  'db/neon/20261005_neon_signal_compatibility.sql',
+]);
+
+export const MIGRATIONS = Object.freeze([
+  ...PRODUCTION_APPLIED,
+  'db/neon/20260928_neon_uuid_extended_runtime.sql',
+  'db/neon/20260928_neon_origination_intelligence_modules.sql',
+  'db/neon/20261006_neon_legacy_runtime_objects.sql',
+  'db/neon/20260928_neon_match_vector_documents.sql',
+  'db/migrations/019_capture_treatment_runtime_alignment.sql',
+  'db/migrations/020_runtime_capture_repository_alignment.sql',
+  'db/migrations/020_origination_operating_system.sql',
+  'db/migrations/021_rss_source_expansion.sql',
+  'db/migrations/022_data_platform_d0_d1_foundation.sql',
+  'db/migrations/023_data_quality_gates_minimum.sql',
+  'db/migrations/024_mais_retorno_usage_tables.sql',
+  'db/migrations/025_reserve_external_api_request.sql',
+  'db/migrations/026_seed_mais_retorno_source.sql',
+  'db/migrations/029_non_obvious_sources_capture_treatment.sql',
+  'db/migrations/030_source_treatment_impact_views.sql',
+  'db/migrations/031_linkedin_media_source_expansion.sql',
+  'db/migrations/033_ranking_v2_persistence.sql',
+  'db/migrations/034_ranking_v2_live_schema.sql',
+  'db/migrations/032_company_signals_source_lineage_backfill.sql',
+  'db/migrations/043_capital_market_single_running_guard.sql',
+  'db/migrations/044_cvm_capture_inbox_candidates.sql',
+  'db/migrations/045_repair_cvm_capture_inbox_candidate_sync.sql',
+  'db/migrations/046_company_discovery_links_live_schema.sql',
+  'db/migrations/047_normalize_cvm_candidate_contract.sql',
+  'db/migrations/048_b2b_scraper_fidc_source_expansion.sql',
+  'db/migrations/049_bcb_sgs_macro_treatment.sql',
+  'db/migrations/050_public_records_api_sources.sql',
+  'db/migrations/051_vc_portfolio_monitor_activation.sql',
+  'db/migrations/052_open_finance_participants_api_source.sql',
+  'db/migrations/053_reconcile_bcb_vc_source_foundation.sql',
+  'db/migrations/054_free_official_data_sources.sql',
+  'db/migrations/055_reconcile_free_official_source_registry.sql',
+  'db/migrations/056_free_source_evidence_guardrails.sql',
+  'db/migrations/057_public_bulk_ingestion.sql',
+  'db/migrations/058_public_bulk_signal_sync.sql',
+  'db/migrations/059_public_data_operations_snapshot.sql',
+  'db/migrations/060_public_evidence_intelligence.sql',
+  'db/migrations/061_public_qualification_patterns.sql',
+  'db/migrations/062_public_score_lead_guardrails.sql',
+  'db/migrations/063_public_pipeline_ranking.sql',
+  'db/migrations/064_score_compatibility_columns.sql',
+  'db/migrations/065_strategic_source_governance.sql',
+  'db/migrations/066_origination_factor_map_schema.sql',
+  'db/migrations/067_strategic_record_signal_sync.sql',
+  'db/migrations/068_factor_map_runtime.sql',
+  'db/migrations/069_factor_qualification_integration.sql',
+  'db/migrations/070_factor_pattern_integration.sql',
+  'db/migrations/071_factor_lead_pipeline_integration.sql',
+  'db/migrations/072_factor_outcome_map.sql',
+  'db/migrations/073_factor_map_backfill.sql',
+  'db/migrations/074_factor_map_dedup_calibration.sql',
+  'db/migrations/075_factor_map_security_hardening.sql',
+  'db/migrations/076_factor_map_foreign_key_indexes.sql',
+  'db/migrations/077_strategic_source_runtime_governance.sql',
+  'db/migrations/078_strategic_source_probe_status.sql',
+  'db/migrations/076_knowledge_company_workspace.sql',
+  'db/migrations/077_knowledge_vault_function_grants_hardening.sql',
+  'db/migrations/078_knowledge_capture_concurrency_lock.sql',
+  'db/migrations/079_agentetome_source_integration.sql',
+  'db/migrations/080_agentetome_service_role_policy.sql',
+  'db/migrations/081_agentetome_foreign_key_indexes.sql',
+  'db/migrations/082_knowledge_saved_views_bases.sql',
+  'db/migrations/083_knowledge_monitoring_output_capture.sql',
+  'db/migrations/085_knowledge_execution_actions.sql',
+  'db/migrations/086_knowledge_execution_reference_validation.sql',
+  'db/migrations/087_knowledge_execution_completion_guard.sql',
+  'db/migrations/088_knowledge_execution_result_lineage.sql',
+  'db/migrations/089_agentetome_export_ingestion.sql',
+  'db/migrations/090_agentetome_direct_finalize.sql',
+  'db/migrations/091_agentetome_fidc_silver_sync.sql',
+  'db/migrations/092_agentetome_fidc_market_map_snapshot.sql',
+  'db/migrations/089_knowledge_execution_context.sql',
+  'db/migrations/090_knowledge_execution_outcome_views.sql',
+  'db/migrations/091_factor_outcome_map_v2.sql',
+  'db/migrations/092_knowledge_outcome_intelligence_rpc.sql',
+  'db/migrations/093_company_master_decision_quality_gate.sql',
+  'db/migrations/094_company_decision_write_guards.sql',
+  'db/migrations/095_company_decision_readiness_snapshot.sql',
+  'db/migrations/096_candidate_identity_quality_gate.sql',
+  'db/migrations/097_candidate_eligible_company_link_gate.sql',
+  'db/migrations/098_candidate_identity_trigger_security.sql',
+  'db/migrations/093_knowledge_outcome_operations.sql',
+  'db/migrations/099_candidate_identity_review_workflow.sql',
+  'db/migrations/100_fix_candidate_identity_review_generated_columns.sql',
+  'db/migrations/101_fix_identity_domain_normalization.sql',
+  'db/migrations/102_candidate_identity_reviews_explicit_deny_policy.sql',
+  'db/migrations/094_knowledge_outcome_workbench.sql',
+  'db/migrations/103_separate_entity_and_decision_eligibility.sql',
+  'db/migrations/097_knowledge_hybrid_search_v9.sql',
+  'db/migrations/092_cvm_delivery_hardening.sql',
+  'db/migrations/096_qualification_score_semantics.sql',
+  'db/migrations/098_knowledge_embedding_coverage_v10.sql',
+  'db/migrations/099_knowledge_embedding_budget_baseline_fix.sql',
+  'db/migrations/100_knowledge_embedding_vector_comparison_fix.sql',
+  'db/migrations/101_knowledge_embedding_security_hardening.sql',
+  'db/migrations/102_qsa_fallback_governance.sql',
+  'db/migrations/103_qsa_fallback_idempotency.sql',
+  'db/migrations/093_cvm_checkpoint_timestamp_contract.sql',
+  'db/migrations/20260724152000_user_profiles_god_mode_auth_flows.sql',
+  'db/migrations/20260724153500_user_access_security_invoker.sql',
+  'db/migrations/20260724155000_fix_user_access_invoker_column_grants.sql',
+  'db/migrations/20260724160500_harden_god_mode_direct_updates.sql',
+  'db/migrations/104_finep_public_funding.sql',
+  'db/migrations/105_finep_operations_panel_performance.sql',
+  'db/migrations/106_anbima_public_source_governance.sql',
+  'db/migrations/119_candidate_decision_queue.sql',
+  'db/migrations/120_candidate_decision_queue_filter_hardening.sql',
+  'db/migrations/121_candidate_decision_queue_calibration_v2.sql',
+  'db/migrations/104_knowledge_learning_agent.sql',
+  'db/migrations/105_knowledge_learning_agent_link_fix.sql',
+  'db/migrations/106_knowledge_learning_agent_enqueue_rls.sql',
+  'db/migrations/107_knowledge_learning_agent_pgcrypto_schema.sql',
+  'db/migrations/122_candidate_cvm_company_registry.sql',
+  'db/migrations/123_candidate_decision_queue_cvm_coverage_v3.sql',
+  'db/migrations/124_candidate_cvm_registry_determinism.sql',
+  'db/migrations/108_dcm_daily_outreach_operating_loop.sql',
+  'db/migrations/109_dcm_daily_outreach_view_security.sql',
+  'db/migrations/20260724195500_dcm_daily_outreach_rls_hardening.sql',
+  'db/migrations/095_index_dcm_outreach_feedback_daily_lead.sql',
+  'db/migrations/125_cvm_production_intelligence_foundation.sql',
+  'db/migrations/126_cvm_production_intelligence_signals.sql',
+  'db/migrations/127_cvm_production_intelligence_delivery_views.sql',
+  'db/migrations/128_cvm_explicit_candidate_delivery.sql',
+  'db/migrations/129_cvm_atomic_batch_persistence.sql',
+  'db/migrations/108_company_credit_review_gate.sql',
+  'db/migrations/109_filter_ranking_v2_by_decision_eligibility.sql',
+  'db/migrations/110_align_credit_review_with_decision_engines.sql',
+  'db/migrations/128_agentetome_production_control_plane.sql',
+  'db/migrations/129_agentetome_current_snapshot_lineage.sql',
+  'db/neon/20261006_neon_agentetome_runtime.sql',
+  'db/migrations/111_harden_credit_review_trigger_privileges.sql',
+  'db/migrations/112_enforce_authenticated_credit_review_finalization.sql',
+  'db/migrations/113_reclassify_empty_successful_capture_runs.sql',
+  'db/migrations/114_quarantine_unattributed_credit_reviews.sql',
+  'db/migrations/115_fix_knowledge_learning_service_role_detection.sql',
+  'db/migrations/116_harden_pipeline_eligibility_surfaces.sql',
+  'db/migrations/117_govern_knowledge_learning_queue.sql',
+  'db/migrations/118_circuit_break_knowledge_provider_billing.sql',
+  'db/migrations/119_harden_knowledge_learning_governance_security.sql',
+  'db/migrations/20260727123000_harden_user_owned_data_rls.sql',
+  'db/migrations/20260727123100_harden_vector_corpus_and_role_rpc.sql',
+  'db/migrations/20260727123200_repair_company_signal_history.sql',
+  'db/migrations/20260727123300_signal_quality_guardrails_and_score_identity.sql',
+  'db/neon/20261005_neon_microsoft_runtime.sql',
+  'db/neon/20261005_neon_archive_metadata.sql',
+  'db/migrations/20260727173000_source_control_sheet_sync.sql',
+  'db/migrations/130_cvm_batch_deduplicate_input.sql',
+  'db/migrations/131_activate_bcb_sgs_credit_series.sql',
+  'db/migrations/132_fidcs_source_and_catalog_governance.sql',
+  'db/migrations/133_cvm_fund_documents_and_source_schedules.sql',
+  'db/migrations/134_source_probe_schedule_alignment.sql',
+  'db/migrations/135_source_schedule_registry_service_role_policy.sql',
+  'db/migrations/136_cvm_free_tier_storage_guard.sql',
+  'db/migrations/138_compact_existing_cvm_event_payloads.sql',
+  'db/migrations/20260810232500_agfeed_source_governance.sql',
+  'db/migrations/20260811235500_agfeed_search_discovery_schedule.sql',
+  'db/migrations/20260812003000_optimize_candidate_event_uuid_join.sql',
+  'db/migrations/20260812005500_backfill_identity_review_prefill.sql',
+  'db/migrations/20260812011000_rss_operating_company_commercial_queue.sql',
+  'db/migrations/20260812012500_rss_operating_company_commercial_queue_v2.sql',
+  'db/migrations/20260812014500_rss_first_party_identity_seed.sql',
+  'db/migrations/20260812053000_data_treatment_enrichment_v2.sql',
+  'db/migrations/20260812021000_bull_media_alias_dedupe.sql',
+  'db/migrations/20260812022500_bull_alias_reassert_after_semantics_v3.sql',
+  'db/migrations/20260812024500_rss_first_party_identity_batch_v2.sql',
+  'db/migrations/130_debentures_snd_source_catalog.sql',
+  'db/migrations/131_debentures_snd_signal_treatment.sql',
+  'db/migrations/132_debentures_snd_candidate_delivery.sql',
+  'db/migrations/133_debentures_snd_delivery_whitelist.sql',
+  'db/migrations/134_debentures_snd_cold_archive_policy.sql',
+  'db/migrations/134_people_capital_intelligence.sql',
+  'db/migrations/135_people_capital_job_history_guard.sql',
+  'db/migrations/136_people_capital_vault_ui_compat.sql',
+  'db/migrations/137_people_capital_hiring_mix.sql',
+  'db/migrations/139_origination_intelligence_brief.sql',
+  'db/migrations/138_people_capital_candidate_promotion_graph.sql',
+  'db/migrations/140_origination_brief_real_company_gate.sql',
+  'db/migrations/141_universal_origination_reasoning_v2.sql',
+  'db/migrations/142_universal_origination_reasoning_calibration.sql',
+  'db/migrations/143_universal_origination_reasoning_conflict_resolution.sql',
+  'db/migrations/144_origination_reprocessing_queue.sql',
+  'db/migrations/145_origination_reprocessing_schedule.sql',
+  'db/migrations/146_automatic_candidate_entity_resolution.sql',
+  'db/migrations/147_origination_entity_eligibility_gate.sql',
+  'db/migrations/148_operating_issuer_resolution_and_analytics_fix.sql',
+  'db/migrations/149_candidate_entity_resolution_v3.sql',
+  'db/migrations/150_candidate_entity_resolution_v4.sql',
+  'db/migrations/151_candidate_entity_resolution_v5_conflict_constraint.sql',
+  'db/migrations/152_regulated_issuer_identity_calibration.sql',
+  'db/migrations/145_entity_relevance_v3_historical_remediation.sql',
+  'db/neon/20261006_neon_runtime_cleanup.sql',
+]);
+
+const PRE_UUID = 'pre-UUID schema history; superseded by db/neon/20260928_neon_uuid_runtime_core.sql + 20260928_neon_uuid_extended_runtime.sql';
+const LEGACY_ARCHIVE = 'legacy Excel/Storage archive pipeline (storage buckets, pg_net, pg_cron); archive metadata lives in db/neon/20261005_neon_archive_metadata.sql';
+const LEGACY_CRON = 'pg_cron job maintenance for the legacy database; jobs run from .github/workflows/neon-scheduled-jobs.yml';
+
+export const NOT_REPLAYED = Object.freeze({
+  'db/migrations/001_canonical_init.sql': PRE_UUID,
+  'db/migrations/002_seed_core.sql': PRE_UUID,
+  'db/migrations/003_ai_layer.sql': PRE_UUID,
+  'db/migrations/007_abm_war_room_foundation.sql': PRE_UUID,
+  'db/migrations/008_abm_war_room_seed.sql': PRE_UUID,
+  'db/migrations/009_data_capture_enrichment_engines_foundation.sql': PRE_UUID,
+  'db/migrations/009_fidc_public_data_foundation.sql': PRE_UUID,
+  'db/migrations/010_crm_runtime.sql': PRE_UUID,
+  'db/migrations/010_engine_coordination_and_improvement.sql': PRE_UUID,
+  'db/migrations/011_crm_constraints_and_indexes.sql': PRE_UUID,
+  'db/migrations/011_uuid_data_capture_runtime_tables.sql': PRE_UUID,
+  'db/migrations/012_crm_owner_and_activity_type_constraints.sql': PRE_UUID,
+  'db/migrations/013_watchlist_mvp.sql': PRE_UUID,
+  'db/migrations/014_rls_runtime_core.sql': PRE_UUID,
+  'db/migrations/015_origination_command_center_views.sql': PRE_UUID,
+  'db/migrations/017_runtime_operational_consolidation.sql': PRE_UUID,
+  'db/migrations/20260325_003_capture_ingestion_layer.sql': PRE_UUID,
+  'db/migrations/016_auth_user_mirror.sql': 'auth.users mirror of the legacy auth provider; identity is Neon Auth + public.user_profiles',
+  'db/migrations/016_public_users_auth_sync.sql': 'auth.users sync of the legacy auth provider; identity is Neon Auth + public.user_profiles',
+  'db/migrations/084_agentetome_secure_probe_function.sql': 'pgsql-http + vault probe; replaced by backend/src/services/agentetomePipeline.ts',
+  'db/migrations/130_agentetome_runtime_current_vs_history.sql': 'vault/pg_cron status; replaced by db/neon/20261006_neon_agentetome_runtime.sql',
+  'db/migrations/090_database_retention_and_excel_archive.sql': LEGACY_ARCHIVE,
+  'db/migrations/091_archive_verification_source_counts.sql': LEGACY_ARCHIVE,
+  'db/migrations/092_archive_export_continuation.sql': LEGACY_ARCHIVE,
+  'db/migrations/093_archive_export_cursor_continuation.sql': LEGACY_ARCHIVE,
+  'db/migrations/094_archive_smaller_chunk_support.sql': LEGACY_ARCHIVE,
+  'db/migrations/096_index_bronze_archive_verification.sql': LEGACY_ARCHIVE,
+  'db/migrations/097_automate_historical_excel_archive_lifecycle.sql': LEGACY_ARCHIVE,
+  'db/migrations/098_fix_archive_reconcile_mirror_loop.sql': LEGACY_ARCHIVE,
+  'db/migrations/099_historical_archive_v2.sql': LEGACY_ARCHIVE,
+  'db/migrations/137_partition_capital_market_cold_archives.sql': LEGACY_ARCHIVE,
+  'db/migrations/20260728181000_hot_cold_storage_policy.sql': LEGACY_ARCHIVE,
+  'db/migrations/20260803175840_archive_queue_runtime_hardening.sql': LEGACY_ARCHIVE,
+  'db/migrations/20260803180401_archive_export_cursor_index.sql': LEGACY_ARCHIVE,
+  'db/migrations/20260820043000_google_workflow_timeout_indexes.sql': LEGACY_ARCHIVE,
+  'db/migrations/20260823223500_enforce_hot_cold_archive_and_backfill_drive_parts.sql': LEGACY_ARCHIVE,
+  'db/migrations/20260823231500_free_tier_global_heavy_write_guard.sql': 'legacy free-tier guard; replaced by db/neon/20261001_neon_database_growth_circuit_breaker.sql',
+  'db/migrations/20260820022000_stabilize_pg_cron_contention.sql': LEGACY_CRON,
+  'db/migrations/20260924_incident_cron_containment.sql': LEGACY_CRON,
+  'db/migrations/20261001190000_database_growth_circuit_breaker.sql': 'legacy pg_cron version; Neon version is db/neon/20261001_neon_database_growth_circuit_breaker.sql',
+  'db/migrations/20260728_microsoft_planner_todo_integration.sql': 'references auth.users; Neon version is db/neon/20261005_neon_microsoft_runtime.sql',
+  'db/migrations/20261002031500_neon_auth_initial_bootstrap.sql': 'applied to production before migration tracking existed (private.auth_bootstrap_claim)',
+  'db/neon/20260928_neon_uuid_runtime_core.sql': 'applied to production before migration tracking existed (baseline)',
+  'db/neon/20260928_neon_data_api_default_deny.sql': 'applied to production before migration tracking existed (baseline)',
+  'db/neon/20261001_neon_database_growth_circuit_breaker.sql': 'applied to production before migration tracking existed (baseline)',
+  'db/neon/20261001_neon_runtime_bootstrap_seed.sql': 'applied to production before migration tracking existed (baseline)',
+  'db/neon/20260928_neon_base_business_schema.sql': 'text-id portable draft; superseded by the UUID core/extended runtime',
+  'db/neon/20260924_neon_free_storage_write_guard.sql': 'optional draft; superseded by the growth circuit breaker',
+});
diff --git a/scripts/lib/neon-runtime-contract.mjs b/scripts/lib/neon-runtime-contract.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..98d5af7f13490e35543eedd3ad9206554b9a0290
--- /dev/null
+++ b/scripts/lib/neon-runtime-contract.mjs
@@ -0,0 +1,148 @@
+// Objects the Motor runtime needs on Neon. Kept in sync with the code by
+// scripts/neon-runtime-contract.test.mjs (every table/RPC referenced by api/,
+// serverless/, backend/src and scripts must be listed here) and verified against
+// the live database by scripts/neon-runtime-parity-check.mjs.
+
+export const REQUIRED_RELATIONS = Object.freeze([
+  'public.account_momentum_snapshots',
+  'public.account_stakeholders',
+  'public.activities',
+  'public.agentetome_export_packages',
+  'public.ai_agent_runs',
+  'public.ai_conversations',
+  'public.ai_messages',
+  'public.bronze_historical_records',
+  'public.candidate_decision_queue_v4',
+  'public.candidate_official_enrichments',
+  'public.capital_market_dataset_runs',
+  'public.capital_market_events',
+  'public.capital_market_ingestion_health',
+  'public.capital_market_resource_checkpoints',
+  'public.code_improvement_proposals',
+  'public.commercial_priority_snapshots',
+  'public.companies',
+  'public.company_credit_reviews',
+  'public.company_discovery_links',
+  'public.company_investor_relationships',
+  'public.company_job_openings',
+  'public.company_patterns',
+  'public.company_signals',
+  'public.company_source_metric_snapshots',
+  'public.data_archive_parts',
+  'public.data_archive_policies',
+  'public.data_archive_runs',
+  'public.data_archive_tokens',
+  'public.data_treatment_results',
+  'public.data_treatment_runs',
+  'public.dcm_daily_leads',
+  'public.dcm_daily_outreach_queue_v',
+  'public.dcm_outreach_feedback',
+  'public.discovered_company_candidates',
+  'public.engine_learning_events',
+  'public.engine_requests',
+  'public.enrichments',
+  'public.external_api_usage_monthly',
+  'public.investors',
+  'public.lead_score_snapshots',
+  'public.monitoring_outputs',
+  'public.objection_instances',
+  'public.pattern_catalog',
+  'public.pipeline',
+  'public.public_company_records',
+  'public.public_dataset_resource_checkpoints',
+  'public.public_dataset_runs',
+  'public.qualification_snapshots',
+  'public.ranking_v2',
+  'public.score_snapshots',
+  'public.search_profile_filters',
+  'public.search_profile_runs',
+  'public.search_profiles',
+  'public.source_catalog',
+  'public.source_connector_runs',
+  'public.source_control_sheet_v1',
+  'public.source_documents',
+  'public.source_schedule_coverage',
+  'public.tasks',
+  'public.thesis_outputs',
+  'public.touchpoints',
+  'public.trigger_events',
+  'public.user_profiles',
+  'public.vector_documents',
+  'public.watchlist_items',
+  'public.watchlists',
+  'private.database_growth_guard_state',
+  'private.motor_neon_migrations',
+]);
+
+export const REQUIRED_FUNCTIONS = Object.freeze([
+  ['auth', 'uid'],
+  ['auth', 'jwt'],
+  ['auth', 'session'],
+  ['public', 'agentetome_fidc_market_map_snapshot'],
+  ['public', 'agentetome_runtime_status'],
+  ['public', 'approve_candidate_identity_review'],
+  ['public', 'approve_company_credit_review'],
+  ['public', 'auto_resolve_verified_candidate_entities_v4'],
+  ['public', 'claim_due_agentetome_targets'],
+  ['public', 'company_decision_readiness_snapshot'],
+  ['public', 'fidcs_runtime_status'],
+  ['public', 'finalize_agentetome_direct_package_v2'],
+  ['public', 'get_company_credit_review_packet'],
+  ['public', 'get_company_credit_review_queue'],
+  ['public', 'get_public_data_operations_snapshot'],
+  ['public', 'knowledge_adopt_existing_activity'],
+  ['public', 'knowledge_agent_sync_links'],
+  ['public', 'knowledge_agent_upsert_node'],
+  ['public', 'knowledge_archive_node'],
+  ['public', 'knowledge_capture_existing_activity_outcome'],
+  ['public', 'knowledge_capture_monitoring_output_note'],
+  ['public', 'knowledge_capture_qualification_note'],
+  ['public', 'knowledge_capture_signal_note'],
+  ['public', 'knowledge_claim_embedding_jobs'],
+  ['public', 'knowledge_claim_learning_jobs'],
+  ['public', 'knowledge_company_execution_workspace'],
+  ['public', 'knowledge_company_workspace'],
+  ['public', 'knowledge_complete_embedding_job'],
+  ['public', 'knowledge_complete_execution_action'],
+  ['public', 'knowledge_create_execution_action'],
+  ['public', 'knowledge_delete_view'],
+  ['public', 'knowledge_embedding_coverage'],
+  ['public', 'knowledge_enqueue_company_learning'],
+  ['public', 'knowledge_fail_embedding_job'],
+  ['public', 'knowledge_fail_learning_run'],
+  ['public', 'knowledge_finish_learning_run'],
+  ['public', 'knowledge_get_node'],
+  ['public', 'knowledge_graph_snapshot'],
+  ['public', 'knowledge_hybrid_search'],
+  ['public', 'knowledge_learning_context'],
+  ['public', 'knowledge_learning_status'],
+  ['public', 'knowledge_list_nodes'],
+  ['public', 'knowledge_list_saved_views'],
+  ['public', 'knowledge_outcome_intelligence'],
+  ['public', 'knowledge_outcome_operations'],
+  ['public', 'knowledge_save_node'],
+  ['public', 'knowledge_save_view'],
+  ['public', 'knowledge_start_learning_run'],
+  ['public', 'list_candidate_decision_queue'],
+  ['public', 'match_vector_documents_lexical'],
+  ['public', 'persist_capital_market_batch'],
+  ['public', 'persist_fidcs_validation'],
+  ['public', 'persist_qsa_fallback_snapshot'],
+  ['public', 'process_origination_reprocessing_queue'],
+  ['public', 'record_agentetome_admin_manifest'],
+  ['public', 'record_agentetome_export_attempt'],
+  ['public', 'record_agentetome_validation_audit'],
+  ['public', 'refresh_agentetome_existing_package'],
+  ['public', 'refresh_ranking_v2'],
+  ['public', 'reject_candidate_identity_review'],
+  ['public', 'reserve_external_api_request'],
+  ['public', 'run_source_document_quality_gate'],
+  ['public', 'save_company_credit_review_draft'],
+  ['public', 'sync_capital_market_company_signals'],
+  ['public', 'sync_capital_market_delivery'],
+  ['public', 'sync_finep_company_signals'],
+  ['public', 'sync_public_dataset_company_outputs'],
+  ['public', 'sync_strategic_dataset_company_signals'],
+  ['private', 'refresh_database_growth_guard'],
+  ['private', 'legacy_source_uuid'],
+]);
diff --git a/scripts/neon-migration-plan-contract.test.mjs b/scripts/neon-migration-plan-contract.test.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..2ae7a151ba5877e6912a4ff2bbf6b9d70ca9a3c7
--- /dev/null
+++ b/scripts/neon-migration-plan-contract.test.mjs
@@ -0,0 +1,77 @@
+import assert from 'node:assert/strict';
+import { existsSync, readdirSync, readFileSync } from 'node:fs';
+import test from 'node:test';
+import { applyMigrationPatches, PATCHES } from './lib/neon-migration-patches.mjs';
+import { MIGRATIONS, NOT_REPLAYED, PRODUCTION_APPLIED } from './lib/neon-migration-plan.mjs';
+import { findUnsupportedSql, toNeonSql } from './lib/neon-sql-compat.mjs';
+
+const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
+
+test('production-recorded migrations stay first and unchanged', () => {
+  assert.deepEqual(PRODUCTION_APPLIED, [
+    'db/neon/20261005_neon_runtime_roles.sql',
+    'db/migrations/035_capital_market_public_data.sql',
+    'db/migrations/036_capital_market_dataset_runs_source_index.sql',
+    'db/migrations/037_capital_market_incremental_checkpoints.sql',
+    'db/migrations/044_capital_market_ingestion_health.sql',
+    'db/migrations/060_origination_knowledge_vault.sql',
+    'db/neon/20261005_neon_qualification_compatibility.sql',
+    'db/neon/20261005_neon_signal_compatibility.sql',
+  ]);
+  assert.deepEqual(MIGRATIONS.slice(0, PRODUCTION_APPLIED.length), PRODUCTION_APPLIED);
+});
+
+test('every migration is planned exactly once or explicitly documented as not replayed', () => {
+  assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length, 'duplicate plan entry');
+  for (const file of MIGRATIONS) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`);
+  const all = [
+    ...readdirSync(new URL('../db/migrations/', import.meta.url)).map((file) => `db/migrations/${file}`),
+    ...readdirSync(new URL('../db/neon/', import.meta.url)).map((file) => `db/neon/${file}`),
+  ].filter((file) => file.endsWith('.sql'));
+  const unaccounted = all.filter((file) => !MIGRATIONS.includes(file) && !NOT_REPLAYED[file]);
+  assert.deepEqual(unaccounted, []);
+  for (const file of Object.keys(NOT_REPLAYED)) {
+    assert.ok(!MIGRATIONS.includes(file), `${file} is both planned and excluded`);
+    assert.ok(all.includes(file), `${file} documented but missing`);
+  }
+});
+
+test('every planned migration patches cleanly and has no unsupported construct left', () => {
+  for (const file of MIGRATIONS) {
+    const patched = applyMigrationPatches(file, read(file));
+    assert.deepEqual(findUnsupportedSql(patched), [], file);
+  }
+  for (const file of Object.keys(PATCHES)) assert.ok(MIGRATIONS.includes(file), `stale patch for ${file}`);
+});
+
+test('compat rewrites map legacy constructs to their Neon equivalents', () => {
+  assert.equal(toNeonSql('select extensions.digest(x, \'sha256\'), y::extensions.vector(1024);'), 'select public.digest(x, \'sha256\'), y::public.vector(1024);');
+  assert.equal(toNeonSql('create extension if not exists vector with schema extensions;'), 'create extension if not exists vector;');
+  assert.equal(toNeonSql("if auth.role() = 'service_role' then"), "if (auth.session() ->> 'role') = 'service_role' then");
+  assert.equal(toNeonSql('begin;\nselect 1;\ncommit;\n').trim(), 'select 1;');
+});
+
+test('legacy text source ids become the bootstrap uuid only in id-first source_catalog inserts', () => {
+  const seed = "insert into public.source_catalog (id, name, metadata) values\n  ('src_a', 'A', '{\"code\":\"src_a\"}'),\n  (\n    'src_b', 'B', '{}')\non conflict (id) do nothing;\n";
+  const rewritten = toNeonSql(seed);
+  assert.match(rewritten, /\(private\.legacy_source_uuid\('src_a'\), 'A'/);
+  assert.match(rewritten, /\(private\.legacy_source_uuid\('src_b'\), 'B'/);
+  assert.match(rewritten, /"code":"src_a"/);
+
+  const byCode = "insert into public.source_catalog (name, metadata)\nselect v.name, v.metadata from (values ('src_c', 'C')) v(code, name);\n";
+  assert.equal(toNeonSql(byCode), byCode);
+});
+
+test('unsupported constructs are rejected unless guarded', () => {
+  assert.deepEqual(findUnsupportedSql("select cron.schedule('x', '* * * * *', 'select 1');").length, 1);
+  assert.deepEqual(findUnsupportedSql("do $$ begin if exists (select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('x','* * * * *','select 1'); end if; end $$;"), []);
+  assert.equal(findUnsupportedSql('select decrypted_secret from vault.decrypted_secrets;').length, 1);
+  assert.equal(findUnsupportedSql('select net.http_post(url := 1);').length, 1);
+  assert.equal(findUnsupportedSql('references auth.users(id)').length, 1);
+  assert.deepEqual(findUnsupportedSql('-- vault.decrypted_secrets is mentioned only in a comment\nselect 1;'), []);
+});
+
+test('patches fail loudly when the migration text drifts', () => {
+  const [file] = Object.keys(PATCHES);
+  assert.throws(() => applyMigrationPatches(file, 'select 1;'), /no longer matches/);
+});
diff --git a/scripts/neon-runtime-contract.test.mjs b/scripts/neon-runtime-contract.test.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..4c5e56ff2f0a6ac76867529d909db59983e04d62
--- /dev/null
+++ b/scripts/neon-runtime-contract.test.mjs
@@ -0,0 +1,52 @@
+import assert from 'node:assert/strict';
+import { readdirSync, readFileSync, statSync } from 'node:fs';
+import path from 'node:path';
+import test from 'node:test';
+import { REQUIRED_FUNCTIONS, REQUIRED_RELATIONS } from './lib/neon-runtime-contract.mjs';
+
+const root = new URL('..', import.meta.url).pathname;
+const files = [];
+const walk = (dir) => {
+  for (const entry of readdirSync(dir)) {
+    const file = path.join(dir, entry);
+    if (statSync(file).isDirectory()) {
+      if (entry !== 'node_modules') walk(file);
+    } else if (/\.(ts|mjs)$/.test(file) && !/\.test\./.test(file) && !file.includes(`${path.sep}lib${path.sep}neon-migration-patches`)) {
+      files.push(file);
+    }
+  }
+};
+['api', 'serverless', 'backend/src', 'scripts'].forEach((dir) => walk(path.join(root, dir)));
+
+const referenced = () => {
+  const tables = new Map();
+  const functions = new Map();
+  const add = (map, name, file) => map.set(name, map.get(name) ?? path.relative(root, file));
+  for (const file of files) {
+    const source = readFileSync(file, 'utf8');
+    for (const match of source.matchAll(/\.(?:select|insert|upsert|update|delete)\(\s*'([a-z_0-9]+)'/g)) add(tables, match[1], file);
+    for (const match of source.matchAll(/\b(?:from|join|into|update)\s+public\.([a-z_0-9]+)\b(?!\s*\()/g)) add(tables, match[1], file);
+    for (const match of source.matchAll(/\b(?:rpc|rpcAsUser|serviceRpc)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*'([a-z_0-9]+)'/g)) add(functions, match[1], file);
+  }
+  const knowledge = readFileSync(path.join(root, 'serverless/knowledge-rpc.ts'), 'utf8').split('const writeJson')[0];
+  for (const match of knowledge.matchAll(/'(knowledge_[a-z_]+)'/g)) add(functions, match[1], 'serverless/knowledge-rpc.ts');
+  return { tables, functions };
+};
+
+test('every table and RPC used by the runtime is part of the Neon runtime contract', () => {
+  const { tables, functions } = referenced();
+  const relations = new Set(REQUIRED_RELATIONS);
+  const requiredFunctions = new Set(REQUIRED_FUNCTIONS.map(([schema, name]) => `${schema}.${name}`));
+  const missingTables = [...tables].filter(([name]) => !relations.has(`public.${name}`)).map(([name, file]) => `${name} (${file})`);
+  const missingFunctions = [...functions].filter(([name]) => !requiredFunctions.has(`public.${name}`)).map(([name, file]) => `${name} (${file})`);
+  assert.deepEqual(missingTables, []);
+  assert.deepEqual(missingFunctions, []);
+});
+
+test('the runtime contract has no stale legacy entries', () => {
+  const names = REQUIRED_FUNCTIONS.map(([, name]) => name);
+  for (const legacy of ['agentetome_admin_manifest_secure', 'queue_agentetome_admin_export', 'get_agentetome_runtime_secret', 'role']) {
+    assert.ok(!names.includes(legacy), legacy);
+  }
+  assert.ok(!REQUIRED_RELATIONS.includes('public.ranking_snapshots'));
+});
diff --git a/scripts/neon-runtime-parity-check.mjs b/scripts/neon-runtime-parity-check.mjs
index 6305da00678165f46f6f5bf66d76a5ef1302436c..cdc0462b027353cc2ca504d0c40b87b5b773ecf7 100644
--- a/scripts/neon-runtime-parity-check.mjs
+++ b/scripts/neon-runtime-parity-check.mjs
@@ -1,4 +1,5 @@
 import pg from 'pg';
+import { REQUIRED_FUNCTIONS, REQUIRED_RELATIONS } from './lib/neon-runtime-contract.mjs';
 
 const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
 if (!connectionString) {
@@ -6,80 +7,8 @@ if (!connectionString) {
   process.exit(2);
 }
 
-const requiredRelations = [
-  'public.companies',
-  'public.source_catalog',
-  'public.source_connector_runs',
-  'public.monitoring_outputs',
-  'public.company_signals',
-  'public.enrichments',
-  'public.qualification_snapshots',
-  'public.company_patterns',
-  'public.score_snapshots',
-  'public.lead_score_snapshots',
-  'public.pipeline',
-  'public.user_profiles',
-  'public.capital_market_events',
-  'public.microsoft_connections',
-  'public.microsoft_task_links',
-  'public.microsoft_sync_runs',
-  'public.dcm_daily_leads',
-  'public.dcm_outreach_feedback',
-  'public.dcm_daily_outreach_queue_v',
-  'public.data_archive_runs',
-  'public.data_archive_parts',
-  'public.data_archive_policies',
-  'public.data_archive_tokens',
-  'public.source_schedule_coverage',
-  'public.source_control_sheet_v1',
-  'public.capital_market_ingestion_health',
-  'public.knowledge_nodes',
-  'public.knowledge_links',
-  'public.knowledge_node_versions',
-  'public.knowledge_saved_views',
-  'public.knowledge_references',
-  'public.knowledge_embedding_jobs',
-  'public.knowledge_learning_jobs',
-  'public.knowledge_learning_runs',
-  'private.database_growth_guard_state',
-];
-
-const requiredFunctions = [
-  ['auth', 'uid'],
-  ['auth', 'jwt'],
-  ['public', 'knowledge_list_nodes'],
-  ['public', 'knowledge_get_node'],
-  ['public', 'knowledge_save_node'],
-  ['public', 'knowledge_archive_node'],
-  ['public', 'knowledge_graph_snapshot'],
-  ['public', 'knowledge_list_saved_views'],
-  ['public', 'knowledge_save_view'],
-  ['public', 'knowledge_delete_view'],
-  ['public', 'knowledge_company_workspace'],
-  ['public', 'knowledge_company_execution_workspace'],
-  ['public', 'knowledge_create_execution_action'],
-  ['public', 'knowledge_complete_execution_action'],
-  ['public', 'knowledge_capture_signal_note'],
-  ['public', 'knowledge_capture_monitoring_output_note'],
-  ['public', 'knowledge_capture_qualification_note'],
-  ['public', 'knowledge_outcome_intelligence'],
-  ['public', 'knowledge_outcome_operations'],
-  ['public', 'knowledge_adopt_existing_activity'],
-  ['public', 'knowledge_capture_existing_activity_outcome'],
-  ['public', 'knowledge_learning_status'],
-  ['public', 'knowledge_enqueue_company_learning'],
-  ['public', 'knowledge_embedding_coverage'],
-  ['public', 'knowledge_hybrid_search'],
-  ['public', 'knowledge_claim_embedding_jobs'],
-  ['public', 'knowledge_complete_embedding_job'],
-  ['public', 'knowledge_fail_embedding_job'],
-  ['public', 'agentetome_runtime_status'],
-  ['public', 'agentetome_admin_manifest_secure'],
-  ['public', 'queue_agentetome_admin_export'],
-  ['public', 'record_agentetome_validation_audit'],
-  ['public', 'fidcs_runtime_status'],
-  ['public', 'persist_fidcs_validation'],
-];
+const requiredRelations = REQUIRED_RELATIONS;
+const requiredFunctions = REQUIRED_FUNCTIONS;
 
 const pool = new pg.Pool({
   connectionString,
diff --git a/scripts/run-neon-scheduled-jobs.mjs b/scripts/run-neon-scheduled-jobs.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..0dca746d837968dd856650d547f4469fa0de8cbc
--- /dev/null
+++ b/scripts/run-neon-scheduled-jobs.mjs
@@ -0,0 +1,78 @@
+// Neon replacement for the legacy pg_cron jobs (Neon only allows pg_cron in the
+// "postgres" database, and the Motor runtime lives in "neondb").
+//
+//   origination-derived-reprocessing      */5  -> public.process_origination_reprocessing_queue(25)
+//   candidate-automatic-entity-resolution */15 -> public.auto_resolve_verified_candidate_entities_v4(50)
+//   agentetome-due-export-refresh         :17  -> POST /api/agentetome?operation=due-exports (Vercel)
+//
+// Usage: node scripts/run-neon-scheduled-jobs.mjs --jobs=reprocessing,entity-resolution[,agentetome]
+// Each job is isolated: one failure does not skip the others, and the process
+// exits non-zero only after every requested job ran.
+import { pathToFileURL } from 'node:url';
+
+export const SQL_JOBS = Object.freeze({
+  reprocessing: 'select * from public.process_origination_reprocessing_queue(25)',
+  'entity-resolution': 'select * from public.auto_resolve_verified_candidate_entities_v4(50)',
+});
+export const HTTP_JOBS = Object.freeze({
+  agentetome: '/api/agentetome?operation=due-exports',
+});
+export const ALL_JOBS = Object.freeze([...Object.keys(SQL_JOBS), ...Object.keys(HTTP_JOBS)]);
+
+export const parseJobs = (argv) => {
+  const raw = argv.find((arg) => arg.startsWith('--jobs='))?.slice('--jobs='.length) ?? 'reprocessing,entity-resolution';
+  const jobs = raw.split(',').map((job) => job.trim()).filter(Boolean);
+  const unknown = jobs.filter((job) => !ALL_JOBS.includes(job));
+  if (unknown.length) throw new Error(`Unknown job(s): ${unknown.join(', ')}. Known: ${ALL_JOBS.join(', ')}`);
+  return [...new Set(jobs)];
+};
+
+export const runJobs = async (jobs, { query, fetchImpl = fetch, apiBaseUrl = '', cronSecret = '' }) => {
+  const results = [];
+  for (const job of jobs) {
+    const startedAt = Date.now();
+    try {
+      if (SQL_JOBS[job]) {
+        const rows = await query(SQL_JOBS[job]);
+        results.push({ job, status: 'completed', rows: rows.length, durationMs: Date.now() - startedAt });
+        continue;
+      }
+      if (!apiBaseUrl || !cronSecret) throw new Error('MOTOR_API_BASE_URL and CRON_SECRET are required for HTTP jobs.');
+      const response = await fetchImpl(new URL(HTTP_JOBS[job], apiBaseUrl), {
+        method: 'POST',
+        headers: { authorization: `Bearer ${cronSecret}`, accept: 'application/json' },
+        signal: AbortSignal.timeout(295_000),
+      });
+      const body = await response.text();
+      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
+      results.push({ job, status: 'completed', httpStatus: response.status, durationMs: Date.now() - startedAt, body: body.slice(0, 2000) });
+    } catch (error) {
+      results.push({ job, status: 'failed', error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt });
+    }
+  }
+  return results;
+};
+
+const main = async () => {
+  const jobs = parseJobs(process.argv.slice(2));
+  const needsDb = jobs.some((job) => SQL_JOBS[job]);
+  const db = needsDb ? await import('./lib/neon-db.mjs') : null;
+  try {
+    const results = await runJobs(jobs, {
+      query: db ? db.query : async () => [],
+      apiBaseUrl: process.env.MOTOR_API_BASE_URL ?? '',
+      cronSecret: process.env.CRON_SECRET ?? '',
+    });
+    for (const result of results) console.log(JSON.stringify(result));
+    if (results.some((result) => result.status === 'failed')) process.exitCode = 1;
+  } finally {
+    await db?.closeNeonPool();
+  }
+};
+
+if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
+  main().catch((error) => {
+    console.error(error instanceof Error ? error.message : error);
+    process.exit(1);
+  });
+}
diff --git a/scripts/run-neon-scheduled-jobs.test.mjs b/scripts/run-neon-scheduled-jobs.test.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..55402e14deb865a0f8441e72ac3d2351564ade22
--- /dev/null
+++ b/scripts/run-neon-scheduled-jobs.test.mjs
@@ -0,0 +1,54 @@
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import test from 'node:test';
+import { ALL_JOBS, parseJobs, runJobs, SQL_JOBS } from './run-neon-scheduled-jobs.mjs';
+
+test('job selection is explicit and validated', () => {
+  assert.deepEqual(parseJobs([]), ['reprocessing', 'entity-resolution']);
+  assert.deepEqual(parseJobs(['--jobs=agentetome,agentetome']), ['agentetome']);
+  assert.throws(() => parseJobs(['--jobs=drop-everything']), /Unknown job/);
+  assert.deepEqual([...ALL_JOBS].sort(), ['agentetome', 'entity-resolution', 'reprocessing']);
+});
+
+test('SQL jobs call the same functions the legacy pg_cron jobs scheduled', () => {
+  assert.match(SQL_JOBS.reprocessing, /process_origination_reprocessing_queue\(25\)/);
+  assert.match(SQL_JOBS['entity-resolution'], /auto_resolve_verified_candidate_entities_v4\(50\)/);
+});
+
+test('one failing job does not skip the others', async () => {
+  const seen = [];
+  const results = await runJobs(['reprocessing', 'entity-resolution', 'agentetome'], {
+    query: async (sql) => {
+      seen.push(sql);
+      if (sql.includes('reprocessing')) throw new Error('lock timeout');
+      return [{ ok: true }];
+    },
+    apiBaseUrl: 'https://motor.example',
+    cronSecret: 's3cret',
+    fetchImpl: async (url, init) => {
+      assert.equal(String(url), 'https://motor.example/api/agentetome?operation=due-exports');
+      assert.equal(init.headers.authorization, 'Bearer s3cret');
+      return new Response('{"status":"real"}', { status: 200 });
+    },
+  });
+  assert.equal(seen.length, 2);
+  assert.deepEqual(results.map((result) => result.status), ['failed', 'completed', 'completed']);
+});
+
+test('HTTP jobs fail closed without the scheduler credentials', async () => {
+  const [result] = await runJobs(['agentetome'], { query: async () => [] });
+  assert.equal(result.status, 'failed');
+  assert.match(result.error, /CRON_SECRET/);
+});
+
+test('the workflow schedules every job that pg_cron used to run', () => {
+  const workflow = readFileSync(new URL('../.github/workflows/neon-scheduled-jobs.yml', import.meta.url), 'utf8');
+  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
+  assert.match(workflow, /cron: '17 \* \* \* \*'/);
+  assert.match(workflow, /'\*\/5 \* \* \* \*'\) JOBS='reprocessing'/);
+  assert.match(workflow, /'\*\/15 \* \* \* \*'\) JOBS='entity-resolution'/);
+  assert.match(workflow, /'17 \* \* \* \*'\) JOBS='agentetome'/);
+  assert.match(workflow, /node scripts\/run-neon-scheduled-jobs\.mjs/);
+  assert.match(workflow, /secrets\.MOTOR_NEON_DATABASE_URL/);
+  assert.match(workflow, /secrets\.CRON_SECRET/);
+});
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-16.patch
```

**Verificar:**

```bash
npm run typecheck && npx tsx --test backend/src/services/agentetomePipeline.test.ts && npm run test:agentetome-production && node --test scripts/neon-migration-plan-contract.test.mjs scripts/neon-runtime-contract.test.mjs scripts/check-neon-storage-budget.test.mjs scripts/run-neon-scheduled-jobs.test.mjs
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
feat(neon): port Agentetome and pg_cron jobs to Vercel + Neon; runtime contract

- backend/src/services/agentetomePipeline.ts: manifest probe, MCP export, ZIP
  validation (bounded reader), bronze lineage, finalize/silver/Market Map and
  idempotent re-runs; replaces pgsql-http/pg_net/vault/Edge Function.
- db/neon/20261006_neon_agentetome_runtime.sql: status/audit/attempt/claim
  functions without vault, http or pg_cron; 079-092/128/129 replayed with patches.
- api/agentetome.ts: admin-manifest/admin-export run the pipeline; new
  due-exports scheduler entry (CRON_SECRET).
- scripts/run-neon-scheduled-jobs.mjs + .github/workflows/neon-scheduled-jobs.yml
  replace the pg_cron jobs (reprocessing, entity resolution, Agentetome refresh).
- scripts/check-neon-storage-budget.mjs replaces the deleted legacy preflight
  still referenced by capital-market and CVM workflows (they failed on every run).
- scripts/lib/neon-runtime-contract.mjs: tables/RPCs required by the code,
  enforced by a contract test and used by the parity check.
- plpgsql_check-driven fixes: missing live columns, ambiguous conflict target in
  knowledge_agent_upsert_node; superseded broken resolvers dropped.
- commercialPriorityService read the nonexistent ranking_snapshots table.
- removed db/neon/20261005_neon_auth_rls_compatibility.sql (cannot run on Neon:
  auth schema belongs to pg_session_jwt/cloud_admin, which already provides auth.uid()).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

### Tarefa 17 — Runtime sem nomes do Supabase; recuperação de dados legados em quarentena

**Por quê:** Tipos, mensagens e textos da UI ainda diziam “Supabase”. O identificador de linhagem `supabase-discovery-universe` foi **mantido de propósito** (é gravado nas linhas e casará com os dados importados). O PR #528 apagou as ferramentas de export/import enquanto o Neon ainda está **vazio** e o Supabase está bloqueado por cota (HTTP 402): elas voltam isoladas em `migration/supabase-recovery/` + um workflow manual (`legacy-data-recovery.yml`), com manifesto ampliado para as 98 tabelas do runtime. O contrato `no-supabase-runtime` passa a provar que o runtime nunca importa essa pasta.

**Arquivos alterados/criados:**

```
 .github/workflows/ci.yml                                                       |   6 +
 .github/workflows/legacy-data-recovery.yml                                     | 133 +++++++++++++++++++++
 .github/workflows/neon-runtime-parity.yml                                      |   3 +
 api/index.ts                                                                   |   1 -
 backend/src/ai/vectorIndexService.ts                                           |   2 +-
 backend/src/data/additionalCompanySeeds.ts                                     |   2 +-
 backend/src/lib/boundedCapture.ts                                              |   8 +-
 backend/src/lib/companyDecisionReadiness.ts                                    |   2 +-
 backend/src/lib/discoveryCapture.ts                                            |   2 +
 backend/src/lib/fidcMarketMap.ts                                               |   2 +-
 backend/src/lib/postgres.ts                                                    |   4 +-
 backend/src/lib/techSignalsDiscovery.ts                                        |   2 +-
 backend/src/modules/originationOperatingSystem.ts                              |   4 +-
 backend/src/server.ts                                                          |   4 +-
 backend/src/services/bndesAutomaticDatastoreService.ts                         |   8 +-
 backend/src/services/candidateBcbIdentityService.ts                            |   8 +-
 backend/src/services/candidateCvmRegistryService.ts                            |   8 +-
 backend/src/services/candidateDecisionQueueService.ts                          |   2 +-
 backend/src/services/candidateDomainIntelligenceService.ts                     |   8 +-
 backend/src/services/candidateIdentityReviewRuntime.ts                         |   4 +-
 backend/src/services/candidateNewsSemanticsService.ts                          |   8 +-
 backend/src/services/candidateWebsiteIdentityService.ts                        |   8 +-
 backend/src/services/capitalMarketDeliveryService.ts                           |   2 +-
 backend/src/services/capitalMarketIngestionService.ts                          |   2 +-
 backend/src/services/captureDerivedSyncService.ts                              |   2 +-
 backend/src/services/capturePersistenceService.ts                              |   2 +-
 backend/src/services/publicDataOperationsService.ts                            |   2 +-
 backend/src/services/qsaFallbackIngestionService.ts                            |   2 +-
 backend/src/services/searchProfileCaptureRuntime.ts                            |   4 +-
 frontend/src/components/KnowledgeOutcomeOperationsPanel.tsx                    |   2 +-
 frontend/src/config/nav.ts                                                     |   2 +-
 frontend/src/lib/auth.tsx                                                      |   1 +
 frontend/src/lib/publicDataOperationsApi.ts                                    |   2 +-
 frontend/src/pages/CandidateDecisionQueuePage.tsx                              |   2 +-
 frontend/src/pages/CandidateIdentityReviewPage.tsx                             |   2 +-
 frontend/src/pages/CompanyCreditReviewPage.tsx                                 |   2 +-
 frontend/src/pages/DcmDailyOutreachPage.tsx                                    |   6 +-
 frontend/src/pages/HistoricalArchivePage.tsx                                   |   4 +-
 frontend/src/pages/KnowledgeLearningAgentPage.tsx                              |   2 +-
 frontend/src/pages/KnowledgeSearchPage.tsx                                     |   4 +-
 frontend/src/pages/KnowledgeVaultPage.tsx                                      |   8 +-
 frontend/src/pages/MonitoringPage.tsx                                          |   4 +-
 frontend/src/pages/OutcomeOperationsPage.tsx                                   |   2 +-
 frontend/src/pages/SearchProfilesPage.tsx                                      |   2 +-
 frontend/src/pages/UsersPage.tsx                                               |   4 +-
 migration/supabase-recovery/README.md                                          |  61 ++++++++++
 migration/supabase-recovery/neon-data-recovery-tooling.test.mjs                | 152 ++++++++++++++++++++++++
 migration/supabase-recovery/neon-json-import-sql.mjs                           | 141 ++++++++++++++++++++++
 {scripts/migration => migration/supabase-recovery}/neon-migration-manifest.mjs |  47 ++++++++
 migration/supabase-recovery/supabase-full-drive-export.mjs                     | 721 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 migration/supabase-recovery/supabase-rest-export.mjs                           | 182 +++++++++++++++++++++++++++++
 migration/supabase-recovery/supabase-rest-health-classifier.mjs                |  75 ++++++++++++
 migration/supabase-recovery/supabase-rest-health-classifier.test.mjs           |  27 +++++
 package.json                                                                   |   4 +-
 scripts/no-supabase-runtime-contract.test.mjs                                  |  20 +++-
 scripts/smoke/vercel-health-smoke.mjs                                          |   2 +-
 56 files changed, 1648 insertions(+), 78 deletions(-)
```

**Aplicar o patch:**

`````patch tarefa-17
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 52b72e411e56892df4c235016d6a9ada0ee69899..ffe1508c7def59a21d8187cb4e288f58e09fcfba 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -94,6 +94,12 @@ jobs:
       - name: Prevent Supabase runtime reintroduction
         run: npm run test:no-supabase-runtime
 
+      - name: Neon migration plan, runtime contract and schedulers
+        run: npm run test:neon-migration
+
+      - name: Legacy data recovery tooling (temporary)
+        run: npm run test:legacy-recovery
+
       - name: Validate Neon Free budget guard
         run: node --test scripts/neon-free-budget-guard.test.mjs
 
diff --git a/.github/workflows/legacy-data-recovery.yml b/.github/workflows/legacy-data-recovery.yml
new file mode 100644
index 0000000000000000000000000000000000000000..9e40b6a568af0a75bd9eec8ba39586e1b3c4a104
--- /dev/null
+++ b/.github/workflows/legacy-data-recovery.yml
@@ -0,0 +1,133 @@
+name: Legacy Data Recovery (Supabase export)
+
+# TEMPORARY - delete this workflow and migration/supabase-recovery/ once the legacy
+# data has been exported and imported into Neon (see migration/supabase-recovery/README.md).
+# Manual dispatch only; the only workflow allowed to reference the legacy provider
+# (allow-listed in scripts/no-supabase-runtime-contract.test.mjs).
+
+on:
+  workflow_dispatch:
+
+permissions:
+  contents: read
+
+concurrency:
+  group: legacy-data-recovery
+  cancel-in-progress: false
+
+jobs:
+  export:
+    runs-on: ubuntu-latest
+    timeout-minutes: 360
+    env:
+      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
+      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
+      ARTIFACT_ONLY: 'true'
+      EXPORT_ROOT: ${{ github.workspace }}/tmp/supabase-full-export
+      COPY_STORAGE_FILES: 'true'
+      EXPORT_PAGE_SIZE: '1000'
+      MAX_ROWS_PER_SHEET: '50000'
+    steps:
+      - uses: actions/checkout@v6
+
+      - uses: actions/setup-node@v6
+        with:
+          node-version: 24
+
+      - name: Validate required secrets
+        shell: bash
+        run: |
+          set -euo pipefail
+          missing=()
+          for name in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
+            if [ -z "${!name:-}" ]; then missing+=("$name"); fi
+          done
+          if [ "${#missing[@]}" -gt 0 ]; then
+            printf 'Missing required secret names: %s\n' "$(IFS=,; echo "${missing[*]}")"
+            exit 1
+          fi
+
+      - name: Validate exporter syntax
+        run: node --check migration/supabase-recovery/supabase-full-drive-export.mjs
+
+      - name: Export Supabase to Google Drive
+        id: export
+        shell: bash
+        run: |
+          set -euo pipefail
+          node migration/supabase-recovery/supabase-full-drive-export.mjs 2>&1 | tee /tmp/supabase-full-drive-export.log
+          SUMMARY_LINE="$(grep 'FINAL_SUMMARY=' /tmp/supabase-full-drive-export.log | tail -n 1 || true)"
+          if [ -n "$SUMMARY_LINE" ]; then
+            printf '%s\n' "${SUMMARY_LINE#FINAL_SUMMARY=}" > /tmp/run_summary.json
+          fi
+
+      - name: Upload export artifact
+        if: always()
+        uses: actions/upload-artifact@v4
+        with:
+          name: supabase-full-export-${{ github.run_id }}
+          path: tmp/supabase-full-export
+          if-no-files-found: warn
+          compression-level: 0
+          retention-days: 7
+          include-hidden-files: true
+
+      - name: Publish execution summary
+        if: always()
+        shell: bash
+        run: |
+          {
+            echo '## Supabase → Google Drive full export'
+            echo
+            echo '- project: `hdghpmssudrqhsbvrdyt`'
+            echo '- mode: GitHub artifact (Google OAuth independent)'
+            echo '- next hop: connected Google Drive folder `Motor Originação - Backup Supabase Completo - 2026-10-01`'
+            echo '- database: all discovered PostgREST tables/views + repository schema candidates'
+            echo '- auth: supported Admin Users export'
+            echo '- storage: bucket/object metadata + raw object copy when readable'
+            echo '- secrets/passwords/tokens: intentionally excluded'
+            echo
+            if [ -f tmp/supabase-full-export/run_summary.json ]; then
+              echo '```json'
+              cat tmp/supabase-full-export/run_summary.json
+              echo '```'
+            elif [ -f /tmp/run_summary.json ]; then
+              echo '```json'
+              cat /tmp/run_summary.json
+              echo '```'
+            else
+              echo 'No final summary was produced; inspect the job log.'
+            fi
+          } >> "$GITHUB_STEP_SUMMARY"
+
+      - name: Enforce complete backup
+        if: always()
+        shell: bash
+        run: |
+          set -euo pipefail
+          SUMMARY="tmp/supabase-full-export/run_summary.json"
+          if [ ! -f "$SUMMARY" ]; then
+            echo "Backup incomplete: run_summary.json missing."
+            exit 1
+          fi
+          node - "$SUMMARY" <<'NODE'
+          const fs=require('node:fs');
+          const p=process.argv[2];
+          const s=JSON.parse(fs.readFileSync(p,'utf8'));
+          const ok = s.status === 'ok'
+            && Number(s.exportPartsCreated || 0) > 0
+            && Array.isArray(s.blockedScopes)
+            && s.blockedScopes.length === 0;
+          if (!ok) {
+            console.error(JSON.stringify({
+              status:s.status,
+              databaseObjectsAttempted:s.databaseObjectsAttempted,
+              exportPartsCreated:s.exportPartsCreated,
+              storageObjectsCopied:s.storageObjectsCopied,
+              storageObjectsFailed:s.storageObjectsFailed,
+              blockedScopeCount:Array.isArray(s.blockedScopes)?s.blockedScopes.length:null,
+            }));
+            process.exit(1);
+          }
+          console.log('Complete backup gate: OK');
+          NODE
diff --git a/.github/workflows/neon-runtime-parity.yml b/.github/workflows/neon-runtime-parity.yml
index 0a924d9ca15f133e936585b4991f661760750879..beec1acf0dcd80f55c40e8e031bf2a76bb7ea7b1 100644
--- a/.github/workflows/neon-runtime-parity.yml
+++ b/.github/workflows/neon-runtime-parity.yml
@@ -9,6 +9,9 @@ on:
       - 'serverless/**'
       - 'frontend/**'
       - 'db/neon/**'
+      - 'db/migrations/**'
+      - 'scripts/lib/**'
+      - 'scripts/apply-neon-runtime-migrations.mjs'
       - 'scripts/neon-runtime-parity-check.mjs'
       - '.github/workflows/neon-runtime-parity.yml'
   workflow_dispatch:
diff --git a/api/index.ts b/api/index.ts
index 20c173bd4700a3c49dad05eb585a7e387d883ab1..47962018b28a1b48910ac58dd0981866b4b9aa0e 100644
--- a/api/index.ts
+++ b/api/index.ts
@@ -152,7 +152,6 @@ async function captureHealth(req: IncomingMessage, res: ServerResponse) {
     },
     captureRuntime: {
       canRunAgainstDatabase: persistentDataConfigured,
-      canRunAgainstSupabase: persistentDataConfigured, // deprecated compatibility alias; runtime is Neon
       canAuthorizeWorkflow: cronConfigured,
       coreTablesAccessible: canAccessCoreTables,
       queryTimeoutMs: CAPTURE_HEALTH_QUERY_TIMEOUT_MS,
diff --git a/backend/src/ai/vectorIndexService.ts b/backend/src/ai/vectorIndexService.ts
index 8622a159248ac5c57f87649a2251652af22aadb2..198b3a9f710929bc56899c3206d2c7332684a1f0 100644
--- a/backend/src/ai/vectorIndexService.ts
+++ b/backend/src/ai/vectorIndexService.ts
@@ -63,7 +63,7 @@ export class VectorIndexService implements VectorRetriever {
           return rows.map((row) => ({ id: row.id, content: row.content }));
         }
       } catch {
-        // Local text fallback remains available when Supabase retrieval is unavailable.
+        // Local text fallback remains available when Neon retrieval is unavailable.
       }
     }
 
diff --git a/backend/src/data/additionalCompanySeeds.ts b/backend/src/data/additionalCompanySeeds.ts
index e65e1444b7cf9805923b976ea9f4119293ef5427..2a95ec0c436f60f7dc6f7b5a212ce7295dd7ae54 100644
--- a/backend/src/data/additionalCompanySeeds.ts
+++ b/backend/src/data/additionalCompanySeeds.ts
@@ -70,7 +70,7 @@ const makeCompanySeed = ({
     concentrationRisk: 'medium',
     delinquencySignal: 'low',
     sourceConfidence,
-    sourceNotes: ['Seed complementar para acelerar carga inicial no Supabase com dados realistas.'],
+    sourceNotes: ['Seed complementar para acelerar carga inicial no Neon com dados realistas.'],
   },
   sourceRecords: [
     { sourceId: 'src_brasilapi_cnpj', externalId: cnpj, observedAt: '2026-03-20T08:00:00Z', payload: { seeded: true } },
diff --git a/backend/src/lib/boundedCapture.ts b/backend/src/lib/boundedCapture.ts
index f62fba2931e889d651d712b7b8d7ce1f78499d93..9aa54e000244dd3a1b65b09f00bea12f41846656 100644
--- a/backend/src/lib/boundedCapture.ts
+++ b/backend/src/lib/boundedCapture.ts
@@ -21,8 +21,8 @@ export class CaptureRuntimeDeadlineError extends Error {
   }
 }
 
-export const selectMonitoringCompanies = (companies: CompanySeed[], useSupabase: boolean) => (
-  useSupabase ? companies.filter(isCompanyMonitoringEligible) : companies
+export const selectMonitoringCompanies = (companies: CompanySeed[], usePersistentData: boolean) => (
+  usePersistentData ? companies.filter(isCompanyMonitoringEligible) : companies
 );
 
 const schedulePolicy = (source: SourceCatalogEntry) => {
@@ -49,10 +49,10 @@ export const selectCaptureSources = (sources: SourceCatalogEntry[], cadence: Cap
 export const buildBoundedCaptureTargets = (
   companies: CompanySeed[],
   sources: SourceCatalogEntry[],
-  useSupabase: boolean,
+  usePersistentData: boolean,
   cadence: CaptureCadence = 'all',
 ): BoundedCaptureTarget[] => {
-  const eligibleCompanies = selectMonitoringCompanies(companies, useSupabase);
+  const eligibleCompanies = selectMonitoringCompanies(companies, usePersistentData);
   const eligibleSources = selectCaptureSources(sources, cadence);
   return eligibleCompanies.flatMap((company) => eligibleSources.map((source) => ({
     companyId: company.id,
diff --git a/backend/src/lib/companyDecisionReadiness.ts b/backend/src/lib/companyDecisionReadiness.ts
index 86bee47a44d7a82779a6193ebffc7737112ccb51..68e92b93be2959df9de099461131b36a4a76ac33 100644
--- a/backend/src/lib/companyDecisionReadiness.ts
+++ b/backend/src/lib/companyDecisionReadiness.ts
@@ -80,7 +80,7 @@ export function normalizeCompanyDecisionReadiness(value: unknown): CompanyDecisi
 
 export async function getCompanyDecisionReadiness(): Promise<CompanyDecisionReadiness> {
   const client = getDataClient();
-  if (!client) throw new CompanyDecisionReadinessUnavailableError('Supabase não está configurado para o Company Master quality gate.');
+  if (!client) throw new CompanyDecisionReadinessUnavailableError('Neon não está configurado para o Company Master quality gate.');
   const snapshot = await client.rpc<unknown>('company_decision_readiness_snapshot', {});
   return normalizeCompanyDecisionReadiness(snapshot);
 }
diff --git a/backend/src/lib/discoveryCapture.ts b/backend/src/lib/discoveryCapture.ts
index 663ec9d305c0bce67560014bb5645c8e300401eb..2c3423de50fc037662df91c65fa9a3b6f1fa2cf5 100644
--- a/backend/src/lib/discoveryCapture.ts
+++ b/backend/src/lib/discoveryCapture.ts
@@ -435,6 +435,8 @@ export async function runSearchProfileDiscovery(profile: SearchProfile): Promise
 
   diagnostics.push({
     id: 'persisted-universe',
+    // Historical lineage identifier persisted on candidate rows; kept as-is so imported
+    // legacy data keeps matching (candidateRediscoveryLineage/discoveryEntityNormalization).
     sourceRef: 'supabase-discovery-universe',
     status: context.candidateUniverseLoaded ? 'fulfilled' : 'rejected',
     candidates: internalHits.length,
diff --git a/backend/src/lib/fidcMarketMap.ts b/backend/src/lib/fidcMarketMap.ts
index f9d181712033b53554c0c81d6b49af474a1626fb..643536f15c3263d99dfab31dd51fa66cbedfd7eb 100644
--- a/backend/src/lib/fidcMarketMap.ts
+++ b/backend/src/lib/fidcMarketMap.ts
@@ -194,7 +194,7 @@ export const normalizeFidcMarketMapSnapshot = (value: unknown): FidcMarketMapSna
 
 export async function getFidcMarketMapSnapshot(query: FidcMarketMapQuery): Promise<FidcMarketMapSnapshot> {
   const client = getDataClient();
-  if (!client) throw new FidcMarketMapUnavailableError('Supabase não está configurado para o Market Map FIDC.');
+  if (!client) throw new FidcMarketMapUnavailableError('Neon não está configurado para o Market Map FIDC.');
 
   const snapshot = await client.rpc<unknown>('agentetome_fidc_market_map_snapshot', buildFidcMarketMapRpcArgs(query));
   return normalizeFidcMarketMapSnapshot(snapshot);
diff --git a/backend/src/lib/postgres.ts b/backend/src/lib/postgres.ts
index 9c213f2e7bd82987e8e234b7c9068c3e4d90e3cf..a0b3005047924da5c68e7ae9786eb7b478734da7 100644
--- a/backend/src/lib/postgres.ts
+++ b/backend/src/lib/postgres.ts
@@ -127,7 +127,7 @@ type Queryable = QueryClient & {
  * passes strings through untouched. Both are wrong for json/jsonb targets:
  * `['a']` becomes the invalid JSON `{"a"}`, `[]` silently becomes the object
  * `{}` and a plain string such as `FIDC` is rejected as invalid JSON. PostgREST
- * (the previous Supabase data plane) always sent JSON, so callers rely on JSON
+ * (the legacy PostgREST data plane) always sent JSON, so callers rely on JSON
  * semantics. Values bound to json/jsonb columns or RPC parameters are therefore
  * JSON-encoded explicitly; everything else (text[], uuid[], scalars) keeps the
  * native node-postgres encoding.
@@ -326,7 +326,7 @@ export class NeonPostgresClient {
 
   /**
    * Calls `public.<fn>` inside a transaction with request.jwt.* claims set, so
-   * functions ported from Supabase that read `auth.uid()`/role claims keep
+   * functions ported from the legacy provider that read `auth.uid()`/role claims keep
    * working. Arguments are bound as `$n` placeholders (never interpolated) and
    * json/jsonb parameters are JSON-encoded.
    */
diff --git a/backend/src/lib/techSignalsDiscovery.ts b/backend/src/lib/techSignalsDiscovery.ts
index a82813ee124c076d49397f2a95ce063251db2d3a..e2978684f8a3b05ba7f590428b5076585db8c86f 100644
--- a/backend/src/lib/techSignalsDiscovery.ts
+++ b/backend/src/lib/techSignalsDiscovery.ts
@@ -161,7 +161,7 @@ export const syncTechSignalsDiscoveryCandidates = async (params: {
   collectedAt?: string;
 } = {}): Promise<TechSignalsDiscoverySummary> => {
   const client = getDataClient();
-  if (!client) throw new Error('Supabase service-role client unavailable for Tech Signals candidate discovery.');
+  if (!client) throw new Error('Neon data client unavailable for Tech Signals candidate discovery.');
   const feedUrl = params.feedUrl ?? 'https://pedrobmesquita.substack.com/feed';
   const collectedAt = params.collectedAt ?? new Date().toISOString();
   const discovery = await discoverTechSignalsCandidates(feedUrl);
diff --git a/backend/src/modules/originationOperatingSystem.ts b/backend/src/modules/originationOperatingSystem.ts
index a1e522d100c4d3e91d263560525bcbbb6f294c1b..be023996a5384ecfeffc34ea5ec493d72ac490eb 100644
--- a/backend/src/modules/originationOperatingSystem.ts
+++ b/backend/src/modules/originationOperatingSystem.ts
@@ -245,7 +245,7 @@ export const implementationMap = {
     'skill tree versionada em código',
     'backlog ORIG-001 a ORIG-020 convertido em contrato operacional',
     'templates de lead/tese/abordagem/one-pager versionados',
-    'migration SQL para persistência no Supabase',
+    'migration SQL para persistência no Neon',
     'documentação em docs/origination',
     'endpoints serverless /api/origination/*',
   ],
@@ -254,7 +254,7 @@ export const implementationMap = {
 
 export const getOriginationExecutionPlan = () => ({
   now: ['usar /api/origination/os como fonte do framework', 'rodar /rankings/v2 para top leads', 'executar fluxo completo para prioridades A', 'registrar ações em /tasks e /activities'],
-  next: ['ligar frontend a /api/origination/os', 'popular Supabase com migration 020', 'configurar conector VC/PE dedicado', 'automatizar relatório mensal'],
+  next: ['ligar frontend a /api/origination/os', 'popular Neon com migration 020', 'configurar conector VC/PE dedicado', 'automatizar relatório mensal'],
   kpis: ['leads gerados/semana', 'leads qualificados/semana', 'abordagens enviadas', 'respostas', 'reuniões', 'mandatos enviados', 'mandatos assinados', 'operações fechadas'],
 });
 
diff --git a/backend/src/server.ts b/backend/src/server.ts
index a23cba790332106e6c3d461f27a2edb698230c8a..0d50786318c1dfd9151d70c64c1fad27fac42c13 100644
--- a/backend/src/server.ts
+++ b/backend/src/server.ts
@@ -375,7 +375,7 @@ app.get('/search-profiles/discovery-health', wrap(async (_req, res) => {
     searchCaptureRuntime.listRuns(),
     searchCaptureRuntime.listCandidates(),
   ]);
-  // Normaliza runs/candidatos: memória devolve camelCase, Supabase snake_case.
+  // Normaliza runs/candidatos: memória devolve camelCase, Neon snake_case.
   const runs = (runRows as any[]).map((row) => ({
     id: row.id,
     searchProfileId: row.searchProfileId ?? row.search_profile_id,
@@ -500,7 +500,7 @@ app.get('/agents/definitions', wrap(async (_req, res) => res.json(ok(platformMod
 app.get('/agents/runs', wrap(async (_req, res) => res.json(ok('partial', { runs: [], note: 'Execuções duráveis de agentes ainda não são persistidas (fila engine_requests/ai_agent_runs vazia).' }))));
 app.get('/agents/runs/:id', wrap((req, res) => res.status(404).json(fail(404, `Agent run não encontrado: ${param(req.params.id)}. Execuções duráveis ainda não são persistidas.`))));
 app.get('/agents/validations', wrap((_req, res) => res.json(ok('partial', { validations: [], note: 'Validações de agentes ainda não são persistidas; nada a reportar.' }))));
-app.get('/agents/improvements', wrap((_req, res) => res.json(ok('partial', [{ id: 'imp_1', title: 'Expandir conectores adicionais após estabilizar Supabase/Auth real.' }]))));
+app.get('/agents/improvements', wrap((_req, res) => res.json(ok('partial', [{ id: 'imp_1', title: 'Expandir conectores adicionais após estabilizar Neon/Auth real.' }]))));
 app.get('/agents/patterns', wrap(async (_req, res) => res.json(ok(platformMode, await service.listPatternCatalog()))));
 app.post('/agents/run/:agent_name', wrap((req, res) => res.status(202).json(ok('partial', { agent: param(req.params.agent_name), scope: 'global', started: false, note: 'Executor durável de agentes ainda não implementado; use /agents/orchestrate/company/:id para recalcular uma empresa.' }))));
 app.post('/agents/run/company/:id/:agent_name', wrap((req, res) => res.status(202).json(ok('partial', { agent: param(req.params.agent_name), companyId: param(req.params.id), started: false, note: 'Executor durável de agentes ainda não implementado; use /agents/orchestrate/company/:id.' }))));
diff --git a/backend/src/services/bndesAutomaticDatastoreService.ts b/backend/src/services/bndesAutomaticDatastoreService.ts
index 606de56dbbacbd36e23a4ce7b17e5b0ad2cb2a30..23d3a1c9e1a301111cf84fcf8678c8115831ed03 100644
--- a/backend/src/services/bndesAutomaticDatastoreService.ts
+++ b/backend/src/services/bndesAutomaticDatastoreService.ts
@@ -29,7 +29,7 @@ const toStringRecord = (row: Record<string, unknown>) => Object.fromEntries(
     .map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)]),
 );
 
-type SupabaseClient = NonNullable<ReturnType<typeof getDataClient>>;
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
 type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
 type CheckpointRow = {
   status: 'completed' | 'partial' | 'failed';
@@ -72,7 +72,7 @@ export type BndesAutomaticDatastoreResult = {
 };
 
 type Dependencies = {
-  client?: SupabaseClient | null;
+  client?: DataClient | null;
   discoverResource?: typeof discoverBndesAutomaticResource;
   fetchPage?: typeof fetchBndesAutomaticPage;
   now?: () => Date;
@@ -86,7 +86,7 @@ type PersistSummary = {
 };
 
 export class BndesAutomaticDatastoreService {
-  private readonly client: SupabaseClient | null;
+  private readonly client: DataClient | null;
   private readonly discoverResource: typeof discoverBndesAutomaticResource;
   private readonly fetchPage: typeof fetchBndesAutomaticPage;
   private readonly now: () => Date;
@@ -99,7 +99,7 @@ export class BndesAutomaticDatastoreService {
   }
 
   async run(options: BndesAutomaticDatastoreOptions = {}): Promise<BndesAutomaticDatastoreResult> {
-    if (!this.client) throw new Error('Supabase client not configured for BNDES automatic ingestion.');
+    if (!this.client) throw new Error('Neon data client not configured for BNDES automatic ingestion.');
 
     const targetBatchSize = Math.max(1, Math.min(options.targetBatchSize ?? 25, 250));
     const maxTargetBatches = Math.max(1, Math.min(options.maxTargetBatches ?? 100, 10_000));
diff --git a/backend/src/services/candidateBcbIdentityService.ts b/backend/src/services/candidateBcbIdentityService.ts
index 68c21cd8e05d72dcc4b7369d8a446e8cdad55b60..d7b9dc1a249a3a3ef06d2e6dd8247217a9433ab0 100644
--- a/backend/src/services/candidateBcbIdentityService.ts
+++ b/backend/src/services/candidateBcbIdentityService.ts
@@ -131,10 +131,10 @@ type CandidateRow = {
 };
 
 type SourceRow = { id: string; metadata?: Record<string, unknown> | null };
-type SupabaseClient = NonNullable<ReturnType<typeof getDataClient>>;
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
 
 type Dependencies = {
-  client?: SupabaseClient | null;
+  client?: DataClient | null;
   fetchInstitutions?: typeof fetchBcbRegulatedInstitutions;
   now?: () => Date;
 };
@@ -153,7 +153,7 @@ export type CandidateBcbIdentityResult = {
 };
 
 export class CandidateBcbIdentityService {
-  private readonly client: SupabaseClient | null;
+  private readonly client: DataClient | null;
   private readonly fetchInstitutions: typeof fetchBcbRegulatedInstitutions;
   private readonly now: () => Date;
 
@@ -164,7 +164,7 @@ export class CandidateBcbIdentityService {
   }
 
   async run(input: { limit?: number } = {}): Promise<CandidateBcbIdentityResult> {
-    if (!this.client) throw new Error('Supabase client not configured for candidate BCB identity resolution.');
+    if (!this.client) throw new Error('Neon data client not configured for candidate BCB identity resolution.');
     const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
     const rows = await this.client.select('discovered_company_candidates', {
       select: 'id,company_name,legal_name,cnpj,website,normalized_domain,candidate_status,raw_payload',
diff --git a/backend/src/services/candidateCvmRegistryService.ts b/backend/src/services/candidateCvmRegistryService.ts
index 7d504a7c624ecbbd9bb7643e9b2f50df26b339a7..f96f8102638271686543b161546aa48457d7abcd 100644
--- a/backend/src/services/candidateCvmRegistryService.ts
+++ b/backend/src/services/candidateCvmRegistryService.ts
@@ -22,7 +22,7 @@ const timestamp = (value: unknown) => {
 const booleanValue = (value: unknown) => value === true || String(value ?? '').toLowerCase() === 'true';
 const normalizedNameKey = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
 
-type SupabaseClient = NonNullable<ReturnType<typeof getDataClient>>;
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
 type SourceRow = { id: string; status: string; health: string; metadata?: Record<string, unknown> };
 type TargetRow = { id: string; cnpj: string | null };
 type CandidateRow = {
@@ -64,14 +64,14 @@ export type CandidateCvmRegistryResult = {
 };
 
 type Dependencies = {
-  client?: SupabaseClient | null;
+  client?: DataClient | null;
   discoverResource?: typeof discoverCvmOpenCompanyRegistry;
   streamResource?: typeof streamCvmOpenCompanyRegistry;
   now?: () => Date;
 };
 
 export class CandidateCvmRegistryService {
-  private readonly client: SupabaseClient | null;
+  private readonly client: DataClient | null;
   private readonly discoverResource: typeof discoverCvmOpenCompanyRegistry;
   private readonly streamResource: typeof streamCvmOpenCompanyRegistry;
   private readonly now: () => Date;
@@ -152,7 +152,7 @@ export class CandidateCvmRegistryService {
   }
 
   async run(options: CandidateCvmRegistryOptions = {}): Promise<CandidateCvmRegistryResult> {
-    if (!this.client) throw new Error('Supabase client not configured for CVM candidate enrichment.');
+    if (!this.client) throw new Error('Neon data client not configured for CVM candidate enrichment.');
     const triggerType = options.triggerType ?? 'manual';
     const resource = await this.discoverResource();
     const targetRows = await this.loadReviewableTargets();
diff --git a/backend/src/services/candidateDecisionQueueService.ts b/backend/src/services/candidateDecisionQueueService.ts
index c69c0a271afaa8ea74392c5bd70ef94434d7b29e..84a2ea0fd4bf3f99a11309f6f24b38249d307719 100644
--- a/backend/src/services/candidateDecisionQueueService.ts
+++ b/backend/src/services/candidateDecisionQueueService.ts
@@ -26,7 +26,7 @@ export class CandidateDecisionQueueService {
   private readonly client = getDataClient();
 
   async list(query: CandidateDecisionQueueQuery = {}) {
-    if (!this.client) throw new Error('Supabase client not configured for Candidate Decision Queue.');
+    if (!this.client) throw new Error('Neon data client not configured for Candidate Decision Queue.');
     const normalized = normalizeCandidateDecisionQueueQuery(query);
     return this.client.rpc('list_candidate_decision_queue', {
       p_queue: normalized.queue,
diff --git a/backend/src/services/candidateDomainIntelligenceService.ts b/backend/src/services/candidateDomainIntelligenceService.ts
index 772037b88bbf06d4a11a73aa4f6b76ce6f56bc5a..9e37a0d1eb2b3bee6704d4ada5fa725301facadb 100644
--- a/backend/src/services/candidateDomainIntelligenceService.ts
+++ b/backend/src/services/candidateDomainIntelligenceService.ts
@@ -80,8 +80,8 @@ type OfficialEnrichmentRow = {
   data?: Record<string, unknown> | null;
   observed_at?: string | null;
 };
-type SupabaseClient = NonNullable<ReturnType<typeof getDataClient>>;
-type Dependencies = { client?: SupabaseClient | null; fetchImpl?: typeof fetch; now?: () => Date };
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
+type Dependencies = { client?: DataClient | null; fetchImpl?: typeof fetch; now?: () => Date };
 type ProbeMatch = {
   verified: boolean;
   probes: number;
@@ -199,7 +199,7 @@ const acceptsMatch = (strategy: DomainHintStrategy, score: WebsiteIdentityScore)
 };
 
 export class CandidateDomainIntelligenceService {
-  private readonly client: SupabaseClient | null;
+  private readonly client: DataClient | null;
   private readonly fetchImpl: typeof fetch;
   private readonly now: () => Date;
 
@@ -255,7 +255,7 @@ export class CandidateDomainIntelligenceService {
   }
 
   async run(options: CandidateDomainIntelligenceOptions = {}): Promise<CandidateDomainIntelligenceResult> {
-    if (!this.client) throw new Error('Supabase client not configured for candidate domain intelligence.');
+    if (!this.client) throw new Error('Neon data client not configured for candidate domain intelligence.');
     const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
     const tiers = [...new Set((options.tiers?.length ? options.tiers : ['P1', 'P2', 'P3']).map(String))];
     const candidateIds = [...new Set((options.candidateIds ?? []).map(String).filter(Boolean))].slice(0, MAX_LIMIT);
diff --git a/backend/src/services/candidateIdentityReviewRuntime.ts b/backend/src/services/candidateIdentityReviewRuntime.ts
index 321b615857ddc9cd77d95da74f420ee7ae725e16..cb45f3ca8b356a8e892aa66f5ed7853969eafd8b 100644
--- a/backend/src/services/candidateIdentityReviewRuntime.ts
+++ b/backend/src/services/candidateIdentityReviewRuntime.ts
@@ -10,7 +10,7 @@ export class CandidateIdentityReviewRuntime implements CandidateIdentityReviewEx
   private readonly client = getDataClient();
 
   async approve(input: CandidateIdentityApprovalInput): Promise<CandidateIdentityReviewResult> {
-    if (!this.client) throw new Error('Supabase is required for candidate identity approval.');
+    if (!this.client) throw new Error('Neon is required for candidate identity approval.');
     return this.client.rpc<CandidateIdentityReviewResult>('approve_candidate_identity_review', {
       p_candidate_id: input.candidateId,
       p_legal_name: input.legalName,
@@ -26,7 +26,7 @@ export class CandidateIdentityReviewRuntime implements CandidateIdentityReviewEx
   }
 
   async reject(input: CandidateIdentityRejectionInput): Promise<CandidateIdentityReviewResult> {
-    if (!this.client) throw new Error('Supabase is required for candidate identity rejection.');
+    if (!this.client) throw new Error('Neon is required for candidate identity rejection.');
     return this.client.rpc<CandidateIdentityReviewResult>('reject_candidate_identity_review', {
       p_candidate_id: input.candidateId,
       p_reason: input.reason,
diff --git a/backend/src/services/candidateNewsSemanticsService.ts b/backend/src/services/candidateNewsSemanticsService.ts
index 6566f951f670f9c4f8d8c36404153dee0d6578d1..63a6bf4c0307fdc6be298275c71e64f251e12d95 100644
--- a/backend/src/services/candidateNewsSemanticsService.ts
+++ b/backend/src/services/candidateNewsSemanticsService.ts
@@ -19,10 +19,10 @@ type CandidateRow = {
   updated_at: string | null;
 };
 
-type SupabaseClient = NonNullable<ReturnType<typeof getDataClient>>;
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
 
 type Dependencies = {
-  client?: SupabaseClient | null;
+  client?: DataClient | null;
   now?: () => Date;
 };
 
@@ -55,7 +55,7 @@ const signalCounterKey = (signalClass: CandidateCommercialSignalClass) => {
 };
 
 export class CandidateNewsSemanticsService {
-  private readonly client: SupabaseClient | null;
+  private readonly client: DataClient | null;
   private readonly now: () => Date;
 
   constructor(dependencies: Dependencies = {}) {
@@ -64,7 +64,7 @@ export class CandidateNewsSemanticsService {
   }
 
   async run(options: CandidateNewsSemanticsOptions = {}): Promise<CandidateNewsSemanticsResult> {
-    if (!this.client) throw new Error('Supabase client not configured for candidate news semantics.');
+    if (!this.client) throw new Error('Neon data client not configured for candidate news semantics.');
     const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
     const rows = await this.client.select('discovered_company_candidates', {
       select: 'id,company_name,source_ref,evidence_summary,candidate_status,raw_payload,updated_at',
diff --git a/backend/src/services/candidateWebsiteIdentityService.ts b/backend/src/services/candidateWebsiteIdentityService.ts
index f1ac95c1edd20873f52de2f833c9e6440fca03a7..6e5a8a31e97c24ef110f0de4b6b71c415cd8aed4 100644
--- a/backend/src/services/candidateWebsiteIdentityService.ts
+++ b/backend/src/services/candidateWebsiteIdentityService.ts
@@ -190,7 +190,7 @@ type OfficialEnrichmentRow = {
 };
 
 type SourceRow = { id: string; metadata?: Record<string, unknown> | null };
-type SupabaseClient = NonNullable<ReturnType<typeof getDataClient>>;
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
 
 export type CandidateWebsiteIdentityOptions = { limit?: number };
 export type CandidateWebsiteIdentityResult = {
@@ -208,7 +208,7 @@ export type CandidateWebsiteIdentityResult = {
 };
 
 type Dependencies = {
-  client?: SupabaseClient | null;
+  client?: DataClient | null;
   fetchImpl?: typeof fetch;
   now?: () => Date;
 };
@@ -244,7 +244,7 @@ const buildReviewEvidenceSummary = (
 };
 
 export class CandidateWebsiteIdentityService {
-  private readonly client: SupabaseClient | null;
+  private readonly client: DataClient | null;
   private readonly fetchImpl: typeof fetch;
   private readonly now: () => Date;
 
@@ -255,7 +255,7 @@ export class CandidateWebsiteIdentityService {
   }
 
   async run(options: CandidateWebsiteIdentityOptions = {}): Promise<CandidateWebsiteIdentityResult> {
-    if (!this.client) throw new Error('Supabase client not configured for candidate website identity capture.');
+    if (!this.client) throw new Error('Neon data client not configured for candidate website identity capture.');
     const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
     const now = this.now();
     const poolLimit = Math.min(TARGET_POOL_LIMIT, Math.max(limit * 4, limit));
diff --git a/backend/src/services/capitalMarketDeliveryService.ts b/backend/src/services/capitalMarketDeliveryService.ts
index 3f21d7d80722ab296174665ec794fd9a2460b94d..71675329c106f99a5281e893cb28fe5ea558bd51 100644
--- a/backend/src/services/capitalMarketDeliveryService.ts
+++ b/backend/src/services/capitalMarketDeliveryService.ts
@@ -55,7 +55,7 @@ export class CapitalMarketDeliveryService {
   private readonly client = getDataClient();
 
   async sync(datasets: CvmDatasetCode[]) {
-    if (!this.client) throw new Error('Supabase client not configured for capital-market delivery.');
+    if (!this.client) throw new Error('Neon data client not configured for capital-market delivery.');
 
     const requested = [...new Set(datasets)];
     const summaries: CapitalMarketDeliveryDatasetSummary[] = [];
diff --git a/backend/src/services/capitalMarketIngestionService.ts b/backend/src/services/capitalMarketIngestionService.ts
index 3579b2fe3ecdc74b4bb260be35c10771b114edfe..e0e660046c92302b86746753e3110ac37e12d159 100644
--- a/backend/src/services/capitalMarketIngestionService.ts
+++ b/backend/src/services/capitalMarketIngestionService.ts
@@ -187,7 +187,7 @@ export class CapitalMarketIngestionService {
   private persistenceBatchSize = INITIAL_BATCH_SIZE;
 
   async run(options: CapitalMarketIngestionOptions = {}) {
-    if (!this.client) throw new Error('Supabase client not configured for capital-market ingestion.');
+    if (!this.client) throw new Error('Neon data client not configured for capital-market ingestion.');
     const datasets = options.datasets?.length ? [...new Set(options.datasets)] : allDatasets;
     const maxRows = Math.max(1, Math.min(options.maxRows ?? DEFAULT_MAX_ROWS, MAX_ROWS));
     const summaries: CapitalMarketDatasetSummary[] = [];
diff --git a/backend/src/services/captureDerivedSyncService.ts b/backend/src/services/captureDerivedSyncService.ts
index 32acc314c34918879080ad34ec8781849e3fa405..5f01f2215f1261e3b1089f898f3a1c93b80a2ea1 100644
--- a/backend/src/services/captureDerivedSyncService.ts
+++ b/backend/src/services/captureDerivedSyncService.ts
@@ -165,7 +165,7 @@ export class CaptureDerivedSyncService {
         scoreSnapshotsWritten: 0,
         leadScoreSnapshotsWritten: 0,
         pipelineRowsTouched: 0,
-        errors: ['Supabase client not configured.'],
+        errors: ['Neon data client not configured.'],
       };
     }
 
diff --git a/backend/src/services/capturePersistenceService.ts b/backend/src/services/capturePersistenceService.ts
index c23e68428230f8e4ea72d8ab1d53a0e481bb17a8..1d46afcec0ee721c2b6113a86f57d70a2d43ed04 100644
--- a/backend/src/services/capturePersistenceService.ts
+++ b/backend/src/services/capturePersistenceService.ts
@@ -139,7 +139,7 @@ export class CapturePersistenceService {
         treatmentResultsWritten: 0,
         learningEventsWritten: 0,
         decisionGate: emptyDecisionGate(),
-        errors: ['Supabase client not configured.'],
+        errors: ['Neon data client not configured.'],
       };
     }
 
diff --git a/backend/src/services/publicDataOperationsService.ts b/backend/src/services/publicDataOperationsService.ts
index 0ffd612c869f7fb2f36fe2c31ae7b3408548b41b..3bf7860b333aaffa5ca1fd665bf0ac48163ab6ce 100644
--- a/backend/src/services/publicDataOperationsService.ts
+++ b/backend/src/services/publicDataOperationsService.ts
@@ -203,7 +203,7 @@ export class PublicDataOperationsService {
       return {
         status: 'partial',
         snapshot: emptyPublicDataOperationsSnapshot(),
-        note: 'Supabase não configurado no backend; snapshot operacional indisponível.',
+        note: 'Neon não configurado no backend; snapshot operacional indisponível.',
       };
     }
 
diff --git a/backend/src/services/qsaFallbackIngestionService.ts b/backend/src/services/qsaFallbackIngestionService.ts
index 2469d9a4296be0af4ab0cec6732e482d15c683e7..89a049626baa80fc5d3ad3741f2f0ac007353452 100644
--- a/backend/src/services/qsaFallbackIngestionService.ts
+++ b/backend/src/services/qsaFallbackIngestionService.ts
@@ -57,7 +57,7 @@ export class QsaFallbackIngestionService {
       return {
         status: 'failed' as const,
         generatedAt: new Date().toISOString(),
-        error: 'Supabase client is not configured for QSA fallback ingestion.',
+        error: 'Neon data client is not configured for QSA fallback ingestion.',
         companies: [],
       };
     }
diff --git a/backend/src/services/searchProfileCaptureRuntime.ts b/backend/src/services/searchProfileCaptureRuntime.ts
index c27543a776a6b5f2ff5684a39a2472a2abd22be5..62c6e173128d16698b59082a6cb96dac261ab444 100644
--- a/backend/src/services/searchProfileCaptureRuntime.ts
+++ b/backend/src/services/searchProfileCaptureRuntime.ts
@@ -5,7 +5,7 @@ import type { ExistingCompanyMatchCandidate } from '../lib/companyDiscoveryMatch
 import { buildRediscoveryCandidateUpdate } from '../lib/candidateRediscoveryLineage.js';
 import type { DiscoveredCandidateRecord, SearchProfileCaptureAdapter, SearchProfileRunRecord } from './searchProfileCaptureService.js';
 
-type SupabaseLike = NonNullable<ReturnType<typeof getDataClient>>;
+type DataClient = NonNullable<ReturnType<typeof getDataClient>>;
 
 export const discoveredCandidateToRow = (candidate: DiscoveredCandidateRecord) => ({
   id: candidate.id,
@@ -157,7 +157,7 @@ const mapCandidateRow = (row: any): DiscoveredCandidateRecord => ({
 });
 
 export class SearchProfileCaptureRuntime implements SearchProfileCaptureAdapter {
-  private readonly client: SupabaseLike | null = getDataClient();
+  private readonly client: DataClient | null = getDataClient();
   private runs: SearchProfileRunRecord[] = [];
   private candidates: DiscoveredCandidateRecord[] = [];
 
diff --git a/frontend/src/components/KnowledgeOutcomeOperationsPanel.tsx b/frontend/src/components/KnowledgeOutcomeOperationsPanel.tsx
index f9efac647181ff44422e17961af674b2d90943e2..ce97de53366269de2ac26cfbca272c68ebec09ab 100644
--- a/frontend/src/components/KnowledgeOutcomeOperationsPanel.tsx
+++ b/frontend/src/components/KnowledgeOutcomeOperationsPanel.tsx
@@ -212,7 +212,7 @@ export function KnowledgeOutcomeOperationsPanel({
       onChanged?.();
       setNotice(result.status === 'already_instrumented'
         ? 'A atividade já estava instrumentada e foi reutilizada sem duplicidade.'
-        : 'Atividade instrumentada: nota histórica, lineage e tarefa de resultado criados no Supabase.');
+        : 'Atividade instrumentada: nota histórica, lineage e tarefa de resultado criados no Neon.');
       setActiveTab('outcomes');
     } catch (adoptionError) {
       setError(adoptionError instanceof Error ? adoptionError.message : 'Falha ao instrumentar a atividade histórica.');
diff --git a/frontend/src/config/nav.ts b/frontend/src/config/nav.ts
index f0693df678c2079310a279482b4cbd7923221083..c6d31a76aabdb18655e1c397f153debc95b3e1dd 100644
--- a/frontend/src/config/nav.ts
+++ b/frontend/src/config/nav.ts
@@ -155,7 +155,7 @@ export const navItems = [
     to: '/historical-archive',
     label: 'Arquivo histórico',
     shortLabel: 'Retenção externa',
-    description: 'Consulte arquivos históricos e a estratégia de proteção do Supabase.',
+    description: 'Consulte arquivos históricos e a estratégia de proteção do Neon.',
     group: 'Operação & governança',
     godOnly: true,
   },
diff --git a/frontend/src/lib/auth.tsx b/frontend/src/lib/auth.tsx
index a897876e9908d534e1535c903f4067c7ee19041d..468ad5bf5b8930fd120a3b2227bf48f0255d8c65 100644
--- a/frontend/src/lib/auth.tsx
+++ b/frontend/src/lib/auth.tsx
@@ -8,6 +8,7 @@ import type { UserProfile } from './neonAuth';
 import type { SessionData } from './types';
 
 const SESSION_KEY = 'motor.neon.session';
+// Removed on load so sessions stored by the legacy auth provider never linger.
 const LEGACY_SESSION_KEY = 'motor.supabase.session';
 const REFRESH_WINDOW_MS = 90_000;
 
diff --git a/frontend/src/lib/publicDataOperationsApi.ts b/frontend/src/lib/publicDataOperationsApi.ts
index 6e0c89f98c9dd5688b43e1045ba7d261f0172ab2..0fc560e9e1f1fdfa5b55945d013acf188e0d6a44 100644
--- a/frontend/src/lib/publicDataOperationsApi.ts
+++ b/frontend/src/lib/publicDataOperationsApi.ts
@@ -139,7 +139,7 @@ export async function getPublicDataOperations(session: SessionData | null): Prom
 
     return {
       source: asStatus(payload.status),
-      note: payload.note ?? 'Operação das fontes públicas carregada do Supabase.',
+      note: payload.note ?? 'Operação das fontes públicas carregada do Neon.',
       data: payload.data,
     };
   } catch (error) {
diff --git a/frontend/src/pages/CandidateDecisionQueuePage.tsx b/frontend/src/pages/CandidateDecisionQueuePage.tsx
index 7f4e64384c930773ed101f026764ce23b93ee9d1..bb87109f4ca4a6bb9636ad56f89c2b67f411dbfc 100644
--- a/frontend/src/pages/CandidateDecisionQueuePage.tsx
+++ b/frontend/src/pages/CandidateDecisionQueuePage.tsx
@@ -195,7 +195,7 @@ export function CandidateDecisionQueuePage() {
         description="Prioriza emissores operacionais, separa veículos de mercado e mantém identidade e decisão de crédito em gates independentes. Nenhum registro é promovido automaticamente."
         actions={<div className="pill-row"><Pill tone="success">dados reais</Pill><Pill tone="warning">human-in-the-loop</Pill></div>}
       />
-      <DataStatusBanner source="real" note="A fila é calculada no Supabase com lineage, CNPJ, evento, recência, volume, identidade e semântica econômica da entidade." />
+      <DataStatusBanner source="real" note="A fila é calculada no Neon com lineage, CNPJ, evento, recência, volume, identidade e semântica econômica da entidade." />
       {error ? <Card title="Falha operacional" subtitle="Nenhuma decisão foi executada" tone="accent">{error}</Card> : null}
 
       <section className="grid cols-4">
diff --git a/frontend/src/pages/CandidateIdentityReviewPage.tsx b/frontend/src/pages/CandidateIdentityReviewPage.tsx
index fb6291eecc1f213982a388f94ad6912cb042a267..90201ec1aa62b9dccff929b33d84e9af31c58077 100644
--- a/frontend/src/pages/CandidateIdentityReviewPage.tsx
+++ b/frontend/src/pages/CandidateIdentityReviewPage.tsx
@@ -205,7 +205,7 @@ export function CandidateIdentityReviewPage() {
         description="Valide razão social, CNPJ, domínio e evidência oficial. Veículos FIDC/CRI/CRA ficam no mapa de estruturas e não entram nesta fila. Crédito e fit permanecem sem classificação até análise separada."
         actions={<div className="pill-row"><Pill tone="success">fila paginada</Pill><Pill tone="warning">sem inferência de crédito</Pill></div>}
       />
-      <DataStatusBanner source="real" note="A fila reúne apenas candidatas comerciais ou de identidade. Aprovação e rejeição são persistidas no Supabase com usuário, evidência, data e motivo." />
+      <DataStatusBanner source="real" note="A fila reúne apenas candidatas comerciais ou de identidade. Aprovação e rejeição são persistidas no Neon com usuário, evidência, data e motivo." />
       {error ? <Card title="Revisão bloqueada" subtitle="Nenhuma alteração parcial foi persistida" tone="accent">{error}</Card> : null}
       {success ? <Card title="Revisão concluída" subtitle="Resultado persistido com lineage" tone="success">{success}</Card> : null}
 
diff --git a/frontend/src/pages/CompanyCreditReviewPage.tsx b/frontend/src/pages/CompanyCreditReviewPage.tsx
index a178a53126523b8388f521b3f5e7bcf0cdea7ad6..6b128275403578924fb0b2dd9363d377b88c606b 100644
--- a/frontend/src/pages/CompanyCreditReviewPage.tsx
+++ b/frontend/src/pages/CompanyCreditReviewPage.tsx
@@ -332,7 +332,7 @@ export function CompanyCreditReviewPage() {
         eyebrow="GOD-MODE · Qualification Gate"
         title="Revisão de crédito do Company Master"
         description="Valide produto de crédito, recebíveis, funding, fit FIDC/DCM e timing antes de liberar qualification, score, ranking e pipeline. Identidade real não implica lead decisório."
-        actions={<div className="pill-row"><Pill tone="success">Supabase real</Pill><Pill tone="warning">aprovação humana</Pill></div>}
+        actions={<div className="pill-row"><Pill tone="success">Neon real</Pill><Pill tone="warning">aprovação humana</Pill></div>}
       />
       <DataStatusBanner source="real" note="Revisões são versionadas, exigem evidência por dimensão e somente o outcome elegível abre as superfícies decisórias." />
       {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
diff --git a/frontend/src/pages/DcmDailyOutreachPage.tsx b/frontend/src/pages/DcmDailyOutreachPage.tsx
index a9b7aded5d648b1c92851e3c4747d78c61f504ef..b2b7f9a8caaddd0d0e28c6e4296d9d96391b9fd8 100644
--- a/frontend/src/pages/DcmDailyOutreachPage.tsx
+++ b/frontend/src/pages/DcmDailyOutreachPage.tsx
@@ -288,7 +288,7 @@ export function DcmDailyOutreachPage() {
     generatedMessage: composer.generatedMessage,
     nextAction: composer.nextAction,
     outreachStatus: composer.generatedMessage.trim() ? 'ready' : 'draft',
-  }, 'Mensagem e próxima ação salvas no Supabase.');
+  }, 'Mensagem e próxima ação salvas no Neon.');
 
   const syncPipelineAfterSend = async (lead: DcmDailyLead, actualMessage: string, nextAction: string) => {
     await api.createActivity(session, {
@@ -360,14 +360,14 @@ export function DcmDailyOutreachPage() {
         description="Transforme ranking, sinais e teses em mensagens executáveis. Cada envio registra atividade, próxima ação e o delta entre a mensagem sugerida e a mensagem realmente utilizada."
         actions={(
           <div className="pill-row">
-            <Pill tone="success">Supabase real</Pill>
+            <Pill tone="success">Neon real</Pill>
             <Pill tone="info">RLS por usuário</Pill>
             <button type="button" onClick={() => setShowCreate((current) => !current)}>{showCreate ? 'Fechar cadastro' : 'Adicionar lead'}</button>
           </div>
         )}
       />
 
-      <DataStatusBanner source="real" note="Fila, mensagens, envio e feedback são persistidos no Supabase. O CRM é atualizado após o envio; nenhum lead estático do protótipo foi importado." />
+      <DataStatusBanner source="real" note="Fila, mensagens, envio e feedback são persistidos no Neon. O CRM é atualizado após o envio; nenhum lead estático do protótipo foi importado." />
       {error ? <Card title="Ação bloqueada" subtitle="Nenhuma alteração parcial deve ser assumida" tone="accent">{error}</Card> : null}
       {success ? <Card title="Operação concluída" subtitle="Resultado persistido e auditável" tone="success">{success}</Card> : null}
 
diff --git a/frontend/src/pages/HistoricalArchivePage.tsx b/frontend/src/pages/HistoricalArchivePage.tsx
index b0fe20b5160e5b19e338ff12df798384c432fcee..cbd0c1503819d67813af68b48773c0d02678f24d 100644
--- a/frontend/src/pages/HistoricalArchivePage.tsx
+++ b/frontend/src/pages/HistoricalArchivePage.tsx
@@ -134,7 +134,7 @@ export function HistoricalArchivePage() {
       <PageIntro
         eyebrow="Governança / GOD-MODE"
         title="Arquivo histórico em Excel"
-        description="Camada secundária, privada e auditável para consultar dados frios sem pressionar o Supabase operacional. Cada parte possui manifesto, contagem e SHA-256."
+        description="Camada secundária, privada e auditável para consultar dados frios sem pressionar o Neon operacional. Cada parte possui manifesto, contagem e SHA-256."
         actions={(
           <div className="pill-row">
             <Pill tone="success">bucket privado</Pill>
@@ -248,7 +248,7 @@ export function HistoricalArchivePage() {
         </Card>
       ) : null}
 
-      <Card title="Políticas de retenção" subtitle="O que fica no Supabase e o que pode migrar para Excel" className="dense-card">
+      <Card title="Políticas de retenção" subtitle="O que fica no Neon e o que pode migrar para Excel" className="dense-card">
         <div className="table-wrap">
           <table className="dense-table">
             <thead><tr><th>Tabela</th><th>Dataset</th><th>Modo</th><th>Janela quente</th><th>Prune permitido</th><th>Regra</th></tr></thead>
diff --git a/frontend/src/pages/KnowledgeLearningAgentPage.tsx b/frontend/src/pages/KnowledgeLearningAgentPage.tsx
index 5449ba0ae5b961df39fc1266194edf706c324d7a..b2dcec981c7bcbde5c876e2b6671211df51dd3ca 100644
--- a/frontend/src/pages/KnowledgeLearningAgentPage.tsx
+++ b/frontend/src/pages/KnowledgeLearningAgentPage.tsx
@@ -78,7 +78,7 @@ export function KnowledgeLearningAgentPage() {
         eyebrow="Knowledge Learning Agent V14"
         title="IA que mantém os mind maps vivos"
         description="O agente acompanha novas buscas, capturas, outputs e sinais; separa fatos de hipóteses; atualiza notas, evidências e relações do Knowledge Vault com versionamento e lineage."
-        actions={<div className="page-intro-actions"><Pill tone="success">Supabase real</Pill><Pill tone="info">LLM estruturada</Pill><Link className="button secondary" to="/knowledge-vault">Abrir Vault</Link></div>}
+        actions={<div className="page-intro-actions"><Pill tone="success">Neon real</Pill><Pill tone="info">LLM estruturada</Pill><Link className="button secondary" to="/knowledge-vault">Abrir Vault</Link></div>}
       />
 
       <Card title="Controle do aprendizado" subtitle="Atualização contínua da memória — sem treinamento de pesos e sem mutação de score" tone="accent">
diff --git a/frontend/src/pages/KnowledgeSearchPage.tsx b/frontend/src/pages/KnowledgeSearchPage.tsx
index 53c94d5649d68041d748f7e025f26f1922319f24..2b08813028d4c78c5fb79abcf5f9101efc249c1e 100644
--- a/frontend/src/pages/KnowledgeSearchPage.tsx
+++ b/frontend/src/pages/KnowledgeSearchPage.tsx
@@ -132,7 +132,7 @@ export function KnowledgeSearchPage() {
         description="Recupere sinais, monitoramentos e evidências por palavra e significado. O resultado preserva empresa, fonte, natureza observada ou inferida e o registro de origem."
         actions={(
           <div className="page-intro-actions">
-            <Pill tone="success">Supabase real + RLS</Pill>
+            <Pill tone="success">Neon real</Pill>
             <Pill tone="info">RRF explicável</Pill>
             <Link to="/knowledge-vault" className="button secondary">Abrir Vault</Link>
           </div>
@@ -200,7 +200,7 @@ export function KnowledgeSearchPage() {
           <section className="mini-metric-grid knowledge-search-metrics" aria-live="polite">
             <Stat label="Resultados" value={String(data.results.length)} helper={`limite solicitado: ${data.matchCount}`} />
             <Stat label="Documentos no escopo" value={data.corpus.documents.toLocaleString('pt-BR')} helper={selectedCompany?.name ?? 'corpus completo'} />
-            <Stat label="Com embedding real" value={data.corpus.embeddedDocuments.toLocaleString('pt-BR')} helper="vetores persistidos no Supabase" />
+            <Stat label="Com embedding real" value={data.corpus.embeddedDocuments.toLocaleString('pt-BR')} helper="vetores persistidos no Neon" />
             <Stat label="Modo" value={data.mode === 'hybrid' ? 'Híbrido' : 'Lexical'} helper={data.semantic.model ?? 'fallback sem vetor sintético'} />
           </section>
 
diff --git a/frontend/src/pages/KnowledgeVaultPage.tsx b/frontend/src/pages/KnowledgeVaultPage.tsx
index 84cbb1757557e6d2a42c50a755099c3207b1bebf..97de4d263f20cfbc923958a38be00383bf5e0182 100644
--- a/frontend/src/pages/KnowledgeVaultPage.tsx
+++ b/frontend/src/pages/KnowledgeVaultPage.tsx
@@ -291,7 +291,7 @@ export function KnowledgeVaultPage() {
     setDetail(null);
     setDraft(emptyDraft(nodeType));
     setTagText('');
-    setNotice('Nova nota iniciada. Preencha o título e salve para persistir no Supabase.');
+    setNotice('Nova nota iniciada. Preencha o título e salve para persistir no Neon.');
     setRightPanel('preview');
   };
 
@@ -331,7 +331,7 @@ export function KnowledgeVaultPage() {
       setDetail(null);
       setDraft(emptyDraft());
       setTagText('');
-      setNotice('Nota arquivada. O registro permanece auditável no Supabase.');
+      setNotice('Nota arquivada. O registro permanece auditável no Neon.');
       await loadWorkspace(null);
     } catch (archiveError) {
       setError(archiveError instanceof Error ? archiveError.message : 'Falha ao arquivar a nota.');
@@ -368,7 +368,7 @@ export function KnowledgeVaultPage() {
       const saved = await knowledgeVaultApi.saveView(session, input);
       const refreshed = await loadSavedViews();
       setActiveViewId(saved.id);
-      setNotice(`Base “${saved.name}” ${input.id ? 'atualizada' : 'criada'} no Supabase.`);
+      setNotice(`Base “${saved.name}” ${input.id ? 'atualizada' : 'criada'} no Neon.`);
       return refreshed.find((view) => view.id === saved.id) ?? saved;
     } catch (saveError) {
       const message = saveError instanceof Error ? saveError.message : 'Falha ao salvar a Base.';
@@ -408,7 +408,7 @@ export function KnowledgeVaultPage() {
         description="Workspace interno inspirado no Obsidian: Markdown, WikiLinks, backlinks, grafo e Bases operacionais — conectado a empresas, teses, sinais, reuniões, fontes e estruturas de crédito."
         actions={(
           <div className="page-intro-actions">
-            <Pill tone="success">Supabase real + RLS</Pill>
+            <Pill tone="success">Neon real</Pill>
             <button type="button" onClick={() => startNew('note')}>+ Nova nota</button>
           </div>
         )}
diff --git a/frontend/src/pages/MonitoringPage.tsx b/frontend/src/pages/MonitoringPage.tsx
index 48377bc4cd80df774a8f4ffca77ff1663a356853..d2f5a51ead59800037d611c65418e474f4e48592 100644
--- a/frontend/src/pages/MonitoringPage.tsx
+++ b/frontend/src/pages/MonitoringPage.tsx
@@ -37,7 +37,7 @@ export function MonitoringPage() {
       : 'idle';
   const nextCaptureAction = captureStatus === 'active'
     ? 'Revisar os triggers recentes, confirmar a tese e atualizar a próxima ação comercial dos top leads.'
-    : 'Preservar o circuit breaker e validar a saúde do Supabase antes de reativar captura ou recálculo. Não preencher lacunas com mocks.';
+    : 'Preservar o circuit breaker e validar a saúde do Neon antes de reativar captura ou recálculo. Não preencher lacunas com mocks.';
 
   return (
     <div className="page">
@@ -124,7 +124,7 @@ export function MonitoringPage() {
               ))}
             </ul>
           ) : (
-            <EmptyState title="Sem fontes no snapshot." description="Verifique Source Catalog e disponibilidade do Supabase antes de concluir que não há fontes configuradas." />
+            <EmptyState title="Sem fontes no snapshot." description="Verifique Source Catalog e disponibilidade do Neon antes de concluir que não há fontes configuradas." />
           )}
         </Card>
       </section>
diff --git a/frontend/src/pages/OutcomeOperationsPage.tsx b/frontend/src/pages/OutcomeOperationsPage.tsx
index 784cd5f1e5645eed25931bc0628e7c6074987143..2708b862f6af7dff89ab44f135c9d8001bbf8862 100644
--- a/frontend/src/pages/OutcomeOperationsPage.tsx
+++ b/frontend/src/pages/OutcomeOperationsPage.tsx
@@ -14,7 +14,7 @@ export function OutcomeOperationsPage() {
         description="Fila diária priorizada para confirmar resultados reais, instrumentar histórico relevante e atualizar tarefas e pipeline com lineage — sem alterar scores ou inferir decisões."
         actions={(
           <div className="pill-row">
-            <Pill tone="success">Supabase real</Pill>
+            <Pill tone="success">Neon real</Pill>
             <Pill tone="info">prioridade explicável</Pill>
             <Pill tone="warning">sem outcome sintético</Pill>
           </div>
diff --git a/frontend/src/pages/SearchProfilesPage.tsx b/frontend/src/pages/SearchProfilesPage.tsx
index 13732da4199a126a67a744e22493e16a5965faf1..ab2e522506f982e5b1f8fa315b8db203d7fd996e 100644
--- a/frontend/src/pages/SearchProfilesPage.tsx
+++ b/frontend/src/pages/SearchProfilesPage.tsx
@@ -84,7 +84,7 @@ export function SearchProfilesPage() {
       const refreshed = await api.getSearchProfiles(session);
       setData(refreshed);
       setSelectedProfileId(saved.id);
-      setFeedback({ tone: 'success', message: `Perfil salvo no Supabase: ${saved.name}.` });
+      setFeedback({ tone: 'success', message: `Perfil salvo no Neon: ${saved.name}.` });
       setWorkspaceTab('saved');
     } catch (saveError) {
       setFeedback({ tone: 'error', message: saveError instanceof Error ? saveError.message : 'Falha ao salvar perfil.' });
diff --git a/frontend/src/pages/UsersPage.tsx b/frontend/src/pages/UsersPage.tsx
index 134f79df3e92b92996856ee0eb87e9422a5d75b9..9e4389ee75f89dda4c56dd0512ffd170203c0818 100644
--- a/frontend/src/pages/UsersPage.tsx
+++ b/frontend/src/pages/UsersPage.tsx
@@ -42,7 +42,7 @@ export function UsersPage() {
     }
   };
 
-  if (loading) return <LoadingState title="Usuários" subtitle="Carregando perfis e níveis de acesso do Supabase." />;
+  if (loading) return <LoadingState title="Usuários" subtitle="Carregando perfis e níveis de acesso do Neon." />;
   if (error && !users) return <ErrorState title="Usuários" error={error} action={<button type="button" onClick={() => void loadUsers()}>Tentar novamente</button>} />;
 
   return (
@@ -56,7 +56,7 @@ export function UsersPage() {
 
       {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
 
-      <Card title="Base de usuários" subtitle={`${users?.length ?? 0} usuário(s) cadastrado(s) no Supabase Auth`}>
+      <Card title="Base de usuários" subtitle={`${users?.length ?? 0} usuário(s) cadastrado(s) no Neon Auth`}>
         <div className="table-wrap">
           <table>
             <thead>
diff --git a/migration/supabase-recovery/README.md b/migration/supabase-recovery/README.md
new file mode 100644
index 0000000000000000000000000000000000000000..54e8c5de9f035bac238471cb24cf91267f11ac4c
--- /dev/null
+++ b/migration/supabase-recovery/README.md
@@ -0,0 +1,61 @@
+# Recuperação de dados legados (Supabase → Neon) — TEMPORÁRIO
+
+Esta pasta é a **única** parte do repositório que ainda conversa com o Supabase.
+Ela existe só para tirar os dados do projeto legado `hdghpmssudrqhsbvrdyt` e
+carregá-los no Neon (`steep-poetry-38942951`). O runtime (api/, serverless/,
+backend/, frontend/, scripts/) não importa nada daqui e o contrato
+`scripts/no-supabase-runtime-contract.test.mjs` impede que volte a importar.
+
+> **Apagar** esta pasta e `.github/workflows/legacy-data-recovery.yml` assim que o
+> import no Neon for validado (contagens por tabela batendo com o `manifest.json`).
+
+## Situação em 2026-10-06
+
+- O projeto Supabase está `ACTIVE_HEALTHY` no control plane, mas o banco **recusa
+  conexões** (timeout) e a REST devolve **HTTP 402** (`exceed_db_size_quota` +
+  `exceed_storage_size_quota`, organização no plano Free). Nenhuma linha foi exportada
+  na tentativa de 2026-10-01 (planilha *00 - Status da Extração Supabase - 2026-10-01*).
+- O Neon de produção está com o schema parcial e **sem dados de negócio** (só seeds).
+- Pré-requisito para recuperar: liberar o projeto Supabase (upgrade temporário do plano
+  ou redução de uso aprovada pelo suporte) até o export terminar.
+
+## Passo a passo
+
+1. **Schema no Neon primeiro** — aplicar o plano completo (`node scripts/apply-neon-runtime-migrations.mjs`)
+   e confirmar `node scripts/neon-runtime-parity-check.mjs` → `"ready": true`.
+2. **Export** (com o Supabase liberado):
+   - via GitHub Actions: *Legacy Data Recovery (Supabase export)* → artefato
+     `supabase-full-export-<run_id>` (CSV lossless + manifestos), ou
+   - local, só as tabelas do runtime:
+     ```bash
+     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
+       node migration/supabase-recovery/supabase-rest-export.mjs --out=tmp/supabase-rest-export
+     ```
+3. **Gerar o SQL de import** (não commitar o resultado):
+   ```bash
+   node migration/supabase-recovery/neon-json-import-sql.mjs \
+     --bundle=tmp/supabase-rest-export --out=tmp/neon-import.sql
+   ```
+4. **Importar num branch do Neon** (nunca direto em produção), validar contagens e só
+   então promover/repetir em produção com `--upsert` para o delta final.
+5. **Ajustes pós-import obrigatórios**
+   - `source_catalog`: o Neon já tem linhas de seed com id determinístico
+     (`private.legacy_source_uuid(code)`); o Supabase tem ids aleatórios para o mesmo
+     `metadata->>'code'`. Importar `source_catalog` por `metadata->>'code'` (ou apagar
+     os seeds duplicados antes) para não violar `source_catalog_metadata_code_uidx`.
+   - `user_profiles`: os ids precisam ser os ids do **Neon Auth**; perfis do Supabase
+     Auth só valem depois de religados (`auth_identity_links`).
+   - rodar `select public.refresh_ranking_v2();` e o job `reprocessing` do workflow
+     *Neon Scheduled Jobs* para recalcular derivados.
+6. Apagar esta pasta, o workflow e os secrets `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
+
+## Arquivos
+
+| Arquivo | Papel |
+|---|---|
+| `neon-migration-manifest.mjs` | Lista ordenada (pais antes de filhos) das tabelas a exportar/importar |
+| `supabase-rest-export.mjs` | Export paginado (ordem por PK, contagem exata) em NDJSON + `manifest.json` |
+| `supabase-full-drive-export.mjs` | Export completo (CSV lossless, Google Sheets, Auth, Storage) |
+| `supabase-rest-health-classifier.mjs` | Classifica a saúde da REST (402/401/404/timeout) |
+| `neon-json-import-sql.mjs` | Gera SQL idempotente de carga no Neon a partir do bundle |
+| `*.test.mjs` | `node --test migration/supabase-recovery/*.test.mjs` |
diff --git a/migration/supabase-recovery/neon-data-recovery-tooling.test.mjs b/migration/supabase-recovery/neon-data-recovery-tooling.test.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..1727e3cd6d2102fedb650b4e427c09b72fc4144e
--- /dev/null
+++ b/migration/supabase-recovery/neon-data-recovery-tooling.test.mjs
@@ -0,0 +1,152 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { createHash } from 'node:crypto';
+import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { countFromContentRange, fetchPage, runExport } from './supabase-rest-export.mjs';
+import { sqlForBatch, generateImportSql } from './neon-json-import-sql.mjs';
+import { validateMigrationTable } from './neon-migration-manifest.mjs';
+
+test('content-range parser extracts exact total',()=>{
+  assert.equal(countFromContentRange('0-0/123'),123);
+  assert.equal(countFromContentRange('*/0'),0);
+  assert.equal(countFromContentRange('0-0/*'),null);
+});
+
+test('migration table validation rejects unsafe identifiers',()=>{
+  assert.equal(validateMigrationTable('company_signals'),'company_signals');
+  assert.throws(()=>validateMigrationTable('company_signals;drop table x'),/Invalid migration table/);
+});
+
+test('REST pages use deterministic primary-key ordering',async()=>{
+  let order='';
+  await fetchPage({
+    baseUrl:'https://example.supabase.co',key:'test',table:'companies',offset:0,pageSize:2,
+    fetchImpl:async(url)=>{
+      order=url.searchParams.get('order');
+      return new Response('[]',{status:200,headers:{'content-range':'*/0'}});
+    },
+  });
+  assert.equal(order,'id.asc');
+
+  await fetchPage({
+    baseUrl:'https://example.supabase.co',key:'test',table:'external_api_usage_monthly',offset:0,pageSize:2,
+    fetchImpl:async(url)=>{
+      order=url.searchParams.get('order');
+      return new Response('[]',{status:200,headers:{'content-range':'*/0'}});
+    },
+  });
+  assert.equal(order,'provider.asc,month_key.asc');
+});
+
+test('read-only exporter paginates, verifies final count and writes deterministic manifest',async()=>{
+  const dir=await mkdtemp(join(tmpdir(),'motor-export-'));
+  const rows=[{id:'1',name:'A'},{id:'2',name:'B'},{id:'3',name:'C'}];
+  const fetchImpl=async(_url,init)=>{
+    const [from,to]=String(init.headers.Range).split('-').map(Number);
+    const body=rows.slice(from,to+1);
+    return new Response(JSON.stringify(body),{
+      status:body.length?206:200,
+      headers:{'content-range':body.length?`${from}-${from+body.length-1}/${rows.length}`:`*/${rows.length}`},
+    });
+  };
+  const manifest=await runExport({
+    baseUrl:'https://example.supabase.co',
+    key:'secret-not-logged',
+    tables:['companies'],
+    outDir:dir,
+    pageSize:2,
+    fetchImpl,
+  });
+  assert.equal(manifest.tables[0].rowCount,3);
+  assert.deepEqual(manifest.tables[0].primaryKey,['id']);
+  const ndjson=await readFile(join(dir,'companies.ndjson'),'utf8');
+  assert.equal(ndjson.trim().split('\n').length,3);
+  assert.ok(!JSON.stringify(manifest).includes('secret-not-logged'));
+});
+
+test('export aborts if paginated source returns duplicate primary keys',async()=>{
+  const dir=await mkdtemp(join(tmpdir(),'motor-duplicate-'));
+  const rows=[{id:'1'},{id:'1'}];
+  const fetchImpl=async(_url,init)=>{
+    const [from,to]=String(init.headers.Range).split('-').map(Number);
+    const body=rows.slice(from,to+1);
+    return new Response(JSON.stringify(body),{
+      status:body.length?206:200,
+      headers:{'content-range':body.length?`${from}-${from+body.length-1}/2`:'*/2'},
+    });
+  };
+  await assert.rejects(
+    runExport({baseUrl:'https://example.supabase.co',key:'secret',tables:['companies'],outDir:dir,pageSize:1,fetchImpl}),
+    /Duplicate primary key/
+  );
+});
+
+test('import SQL uses typed target row and conflict-safe inserts',()=>{
+  const sql=sqlForBatch({
+    table:'companies',
+    rows:[{id:'00000000-0000-0000-0000-000000000001',legal_name:'Empresa A',metadata:{x:1}}],
+    batchIndex:0,
+  });
+  assert.match(sql,/jsonb_populate_recordset\(null::public\."companies"/i);
+  assert.match(sql,/where true\s+on conflict do nothing/i);
+  assert.match(sql,/"legal_name"/);
+});
+
+test('final-delta SQL explicitly upserts by source primary key',()=>{
+  const sql=sqlForBatch({
+    table:'companies',
+    rows:[{id:'00000000-0000-4000-8000-000000000001',legal_name:'updated'}],
+    batchIndex:0,
+    upsert:true,
+  });
+  assert.match(sql,/where true\s+on conflict \("id"\) do update set/i);
+  assert.match(sql,/"legal_name"=excluded\."legal_name"/);
+
+  const composite=sqlForBatch({
+    table:'external_api_usage_monthly',
+    rows:[{provider:'example',month_key:'2026-09',used_count:2}],
+    batchIndex:0,
+    upsert:true,
+  });
+  assert.match(composite,/on conflict \("provider","month_key"\) do update set/i);
+});
+
+test('generator refuses probe-only bundle',async()=>{
+  const dir=await mkdtemp(join(tmpdir(),'motor-import-'));
+  await writeFile(
+    join(dir,'manifest.json'),
+    JSON.stringify({format:'motor-supabase-rest-export-v1',probe:true,tables:[]})
+  );
+  await assert.rejects(
+    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql')}),
+    /Probe manifest cannot be imported/
+  );
+});
+
+test('import rejects corrupted data and incomplete manifests',async()=>{
+  const dir=await mkdtemp(join(tmpdir(),'motor-hash-'));
+  const data='{"id":"123"}\n';
+  await writeFile(join(dir,'companies.ndjson'),data);
+  await writeFile(join(dir,'manifest.json'),JSON.stringify({
+    format:'motor-supabase-rest-export-v1',
+    probe:false,
+    tables:[{table:'companies',file:'companies.ndjson',rowCount:1,sha256:'0'.repeat(64)}],
+  }));
+  await assert.rejects(
+    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql'),tables:['companies']}),
+    /SHA-256 mismatch/
+  );
+
+  const hash=createHash('sha256').update(data).digest('hex');
+  await writeFile(join(dir,'manifest.json'),JSON.stringify({
+    format:'motor-supabase-rest-export-v1',
+    probe:false,
+    tables:[{table:'companies',file:'companies.ndjson',rowCount:1,sha256:hash}],
+  }));
+  await assert.rejects(
+    generateImportSql({bundleDir:dir,outFile:join(dir,'out.sql'),tables:['source_catalog']}),
+    /Missing required export/
+  );
+});
diff --git a/migration/supabase-recovery/neon-json-import-sql.mjs b/migration/supabase-recovery/neon-json-import-sql.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..ec87d151cd41a997b8a08d0771d45d25390b3a92
--- /dev/null
+++ b/migration/supabase-recovery/neon-json-import-sql.mjs
@@ -0,0 +1,141 @@
+import { createHash } from 'node:crypto';
+import { createReadStream } from 'node:fs';
+import { mkdir, readFile, writeFile } from 'node:fs/promises';
+import { createInterface } from 'node:readline';
+import { dirname, resolve } from 'node:path';
+import { MIGRATION_TABLES, validateMigrationTable } from './neon-migration-manifest.mjs';
+import { primaryKeyColumns } from './supabase-rest-export.mjs';
+
+const argValue = (name) => {
+  const prefix = `--${name}=`;
+  const match = process.argv.find((arg) => arg.startsWith(prefix));
+  return match ? match.slice(prefix.length) : undefined;
+};
+
+const quoteIdent = (value) => '"' + String(value).replaceAll('"','""') + '"';
+
+export async function sha256File(filePath) {
+  const hash=createHash('sha256');
+  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
+  return hash.digest('hex');
+}
+
+export const sqlForBatch = ({table,rows,batchIndex,upsert=false}) => {
+  validateMigrationTable(table);
+  if (!rows.length) return '';
+  const columns = [...new Set(rows.flatMap((row)=>Object.keys(row)))].sort();
+  if (!columns.length) return '';
+  const keyColumns=primaryKeyColumns(table);
+  for (const keyColumn of keyColumns) {
+    if (!columns.includes(keyColumn)) throw new Error(`Missing primary key column ${keyColumn} in import batch for ${table}`);
+  }
+
+  const colSql = columns.map(quoteIdent).join(',');
+  const json = JSON.stringify(rows);
+  const tag = `$motor_${table}_${batchIndex}$`;
+  const nonKeyColumns=columns.filter((column)=>!keyColumns.includes(column));
+  const conflict=upsert && nonKeyColumns.length
+    ? `on conflict (${keyColumns.map(quoteIdent).join(',')}) do update set ${nonKeyColumns.map((column)=>`${quoteIdent(column)}=excluded.${quoteIdent(column)}`).join(',')};`
+    : 'on conflict do nothing;';
+
+  return [
+    `insert into public.${quoteIdent(table)} (${colSql})`,
+    `select ${colSql}`,
+    `from jsonb_populate_recordset(null::public.${quoteIdent(table)}, ${tag}${json}${tag}::jsonb)`,
+    'where true',
+    conflict,
+    '',
+  ].join('\n');
+};
+
+export async function readNdjsonBatches(filePath,batchSize,onBatch) {
+  const input = createReadStream(filePath,{encoding:'utf8'});
+  const rl = createInterface({input,crlfDelay:Infinity});
+  let batch=[];
+  let index=0;
+  let count=0;
+  for await (const line of rl) {
+    if (!line.trim()) continue;
+    const row=JSON.parse(line);
+    batch.push(row);
+    count += 1;
+    if (batch.length >= batchSize) {
+      await onBatch(batch,index++);
+      batch=[];
+    }
+  }
+  if (batch.length) await onBatch(batch,index++);
+  return count;
+}
+
+export async function generateImportSql({bundleDir,outFile,batchSize=250,tables=MIGRATION_TABLES,upsert=false}) {
+  const manifest=JSON.parse(await readFile(resolve(bundleDir,'manifest.json'),'utf8'));
+  if (manifest.format!=='motor-supabase-rest-export-v1') throw new Error('Unsupported export manifest');
+  if (manifest.probe) throw new Error('Probe manifest cannot be imported');
+  if (!Array.isArray(manifest.tables)) throw new Error('Invalid export manifest tables');
+
+  const tableNames=manifest.tables.map((entry)=>entry?.table);
+  if (new Set(tableNames).size !== tableNames.length) throw new Error('Duplicate export manifest table entries');
+  const byTable=new Map(manifest.tables.map((entry)=>[entry.table,entry]));
+  await mkdir(dirname(outFile),{recursive:true});
+
+  let sql=[
+    '-- Motor Supabase -> Neon data import',
+    '-- Generated from a private REST export. Do not commit the generated SQL or source NDJSON.',
+    '-- Target schema must already exist and match the UUID runtime contract.',
+    `-- Mode: ${upsert ? 'final-delta-upsert' : 'initial-conflict-safe-load'}`,
+    'begin;',
+    "set local statement_timeout = '0';",
+    '',
+  ].join('\n');
+
+  for (const table of tables) {
+    validateMigrationTable(table);
+    const entry=byTable.get(table);
+    if (!entry) throw new Error(`Missing required export manifest entry for ${table}`);
+    if (entry.file !== `${table}.ndjson`) throw new Error(`Invalid export filename for ${table}`);
+    if (!Number.isInteger(entry.rowCount) || entry.rowCount < 0) throw new Error(`Invalid row count for ${table}`);
+    if (!/^[a-f0-9]{64}$/i.test(entry.sha256 ?? '')) throw new Error(`Missing/invalid SHA-256 for ${table}`);
+
+    const filePath=resolve(bundleDir,entry.file);
+    const actualHash=await sha256File(filePath);
+    if (actualHash.toLowerCase() !== entry.sha256.toLowerCase()) {
+      throw new Error(`SHA-256 mismatch for ${table}; refusing to generate import SQL`);
+    }
+
+    let emitted=0;
+    const readCount=await readNdjsonBatches(filePath,batchSize,async(rows,batchIndex)=>{
+      sql += sqlForBatch({table,rows,batchIndex,upsert});
+      emitted += rows.length;
+    });
+    if (readCount!==entry.rowCount || emitted!==entry.rowCount) {
+      throw new Error(`Import generation row-count mismatch for ${table}: read=${readCount} manifest=${entry.rowCount}`);
+    }
+  }
+
+  sql += 'commit;\n';
+  await writeFile(outFile,sql);
+  return outFile;
+}
+
+async function main() {
+  const bundleDir=resolve(argValue('bundle') ?? 'tmp/supabase-rest-export');
+  const outFile=resolve(argValue('out') ?? 'tmp/neon-import.sql');
+  const batchSize=Math.max(1,Math.min(Number(argValue('batch-size') ?? 250),1000));
+  const requested=argValue('tables');
+  const tables=requested
+    ? requested.split(',').map((v)=>validateMigrationTable(v.trim())).filter(Boolean)
+    : MIGRATION_TABLES;
+  await generateImportSql({
+    bundleDir,
+    outFile,
+    batchSize,
+    tables,
+    upsert:process.argv.includes('--upsert'),
+  });
+  process.stdout.write(`Generated import SQL: ${outFile}\n`);
+}
+
+if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
+  await main();
+}
diff --git a/scripts/migration/neon-migration-manifest.mjs b/migration/supabase-recovery/neon-migration-manifest.mjs
similarity index 52%
rename from scripts/migration/neon-migration-manifest.mjs
rename to migration/supabase-recovery/neon-migration-manifest.mjs
index d1665cb193426c596b35e29fd37f854e20048120..d015554e38486374230a83149bc3e52e3924259f 100644
--- a/scripts/migration/neon-migration-manifest.mjs
+++ b/migration/supabase-recovery/neon-migration-manifest.mjs
@@ -53,6 +53,53 @@ export const MIGRATION_TABLES = Object.freeze([
   'data_treatment_runs',
   'external_api_usage_monthly',
   'external_api_usage_events',
+  // Added 2026-10-06: every remaining public table of the Neon runtime schema,
+  // parents before children (import order). Ephemeral token tables are excluded
+  // on purpose (agentetome_ingestion_tokens, data_archive_tokens).
+  'auth_identity_links',
+  'source_health',
+  'source_schema_versions',
+  'source_quarantine',
+  'source_treatment_rules',
+  'source_control_sheet_sync_runs',
+  'capital_market_dataset_runs',
+  'capital_market_resource_checkpoints',
+  'capital_market_events',
+  'capital_market_metrics',
+  'capital_market_entity_links',
+  'bronze_historical_records',
+  'data_treatment_results',
+  'data_quality_runs',
+  'data_quality_violations',
+  'candidate_identity_reviews',
+  'thesis_outputs',
+  'code_improvement_proposals',
+  'vector_documents',
+  'ai_conversations',
+  'ai_messages',
+  'ai_agent_runs',
+  'notifications',
+  'knowledge_nodes',
+  'knowledge_node_versions',
+  'knowledge_links',
+  'knowledge_references',
+  'knowledge_saved_views',
+  'knowledge_embedding_jobs',
+  'knowledge_learning_runs',
+  'knowledge_learning_jobs',
+  'knowledge_learning_runtime_state',
+  'dcm_daily_leads',
+  'dcm_outreach_feedback',
+  'origination_os_artifacts',
+  'microsoft_connections',
+  'microsoft_task_links',
+  'microsoft_sync_runs',
+  'agentetome_operation_runs',
+  'agentetome_export_targets',
+  'agentetome_export_packages',
+  'data_archive_policies',
+  'data_archive_runs',
+  'data_archive_parts',
 ]);
 
 export const validateMigrationTable = (table) => {
diff --git a/migration/supabase-recovery/supabase-full-drive-export.mjs b/migration/supabase-recovery/supabase-full-drive-export.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..0182372af3deb8528d4c7661ab3c8f7c617a5636
--- /dev/null
+++ b/migration/supabase-recovery/supabase-full-drive-export.mjs
@@ -0,0 +1,721 @@
+import { createHash, randomUUID } from 'node:crypto';
+import { createReadStream, createWriteStream } from 'node:fs';
+import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
+import { basename, join, resolve } from 'node:path';
+import { Readable, Transform } from 'node:stream';
+import { pipeline } from 'node:stream/promises';
+import { MIGRATION_TABLES } from './neon-migration-manifest.mjs';
+
+const required = (name) => {
+  const value = process.env[name]?.trim();
+  if (!value) throw new Error(`${name} is required`);
+  return value;
+};
+
+const SUPABASE_URL = required('SUPABASE_URL').replace(/\/+$/, '');
+const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
+const ARTIFACT_ONLY = String(process.env.ARTIFACT_ONLY ?? 'false').toLowerCase() === 'true';
+const GOOGLE_DRIVE_CLIENT_ID = ARTIFACT_ONLY ? '' : required('GOOGLE_DRIVE_CLIENT_ID');
+const GOOGLE_DRIVE_CLIENT_SECRET = ARTIFACT_ONLY ? '' : required('GOOGLE_DRIVE_CLIENT_SECRET');
+const GOOGLE_DRIVE_REFRESH_TOKEN = ARTIFACT_ONLY ? '' : required('GOOGLE_DRIVE_REFRESH_TOKEN');
+const TARGET_DRIVE_FOLDER_ID = ARTIFACT_ONLY ? '' : required('TARGET_DRIVE_FOLDER_ID');
+const COPY_STORAGE_FILES = String(process.env.COPY_STORAGE_FILES ?? 'true').toLowerCase() !== 'false';
+const PAGE_SIZE = Math.max(100, Math.min(Number(process.env.EXPORT_PAGE_SIZE ?? 1000) || 1000, 5000));
+const MAX_ROWS_PER_SHEET = Math.max(1000, Math.min(Number(process.env.MAX_ROWS_PER_SHEET ?? 50000) || 50000, 100000));
+const MAX_SHEET_CELLS = 4_000_000;
+const EXPORT_ROOT = resolve(process.env.EXPORT_ROOT ?? resolve(process.env.RUNNER_TEMP ?? 'tmp', `motor-supabase-full-export-${Date.now()}`));
+const TMP_DIR = resolve(EXPORT_ROOT, '_tmp');
+const PROJECT_REF = 'hdghpmssudrqhsbvrdyt';
+
+const safeName = (value, max = 120) => String(value ?? '')
+  .normalize('NFD')
+  .replace(/[\u0300-\u036f]/g, '')
+  .replace(/[\\/:*?"<>|]+/g, '_')
+  .replace(/\s+/g, ' ')
+  .trim()
+  .slice(0, max) || 'unnamed';
+
+const csvCell = (value) => {
+  if (value === null || value === undefined) return '';
+  let text;
+  if (typeof value === 'object') text = JSON.stringify(value);
+  else text = String(value);
+  return `"${text.replaceAll('"', '""')}"`;
+};
+
+const jsonError = (error) => ({
+  message: error instanceof Error ? error.message : String(error),
+});
+
+const fetchText = async (url, init = {}, timeoutMs = 60_000) => {
+  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
+  const text = await response.text();
+  return { response, text };
+};
+
+let googleToken;
+const googleAccessToken = async () => {
+  if (googleToken && googleToken.expiresAt > Date.now() + 60_000) return googleToken.value;
+  const { response, text } = await fetchText('https://oauth2.googleapis.com/token', {
+    method: 'POST',
+    headers: { 'content-type': 'application/x-www-form-urlencoded' },
+    body: new URLSearchParams({
+      client_id: GOOGLE_DRIVE_CLIENT_ID,
+      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
+      refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN,
+      grant_type: 'refresh_token',
+    }),
+  }, 30_000);
+  let payload = {};
+  try { payload = JSON.parse(text); } catch {}
+  if (!response.ok || !payload.access_token) throw new Error(`google_oauth_${response.status}`);
+  googleToken = {
+    value: String(payload.access_token),
+    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
+  };
+  return googleToken.value;
+};
+
+const googleJson = async (url, init = {}, timeoutMs = 60_000) => {
+  const token = await googleAccessToken();
+  const { response, text } = await fetchText(url, {
+    ...init,
+    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
+  }, timeoutMs);
+  let payload = null;
+  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 1000) }; }
+  if (!response.ok) throw new Error(`google_${response.status}:${payload?.error?.message ?? 'request_failed'}`);
+  return payload;
+};
+
+const escapeDriveQuery = (value) => String(value).replaceAll("'", "\\'");
+const driveFolderCache = new Map();
+const ensureDriveFolder = async (name, parentId, properties = {}) => {
+  const key = `${parentId}/${name}`;
+  if (driveFolderCache.has(key)) return driveFolderCache.get(key);
+  const query = [
+    `'${escapeDriveQuery(parentId)}' in parents`,
+    `name='${escapeDriveQuery(name)}'`,
+    "mimeType='application/vnd.google-apps.folder'",
+    'trashed=false',
+  ].join(' and ');
+  const found = await googleJson(`https://www.googleapis.com/drive/v3/files?spaces=drive&q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10`);
+  if (found.files?.[0]?.id) {
+    driveFolderCache.set(key, found.files[0].id);
+    return found.files[0].id;
+  }
+  const created = await googleJson('https://www.googleapis.com/drive/v3/files?fields=id,name,parents', {
+    method: 'POST',
+    headers: { 'content-type': 'application/json' },
+    body: JSON.stringify({
+      name,
+      mimeType: 'application/vnd.google-apps.folder',
+      parents: [parentId],
+      appProperties: properties,
+    }),
+  });
+  driveFolderCache.set(key, created.id);
+  return created.id;
+};
+
+const uploadResumable = async ({ filePath, name, parentId, sourceMimeType = 'application/octet-stream', convertToSheet = false, appProperties = {} }) => {
+  const info = await stat(filePath);
+  const token = await googleAccessToken();
+  const metadata = {
+    name,
+    parents: [parentId],
+    appProperties,
+    ...(convertToSheet ? { mimeType: 'application/vnd.google-apps.spreadsheet' } : {}),
+  };
+  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,parents', {
+    method: 'POST',
+    headers: {
+      Authorization: `Bearer ${token}`,
+      'content-type': 'application/json; charset=UTF-8',
+      'x-upload-content-type': sourceMimeType,
+      'x-upload-content-length': String(info.size),
+    },
+    body: JSON.stringify(metadata),
+    signal: AbortSignal.timeout(60_000),
+  });
+  if (!start.ok) throw new Error(`drive_resumable_start_${start.status}`);
+  const location = start.headers.get('location');
+  if (!location) throw new Error('drive_resumable_location_missing');
+
+  const upload = await fetch(location, {
+    method: 'PUT',
+    headers: {
+      Authorization: `Bearer ${token}`,
+      'content-type': sourceMimeType,
+      'content-length': String(info.size),
+    },
+    body: createReadStream(filePath),
+    duplex: 'half',
+    signal: AbortSignal.timeout(20 * 60_000),
+  });
+  const text = await upload.text();
+  let payload = {};
+  try { payload = text ? JSON.parse(text) : {}; } catch {}
+  if (!upload.ok) throw new Error(`drive_resumable_upload_${upload.status}:${payload?.error?.message ?? 'failed'}`);
+  return payload;
+};
+
+const styleSheet = async (spreadsheetId) => {
+  try {
+    const meta = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,gridProperties))`);
+    const sheetId = meta?.sheets?.[0]?.properties?.sheetId;
+    if (sheetId === undefined) return;
+    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({
+        requests: [
+          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
+          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.wrapStrategy' } },
+        ],
+      }),
+    });
+  } catch (error) {
+    process.stderr.write(`WARN style sheet ${spreadsheetId}: ${jsonError(error).message}\n`);
+  }
+};
+
+const supabaseHeaders = {
+  apikey: SUPABASE_SERVICE_ROLE_KEY,
+  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
+};
+
+const supabaseJson = async (path, init = {}, timeoutMs = 60_000) => {
+  const { response, text } = await fetchText(`${SUPABASE_URL}${path}`, {
+    ...init,
+    headers: { ...supabaseHeaders, ...(init.headers ?? {}) },
+  }, timeoutMs);
+  let payload = null;
+  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 1200) }; }
+  if (!response.ok && response.status !== 206) {
+    const hint = payload?.message ?? payload?.error ?? payload?.raw ?? 'request_failed';
+    const error = new Error(`supabase_${response.status}:${String(hint).replace(/\s+/g, ' ').slice(0, 500)}`);
+    error.status = response.status;
+    throw error;
+  }
+  return { response, payload };
+};
+
+const readRepoTableCandidates = async () => {
+  const names = new Set(MIGRATION_TABLES);
+  try {
+    const files = await readdir(resolve('db/migrations'), { recursive: true });
+    for (const relative of files) {
+      if (!String(relative).endsWith('.sql')) continue;
+      const content = await readFile(resolve('db/migrations', relative), 'utf8');
+      const regexes = [
+        /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
+        /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
+      ];
+      for (const regex of regexes) {
+        for (const match of content.matchAll(regex)) names.add(match[1]);
+      }
+    }
+  } catch (error) {
+    process.stderr.write(`WARN migration scan: ${jsonError(error).message}\n`);
+  }
+  return names;
+};
+
+const discoverRestCatalog = async () => {
+  const result = { tables: new Set(), headers: new Map(), status: 'unknown', error: null };
+  try {
+    const { response, payload } = await supabaseJson('/rest/v1/', { headers: { Accept: 'application/openapi+json' } }, 60_000);
+    result.status = `http_${response.status}`;
+    const paths = payload?.paths ?? {};
+    for (const [path, methods] of Object.entries(paths)) {
+      if (!path.startsWith('/') || path.startsWith('/rpc/')) continue;
+      if (!methods?.get) continue;
+      result.tables.add(decodeURIComponent(path.slice(1)));
+    }
+    const defs = payload?.definitions ?? payload?.components?.schemas ?? {};
+    for (const [name, schema] of Object.entries(defs)) {
+      const props = schema?.properties ? Object.keys(schema.properties) : [];
+      if (props.length) result.headers.set(name, props);
+    }
+  } catch (error) {
+    result.status = 'blocked';
+    result.error = jsonError(error).message;
+  }
+  return result;
+};
+
+const openCsvPart = async ({ prefix, partNumber, headers }) => {
+  const filePath = join(TMP_DIR, `${safeName(prefix, 80)}__part_${String(partNumber).padStart(3, '0')}.csv`);
+  const handle = await open(filePath, 'w');
+  await handle.write(headers.map(csvCell).join(',') + '\n');
+  return { filePath, handle, rowCount: 0, hash: createHash('sha256') };
+};
+
+const writeCsvRow = async (part, headers, row) => {
+  const line = headers.map((header) => csvCell(row?.[header])).join(',') + '\n';
+  part.hash.update(line);
+  await part.handle.write(line);
+  part.rowCount += 1;
+};
+
+const closeAndUploadPart = async ({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows }) => {
+  await part.handle.close();
+  const rawName = basename(part.filePath);
+  const digest = part.hash.digest('hex');
+
+  if (ARTIFACT_ONLY) {
+    await mkdir(rawFolderId, { recursive: true });
+    const finalPath = join(rawFolderId, rawName);
+    await rename(part.filePath, finalPath);
+    manifestRows.push({
+      scope: 'database',
+      logical_name: logicalName,
+      part: partNumber,
+      rows: part.rowCount,
+      sha256: digest,
+      status: 'artifact_ok',
+      raw_file_path: finalPath.replace(EXPORT_ROOT + '/', ''),
+      raw_file_id: null,
+      raw_url: null,
+      sheet_file_id: null,
+      sheet_url: null,
+      error: null,
+    });
+    return;
+  }
+
+  const rawFile = await uploadResumable({
+    filePath: part.filePath,
+    name: rawName,
+    parentId: rawFolderId,
+    sourceMimeType: 'text/csv',
+    appProperties: { sourceProject: PROJECT_REF, logicalName, sha256: digest },
+  });
+
+  let sheetFile = null;
+  let sheetError = null;
+  try {
+    sheetFile = await uploadResumable({
+      filePath: part.filePath,
+      name: rawName.replace(/\.csv$/i, ''),
+      parentId: sheetsFolderId,
+      sourceMimeType: 'text/csv',
+      convertToSheet: true,
+      appProperties: { sourceProject: PROJECT_REF, logicalName, sha256: digest },
+    });
+    if (sheetFile?.id) await styleSheet(sheetFile.id);
+  } catch (error) {
+    sheetError = jsonError(error).message;
+  }
+
+  manifestRows.push({
+    scope: 'database',
+    logical_name: logicalName,
+    part: partNumber,
+    rows: part.rowCount,
+    sha256: digest,
+    status: sheetError ? 'raw_ok_sheet_failed' : 'ok',
+    raw_file_id: rawFile?.id ?? null,
+    raw_url: rawFile?.webViewLink ?? null,
+    sheet_file_id: sheetFile?.id ?? null,
+    sheet_url: sheetFile?.webViewLink ?? null,
+    error: sheetError,
+  });
+  await rm(part.filePath, { force: true });
+};
+
+const fetchTablePage = async (table, offset) => {
+  const url = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`);
+  url.searchParams.set('select', '*');
+  const { response, text } = await fetchText(url, {
+    headers: {
+      ...supabaseHeaders,
+      Accept: 'application/json',
+      Range: `${offset}-${offset + PAGE_SIZE - 1}`,
+      'Range-Unit': 'items',
+    },
+  }, 90_000);
+  let rows;
+  try { rows = text ? JSON.parse(text) : []; } catch { rows = null; }
+  if (!response.ok && response.status !== 206) {
+    const hint = rows?.message ?? rows?.error ?? text.slice(0, 500);
+    const error = new Error(`HTTP ${response.status}: ${String(hint).replace(/\s+/g, ' ').slice(0, 400)}`);
+    error.status = response.status;
+    throw error;
+  }
+  if (!Array.isArray(rows)) throw new Error(`Unexpected payload for ${table}`);
+  return rows;
+};
+
+const exportRestTable = async ({ table, schemaHeaders = [], rawFolderId, sheetsFolderId, manifestRows }) => {
+  let offset = 0;
+  let partNumber = 1;
+  let headers = [...schemaHeaders];
+  let current = null;
+  let totalRows = 0;
+  let rowsPerPart = MAX_ROWS_PER_SHEET;
+  let hadAnyPage = false;
+
+  for (;;) {
+    const rows = await fetchTablePage(table, offset);
+    hadAnyPage = true;
+    if (!headers.length && rows.length) headers = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
+    if (!headers.length && !rows.length) {
+      manifestRows.push({ scope: 'database', logical_name: table, part: 0, rows: 0, status: 'empty_no_schema', error: null });
+      return;
+    }
+    if (!current) {
+      rowsPerPart = Math.max(1000, Math.min(MAX_ROWS_PER_SHEET, Math.floor(MAX_SHEET_CELLS / Math.max(1, headers.length))));
+      current = await openCsvPart({ prefix: table, partNumber, headers });
+    }
+
+    for (const row of rows) {
+      if (current.rowCount >= rowsPerPart) {
+        await closeAndUploadPart({ part: current, logicalName: table, partNumber, rawFolderId, sheetsFolderId, manifestRows });
+        partNumber += 1;
+        current = await openCsvPart({ prefix: table, partNumber, headers });
+      }
+      await writeCsvRow(current, headers, row);
+      totalRows += 1;
+    }
+
+    offset += rows.length;
+    if (rows.length < PAGE_SIZE) break;
+  }
+
+  if (current) await closeAndUploadPart({ part: current, logicalName: table, partNumber, rawFolderId, sheetsFolderId, manifestRows });
+  if (!hadAnyPage) manifestRows.push({ scope: 'database', logical_name: table, part: 0, rows: 0, status: 'no_response', error: null });
+  process.stdout.write(`TABLE ${table}: ${totalRows} rows\n`);
+};
+
+const exportRows = async ({ logicalName, rows, scope, rawFolderId, sheetsFolderId, manifestRows }) => {
+  const headers = rows.length ? [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))] : ['_empty'];
+  const rowsPerPart = Math.max(1000, Math.min(MAX_ROWS_PER_SHEET, Math.floor(MAX_SHEET_CELLS / Math.max(1, headers.length))));
+  let partNumber = 1;
+  let part = await openCsvPart({ prefix: logicalName, partNumber, headers });
+  if (!rows.length) {
+    await closeAndUploadPart({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows });
+    manifestRows[manifestRows.length - 1].scope = scope;
+    return;
+  }
+  for (const row of rows) {
+    if (part.rowCount >= rowsPerPart) {
+      await closeAndUploadPart({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows });
+      manifestRows[manifestRows.length - 1].scope = scope;
+      partNumber += 1;
+      part = await openCsvPart({ prefix: logicalName, partNumber, headers });
+    }
+    await writeCsvRow(part, headers, row);
+  }
+  await closeAndUploadPart({ part, logicalName, partNumber, rawFolderId, sheetsFolderId, manifestRows });
+  manifestRows[manifestRows.length - 1].scope = scope;
+};
+
+const listAuthUsers = async () => {
+  const all = [];
+  for (let page = 1; page <= 10000; page += 1) {
+    const { payload } = await supabaseJson(`/auth/v1/admin/users?page=${page}&per_page=1000`);
+    const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
+    all.push(...users);
+    if (users.length < 1000) break;
+  }
+  return all;
+};
+
+const listStorageBuckets = async () => {
+  const { payload } = await supabaseJson('/storage/v1/bucket');
+  return Array.isArray(payload) ? payload : [];
+};
+
+const listStorageObjects = async (bucketId) => {
+  const rows = [];
+  const queue = [''];
+  const visited = new Set();
+  while (queue.length) {
+    const prefix = queue.shift();
+    if (visited.has(prefix)) continue;
+    visited.add(prefix);
+    for (let offset = 0; ; offset += 1000) {
+      const { payload } = await supabaseJson(`/storage/v1/object/list/${encodeURIComponent(bucketId)}`, {
+        method: 'POST',
+        headers: { 'content-type': 'application/json' },
+        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
+      });
+      const items = Array.isArray(payload) ? payload : [];
+      for (const item of items) {
+        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
+        const isFolder = !item.id && !item.metadata;
+        if (isFolder) {
+          queue.push(fullPath);
+          continue;
+        }
+        rows.push({ bucket_id: bucketId, full_path: fullPath, ...item });
+      }
+      if (items.length < 1000) break;
+    }
+  }
+  return rows;
+};
+
+const ensureNestedDrivePath = async (rootId, relativePath) => {
+  const parts = String(relativePath).split('/').filter(Boolean);
+  let parent = rootId;
+  for (const part of parts) parent = await ensureDriveFolder(safeName(part, 100), parent, { sourceProject: PROJECT_REF });
+  return parent;
+};
+
+const downloadStorageObjectToFile = async ({ bucketId, fullPath }) => {
+  const encodedPath = fullPath.split('/').map(encodeURIComponent).join('/');
+  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucketId)}/${encodedPath}`, {
+    headers: supabaseHeaders,
+    signal: AbortSignal.timeout(20 * 60_000),
+  });
+  if (!response.ok || !response.body) throw new Error(`storage_download_${response.status}`);
+  const tempPath = join(TMP_DIR, `storage-${randomUUID()}-${safeName(basename(fullPath), 80)}`);
+  const hash = createHash('sha256');
+  let size = 0;
+  const hasher = new Transform({
+    transform(chunk, encoding, callback) {
+      hash.update(chunk);
+      size += chunk.length;
+      callback(null, chunk);
+    },
+  });
+  await pipeline(Readable.fromWeb(response.body), hasher, createWriteStream(tempPath));
+  return {
+    tempPath,
+    sha256: hash.digest('hex'),
+    size,
+    contentType: response.headers.get('content-type') || 'application/octet-stream',
+  };
+};
+
+const copyStorageFiles = async ({ buckets, storageRowsByBucket, storageFilesFolderId, storageManifestRows }) => {
+  if (!COPY_STORAGE_FILES) return;
+  for (const bucket of buckets) {
+    const bucketId = String(bucket.id ?? bucket.name ?? 'unknown');
+    const bucketFolderId = ARTIFACT_ONLY
+      ? join(storageFilesFolderId, safeName(bucketId))
+      : await ensureDriveFolder(safeName(bucketId), storageFilesFolderId, { sourceBucket: bucketId, sourceProject: PROJECT_REF });
+    if (ARTIFACT_ONLY) await mkdir(bucketFolderId, { recursive: true });
+    const rows = storageRowsByBucket.get(bucketId) ?? [];
+    for (const row of rows) {
+      const fullPath = String(row.full_path ?? row.name ?? '');
+      try {
+        const slash = fullPath.lastIndexOf('/');
+        const dir = slash >= 0 ? fullPath.slice(0, slash) : '';
+        const fileName = slash >= 0 ? fullPath.slice(slash + 1) : fullPath;
+        const parentId = ARTIFACT_ONLY
+          ? bucketFolderId
+          : (dir ? await ensureNestedDrivePath(bucketFolderId, dir) : bucketFolderId);
+        const downloaded = await downloadStorageObjectToFile({ bucketId, fullPath });
+        if (ARTIFACT_ONLY) {
+          const targetDir = dir ? join(bucketFolderId, ...dir.split('/').map((part) => safeName(part, 100))) : bucketFolderId;
+          await mkdir(targetDir, { recursive: true });
+          const targetPath = join(targetDir, safeName(fileName, 180));
+          await rename(downloaded.tempPath, targetPath);
+          storageManifestRows.push({
+            bucket_id: bucketId,
+            full_path: fullPath,
+            source_size: row?.metadata?.size ?? downloaded.size,
+            copied_size: downloaded.size,
+            sha256: downloaded.sha256,
+            local_path: targetPath.replace(EXPORT_ROOT + '/', ''),
+            drive_file_id: null,
+            drive_url: null,
+            status: 'artifact_ok',
+            error: null,
+          });
+        } else {
+          const driveFile = await uploadResumable({
+            filePath: downloaded.tempPath,
+            name: safeName(fileName, 180),
+            parentId,
+            sourceMimeType: downloaded.contentType,
+            appProperties: { sourceProject: PROJECT_REF, sourceBucket: bucketId, sourcePath: fullPath, sha256: downloaded.sha256 },
+          });
+          storageManifestRows.push({
+            bucket_id: bucketId,
+            full_path: fullPath,
+            source_size: row?.metadata?.size ?? downloaded.size,
+            copied_size: downloaded.size,
+            sha256: downloaded.sha256,
+            drive_file_id: driveFile?.id ?? null,
+            drive_url: driveFile?.webViewLink ?? null,
+            status: 'ok',
+            error: null,
+          });
+          await rm(downloaded.tempPath, { force: true });
+        }
+      } catch (error) {
+        storageManifestRows.push({
+          bucket_id: bucketId,
+          full_path: fullPath,
+          source_size: row?.metadata?.size ?? null,
+          copied_size: null,
+          sha256: null,
+          drive_file_id: null,
+          drive_url: null,
+          status: 'failed',
+          error: jsonError(error).message,
+        });
+      }
+    }
+  }
+};
+
+const uploadJsonManifest = async (manifest, folderId) => {
+  const path = ARTIFACT_ONLY ? join(folderId, 'export_manifest.json') : join(TMP_DIR, 'export_manifest.json');
+  await mkdir(resolve(path, '..'), { recursive: true }).catch(() => {});
+  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
+  if (ARTIFACT_ONLY) return { id: null, webViewLink: null, localPath: path.replace(EXPORT_ROOT + '/', '') };
+  return uploadResumable({ filePath: path, name: 'export_manifest.json', parentId: folderId, sourceMimeType: 'application/json' });
+};
+
+const main = async () => {
+  await mkdir(TMP_DIR, { recursive: true });
+  const startedAt = new Date().toISOString();
+  const manifestRows = [];
+  const storageManifestRows = [];
+  const blockedScopes = [];
+
+  let rawFolderId;
+  let sheetsFolderId;
+  let storageFilesFolderId;
+  let metaFolderId;
+  if (ARTIFACT_ONLY) {
+    rawFolderId = join(EXPORT_ROOT, '01 - CSV bruto (lossless)');
+    sheetsFolderId = rawFolderId;
+    storageFilesFolderId = join(EXPORT_ROOT, '03 - Supabase Storage - arquivos');
+    metaFolderId = join(EXPORT_ROOT, '04 - Manifestos e auditoria');
+    await Promise.all([rawFolderId, storageFilesFolderId, metaFolderId].map((dir) => mkdir(dir, { recursive: true })));
+  } else {
+    await googleAccessToken();
+    rawFolderId = await ensureDriveFolder('01 - CSV bruto (lossless)', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
+    sheetsFolderId = await ensureDriveFolder('02 - Google Sheets', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
+    storageFilesFolderId = await ensureDriveFolder('03 - Supabase Storage - arquivos', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
+    metaFolderId = await ensureDriveFolder('04 - Manifestos e auditoria', TARGET_DRIVE_FOLDER_ID, { sourceProject: PROJECT_REF });
+  }
+
+  const repoCandidates = await readRepoTableCandidates();
+  const catalog = await discoverRestCatalog();
+  for (const table of catalog.tables) repoCandidates.add(table);
+
+  const tableNames = [...repoCandidates]
+    .filter((name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
+    .sort((a, b) => a.localeCompare(b));
+
+  process.stdout.write(`Discovered ${tableNames.length} database table/view candidates; REST catalog=${catalog.status}\n`);
+
+  for (const table of tableNames) {
+    try {
+      await exportRestTable({
+        table,
+        schemaHeaders: catalog.headers.get(table) ?? [],
+        rawFolderId,
+        sheetsFolderId,
+        manifestRows,
+      });
+    } catch (error) {
+      manifestRows.push({ scope: 'database', logical_name: table, part: 0, rows: null, status: 'blocked_or_failed', error: jsonError(error).message });
+      process.stderr.write(`TABLE FAIL ${table}: ${jsonError(error).message}\n`);
+    }
+  }
+
+  try {
+    const authUsers = await listAuthUsers();
+    await exportRows({ logicalName: 'auth_users', rows: authUsers, scope: 'auth', rawFolderId, sheetsFolderId, manifestRows });
+    process.stdout.write(`AUTH users: ${authUsers.length}\n`);
+  } catch (error) {
+    blockedScopes.push({ scope: 'auth_users', error: jsonError(error).message });
+  }
+
+  const storageRowsByBucket = new Map();
+  let buckets = [];
+  try {
+    buckets = await listStorageBuckets();
+    await exportRows({ logicalName: 'storage_buckets', rows: buckets, scope: 'storage_metadata', rawFolderId, sheetsFolderId, manifestRows });
+    for (const bucket of buckets) {
+      const bucketId = String(bucket.id ?? bucket.name ?? 'unknown');
+      try {
+        const rows = await listStorageObjects(bucketId);
+        storageRowsByBucket.set(bucketId, rows);
+        await exportRows({ logicalName: `storage_objects__${safeName(bucketId, 60)}`, rows, scope: 'storage_metadata', rawFolderId, sheetsFolderId, manifestRows });
+        process.stdout.write(`STORAGE ${bucketId}: ${rows.length} objects\n`);
+      } catch (error) {
+        blockedScopes.push({ scope: `storage_objects:${bucketId}`, error: jsonError(error).message });
+      }
+    }
+  } catch (error) {
+    blockedScopes.push({ scope: 'storage_buckets', error: jsonError(error).message });
+  }
+
+  if (buckets.length && COPY_STORAGE_FILES) {
+    await copyStorageFiles({ buckets, storageRowsByBucket, storageFilesFolderId, storageManifestRows });
+    await exportRows({ logicalName: 'storage_file_copy_manifest', rows: storageManifestRows, scope: 'storage_files', rawFolderId, sheetsFolderId, manifestRows });
+  }
+
+  const finalManifest = {
+    format: 'motor-supabase-full-drive-export-v1',
+    projectRef: PROJECT_REF,
+    startedAt,
+    completedAt: new Date().toISOString(),
+    targetDriveFolderId: TARGET_DRIVE_FOLDER_ID || null,
+    exportRoot: ARTIFACT_ONLY ? EXPORT_ROOT : null,
+    restCatalogStatus: catalog.status,
+    restCatalogError: catalog.error,
+    discoveredDatabaseObjects: tableNames.length,
+    exportParts: manifestRows,
+    storageCopies: storageManifestRows,
+    blockedScopes,
+    notes: [
+      'Database export is sourced from Supabase PostgREST using the service-role credential.',
+      'CSV files are the lossless tabular archive; native Google Sheets are convenience copies and may fail for provider cell limits.',
+      'Auth export uses the supported Admin Users API; passwords, secret keys, refresh tokens, sessions, and credential secrets are intentionally not exported.',
+      'Storage object files are copied byte-for-byte to Google Drive when the Storage API remains readable.',
+    ],
+  };
+
+  const manifestFile = await uploadJsonManifest(finalManifest, metaFolderId);
+  const indexRows = manifestRows.map((row) => ({
+    scope: row.scope,
+    logical_name: row.logical_name,
+    part: row.part,
+    rows: row.rows,
+    status: row.status,
+    raw_url: row.raw_url ?? null,
+    sheet_url: row.sheet_url ?? null,
+    sha256: row.sha256 ?? null,
+    error: row.error ?? null,
+  }));
+  for (const blocked of blockedScopes) indexRows.push({ scope: blocked.scope, logical_name: blocked.scope, part: 0, rows: null, status: 'blocked', raw_url: null, sheet_url: null, sha256: null, error: blocked.error });
+  await exportRows({ logicalName: 'EXPORT_INDEX', rows: indexRows, scope: 'manifest', rawFolderId: metaFolderId, sheetsFolderId: metaFolderId, manifestRows: [] });
+
+  const summary = {
+    status: blockedScopes.length || manifestRows.some((row) => String(row.status).includes('failed') || String(row.status).includes('blocked')) ? 'partial' : 'ok',
+    projectRef: PROJECT_REF,
+    targetDriveFolderId: TARGET_DRIVE_FOLDER_ID || null,
+    exportRoot: ARTIFACT_ONLY ? EXPORT_ROOT : null,
+    databaseObjectsAttempted: tableNames.length,
+    exportPartsCreated: manifestRows.filter((row) => row.raw_file_id || row.raw_file_path).length,
+    storageObjectsCopied: storageManifestRows.filter((row) => row.status === 'ok' || row.status === 'artifact_ok').length,
+    storageObjectsFailed: storageManifestRows.filter((row) => row.status !== 'ok').length,
+    blockedScopes,
+    manifestFileId: manifestFile?.id ?? null,
+    manifestUrl: manifestFile?.webViewLink ?? null,
+  };
+
+  await writeFile(join(EXPORT_ROOT, 'run_summary.json'), JSON.stringify(summary, null, 2) + '\n');
+  process.stdout.write(`FINAL_SUMMARY=${JSON.stringify(summary)}\n`);
+};
+
+main().catch(async (error) => {
+  const summary = { status: 'failed', projectRef: PROJECT_REF, targetDriveFolderId: TARGET_DRIVE_FOLDER_ID || null, exportRoot: ARTIFACT_ONLY ? EXPORT_ROOT : null, error: jsonError(error).message };
+  process.stderr.write(`FINAL_SUMMARY=${JSON.stringify(summary)}\n`);
+  try {
+    await mkdir(TMP_DIR, { recursive: true });
+    await writeFile(join(EXPORT_ROOT, 'run_summary.json'), JSON.stringify(summary, null, 2) + '\n');
+  } catch {}
+  process.exitCode = 1;
+});
diff --git a/migration/supabase-recovery/supabase-rest-export.mjs b/migration/supabase-recovery/supabase-rest-export.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..91ba11a7f40e9bb562b008fcc40cb21aa1991035
--- /dev/null
+++ b/migration/supabase-recovery/supabase-rest-export.mjs
@@ -0,0 +1,182 @@
+import { createHash } from 'node:crypto';
+import { mkdir, open, writeFile } from 'node:fs/promises';
+import { resolve } from 'node:path';
+import { MIGRATION_TABLES, validateMigrationTable } from './neon-migration-manifest.mjs';
+
+const argValue = (name) => {
+  const prefix = `--${name}=`;
+  const match = process.argv.find((arg) => arg.startsWith(prefix));
+  return match ? match.slice(prefix.length) : undefined;
+};
+
+const parseBooleanFlag = (name) => process.argv.includes(`--${name}`);
+
+export const primaryKeyColumns = (table) => {
+  validateMigrationTable(table);
+  if (table === 'external_api_usage_monthly') return ['provider','month_key'];
+  if (table === 'origination_reprocessing_queue') return ['company_id'];
+  if (table === 'microsoft_connections') return ['user_id'];
+  if (table === 'source_health') return ['source_code'];
+  if (table === 'knowledge_learning_runtime_state') return ['singleton'];
+  return ['id'];
+};
+
+export const paginationOrder = (table) =>
+  primaryKeyColumns(table).map((column)=>`${column}.asc`).join(',');
+
+const requiredEnv = (name) => {
+  const value = process.env[name]?.trim();
+  if (!value) throw new Error(`${name} is required`);
+  return value;
+};
+
+export const countFromContentRange = (value) => {
+  if (!value) return null;
+  const slash = value.lastIndexOf('/');
+  if (slash < 0) return null;
+  const raw = value.slice(slash + 1);
+  return /^\d+$/.test(raw) ? Number(raw) : null;
+};
+
+export async function fetchPage({baseUrl,key,table,offset,pageSize,fetchImpl=fetch}) {
+  validateMigrationTable(table);
+  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/rest/v1/${table}`);
+  url.searchParams.set('select','*');
+  url.searchParams.set('order',paginationOrder(table));
+  const response = await fetchImpl(url,{
+    headers:{
+      apikey:key,
+      Authorization:`Bearer ${key}`,
+      Accept:'application/json',
+      Prefer:'count=exact',
+      Range:`${offset}-${offset + pageSize - 1}`,
+      'Range-Unit':'items',
+    },
+    signal:AbortSignal.timeout(60_000),
+  });
+  if (!response.ok && response.status !== 206) {
+    const body = (await response.text()).replace(/\s+/g,' ').slice(0,800);
+    throw new Error(`REST export failed for ${table}: HTTP ${response.status}${body ? ` ${body}` : ''}`);
+  }
+  const rows = await response.json();
+  if (!Array.isArray(rows)) throw new Error(`Unexpected REST payload for ${table}`);
+  const total=countFromContentRange(response.headers.get('content-range'));
+  if (total === null) throw new Error(`Missing exact row count for ${table}; refusing unverified export`);
+  return {rows,total};
+}
+
+export async function probeTable(args) {
+  const page = await fetchPage({...args,offset:0,pageSize:1});
+  return {table:args.table,rowCount:page.total};
+}
+
+export async function exportTable({baseUrl,key,table,outDir,pageSize=1000,fetchImpl=fetch}) {
+  validateMigrationTable(table);
+  const filePath = resolve(outDir,`${table}.ndjson`);
+  const handle = await open(filePath,'w');
+  const hash = createHash('sha256');
+  const keys=primaryKeyColumns(table);
+  const seenPrimaryKeys=new Set();
+  let offset = 0;
+  let rowCount = 0;
+  let expectedTotal = null;
+
+  try {
+    for (;;) {
+      const {rows,total} = await fetchPage({baseUrl,key,table,offset,pageSize,fetchImpl});
+      if (expectedTotal === null) expectedTotal = total;
+      else if (total !== expectedTotal) {
+        throw new Error(`Source count changed during export for ${table}: expected=${expectedTotal} observed=${total}`);
+      }
+      if (!rows.length) break;
+
+      for (const row of rows) {
+        const values=keys.map((keyColumn)=>row[keyColumn]);
+        if (values.some((value)=>value === undefined || value === null)) {
+          throw new Error(`Missing primary key while exporting ${table}`);
+        }
+        const pk=JSON.stringify(values);
+        if (seenPrimaryKeys.has(pk)) {
+          throw new Error(`Duplicate primary key while exporting ${table}; source may have changed during pagination`);
+        }
+        seenPrimaryKeys.add(pk);
+
+        const line = JSON.stringify(row) + '\n';
+        hash.update(line);
+        await handle.write(line);
+        rowCount += 1;
+      }
+
+      offset += rows.length;
+      if (rows.length < pageSize || offset >= expectedTotal) break;
+    }
+  } finally {
+    await handle.close();
+  }
+
+  if (rowCount !== expectedTotal) {
+    throw new Error(`Row-count mismatch for ${table}: exported=${rowCount} expected=${expectedTotal}`);
+  }
+
+  const finalProbe=await probeTable({baseUrl,key,table,fetchImpl});
+  if (finalProbe.rowCount !== rowCount) {
+    throw new Error(`Source count changed during export for ${table}: exported=${rowCount} final=${finalProbe.rowCount}`);
+  }
+
+  return {table,rowCount,sha256:hash.digest('hex'),file:`${table}.ndjson`,primaryKey:keys};
+}
+
+export async function runExport({
+  baseUrl,
+  key,
+  tables=MIGRATION_TABLES,
+  outDir,
+  pageSize=1000,
+  probe=false,
+  fetchImpl=fetch,
+}) {
+  await mkdir(outDir,{recursive:true});
+  const startedAt = new Date().toISOString();
+  const results = [];
+
+  for (const table of tables) {
+    const result = probe
+      ? await probeTable({baseUrl,key,table,fetchImpl})
+      : await exportTable({baseUrl,key,table,outDir,pageSize,fetchImpl});
+    results.push(result);
+    process.stdout.write(`${probe ? 'PROBE' : 'EXPORT'} ${table}: ${result.rowCount} rows\n`);
+  }
+
+  const manifest = {
+    format:'motor-supabase-rest-export-v1',
+    source:'supabase-postgrest',
+    consistency:'ordered_exact_count_with_final_count_check_not_transactional_snapshot',
+    startedAt,
+    completedAt:new Date().toISOString(),
+    probe,
+    pageSize,
+    tables:results,
+  };
+  await writeFile(resolve(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
+  return manifest;
+}
+
+async function main() {
+  const baseUrl = requiredEnv('SUPABASE_URL');
+  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
+  const outDir = resolve(argValue('out') ?? 'tmp/supabase-rest-export');
+  const pageSize = Math.max(1,Math.min(Number(argValue('page-size') ?? 1000),5000));
+  const requested = argValue('tables');
+  const tables = requested
+    ? requested.split(',').map((v)=>validateMigrationTable(v.trim())).filter(Boolean)
+    : MIGRATION_TABLES;
+  const probe = parseBooleanFlag('probe');
+
+  const manifest = await runExport({baseUrl,key,tables,outDir,pageSize,probe});
+  process.stdout.write(`Manifest: ${resolve(outDir,'manifest.json')}\n`);
+  process.stdout.write(`Tables: ${manifest.tables.length}; rows: ${manifest.tables.reduce((n,t)=>n+t.rowCount,0)}\n`);
+}
+
+if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
+  await main();
+}
diff --git a/migration/supabase-recovery/supabase-rest-health-classifier.mjs b/migration/supabase-recovery/supabase-rest-health-classifier.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..08869791af68a0e6185ed7c259161e42c5c6eb80
--- /dev/null
+++ b/migration/supabase-recovery/supabase-rest-health-classifier.mjs
@@ -0,0 +1,75 @@
+import { appendFile } from 'node:fs/promises';
+
+const required = (name) => {
+  const value = process.env[name]?.trim();
+  if (!value) throw new Error(`${name} is required`);
+  return value;
+};
+
+export const classifySupabaseRest = ({status,body,error}) => {
+  const text = String(body ?? '').toLowerCase();
+  const errorText = String(error ?? '').toLowerCase();
+
+  if (status >= 200 && status < 300) return 'reachable';
+  if (status === 401 || status === 403) return 'auth';
+  if (status === 404) return 'missing_table_or_route';
+  if (status === 402 || text.includes('exceed_db_size_quota') || text.includes('db size quota')) return 'quota';
+  if (
+    [500,502,503,504,521,522,523,524].includes(status) &&
+    (text.includes('timeout') || text.includes('connection terminated') || text.includes('connect_timeout'))
+  ) return 'db_timeout';
+  if ([500,502,503,504,521,522,523,524].includes(status)) return 'upstream_5xx';
+  if (errorText.includes('timeout') || errorText.includes('timed out')) return 'network_timeout';
+  if (errorText) return 'network_error';
+  return 'other';
+};
+
+export async function probeSupabaseRest({baseUrl,key,table,fetchImpl=fetch,timeoutMs=20_000}) {
+  if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Invalid table name');
+  const url = new URL(`${baseUrl.replace(/\/+$/,'')}/rest/v1/${table}`);
+  url.searchParams.set('select','id');
+  url.searchParams.set('limit','1');
+
+  try {
+    const response = await fetchImpl(url,{
+      headers:{
+        apikey:key,
+        Authorization:`Bearer ${key}`,
+        Accept:'application/json',
+      },
+      signal:AbortSignal.timeout(timeoutMs),
+    });
+    const body = await response.text();
+    return {
+      table,
+      class:classifySupabaseRest({status:response.status,body}),
+      status:response.status,
+    };
+  } catch (error) {
+    return {
+      table,
+      class:classifySupabaseRest({status:0,error:error instanceof Error ? error.message : String(error)}),
+      status:0,
+    };
+  }
+}
+
+async function main() {
+  const table = process.argv.find((arg)=>arg.startsWith('--table='))?.slice('--table='.length);
+  if (!table) throw new Error('--table is required');
+  const result = await probeSupabaseRest({
+    baseUrl:required('SUPABASE_URL'),
+    key:required('SUPABASE_SERVICE_ROLE_KEY'),
+    table,
+  });
+
+  process.stdout.write(`Supabase REST ${result.table}: ${result.class} (HTTP ${result.status || 'network'})\n`);
+
+  if (process.env.GITHUB_OUTPUT) {
+    await appendFile(process.env.GITHUB_OUTPUT,`class=${result.class}\nhttp_status=${result.status}\n`);
+  }
+}
+
+if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
+  await main();
+}
diff --git a/migration/supabase-recovery/supabase-rest-health-classifier.test.mjs b/migration/supabase-recovery/supabase-rest-health-classifier.test.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..444d008811234a7705ab814fde514a6776970225
--- /dev/null
+++ b/migration/supabase-recovery/supabase-rest-health-classifier.test.mjs
@@ -0,0 +1,27 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { classifySupabaseRest, probeSupabaseRest } from './supabase-rest-health-classifier.mjs';
+
+test('classifies known Supabase failure modes',()=>{
+  assert.equal(classifySupabaseRest({status:200,body:'[]'}),'reachable');
+  assert.equal(classifySupabaseRest({status:401,body:''}),'auth');
+  assert.equal(classifySupabaseRest({status:404,body:''}),'missing_table_or_route');
+  assert.equal(classifySupabaseRest({status:402,body:'exceed_db_size_quota'}),'quota');
+  assert.equal(classifySupabaseRest({status:500,body:'Connection terminated due to connection timeout'}),'db_timeout');
+  assert.equal(classifySupabaseRest({status:503,body:'upstream unavailable'}),'upstream_5xx');
+  assert.equal(classifySupabaseRest({status:0,error:'operation timed out'}),'network_timeout');
+  assert.equal(classifySupabaseRest({status:0,error:'socket reset'}),'network_error');
+});
+
+test('probe never exposes row payload and returns only status class',async()=>{
+  const fetchImpl=async()=>new Response(JSON.stringify([{id:'secret-id',name:'secret-name'}]),{status:200});
+  const result=await probeSupabaseRest({
+    baseUrl:'https://example.supabase.co',
+    key:'secret-key',
+    table:'companies',
+    fetchImpl,
+  });
+  assert.deepEqual(result,{table:'companies',class:'reachable',status:200});
+  assert.ok(!JSON.stringify(result).includes('secret-id'));
+  assert.ok(!JSON.stringify(result).includes('secret-key'));
+});
diff --git a/package.json b/package.json
index 06dafce203226327ba639e1bbb63aef377401a8c..16b08ad40cb91c9dd185cd2e7f09073e17880c24 100644
--- a/package.json
+++ b/package.json
@@ -48,7 +48,9 @@
     "typecheck": "npm -C backend run typecheck && npm -C frontend run typecheck && npm run typecheck:serverless",
     "test:database-growth-guard": "node --test scripts/database-growth-circuit-breaker-contract.test.mjs",
     "test:neon-growth-guard": "node --test scripts/neon-database-growth-circuit-breaker-contract.test.mjs",
-    "test:no-supabase-runtime": "node --test scripts/no-supabase-runtime-contract.test.mjs"
+    "test:no-supabase-runtime": "node --test scripts/no-supabase-runtime-contract.test.mjs",
+    "test:neon-migration": "node --test scripts/neon-migration-plan-contract.test.mjs scripts/neon-runtime-contract.test.mjs scripts/check-neon-storage-budget.test.mjs scripts/run-neon-scheduled-jobs.test.mjs",
+    "test:legacy-recovery": "node --test migration/supabase-recovery/*.test.mjs"
   },
   "devDependencies": {
     "tsx": "4.19.3"
diff --git a/scripts/no-supabase-runtime-contract.test.mjs b/scripts/no-supabase-runtime-contract.test.mjs
index 106e0d07ac0ff7cb786b3d17750131bb0515484e..eac119a827aecede42545b5479ce2e21a4d24ff6 100644
--- a/scripts/no-supabase-runtime-contract.test.mjs
+++ b/scripts/no-supabase-runtime-contract.test.mjs
@@ -12,6 +12,12 @@ const roots = [
   '.github/workflows',
 ];
 const standalone = ['package.json', 'package-lock.json', '.env.example', 'vercel.json'];
+// Temporary legacy-data recovery (manual dispatch only). Delete together with
+// migration/supabase-recovery/ once the import into Neon is validated.
+const RECOVERY_ALLOWLIST = new Set([
+  '.github/workflows/legacy-data-recovery.yml',
+  'scripts/no-supabase-runtime-contract.test.mjs',
+]);
 const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.sh']);
 
 const files = [];
@@ -41,7 +47,7 @@ const forbidden = [
 test('active runtime contains no Supabase dependency or credentials', () => {
   const violations = [];
   for (const file of files) {
-    if (file.endsWith('no-supabase-runtime-contract.test.mjs')) continue;
+    if (RECOVERY_ALLOWLIST.has(file.split(path.sep).join('/'))) continue;
     const content = readFileSync(file, 'utf8');
     for (const pattern of forbidden) {
       pattern.lastIndex = 0;
@@ -54,3 +60,15 @@ test('active runtime contains no Supabase dependency or credentials', () => {
 test('legacy Supabase runtime directory is absent', () => {
   assert.equal(existsSync('supabase'), false);
 });
+
+test('legacy recovery stays quarantined and manual-only', () => {
+  const workflow = readFileSync('.github/workflows/legacy-data-recovery.yml', 'utf8');
+  assert.match(workflow, /on:\n  workflow_dispatch:\n/);
+  assert.doesNotMatch(workflow, /schedule:|push:|pull_request:/);
+  assert.match(workflow, /node migration\/supabase-recovery\//);
+  for (const root of ['api', 'backend/src', 'frontend/src', 'serverless', 'scripts']) {
+    for (const file of files.filter((entry) => entry.startsWith(root) && !RECOVERY_ALLOWLIST.has(entry))) {
+      assert.doesNotMatch(readFileSync(file, 'utf8'), /migration\/supabase-recovery/, `${file} must not import the recovery tooling`);
+    }
+  }
+});
diff --git a/scripts/smoke/vercel-health-smoke.mjs b/scripts/smoke/vercel-health-smoke.mjs
index ab7a5c3ae3f660215bfd9d0492080173507274da..8a5157ccab1b18165be4e90c38e70c8be9753d00 100644
--- a/scripts/smoke/vercel-health-smoke.mjs
+++ b/scripts/smoke/vercel-health-smoke.mjs
@@ -23,7 +23,7 @@ function sleep(ms) {
 function assertPayload(payload) {
   if (!payload || typeof payload !== 'object') throw new Error('Health payload is not JSON object.');
   if (payload.status !== 'real') throw new Error(`Expected status=real, got ${payload.status}.`);
-  if (!(payload.captureRuntime?.canRunAgainstDatabase ?? payload.captureRuntime?.canRunAgainstSupabase)) throw new Error('Runtime is not connected to the database.');
+  if (!payload.captureRuntime?.canRunAgainstDatabase) throw new Error('Runtime is not connected to the database.');
   if (!payload.captureRuntime?.coreTablesAccessible) throw new Error('Core tables are not accessible.');
   if (expectedDataProvider && payload.env?.dataProvider !== expectedDataProvider) {
     throw new Error(`Expected dataProvider=${expectedDataProvider}, got ${payload.env?.dataProvider || 'unknown'}.`);
`````

```bash
git apply --index --whitespace=nowarn /tmp/tarefa-17.patch
```

**Verificar:**

```bash
npm run typecheck && npm run test:no-supabase-runtime && npm run test:neon-migration && npm run test:legacy-recovery
```

**Commit:**

```bash
git add -A
git commit -F - <<'MSG'
chore(neon): drop Supabase naming from runtime; quarantine legacy data recovery

- Runtime code and UI no longer mention the legacy provider (client type aliases,
  error messages, status pills/notes); canRunAgainstSupabase alias removed.
- 'supabase-discovery-universe' kept on purpose: persisted lineage identifier.
- migration/supabase-recovery/: export (REST/full), health classifier and Neon
  import generator restored from main (PR #528 had deleted them while the Neon
  database is still empty); manifest extended to all 98 runtime tables.
- .github/workflows/legacy-data-recovery.yml: manual-only, allow-listed in the
  no-supabase contract, which now also proves the runtime never imports it.
- CI runs the Neon migration/runtime contracts and the recovery tooling tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VzU8F49ycNS4zyFZ2cDYtK
MSG
```


---

## 5. Verificação final (tudo deve passar)

```bash
npm ci
npm run typecheck && npm run lint && npm run build
npm run test:backend && npm run test:serverless
npm run test:no-supabase-runtime && npm run test:neon-migration && npm run test:legacy-recovery
for s in $(node -e 'const p=require("./package.json");for(const k of Object.keys(p.scripts)) if(k.startsWith("test:")&&!["test:backend","test:auth-production-smoke"].includes(k)) console.log(k)'); do npm run -s $s >/dev/null 2>&1 || echo "FALHOU: $s"; done
npm run audit:production           # esperado: found 0 vulnerabilities
git diff --shortstat origin/chore/neon-db-cutover   # esperado: 216 files changed, 6601 insertions(+), 5923 deletions(-)
```

Validação de banco feita nesta revisão (réplica PostgreSQL 16 + pgvector com a **mesma assinatura de colunas da
produção**, dono `neondb_owner` não-superuser, dublê do `pg_session_jwt`):

- plano completo (199 arquivos) aplicado do zero sobre a cópia da produção; segunda execução: 199 `skip`;
- `plpgsql_check` em todas as funções PL/pgSQL: 0 erros;
- `scripts/neon-runtime-parity-check.mjs`: `ready: true` (na produção atual: faltam 39 relações e 60 funções);
- RPCs do runtime chamadas de verdade (service role e usuário autenticado): todas OK;
- pipeline do Agentetome ponta a ponta (pacote novo → bronze → silver → Market Map → reexecução idempotente →
  agendador → status `real` sem bloqueios).

## 6. Aplicar no Neon (decisão do Marcelo — não automático)

1. Criar um **branch/snapshot** do Neon de produção (rollback instantâneo).
2. Rodar o plano **no branch**: `MOTOR_NEON_DATABASE_URL=<url do branch> node scripts/apply-neon-runtime-migrations.mjs`.
3. `MOTOR_NEON_DATABASE_URL=<url do branch> node scripts/neon-runtime-parity-check.mjs` → `"ready": true`.
4. Repetir 2–3 na produção (as 8 migrações já registradas são puladas). O plano não apaga tabelas; traz do
   histórico algumas limpezas de linhas derivadas (`company_patterns`, `company_signals`) e um rename guardado de
   coluna em `capital_market_resource_checkpoints` — inócuos com o banco vazio. Rodar **antes** do import de dados.
5. Só então fazer o deploy na Vercel.

## 7. Configuração (Vercel e GitHub)

| Onde | Variável | Uso |
|---|---|---|
| Vercel | `MOTOR_NEON_DATABASE_URL` (ou `DATABASE_URL`) | dados |
| Vercel | `NEON_AUTH_BASE_URL` / `NEON_AUTH_JWKS_URL` | auth (já usado pelo PR #528) |
| Vercel | `CRON_SECRET` | jobs agendados e cron |
| Vercel | `AGENTETOME_API_KEY` | **novo local da chave** (antes ficava no Vault do Supabase) |
| GitHub Actions | `MOTOR_NEON_DATABASE_URL`, `CRON_SECRET` | `neon-scheduled-jobs.yml` e ingestões |
| GitHub Actions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **só** `legacy-data-recovery.yml`; apagar após o import |

## 8. Recuperação dos dados do Supabase

Bloqueada por cota (HTTP 402). Passo a passo em `migration/supabase-recovery/README.md` (tarefa 17): liberar o
projeto Supabase temporariamente → schema completo no Neon → export → gerar SQL de import → importar num branch do
Neon → validar contagens → produção → apagar a pasta, o workflow e os secrets.

## 9. Pendências e riscos conhecidos (não resolvidos aqui)

- **Schema legado reconstruído do repositório**: o Supabase está inacessível, então objetos aplicados “à mão” no
  banco antigo foram reconstruídos a partir do código e dos espelhos de linhagem em branches. Rode o parity check e
  o smoke depois do import de dados.
- **Arquivo histórico (Excel/Storage) não portado**: dependia de Supabase Storage + pg_net + pg_cron. O Neon tem só
  os metadados (`20261005_neon_archive_metadata.sql`); o export para Drive precisa de um job próprio.
- **Import de `source_catalog`**: os seeds do Neon usam id determinístico; casar por `metadata->>'code'` no import.
- **`user_profiles`**: ids precisam ser os do Neon Auth (religar perfis antigos).
- **Agentetome**: o ZIP bruto não é mais guardado (só hash, contagens e linhas em bronze); para guardar, usar Vercel Blob.
- **GitHub Actions**: `neon-scheduled-jobs.yml` roda a cada 5 min; se o repositório for privado, conferir a cota de minutos.
- Migrações históricas não reaplicadas: lista com motivo em `scripts/lib/neon-migration-plan.mjs` (`NOT_REPLAYED`).