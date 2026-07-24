import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import { buildApiUrl } from '../lib/runtimeConfig';

type QueueType = 'commercial' | 'identity' | 'market_map' | 'promoted';

type QueueItem = {
  id: string;
  companyName: string;
  legalName?: string;
  cnpj?: string;
  website?: string;
  normalizedDomain?: string;
  companyType?: string;
  targetStructure?: string;
  sourceFamily: string;
  sourceUrl?: string;
  evidenceSummary?: string;
  confidence: number;
  candidateStatus: string;
  matchedCompanyId?: string;
  candidateRole: string;
  queueType: QueueType;
  instrumentType?: string;
  eventCount: number;
  latestEventDate?: string;
  latestVolume?: number;
  promotionReady: boolean;
  promotionBlockers: string[];
  priorityScore: number;
  priorityTier: string;
  nextAction: string;
  whyNow: string;
};

type QueueStats = {
  totalCandidates: number;
  commercialCandidates: number;
  marketMapCandidates: number;
  identityCandidates: number;
  promotedCandidates: number;
  p1Commercial: number;
  p2Commercial: number;
  validCnpj: number;
  promotionReady: number;
  duplicateGroups: number;
};

type QueueResponse = {
  items: QueueItem[];
  pagination: { limit: number; offset: number; total: number };
  stats: QueueStats;
};

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '');
const numberValue = (...values: unknown[]) => {
  const parsed = Number(values.find((value) => value !== null && value !== undefined && value !== '') ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const booleanValue = (value: unknown) => value === true || value === 'true';
const arrayValue = (value: unknown) => Array.isArray(value) ? value.map(String) : [];

const normalizeItem = (value: unknown): QueueItem => {
  const raw = asRecord(value);
  return {
    id: text(raw.id),
    companyName: text(raw.companyName, raw.company_name, 'Empresa sem nome'),
    legalName: text(raw.legalName, raw.legal_name) || undefined,
    cnpj: text(raw.cnpj) || undefined,
    website: text(raw.website) || undefined,
    normalizedDomain: text(raw.normalizedDomain, raw.normalized_domain) || undefined,
    companyType: text(raw.companyType, raw.company_type) || undefined,
    targetStructure: text(raw.targetStructure, raw.target_structure) || undefined,
    sourceFamily: text(raw.sourceFamily, raw.source_family, 'unknown'),
    sourceUrl: text(raw.sourceUrl, raw.source_url) || undefined,
    evidenceSummary: text(raw.evidenceSummary, raw.evidence_summary) || undefined,
    confidence: numberValue(raw.confidence),
    candidateStatus: text(raw.candidateStatus, raw.candidate_status, 'captured'),
    matchedCompanyId: text(raw.matchedCompanyId, raw.matched_company_id) || undefined,
    candidateRole: text(raw.candidateRole, raw.candidate_role, 'needs_classification'),
    queueType: text(raw.queueType, raw.queue_type, 'identity') as QueueType,
    instrumentType: text(raw.instrumentType, raw.instrument_type) || undefined,
    eventCount: numberValue(raw.eventCount, raw.event_count),
    latestEventDate: text(raw.latestEventDate, raw.latest_event_date) || undefined,
    latestVolume: numberValue(raw.latestVolume, raw.latest_volume) || undefined,
    promotionReady: booleanValue(raw.promotionReady ?? raw.promotion_ready),
    promotionBlockers: arrayValue(raw.promotionBlockers ?? raw.promotion_blockers),
    priorityScore: numberValue(raw.priorityScore, raw.priority_score),
    priorityTier: text(raw.priorityTier, raw.priority_tier, 'P3'),
    nextAction: text(raw.nextAction, raw.next_action, 'Revisar candidata.'),
    whyNow: text(raw.whyNow, raw.why_now, raw.evidenceSummary, raw.evidence_summary),
  };
};

const emptyStats: QueueStats = {
  totalCandidates: 0, commercialCandidates: 0, marketMapCandidates: 0, identityCandidates: 0,
  promotedCandidates: 0, p1Commercial: 0, p2Commercial: 0, validCnpj: 0, promotionReady: 0, duplicateGroups: 0,
};

const normalizeStats = (value: unknown): QueueStats => {
  const raw = asRecord(value);
  return {
    totalCandidates: numberValue(raw.totalCandidates, raw.total_candidates),
    commercialCandidates: numberValue(raw.commercialCandidates, raw.commercial_candidates),
    marketMapCandidates: numberValue(raw.marketMapCandidates, raw.market_map_candidates),
    identityCandidates: numberValue(raw.identityCandidates, raw.identity_candidates),
    promotedCandidates: numberValue(raw.promotedCandidates, raw.promoted_candidates),
    p1Commercial: numberValue(raw.p1Commercial, raw.p1_commercial),
    p2Commercial: numberValue(raw.p2Commercial, raw.p2_commercial),
    validCnpj: numberValue(raw.validCnpj, raw.valid_cnpj),
    promotionReady: numberValue(raw.promotionReady, raw.promotion_ready),
    duplicateGroups: numberValue(raw.duplicateGroups, raw.duplicate_groups),
  };
};

const formatCnpj = (value?: string) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : 'CNPJ pendente';
};
const formatMoney = (value?: number) => value
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
  : null;
const tierTone = (tier: string): 'success' | 'warning' | 'info' | 'default' => tier === 'P1' || tier === 'MAP1'
  ? 'success'
  : tier === 'P2' || tier === 'MAP2' ? 'warning' : tier === 'MONITOR' ? 'info' : 'default';

const queueTabs: Array<{ value: QueueType; label: string; description: string }> = [
  { value: 'commercial', label: 'Fila comercial', description: 'emissores operacionais com trigger explícito' },
  { value: 'identity', label: 'Identidade', description: 'entidade jurídica ainda incompleta' },
  { value: 'market_map', label: 'Mapa de estruturas', description: 'FIDC, CRI, CRA e intermediários' },
  { value: 'promoted', label: 'Promovidas', description: 'entidades já ligadas ao Company Master' },
];

export function CandidateDecisionQueuePage() {
  const { session } = useAuth();
  const [queue, setQueue] = useState<QueueType>('commercial');
  const [priority, setPriority] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<QueueStats>(emptyStats);
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ queue, limit: String(pagination.limit), offset: String(pagination.offset) });
        if (priority) params.set('priority', priority);
        if (search) params.set('search', search);
        const response = await fetch(buildApiUrl(`/candidate-decision-queue?${params.toString()}`), { headers, credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error ?? 'Falha ao carregar Candidate Decision Queue.');
        const data = asRecord(payload?.data);
        if (!active) return;
        setItems(Array.isArray(data.items) ? data.items.map(normalizeItem) : []);
        setStats(normalizeStats(data.stats));
        const page = asRecord(data.pagination);
        setPagination((current) => ({
          limit: numberValue(page.limit) || current.limit,
          offset: numberValue(page.offset),
          total: numberValue(page.total),
        }));
        setError(null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar fila.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [headers, pagination.limit, pagination.offset, priority, queue, search]);

  const selectQueue = (value: QueueType) => {
    setQueue(value);
    setPriority('');
    setPagination((current) => ({ ...current, offset: 0 }));
  };
  const pageStart = pagination.total ? pagination.offset + 1 : 0;
  const pageEnd = Math.min(pagination.offset + pagination.limit, pagination.total);

  return (
    <div className="page capture-inbox-page">
      <PageIntro
        eyebrow="Capture Inbox · Candidate Decision Queue"
        title="Da evidência para a próxima ação"
        description="Prioriza emissores operacionais, separa veículos de mercado e mantém identidade e decisão de crédito em gates independentes. Nenhum registro é promovido automaticamente."
        actions={<div className="pill-row"><Pill tone="success">dados reais</Pill><Pill tone="warning">human-in-the-loop</Pill></div>}
      />
      <DataStatusBanner source="real" note="A fila é calculada no Supabase com lineage, CNPJ, evento, recência, volume, identidade e semântica econômica da entidade." />
      {error ? <Card title="Falha operacional" subtitle="Nenhuma decisão foi executada" tone="accent">{error}</Card> : null}

      <section className="grid cols-4">
        <Card title="Fila comercial" subtitle="Emissores operacionais"><Stat label="Candidatas" value={String(stats.commercialCandidates)} helper={`${stats.p1Commercial} P1 · ${stats.p2Commercial} P2`} /></Card>
        <Card title="Mapa de estruturas" subtitle="Veículos e intermediários"><Stat label="Registros" value={String(stats.marketMapCandidates)} helper="usar para encontrar a parte econômica" /></Card>
        <Card title="Identidade" subtitle="Reconciliação pendente"><Stat label="Candidatas" value={String(stats.identityCandidates)} helper={`${stats.validCnpj} CNPJs válidos no universo`} /></Card>
        <Card title="Company Master" subtitle="Entidades promovidas"><Stat label="Empresas" value={String(stats.promotedCandidates)} helper={`${stats.promotionReady} prontas para finalização humana`} /></Card>
      </section>

      <Card title="Filas de decisão" subtitle="Cada registro tem uma finalidade econômica diferente" className="dense-card">
        <div className="decision-strip">
          {queueTabs.map((tab) => (
            <button key={tab.value} type="button" className={queue === tab.value ? 'secondary active' : 'secondary'} onClick={() => selectQueue(tab.value)}>
              <strong>{tab.label}</strong><span>{tab.description}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Filtros" subtitle="A fila é paginada no backend" className="dense-card">
        <div className="filters-row">
          <label>Prioridade<select value={priority} onChange={(event) => { setPriority(event.target.value); setPagination((current) => ({ ...current, offset: 0 })); }}><option value="">Todas</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option><option value="MAP1">MAP1</option><option value="MAP2">MAP2</option><option value="MAP3">MAP3</option><option value="MONITOR">Monitor</option></select></label>
          <label>Empresa ou CNPJ<input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setSearch(searchDraft.trim()); setPagination((current) => ({ ...current, offset: 0 })); } }} placeholder="Buscar na fila" /></label>
          <button type="button" onClick={() => { setSearch(searchDraft.trim()); setPagination((current) => ({ ...current, offset: 0 })); }}>Buscar</button>
          {(search || priority) ? <button type="button" className="secondary" onClick={() => { setSearch(''); setSearchDraft(''); setPriority(''); setPagination((current) => ({ ...current, offset: 0 })); }}>Limpar</button> : null}
        </div>
      </Card>

      <Card title={queueTabs.find((tab) => tab.value === queue)?.label ?? 'Fila'} subtitle={`${pageStart}-${pageEnd} de ${pagination.total} registros`} className="dense-card">
        {loading ? <p className="table-helper">Calculando prioridade e próxima ação...</p> : items.length ? (
          <div className="fidc-table-wrap">
            <table className="dense-table">
              <thead><tr><th>Prioridade</th><th>Empresa</th><th>Trigger</th><th>Identidade</th><th>Próxima ação</th></tr></thead>
              <tbody>{items.map((item) => (
                <tr key={item.id}>
                  <td><Pill tone={tierTone(item.priorityTier)}>{item.priorityTier}</Pill><div className="table-helper">score {item.priorityScore}</div></td>
                  <td><strong>{item.companyName}</strong><div className="table-helper">{item.companyType || item.candidateRole.replaceAll('_', ' ')}</div><div className="table-helper">{item.targetStructure || item.instrumentType || 'estrutura a validar'}</div></td>
                  <td><strong>{item.whyNow || 'Sem trigger consolidado'}</strong><div className="table-helper">{item.sourceFamily} · confiança {(item.confidence * 100).toFixed(0)}%</div>{item.latestVolume ? <div className="table-helper">{formatMoney(item.latestVolume)}</div> : null}{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="table-helper">Abrir fonte</a> : null}</td>
                  <td><strong className="mono">{formatCnpj(item.cnpj)}</strong><div className="table-helper">{item.normalizedDomain || item.website || 'site/domínio pendente'}</div><div className="pill-row top-gap"><Pill tone={item.promotionReady ? 'success' : 'warning'}>{item.promotionReady ? 'identidade pronta' : `${item.promotionBlockers.length} blocker(s)`}</Pill></div></td>
                  <td><strong>{item.nextAction}</strong><div className="pill-row top-gap">{item.queueType === 'market_map' ? <Link to="/market-map" className="secondary">Abrir mapa</Link> : item.matchedCompanyId ? <Link to={`/companies/${item.matchedCompanyId}`} className="secondary">Abrir empresa</Link> : <Link to="/identity-review" className="secondary">Revisar identidade</Link>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Nenhum registro nesta fila." description="A classificação não encontrou candidatas que atendam aos filtros atuais." />}
        <div className="pill-row top-gap">
          <button type="button" className="secondary" disabled={pagination.offset === 0 || loading} onClick={() => setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Anterior</button>
          <button type="button" className="secondary" disabled={pagination.offset + pagination.limit >= pagination.total || loading} onClick={() => setPagination((current) => ({ ...current, offset: current.offset + current.limit }))}>Próxima</button>
          {stats.duplicateGroups ? <Pill tone="warning">{stats.duplicateGroups} grupos duplicados</Pill> : <Pill tone="success">sem duplicatas exatas</Pill>}
        </div>
      </Card>
    </div>
  );
}
