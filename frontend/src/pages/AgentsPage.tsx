import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function AgentsPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getAgentsSnapshot(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Agents Control" subtitle="Carregando agents">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Agents Control" subtitle="Falha ao carregar agents">{error}</Card></div>;

  return (
    <div className="page">
      <PageIntro eyebrow="Agents" title="Agents control" description="Status operacional, falhas e confiança dos agentes críticos reunidos em uma visão mais executiva e menos técnica/fragmentada." actions={<Pill tone="warning">saúde operacional</Pill>} />
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
    </div>
  );
}
