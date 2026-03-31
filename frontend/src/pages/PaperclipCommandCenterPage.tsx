import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import './PaperclipCommandCenterPage.css';

type Envelope<T> = { status: 'real' | 'partial' | 'mock'; generatedAt: string; data: T; error?: string };

type PaperclipStatus = {
  enabled?: boolean;
  mode?: string;
  apiBaseUrl?: string;
  sourceOfTruth?: { backend?: string; database?: string; frontend?: string };
  notes?: string[];
  agents?: PaperclipAgent[];
};

type PaperclipAgent = {
  id: string;
  role: string;
  runtime: string;
  heartbeatMinutes: number;
  approvalMode: 'manual' | 'automatic';
  endpoints: string[];
};

type OrchestrationResult = {
  companyId: string;
  reason: string;
  orchestrationMode: string;
  actionsExecuted: string[];
  ranking?: { rank?: number; leadScore?: number; qualificationScore?: number } | null;
};

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json() as Envelope<T>;
  if (!response.ok) throw new Error(payload.error ?? 'Falha ao carregar Paperclip');
  return payload;
}

export function PaperclipCommandCenterPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'real' | 'partial' | 'mock'>('partial');
  const [note, setNote] = useState('Painel operacional do Paperclip carregando.');
  const [status, setStatus] = useState<PaperclipStatus | null>(null);
  const [agents, setAgents] = useState<PaperclipAgent[]>([]);
  const [companyId, setCompanyId] = useState('cmp_neon_receivables');
  const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runResult, setRunResult] = useState<OrchestrationResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statusEnvelope, agentsEnvelope] = await Promise.all([
          request<PaperclipStatus>('/paperclip/status', session?.access_token),
          request<PaperclipAgent[]>('/paperclip/agents', session?.access_token),
        ]);

        if (cancelled) return;
        setStatus(statusEnvelope.data);
        setAgents(agentsEnvelope.data);
        setSource(statusEnvelope.status);
        setNote(statusEnvelope.status === 'real'
          ? 'Paperclip ativo a partir do backend oficial.'
          : statusEnvelope.status === 'partial'
            ? 'Paperclip ativo em modo parcial/control plane, preservando o Motor como fonte de verdade.'
            : 'Paperclip em fallback visual.');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar o command center do Paperclip.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [session?.access_token]);

  const summary = useMemo(() => {
    const automatic = agents.filter((item) => item.approvalMode === 'automatic').length;
    const manual = agents.filter((item) => item.approvalMode === 'manual').length;
    const avgHeartbeat = agents.length ? Math.round(agents.reduce((sum, item) => sum + item.heartbeatMinutes, 0) / agents.length) : 0;
    return { automatic, manual, avgHeartbeat };
  }, [agents]);

  const handleRun = async () => {
    if (!companyId.trim()) return;
    setRunState('running');
    setRunError(null);
    setRunResult(null);

    try {
      const payload = await request<OrchestrationResult>(`/paperclip/orchestrate/company/${companyId}`, session?.access_token, {
        method: 'POST',
        body: JSON.stringify({ reason: 'paperclip_command_center' }),
      });
      setRunResult(payload.data);
      setRunState('done');
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Falha ao orquestrar empresa.');
      setRunState('error');
    }
  };

  if (loading) return <div className="page"><Card title="Paperclip Command Center" subtitle="Carregando centro de comando do Paperclip">Aguarde...</Card></div>;
  if (error || !status) return <div className="page"><Card title="Paperclip Command Center" subtitle="Falha ao carregar o painel do Paperclip">{error}</Card></div>;

  return (
    <div className="page paperclip-command-page">
      <PageIntro
        eyebrow="Paperclip"
        title="Command Center"
        description="Centro de comando visual para acompanhar o control plane, orquestrar empresas, visualizar agentes e manter o Motor em operação assistida com uma camada de supervisão mais executiva, fluida e agradável."
        actions={<Pill tone={status.mode === 'scaffold' ? 'warning' : 'success'}>{status.mode ?? 'active'}</Pill>}
      />

      <DataStatusBanner source={source} note={note} />

      <section className="paperclip-hero-grid">
        <Card title="Paperclip live status" subtitle="Leitura rápida do control plane" tone="accent" className="paperclip-gradient-card">
          <div className="paperclip-stat-grid">
            <Stat label="Agentes" value={String(agents.length)} helper="malha ativa no control plane" />
            <Stat label="Automáticos" value={String(summary.automatic)} helper="execução sem aprovação humana" />
            <Stat label="Manuais" value={String(summary.manual)} helper="gates de supervisão" />
            <Stat label="Heartbeat médio" value={`${summary.avgHeartbeat} min`} helper="cadência média operacional" />
          </div>
          <div className="paperclip-chip-row">
            <Pill tone="info">Backend: {status.sourceOfTruth?.backend ?? 'motor_backend'}</Pill>
            <Pill tone="info">Banco: {status.sourceOfTruth?.database ?? 'supabase'}</Pill>
            <Pill tone="info">Frontend: {status.sourceOfTruth?.frontend ?? 'react_vite'}</Pill>
          </div>
        </Card>

        <Card title="Orquestração assistida" subtitle="Executar ciclo em uma empresa-alvo" className="paperclip-control-card">
          <label className="paperclip-input-label">
            Company ID
            <input value={companyId} onChange={(event) => setCompanyId(event.target.value)} placeholder="cmp_neon_receivables" className="paperclip-input" />
          </label>
          <div className="paperclip-action-row">
            <button type="button" className="primary" onClick={() => void handleRun()} disabled={runState === 'running'}>
              {runState === 'running' ? 'Orquestrando...' : 'Rodar ciclo Paperclip'}
            </button>
            <Pill tone={runState === 'done' ? 'success' : runState === 'error' ? 'danger' : runState === 'running' ? 'warning' : 'default'}>
              {runState === 'idle' ? 'pronto' : runState}
            </Pill>
          </div>
          {runError ? <div className="paperclip-inline-error">{runError}</div> : null}
          {runResult ? (
            <div className="paperclip-run-result">
              <strong>{runResult.companyId}</strong>
              <span>Modo: {runResult.orchestrationMode}</span>
              <span>Ações: {runResult.actionsExecuted.join(' · ')}</span>
              {runResult.ranking ? <span>Ranking: lead {runResult.ranking.leadScore ?? '-'} · qualification {runResult.ranking.qualificationScore ?? '-'}</span> : null}
            </div>
          ) : null}
        </Card>
      </section>

      <section className="grid cols-2">
        <Card title="Agent mesh" subtitle="Papel, runtime e intensidade operacional" className="dense-card">
          <div className="stack-blocks">
            {agents.map((agent) => (
              <div key={agent.id} className="paperclip-agent-card">
                <div className="row-between">
                  <div>
                    <strong>{agent.role}</strong>
                    <div className="table-helper">{agent.id} · runtime {agent.runtime}</div>
                  </div>
                  <Pill tone={agent.approvalMode === 'automatic' ? 'success' : 'warning'}>{agent.approvalMode}</Pill>
                </div>
                <div className="paperclip-agent-metrics">
                  <span>heartbeat {agent.heartbeatMinutes} min</span>
                  <div>
                    <div className="row-between"><span>cadência</span><strong>{Math.max(5, 120 - agent.heartbeatMinutes)} / 100</strong></div>
                    <ProgressBar value={Math.max(5, 120 - agent.heartbeatMinutes)} max={100} tone={agent.heartbeatMinutes <= 30 ? 'success' : 'info'} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Control plane notes" subtitle="Guardrails, contexto e endpoints" className="dense-card">
          <ul className="list paperclip-note-list">
            {(status.notes ?? []).map((item, index) => <li key={index}><span>{item}</span></li>)}
          </ul>
          <div className="paperclip-endpoint-grid">
            {agents.slice(0, 4).map((agent) => (
              <div key={agent.id} className="paperclip-endpoint-panel">
                <strong>{agent.role}</strong>
                {agent.endpoints.slice(0, 3).map((endpoint) => <span key={endpoint}>{endpoint}</span>)}
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
