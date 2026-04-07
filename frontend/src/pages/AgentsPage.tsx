import { useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function AgentsPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getAgentsSnapshot(session), [session?.access_token]);
  const { data: abaData } = useAsyncData(() => api.getAbaStatus(session), [session?.access_token]);
  const [commandText, setCommandText] = useState('');
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);

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
      <Card title="ABA (Agents Build Agents)" subtitle="Automelhoria + comandos para Paper Clip e ADM" className="dense-card">
        <div className="table-helper">Capabilities: {abaData?.data.capabilities.join(', ') ?? 'carregando...'}</div>
        {commandMessage ? <div className="table-helper">{commandMessage}</div> : null}
        <div className="actions">
          <input value={commandText} placeholder="Comando operacional (ex.: gerar playbook top lead)" onChange={(event) => setCommandText(event.target.value)} />
          <button type="button" onClick={async () => {
            if (!commandText.trim()) return;
            const result = await api.commandPaperClip(session, commandText.trim(), { source: 'agents_page' });
            setCommandMessage(`Paper Clip: ${result.result ?? 'executado'}`);
            setCommandText('');
          }}>Comandar Paper Clip</button>
          <button type="button" onClick={async () => {
            if (!commandText.trim()) return;
            const result = await api.commandAdm(session, commandText.trim(), { source: 'agents_page' });
            setCommandMessage(`ADM: ${result.result ?? 'executado'}`);
            setCommandText('');
          }}>Comandar ADM</button>
          <button type="button" disabled={autoRunning} onClick={async () => {
            setAutoRunning(true);
            try {
              const result = await api.runAbaAuto(session);
              setCommandMessage(`ABA auto-run executado (${result.runCount} comando(s)).`);
            } finally {
              setAutoRunning(false);
            }
          }}>{autoRunning ? 'Rodando...' : 'Rodar automelhoria'}</button>
        </div>
        <ul className="list top-gap">
          {(abaData?.data.suggestedImprovements ?? []).map((item) => (
            <li key={item.id}><strong>{item.title}</strong><span>{item.reason} · owner {item.owner} · {item.priority}</span></li>
          ))}
        </ul>
        <div className="top-gap table-helper">Últimos comandos ABA</div>
        <ul className="list">
          {(abaData?.data.lastCommands ?? []).map((command) => (
            <li key={command.id}><strong>{command.target}</strong><span>{command.action} · {command.status}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
