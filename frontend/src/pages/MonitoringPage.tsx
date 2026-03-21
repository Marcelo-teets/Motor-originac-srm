import { Card, DataStatusBanner, PageIntro, Pill } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function MonitoringPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getMonitoringSnapshot(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Monitoring Center" subtitle="Carregando monitoring">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Monitoring Center" subtitle="Falha ao carregar monitoring">{error}</Card></div>;

  return (
    <div className="page">
      <PageIntro eyebrow="Monitoring" title="Monitoring center" description="Visão condensada de triggers recentes, últimas execuções e cobertura por fonte para apoiar operação e troubleshooting." actions={<Pill tone="info">operacional</Pill>} />
      <DataStatusBanner source={data.source} note={data.note} />
      <section className="grid cols-3">
        <Card title="Triggers recentes" subtitle="Sinais que mexeram na priorização" className="dense-card">
          <ul className="list compact-list">
            {data.data.recentTriggers.map((item) => (
              <li key={`${item.company}-${item.signal}`}><strong>{item.company}</strong><span>{item.signal} · {item.source} · força {item.strength}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Últimas execuções" subtitle="Workflows e status" className="dense-card">
          <ul className="list compact-list">
            {data.data.latestRuns.map((item) => (
              <li key={`${item.workflow}-${item.when}`}><strong>{item.workflow}</strong><span>{item.status} · {item.when} · {item.detail}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Fontes ativas" subtitle="Status e cobertura" className="dense-card">
          <ul className="list compact-list">
            {data.data.activeSources.map((item) => (
              <li key={item.name}><strong>{item.name}</strong><span>{item.status} · {item.health} · {item.coverage}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
