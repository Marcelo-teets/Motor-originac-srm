# Microsoft Planner + To Do — configuração

## Objetivo

A integração usa o Microsoft Graph para manter:

- **Microsoft To Do** como fonte oficial das tarefas pessoais;
- **Microsoft Planner** como fonte oficial das tarefas compartilhadas;
- **Supabase** apenas como armazenamento seguro da conexão, vínculos externos e auditoria de sincronização;
- **Vercel Cron** para sincronização diária.

A plataforma não grava os tokens Microsoft no navegador. O backend armazena access token e refresh token criptografados com AES-256-GCM.

---

## 1. Registrar o aplicativo na Microsoft

1. Acesse o **Microsoft Entra admin center**.
2. Abra **Identity > Applications > App registrations**.
3. Clique em **New registration**.
4. Use o nome `Motor Originação — Planner e To Do`.
5. Escolha o tipo de conta:
   - para uso corporativo em um único tenant: `Accounts in this organizational directory only`;
   - para aceitar outros tenants e contas pessoais no To Do: `Accounts in any organizational directory and personal Microsoft accounts`.
6. Em **Redirect URI**, selecione `Web` e informe exatamente:

```text
https://motor-originac-srm.vercel.app/api/integrations/microsoft/callback
```

7. Finalize o registro.

Anote:

- **Application (client) ID** → `MICROSOFT_CLIENT_ID`;
- **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`.

Para uma aplicação multitenant, também é possível usar `common` como tenant.

---

## 2. Criar o Client Secret

1. Dentro do aplicativo, abra **Certificates & secrets**.
2. Clique em **New client secret**.
3. Use a descrição `Vercel Production`.
4. Escolha a validade permitida pela política da empresa.
5. Copie imediatamente o campo **Value**.

Esse valor será cadastrado como `MICROSOFT_CLIENT_SECRET`. Não use o `Secret ID`.

---

## 3. Adicionar as permissões do Microsoft Graph

Abra **API permissions > Add a permission > Microsoft Graph > Delegated permissions** e adicione:

| Permissão | Uso |
|---|---|
| `User.Read` | Identificar a conta conectada |
| `Tasks.ReadWrite` | Ler e gerenciar tarefas do To Do e Planner |
| `Group.Read.All` | Localizar os planos vinculados ao grupo Microsoft 365 |
| `openid` | Login OAuth |
| `profile` | Perfil básico |
| `email` | E-mail da conta |
| `offline_access` | Renovar o acesso sem exigir login a cada sincronização |

Quando a política do tenant exigir, clique em **Grant admin consent**.

A aplicação usa permissões delegadas: as ações ficam limitadas ao que o usuário conectado já pode acessar no Microsoft 365.

---

## 4. Escolher o grupo do Planner

O Planner precisa pertencer a um **Microsoft 365 Group**. O usuário conectado precisa ser membro desse grupo.

Uma forma prática:

1. Abra o Microsoft Teams ou Outlook.
2. Crie ou escolha uma equipe/grupo para o trabalho compartilhado.
3. Obtenha o **Group ID** no Entra, em **Groups > All groups > [grupo] > Overview > Object ID**.
4. Cadastre esse valor em `MICROSOFT_PLANNER_GROUP_ID` ou cole-o na tela **Planner + To Do** antes de preparar a estrutura.

A integração criará, quando ainda não existirem:

- plano: `Central de Execução`;
- buckets: `Inbox`, `Esta semana`, `Em andamento`, `Aguardando` e `Concluído`.

---

## 5. Variáveis de ambiente na Vercel

Cadastre em **Production**, **Preview** e **Development**, conforme necessário:

```text
MICROSOFT_CLIENT_ID=<Application client ID>
MICROSOFT_CLIENT_SECRET=<Client secret Value>
MICROSOFT_TENANT_ID=<Directory tenant ID ou common>
MICROSOFT_REDIRECT_URI=https://motor-originac-srm.vercel.app/api/integrations/microsoft/callback
MICROSOFT_PLANNER_GROUP_ID=<Object ID do Microsoft 365 Group>
MICROSOFT_TOKEN_ENCRYPTION_KEY=<segredo aleatório forte>
MICROSOFT_STATE_SECRET=<segredo aleatório forte>
MICROSOFT_SCOPES=openid profile email offline_access User.Read Tasks.ReadWrite Group.Read.All
APP_BASE_URL=https://motor-originac-srm.vercel.app
```

As variáveis existentes abaixo também são usadas:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
```

