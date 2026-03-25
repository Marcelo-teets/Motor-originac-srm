import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function PipelinePage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(async () => {
    const [pipeline, abm] = await Promise.all([api.getPipelineSnapshot(session), api.getAbmWeekly(session)]);
    return { ...pipeline, abm: abm.data };
  }, [session?.access_token]);

  if (loading) return <div className="page"><Card title="Pipeline" subtitle="Carregando pipeline">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Pipeline" subtitle="Falha ao carregar pipeline">{error}</Card></div>;

  const maxStage = Math.max(...data.data.stages.map((item) => item.count), 1);

  return (
    <div className="page">
      <PageIntro eyebrow="Pipeline" title="Pipeline / Activities" description="Leitura objetiva de volume por estágio e atividades recentes para ajudar cobertura, analytics e origination a identificar gargalos." actions={<Pill tone="success">visão executiva</Pill>} />
      <DataStatusBanner source={data.source} note={data.note} />
      <section className="grid cols-2">
        <Card title="ABM visões operacionais" subtitle="Temperatura, champion/blocker e próximos passos" className="dense-card">
          <ul className="list">
            <li><strong>Deals esfriando</strong><span>{data.abm.cooling_accounts.length}</span></li>
            <li><strong>Sem champion</strong><span>{data.abm.without_champion.length}</span></li>
            <li><strong>Próximos passos vencidos</strong><span>{data.abm.overdue_next_steps.length}</span></li>
            <li><strong>Objeções críticas abertas</strong><span>{data.abm.critical_open_objections.length}</span></li>
          </ul>
        </Card>
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
