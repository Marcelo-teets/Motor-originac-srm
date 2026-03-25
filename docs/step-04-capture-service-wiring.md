# Step 04 — Capture service wiring

## Objetivo
Integrar a nova camada de capture/ingestion já criada no repositório ao backend principal do Motor, sem reabrir arquitetura.

Arquivos já criados e prontos para uso:
- `db/migrations/20260325_003_capture_ingestion_layer.sql`
- `backend/src/lib/discoveryPublicSources.ts`
- `backend/src/lib/discoveryCapture.ts`
- `backend/src/lib/candidatePromotion.ts`
- `backend/src/lib/companyDiscoveryMatching.ts`
- `backend/src/services/searchProfileCaptureService.ts`

---

## O que já existe
A camada nova já cobre:
1. schema de runs e candidatos
2. parsing e discovery por RSS público
3. normalização e dedupe
4. transformação para `CompanySeed`
5. orquestração de run
6. promoção de candidato para `companies`

O que falta é plugar isso no backend principal.

---

## Patch A — `backend/src/types/platform.ts`
Adicionar os tipos abaixo ao arquivo existente:

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

## Patch B — `backend/src/repositories/platformRepository.ts`
### Interface
Adicionar:

```ts
  createSearchProfileRun(input: { searchProfileId: string; triggerMode: 'manual' | 'scheduled' | 'bootstrap'; startedAt: string; metadata?: Record<string, unknown> }): Promise<SearchProfileRun>;
  updateSearchProfileRun(id: string, patch: Partial<SearchProfileRun>): Promise<SearchProfileRun>;
  listSearchProfileRuns(searchProfileId?: string): Promise<SearchProfileRun[]>;

  insertDiscoveredCandidates(items: Array<Omit<DiscoveredCompanyCandidate, 'id' | 'capturedAt' | 'createdAt' | 'updatedAt'>>): Promise<DiscoveredCompanyCandidate[]>;
  listDiscoveredCandidates(searchProfileId?: string): Promise<DiscoveredCompanyCandidate[]>;
  getDiscoveredCandidate(id: string): Promise<DiscoveredCompanyCandidate | null>;
  updateDiscoveredCandidate(id: string, patch: Partial<DiscoveredCompanyCandidate>): Promise<DiscoveredCompanyCandidate>;

  upsertCompanySeed(seed: CompanySeed): Promise<{ companyId: string; created: boolean }>;
  linkCandidateToCompany(companyId: string, candidateId: string, confidence: number, matchMethod: string): Promise<void>;
```

### Supabase mapping
Mapear para:
- `search_profile_runs`
- `discovered_company_candidates`
- `company_discovery_links`
- `companies`

### Memory mapping
Criar arrays simples em memória para POC:
- `searchProfileRuns`
- `discoveredCandidates`
- `companyDiscoveryLinks`

---

## Patch C — `backend/src/services/platformService.ts`
Importar o novo service:

```ts
import { SearchProfileCaptureService } from './searchProfileCaptureService.js';
```

Adicionar método privado para montar adapter:

```ts
private buildSearchProfileCaptureService() {
  return new SearchProfileCaptureService({
    getSearchProfile: async (id) => (await this.repository.listSearchProfiles()).find((item) => item.id === id) ?? null,
    listExistingCompanies: async () => (await this.repository.listCompanies()).map((item) => ({
      id: item.id,
      name: item.name,
    })),
    createSearchProfileRun: (input) => this.repository.createSearchProfileRun(input),
    updateSearchProfileRun: (id, patch) => this.repository.updateSearchProfileRun(id, patch),
    insertDiscoveredCandidates: (items) => this.repository.insertDiscoveredCandidates(items),
    getDiscoveredCandidate: (id) => this.repository.getDiscoveredCandidate(id),
    updateDiscoveredCandidate: (id, patch) => this.repository.updateDiscoveredCandidate(id, patch),
    upsertCompanySeed: (seed) => this.repository.upsertCompanySeed(seed),
    linkCandidateToCompany: (companyId, candidateId, confidence, matchMethod) =>
      this.repository.linkCandidateToCompany(companyId, candidateId, confidence, matchMethod),
  }, {
    refreshMonitoring: (companyId) => this.refreshMonitoring(companyId),
    recomputeDerivedData: (companyId) => this.recomputeDerivedData(companyId),
  });
}
```

