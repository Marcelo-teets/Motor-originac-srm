# Paperclip Control Plane

## Objetivo
Usar o projeto Paperclip como control plane de agentes para o Motor, sem criar stack paralela e sem substituir o frontend executivo, o backend Node e o Supabase.

## O que entra agora
- template de company para Paperclip
- runbook HTTP mapeando agentes para endpoints do Motor
- modulo TypeScript com catalogo de agentes e status de scaffold
- router TypeScript pronto para ser plugado no backend atual

## O que nao entra agora
- substituir o dashboard oficial por outro React UI
- trocar Supabase por banco interno do Paperclip
- permitir automacao sem gates humanos em mudancas sensiveis

## Mapeamento pratico
1. `collection_motor` aciona monitoring.
2. `enrichment_supervisor` consolida sinais e evidencias.
3. `qualification_agent` recalcula qualification, lead score, thesis e ranking.
4. `pattern_analyst` explica movimentos de prioridade.
5. `commercial_board` recebe saida explicavel e aprova proxima acao.

## Como plugar no backend
1. Importar `createPaperclipRouter` em `backend/src/server.ts`.
2. Registrar `app.use('/paperclip', createPaperclipRouter(service))`.
3. Adicionar variavel `PAPERCLIP_TARGET_API_BASE_URL` no `.env`.
4. Subir o backend e conectar os agentes Paperclip via HTTP.

## Regra de arquitetura
Paperclip coordena.
Motor executa.
Supabase persiste.
Frontend oficial apresenta.
