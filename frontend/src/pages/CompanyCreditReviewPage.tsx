import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import { buildApiUrl } from '../lib/runtimeConfig';

type ReviewOutcome = 'eligible' | 'monitor_only' | 'ineligible';
type EvidenceDimension = 'credit_product' | 'receivables' | 'funding' | 'timing';

type QueueCompany = {
  company_id: string;
  legal_name: string;
  trade_name: string;
  cnpj: string;
  domain: string;
  latest_review_id?: string | null;
  review_version?: number | null;
  review_status?: string | null;
  approved_outcome?: ReviewOutcome | null;
  confidence?: number | null;
  monitoring_output_count: number;
  signal_count: number;
  enrichment_count: number;
  metadata: Record<string, unknown>;
};

type QueuePayload = {
  companies: QueueCompany[];
  summary: {
    total: number;
    notStarted: number;
    needsEvidence: number;
    draft: number;
    approved: number;
    rejected: number;
    decisionEligible: number;
  };
};

type EvidenceCandidate = {
  id: string;
  signal_type: string;
  signal_label?: string;
  strength: number;
  confidence: number;
  evidence_url?: string;
  evidence_text?: string;
  source_name?: string;
  observed_at?: string;
};

type ReviewPacket = {
  company: Record<string, unknown>;
  latestReview?: Record<string, unknown> | null;
  evidenceCandidates: EvidenceCandidate[];
  counts: { monitoringOutputs: number; signals: number; enrichments: number; qualifications: number; scores: number };
};

type EvidenceRow = { dimension: EvidenceDimension; title: string; url: string; observedAt: string; sourceType: string };

type ReviewForm = {
  hasCreditProduct: boolean;
  creditIsCore: boolean;
  creditProductType: string;
  hasReceivables: boolean;
  receivablesStructurable: boolean;
  receivablesType: string;
  receivablesRecurrenceLevel: string;
  receivablesPredictabilityLevel: string;
  hasFidc: boolean;
  usesStructuredDebt: boolean;
  fundingStructureType: string;
  capitalStructureQuality: string;
  fundingGapLevel: string;
  fitFidc: boolean;
  fitDcm: boolean;
  timingLevel: string;
  suggestedStructure: string;
  structuralScore: number;
  capitalScore: number;
  receivablesScore: number;
  executionScore: number;
  timingScore: number;
  confidence: number;
  recommendedOutcome: ReviewOutcome;
  rationale: string;
  nextAction: string;
  evidence: EvidenceRow[];
};

const emptyEvidence = (): EvidenceRow[] => ([
  { dimension: 'credit_product', title: '', url: '', observedAt: '', sourceType: 'official_company' },
  { dimension: 'receivables', title: '', url: '', observedAt: '', sourceType: 'official_company' },
  { dimension: 'funding', title: '', url: '', observedAt: '', sourceType: 'official_company' },
  { dimension: 'timing', title: '', url: '', observedAt: '', sourceType: 'official_company' },
]);

const emptyForm = (): ReviewForm => ({
  hasCreditProduct: false,
  creditIsCore: false,
  creditProductType: '',
  hasReceivables: false,
  receivablesStructurable: false,
  receivablesType: '',
  receivablesRecurrenceLevel: 'medium',
  receivablesPredictabilityLevel: 'medium',
  hasFidc: false,
  usesStructuredDebt: false,
  fundingStructureType: '',
  capitalStructureQuality: 'unknown',
  fundingGapLevel: 'unknown',
  fitFidc: false,
  fitDcm: false,
  timingLevel: 'medium',
  suggestedStructure: '',
  structuralScore: 0,
  capitalScore: 0,
  receivablesScore: 0,
  executionScore: 0,
  timingScore: 0,
  confidence: 0.75,
  recommendedOutcome: 'monitor_only',
  rationale: '',
  nextAction: '',
  evidence: emptyEvidence(),
});

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const asBoolean = (value: unknown) => value === true || value === 'true';
const asNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value: unknown) => typeof value === 'string' ? value : '';

