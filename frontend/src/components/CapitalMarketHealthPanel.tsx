import { Link } from 'react-router-dom';
import { buildApiUrl } from '../lib/runtimeConfig';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';
import { Card, Pill, Stat } from './UI';

type HealthStatus = 'healthy' | 'stale' | 'failed' | 'partial' | 'stale_running' | 'never_succeeded' | 'never_run';

type DatasetHealth = {
  datasetCode: string;
  label: string;
  latestStatus: string | null;
  latestTriggerType: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  lastSuccessAt: string | null;
  latestAgeSeconds: number | null;
  latestDurationSeconds: number | null;
  filesProcessed: number;
  resourcesSkipped: number;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  eventsWritten: number;
  signalsWritten: number;
  runs30d: number;
  successfulRuns30d: number;
  failedRuns30d: number;
  successRate30d: number;
  errorMessage: string | null;
  healthStatus: HealthStatus;
};

type HealthSnapshot = {
  summary: {
    totalDatasets: number;
    healthyDatasets: number;
    attentionDatasets: number;
    neverRunDatasets: number;
    recordsSeenLatest: number;
    recordsInsertedLatest: number;
    signalsWrittenLatest: number;
  };
  datasets: DatasetHealth[];
};

type ApiEnvelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data: T;
  error?: string;
};

const statusLabels: Record<HealthStatus, string> = {
  healthy: 'Saudável',
  stale: 'Desatualizado',
  failed: 'Falhou',
  partial: 'Parcial',
  stale_running: 'Execução travada',
  never_succeeded: 'Nunca concluiu',
  never_run: 'Nunca executou',
};

function statusTone(status: HealthStatus): 'success' | 'warning' | 'info' | 'default' {
  if (status === 'healthy') return 'success';
  if (status === 'never_run') return 'info';
  if (status === 'stale' || status === 'partial') return 'warning';
  return 'warning';
}

function nextAction(status: HealthStatus) {
  if (status === 'healthy') return 'Manter rotina agendada';
  if (status === 'stale') return 'Reexecutar carga agendada';
  if (status === 'partial') return 'Reprocessar e revisar erros';
  if (status === 'stale_running') return 'Encerrar run e reexecutar';
  if (status === 'failed') return 'Corrigir falha antes do próximo ciclo';
  if (status === 'never_succeeded') return 'Validar integração e executar canário';
  return 'Executar primeira carga completa';
}

function formatDate(value: string | null) {
  if (!value) return 'Sem execução concluída';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}min`;
}

export function CapitalMarketHealthPanel() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(async () => {
    const response = await fetch(buildApiUrl('/capital-markets/health'), {
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    });
    const payload = await response.json() as ApiEnvelope<HealthSnapshot>;
    if (!response.ok) throw new Error(payload.error ?? `Falha ao carregar saúde CVM (${response.status}).`);
    return payload.data;
  }, [session?.access_token]);

  if (loading) {
    return <Card title="Saúde das fontes de mercado de capitais" subtitle="Carregando visão operacional dos conectores CVM">Aguarde...</Card>;
  }

  if (error || !data) {
    return (
      <Card
        title="Saúde das fontes de mercado de capitais"
        subtitle="O painel não conseguiu consultar a view operacional"
        actions={<Pill tone="warning">Atenção</Pill>}
      >
        <p>{error ?? 'Dados indisponíveis.'}</p>
        <div className="pill-row top-gap">
          <Link to="/sources" className="button secondary">Abrir catálogo de fontes</Link>
        </div>
      </Card>
    );
  }

  const overallTone = data.summary.attentionDatasets === 0 ? 'success' : data.summary.healthyDatasets > 0 ? 'warning' : 'info';
  const overallLabel = data.summary.attentionDatasets === 0
    ? 'Todos operacionais'
    : `${data.summary.attentionDatasets} requerem ação`;

  return (
    <Card
      title="Saúde das fontes de mercado de capitais"
      subtitle="CVM oficial: ofertas, fundos, FIDC, CRI, CRA e FII com recência, volume e falhas auditáveis"
      actions={<Pill tone={overallTone}>{overallLabel}</Pill>}
      className="dashboard-main-table"
    >
      <div className="mini-metric-grid">
        <Stat label="Datasets monitorados" value={String(data.summary.totalDatasets)} helper="cobertura regulatória oficial" />
        <Stat label="Saudáveis" value={String(data.summary.healthyDatasets)} helper="execução recente sem falha" />
        <Stat label="Nunca executados" value={String(data.summary.neverRunDatasets)} helper="carga inicial ainda pendente" />
        <Stat label="Registros na última rodada" value={String(data.summary.recordsSeenLatest)} helper={`${data.summary.recordsInsertedLatest} novos · ${data.summary.signalsWrittenLatest} sinais`} />
      </div>

      <div className="table-scroll top-gap">
        <table className="dense-table">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Status</th>
              <th>Último sucesso</th>
              <th>Última carga</th>
              <th>Taxa 30d</th>
              <th>Próxima ação</th>
            </tr>
          </thead>
          <tbody>
            {data.datasets.map((dataset) => (
              <tr key={dataset.datasetCode}>
                <td>
                  <strong>{dataset.label}</strong>
                  <div className="table-helper">{dataset.datasetCode}</div>
                </td>
                <td>
                  <Pill tone={statusTone(dataset.healthStatus)}>{statusLabels[dataset.healthStatus]}</Pill>
                  {dataset.errorMessage ? <div className="table-helper">{dataset.errorMessage}</div> : null}
                </td>
                <td>{formatDate(dataset.lastSuccessAt)}</td>
                <td>
                  <strong>{dataset.recordsSeen} registros</strong>
                  <div className="table-helper">
                    {dataset.recordsInserted} novos · {dataset.recordsUpdated} alterados · {formatDuration(dataset.latestDurationSeconds)}
                  </div>
                </td>
                <td>
                  <strong>{dataset.successRate30d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong>
                  <div className="table-helper">{dataset.successfulRuns30d}/{dataset.runs30d} execuções</div>
                </td>
                <td>{nextAction(dataset.healthStatus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pill-row top-gap">
        <Link to="/sources" className="button secondary">Abrir fontes</Link>
        <Link to="/monitoring" className="button secondary">Ver monitoring</Link>
        <Link to="/capture-inbox" className="button secondary">Abrir Capture Inbox</Link>
      </div>
    </Card>
  );
}
