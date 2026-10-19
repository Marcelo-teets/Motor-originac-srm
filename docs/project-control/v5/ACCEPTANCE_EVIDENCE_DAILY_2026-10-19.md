# Motor V5 — Aceite operacional com evidências reais (não uma declaração de conclusão)

**Data:** 19/10/2026 · **Escopo:** originação Brasil-only, crédito estruturado e DCM. **Fonte:** `origination_project_brain_master.txt` e banco Neon vigente.

## Problema de produção comprovado

Na consulta ao Neon em 19/10/2026:
- 56 candidatos na descoberta, porém 0 administradores ativos (`user_profiles` god_mode), 0 revisões comerciais humanas FIDC e 0 empresas com cadeia Gold completa;
- `source_connector_runs` registra 404 execuções em somente dois dias (08 e 09/10). Esses registros históricos **não provam sete dias consecutivos saudáveis**;
- o `monitoring_outputs` possui dados capturados em outras datas (08, 09, 12, 19/10), mas um output não é prova de execução de conector com sucesso naquele dia.

## Entrega

`scripts/v5-mvp-acceptance-evidence.mjs`: lê somente a base Neon de produção e avalia quatro gates sem inventar sucesso:

1. **D-07**: ao menos um administrador `god_mode` ativo com login humano real.
2. **A2**: ao menos um parecer comercial humano auditado em `fidc_assignor_human_reviews_v5`. Uma linha de auditoria não é aprovação de crédito.
3. **A3–A5**: ao menos cinco **empresas distintas** com revisão de crédito status `approved` e dados persistidos de qualification, patterns, score, lead-score, thesis, ranking e pipeline — sem confundir `discovered_company_candidates` com leads qualificados.
4. **A7**: sete **dias completos** anteriores à consulta, no fuso São Paulo, cada um com connector run `completed`, pelo menos um output escrito e um `monitoring_outputs` capturado. O dia de hoje é excluído por ainda estar parcial.

O retorno será `blocked` enquanto alguma evidência faltar. O estado positivo é apenas `awaiting_final_human_signoff`: também não equivale automaticamente a aceite institucional 100%.

## Execução diária operacional

`.github/workflows/v5-daily-acceptance-evidence.yml` executa 1 vez/dia, 13:13 UTC (10:13 em São Paulo), e manualmente via `workflow_dispatch`. Usa os segredos **já vinculados ao ambiente production** para baixar do Vercel a URL canônica da base Neon, sem expor credenciais. Somente transação SQL `READ ONLY`, resumo no GitHub Actions e artefato JSON sem nomes, e-mails, CNPJs ou dados privados.

O job **não** cria atividades ou dados simulados, não reclassifica ninguém como aprovado, não mexe nas configurações de Auth ou armazenamento. Se a conexão falhar, o job falha. Quando os gates estiverem bloqueados, o job registra advertência e mantém a evidência.

Testes em `scripts/v5-mvp-acceptance-evidence.test.mjs` rodarão no CI da main e no workflow diário.

## Próximas ações que dependem de evidência externa

- **D-07**: proprietário presente no RB-03 para criar o primeiro administrador sem expor janela de privilégio máximo; o assistente não cria usuário fictício.
- **A2/A3**: auditoria humana de cinco casos financeiros e reconciliação por CNPJ credora, plataforma, IP, cessionário, originador, lastro e funding gap. Candidatos da issue #619 não são automaticamente leads Gold.
- **A5**: persistência real nos módulos existentes, com source lineage, scores explicáveis e owner.
- **A7**: reativar conectores prioritários pelo workflow já existente, confirmar execuções diárias reais durante 7 dias completos e registrar falhas quando não capturarem.
- **A8**: aceite humano final com teste ponta a ponta autenticado após os gates estarem verdes.

**Não usar o status CI/artefato do diário como sinônimo de produção comercial concluída.**
