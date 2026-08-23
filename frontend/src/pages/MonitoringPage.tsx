import { Card, DataStatusBanner, EmptyState, LoadingState, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DataState, MonitoringSnapshot } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const statusTone = (status: string) => {
  if (status === 'active' || status === 'real') return 'success';
  if (status === 'attention' || status === 'partial') return 'warning';
  return 'info';
};

const emptySnapshot = (): DataState<MonitoringSnapshot> => ({
  source: 'partial',
  note: 'Monitoring snapshot indisponível. Nenhum dado sintético foi usado para preencher a tela.',
  data: { recentTriggers: [], latestRuns: [], activeSources: [] },
});

export function MonitoringPage() {
  const { session } = useAuth();
  const snapshotState = useAsyncData(() => api.getMonitoringSnapshot(session), [session?.access_token]);

  if (snapshotState.loading) {
    return <LoadingState title="Monitoring Center" subtitle="Carregando triggers, fontes e execução dos agentes." />;
  }

  const snapshot = snapshotState.data ?? emptySnapshot();
  const triggerCount = snapshot.data.recentTriggers.length;
  const activeSourceCount = snapshot.data.activeSources.filter((item) => item.health !== 'down').length;
  const degradedSourceCount = snapshot.data.activeSources.filter((item) => item.health !== 'healthy').length;
  const latestRunCount = snapshot.data.latestRuns.length;
  const snapshotAvailable = Boolean(snapshotState.data && !snapshotState.error);
  const captureStatus = !snapshotAvailable || snapshot.source !== 'real'
    ? 'attention'
    : activeSourceCount > 0 && latestRunCount > 0
      ? 'active'
      : 'idle';
  const nextCaptureAction = captureStatus === 'active'
    ? 'Revisar os triggers recentes, confirmar a tese e atualizar a próxima ação comercial dos top leads.'
    : 'Preservar o circuit breaker e validar a saúde do Supabase antes de reativar captura ou recálculo. Não preencher lacunas com mocks.';

  return (
    <div className="page">
      <PageIntro
        eyebrow="Monitoring"
        title="Monitoring center"
        description="Visão operacional de triggers, execuções e cobertura por fonte. A tela consome apenas o snapshot autenticado do backend; diagnósticos com CRON_SECRET permanecem fora do navegador."
        actions={(
          <div className="pill-row">
            <Pill tone={statusTone(captureStatus)}>captura {captureStatus}</Pill>
            <Pill tone={snapshotAvailable ? 'success' : 'warning'}>{snapshotAvailable ? 'snapshot autenticado' : 'snapshot indisponível'}</Pill>
          </div>
        )}
      />

      <DataStatusBanner source={snapshot.source} note={snapshotState.error ? `Monitoring indisponível: ${snapshotState.error.message}` : snapshot.note} />

      <Card title="Captura & tratamento" subtitle="Estado seguro para operação e decisão de originação" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Triggers visíveis" value={String(triggerCount)} helper="Sinais que chegaram à camada operacional" />
          <Stat label="Fontes ativas" value={String(activeSourceCount)} helper="Fontes disponíveis no snapshot real" />
          <Stat label="Fontes degradadas" value={String(degradedSourceCount)} helper="Fontes fora do estado healthy" />
          <Stat label="Execuções visíveis" value={String(latestRunCount)} helper="Runs expostas pelo backend autenticado" />
        </div>

        <div className="grid cols-2 top-gap">
          <div className="mini-panel">
            <strong>Contrato da tela</strong>
            <span>{snapshot.source === 'real' ? 'dados reais' : 'parcial explícito'}</span>
            <small>Ausência de dado não é substituída por leads, contagens ou ações inventadas.</small>
          </div>
          <div className="mini-panel">
            <strong>Diagnóstico sensível</strong>
            <span>restrito ao runtime</span>
            <small>Contagens de tabelas, presença de secrets e health com CRON_SECRET não são solicitados pelo browser.</small>
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
                <li key={`${item.company}-${item.signal}`}>
                  <strong>{item.company}</strong>
                  <span>{item.signal} · {item.source} · força {item.strength}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem triggers recentes." description="Valide a captura e os company_signals antes de depender de priorização dinâmica." />
          )}
        </Card>

        <Card title="Últimas execuções" subtitle="Workflows e status" className="dense-card">
          {snapshot.data.latestRuns.length ? (
            <ul className="list compact-list">
              {snapshot.data.latestRuns.map((item) => (
                <li key={`${item.workflow}-${item.when}`}>
                  <strong>{item.workflow}</strong>
                  <span>{item.status} · {item.when} · {item.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem execuções recentes." description="Não force automações enquanto a infraestrutura persistente estiver degradada." />
          )}
        </Card>

        <Card title="Fontes ativas" subtitle="Status e cobertura" className="dense-card">
          {snapshot.data.activeSources.length ? (
            <ul className="list compact-list">
              {snapshot.data.activeSources.map((item) => (
                <li key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{item.status} · {item.health} · {item.coverage}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem fontes no snapshot." description="Verifique Source Catalog e disponibilidade do Supabase antes de concluir que não há fontes configuradas." />
          )}
        </Card>
      </section>
    </div>
  );
}
