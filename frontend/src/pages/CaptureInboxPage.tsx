import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import { buildApiUrl } from '../lib/runtimeConfig';

type SearchProfileRun = {
  id: string;
  searchProfileId: string;
  runStatus: string;
  triggerMode: string;
  candidatesFound: number;
  candidatesInserted: number;
  candidatesPromoted: number;
  createdAt: string;
};

type DiscoveredCompanyCandidate = {
  id: string;
  companyName: string;
  legalName?: string;
  website?: string;
  normalizedDomain?: string;
  cnpj?: string;
  sourceRef?: string;
  sourceUrl?: string;
  evidenceSummary?: string;
  confidence: number;
  candidateStatus: string;
  companyId?: string;
  capturedAt: string;
  rawPayload: Record<string, unknown>;
  promotionReady: boolean;
  promotionBlockers: string[];
};

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '');
const numberValue = (...values: unknown[]) => {
  const value = values.find((item) => item !== null && item !== undefined && item !== '');
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const booleanValue = (value: unknown) => value === true || value === 'true';

const normalizeRun = (rawValue: unknown): SearchProfileRun => {
  const raw = asRecord(rawValue);
  return {
    id: text(raw.id),
    searchProfileId: text(raw.searchProfileId, raw.search_profile_id),
    runStatus: text(raw.runStatus, raw.run_status, 'unknown'),
    triggerMode: text(raw.triggerMode, raw.trigger_mode, 'unknown'),
    candidatesFound: numberValue(raw.candidatesFound, raw.candidates_found),
    candidatesInserted: numberValue(raw.candidatesInserted, raw.candidates_inserted),
    candidatesPromoted: numberValue(raw.candidatesPromoted, raw.candidates_promoted),
    createdAt: text(raw.createdAt, raw.created_at),
  };
};

const normalizeCandidate = (rawValue: unknown): DiscoveredCompanyCandidate => {
  const raw = asRecord(rawValue);
  const rawPayload = asRecord(raw.rawPayload ?? raw.raw_payload);
  const blockersValue = rawPayload.promotion_blockers;
  const promotionBlockers = Array.isArray(blockersValue) ? blockersValue.map(String) : [];
  return {
    id: text(raw.id),
    companyName: text(raw.companyName, raw.company_name, 'Empresa sem nome'),
    legalName: text(raw.legalName, raw.legal_name) || undefined,
    website: text(raw.website) || undefined,
    normalizedDomain: text(raw.normalizedDomain, raw.normalized_domain) || undefined,
    cnpj: text(raw.cnpj) || undefined,
    sourceRef: text(raw.sourceRef, raw.source_ref) || undefined,
    sourceUrl: text(raw.sourceUrl, raw.source_url) || undefined,
    evidenceSummary: text(raw.evidenceSummary, raw.evidence_summary) || undefined,
    confidence: numberValue(raw.confidence),
    candidateStatus: text(raw.candidateStatus, raw.candidate_status, 'captured'),
    companyId: text(raw.companyId, raw.company_id) || undefined,
    capturedAt: text(raw.capturedAt, raw.captured_at),
    rawPayload,
    promotionReady: booleanValue(rawPayload.promotion_ready),
    promotionBlockers,
  };
};

const blockerLabel: Record<string, string> = {
  invalid_or_missing_cnpj: 'CNPJ ausente ou inválido',
  missing_website: 'website ausente',
  missing_normalized_domain: 'domínio não reconciliado',
  identity_evidence_url_missing: 'fonte de identidade ausente',
  legal_name_not_verified: 'razão social não verificada',
  identity_review_not_approved: 'revisão de identidade pendente',
  confidence_below_070: 'confiança abaixo de 70%',
  insufficient_identity_evidence: 'evidência insuficiente',
  eligible_company_link_missing: 'Company Master elegível ausente',
  candidate_discarded: 'candidata descartada',
  candidate_already_promoted: 'candidata já promovida',
};

const formatCnpj = (value?: string) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : 'CNPJ pendente';
};