const formFromPacket = (packet: ReviewPacket): ReviewForm => {
  const latest = asRecord(packet.latestReview);
  const payload = asRecord(latest.review_payload);
  if (!Object.keys(payload).length) return emptyForm();
  const evidence = asArray(payload.evidence).map((item) => {
    const row = asRecord(item);
    return {
      dimension: text(row.dimension) as EvidenceDimension,
      title: text(row.title),
      url: text(row.url),
      observedAt: text(row.observedAt),
      sourceType: text(row.sourceType) || 'official_company',
    };
  }).filter((item) => ['credit_product', 'receivables', 'funding', 'timing'].includes(item.dimension));
  return {
    hasCreditProduct: asBoolean(payload.hasCreditProduct),
    creditIsCore: asBoolean(payload.creditIsCore),
    creditProductType: text(payload.creditProductType),
    hasReceivables: asBoolean(payload.hasReceivables),
    receivablesStructurable: asBoolean(payload.receivablesStructurable),
    receivablesType: asArray(payload.receivablesType).map(String).join(', '),
    receivablesRecurrenceLevel: text(payload.receivablesRecurrenceLevel) || 'medium',
    receivablesPredictabilityLevel: text(payload.receivablesPredictabilityLevel) || 'medium',
    hasFidc: asBoolean(payload.hasFidc),
    usesStructuredDebt: asBoolean(payload.usesStructuredDebt),
    fundingStructureType: text(payload.fundingStructureType),
    capitalStructureQuality: text(payload.capitalStructureQuality) || 'unknown',
    fundingGapLevel: text(payload.fundingGapLevel) || 'unknown',
    fitFidc: asBoolean(payload.fitFidc),
    fitDcm: asBoolean(payload.fitDcm),
    timingLevel: text(payload.timingLevel) || 'medium',
    suggestedStructure: text(payload.suggestedStructure),
    structuralScore: asNumber(payload.structuralScore),
    capitalScore: asNumber(payload.capitalScore),
    receivablesScore: asNumber(payload.receivablesScore),
    executionScore: asNumber(payload.executionScore),
    timingScore: asNumber(payload.timingScore),
    confidence: asNumber(payload.confidence, 0.75),
    recommendedOutcome: (text(payload.recommendedOutcome) || 'monitor_only') as ReviewOutcome,
    rationale: text(payload.rationale),
    nextAction: text(payload.nextAction),
    evidence: evidence.length ? evidence : emptyEvidence(),
  };
};

const decisionTone = (company: QueueCompany): 'success' | 'warning' | 'danger' | 'info' => {
  if (company.approved_outcome === 'eligible') return 'success';
  if (company.approved_outcome === 'ineligible') return 'danger';
  if (company.review_status === 'needs_evidence') return 'warning';
  return 'info';
};

