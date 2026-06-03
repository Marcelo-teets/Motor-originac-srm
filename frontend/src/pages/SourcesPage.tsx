import { Card, DataStatusBanner, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

const healthTone = (health: string) => {
  if (health === 'healthy') return 'success';
  if (health === 'degraded') return 'warning';
  if (health === 'down') return 'danger';
  return 'info';
};

const statusTone = (status: string) => {
  if (status === 'real') return 'success';
  if (status === 'planned') return 'info';
  if (status === 'partial') return 'warning';
  return 'default';
};

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

export function SourcesPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getSourceHealthSnapshot(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Sources" subtitle="Carregando saúde das fontes">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Sources" subtitle="Falha ao carregar fontes">{error}</Card></div>;

  const { summary, sources } = data.data;
  const officialSources = sources.filter((source) => source.isOfficial);
  const activeSources = sources.filter((source) => source.outputCount > 0);

  return (
    <div className="page">
      <DataStatusBanner source={data.source} note={data.note} />

      <Card
        title="Source Health Command Center"
        subtitle="Visão executiva de fontes, evidências capturadas e prontidão para qualification/patterns/ranking."
      >
        <div className="grid cols-4">
          <Stat label="Fontes no catálogo" value={String(summary.totalSources)} helper={`${summary.healthySources} healthy · ${summary.degradedSources} degraded · ${summary.downSources} down`} />
          <Stat label="Fontes ativas" value={String(summary.activeSources)} helper="Status real no source_catalog" />
          <Stat label="Outputs persistidos" value={String(summary.totalOutputs)} helper={`${summary.realOutputs} reais · ${summary.partialOutputs} parciais`} />
          <Stat label="Oficiais com evidência" value={String(summary.officialSourcesObserved)} helper="CVM, BCB, PNCP, Receita, ANBIMA etc." />
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Fontes oficiais priorizadas" subtitle="O que sustenta sinais de FIDC, DCM, recebíveis públicos e regulação.">
          <table>
            <thead>
              <tr><th>Fonte</th><th>Status</th><th>Outputs</th><th>Conf.</th><th>Última evidência</th></tr>
            </thead>
            <tbody>
              {officialSources.map((source) => (
                <tr key={source.id}>
                  <td><strong>{source.name}</strong><br /><small>{source.category}</small></td>
                  <td><Pill tone={healthTone(source.health)}>{source.health}</Pill></td>
                  <td>{source.outputCount}</td>
                  <td>{source.averageConfidence}%</td>
                  <td>{source.lastOutputTitle ?? '-'}<br /><small>{formatDate(source.lastOutputAt)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Próximas ações por fonte" subtitle="Fila operacional para aumentar dado real e reduzir mock/fallback.">
          <ul className="list">
            {sources.slice(0, 8).map((source) => (
              <li key={source.id}>
                <strong>{source.name}</strong>
                <span>{source.decision}</span>
                <small>{source.nextAction}</small>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Catálogo completo" subtitle="Source catalog cruzado com monitoring_outputs para governança e auditoria.">
        <table>
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Status</th>
              <th>Health</th>
              <th>Outputs</th>
              <th>Reais</th>
              <th>Parciais</th>
              <th>Confiança</th>
              <th>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td><strong>{source.name}</strong>{source.isOfficial ? <><br /><Pill tone="info">oficial</Pill></> : null}</td>
                <td>{source.sourceType}</td>
                <td>{source.category}</td>
                <td><Pill tone={statusTone(source.status)}>{source.status}</Pill></td>
                <td><Pill tone={healthTone(source.health)}>{source.health}</Pill></td>
                <td>{source.outputCount}</td>
                <td>{source.realOutputCount}</td>
                <td>{source.partialOutputCount}</td>
                <td>{source.averageConfidence}%</td>
                <td>{source.decision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Fontes com evidência recente" subtitle="Base de fontes que já estão alimentando sinais reais no motor.">
        <table>
          <thead>
            <tr><th>Fonte</th><th>Último output</th><th>Status</th><th>Quando</th><th>Próxima ação</th></tr>
          </thead>
          <tbody>
            {activeSources.map((source) => (
              <tr key={source.id}>
                <td>{source.name}</td>
                <td>{source.lastOutputTitle ?? '-'}</td>
                <td><Pill tone={statusTone(source.lastOutputStatus ?? source.status)}>{source.lastOutputStatus ?? source.status}</Pill></td>
                <td>{formatDate(source.lastOutputAt)}</td>
                <td>{source.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
