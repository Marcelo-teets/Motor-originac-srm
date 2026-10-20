# Recuperação de dados legados (Supabase → Neon) — TEMPORÁRIO

> **Atualização auditada em 20/10/2026 — prevalece sobre o estado de 06/10 abaixo:**
> O Supabase institucional `hdghpmssudrqhsbvrdyt` voltou a aceitar consultas
> SQL de leitura: 74 empresas, 1.426 candidatas, 27.448 monitoring outputs,
> 1.090 qualifications, 5.319 scores e 15 registros de pipeline.
> O Neon em produção (2 empresas, 318 outputs) tem um estado e esquema distintos.
> **Não execute o importador legado nem apague esta pasta:** o destino final
> prescrito pelo cérebro mestre é Supabase, e o runtime temporário está no Neon.
> A decisão de cutover/importação requer reconciliação, backup, versão, rollback,
> teste em branch isolado e aprovação humana. Os passos Supabase→Neon abaixo
> documentam um procedimento histórico, não uma autorização de execução.
>
> **Gate de dependências históricas (read-only, 20/10/2026):**
> `node migration/supabase-recovery/lineage-readiness-preflight.mjs`
> utiliza as mesmas duas URLs autorizadas do inventário e não escreve em
> nenhum banco. Ele contabiliza as referências `company_id` e `source_id`
> de monitoring outputs, signals, connector runs, qualification, scores e
> pipeline, avaliando cobertura teórica por CNPJ e `metadata.code`, sem
> imprimir identificadores, CNPJs, nomes, e-mails ou payloads.
> Medição diretamente por SQL de leitura: 19.282/27.448 outputs, 12.162/22.515
> signals com fonte e 5.041/6.242 connector runs com fonte têm **código**
> presente no catálogo Neon; isto **não prova** correspondência de UUID ou
> qualidade e não habilita importação. As demais referências exigem
> reconciliação de catálogo e relacionamentos antes de qualquer restauração.
> Resultado sempre `importAllowed=false`; código de saída 2 indica que
> faltam mapeamentos, backups, testes de FKs e aceite humano. Não usar este
> relatório como `manifest` de importação ou prova de elegibilidade DCM.
>
> **Compatibilidade CNPJ alfanumérico (Receita Federal, 31/07/2026):**
> inscrições novas podem utilizar letras nas primeiras 12 posições e dois
> dígitos verificadores numéricos. A chave de reconciliação agora usa uppercase
> e cálculo modulo-11 com valores ASCII menos 48, preservando o legado numérico.
> Exemplos oficiais verificáveis: `00.000.000/E08G-12` e
> `12.ABC.345/01DE-35`. Um checksum válido **não substitui** identidade
> legal comprovada nem autorização de promoção ou migração. A verificação de
> igualdade dos bancos nunca copia dados ou aprova automaticamente o cutover.
> Fonte normativa: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj
>
> **Auditoria de identidade somente leitura:** execute
> `node migration/supabase-recovery/identity-reconciliation-preflight.mjs`
> com `MOTOR_SUPABASE_AUDIT_DATABASE_URL` e `MOTOR_NEON_DATABASE_URL`
> fornecidas pelo cofre autorizado. O comando retorna **apenas contagens** e
> código 2 enquanto a importação estiver bloqueada; nunca imprime CNPJs ou IDs.
> Confirmado em SQL read-only: zero CNPJs ou UUIDs de empresas coincidentes
> entre os bancos; 78 códigos de `source_catalog` coincidentes, **zero UUIDs**
> coincidentes. Portanto, é obrigatório remapear source IDs e suas dependências
> antes de qualquer migração, sem duplicar fontes por UUID.
>

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
