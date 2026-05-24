import { Card, DataStatusBanner, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

const statusTone = (status: string) => {
  if (status === 'active') return 'success';
  if (status === 'attention') return 'warning';
  return 'info';
};

export function MonitoringPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getMonitoringSnapshot(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Monitoring Center" subtitle="Carregando monitoring">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Monitoring Center" subtitle="Falha ao carregar monitoring">{error}</Card></div>;

  const triggerCount = data.data.recentTriggers.length;
  const activeSourceCount = data.data.activeSources.filter((item) => item.health !== 'down').length;
  const degradedSourceCount = data.data.activeSources.filter((item) => item.health !== 'healthy').length;
  const captureStatus = triggerCount > 0 ? 'active' : degradedSourceCount > 0 ? 'attention' : 'idle';
  const nextCaptureAction = triggerCount > 0
    ? 'Revisar triggers tratados, confirmar tese e atualizar próxima ação comercial dos top leads.'
    : 'Executar a captura na main atualizada e validar se monitoring_outputs, company_signals e enrichments passaram a ser persistidos no Supabase.';

  return (
    <div className="page">
      <PageIntro eyebrow="Monitoring" title="Monitoring center" description="Visão condensada de triggers recentes, últimas execuções e cobertura por fonte para apoiar operação e troubleshooting." actions={<Pill tone={statusTone(captureStatus)}>captura {captureStatus}</Pill>} />
      <DataStatusBanner source={data.source} note={data.note} />

      <Card title="Captura & tratamento" subtitle="Painel operacional para acompanhar se a captura virou sinal útil para originação" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Triggers visíveis" value={String(triggerCount)} helper="Sinais que já chegaram à camada operacional" />
          <Stat label="Fontes ativas" value={String(activeSourceCount)} helper="Fontes disponíveis para monitoramento" />
          <Stat label="Fontes degradadas" value={String(degradedSourceCount)} helper="Fontes que pedem revisão antes de escala" />
        </div>
        <div className="top-gap">
          <strong>Próxima ação recomendada</strong>
          <p className="table-helper">{nextCaptureAction}</p>
        </div>
      </Card>

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
