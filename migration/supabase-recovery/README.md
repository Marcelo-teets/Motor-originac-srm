# Recuperação de dados legados (Supabase → Neon) — TEMPORÁRIO

Esta pasta é a **única** parte do repositório que ainda conversa com o Supabase.
Ela existe só para tirar os dados do projeto legado `hdghpmssudrqhsbvrdyt` e
carregá-los no Neon (`steep-poetry-38942951`). O runtime (api/, serverless/,
backend/, frontend/, scripts/) não importa nada daqui e o contrato
`scripts/no-supabase-runtime-contract.test.mjs` impede que volte a importar.

> **Apagar** esta pasta e `.github/workflows/legacy-data-recovery.yml` assim que o
> import no Neon for validado (contagens por tabela batendo com o `manifest.json`).

## Situação em 2026-10-06

- O projeto Supabase está `ACTIVE_HEALTHY` no control plane, mas o banco **recusa
  conexões** (timeout) e a REST devolve **HTTP 402** (`exceed_db_size_quota` +
  `exceed_storage_size_quota`, organização no plano Free). Nenhuma linha foi exportada
  na tentativa de 2026-10-01 (planilha *00 - Status da Extração Supabase - 2026-10-01*).
- O Neon de produção está com o schema parcial e **sem dados de negócio** (só seeds).
- Pré-requisito para recuperar: liberar o projeto Supabase (upgrade temporário do plano
  ou redução de uso aprovada pelo suporte) até o export terminar.

## Passo a passo

1. **Schema no Neon primeiro** — aplicar o plano completo (`node scripts/apply-neon-runtime-migrations.mjs`)
   e confirmar `node scripts/neon-runtime-parity-check.mjs` → `"ready": true`.
2. **Export** (com o Supabase liberado):
   - via GitHub Actions: *Legacy Data Recovery (Supabase export)* → artefato
     `supabase-full-export-<run_id>` (CSV lossless + manifestos), ou
   - local, só as tabelas do runtime:
     ```bash
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
       node migration/supabase-recovery/supabase-rest-export.mjs --out=tmp/supabase-rest-export
     ```
3. **Gerar o SQL de import** (não commitar o resultado):
   ```bash
   node migration/supabase-recovery/neon-json-import-sql.mjs \
     --bundle=tmp/supabase-rest-export --out=tmp/neon-import.sql
   ```
4. **Importar num branch do Neon** (nunca direto em produção), validar contagens e só
   então promover/repetir em produção com `--upsert` para o delta final.
5. **Ajustes pós-import obrigatórios**
   - `source_catalog`: o Neon já tem linhas de seed com id determinístico
     (`private.legacy_source_uuid(code)`); o Supabase tem ids aleatórios para o mesmo
     `metadata->>'code'`. Importar `source_catalog` por `metadata->>'code'` (ou apagar
     os seeds duplicados antes) para não violar `source_catalog_metadata_code_uidx`.
   - `user_profiles`: os ids precisam ser os ids do **Neon Auth**; perfis do Supabase
     Auth só valem depois de religados (`auth_identity_links`).
   - rodar `select public.refresh_ranking_v2();` e o job `reprocessing` do workflow
     *Neon Scheduled Jobs* para recalcular derivados.
6. Apagar esta pasta, o workflow e os secrets `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `neon-migration-manifest.mjs` | Lista ordenada (pais antes de filhos) das tabelas a exportar/importar |
| `supabase-rest-export.mjs` | Export paginado (ordem por PK, contagem exata) em NDJSON + `manifest.json` |
| `supabase-full-drive-export.mjs` | Export completo (CSV lossless, Google Sheets, Auth, Storage) |
| `supabase-rest-health-classifier.mjs` | Classifica a saúde da REST (402/401/404/timeout) |
| `neon-json-import-sql.mjs` | Gera SQL idempotente de carga no Neon a partir do bundle |
| `*.test.mjs` | `node --test migration/supabase-recovery/*.test.mjs` |
