# Assistente de tarefas — GPT + Claude

## Objetivo

O assistente transforma uma solicitação em linguagem natural em um plano estruturado de tarefas para:

- **Microsoft To Do**: tarefas pessoais, lembretes e preparação individual;
- **Microsoft Planner**: projetos, entregas compartilhadas e atividades de equipe.

A IA apenas propõe. Nenhuma tarefa é criada sem aprovação explícita do usuário na tela.

## Provedores

A tela permite escolher:

- **Automático**: usa GPT quando `OPENAI_API_KEY` estiver configurada; caso contrário, usa Claude;
- **GPT**: chama a OpenAI Responses API com Structured Outputs;
- **Claude**: chama a Anthropic Messages API com tool use e schema de saída.

## Variáveis de ambiente

Cadastre na Vercel:

```text
OPENAI_API_KEY=<chave da OpenAI>
OPENAI_TASK_MODEL=gpt-5-mini
ANTHROPIC_API_KEY=<chave da Anthropic>
ANTHROPIC_TASK_MODEL=claude-sonnet-4-20250514
```

Pelo menos uma das duas chaves é necessária. Os nomes dos modelos são configuráveis para permitir atualização sem alteração do código.

Nunca use prefixo `VITE_` nessas chaves. Elas devem existir apenas nas funções serverless.

## Fluxo

1. O usuário descreve o trabalho.
2. Escolhe Automático, GPT ou Claude.
3. A IA devolve:
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
- chaves de IA somente no backend;
- limite de 12.000 caracteres por solicitação;
- máximo de 20 tarefas por plano;
- timeout de 30 segundos por chamada;
- saída validada no backend antes de chegar ao frontend;
- datas inválidas são descartadas;
- destinos e buckets são normalizados;
- aprovação humana sempre obrigatória;
- a IA é instruída a não inventar responsáveis, datas, números ou fatos ausentes.

## Endpoint

```text
GET /api/integrations/task-ai
```

Retorna os provedores configurados e modelos ativos.

```text
POST /api/integrations/task-ai
Content-Type: application/json
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>

{
  "provider": "auto",
  "prompt": "Preparar a reunião de quinta e dividir as entregas com o time"
}
```

## Diagnóstico

### GPT não aparece disponível

Confirme `OPENAI_API_KEY` na Vercel e faça novo deployment.

### Claude não aparece disponível

Confirme `ANTHROPIC_API_KEY` na Vercel e faça novo deployment.

### A IA gera tarefas, mas a criação falha

A camada de IA está funcionando, mas a integração Microsoft ainda não está completamente ativada. Revise:

- conexão Microsoft;
- migration do Supabase;
- Microsoft 365 Group ID;
- plano do Planner;
- permissões do Graph.

### Prazo não foi preenchido

O assistente só define uma data quando o pedido contém informação suficiente. Isso evita inventar prazos.
