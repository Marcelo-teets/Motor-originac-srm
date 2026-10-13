**Plano completo de execução e aceite 100% do MVP:** [`PLANO_EXECUCAO_ATE_ACEITE_100_2026-10-13.md`](PLANO_EXECUCAO_ATE_ACEITE_100_2026-10-13.md); para a leitura institucional, use este plano junto aos gates M0–M5 abaixo.

# Motor Originação SRM — Plano de ativação funcional V5

**Corte de evidências:** 13/10/2026 · **Fonte de verdade do código:** `Marcelo-teets/Motor-originac-srm/main`.
**Baseline comprovada:** `main` e Vercel READY em `01590d987ffb5e39be13deb4659140c51fdc3bf8`, GitHub Actions release `38405518782` `success`, Neon `steep-poetry-38942951/production`, guard `normal`, `79.020.032` bytes, 6 branches.

## 1. Estado observado e o que não está pronto

| Indicador (Neon prod) | Confirmado | Leitura |
| --- | ---: | --- |
| `discovered_company_candidates` | 50 (48 captured / 2 promoted) | Identidade não significa fit de originação |
| `companies` | 2 | Universo qualificado insuficiente |
| `monitoring_outputs` / `company_signals` | 211 / 103 | Captação de sinais funciona em parte |
| FRE `employee_count` | 100 métricas | 0 snapshots ligados a empresa |
| FIDC `fidc_assignor_identity_queue_v5` | 85 CNPJs válidos / 91 vínculos | 85 ainda sem razão social verificada e sem vínculo no Company Master |
| `qualification_snapshots` / `company_patterns` | 0 / 0 | Pipeline analítico não materializado |
| `score_snapshots` / `lead_score_snapshots` / `ranking_v2` | 0 / 0 / 0 | Métrica-norte 0 |
| `pipeline` / `thesis_outputs` | 0 / 0 | Originação comercial não operacional |
| `user_profiles` / `vector_documents` | 0 / 0 | Bootstrap Auth (D-07) e RAG pendentes |

Evidências: canário CVM `38403931727` (100 linhas FRE + 100 FIDC, `success`); PRs #583/#584 (view de identidade e deploy oficial); inspeções SQL de 13/10. **Não contabilizar CNPJs sem nome nem dados mock como empresas elegíveis.**

## 2. Gates de ativação (não reabrir arquitetura)

### M0 · Acesso real e governança (F0-06, D-07)
**Owner:** responsável do projeto + execução de engenharia, com Marcelo presente no fluxo de autenticação.
- Neon Managed Auth: registrar a conta administrativa real, validar `neon_auth.user` e `user_profiles`, roles, RLS e sessão persistente.
- Remover usuário residual de smoke apenas no procedimento documentado e após confirmação de identidade, sem derrubar sessões indevidas.
- Testar Dashboard, Leads, Company Detail, Search Profiles e rotas protegidas com usuário real.
**Gate:** login/logout, permissão e roundtrip de dado real; `user_profiles >= 1` **sem** conta sintética substituindo a humana.
**Bloqueio externo:** janela com Marcelo presente. Não iniciar bootstrap automático à revelia.

### M1 · Resolver identidade FIDC e candidatos (F2-02/F2-04)
**Owner:** dados + entidade + revisão comercial.
- Consumir `fidc_assignor_identity_queue_v5` sem duplicar bronze; enriquecer os **85 CNPJs** por fonte cadastral pública/Receita via connector existente; registrar razão social, situação, data, URL e confiança.
- Se a CVM cadastro de companhias abertas não trouxer CNPJ, usar BrasilAPI como consulta de registro (distinguindo provedor intermediário de fonte original). Aplicar cache/idempotência, cota e retry/backoff. Não inventar razão social nem vincular homônimos.
- Enviar revisões para a fila oficial; excluir fundos, gestoras, administradoras, bancos e outras entidades fora do ICP comercial. **Revisão humana obrigatória antes de promover `companies`.**
**Gate:** >=50/85 CNPJs com nome legal verificável + origem, status de resolução e SLA de revisão; nenhum CNPJ com checksum inválido e nenhuma promoção automática sem prova.

### M2 · Elegibilidade financeira e ICP (F2-01/F2-03)
**Owner:** crédito estruturado + dados.
- `company_source_metric_snapshots.employee_count` deve ser gerado por matching *exato* de CNPJ: primeiro CVM FRE, depois enriquecimento firmográfico para empresas fechadas que passaram pela revisão, último recurso override manual auditado.
- Aplicar score e filtros: crédito core/produto, recebíveis e elegibilidade, dívida estruturada/FIDC, estrutura de capital/funding gap, fit FIDC/DCM, timing, sinal explícito/implícito.
- Não misturar veiculo de mercado com emissor operacional; CNPJ válido sozinho **não comprova** recebível nem elegibilidade.
**Gate:** pelo menos 5 empresas reais com sinais, evidências e verificação dos critérios (inclusive headcount >=50, salvo exceção formal auditada). Zero mock como dado primário.