export function CompanyCreditReviewPage() {
  const { session } = useAuth();
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [packet, setPacket] = useState<ReviewPacket | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState<ReviewForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(buildApiUrl(path), { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? `Company Credit Review falhou com HTTP ${response.status}.`);
    return payload?.data;
  };

  const loadQueue = async () => {
    const data = await request('/company-credit-review?limit=100');
    setQueue(data as QueuePayload);
    return data as QueuePayload;
  };

  const loadPacket = async (companyId: string) => {
    const data = await request(`/company-credit-review?companyId=${encodeURIComponent(companyId)}`) as ReviewPacket;
    setPacket(data);
    setForm(formFromPacket(data));
    setActiveCompanyId(companyId);
    setBlockers([]);
    return data;
  };

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const data = await loadQueue();
        const first = data.companies[0];
        if (first) await loadPacket(first.company_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar a fila de revisão de crédito.');
      } finally {
        setLoading(false);
      }
    })();
  }, [headers]);

  const activeCompany = queue?.companies.find((item) => item.company_id === activeCompanyId) ?? null;
  const latestReview = asRecord(packet?.latestReview);
  const latestReviewId = text(latestReview.id) || activeCompany?.latest_review_id || '';
  const latestStatus = text(latestReview.status) || activeCompany?.review_status || 'not_started';

  const updateField = <K extends keyof ReviewForm>(field: K, value: ReviewForm[K]) => setForm((current) => ({ ...current, [field]: value }));
  const updateEvidence = (index: number, field: keyof EvidenceRow, value: string) => setForm((current) => ({
    ...current,
    evidence: current.evidence.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
  }));

  const reviewPayload = () => ({
    ...form,
    receivablesType: form.receivablesType.split(',').map((item) => item.trim()).filter(Boolean),
    evidence: form.evidence.filter((item) => item.title.trim() || item.url.trim()),
  });

  const saveDraft = async () => {
    if (!activeCompanyId) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const data = await request('/company-credit-review', {
        method: 'POST',
        body: JSON.stringify({ action: 'save_draft', companyId: activeCompanyId, reviewPayload: reviewPayload() }),
      });
      const foundBlockers = asArray(data?.blockers).map(String);
      setBlockers(foundBlockers);
      setNotice(foundBlockers.length
        ? `Revisão salva, com ${foundBlockers.length} blocker(s) pendente(s).`
        : 'Revisão salva e pronta para decisão GOD-MODE.');
      await loadQueue();
      await loadPacket(activeCompanyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar revisão.');
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!latestReviewId || !activeCompanyId) return;
    try {
      setSaving(true);
      setError(null);
      const data = await request('/company-credit-review', {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          reviewId: latestReviewId,
          approvedOutcome: form.recommendedOutcome,
          materialize: true,
        }),
      });
      const materialization = asRecord(data?.materialization);
      setNotice(`Outcome ${text(data?.approvedOutcome)} aprovado. Materialização: ${text(materialization.status) || 'não requerida'}.`);
      await loadQueue();
      await loadPacket(activeCompanyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar revisão.');
    } finally {
      setSaving(false);
    }
  };

  const materialize = async () => {
    if (!activeCompanyId) return;
    try {
      setSaving(true);
      setError(null);
      const data = await request('/company-credit-review', {
        method: 'POST',
        body: JSON.stringify({ action: 'materialize', companyId: activeCompanyId }),
      });
      setNotice(`Qualification e scores: ${text(data?.status)}. Qualifications: ${asNumber(data?.qualificationCount)}; scores: ${asNumber(data?.scoreCount)}.`);
      await loadPacket(activeCompanyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao materializar qualification e scores.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState title="Credit Review" subtitle="Carregando Company Master, evidências e decisões GOD-MODE." />;
  if (error && !queue) return <ErrorState title="Credit Review" error={error} action={<button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>} />;

  const summary = queue?.summary;
  return (
    <div className="page">
      <PageIntro
        eyebrow="GOD-MODE · Qualification Gate"
        title="Revisão de crédito do Company Master"
        description="Valide produto de crédito, recebíveis, funding, fit FIDC/DCM e timing antes de liberar qualification, score, ranking e pipeline. Identidade real não implica lead decisório."
        actions={<div className="pill-row"><Pill tone="success">Supabase real</Pill><Pill tone="warning">aprovação humana</Pill></div>}
      />
      <DataStatusBanner source="real" note="Revisões são versionadas, exigem evidência por dimensão e somente o outcome elegível abre as superfícies decisórias." />
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
      {notice ? <div className="auth-alert auth-alert-success">{notice}</div> : null}

      <div className="summary-grid">
        <Stat label="Entidades na fila" value={String(summary?.total ?? 0)} helper="Company Master real e monitorável" />
        <Stat label="Sem revisão" value={String(summary?.notStarted ?? 0)} helper="Precisam de evidência de crédito" />
        <Stat label="Pendência de evidência" value={String(summary?.needsEvidence ?? 0)} helper="Gate permanece fechado" />
        <Stat label="Leads decisórios" value={String(summary?.decisionEligible ?? 0)} helper="Liberados após aprovação" />
      </div>

      <div className="grid cols-2">
        <Card title="Fila de revisão" subtitle="Prioridade por evidência disponível e status">
          {!queue?.companies.length ? (
            <EmptyState title="Nenhuma entidade elegível" description="A fila será preenchida após a revisão de identidade do Company Master." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Empresa</th><th>Evidência</th><th>Status</th></tr></thead>
                <tbody>
                  {queue.companies.map((company) => (
                    <tr key={company.company_id} onClick={() => void loadPacket(company.company_id)} style={{ cursor: 'pointer' }}>
                      <td><strong>{company.trade_name}</strong><div className="table-helper">{company.cnpj}</div></td>
                      <td>{company.signal_count} sinais<div className="table-helper">{company.monitoring_output_count} outputs</div></td>
                      <td><Pill tone={decisionTone(company)}>{company.approved_outcome || company.review_status || 'não iniciada'}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={activeCompany ? `${activeCompany.trade_name} · Review v${activeCompany.review_version ?? 1}` : 'Selecione uma empresa'}
          subtitle={activeCompany ? `${activeCompany.legal_name} · ${activeCompany.domain}` : 'Company Master'}
          actions={activeCompany ? <Pill tone={decisionTone(activeCompany)}>{activeCompany.approved_outcome || latestStatus}</Pill> : undefined}
        >
          {!activeCompany || !packet ? <EmptyState title="Nenhuma empresa selecionada" description="Escolha uma entidade real na fila." /> : (
            <div className="stack-blocks">
              <div className="summary-grid compact-grid">
                <Stat label="Outputs" value={String(packet.counts.monitoringOutputs)} />
                <Stat label="Sinais" value={String(packet.counts.signals)} />
                <Stat label="Qualifications" value={String(packet.counts.qualifications)} />
                <Stat label="Scores" value={String(packet.counts.scores)} />
              </div>
              {blockers.length ? <div className="auth-alert auth-alert-error">Blockers: {blockers.join(', ')}</div> : null}

              <div className="grid cols-2">
                {([
                  ['hasCreditProduct', 'Tem produto de crédito?'], ['creditIsCore', 'Crédito é core?'],
                  ['hasReceivables', 'Tem recebíveis?'], ['receivablesStructurable', 'Recebíveis estruturáveis?'],
                  ['hasFidc', 'Já possui FIDC?'], ['usesStructuredDebt', 'Usa dívida estruturada?'],
                  ['fitFidc', 'Fit FIDC?'], ['fitDcm', 'Fit DCM?'],
                ] as Array<[keyof ReviewForm, string]>).map(([field, label]) => (
                  <label key={String(field)}>{label}
                    <select value={String(form[field])} onChange={(event) => updateField(field, (event.target.value === 'true') as never)}>
                      <option value="false">Não</option><option value="true">Sim</option>
                    </select>
                  </label>
                ))}
              </div>

              <label>Produto de crédito<input value={form.creditProductType} onChange={(e) => updateField('creditProductType', e.target.value)} /></label>
              <label>Tipos de recebíveis<input value={form.receivablesType} onChange={(e) => updateField('receivablesType', e.target.value)} placeholder="Separar por vírgulas" /></label>
              <div className="grid cols-2">
                <label>Recorrência<select value={form.receivablesRecurrenceLevel} onChange={(e) => updateField('receivablesRecurrenceLevel', e.target.value)}><option>low</option><option>medium</option><option>medium_high</option><option>high</option></select></label>
                <label>Previsibilidade<select value={form.receivablesPredictabilityLevel} onChange={(e) => updateField('receivablesPredictabilityLevel', e.target.value)}><option>low</option><option>medium</option><option>medium_high</option><option>high</option></select></label>
              </div>
              <label>Estrutura atual de funding<textarea value={form.fundingStructureType} onChange={(e) => updateField('fundingStructureType', e.target.value)} rows={2} /></label>
              <div className="grid cols-2">
                <label>Qualidade da estrutura<input value={form.capitalStructureQuality} onChange={(e) => updateField('capitalStructureQuality', e.target.value)} /></label>
                <label>Funding gap<input value={form.fundingGapLevel} onChange={(e) => updateField('fundingGapLevel', e.target.value)} /></label>
                <label>Timing<input value={form.timingLevel} onChange={(e) => updateField('timingLevel', e.target.value)} /></label>
                <label>Outcome recomendado<select value={form.recommendedOutcome} onChange={(e) => updateField('recommendedOutcome', e.target.value as ReviewOutcome)}><option value="eligible">Elegível</option><option value="monitor_only">Somente monitoramento</option><option value="ineligible">Inelegível</option></select></label>
              </div>
              <label>Estrutura sugerida<textarea value={form.suggestedStructure} onChange={(e) => updateField('suggestedStructure', e.target.value)} rows={2} /></label>

              <div className="grid cols-2">
                {(['structuralScore', 'capitalScore', 'receivablesScore', 'executionScore', 'timingScore'] as const).map((field) => (
                  <label key={field}>{field.replace('Score', '')}<input type="number" min="0" max="100" value={form[field]} onChange={(e) => updateField(field, Number(e.target.value))} /></label>
                ))}
                <label>Confiança<input type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={(e) => updateField('confidence', Number(e.target.value))} /></label>
              </div>
              <label>Rationale<textarea value={form.rationale} onChange={(e) => updateField('rationale', e.target.value)} rows={5} /></label>
              <label>Próxima ação<textarea value={form.nextAction} onChange={(e) => updateField('nextAction', e.target.value)} rows={3} /></label>

              <Card title="Evidências obrigatórias" subtitle="Produto, recebíveis, funding e timing">
                <div className="stack-blocks compact-gap">
                  {form.evidence.map((item, index) => (
                    <div key={`${item.dimension}-${index}`} className="grid cols-2">
                      <label>Dimensão<input value={item.dimension} disabled /></label>
                      <label>Título<input value={item.title} onChange={(e) => updateEvidence(index, 'title', e.target.value)} /></label>
                      <label>URL<input value={item.url} onChange={(e) => updateEvidence(index, 'url', e.target.value)} /></label>
                      <label>Data observada<input type="date" value={item.observedAt} onChange={(e) => updateEvidence(index, 'observedAt', e.target.value)} /></label>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="pill-row">
                <button type="button" className="button secondary" disabled={saving} onClick={() => void saveDraft()}>Salvar revisão</button>
                <button type="button" className="button primary" disabled={saving || !latestReviewId || latestStatus === 'approved' || latestStatus === 'rejected'} onClick={() => void approve()}>Aprovar outcome</button>
                <button type="button" className="button secondary" disabled={saving || activeCompany.approved_outcome !== 'eligible'} onClick={() => void materialize()}>Materializar qualification</button>
              </div>

              {packet.evidenceCandidates.length ? (
                <Card title="Sinais disponíveis" subtitle="Candidatos para revisão humana; não são prova automática">
                  <ul className="list">
                    {packet.evidenceCandidates.slice(0, 8).map((item) => (
                      <li key={item.id}><strong>{item.signal_label || item.signal_type}</strong><span>{item.source_name || 'fonte'} · confiança {(item.confidence * 100).toFixed(0)}%</span></li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
