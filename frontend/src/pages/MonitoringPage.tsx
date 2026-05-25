import { Card, DataStatusBanner, PageIntro, Pill, Stat } from '../components/UI';
import { getCaptureHealth } from '../lib/captureHealthApi';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

const statusTone = (status: string) => {
  if (status === 'active' || status === 'real') return 'success';
  if (status === 'attention' || status === 'partial') return 'warning';
  return 'info';
};

const tableCount = (tables: Array<{ table: string; count: number | null }>, tableName: string) => tables.find((item) => item.table === tableName)?.count ?? 0;
const booleanLabel = (value?: boolean) => value ? 'sim' : 'não';

export function MonitoringPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(async () => {
    const [snapshot, captureHealth] = await Promise.all([
      api.getMonitoringSnapshot(session),
      getCaptureHealth(),
    ]);
    return { snapshot, captureHealth };
  }, [session?.access_token]);

  if (loading) return <div className="page"><Card title="Monitoring Center" subtitle="Carregando monitoring">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Monitoring Center" subtitle="Falha ao carregar monitoring">{error}</Card></div>;

  const snapshot = data.snapshot;
  const captureHealth = data.captureHealth;
  const tables = captureHealth.data.tables;
  const triggerCount = snapshot.data.recentTriggers.length;
  const activeSourceCount = snapshot.data.activeSources.filter((item) => item.health !== 'down').length;
  const degradedSourceCount = snapshot.data.activeSources.filter((item) => item.health !== 'healthy').length;
  const monitoringOutputs = tableCount(tables, 'monitoring_outputs');
  const connectorRuns = tableCount(tables, 'source_connector_runs');
  const companySignals = tableCount(tables, 'company_signals');
  const enrichments = tableCount(tables, 'enrichments');
  const scoreSnapshots = tableCount(tables, 'score_snapshots');
  const canRunCapture = Boolean(captureHealth.data.captureRuntime?.canRunAgainstSupabase);
  const canAuthorizeWorkflow = Boolean(captureHealth.data.captureRuntime?.canAuthorizeWorkflow);
  const coreTablesAccessible = Boolean(captureHealth.data.captureRuntime?.coreTablesAccessible);
  const captureStatus = monitoringOutputs > 0 && connectorRuns > 0 ? 'active' : !canRunCapture || !canAuthorizeWorkflow || !coreTablesAccessible ? 'attention' : 'idle';
  const nextCaptureAction = captureStatus === 'active'
    ? 'Revisar outputs recentes, confirmar tese e atualizar próxima ação comercial dos top leads.'
    : 'Rodar Capture Data manualmente no GitHub Actions e validar se source_connector_runs e monitoring_outputs passaram a ser persistidos.';

  return (
    <div className="page">
      <PageIntro eyebrow="Monitoring" title="Monitoring center" description="Visão condensada de triggers recentes, últimas execuções e cobertura por fonte para apoiar operação e troubleshooting." actions={<Pill tone={statusTone(captureStatus)}>captura {captureStatus}</Pill>} />
      <DataStatusBanner source={snapshot.source} note={snapshot.note} />
      <DataStatusBanner source={captureHealth.source} note={captureHealth.note} />

      <Card title="Captura & tratamento" subtitle="Painel operacional para acompanhar se a captura virou sinal útil para originação" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Runs persistidas" value={String(connectorRuns)} helper="source_connector_runs gravadas no Supabase" />
          <Stat label="Outputs persistidos" value={String(monitoringOutputs)} helper="monitoring_outputs disponíveis para tese e score" />
          <Stat label="Sinais persistidos" value={String(companySignals)} helper="company_signals observados/inferidos" />
          <Stat label="Enrichments" value={String(enrichments)} helper="perfis tratados pela captura" />
          <Stat label="Score snapshots" value={String(scoreSnapshots)} helper="histórico técnico de score" />
          <Stat label="Triggers visíveis" value={String(triggerCount)} helper="Sinais que já chegaram à camada operacional" />
        </div>
        <div className="grid cols-3 top-gap">
          <div className="mini-panel">
            <strong>Supabase runtime</strong>
            <span>{booleanLabel(canRunCapture)}</span>
            <small>SUPABASE_URL + chave operacional resolvidas</small>
          </div>
          <div className="mini-panel">
            <strong>Workflow autorizado</strong>
            <span>{booleanLabel(canAuthorizeWorkflow)}</span>
            <small>CRON_SECRET configurado no runtime</small>
          </div>
          <div className="mini-panel">
            <strong>Tabelas core acessíveis</strong>
            <span>{booleanLabel(coreTablesAccessible)}</span>
            <small>companies, source_catalog, outputs e runs</small>
          </div>
        </div>
        <div className="top-gap">
          <strong>Próxima ação recomendada</strong>
          <p className="table-helper">{nextCaptureAction}</p>
        </div>
      </Card>

      <section className="grid cols-3">
        <Card title="Triggers recentes" subtitle="Sinais que mexeram na priorização" className="dense-card">
          <ul className="list compact-list">
            {snapshot.data.recentTriggers.map((item) => (
              <li key={`${item.company}-${item.signal}`}><strong>{item.company}</strong><span>{item.signal} · {item.source} · força {item.strength}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Últimas execuções" subtitle="Workflows e status" className="dense-card">
          <ul className="list compact-list">
            {snapshot.data.latestRuns.map((item) => (
              <li key={`${item.workflow}-${item.when}`}><strong>{item.workflow}</strong><span>{item.status} · {item.when} · {item.detail}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Fontes ativas" subtitle="Status e cobertura" className="dense-card">
          <ul className="list compact-list">
            {snapshot.data.activeSources.map((item) => (
              <li key={item.name}><strong>{item.name}</strong><span>{item.status} · {item.health} · {item.coverage}</span></li>
            ))}
          </ul>
        </Card>
      </section>

      <Card title="Auditoria de tabelas da captura" subtitle="Contagens e erros por tabela crítica do fluxo Sources → Monitoring → Signals → Scores" className="dense-card">
        <table className="dense-table">
          <thead>
            <tr><th>Tabela</th><th>Status</th><th>Linhas</th><th>Erro</th></tr>
          </thead>
          <tbody>
            {tables.map((item) => (
              <tr key={item.table}>
                <td><strong>{item.table}</strong></td>
                <td><Pill tone={item.ok ? 'success' : 'warning'}>{item.ok ? 'ok' : 'atenção'}</Pill></td>
                <td>{item.count ?? '-'}</td>
                <td>{item.error ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
