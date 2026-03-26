# Step 02 — Pipeline / Activities hardening patch pack

Este arquivo contém os patches e o plano de aplicação para fechar o caminho crítico de pipeline/activities do MVP.

## Objetivo
Substituir o pipeline derivado no frontend por leitura persistida do backend, e amarrar `activities` / `pipeline` à experiência principal da POC.

## Problema atual
1. `frontend/src/lib/api.ts` ainda monta `PipelineSnapshot` a partir de `/companies`.
2. `backend/src/server.ts` responde `/pipeline` e `/activities` com payloads simplificados, sem persistência operacional suficiente.
3. `backend/src/repositories/platformRepository.ts` não expõe leitura/escrita dedicadas para `pipeline` e `activities`.
4. `backend/src/services/platformService.ts` ainda deriva parte do estágio e da próxima ação a partir de seed + snapshots, em vez de consumir estado operacional persistido.

---

## Patch A — `backend/src/types/platform.ts`
Adicionar tipos:

```ts
export type PipelineEntry = {
  id: string;
  companyId: string;
  stage: string;
  ownerId?: string;
  ownerName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityEntry = {
  id: string;
  companyId: string;
  ownerId?: string;
  ownerName?: string;
  title: string;
  activityType?: string;
  status: string;
  dueAt?: string;
  createdAt: string;
};
```

---

## Patch B — `backend/src/repositories/platformRepository.ts`
### Interface
Adicionar:

```ts
  listPipelineEntries(): Promise<PipelineEntry[]>;
  listActivities(): Promise<ActivityEntry[]>;
  savePipelineEntry(entry: PipelineEntry): Promise<PipelineEntry>;
  saveActivity(entry: ActivityEntry): Promise<ActivityEntry>;
```

### Memory repo
- inicializar arrays em memória para `pipelineEntries` e `activities`
- popular com dados mínimos a partir de `seededCompanies`
- persistir `savePipelineEntry` e `saveActivity`

### Supabase repo
Ler e gravar nas tabelas reais:
- `pipeline`
- `activities`

Mapeamentos principais:
- `company_id -> companyId`
- `owner_id -> ownerId`
- `created_at -> createdAt`
- `updated_at -> updatedAt`
- `due_at -> dueAt`

---

## Patch C — `backend/src/services/platformService.ts`
### assembleViews()
Carregar também:
- `pipelineEntries`
- `activities`

Criar:
- `latestPipelineByCompany`
- `activitiesByCompany`

Na construção de `companyViews`:
- `nextAction` deve priorizar `activitiesByCompany`
- `stage` deve sair de `latestPipelineByCompany`

Na construção de `CompanyDetailView`:
- `activities` devem sair da tabela `activities`
- `company.stage` deve refletir `pipeline`

### getDashboard()
Pipeline deve usar `pipelineEntries` reais:
- Identified
- Qualified
- Approach
- Structuring
- Won/Lost, se existirem

### novos métodos
Adicionar:

```ts
async movePipeline(companyId: string, stage: string, notes?: string)
async createActivity(input: { companyId: string; title: string; ownerName?: string; status?: string; dueAt?: string; activityType?: string })
```

Regra mínima:
- mover pipeline cria/atualiza uma entrada
- criar atividade grava e devolve registro persistido

---

## Patch D — `backend/src/server.ts`
Substituir endpoints simplificados por persistência real:

```ts
app.get('/pipeline', wrap(async (_req, res) => res.json(ok(platformMode, await service.getPipelineBoard()))));
app.get('/pipeline/company/:id', wrap(async (req, res) => res.json(ok(platformMode, await service.getCompanyPipeline(param(req.params.id))))));
app.post('/pipeline/company/:id/move', wrap(async (req, res) => res.json(ok(platformMode, await service.movePipeline(param(req.params.id), String(req.body?.stage ?? 'Qualified'), req.body?.notes)))));

app.get('/activities', wrap(async (_req, res) => res.json(ok(platformMode, await service.listActivities()))));
app.post('/activities', wrap(async (req, res) => res.status(201).json(ok(platformMode, await service.createActivity({
  companyId: String(req.body?.companyId ?? ''),
  title: String(req.body?.title ?? ''),
  ownerName: req.body?.ownerName,
  status: req.body?.status,
  dueAt: req.body?.dueAt,
  activityType: req.body?.activityType,
}))));
app.get('/activities/company/:id', wrap(async (req, res) => res.json(ok(platformMode, await service.listActivitiesByCompany(param(req.params.id))))));
```

---

## Patch E — `frontend/src/lib/types.ts`
Atualizar `PipelineSnapshot` para refletir backend real:

```ts
export type PipelineSnapshot = {
  stages: Array<{ stage: string; count: number; coverage?: string; note?: string }>;
  recentActivities: Array<{ company: string; title: string; owner: string; when: string; status: string }>;
};
```

Sem depender de derivação via `/companies`.

---

## Patch F — `frontend/src/lib/api.ts`
Trocar `getPipelineSnapshot` para consumir `/pipeline` diretamente:

```ts
  getPipelineSnapshot: async (session: SessionData | null): Promise<DataState<PipelineSnapshot>> => {
    const payload = await requestEnvelope<PipelineSnapshot>('/pipeline', session);
    return toState('Pipeline', payload);
  },
```

Adicionar helpers operacionais:

```ts
  movePipeline: (session: SessionData | null, companyId: string, stage: string, notes?: string) =>
    requestEnvelope(`/pipeline/company/${companyId}/move`, session, { method: 'POST', body: JSON.stringify({ stage, notes }) }),

  createActivity: (session: SessionData | null, payload: { companyId: string; title: string; ownerName?: string; status?: string; dueAt?: string; activityType?: string }) =>
    requestEnvelope('/activities', session, { method: 'POST', body: JSON.stringify(payload) }),
```

---

## Patch G — `frontend/src/pages/PipelinePage.tsx`
Depois de aplicar o Patch F, a página já passa a ler backend real. Mantém o bloco ABM semanal e passa a mostrar a foto operacional de pipeline sem derivação por `companies`.

---

## Patch H — `frontend/src/pages/CompanyDetailPage.tsx`
Adicionar duas ações mínimas:
1. mover estágio
2. criar atividade

Mesmo em UI simples, já resolve a POC.

Exemplo operacional:

```ts
await api.movePipeline(session, id, 'Approach', 'Qualificado para abordagem executiva');
await api.createActivity(session, {
  companyId: id,
  title: 'Agendar call executiva com CFO',
  ownerName: 'Origination',
  status: 'open',
  dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  activityType: 'call',
});
```

---

## Critério de aceite
A POC fecha este bloco quando:
1. `/pipeline` responde dados persistidos
2. `/activities` responde dados persistidos
3. mover estágio altera a Company Detail
4. criar atividade altera a Company Detail
5. `PipelinePage` deixa de depender de derivação por `/companies`

---

## Ordem de aplicação sugerida
1. Patch A
2. Patch B
3. Patch C
4. Patch D
5. Patch E
6. Patch F
7. Patch G
8. Patch H
