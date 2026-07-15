import { Card, DataStatusBanner, EmptyState, LoadingState, PageIntro, Pill, Stat, TableViewport } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DataState, MonitoringSnapshot, SourceIntelligenceSnapshot } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const statusTone = (status: string) => {
  if (status === 'active' || status === 'real' || status === 'observed' || status === 'healthy') return 'success';
  if (status === 'attention' || status === 'partial' || status === 'degraded' || status === 'needs_setup') return 'warning';
  return 'info';
};

const formatMoment = (value: string | null) => {
  if (!value) return 'sem observação';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'data indisponível' : date.toLocaleString('pt-BR');
};

const emptySnapshot = (): DataState<MonitoringSnapshot> => ({
  source: 'partial',
  note: 'Monitoring snapshot indisponível; telemetria de fontes continua separada.',
  data: { recentTriggers: [], latestRuns: [], activeSources: [] },
});

const emptySourceIntelligence = (): DataState<SourceIntelligenceSnapshot> => ({
  source: 'partial',
  note: 'Telemetria agregada das fontes indisponível.',
  data: {
    generatedAt: new Date().toISOString(),
    summary: { totalSources: 0, realSources: 0, observedSources: 0, degradedSources: 0, outputs24h: 0, companiesCovered: 0 },
    families: [],
    sources: [],
    coverageGaps: [],
  },
});

