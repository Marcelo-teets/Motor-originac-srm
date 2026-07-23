# Knowledge Vault V4 — Captura de Monitoring Outputs

## Objetivo

Preservar outputs reais dos conectores como observações auditáveis antes que eles sejam interpretados como sinais de originação.

A V4 fecha o trecho:

`Sources → Monitoring → monitoring_outputs → Knowledge Vault → análise humana → company_signals`

## Regra central

Um `monitoring_output` é evidência coletada, não conclusão. A captura:

- cria uma nota `source` vinculada à empresa;
- registra fonte, status, confiança, natureza, data e URL;
- cria `knowledge_reference` do tipo `monitoring_output`;
- não cria `company_signal`;
- não altera qualification, patterns, score, ranking ou pipeline;
- limita o texto importado e não replica payload bruto na referência.

## Implementação

### Supabase

Migration: `083_knowledge_monitoring_output_capture.sql`.

RPC:

```sql
knowledge_capture_monitoring_output_note(
  p_monitoring_output_id uuid,
  p_visibility text default 'team'
)
```

Controles:

- autenticação obrigatória;
- `security invoker`;
- execução removida de `PUBLIC` e `anon`;
- advisory lock por output;
- reutilização de nota de equipe já existente;
- snapshot sanitizado em `knowledge_references`;
- `capturedNodeId` retornado no workspace.

### Frontend

No Company Detail, a seção **Outputs monitorados** apresenta os oito registros mais recentes com:

- fonte;
- título ou fallback operacional;
- resumo;
- confiança;
- status do conector;
- natureza observada ou inferida;
- data;
- URL primária;
- ação **Preservar output** ou **Abrir Vault**.

## Validação executada

Teste transacional com rollback confirmou:

- primeira captura cria nó `source`;
- segunda captura do mesmo usuário retorna o mesmo nó;
- outro usuário autenticado retorna o mesmo nó de equipe;
- uma única referência é criada;
- o workspace retorna o `capturedNodeId` correto;
- propriedades `origin=monitoring_output` e `observationOnly=true` são preservadas;
- nenhum dado de teste permanece após rollback;
- `anon` não executa a RPC.

## Resultado para originação

A plataforma passa a preservar o contexto anterior ao sinal. Isso melhora:

- auditabilidade da tese;
- distinção entre fato e inferência;
- revisão humana;
- explicação de por que um sinal foi criado;
- contexto futuro do Copilot;
- reconstrução temporal de mudanças na empresa.