### M3 · Materialização comercial E2E (F2-03/F3/F4)
**Owner:** backend, produto e originação.
- Fluxo canônico `Search Profiles → Sources → Monitoring Outputs → Signals → Enrichment → Qualification → Patterns → Score/Lead Score → Thesis → Ranking → Pipeline`.
- Processar jobs existentes e conferir cada tabela, `rationale`, padrão (`growth without funding`, `capital mismatch`, `receivables strong/funding weak`, etc.), evidência, estrutura proposta, por quê agora e próxima ação.
- Frontend: Dashboard, Company Detail, Leads e Search Profiles sem dependência silenciosa de mock. Exibir fallback explicitamente se necessário, nunca como registro real.
**Gate F1 (MVP):** >=5 **empresas reais com sinal, fator e score**, tese, proprietário, próxima ação e data; ranking e pipeline acessíveis via sessão autenticada. **Gate F2:** >=20; **F4:** >=60.

### M4 · Operação contínua sob orçamento Neon (F1-01 a F1-06)
**Owner:** plataforma + observabilidade.
- Revalidar estados dos workflows antes de habilitar. O contrato de V5 indica que várias rotinas estavam `disabled_manually`; **estado atual de todas elas ainda não revalidado por API nesta auditoria**, portanto não afirmar que estão ativas.
- Onda A: captura + discovery + capital-market-ingestion por dataset, FRE e FIDC em execuções separadas, inicialmente 100–1000 linhas; `dataset=all` proibido.
- Onda B somente após 3 dias verdes na A; estabilidade por 7 dias para aceite. Proteção: `check-neon-storage-budget.mjs` e `database_growth_guard_state` em `normal` antes das escritas.
- Atualizar e testar painel de freshness/erros/linhagem e limites de ingestão; custo em bytes por registro útil.
**Gate:** 7 dias de execuções saudáveis + política de guard e branches < 9, evidências de execução, persistência, auditoria e smoke.

### M5 · Aceite funcional completo (MVP e roadmap posterior)
**Owner:** Marcelo (aceite comercial) + QA.
- Demo usando somente registros reais: perfil → evento e sinal → qualificação → padrão → score → tese funding → ranking → avanço pipeline → tarefa/owner.
- Assinatura de aceite por módulo com prints/URLs, SQL de evidência, smoke de Auth, métricas F1/F2 e bugs regressivos fechados.
- `Paperclip`, embeddings/RAG, Copilot e automação de intro são pós-MVP, não motivo para falsificar ou atrasar a métrica-norte mínima.
- **100% funcional do MVP** significa todos os gates anteriores, não apenas deploy READY. Disponibilidade integral da visão institucional de longo prazo é roadmap posterior.

## 3. Modelo de PR, deploy e rollback

Uma PR por objetivo, sempre a partir do HEAD atualizado da `main`, sem stack paralela. Fluxo de release:
1. PR com diff pequeno, testes backend/serverless e contrato de fonte; CI + Neon Runtime Parity obrigatórios quando há migration.
2. Revisão da segurança: CNPJ, RLS, checksum, origem, idempotência, taxa/cota, não promoção indevida.
3. Merge apenas com CI verde, sem conflito, preservando produção e backup.
4. Mudanças em `db/neon/*.sql` registradas em `scripts/lib/neon-migration-plan.mjs` e allowlist `scripts/lib/neon-v5-release-migration-gate.mjs`.
5. Release somente pelo gatilho versionado `.github/deploy-requests/motor-production.txt`, PR revisada → merge → `.github/workflows/vercel-production-deploy.yml`; jamais deploy Vercel direto.
6. Verificar `main SHA = deployment READY SHA`, migrações, parity, Neon guard `normal`, runtime health, Auth smoke e tabelas de negócio.
7. Falha: **parar o rollout**, auditar run/job, corrigir em PR nova, não mascarar `failed` e não declarar 100%. Backup `backup/production-20261008` não pode ser excluído por limpeza de previews.

## 4. Ordem de execução e dependências

| Ordem | PR/atividade | Depende de | Evidência requerida |
| --- | --- | --- | --- |
| 1 | FIDC CNPJ → razão social verificada + fila auditável | view #583, conector cadastral existente | nomes verificados >=50, 0 promoções sem revisão |
| 2 | Bootstrap Auth D-07 com Marcelo | janela humana | login real + `user_profiles >=1` + RLS |
| 3 | Vínculo FRE e firmográfico aos candidatos revisados | PR 1 e revisão ICP | snapshots `employee_count`, exceções registradas |
| 4 | Reativação seletiva da Onda A | guard `normal`; PRs de fonte | dados úteis e 3 dias verdes |
| 5 | Qualificação/patterns/score/ranking E2E | 3 e 4 | >=5 empresas com tese + rationale + ações |
| 6 | Ajustar Dashboard/Company Detail/Leads e Pipeline | 2 e 5 | navegação autenticada sem mocks enganadores |
| 7 | Onda B + observabilidade | 3 dias verdes em A | freshness, taxa de erro, budget por fonte |
| 8 | Aceite MVP | 7 dias verdes + 5 companies com score | checklist QA assinado + PRs/deploys referenciados |

**Não ativar ingestão ampla ou criar snapshots artificiais apenas para alcançar metas.** Toda contagem entregue precisa de consulta ao Neon após rollout real.