Adicionar métodos públicos:

```ts
async runSearchProfileCapture(searchProfileId: string, triggerMode: 'manual' | 'scheduled' | 'bootstrap' = 'manual') {
  return this.buildSearchProfileCaptureService().runCapture(searchProfileId, triggerMode);
}

async promoteDiscoveredCandidate(candidateId: string) {
  return this.buildSearchProfileCaptureService().promoteCandidate(candidateId);
}

async listSearchProfileRuns(searchProfileId?: string) {
  return this.repository.listSearchProfileRuns(searchProfileId);
}

async listDiscoveredCandidates(searchProfileId?: string) {
  return this.repository.listDiscoveredCandidates(searchProfileId);
}
```

---

## Patch D — `backend/src/server.ts`
Adicionar rotas:

```ts
app.get('/search-profile-runs', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.listSearchProfileRuns(req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined)));
}));

app.get('/discovered-candidates', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.listDiscoveredCandidates(req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined)));
}));

app.post('/search-profiles/:id/capture', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.runSearchProfileCapture(param(req.params.id), req.body?.triggerMode ?? 'manual')));
}));

app.post('/discovered-candidates/:id/promote', wrap(async (req, res) => {
  res.json(ok(platformMode, await service.promoteDiscoveredCandidate(param(req.params.id))));
}));
```

---

## Patch E — `frontend/src/lib/types.ts`
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

## Patch F — `frontend/src/lib/api.ts`
Adicionar métodos:

```ts
getSearchProfileRuns: async (session: SessionData | null, searchProfileId?: string) =>
  toState('Search profile runs', await requestEnvelope<SearchProfileRun[]>(`/search-profile-runs${searchProfileId ? `?searchProfileId=${searchProfileId}` : ''}`, session)),

getDiscoveredCandidates: async (session: SessionData | null, searchProfileId?: string) =>
  toState('Discovered candidates', await requestEnvelope<DiscoveredCompanyCandidate[]>(`/discovered-candidates${searchProfileId ? `?searchProfileId=${searchProfileId}` : ''}`, session)),

captureSearchProfile: (session: SessionData | null, searchProfileId: string, triggerMode = 'manual') =>
  requestEnvelope(`/search-profiles/${searchProfileId}/capture`, session, { method: 'POST', body: JSON.stringify({ triggerMode }) }),

promoteDiscoveredCandidate: (session: SessionData | null, candidateId: string) =>
  requestEnvelope(`/discovered-candidates/${candidateId}/promote`, session, { method: 'POST' }),
```

---

## Patch G — Frontend mínimo sugerido
Sem abrir arquitetura nova, usar as telas existentes:

### `SearchProfilesPage`
- botão `Executar captura`
- bloco `Últimos runs`

### `DataIntelligencePage`
- tabela `Captured Candidates`
- botão `Promover para companies`

### `CompanyDetailPage`
- exibir badge `captured lead` quando houver origem em discovery

---

## Critério de aceite
Fechamos este bloco quando:
1. um profile ativo executa captura
2. candidatos aparecem em `discovered_company_candidates`
3. promoção cria/atualiza `companies`
4. promotion dispara monitoring + derived data
5. frontend exibe runs e candidatos capturados

---

## Resultado estratégico
Este wiring fecha o elo que faltava entre:
- descoberta
- captura
- promoção
- monitoring
- qualification
- ranking
- ação comercial

Ou seja: melhora diretamente a capacidade do projeto de originar operações reais.
