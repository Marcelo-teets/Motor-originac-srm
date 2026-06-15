import { Card, DataStatusBanner, EmptyState, LoadingState, PageIntro, Pill, ProgressBar, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AbmWeeklyWarRoom, DataState, PipelineSnapshot } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const emptyAbm = (): AbmWeeklyWarRoom => ({
  top_accounts: [],
  cooling_accounts: [],
  without_champion: [],
  overdue_next_steps: [],
  critical_open_objections: [],
});

const emptyPipeline = (): DataState<PipelineSnapshot> => ({
  source: 'partial',
  note: 'Pipeline indisponível; exibindo fallback operacional para não bloquear a rotina de cobertura.',
  data: { stages: [], recentActivities: [] },
});

const statusTone = (value: number) => value > 0 ? 'warning' : 'success';

export function PipelinePage() {
  const { session } = useAuth();
  const { data, loading } = useAsyncData(async () => {
    const [pipelineResult, abmResult] = await Promise.allSettled([api.getPipelineSnapshot(session), api.getAbmWeekly(session)]);
    const pipeline = pipelineResult.status === 'fulfilled' ? pipelineResult.value : emptyPipeline();
    const abm = abmResult.status === 'fulfilled' ? abmResult.value.data : emptyAbm();
    return {
      ...pipeline,
      abm,
      health: {
        pipelineOk: pipelineResult.status === 'fulfilled',
        abmOk: abmResult.status === 'fulfilled',
      },
    };
  }, [session?.access_token]);

  if (loading) return <LoadingState title="Pipeline" subtitle="Carregando estágios, atividades recentes e alertas comerciais." />;
  if (!data) return <LoadingState title="Pipeline" subtitle="Preparando fallback operacional do pipeline." />;

  const maxStage = Math.max(...data.data.stages.map((item) => item.count), 1);
  const totalStages = data.data.stages.reduce((sum, item) => sum + item.count, 0);
  const urgentCommercialIssues = data.abm.cooling_accounts.length + data.abm.without_champion.length + data.abm.overdue_next_steps.length + data.abm.critical_open_objections.length;
  const nextAction = urgentCommercialIssues > 0
    ? 'Priorizar contas sem champion, próximos passos vencidos e objeções críticas antes de avançar novas abordagens.'
    : 'Pipeline sem alertas comerciais críticos; manter follow-up dos próximos passos e revisar top leads.';

  return (
    <div className="page">
      <PageIntro
        eyebrow="Pipeline"
        title="Pipeline / Activities"
        description="Leitura objetiva de volume por estágio, atividades recentes e alertas ABM. A tela agora tolera falha parcial do snapshot ou da camada comercial sem travar a operação."
        actions={(
          <div className="pill-row">
            <Pill tone={data.health.pipelineOk ? 'success' : 'warning'}>{data.health.pipelineOk ? 'pipeline ok' : 'pipeline parcial'}</Pill>
            <Pill tone={data.health.abmOk ? 'success' : 'warning'}>{data.health.abmOk ? 'abm ok' : 'abm parcial'}</Pill>
          </div>
        )}
      />
      <DataStatusBanner source={data.source} note={data.note} />

      <section className="decision-strip">
        <div className="decision-card">
          <Pill tone="info">Empresas no pipeline</Pill>
          <strong>{totalStages}</strong>
          <small>Soma das empresas agrupadas por estágio operacional.</small>
        </div>
        <div className="decision-card">
          <Pill tone={statusTone(data.abm.cooling_accounts.length)}>Deals esfriando</Pill>
          <strong>{data.abm.cooling_accounts.length}</strong>
          <small>Contas que perderam momentum e precisam de ação.</small>
        </div>
        <div className="decision-card">
          <Pill tone={statusTone(data.abm.without_champion.length)}>Sem champion</Pill>
          <strong>{data.abm.without_champion.length}</strong>
          <small>Contas sem sponsor claro no buying committee.</small>
        </div>
        <div className="decision-card">
          <Pill tone={statusTone(data.abm.overdue_next_steps.length)}>Ações vencidas</Pill>
          <strong>{data.abm.overdue_next_steps.length}</strong>
          <small>Próximos passos comerciais fora do prazo.</small>
        </div>
      </section>

      <Card title="Próxima ação operacional" subtitle="Síntese executiva do gargalo atual" tone="accent" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Objeções críticas" value={String(data.abm.critical_open_objections.length)} helper="Objeções abertas que podem travar mandato" />
          <Stat label="Atividades recentes" value={String(data.data.recentActivities.length)} helper="Ações de CRM retornadas pelo snapshot" />
          <Stat label="Estágios ativos" value={String(data.data.stages.filter((stage) => stage.count > 0).length)} helper="Etapas com empresas posicionadas" />
        </div>
        <p className="top-gap">{nextAction}</p>
      </Card>

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
          {data.data.stages.length ? (
            <div className="bars">
              {data.data.stages.map((stage) => (
                <div key={stage.stage}>
                  <div className="row-between"><span>{stage.stage}</span><strong>{stage.count}</strong></div>
                  <ProgressBar value={stage.count} max={maxStage} tone="info" />
                  <div className="table-helper">{stage.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem estágios carregados." description="Valide o endpoint de pipeline ou mova empresas a partir do Company Detail para criar tração comercial." />
          )}
        </Card>
        <Card title="Activities" subtitle="Últimas ações do pipeline" className="dense-card">
          {data.data.recentActivities.length ? (
            <ul className="list">
              {data.data.recentActivities.map((activity) => (
                <li key={`${activity.company}-${activity.title}`}><strong>{activity.company}</strong><span>{activity.title} · {activity.owner} · {activity.when} · {activity.status}</span></li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem atividades recentes." description="Crie activities nas contas priorizadas para conectar inteligência com execução comercial." />
          )}
        </Card>
      </section>
    </div>
  );
}