Regras importantes:

- nunca prefixe essas variáveis com `VITE_`;
- nunca exponha `MICROSOFT_CLIENT_SECRET`, tokens ou `SUPABASE_SERVICE_ROLE_KEY` no frontend;
- gere valores diferentes para `MICROSOFT_TOKEN_ENCRYPTION_KEY`, `MICROSOFT_STATE_SECRET` e `CRON_SECRET`;
- após alterar variáveis na Vercel, faça um novo deployment.

---

## 6. Aplicar a migration do Supabase

Migration do repositório:

```text
db/migrations/20260728_microsoft_planner_todo_integration.sql
```

Ela cria:

- `microsoft_connections`;
- `microsoft_task_links`;
- `microsoft_sync_runs`.

As três tabelas:

- usam RLS;
- não concedem acesso direto a `anon` nem `authenticated`;
- são acessadas apenas pelo backend com `service_role`;
- armazenam somente o necessário para conexão, sincronização e auditoria.

---

## 7. Ativar na plataforma

1. Entre na plataforma.
2. Abra **Execução comercial > Planner + To Do**.
3. Clique em **Conectar Microsoft**.
4. Autorize a aplicação.
5. Volte para a tela.
6. Confirme ou informe o Microsoft 365 Group ID.
7. Clique em **Preparar estrutura automaticamente**.
8. Crie uma tarefa de teste no To Do.
9. Crie uma tarefa de teste no Planner.
10. Clique em **Sincronizar agora** e confirme que as duas aparecem na tela.

---

## 8. Rotina operacional recomendada

### To Do

Use para:

- compromissos pessoais;
- lembretes;
- tarefas rápidas;
- preparação individual;
- atividades que não precisam de responsável adicional.

### Planner

Use para:

- projetos;
- tarefas compartilhadas;
- responsáveis;
- acompanhamento por bucket;
- atividades que precisam de visibilidade para o time.

### Regra contra duplicidade

Uma atividade deve nascer em apenas um destino:

- pessoal → To Do;
- compartilhada → Planner.

O Supabase não é uma terceira lista de tarefas. Ele mantém apenas o espelho técnico e a auditoria da integração.

---

## 9. Sincronização automática

O endpoint abaixo é chamado diariamente pelo Vercel Cron:

```text
/api/integrations/microsoft/cron-sync
```

Ele exige:

```text
Authorization: Bearer <CRON_SECRET>
```

A execução registra o resultado em `microsoft_sync_runs`, incluindo quantidade de tarefas lidas, itens vinculados e erros.

---

## 10. Diagnóstico

### A tela informa variáveis pendentes

Revise os nomes exatos na Vercel e faça um novo deployment.

### Microsoft não retorna refresh token

Confirme:

- escopo `offline_access`;
- redirect URI idêntico ao cadastrado;
- novo consentimento da conta.

### Planner aparece como pendente

Confirme:

- `MICROSOFT_PLANNER_GROUP_ID`;
- grupo do tipo Microsoft 365;
- usuário conectado como membro;
- permissões do Graph consentidas.

### To Do funciona, mas Planner não

Isso normalmente indica conta pessoal, grupo inválido ou ausência de licença/permissão corporativa para Planner. O To Do pode continuar funcionando de forma independente.

### Sincronização automática falha

Revise:

- `CRON_SECRET`;
- validade do client secret;
- status da conexão em `microsoft_connections`;
- última falha em `microsoft_sync_runs`;
- logs da função `api/microsoft.ts` na Vercel.
