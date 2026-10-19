# Monitoramento V5 — um dia saudável em São Paulo, não janela móvel de 20 horas

**19/10/2026.** Objetivo do produto: manter série de sete dias completos de monitoring com dados reais e orçamento Neon protegido, para habilitar avaliação fundamentada dos gatilhos de originação.

## Risco identificado durante QA da PR #637
O Capture Daily Recovery agendado para **10h25 de Brasília** compara os últimos 20h desde o último conector com outputs. Se uma execução inicial ocorrer às 17h18 de um dia, a recuperação das 10h25 do dia seguinte será bloqueada por ter se passado apenas ~17h. Resultado: um dia de São Paulo sem captura e interrupção indevida da série de sete dias, embora haja capacidade e limite de armazenamento.

## Mudança
- `recoveryDue` deve classificar o timestamp da última captura **efetiva** e o instante atual no fuso `America/Sao_Paulo`. Se já houve captura efetiva **no mesmo dia calendário**, não repete.
- Se a última captura ocorreu **em dia anterior**, a execução do novo dia está liberada após **mínimo de 8 horas** de segurança. Isso evita bursts de meia-noite e permite o cron das 10h25 depois de uma execução tardia no dia anterior.
- Sem alterar o tipo de empresa/sources no motor bounded, nem os limites `MAX_CAPTURE_TARGETS=8`, `MAX_PARALLELISM=1`, proteção de storage e verificação contra replay da PR #637.
- O resultado do calendário é **apenas elegibilidade a executar**; saúde A7 requer conector completed com outputs gravados e monitoring_outputs reais. Se nenhum conector produzir dados, o job falha e o gate permanece bloqueado.
- Testes cobrem dia de São Paulo vs UTC, horário de verão inexistente em outubro 2026, manhã posterior à captura de fim de tarde, gap de segurança e proteção de não repetir no mesmo dia.

## Aceite
CI completo + workflow validate verdes; merge único da main; deployment somente pelo processo oficial com SHA paritário. O monitoramento só poderá ser marcado estável após sete dias completos realmente decorridos e sem falhas de qualidade.