export function CaptureInboxPage() {
  const { session } = useAuth();
  const [runs, setRuns] = useState<SearchProfileRun[]>([]);
  const [candidates, setCandidates] = useState<DiscoveredCompanyCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  const load = async () => {
    try {
      setLoading(true);
      const [runsResponse, candidatesResponse] = await Promise.all([
        fetch(buildApiUrl('/search-profile-runs'), { headers, credentials: 'include' }),
        fetch(buildApiUrl('/discovered-candidates'), { headers, credentials: 'include' }),
      ]);
      const runsPayload = await runsResponse.json();
      const candidatesPayload = await candidatesResponse.json();
      if (!runsResponse.ok) throw new Error(runsPayload?.error ?? 'Falha ao carregar runs.');
      if (!candidatesResponse.ok) throw new Error(candidatesPayload?.error ?? 'Falha ao carregar candidatas.');
      setRuns(Array.isArray(runsPayload?.data) ? runsPayload.data.map(normalizeRun) : []);
      setCandidates(Array.isArray(candidatesPayload?.data) ? candidatesPayload.data.map(normalizeCandidate) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar capture inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [headers]);

  const handlePromote = async (candidate: DiscoveredCompanyCandidate) => {
    if (!candidate.promotionReady) {
      setError(`Promoção bloqueada: ${candidate.promotionBlockers.map((item) => blockerLabel[item] ?? item).join(', ')}.`);
      return;
    }
    try {
      setPromotingId(candidate.id);
      const response = await fetch(buildApiUrl(`/discovered-candidates/${candidate.id}/promote`), {
        method: 'POST', headers, credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const blockers = Array.isArray(payload?.blockers) ? payload.blockers.map((item: unknown) => blockerLabel[String(item)] ?? String(item)) : [];
        throw new Error(blockers.length ? `Promoção bloqueada: ${blockers.join(', ')}.` : payload?.error ?? 'Falha ao promover candidata.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao promover candidata.');
    } finally {
      setPromotingId(null);
    }
  };

  const promotionReadyCount = candidates.filter((item) => item.promotionReady).length;
  const reviewPendingCount = candidates.filter((item) => !item.promotionReady && item.candidateStatus !== 'promoted').length;
  const promotedCount = candidates.filter((item) => item.candidateStatus === 'promoted').length;
  const reconciledCnpjCount = candidates.filter((item) => Boolean(item.cnpj)).length;

  if (loading) return <div className="page"><Card title="Capture Inbox" subtitle="Carregando runs e candidatas capturadas">Aguarde...</Card></div>;

  return (
    <div className="page capture-inbox-page">
      <PageIntro
        eyebrow="Capture Inbox · Identity Review"
        title="Candidatas capturadas e prontidão de promoção"
        description="Discovery encontra nomes. Promoção exige identidade jurídica, CNPJ válido, domínio reconciliado, fonte de evidência, revisão humana e vínculo a um Company Master elegível."
        actions={<div className="pill-row"><Pill tone="success">quality gate ativo</Pill><Pill tone="warning">promoção automática desativada</Pill></div>}
      />

      <DataStatusBanner source="real" note="A fila usa dados reais do Supabase. Classificações genéricas de perfil foram removidas quando não havia evidência individual." />
      {error ? <Card title="Atenção operacional" subtitle="Ação não executada" tone="warning">{error}</Card> : null}

      <section className="grid cols-4">
        <Card title="Runs" subtitle="Execuções registradas"><Stat label="Total" value={String(runs.length)} helper="captures por search profile" /></Card>
        <Card title="Revisão pendente" subtitle="Identidade incompleta"><Stat label="Candidatas" value={String(reviewPendingCount)} helper="não podem entrar no Company Master" /></Card>
        <Card title="CNPJ reconciliado" subtitle="Primeiro requisito jurídico"><Stat label="Candidatas" value={String(reconciledCnpjCount)} helper={`${candidates.length} nomes capturados`} /></Card>
        <Card title="Prontas para finalizar" subtitle="Todos os gates atendidos"><Stat label="Candidatas" value={String(promotionReadyCount)} helper={`${promotedCount} já promovidas`} /></Card>
      </section>

      <Card title="Fluxo seguro" subtitle="Discovery não equivale a lead" className="dense-card">
        <div className="decision-strip">
          <div className="decision-card"><Pill tone="info">1. Captura</Pill><strong>Nome + origem</strong><small>presença no portfólio ou fonte descoberta</small></div>
          <div className="decision-card"><Pill tone="warning">2. Identidade</Pill><strong>CNPJ + domínio</strong><small>razão social e fonte oficial reconciliadas</small></div>
          <div className="decision-card"><Pill tone="warning">3. Revisão</Pill><strong>Evidência aprovada</strong><small>sem inferir crédito, recebíveis ou FIDC por template</small></div>
          <div className="decision-card"><Pill tone="success">4. Finalização</Pill><strong>Company Master</strong><small>somente entidade real e elegível</small></div>
        </div>
      </Card>

      <section className="grid cols-2 detail-layout">
        <Card title="Recent Runs" subtitle="Últimas execuções por search profile" className="dense-card">
          {runs.length ? (
            <table className="dense-table">
              <thead><tr><th>Profile</th><th>Status</th><th>Trigger</th><th>Found</th><th>Inserted</th></tr></thead>
              <tbody>{runs.map((run) => (
                <tr key={run.id}>
                  <td><strong>{run.searchProfileId || 'perfil não informado'}</strong><div className="table-helper">{run.createdAt || 'data indisponível'}</div></td>
                  <td><Pill tone={run.runStatus === 'completed' ? 'success' : run.runStatus === 'failed' ? 'danger' : 'info'}>{run.runStatus}</Pill></td>
                  <td>{run.triggerMode}</td><td>{run.candidatesFound}</td><td>{run.candidatesInserted}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState title="Nenhuma run registrada." description="Execute um Search Profile para alimentar a fila com lineage." />}
        </Card>

        <Card title="Quality gates" subtitle="Condições mínimas para promoção" className="dense-card">
          <ul className="list compact-list">
            <li><strong>CNPJ válido</strong><span>14 dígitos e checksum válido</span></li>
            <li><strong>Website e domínio</strong><span>reconciliados com a identidade jurídica</span></li>
            <li><strong>Fonte de identidade</strong><span>URL registrada no lineage da candidata</span></li>
            <li><strong>Revisão humana</strong><span>razão social verificada e status approved</span></li>
            <li><strong>Company Master elegível</strong><span>promoção apenas finaliza vínculo já revisado</span></li>
          </ul>
        </Card>
      </section>

      <Card title="Candidatas" subtitle="Identidade, evidência e blockers por registro" className="dense-card">
        {candidates.length ? (
          <div className="fidc-table-wrap">
            <table className="dense-table">
              <thead><tr><th>Empresa</th><th>Identidade</th><th>Origem</th><th>Prontidão</th><th>Ação</th></tr></thead>
              <tbody>{candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <strong>{candidate.companyName}</strong>
                    <div className="table-helper">{candidate.legalName || 'razão social não verificada'}</div>
                    <div className="table-helper">confidence {(candidate.confidence * 100).toFixed(0)}%</div>
                  </td>
                  <td>
                    <strong className="mono">{formatCnpj(candidate.cnpj)}</strong>
                    <div className="table-helper">{candidate.normalizedDomain || candidate.website || 'domínio pendente'}</div>
                    <div className="table-helper">{candidate.companyId ? 'vínculo criado' : 'sem Company Master elegível'}</div>
                  </td>
                  <td>
                    <strong>{candidate.sourceRef || 'capture'}</strong>
                    <div className="table-helper">{candidate.evidenceSummary || 'evidência não registrada'}</div>
                    {candidate.sourceUrl ? <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="table-helper">Abrir fonte</a> : null}
                  </td>
                  <td>
                    <Pill tone={candidate.promotionReady ? 'success' : 'warning'}>{candidate.promotionReady ? 'pronta' : 'bloqueada'}</Pill>
                    <div className="pill-row top-gap">
                      {candidate.promotionBlockers.slice(0, 4).map((blocker) => <Pill key={blocker} tone="warning">{blockerLabel[blocker] ?? blocker}</Pill>)}
                      {candidate.promotionBlockers.length > 4 ? <Pill tone="info">+{candidate.promotionBlockers.length - 4}</Pill> : null}
                    </div>
                  </td>
                  <td>
                    {candidate.candidateStatus === 'promoted' ? (
                      <Pill tone="success">promovida</Pill>
                    ) : (
                      <button type="button" onClick={() => void handlePromote(candidate)} disabled={!candidate.promotionReady || promotingId === candidate.id} title={!candidate.promotionReady ? 'Conclua a revisão de identidade antes de promover.' : undefined}>
                        {promotingId === candidate.id ? 'Finalizando...' : candidate.promotionReady ? 'Finalizar promoção' : 'Revisão necessária'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Nenhuma candidata capturada." description="A fila continuará vazia até uma run real produzir novos nomes." />}
      </Card>
    </div>
  );
}
