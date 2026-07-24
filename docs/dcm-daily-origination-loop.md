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

Os padrões foram incorporados ao backend, ao Supabase e ao frontend oficial. Os leads estáticos e a dependência de `localStorage` não foram importados.

### 3. Guardrails de escrita

- observação concreta no início;
- tom humano e direto;
- um produto hipótese por mensagem;
- sem promessa de taxa, prazo, volume ou aprovação;
- aproximadamente cinco ou seis linhas;
- CTA leve para conversa de vinte minutos;
- mensagem real alimenta o loop de aprendizado.

## Contratos e agentes

O módulo `backend/src/modules/dcmDailyOperatingLoop.ts` versiona:

- Business Analyst Agent;
- workflow diário A-F;
- guardrails de escrita;
- catálogo de skills comerciais;
- contrato dos outputs e estados da fila.

Endpoints autenticados:

- `GET /api/origination/daily-operating-loop`;
- `GET /api/origination/business-analyst`.

## Runtime da fila diária

A função `api/dcm-daily-leads.ts` expõe:

- `GET /api/origination/daily-leads`: fila por data, prioridade e status;
- `POST action=create`: criação de lead vinculado ao Company Master;
- `PATCH`: atualização de mensagem, próxima ação e status;
- `POST action=send`: persistência do envio e criação de feedback quando a mensagem final diverge da sugerida.

Regras de runtime:

- o bearer token do usuário é validado no Supabase Auth;
- o mesmo token é encaminhado ao PostgREST;
- RLS decide o acesso, sem service role no navegador;
- lead e feedback são gravados em instruções sequenciais;
- o feedback é criado apenas depois que o lead pai existe;
- o envio tenta registrar atividade, mover o pipeline para `Approach` e atualizar a próxima ação.

## Persistência Supabase

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
- próxima ação;
- owner e timestamps.

### `dcm_outreach_feedback`

Loop de aprendizado com:

- mensagem gerada;
- mensagem enviada de fato;
- resumo das mudanças;
- regras aprendidas;
- status de revisão/aplicação.

### `dcm_daily_outreach_queue_v`

Visão operacional ligada ao Company Master, com indicação de feedback pendente e `security_invoker=true`.

## Regra de deduplicação

A aplicação usa, nesta ordem:

1. `company_id + linkedin_url normalizada + generated_on`;
2. comparação de feedback por `daily_lead_id + generated_message + actual_message` no runtime;
3. revisão humana quando o contato ou a empresa não estiverem resolvidos.

## Frontend

A rota `/dcm-daily` entrega:

- briefing do dia;
- cadastro usando empresas resolvidas;
- fila A/B/C/Reciclar;
- composer da mensagem sugerida e da mensagem realmente utilizada;
- ações de salvar, copiar, registrar envio, reposicionar, marcar dados faltantes e não avançar;
- skills recomendadas;
- próximas ações;
- sinalização de feedback pendente.

## Integração com módulos existentes

- `companies`: identidade canônica do lead;
- `company_signals`: evidências da tese;
- `qualification_snapshots`: fit e score;
- `lead_score_snapshots`: prioridade;
- `pipeline`: estágio comercial;
- `activities`: registro de abordagem e follow-up;
- `tasks`: próximas ações complementares;
- `origination_os_artifacts`: contratos versionados.

## Segurança validada

Testes transacionais executados no Supabase real confirmaram:

- owner preenchido por `auth.uid()`;
- lead e feedback graváveis pelo owner;
- view segura visível pelo owner;
- usuário diferente enxerga zero linhas do owner;
- todos os dados de teste foram removidos por rollback.

## Status de implementação

- contratos do workflow: implementados;
- Business Analyst Agent: implementado;
- endpoints de contrato: implementados;
- tabelas, view e RLS Supabase: aplicados no banco real;
- CRUD da fila diária: implementado;
- briefing diário: implementado;
- painel visual da fila: implementado;
- sincronização de envio com pipeline e atividade: implementada;
- feedback gerado versus enviado: implementado;
- CI backend, frontend, funções Vercel e build: aprovado;
- publicação da versão na Vercel: dependente de liberação da cota de builds do workspace.

## Próximas evoluções

1. alimentar automaticamente a fila a partir de ranking, tese e stakeholders;
2. transformar feedback revisado em regras versionadas de escrita;
3. criar SLA e owner para follow-ups vencidos;
4. medir conversão por hipótese de produto, mensagem e estágio comercial.
