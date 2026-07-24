import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import { buildApiUrl } from '../lib/runtimeConfig';

type QueueLane =
  | 'identity_review_queue'
  | 'vehicle_context_only'
  | 'market_infrastructure_context'
  | 'parent_resolution_required'
  | 'identity_enrichment_required';

type EntityType =
  | 'operating_company'
  | 'regulated_credit_company'
  | 'investment_vehicle'
  | 'market_infrastructure'
  | 'regulated_financial_institution'
  | 'special_purpose_vehicle'
  | 'identity_incomplete';

type TriageSummary = {
  total: number;
  identity_review_queue: number;
  vehicle_context_only: number;
  market_infrastructure_context: number;
  parent_resolution_required: number;
  identity_enrichment_required: number;
};

type TriageCandidate = {
  candidateId: string;
  companyName: string;
  legalName: string;
  cnpj: string;
  website: string;
  sourceRef: string;
  sourceUrl: string;
  evidenceSummary: string;
  sourceConfidence: number;
  finalEntityType: EntityType;
  automatedEntityType: EntityType;
  classificationStatus: string;
  classificationConfidence: number;
  classificationRationale: string;
  queueLane: QueueLane;
  latestEventDate?: string;
  maturityDate?: string;
  instrumentType?: string;
  latestEventVolume?: number;
  eventCount: number;
  instrumentTypes: string[];
  promotionBlockers: string[];
  nextAction: string;
  triagePriority: number;
};

type ReviewForm = {
  legalName: string;
  cnpj: string;
  website: string;
  identitySourceUrl: string;
  evidenceSummary: string;
  confidence: string;
  reviewNotes: string;
  finalEntityType: EntityType;
};

const EMPTY_SUMMARY: TriageSummary = {
  total: 0,
  identity_review_queue: 0,
  vehicle_context_only: 0,
  market_infrastructure_context: 0,
  parent_resolution_required: 0,
  identity_enrichment_required: 0,
};

const emptyForm: ReviewForm = {
  legalName: '',
  cnpj: '',
  website: '',
  identitySourceUrl: '',
  evidenceSummary: '',
  confidence: '0.90',
  reviewNotes: '',
  finalEntityType: 'operating_company',
};

const LANES: Array<{ key: QueueLane; label: string; short: string }> = [
  { key: 'identity_review_queue', label: 'Empresas operacionais', short: 'Revisar identidade' },
  { key: 'parent_resolution_required', label: 'SPEs', short: 'Resolver sponsor' },
  { key: 'identity_enrichment_required', label: 'Identidade incompleta', short: 'Enriquecer' },
  { key: 'vehicle_context_only', label: 'Fundos e veículos', short: 'Contexto FIDC' },
  { key: 'market_infrastructure_context', label: 'Infraestrutura de mercado', short: 'Contexto de mercado' },
];

const ENTITY_LABELS: Record<EntityType, string> = {
  operating_company: 'Empresa operacional',
  regulated_credit_company: 'Companhia de crédito regulada',
  investment_vehicle: 'Fundo / veículo de investimento',
  market_infrastructure: 'Infraestrutura de mercado',
  regulated_financial_institution: 'Instituição financeira regulada',
  special_purpose_vehicle: 'SPE',
  identity_incomplete: 'Identidade incompleta',
};

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '');
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const stringArray = (value: unknown) => asArray(value).map(String).filter(Boolean);