export function MonitoringPage() {
  const { session } = useAuth();
  const { data, loading } = useAsyncData(async () => {
    const [snapshotResult, sourceResult] = await Promise.allSettled([
      api.getMonitoringSnapshot(session),
      api.getSourceIntelligence(session),
    ]);
    return {
      snapshot: snapshotResult.status === 'fulfilled' ? snapshotResult.value : emptySnapshot(),
      sourceIntelligence: sourceResult.status === 'fulfilled' ? sourceResult.value : emptySourceIntelligence(),
      health: {
        snapshotOk: snapshotResult.status === 'fulfilled',
        sourceTelemetryOk: sourceResult.status === 'fulfilled',
      },
    };
  }, [session?.access_token]);

  if (loading) return <LoadingState title="Monitoring Center" subtitle="Carregando evidências, triggers, fontes e execução dos agentes." />;
  if (!data) return <LoadingState title="Monitoring Center" subtitle="Preparando a telemetria operacional." />;

  const snapshot = data.snapshot;
  const intelligence = data.sourceIntelligence;
  const sourceRows = intelligence.data.sources;
  const triggerCount = snapshot.data.recentTriggers.length;
  const activeSourceCount = snapshot.data.activeSources.filter((item) => item.health !== 'down').length;
  const records30d = sourceRows.reduce((sum, source) => sum + source.captureRecords30d, 0);
  const latestObservedAt = sourceRows
    .map((source) => source.lastObservedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
  const captureStatus = intelligence.data.summary.outputs24h > 0
    ? 'active'
    : intelligence.data.summary.observedSources > 0
      ? 'idle'
      : 'attention';
  const nextGap = intelligence.data.coverageGaps[0];
  const nextCaptureAction = captureStatus === 'active'
    ? 'Revisar as evidências recentes e atualizar a próxima ação comercial dos leads afetados.'
    : nextGap
      ? `Ativar ou validar ${nextGap.name}: ${nextGap.recommendedAction}`
      : 'Executar uma captura controlada e confirmar a primeira evidência observada.';

  return (
    <div className="page">
      <PageIntro
        eyebrow="Monitoring"
        title="Central de monitoramento"
        description="Triggers, cobertura e frescor das evidências em uma visão segura. Diagnósticos de infraestrutura e segredos permanecem fora do navegador."
        actions={(
          <div className="pill-row">
            <Pill tone={statusTone(captureStatus)}>captura {captureStatus}</Pill>
            <Pill tone={data.health.snapshotOk ? 'success' : 'warning'}>{data.health.snapshotOk ? 'snapshot ok' : 'snapshot parcial'}</Pill>
            <Pill tone={data.health.sourceTelemetryOk ? 'success' : 'warning'}>{data.health.sourceTelemetryOk ? 'telemetria ok' : 'telemetria parcial'}</Pill>
          </div>
        )}
      />
      <DataStatusBanner source={snapshot.source} note={snapshot.note} />
      <DataStatusBanner source={intelligence.source} note={intelligence.note} />

      <Card title="Captura & evidência" subtitle="Telemetria agregada do fluxo Sources → Monitoring → Signals" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Outputs em 24h" value={String(intelligence.data.summary.outputs24h)} helper="evidências publicadas ou observadas no período" />
          <Stat label="Registros em 30d" value={String(records30d)} helper="capturas registradas, separadas de evidência útil" />
          <Stat label="Triggers visíveis" value={String(triggerCount)} helper="sinais recentes na camada operacional" />
          <Stat label="Fontes observadas" value={String(intelligence.data.summary.observedSources)} helper={`de ${intelligence.data.summary.totalSources} fontes catalogadas`} />
          <Stat label="Empresas cobertas" value={String(intelligence.data.summary.companiesCovered)} helper="companhias com evidência probatória" />
          <Stat label="Fontes degradadas" value={String(intelligence.data.summary.degradedSources)} helper="integrações que pedem atenção" />
          <Stat label="Lacunas de cobertura" value={String(intelligence.data.coverageGaps.length)} helper="fontes sem evidência observada" />
          <Stat label="Fontes no snapshot" value={String(activeSourceCount)} helper="catálogo disponível para operação" />
        </div>
        <div className="grid cols-3 top-gap">
          <div className="mini-panel">
            <strong>Cobertura observada</strong>
            <span>{intelligence.data.summary.observedSources}/{intelligence.data.summary.totalSources}</span>
            <small>catálogo e evidência são medidos separadamente</small>
          </div>
          <div className="mini-panel">
            <strong>Última evidência</strong>
            <span>{formatMoment(latestObservedAt)}</span>
            <small>data de publicação/observação, não de recaptura</small>
          </div>
          <div className="mini-panel">
            <strong>Diagnóstico técnico</strong>
            <span>restrito</span>
            <small>variáveis, tabelas e segredo operacional não são expostos à UI</small>
          </div>
        </div>
        <div className="top-gap">
          <strong>Próxima ação recomendada</strong>
          <p className="table-helper">{nextCaptureAction}</p>
        </div>
      </Card>

      <section className="grid cols-3">
        <Card title="Triggers recentes" subtitle="Sinais que mexeram na priorização" className="dense-card">
          {snapshot.data.recentTriggers.length ? (
            <ul className="list compact-list">
              {snapshot.data.recentTriggers.map((item) => (
                <li key={`${item.company}-${item.signal}`}><strong>{item.company}</strong><span>{item.signal} · {item.source} · força {item.strength}</span></li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem triggers recentes." description="Confirme captura e evidência antes de depender de priorização dinâmica." />
          )}
        </Card>
        <Card title="Últimas execuções" subtitle="Workflows e status" className="dense-card">
          {snapshot.data.latestRuns.length ? (
            <ul className="list compact-list">
              {snapshot.data.latestRuns.map((item) => (
                <li key={`${item.workflow}-${item.when}`}><strong>{item.workflow}</strong><span>{item.status} · {item.when} · {item.detail}</span></li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem execuções recentes." description="Execute captura ou recálculo para gerar trilha operacional." />
          )}
        </Card>
        <Card title="Lacunas prioritárias" subtitle="Fontes catalogadas ainda sem evidência" className="dense-card">
          {intelligence.data.coverageGaps.length ? (
            <ul className="list compact-list">
              {intelligence.data.coverageGaps.slice(0, 5).map((source) => (
                <li key={source.id}><strong>{source.name}</strong><span>{source.recommendedAction}</span></li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem lacunas registradas." description="Todas as fontes catalogadas já possuem evidência observada." />
          )}
        </Card>
      </section>

      <Card title="Telemetria por fonte" subtitle="Registros de captura e evidências úteis, sem expor infraestrutura interna" className="dense-card">
        {sourceRows.length ? (
          <TableViewport label="Telemetria agregada por fonte">
            <table className="dense-table">
              <thead>
                <tr><th>Fonte</th><th>Evidência</th><th>Registros 30d</th><th>Outputs 24h</th><th>Última observação</th><th>Saúde</th></tr>
              </thead>
              <tbody>
                {sourceRows.slice(0, 12).map((source) => (
                  <tr key={source.id}>
                    <td><strong>{source.name}</strong><div className="table-helper">{source.family}</div></td>
                    <td><Pill tone={statusTone(source.evidenceStatus)}>{source.evidenceStatus}</Pill></td>
                    <td>{source.captureRecords30d}</td>
                    <td>{source.outputs24h}</td>
                    <td>{formatMoment(source.lastObservedAt)}</td>
                    <td><Pill tone={statusTone(source.health)}>{source.health}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        ) : (
          <EmptyState title="Sem telemetria disponível." description="Aplique a migration de métricas e confirme o catálogo de fontes." />
        )}
      </Card>
    </div>
  );
}
