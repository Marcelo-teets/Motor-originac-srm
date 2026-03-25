# Step 03 — Capture & Ingestion patch pack

## Objetivo
Fechar o bloco de descoberta, captura e promoção de empresas no Motor de Originação usando a stack oficial:
- backend Node + TypeScript
- Supabase
- frontend React + Vite
- GitHub + Vercel

O objetivo deste bloco é transformar `search_profiles` em runs reais de descoberta de empresas, gerar candidatos com trilha de auditoria e promover candidatos aprovados para `companies`, já conectando monitoring, qualification e ranking.

---

## Resultado esperado
Ao final deste bloco, o fluxo operacional deve ser:

1. usuário cria ou ativa um `search_profile`
2. backend dispara `search_profile_run`
3. fontes públicas retornam candidatos
4. candidatos são normalizados e persistidos em `discovered_company_candidates`
5. motor deduplica por nome / domínio / CNPJ
6. candidato aprovado é promovido para `companies`
7. empresa promovida recebe link em `company_discovery_links`
8. empresa entra em monitoring + qualification + ranking

---

## Patch A — Novas tabelas de captura
Migration criada nesta etapa:
- `db/migrations/20260325_003_capture_ingestion_layer.sql`

Tabelas:
- `search_profile_runs`
- `discovered_company_candidates`
- `company_discovery_links`

Função dessas tabelas:
- registrar execução de discovery por profile
- registrar candidatos antes de virar company master
- manter rastreabilidade entre company promovida e origem da descoberta

---

## Patch B — `backend/src/types/platform.ts`
Adicionar os tipos abaixo:

```ts
export type SearchProfileRun = {
  id: string;
  searchProfileId: string;
  runStatus: 'queued' | 'running' | 'completed' | 'failed';
  triggerMode: 'manual' | 'scheduled' | 'bootstrap';
  sourceCount: number;
  candidatesFound: number;
  candidatesInserted: number;
  candidatesPromoted: number;
  notes?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveredCompanyCandidate = {
  id: string;
  searchProfileRunId: string;
  searchProfileId: string;
  companyName: string;
  legalName?: string;
  website?: string;
  normalizedDomain?: string;
  cnpj?: string;
  geography?: string;
  segment?: string;
  subsegment?: string;
  companyType?: string;
  creditProduct?: string;
  targetStructure?: string;
  sourceRef?: string;
  sourceUrl?: string;
  evidenceSummary?: string;
  receivables: string[];
  confidence: number;
  candidateStatus: 'captured' | 'deduped' | 'promoted' | 'discarded';
  companyId?: string;
  dedupeKey?: string;
  rawPayload: Record<string, unknown>;
  capturedAt: string;
  promotedAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

---

## Patch C — `backend/src/repositories/platformRepository.ts`
### Interface
Adicionar:

```ts
  createSearchProfileRun(input: Partial<SearchProfileRun> & { searchProfileId: string; triggerMode: string }): Promise<SearchProfileRun>;
  updateSearchProfileRun(id: string, patch: Partial<SearchProfileRun>): Promise<SearchProfileRun>;
  listSearchProfileRuns(searchProfileId?: string): Promise<SearchProfileRun[]>;

  insertDiscoveredCandidates(items: DiscoveredCompanyCandidate[]): Promise<DiscoveredCompanyCandidate[]>;
  listDiscoveredCandidates(searchProfileId?: string): Promise<DiscoveredCompanyCandidate[]>;
  updateDiscoveredCandidate(id: string, patch: Partial<DiscoveredCompanyCandidate>): Promise<DiscoveredCompanyCandidate>;

  linkCandidateToCompany(companyId: string, discoveredCandidateId: string, confidence: number, matchMethod: string): Promise<void>;
```

### Supabase mapping
Mapear para:
- `search_profile_runs`
- `discovered_company_candidates`
- `company_discovery_links`

### Memory fallback
Criar arrays locais equivalentes para a POC e manter comportamento consistente.

---

## Patch D — `backend/src/lib/discovery.ts`
Criar um serviço simples de captura usando fontes públicas gratuitas.

Objetivo do arquivo:
- receber um `SearchProfile`
- montar queries por segmento / subsegmento / target structure
- capturar candidatos a partir de RSS / sites públicos
- normalizar nome / domínio / dedupe_key

Estrutura sugerida:

```ts
export type DiscoverySourceHit = {
  companyName: string;
  website?: string;
  sourceRef: string;
  sourceUrl?: string;
  evidenceSummary: string;
  confidence: number;
  rawPayload: Record<string, unknown>;
};

