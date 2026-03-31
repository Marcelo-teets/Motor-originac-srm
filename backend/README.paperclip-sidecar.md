# Paperclip Sidecar Runtime Guide

## Objetivo
Subir o Paperclip dentro do projeto como control plane do Motor, sem criar stack paralela e sem substituir o backend principal.

## Artefatos relevantes
- `backend/src/server.paperclip.ts`
- `backend/Dockerfile.paperclip-sidecar`
- `backend/railway.paperclip.json`
- `backend/.env.paperclip-sidecar.example`
- `backend/src/routes/paperclipRouter.ts`
- `backend/src/modules/paperclipControlPlane.ts`

## Como rodar localmente
Na raiz do monorepo:

```bash
npm install
npx tsx backend/src/server.paperclip.ts
```

## Como validar
### Health
- `GET /health`

### Status do control plane
- `GET /platform/status`
- `GET /paperclip/status`
- `GET /paperclip/agents`

### Orquestração por empresa
- `POST /paperclip/orchestrate/company/:id`

## Como subir em cloud
Usar Railway com o arquivo `backend/railway.paperclip.json` e o Dockerfile `backend/Dockerfile.paperclip-sidecar`.

## Regra institucional
Paperclip coordena.
Motor executa.
Supabase persiste.
Frontend oficial apresenta.
