# Motor V5 — Recuperação deve comprovar dados úteis, não apenas execução

**Data:** 19/10/2026. **Fonte de verdade:** Neon production, fonte canônica GitHub main e cérebro mestre.

## Problema identificado
A recuperação diária (PR #633/#634) registrou execução com saída no Neon e reativou a coleta, porém havia dois casos de falso positivo:
- a checagem de 20 horas usava qualquer tentativa de cron em empresa, inclusive `failed`, `partial` ou `completed` com zero outputs, para bloquear recuperação;
- o pós-check exigia apenas alguma tentativa com mesmo rótulo `CAPTURE_RELEASE` nos últimos 45 minutos, possivelmente de outra execução, sem exigir capture com outputs persistidos.

Consequência: o GitHub poderia sinalizar sucesso ou suprimir a captura mesmo sem novos documentos escritos. Isto não satisfaz o gate de sete dias reais de monitoramento (A7).

## Correção na estrutura existente
- `scripts/capture/should-run-daily-recovery.mjs`: a janela de 20 horas só é satisfeita pelo último registro `scope_type='company'`, `trigger_type='cron'`, `status='completed'`, `outputs_written > 0`.
- Janela de recuperação usa o timestamp `CAPTURE_RECOVERY_STARTED_AT` desta execução. O pós-check exige tentativa identificada por `CAPTURE_RELEASE` **após esse timestamp**, com pelo menos uma execução completed e outputs positivos.
- Falhas, execuções parciais e sucesso vazio produzem erro explícito ou recuperação devida — jamais um dia de monitoramento presumidamente saudável.
- `.github/workflows/capture-daily-recovery.yml`: registra timestamp no GitHub Env antes do bounded engine; preserva `MAX_CAPTURE_TARGETS=8`, `MAX_PARALLELISM=1`, gate de limite Neon e engine existente.
- `scripts/capture/should-run-daily-recovery.test.mjs`: regressões para dados vazios, tentativa antiga, status de falha, contadores inválidos e invariante de storage.
- **Sem migrations, alterações de Auth, usuários sintéticos ou nova infraestrutura.**

## QA e aceite
1. CI completo e validação de YAML verdes.
2. Após merge, o workflow da main deve iniciar e pular recuperação se houve captura útil há menos de 20h; ao passar da janela, tentar até 8 alvos em série, sob storage guard.
3. Quando tentar: `--verify` precisa conferir `outputs_written>0` de ao menos um conector completed da execução corrente. Se nenhum produzir dados, o job falha em vez de criar "saúde" artificial.
4. A7 exige os sete dias completos de outputs mais execução bem-sucedida, avaliados no workflow V5 Daily Acceptance Evidence, e continua sujeito à observação futura.

A intenção do gate é **qualidade de evidência e continuidade operacional**, não volume inflado de capturas.
