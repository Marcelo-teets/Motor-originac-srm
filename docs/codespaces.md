# Codespaces — Motor Originação SRM

Este repositório já está preparado para abrir em GitHub Codespaces com a stack oficial do projeto:
- frontend React + Vite
- backend Node + TypeScript
- Supabase como banco/auth

## O que foi configurado
- `.devcontainer/devcontainer.json`
- `.devcontainer/post-start.sh`
- `.vscode/tasks.json`

## Secrets recomendados no GitHub
Cadastre estes **Codespaces Secrets** no repositório antes de abrir o ambiente:

- `PORT`
- `USE_SUPABASE`
- `BOOTSTRAP_SUPABASE`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Valores sugeridos
- `PORT=4000`
- `USE_SUPABASE=true`
- `BOOTSTRAP_SUPABASE=true`
- `VITE_API_BASE_URL=http://localhost:4000`
- `VITE_SUPABASE_URL=<mesmo valor de SUPABASE_URL>`
- `VITE_SUPABASE_ANON_KEY=<mesmo valor de SUPABASE_ANON_KEY>`

## Como abrir
1. Entre no repositório no GitHub.
2. Clique em **Code**.
3. Vá em **Codespaces**.
4. Clique em **Create codespace on main**.

## O que acontece na inicialização
1. O container sobe com Node 20.
2. O `npm install` roda automaticamente.
3. O script `.devcontainer/post-start.sh` cria `.env` a partir do `.env.example`, se necessário.
4. Se os secrets existirem, o script injeta os valores no `.env`.

## Como rodar o projeto
### Opção 1 — Terminal
```bash
npm run dev:backend
npm run dev:frontend -- --host 0.0.0.0
```

### Opção 2 — VS Code Tasks
Use as tasks abaixo:
- `motor: install`
- `motor: backend dev`
- `motor: frontend dev`
- `motor: dev stack`
- `motor: build`
- `motor: typecheck`

## Portas
- `4000`: backend
- `5173`: frontend

O Codespaces vai encaminhar essas portas automaticamente.

## Fluxo sugerido para o projeto
1. Abrir Codespace a partir da `main`.
2. Criar branch limpa para cada entrega.
3. Desenvolver e validar no cloud.
4. Abrir PR.
5. Manter Vercel consumindo o frontend e Supabase como fonte real.

## Observações
- Esta configuração não cria stack paralela.
- O ambiente segue a arquitetura oficial do projeto.
- O `.env` gerado no Codespaces é local ao ambiente e não deve ser commitado.
