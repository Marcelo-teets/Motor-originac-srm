# Rotina diária DCM aplicada ao Motor Originação

## Objetivo

Transformar o aprendizado do artefato de pipeline DCM e da rotina de leads em um fluxo institucional, persistido e integrado à arquitetura oficial:

`Search Profile -> Sources -> Monitoring -> Signals -> Qualification -> Thesis -> Outreach -> Pipeline -> Feedback`

## O que foi aproveitado

### 1. Fluxo diário em seis etapas

- novos leads;
- leads com tese e sem mensagem;
- briefing diário;
- sincronização com pipeline;
- skills recomendadas por estágio;
- aprendizado a partir da mensagem enviada de fato.

### 2. Padrões de UX

O artefato mostrou valor em:

- fila única de leads do dia;
- distinção entre abordar, reposicionar, não avançar e sem dados;
- mensagem pronta para copiar;
- controle de envio;
- skills de venda contextuais;
- feedback lado a lado entre mensagem gerada e mensagem real.

Os contratos desses padrões foram incorporados ao backend e ao Supabase. Os leads estáticos e a dependência de `localStorage` não foram importados.

### 3. Guardrails de escrita

- observação concreta no início;
- tom humano e direto;
- um produto hipótese por mensagem;
- sem promessa de taxa, prazo, volume ou aprovação;
- aproximadamente cinco ou seis linhas;
- CTA leve para conversa de vinte minutos;
- mensagem real alimenta o loop de aprendizado.

## Backend

O módulo `backend/src/modules/dcmDailyOperatingLoop.ts` versiona:

- Business Analyst Agent;
- workflow diário A-F;
- guardrails de escrita;
- catálogo de skills comerciais;
- contrato dos outputs e estados da fila.

Endpoints autenticados:

- `GET /api/origination/daily-operating-loop`;
- `GET /api/origination/business-analyst`.

## Persistência Supabase

A migration `108_dcm_daily_outreach_operating_loop.sql` cria:

### `dcm_daily_leads`

Fila diária auditável com:

- empresa e contato;
- tese;
- produto hipótese;
- prioridade;
- mensagem gerada;
- mensagem enviada;
- status;
- skills recomendadas;
- origem da evidência;
- próxima ação.

### `dcm_outreach_feedback`

Loop de aprendizado com:

- mensagem gerada;
- mensagem enviada de fato;
- resumo das mudanças;
- regras aprendidas;
- status de revisão/aplicação.

### `dcm_daily_outreach_queue_v`

Visão operacional da fila, ligada ao Company Master e com indicação de feedback pendente.

## Regra de deduplicação

A aplicação deve usar, nesta ordem:

1. `company_id + linkedin_url normalizada + generated_on`;
2. `company_id + contact_name`;
3. revisão humana quando o contato ou a empresa não estiverem resolvidos.

## Integração com módulos existentes

- `companies`: identidade canônica do lead;
- `company_signals`: evidências da tese;
- `qualification_snapshots`: fit e score;
- `lead_score_snapshots`: prioridade;
- `pipeline`: estágio comercial;
- `activities`: registro de abordagem e follow-up;
- `tasks`: próxima ação;
- `origination_os_artifacts`: contratos versionados.

## Status de implementação

- contratos do workflow: implementados;
- Business Analyst Agent: implementado;
- endpoints de leitura: implementados;
- tabelas e view Supabase: migration pronta;
- testes de contrato: implementados;
- CRUD de fila diária: próximo passo de runtime;
- geração automática do briefing: próximo passo de runtime;
- painel visual da fila: próximo passo de frontend;
- atualização automática do perfil de escrita: próximo passo de runtime.

## Critérios de aceite para o próximo runtime

1. listar a fila do dia por prioridade e status;
2. criar ou atualizar lead sem duplicidade;
3. marcar mensagem como enviada e registrar `sent_at`;
4. persistir mensagem real quando diferente da gerada;
5. criar feedback pendente automaticamente;
6. refletir próxima ação em `tasks` ou `pipeline`;
7. gerar briefing diário com ações vencidas e prioridades.
