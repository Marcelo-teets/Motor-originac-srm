# Motor Free Inference Node — 2026-08-20

## Objetivo
Operar uma camada auxiliar de inferência sem custo variável e sem dependência automática de APIs pagas.

## Diretriz institucional vigente
A partir de 2026-08-20, a política de IA do Motor está em **ZERO-COST LOCK**.

Enquanto essa diretriz não for explicitamente revogada pelo usuário:
- OpenAI está bloqueada para runtime;
- Anthropic está bloqueada para runtime;
- Vercel AI Gateway pago está bloqueado para runtime;
- qualquer fallback que possa gerar cobrança é proibido;
- canaries não podem emitir probes pagos;
- jobs automáticos de IA que possam gerar cobrança permanecem pausados;
- a presença de secrets antigos no ambiente não autoriza seu uso.

A revogação exige simultaneamente:
1. autorização explícita do usuário;
2. alteração de código em PR revisável;
3. remoção/ajuste do contrato `scripts/zero-cost-ai-policy.test.mjs`;
4. validação de custo e limite antes de produção.

## Arquitetura
- Produto principal permanece em React + Vite, Node + TypeScript, Supabase e Vercel.
- GitHub continua fonte oficial do código.
- O nó de inferência é stateless e não persiste dados.
- O nó gratuito publicado está em Replit Starter e serve apenas inferência.
- Nenhum banco, autenticação ou pipeline de negócio foi movido para o nó auxiliar.

## Endpoint
Base padrão:
`https://hungry-mountainous-harddrives--antunespmarcelo.replit.app`

Contrato esperado:
- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`

Compatibilidade: formato OpenAI Chat Completions, sem dependência da OpenAI API.

## Política de custo
- Copilot e Task AI usam somente o Motor Free Inference Node.
- Falha do nó gratuito deve retornar erro/fallback governado sem acionar provedor pago.
- Nenhuma chave de API paga é requisito para essas rotas.
- O Knowledge Learning Agent com gateway pago está operacionalmente bloqueado e sem cron.
- O provider canary apenas verifica o lock e a saúde do nó gratuito; não faz inferência paga.
- `.env.example` não anuncia credenciais de provedores de IA pagos.

## Proteção do free tier
O nó auxiliar deve operar com limites rígidos:
- concorrência máxima: 1;
- prompt máximo: 6.000 caracteres;
- saída máxima: 512 tokens;
- limite por processo: 20 inferências/hora e 100 inferências/dia;
- sem jobs de inferência em background;
- `/health` não pode disparar geração;
- sem warmup periódico caro;
- ao atingir limites, retornar 429 em vez de escalar consumo.

Mesmo com hospedagem em plano gratuito, limites e preços do provedor externo podem mudar. Por isso o Motor deve falhar fechado: se o free tier deixar de ser comprovadamente gratuito, a inferência é pausada, não migrada automaticamente para opção paga.

## Segurança e governança
- Não enviar segredos ou dados confidenciais desnecessários.
- Prompts não devem ser persistidos nem registrados em logs de aplicação.
- Score, qualification, patterns, ranking e pipeline não podem ser mutados diretamente pelo nó de inferência.
- O nó é coprocessador auxiliar, nunca backend ou banco paralelo.

## Variáveis permitidas
- `ZERO_COST_AI_POLICY=locked`
- `FREE_INFERENCE_BASE_URL`
- `FREE_INFERENCE_MODEL`

## Variáveis proibidas como dependência operacional enquanto o lock estiver ativo
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AI_GATEWAY_API_KEY`
- `VERCEL_OIDC_TOKEN` para inferência paga

Secrets legados podem existir no ambiente por histórico, mas devem permanecer inertes e não podem ser lidos por rotas ativas de IA.

## Rollback
Não existe rollback automático para API paga. Se o nó gratuito falhar, a IA fica indisponível e o restante do Motor continua operando. Voltar a um provedor pago exige revogação explícita da política e novo PR.
