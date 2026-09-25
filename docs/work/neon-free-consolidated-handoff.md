# WORK — tarefa única de secrets, variáveis e ativação Neon Free

> Cole este documento integralmente em **ChatGPT Work** com acesso ao GitHub, Neon, Vercel, Supabase e, se necessário, Google Drive. **Execute** as etapas, não apenas gere instruções. Cumpra os critérios de aceite antes de anunciar migração. Jamais cole valores de secrets em chat, issues, PRs, logs ou arquivos.

## Identificadores verificados
- Repositório canônico: `Marcelo-teets/Motor-originac-srm`, trabalhar numa PR única criada sobre a `main` mais recente.
- Neon: projeto `steep-poetry-38942951`, branch padrão `production` (confirmada por screenshot; revalidar ao vivo).
- Supabase fonte: `hdghpmssudrqhsbvrdyt`; **não apagar**, não reiniciar sem justificativa e backup.
- Vercel: `motor-originac-srm`; **não atualizar variáveis de produção** até o aceite da migração.
- Free Neon exibido no dashboard: 500 MB storage, 100 CU-h/mês, 10 branches, autoscaling até 2 CU.
- Política versionada: `scripts/neon-free-budget-guard.mjs`, `.github/workflows/neon-free-budget-guard.yml`, `db/neon/20260924_neon_free_storage_write_guard.sql`, `docs/neon-free-plan-budget-guard.md`.
- CI: `node --test scripts/neon-free-budget-guard.test.mjs`; verificação horária no GitHub Actions.

## Inventário estático gerado antes do acesso às plataformas

O workflow `.github/workflows/neon-portability-inventory.yml` pode ser executado manualmente ou no CI sem secrets. O comando `node scripts/neon-portability-audit.mjs --json neon-portability.json --markdown neon-portability.md` gera um catálogo de migrações SQL e consumidores Supabase em backend/frontend/API, incluindo dependências de Auth, Storage, pg_cron, Vault, funções e políticas. **Seu resultado é uma triagem estática, não comprova restore nem representa o estado do banco vivo.** Usar o relatório publicado no resumo do GitHub Actions e no artefato `neon-portability-inventory` como matriz de implementação, em conjunto com o dump real antes de executar migrações.

## Fase 0 — auditoria segura, sem gasto nem cutover
1. Conectar aos provedores pelos respectivos Apps/integrações já autorizadas ou pelo navegador cloud do Work com OAuth interativo do usuário. Confirmar IDs e permissões, listar apenas **nomes, escopos e presença** de credenciais; nunca ler/publicar valores.
2. Diagnosticar por que o conector Neon do chat rejeita `project_id` internamente; usar navegador cloud/Neon CLI na nuvem se não houver solução pelo App. Não configurar API key se OAuth autorizado fornecer escopos equivalentes e funcionar com a rotina agendada; caso contrário criar secret mínimo em cofre.
3. Confirmar conta/organização, plano Free, métricas reais disponíveis no endpoint do projeto, campos de período de cobrança, consumo de armazenamento *cobrado* (não apenas `pg_database_size`), CU-h faturadas e quantidade de branches. Se a API do Free não disponibilizar métrica confiável, **não ativar o circuito baseado em números inventados**; registrar explicitamente a limitação e habilitar proteção local adicional.
4. Confirmar estado atual da `main` e dos workflows antes de alterações; não desabilitar capturas enquanto o Motor ainda depender do Supabase.

## Fase 1 — inventário único de configuração a concluir

| Superfície | Chave/variável | Uso | Ação |
|---|---|---|---|
| GitHub Actions secret | `NEON_API_KEY` **ou credencial OAuth equivalente com renovação automatizada** | Telemetria/limites do Neon | Escolher a opção de menor privilégio sustentável; guardar somente no cofre; validar sem revelar. |
| GitHub Actions variable | `NEON_GUARD_ACTIVE` | Armar o circuito horário | Manter **unset/false** até telemetria real testada e migração concluída. |
| GitHub Actions variable | `NEON_CUTOVER_VERIFIED` | Segunda trava para que o guard possa modificar endpoints/desabilitar workflows | Manter **unset/false** até restore/paridade/Auth/Storage/API concluídos. |
| GitHub Actions / cofre cloud secret | `MOTOR_SUPABASE_DATABASE_URL` | Exportação **somente leitura**/backup do banco de origem | Obter via Connect/Supabase e armazenar no cofre; se bloqueado, escalar backup ao suporte. Nunca imprimir URI. |
| GitHub Actions / cofre cloud secret | `MOTOR_NEON_DATABASE_URL` (ou referência equivalente de cofre) | Restore no Neon | Gerar via Neon para `production`, conferir projeto, SSL e DB antes de uso. |
| GitHub Actions / cofre cloud secret | `MOTOR_BACKUP_PASSPHRASE` | Cifra de backup | Gerar valor forte em cofre; **não** registrar em outputs/artefatos. |
| Vercel **Preview** | Conexão Neon via integração oficial | Preview do Motor | Validar hostname, branch e escopo; sem alterar env de produção. |
| Vercel **Production** | DB URI / env reais consumidas pelo backend **após revisão do código** | Cutover controlado | Não presumir que `DATABASE_URL` por si só substitui Supabase REST, Auth e Storage. Atualizar apenas quando os módulos estiverem adaptados e testados. |
| Vercel/GitHub existentes | `SUPABASE_URL`, chave publicável, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `MICROSOFT_*` e OAuth Google | Legado, exportação, jobs e integrações | Auditar presença e dependências por uso real; **não rotacionar nem remover** durante o cutover. |
| Google Drive/Sheets | OAuth já existente e IDs canônicos de arquivo histórico | Archive frio validado | Verificar credenciais e exportação com hash; nunca excluir a cópia fonte sem restore testado. |

