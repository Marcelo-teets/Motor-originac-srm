# Assistente de tarefas — modo zero-cost

## Objetivo

O assistente transforma uma solicitação em linguagem natural em um plano estruturado de tarefas para:

- **Microsoft To Do**: tarefas pessoais, lembretes e preparação individual;
- **Microsoft Planner**: projetos, entregas compartilhadas e atividades de equipe.

A IA apenas propõe. Nenhuma tarefa é criada sem aprovação explícita do usuário na tela.

## Política vigente

O projeto está sob **ZERO-COST LOCK** até revogação explícita do usuário.

Enquanto o lock estiver ativo:
- OpenAI não é chamada;
- Anthropic não é chamada;
- Vercel AI Gateway pago não é chamado;
- não existe fallback pago;
- a presença de secrets antigos no ambiente não autoriza seu uso.

## Provedor

O Task AI usa somente o **Motor Free Inference Node**, com modelo open-source/local e contrato HTTP compatível com OpenAI Chat Completions apenas como formato de transporte.

## Variáveis de ambiente permitidas

```text
ZERO_COST_AI_POLICY=locked
FREE_INFERENCE_BASE_URL=https://hungry-mountainous-harddrives--antunespmarcelo.replit.app
FREE_INFERENCE_MODEL=motor-local
```

Nenhuma chave OpenAI, Anthropic ou AI Gateway é requisito operacional.

## Fluxo

1. O usuário descreve o trabalho.
2. O Motor envia o prompt ao nó gratuito.
3. O modelo devolve:
   - resumo;
   - tarefas;
   - destino To Do ou Planner;
   - descrição;
   - prazo quando houver base segura;
   - prioridade;
   - bucket do Planner;
   - justificativa.
4. O usuário revisa cada item.
5. Pode criar uma tarefa individual ou aprovar todas.
6. A criação ocorre pela integração Microsoft já autenticada.

## Regras de segurança e qualidade

- endpoint protegido por sessão Supabase;
- máximo de 12.000 caracteres aceitos pelo backend e 6.000 caracteres na interface;
- máximo de 20 tarefas por plano;
- saída validada no backend antes de chegar ao frontend;
- datas inválidas são descartadas;
- destinos e buckets são normalizados;
- aprovação humana sempre obrigatória;
- a IA é instruída a não inventar responsáveis, datas, números ou fatos ausentes;
- falha do nó gratuito não dispara provedor pago.

## Endpoint

```text
GET /api/integrations/task-ai
```

Retorna o status do Motor Free Inference Node e confirma que fallback pago está desativado.

```text
POST /api/integrations/task-ai
Content-Type: application/json
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>

{
  "prompt": "Preparar a reunião de quinta e dividir as entregas com o time"
}
```

## Diagnóstico

### Nó gratuito indisponível

O assistente fica temporariamente indisponível. Nenhum provedor pago é utilizado como fallback e o restante da plataforma continua funcionando.

### A IA gera tarefas, mas a criação falha

A camada de IA está funcionando, mas a integração Microsoft pode ainda não estar completamente ativada. Revise:

- conexão Microsoft;
- migration do Supabase;
- Microsoft 365 Group ID;
- plano do Planner;
- permissões do Graph.

### Prazo não foi preenchido

O assistente só define uma data quando o pedido contém informação suficiente. Isso evita inventar prazos.

## Revogação

A volta de qualquer API paga exige autorização explícita do usuário, novo PR, revisão do contrato `zero-cost-ai-policy` e validação prévia de custo.
