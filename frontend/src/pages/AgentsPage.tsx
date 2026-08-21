import { useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

const PAPERCLIP_ACTIONS = [
  { action: 'recompute_derived_all', label: 'Recalcular inteligência', helper: 'Qualification, patterns, scores e ranking.' },
  { action: 'process_reprocessing_queue', label: 'Reprocessar fila', helper: 'Processa a fila governada de reprocessing.' },
  { action: 'materialize_daily_outreach', label: 'Materializar outreach', helper: 'Gera a fila diária sem enviar mensagens.' },
  { action: 'run_suggested_improvements', label: 'Rodar manutenção completa', helper: 'Reprocessing + fila diária; sem auto-send.' },
] as const;

const commandResultLabel = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return 'execução concluída e auditada';
  return 'execução concluída';
};

export function AgentsPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getAgentsSnapshot(session), [session?.access_token]);
  const { data: abaData } = useAsyncData(() => api.getAbaStatus(session), [session?.access_token]);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  if (loading) return <div className="page"><Card title="Agents Control" subtitle="Carregando agents">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Agents Control" subtitle="Falha ao carregar agents">{error}</Card></div>;

  const runPaperclipAction = async (action: string, label: string) => {
    if (runningAction) return;
    setRunningAction(action);
    setCommandMessage(null);
    try {
      const result = await api.commandPaperClip(session, action, { source: 'agents_page' });
      setCommandMessage(`${label}: ${commandResultLabel(result.result)}.`);
    } catch (err) {
      setCommandMessage(err instanceof Error ? err.message : `Falha ao executar ${label}.`);
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="page">
      <PageIntro eyebrow="Agents" title="Agents control" description="Status operacional dos agentes e control plane Paperclip com ações reais, limitadas e auditáveis." actions={<Pill tone="warning">saúde operacional</Pill>} />
      <DataStatusBanner source={data.source} note={data.note} />
      <Card title="Agents status" subtitle="Falhas, foco e confiança por agente" className="dense-card">
        <div className="stack-blocks">
          {data.data.items.map((agent) => (
            <div key={agent.name} className="agent-row">
              <div>
                <strong>{agent.name}</strong>
                <div className="table-helper">{agent.focus}</div>
              </div>
              <div className="agent-metrics">
                <span>{agent.status} · falhas {agent.failures}</span>
                <div>
                  <div className="row-between"><span>confidence</span><strong>{agent.confidence}%</strong></div>
                  <ProgressBar value={agent.confidence} max={100} tone={agent.confidence >= 80 ? 'success' : 'warning'} />
                </div>
                <span>{agent.updatedAt}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Paperclip control plane" subtitle="Paperclip coordena; Motor executa; Supabase persiste" className="dense-card">
        <div className="mini-metric-grid">
          <div><span className="section-label">Comandos</span><strong>{abaData?.data.commandCount ?? 0}</strong></div>
          <div><span className="section-label">Concluídos</span><strong>{abaData?.data.completed ?? 0}</strong></div>
          <div><span className="section-label">Em execução</span><strong>{abaData?.data.running ?? 0}</strong></div>
          <div><span className="section-label">Falhas</span><strong>{abaData?.data.failed ?? 0}</strong></div>
        </div>
        <div className="table-helper top-gap">Runtime: {abaData?.data.runtime ?? 'carregando...'}. Não há console de texto livre: somente ações suportadas pelo Motor podem ser executadas.</div>
        {commandMessage ? <div className="table-helper top-gap">{commandMessage}</div> : null}

        <div className="stack-blocks top-gap">
          {PAPERCLIP_ACTIONS.map((item) => (
            <div key={item.action} className="row-between">
              <div>
                <strong>{item.label}</strong>
                <div className="table-helper">{item.helper}</div>
              </div>
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={() => void runPaperclipAction(item.action, item.label)}
              >
                {runningAction === item.action ? 'Executando...' : 'Executar'}
              </button>
            </div>
          ))}
        </div>

        <div className="top-gap table-helper">Últimos comandos persistidos</div>
        <ul className="list">
          {(abaData?.data.commands ?? []).slice(0, 10).map((command) => (
            <li key={command.id}>
              <strong>{command.target} · {command.action}</strong>
              <span>{command.status}{command.error ? ` · ${command.error}` : ''}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
