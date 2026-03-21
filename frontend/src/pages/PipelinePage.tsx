import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function PipelinePage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getPipelineSnapshot(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Pipeline" subtitle="Carregando pipeline">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Pipeline" subtitle="Falha ao carregar pipeline">{error}</Card></div>;

  const maxStage = Math.max(...data.data.stages.map((item) => item.count), 1);

  return (
    <div className="page">
      <PageIntro eyebrow="Pipeline" title="Pipeline / Activities" description="Leitura objetiva de volume por estágio e atividades recentes para ajudar cobertura, analytics e origination a identificar gargalos." actions={<Pill tone="success">visão executiva</Pill>} />
      <DataStatusBanner source={data.source} note={data.note} />
      <section className="grid cols-2">
        <Card title="Pipeline" subtitle="Empresas por estágio" className="dense-card">
          <div className="bars">
            {data.data.stages.map((stage) => (
              <div key={stage.stage}>
                <div className="row-between"><span>{stage.stage}</span><strong>{stage.count}</strong></div>
                <ProgressBar value={stage.count} max={maxStage} tone="info" />
                <div className="table-helper">{stage.note}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Activities" subtitle="Últimas ações do pipeline" className="dense-card">
          <ul className="list">
            {data.data.recentActivities.map((activity) => (
              <li key={`${activity.company}-${activity.title}`}><strong>{activity.company}</strong><span>{activity.title} · {activity.owner} · {activity.when} · {activity.status}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