export async function runSearchProfileDiscovery(profile: SearchProfile): Promise<DiscoverySourceHit[]> {
  // 1. RSS news por setor
  // 2. páginas públicas como Open Startups / rankings
  // 3. websites e listas públicas já catalogadas
  return [];
}
```

Regra mínima de dedupe:
- preferir `cnpj`
- depois `normalized_domain`
- depois `normalize(companyName)`

---

## Patch E — `backend/src/services/platformService.ts`
Adicionar o fluxo abaixo:

```ts
async runSearchProfileCapture(searchProfileId: string, triggerMode: 'manual' | 'scheduled' | 'bootstrap' = 'manual')
async promoteCandidateToCompany(candidateId: string)
```

### `runSearchProfileCapture`
Passos:
1. carregar `search_profile`
2. criar `search_profile_run`
3. chamar `runSearchProfileDiscovery(profile)`
4. transformar hits em `DiscoveredCompanyCandidate`
5. persistir candidatos
6. atualizar run com contagem final
7. devolver resumo operacional

### `promoteCandidateToCompany`
Passos:
1. carregar candidato
2. montar `CompanySeed`
3. salvar em `companies`
4. criar `company_discovery_links`
5. marcar candidato como `promoted`
6. disparar `refreshMonitoring(companyId)`
7. disparar `recomputeDerivedData(companyId)`

---

## Patch F — `backend/src/server.ts`
Adicionar rotas novas:

```ts
app.get('/search-profile-runs', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.listSearchProfileRuns(req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined)));
}));

app.post('/search-profiles/:id/capture', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.runSearchProfileCapture(param(req.params.id), req.body?.triggerMode ?? 'manual')));
}));

app.get('/discovered-candidates', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.listDiscoveredCandidates(req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined)));
}));

app.post('/discovered-candidates/:id/promote', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.promoteCandidateToCompany(param(req.params.id))));
}));
```

---

## Patch G — `frontend/src/lib/types.ts`
Adicionar:

```ts
export type SearchProfileRun = {
  id: string;
  searchProfileId: string;
  runStatus: string;
  triggerMode: string;
  candidatesFound: number;
  candidatesInserted: number;
  candidatesPromoted: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
};

export type DiscoveredCompanyCandidate = {
  id: string;
  searchProfileId: string;
  companyName: string;
  website?: string;
  sourceRef?: string;
  sourceUrl?: string;
  evidenceSummary?: string;
  confidence: number;
  candidateStatus: string;
  companyId?: string;
  capturedAt: string;
};
```

---

## Patch H — `frontend/src/lib/api.ts`
Adicionar métodos:

```ts
captureSearchProfile: (session: SessionData | null, searchProfileId: string, triggerMode = 'manual') =>
  requestEnvelope(`/search-profiles/${searchProfileId}/capture`, session, { method: 'POST', body: JSON.stringify({ triggerMode }) }),

getSearchProfileRuns: async (session: SessionData | null, searchProfileId?: string) =>
  toState('Search profile runs', await requestEnvelope<SearchProfileRun[]>(`/search-profile-runs${searchProfileId ? `?searchProfileId=${searchProfileId}` : ''}`, session)),

getDiscoveredCandidates: async (session: SessionData | null, searchProfileId?: string) =>
  toState('Discovered candidates', await requestEnvelope<DiscoveredCompanyCandidate[]>(`/discovered-candidates${searchProfileId ? `?searchProfileId=${searchProfileId}` : ''}`, session)),

promoteCandidate: (session: SessionData | null, candidateId: string) =>
  requestEnvelope(`/discovered-candidates/${candidateId}/promote`, session, { method: 'POST' }),
```

---

## Patch I — Frontend operacional mínimo
Telas mínimas possíveis sem abrir arquitetura:

1. `SearchProfilesPage`
   - botão `Executar captura`
   - tabela de `últimos runs`

2. `DataIntelligencePage`
   - bloco `Captured Candidates`
   - ação `Promover para companies`

3. `CompanyDetailPage`
   - exibir origem da descoberta se houver `company_discovery_links`

---

## Critério de aceite
Este bloco fecha quando:
1. um `search_profile` consegue gerar `search_profile_run`
2. o backend persiste candidatos em `discovered_company_candidates`
3. ao menos um candidato pode ser promovido para `companies`
4. a empresa promovida entra no fluxo de monitoring + qualification
5. a UI consegue mostrar runs e candidatos capturados

---

## Prioridade prática
Aplicação sugerida em ordem:
1. Patch B
2. Patch D
3. Patch E
4. Patch F
5. Patch G
6. Patch H
7. Patch I

---

## Observação
Este patch pack foi desenhado para aumentar capacidade real de originação:
- descobrir empresas novas
- registrar por que elas apareceram
- promover rapidamente para o motor principal
- preservar auditoria e explicabilidade da tese
