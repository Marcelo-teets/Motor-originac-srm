import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import { buildApiUrl } from '../lib/runtimeConfig';

type Candidate = {
  id: string;
  companyName: string;
  legalName?: string;
  cnpj?: string;
  website?: string;
  evidenceSummary?: string;
  confidence: number;
  candidateStatus: string;
  sourceRef?: string;
  sourceUrl?: string;
  capturedAt?: string;
  priorityTier?: string;
  nextAction?: string;
  whyNow?: string;
  rawPayload: Record<string, unknown>;
};

type ReviewForm = {
  legalName: string;
  cnpj: string;
  website: string;
  identitySourceUrl: string;
  evidenceSummary: string;
  confidence: string;
  reviewNotes: string;
};

const emptyForm: ReviewForm = {
  legalName: '',
  cnpj: '',
  website: '',
  identitySourceUrl: '',
  evidenceSummary: '',
  confidence: '0.80',
  reviewNotes: '',
};

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '');
const numberValue = (...values: unknown[]) => {
  const parsed = Number(values.find((value) => value !== null && value !== undefined && value !== '') ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCandidate = (value: unknown): Candidate => {
  const raw = asRecord(value);
  return {
    id: text(raw.id),
    companyName: text(raw.companyName, raw.company_name, 'Empresa sem nome'),
    legalName: text(raw.legalName, raw.legal_name) || undefined,
    cnpj: text(raw.cnpj) || undefined,
    website: text(raw.website) || undefined,
    evidenceSummary: text(raw.evidenceSummary, raw.evidence_summary) || undefined,
    confidence: numberValue(raw.confidence),
    candidateStatus: text(raw.candidateStatus, raw.candidate_status, 'captured'),
    sourceRef: text(raw.sourceRef, raw.source_ref) || undefined,
    sourceUrl: text(raw.sourceUrl, raw.source_url) || undefined,
    capturedAt: text(raw.capturedAt, raw.captured_at) || undefined,
    priorityTier: text(raw.priorityTier, raw.priority_tier) || undefined,
    nextAction: text(raw.nextAction, raw.next_action) || undefined,
    whyNow: text(raw.whyNow, raw.why_now) || undefined,
    rawPayload: asRecord(raw.rawPayload ?? raw.raw_payload),
  };
};

const formatCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : value;
};

export function CandidateIdentityReviewPage() {
  const { session } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        queue: 'reviewable',
        limit: String(pagination.limit),
        offset: String(pagination.offset),
      });
      const response = await fetch(buildApiUrl(`/candidate-decision-queue?${params.toString()}`), { headers, credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? 'Falha ao carregar candidatas revisáveis.');
      const data = asRecord(payload?.data);
      const rows = Array.isArray(data.items) ? data.items.map(normalizeCandidate) : [];
      const page = asRecord(data.pagination);
      setCandidates(rows);
      setPagination((current) => ({
        limit: numberValue(page.limit) || current.limit,
        offset: numberValue(page.offset),
        total: numberValue(page.total),
      }));
      if (activeId && !rows.some((candidate) => candidate.id === activeId)) {
        setActiveId(null);
        setForm(emptyForm);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar candidatas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [headers, pagination.limit, pagination.offset]);

  const active = candidates.find((candidate) => candidate.id === activeId) ?? null;
  const pageStart = pagination.total ? pagination.offset + 1 : 0;
  const pageEnd = Math.min(pagination.offset + pagination.limit, pagination.total);

  const selectCandidate = (candidate: Candidate) => {
    const raw = candidate.rawPayload;
    setActiveId(candidate.id);
    setForm({
      legalName: text(raw.review_legal_name, candidate.legalName, candidate.companyName),
      cnpj: formatCnpj(text(raw.review_cnpj, candidate.cnpj)),
      website: text(raw.review_website, candidate.website),
      identitySourceUrl: text(raw.identity_evidence_url, candidate.sourceUrl),
      evidenceSummary: text(raw.review_evidence_summary, candidate.evidenceSummary),
      confidence: String(numberValue(raw.review_confidence, candidate.confidence, 0.80).toFixed(2)),
      reviewNotes: text(raw.review_notes),
    });
    setError(null);
    setSuccess(null);
  };

  const updateField = (field: keyof ReviewForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (action: 'approve' | 'reject') => {
    if (!active) return;
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const response = await fetch(buildApiUrl('/candidate-identity-review'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action,
          candidateId: active.id,
          legalName: form.legalName,
          cnpj: form.cnpj,
          website: form.website,
          identitySourceUrl: form.identitySourceUrl,
          evidenceSummary: form.evidenceSummary,
          confidence: Number(form.confidence),
          reviewNotes: form.reviewNotes,
          reason: form.reviewNotes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const blockers = Array.isArray(payload?.blockers) ? payload.blockers.join(', ') : '';
        throw new Error(blockers ? `${payload?.error ?? 'Revisão bloqueada'} · ${blockers}` : payload?.error ?? 'Falha na revisão.');
      }
      setSuccess(action === 'approve'
        ? `${active.companyName} reconciliada e vinculada ao Company Master. Qualification e score continuam bloqueados até análise separada.`
        : `${active.companyName} descartada com justificativa auditável.`);
      setActiveId(null);
      setForm(emptyForm);
      if (candidates.length === 1 && pagination.offset > 0) {
        setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }));
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na revisão de identidade.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !candidates.length) return <div className="page"><Card title="Identity Review" subtitle="Carregando fila priorizada de identidade">Aguarde...</Card></div>;

  return (
    <div className="page">
      <PageIntro
        eyebrow="Entity Resolution · Human Review"
        title="Revisão jurídica de candidatas comerciais"
        description="Valide razão social, CNPJ, domínio e evidência oficial. Veículos FIDC/CRI/CRA ficam no mapa de estruturas e não entram nesta fila. Crédito e fit permanecem sem classificação até análise separada."
        actions={<div className="pill-row"><Pill tone="success">fila paginada</Pill><Pill tone="warning">sem inferência de crédito</Pill></div>}
      />
      <DataStatusBanner source="real" note="A fila reúne apenas candidatas comerciais ou de identidade. Aprovação e rejeição são persistidas no Supabase com usuário, evidência, data e motivo." />
      {error ? <Card title="Revisão bloqueada" subtitle="Nenhuma alteração parcial foi persistida" tone="accent">{error}</Card> : null}
      {success ? <Card title="Revisão concluída" subtitle="Resultado persistido com lineage" tone="success">{success}</Card> : null}

      <section className="grid cols-3">
        <Card title="Fila revisável" subtitle="Comercial + identidade"><Stat label="Candidatas" value={String(pagination.total)} helper="veículos de mercado excluídos" /></Card>
        <Card title="Página atual" subtitle={`${pageStart}-${pageEnd} de ${pagination.total}`}><Stat label="Registros" value={String(candidates.length)} helper="priorizados pelo motor" /></Card>
        <Card title="Política" subtitle="Separação de responsabilidades">
          <ul className="list compact-list">
            <li><strong>Identidade</strong><span>razão social, CNPJ e domínio</span></li>
            <li><strong>Crédito</strong><span>avaliado depois, com evidência própria</span></li>
          </ul>
        </Card>
      </section>

      <section className="grid cols-2 detail-layout">
        <Card title="Fila de revisão" subtitle="Selecione uma candidata priorizada" className="dense-card">
          {candidates.length ? (
            <div className="stack-blocks compact-gap">
              {candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className={activeId === candidate.id ? 'secondary active' : 'secondary'}
                  onClick={() => selectCandidate(candidate)}
                >
                  <strong>{candidate.priorityTier ? `${candidate.priorityTier} · ` : ''}{candidate.companyName}</strong>
                  <span>{candidate.whyNow || candidate.sourceRef || 'fonte não informada'}</span>
                  <small>{candidate.nextAction || 'Validar identidade jurídica.'}</small>
                </button>
              ))}
              <div className="pill-row top-gap">
                <button type="button" className="secondary" disabled={pagination.offset === 0 || loading} onClick={() => setPagination((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Anterior</button>
                <button type="button" className="secondary" disabled={pagination.offset + pagination.limit >= pagination.total || loading} onClick={() => setPagination((current) => ({ ...current, offset: current.offset + current.limit }))}>Próxima</button>
              </div>
            </div>
          ) : <EmptyState title="Fila concluída." description="Não há candidatas comerciais ou de identidade aguardando revisão." />}
        </Card>

        <Card title={active ? `Revisar ${active.companyName}` : 'Formulário de identidade'} subtitle="Campos observados em fonte oficial" className="dense-card">
          {active ? (
            <div className="stack-blocks">
              <label>Razão social verificada<input value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} placeholder="Razão social completa" /></label>
              <label>CNPJ<input value={form.cnpj} onChange={(event) => updateField('cnpj', formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" /></label>
              <label>Website oficial<input value={form.website} onChange={(event) => updateField('website', event.target.value)} placeholder="https://empresa.com" /></label>
              <label>URL da evidência de identidade<input value={form.identitySourceUrl} onChange={(event) => updateField('identitySourceUrl', event.target.value)} placeholder="Página oficial com razão social e CNPJ" /></label>
              <label>Resumo da evidência<textarea rows={5} value={form.evidenceSummary} onChange={(event) => updateField('evidenceSummary', event.target.value)} placeholder="Descreva exatamente o que a fonte oficial confirma, sem inferir crédito ou recebíveis." /></label>
              <label>Confiança<input type="number" min="0.70" max="1" step="0.01" value={form.confidence} onChange={(event) => updateField('confidence', event.target.value)} /></label>
              <label>Notas ou motivo de rejeição<textarea rows={3} value={form.reviewNotes} onChange={(event) => updateField('reviewNotes', event.target.value)} placeholder="Notas de revisão; obrigatório e substantivo para rejeitar." /></label>
              <div className="pill-row">
                <button type="button" disabled={submitting} onClick={() => void submit('approve')}>{submitting ? 'Processando...' : 'Aprovar identidade'}</button>
                <button type="button" className="secondary" disabled={submitting || form.reviewNotes.trim().length < 20} onClick={() => void submit('reject')}>Descartar candidata</button>
              </div>
            </div>
          ) : <EmptyState title="Selecione uma candidata." description="A revisão só começa após escolher um registro da fila." />}
        </Card>
      </section>
    </div>
  );
}