A tabela é **um inventário-alvo**, não afirma que alguma chave já exista. Verifique também quais nomes de env o código realmente consome e faça uma matriz `origem -> segredo -> consumidores -> status -> teste -> ação`. Secrets opcionais sem consumidor ativo não devem ser criados desnecessariamente.

## Fase 2 — ativar proteção Free no destino
1. Antes de qualquer PATCH no Neon, executar read-only do guard no projeto correto e conferir *Free*, ciclo corrente e dados efetivamente retornados. O monitor deve falhar fechado para ausência de métrica.
2. Configurar o endpoint `production` de forma conservadora com teto **até 1 CU**, mínimo compatível, auto-suspend/scale-to-zero ativo quando disponível; documentar trade-off de cold starts e validar que settings não habilitem compute pago. Verificar cada endpoint/preview.
3. Fixar gatilhos operacionais: **425 MB** de 500 MB, **85 CU-h estimadas**, parar criação de branches aos **9 de 10**; limitar criação de previews e confirmar limpeza automática da integração Neon/Vercel. O gatilho SQL opcional de **400 MB de tamanho lógico** só deve ser instalado **após o esquema de negócio existir no Neon**. Ele não cobre armazenamento físico faturado.
4. Instalar controle nos pontos de ingestão do backend, rotas cron da Vercel, scripts/actions e quaisquer escritores relevantes; o workflow horário não controla escritas externas. Usar a política única versionada no GitHub.
5. Simular sobreuso/ausência de telemetria no ambiente de teste e conferir que o circuito conserva backups, dados, CI e acesso administrativo; conferir que não interfere com a recuperação do Supabase.

## Fase 3 — migrar os dados SEM inventar registros
1. Tentar exportação PostgreSQL consistente da fonte; o histórico de 24/09 apresenta `CONNECT_TIMEOUT` no Supabase e bloqueio de quota. Se não for possível, solicitar ao suporte dump ou liberação **somente de leitura** e trabalhar paralelamente na estrutura portátil em branch isolada do Neon. Não alegar que os dados foram transferidos antes do backup.
2. Exportar business schemas e dados, mapear extensões/funções/roles/RLS e separar subsistemas gerenciados: Supabase Auth, Storage, Vault, Realtime, PostgREST e `pg_cron`. Cifrar o backup e testar restauração.
3. Importar no Neon só após confirmar o banco/branch de destino. Validar contagens por tabela, checksums amostrais, FK, IDs, views, funções, RLS e dados do pipeline. Se os dados da fonte ainda não estiverem disponíveis, registrar claramente `schema_only` e não mover a produção.
4. Implementar e testar Auth compatível, Storage externo apenas se indispensável, camada backend Node/TS usando Neon sem criar stack paralela, workers/cron e conectores reais. Preservar React/Vite e Vercel.
5. Preview Vercel end-to-end: login, companies, monitoring_outputs, signals, qualification, patterns, ranking, leads e pipeline; testar isolamento de usuário, chamadas Microsoft e novos registros.
6. Depois de prova de paridade, congelar escritas de origem durante janela controlada, exportar delta, validar novamente e só então apontar o runtime de produção para Neon. Manter Supabase recuperável como rollback.

## Fase 4 — ativação final e critérios verificáveis
- Primeiro fazer o guard passar em leitura sem armação. Somente após migração real e validações, configurar **ambas** variáveis `NEON_GUARD_ACTIVE=true` e `NEON_CUTOVER_VERIFIED=true`, executar workflow manual e acompanhar pelo menos dois ciclos agendados.
- Conferir max endpoint 1 CU; somatório dos recursos abaixo dos gatilhos; travamento das capturas pesadas com consumo simulado (sem comprometer dados reais); logs sem tokens; nenhuma criação excessiva de branch.
- Se houver métricas pagas inacessíveis ao Free, registrar estimativa conservadora/limitações e não prometer garantia matemática de 96%; consumo de usuários e escritas fora dos guards podem ultrapassar limites.
- Relatar PR única, SHA mergeado, checks executados, deploy Vercel/Neon com URLs, validação Auth/Storage/dados, custo $0 comprovado, status de cada segredo **sem seu valor**, pendências e plano de rollback.
- Não realizar upgrades, incluir cartão, remover spending caps, excluir dados, divulgar senhas ou executar `neon deploy` de uma aplicação sem os dados/serviços requeridos.

## Regra de saída
Quando encontrar bloqueio, tentar conexão nativa/App, OAuth cloud, API autorizada e CLI cloud nessa ordem; registrar erro sanitizado e continuar as etapas independentes. Não transferir tarefas operáveis ao usuário nem declarar produção pronta por CI verde. Só solicitar interação pontual para OAuth, criação de segredo sob ação explícita ou suporte externo inevitável.
