# Motor Free Inference Node — 2026-08-20

## Objetivo
Operar uma camada auxiliar de inferência sem custo variável e sem dependência automática de APIs pagas.

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

Compatibilidade: formato OpenAI Chat Completions.

## Política de custo
- OpenAI e Anthropic não são fallback automático.
- Copilot e Task AI usam o nó gratuito por padrão.
- Falha do nó gratuito deve retornar erro/fallback governado sem acionar provedor pago.
- Nenhuma chave de API paga é requisito para essas rotas.

## Segurança e governança
- Não enviar segredos ou dados confidenciais desnecessários.
- Limitar tamanho de prompt e tokens de saída.
- O nó deve operar com concorrência baixa e fila curta para proteger o free tier.
- Prompts não devem ser persistidos nem registrados em logs de aplicação.
- Score, qualification, patterns, ranking e pipeline não podem ser mutados diretamente pelo nó de inferência.

## Variáveis opcionais
- `FREE_INFERENCE_BASE_URL`
- `FREE_INFERENCE_MODEL`

Os defaults permitem operar sem configuração manual adicional enquanto o endpoint público do nó permanecer válido.

## Rollback
Reverter o PR desta mudança restaura a implementação anterior. Não há migração de banco associada.
