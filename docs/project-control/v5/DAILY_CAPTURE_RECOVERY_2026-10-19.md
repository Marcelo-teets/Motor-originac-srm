# Motor V5 — Recuperação diária de captura no runtime existente

**Incidente observado em 19/10/2026:** no Neon, `source_connector_runs` contém 404 tentativas de captura diretas, todas datadas de 08–09/10. Entre os 100 eventos GitHub Actions de `event=schedule` mais recentes (desde 11/10), somente Neon Scheduled Jobs, Neon Free Budget Guard e Vercel Health Smoke apareceram. O arquivo `capture.yml` possuía cron, mas isso não comprova que recebeu um único disparo efetivo.

## Entrega
Nova *rede de segurança* `.github/workflows/capture-daily-recovery.yml`, **sem stack paralela**: usa o `scripts/capture/bounded-capture-fanout.sh` e `run-bounded-capture-batch.ts` já existentes, o mesmo Neon e a mesma governança de storage.

- **Cadência:** diariamente, 13h25 UTC, com `workflow_dispatch` para operação e `push` da própria configuração para primeira validação.
- **Idempotência de disparo:** `should-run-daily-recovery.mjs` consulta o último `source_connector_runs` do tipo `cron` e só chama o runtime se não houver execução nos últimos **20h**. Não considera o status como evidência de sucesso.
- **Limites:** até 8 alvos, 1 worker, cadence `daily`, fetch externo com timeout do executor existente.
- **Segurança:** recusa conexão que não seja Neon; carrega conexão do vault canônico Vercel, aplica `check-neon-storage-budget.mjs` ANTES da captura e não roda se o guard bloquear.
- **Auditoria:** após executar o runtime, exige pelo menos um `source_connector_runs` com `metadata.release='motor-v5-daily-recovery'` criado nos últimos 45 minutos. Sem registro real, o job falha; não fabrica evidência de execução.
- **QA:** testado por `scripts/capture/should-run-daily-recovery.test.mjs` dentro do CI V5, mais validação de PR do workflow.

## Critérios de aceite do sistema
- **Este job não significa sete dias saudáveis**. Um dia só pode contar com run real, status e fonte comprovados; se os alvos falharem, o workflow deve ser vermelho e a equipe precisa investigar as fontes.
- Sem usuário real administrativo Auth D-07 não existe assinatura válida para decisões comerciais, apesar de o backend e a migration estarem em produção.
- O catálogo possui **106 fontes**, apenas 14 com schedule cadastrado na view de cobertura. As 92 demais não viram automaticamente workloads; requerem priorização e viabilidade individual para evitar custo e ruído.
- Prevenir duplicação com a captura `capture.yml`: recovery não executa se houve cron registrado há menos de 20 horas. O restante da captura e das pesquisas de perfis é preservado.
- Não criar qualquer empresa, parecer humano, score ou funding gap por efeito do cron.

**Próximo passo:** acompanhar sete dias efetivamente decorridos; registrar diariamente contagem/estado de runs e bloqueios, reparar credenciais dos agendamentos ainda não executados e ativar D-07 na presença do administrador.