const normalizeCandidate = (value: unknown): TriageCandidate => {
  const row = asRecord(value);
  return {
    candidateId: text(row.candidate_id, row.candidateId),
    companyName: text(row.company_name, row.companyName, 'Empresa sem nome'),
    legalName: text(row.legal_name, row.legalName),
    cnpj: text(row.cnpj),
    website: text(row.website),
    sourceRef: text(row.source_ref, row.sourceRef),
    sourceUrl: text(row.source_url, row.sourceUrl),
    evidenceSummary: text(row.evidence_summary, row.evidenceSummary),
    sourceConfidence: number(row.source_confidence ?? row.sourceConfidence),
    finalEntityType: text(row.final_entity_type, row.finalEntityType, 'identity_incomplete') as EntityType,
    automatedEntityType: text(row.automated_entity_type, row.automatedEntityType, 'identity_incomplete') as EntityType,
    classificationStatus: text(row.classification_status, row.classificationStatus, 'auto'),
    classificationConfidence: number(row.classification_confidence ?? row.classificationConfidence),
    classificationRationale: text(row.classification_rationale, row.classificationRationale),
    queueLane: text(row.queue_lane, row.queueLane, 'identity_enrichment_required') as QueueLane,
    latestEventDate: text(row.latest_event_date, row.latestEventDate) || undefined,
    maturityDate: text(row.maturity_date, row.maturityDate) || undefined,
    instrumentType: text(row.instrument_type, row.instrumentType) || undefined,
    latestEventVolume: number(row.latest_event_volume ?? row.latestEventVolume) || undefined,
    eventCount: number(row.event_count ?? row.eventCount),
    instrumentTypes: stringArray(row.instrument_types ?? row.instrumentTypes),
    promotionBlockers: stringArray(row.promotion_blockers ?? row.promotionBlockers),
    nextAction: text(row.next_action, row.nextAction),
    triagePriority: number(row.triage_priority ?? row.triagePriority),
  };
};

const normalizeSummary = (value: unknown): TriageSummary => {
  const row = asRecord(value);
  return {
    total: number(row.total),
    identity_review_queue: number(row.identity_review_queue),
    vehicle_context_only: number(row.vehicle_context_only),
    market_infrastructure_context: number(row.market_infrastructure_context),
    parent_resolution_required: number(row.parent_resolution_required),
    identity_enrichment_required: number(row.identity_enrichment_required),
  };
};

const formatCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : value;
};
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`)) : '—';
const formatMoney = (value?: number) => value
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
  : '—';

export function CandidateIdentityReviewPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<TriageSummary>(EMPTY_SUMMARY);
  const [candidates, setCandidates] = useState<TriageCandidate[]>([]);
  const [lane, setLane] = useState<QueueLane>('identity_review_queue');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  const fetchTriage = async (query: string) => {
    const response = await fetch(buildApiUrl(`/candidate-triage${query}`), { headers, credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? 'Falha ao carregar a fila de triagem.');
    return asRecord(payload?.data);
  };

  const load = async (selectedLane: QueueLane = lane) => {
    try {
      setLoading(true);
      const [overview, queue] = await Promise.all([
        fetchTriage('?limit=1'),
        fetchTriage(`?limit=100&queueLane=${encodeURIComponent(selectedLane)}`),
      ]);
      setSummary(normalizeSummary(overview.summary));
      setCandidates(asArray(queue.candidates).map(normalizeCandidate));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar a fila de triagem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(lane); }, [headers, lane]);

  const active = candidates.find((candidate) => candidate.candidateId === activeId) ?? null;
  const laneMeta = LANES.find((item) => item.key === lane) ?? LANES[0];
  const canApprove = active?.finalEntityType === 'operating_company' || active?.finalEntityType === 'regulated_credit_company';

  const selectCandidate = (candidate: TriageCandidate) => {
    setActiveId(candidate.candidateId);
    setForm({
      legalName: candidate.legalName || candidate.companyName,
      cnpj: formatCnpj(candidate.cnpj),
      website: candidate.website,
      identitySourceUrl: candidate.sourceUrl,
      evidenceSummary: candidate.evidenceSummary,
      confidence: String(Math.max(0.70, candidate.sourceConfidence || 0.90).toFixed(2)),
      reviewNotes: '',
      finalEntityType: candidate.finalEntityType,
    });
    setError(null);
    setSuccess(null);
  };

  const updateField = <K extends keyof ReviewForm>(field: K, value: ReviewForm[K]) => setForm((current) => ({ ...current, [field]: value }));

  const postAction = async (body: Record<string, unknown>) => {
    const response = await fetch(buildApiUrl('/candidate-triage'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? 'A operação foi bloqueada.');
    return payload;
  };

  const confirmClassification = async () => {
    if (!active) return;
    try {
      setSubmitting(true);
      setError(null);
      await postAction({
        action: 'confirm_classification',
        candidateId: active.candidateId,
        finalEntityType: form.finalEntityType,
        reviewNotes: form.reviewNotes,
      });
      setSuccess(`Classificação de ${active.companyName} confirmada como ${ENTITY_LABELS[form.finalEntityType]}.`);
      await load(lane);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao confirmar classificação.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitIdentity = async (action: 'approve_identity' | 'reject_identity') => {
    if (!active) return;
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      await postAction({
        action,
        candidateId: active.candidateId,
        legalName: form.legalName,
        cnpj: form.cnpj,
        website: form.website,
        identitySourceUrl: form.identitySourceUrl,
        evidenceSummary: form.evidenceSummary,
        confidence: Number(form.confidence),
        reviewNotes: form.reviewNotes,
        reason: form.reviewNotes,
      });
      setSuccess(action === 'approve_identity'
        ? `${active.companyName} entrou no Company Master como entidade real e monitorável, ainda fora de score e pipeline.`
        : `${active.companyName} foi descartada com justificativa auditável.`);
      setActiveId(null);
      setForm(emptyForm);
      await load(lane);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na revisão de identidade.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !candidates.length) {
    return <div className="page"><Card title="Identity Review" subtitle="Carregando fila governada">Aguarde...</Card></div>;
  }

  return (
    <div className="page">
      <PageIntro
        eyebrow="GOD-MODE · Entity Resolution"
        title="Triagem do Company Master"
        description="Separe empresas operacionais de fundos, infraestrutura de mercado e SPEs. A aprovação valida apenas identidade e monitoramento; crédito, score, ranking e pipeline continuam bloqueados até análise própria."
        actions={<div className="pill-row"><Pill tone="success">Supabase real</Pill><Pill tone="warning">sem promoção automática</Pill></div>}
      />
      <DataStatusBanner source="real" note="Classificação, override, aprovação e rejeição possuem lineage, usuário, evidência e gate transacional." />
      {error ? <Card title="Operação bloqueada" subtitle="Nenhuma alteração parcial foi persistida" tone="accent">{error}</Card> : null}
      {success ? <Card title="Operação concluída" subtitle="Resultado persistido com governança" tone="success">{success}</Card> : null}

      <section className="grid cols-3">
        <Card title="Fila operacional" subtitle="Empresas candidatas a monitoramento">
          <Stat label="Revisar identidade" value={String(summary.identity_review_queue)} helper="empresas operacionais ou crédito regulado" />
        </Card>
        <Card title="Contexto, não lead" subtitle="Veículos e infraestrutura">
          <Stat label="Registros" value={String(summary.vehicle_context_only + summary.market_infrastructure_context)} helper="mantidos para inteligência de transações" />
        </Card>
        <Card title="Resolver antes" subtitle="SPEs e identidades incompletas">
          <Stat label="Registros" value={String(summary.parent_resolution_required + summary.identity_enrichment_required)} helper="exigem sponsor ou enriquecimento" />
        </Card>
      </section>

      <Card title="Lanes de triagem" subtitle="Escolha o universo que precisa de ação" className="dense-card">
        <div className="pill-row">
          {LANES.map((item) => (
            <button
              type="button"
              key={item.key}
              className={lane === item.key ? '' : 'secondary'}
              onClick={() => { setLane(item.key); setActiveId(null); setForm(emptyForm); }}
            >
              {item.label} · {summary[item.key]}
            </button>
          ))}
        </div>
      </Card>

      <section className="grid cols-2 detail-layout">
        <Card title={laneMeta.label} subtitle={`${laneMeta.short} · ordenado por prioridade`} className="dense-card">
          {candidates.length ? (
            <div className="stack-blocks compact-gap">
              {candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.candidateId}
                  className={activeId === candidate.candidateId ? 'secondary active' : 'secondary'}
                  onClick={() => selectCandidate(candidate)}
                >
                  <strong>{candidate.companyName}</strong>
                  <span>Prioridade {candidate.triagePriority} · {ENTITY_LABELS[candidate.finalEntityType]}</span>
                  <span>{candidate.instrumentType || candidate.instrumentTypes.join(', ') || 'sem instrumento'} · {candidate.eventCount} evento(s) · {formatDate(candidate.latestEventDate)}</span>
                </button>
              ))}
            </div>
          ) : <EmptyState title="Fila vazia." description="Não há candidatas nessa lane com o filtro atual." />}
        </Card>

        <Card title={active ? active.companyName : 'Dossiê de triagem'} subtitle="Classificação, evento e identidade" className="dense-card">
          {active ? (
            <div className="stack-blocks">
              <div className="pill-row">
                <Pill tone={canApprove ? 'success' : 'warning'}>{ENTITY_LABELS[active.finalEntityType]}</Pill>
                <Pill>{active.classificationStatus}</Pill>
                <Pill>prioridade {active.triagePriority}</Pill>
              </div>

              <ul className="list compact-list">
                <li><strong>CNPJ</strong><span>{formatCnpj(active.cnpj) || 'não informado'}</span></li>
                <li><strong>Instrumento</strong><span>{active.instrumentType || active.instrumentTypes.join(', ') || 'não identificado'}</span></li>
                <li><strong>Evento mais recente</strong><span>{formatDate(active.latestEventDate)}</span></li>
                <li><strong>Volume</strong><span>{formatMoney(active.latestEventVolume)}</span></li>
                <li><strong>Recorrência</strong><span>{active.eventCount} evento(s)</span></li>
                <li><strong>Próxima ação</strong><span>{active.nextAction}</span></li>
              </ul>

              {active.promotionBlockers.length ? (
                <div>
                  <strong>Blockers atuais</strong>
                  <div className="pill-row">{active.promotionBlockers.map((blocker) => <Pill key={blocker} tone="warning">{blocker}</Pill>)}</div>
                </div>
              ) : null}

              <label>
                Classificação final
                <select value={form.finalEntityType} onChange={(event) => updateField('finalEntityType', event.target.value as EntityType)}>
                  {Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Notas da classificação<textarea rows={2} value={form.reviewNotes} onChange={(event) => updateField('reviewNotes', event.target.value)} placeholder="Justifique confirmação ou override." /></label>
              <button type="button" className="secondary" disabled={submitting} onClick={() => void confirmClassification()}>Confirmar classificação</button>

              <label>Razão social verificada<input value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} /></label>
              <label>CNPJ<input value={form.cnpj} onChange={(event) => updateField('cnpj', formatCnpj(event.target.value))} /></label>
              <label>Website oficial<input value={form.website} onChange={(event) => updateField('website', event.target.value)} placeholder="https://empresa.com.br" /></label>
              <label>URL oficial da identidade<input value={form.identitySourceUrl} onChange={(event) => updateField('identitySourceUrl', event.target.value)} /></label>
              <label>Resumo da evidência<textarea rows={5} value={form.evidenceSummary} onChange={(event) => updateField('evidenceSummary', event.target.value)} placeholder="Descreva razão social, CNPJ e vínculo com o domínio. Não inferir crédito." /></label>
              <label>Confiança<input type="number" min="0.70" max="1" step="0.01" value={form.confidence} onChange={(event) => updateField('confidence', event.target.value)} /></label>

              <div className="pill-row">
                <button type="button" disabled={submitting || !canApprove} onClick={() => void submitIdentity('approve_identity')}>
                  {submitting ? 'Processando...' : 'Aprovar identidade monitorável'}
                </button>
                <button type="button" className="secondary" disabled={submitting || form.reviewNotes.trim().length < 20} onClick={() => void submitIdentity('reject_identity')}>Descartar com justificativa</button>
              </div>
              {!canApprove ? <small>Esta classificação não pode entrar no Company Master operacional. Confirme um override fundamentado ou mantenha o registro como contexto.</small> : null}
            </div>
          ) : <EmptyState title="Selecione uma candidata." description="O dossiê mostra evento, tipo de entidade, blockers e ações permitidas." />}
        </Card>
      </section>
    </div>
  );
}
