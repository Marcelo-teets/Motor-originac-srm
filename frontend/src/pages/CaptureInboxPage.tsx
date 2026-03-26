import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type SearchProfileRun = {
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

type DiscoveredCompanyCandidate = {
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
        fetch(`${apiUrl}/search-profile-runs`, { headers }),
        fetch(`${apiUrl}/discovered-candidates`, { headers }),
      ]);

      const runsPayload = await runsResponse.json();
      const candidatesPayload = await candidatesResponse.json();

      setRuns(Array.isArray(runsPayload?.data) ? runsPayload.data : []);
      setCandidates(Array.isArray(candidatesPayload?.data) ? candidatesPayload.data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar capture inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [headers]);

  const handlePromote = async (candidateId: string) => {
    try {
      setPromotingId(candidateId);
      const response = await fetch(`${apiUrl}/discovered-candidates/${candidateId}/promote`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Falha ao promover candidato.');
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao promover candidato.');
    } finally {
      setPromotingId(null);
    }
  };

  const capturedCount = candidates.filter((item) => item.candidateStatus === 'captured').length;
  const promotedCount = candidates.filter((item) => item.candidateStatus === 'promoted').length;
  const dedupedCount = candidates.filter((item) => item.candidateStatus === 'deduped').length;

  if (loading) {
    return <div className="page"><Card title="Capture Inbox" subtitle="Carregando runs e candidatos capturados">Aguarde...</Card></div>;
  }

  return (
    <div className="page">
      <PageIntro
        eyebrow="Capture Inbox"
        title="Runs de discovery e candidatos capturados"
        description="Camada operacional para acompanhar discovery por search profile, revisar candidatos e promover empresas novas para o motor principal."
      />

      <DataStatusBanner source="real" note="Tela preparada para consumir runs e candidatos da nova camada de capture ingestion." />
      {error ? <Card title="Falha" subtitle="Erro operacional do capture inbox">{error}</Card> : null}

      <section className="grid cols-3">
        <Card title="Foto geral" subtitle="Estado atual da caixa de captura">
          <div className="mini-metric-grid">
            <Stat label="Runs" value={String(runs.length)} helper="execuções registradas" />
            <Stat label="Captured" value={String(capturedCount)} helper="aguardando triagem" />
            <Stat label="Promoted" value={String(promotedCount)} helper="já viraram companies" />
            <Stat label="Deduped" value={String(dedupedCount)} helper="já existiam na base" />
          </div>
        </Card>

        <Card title="Objetivo" subtitle="Por que esta tela importa">
          <ul className="list">
            <li><strong>Discovery</strong><span>mostra o que foi capturado por search profile</span></li>
            <li><strong>Triagem</strong><span>permite separar novo lead de duplicidade</span></li>
            <li><strong>Promoção</strong><span>encurta a passagem para monitoring e qualification</span></li>
          </ul>
        </Card>

        <Card title="Próxima etapa" subtitle="Uso esperado no fluxo comercial">
          <ul className="list">
            <li><strong>1</strong><span>rodar capture por perfil estratégico</span></li>
            <li><strong>2</strong><span>revisar candidatos com maior confidence</span></li>
            <li><strong>3</strong><span>promover e disparar monitoring/recompute</span></li>
          </ul>
        </Card>
      </section>

      <section className="grid cols-2 detail-layout">
        <Card title="Recent Runs" subtitle="Últimas execuções por search profile" className="dense-card">
          <table className="dense-table">
            <thead>
              <tr><th>Profile</th><th>Status</th><th>Trigger</th><th>Found</th><th>Promoted</th></tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td><strong>{run.searchProfileId}</strong><div className="table-helper">{run.createdAt}</div></td>
                  <td><Pill tone={run.runStatus === 'completed' ? 'success' : run.runStatus === 'failed' ? 'danger' : 'info'}>{run.runStatus}</Pill></td>
                  <td>{run.triggerMode}</td>
                  <td>{run.candidatesFound}</td>
                  <td>{run.candidatesPromoted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Captured Candidates" subtitle="Triagem e promoção para company master" className="dense-card">
          <table className="dense-table">
            <thead>
              <tr><th>Empresa</th><th>Status</th><th>Confidence</th><th>Origem</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <strong>{candidate.companyName}</strong>
                    <div className="table-helper">{candidate.website || candidate.evidenceSummary || 'Sem website'}</div>
                  </td>
                  <td><Pill tone={candidate.candidateStatus === 'promoted' ? 'success' : candidate.candidateStatus === 'deduped' ? 'warning' : 'info'}>{candidate.candidateStatus}</Pill></td>
                  <td>{candidate.confidence}</td>
                  <td>{candidate.sourceRef || 'capture'}</td>
                  <td>
                    {candidate.candidateStatus === 'captured' || candidate.candidateStatus === 'deduped' ? (
                      <button type="button" onClick={() => void handlePromote(candidate.id)} disabled={promotingId === candidate.id}>
                        {promotingId === candidate.id ? 'Promovendo...' : 'Promover'}
                      </button>
                    ) : (
                      <span className="table-helper">{candidate.companyId || 'já promovido'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
