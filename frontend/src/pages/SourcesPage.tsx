import { Card, DataStatusBanner, EmptyState, LoadingState, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getPublicDataOperations, type PublicDataOperationsDataset } from '../lib/publicDataOperationsApi';
import type { SourceEntry } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

type SourceMetadata = {
  code?: string;
  provider?: string;
  domain?: string;
  coverage?: string;
  cadence?: string;
  queryTemplate?: string;
  metricsTracked?: string[];
  signalsTracked?: string[];
  roleFamilies?: string[];
  historyTables?: string[];
  outputTables?: string[];
  [key: string]: unknown;
};

type RichSourceEntry = SourceEntry & {
  metadata?: SourceMetadata;
  authRequirement?: string;
  rateLimitNotes?: string;
};

const metadataFor = (source: SourceEntry) => (source as RichSourceEntry).metadata ?? {};

const toneForStatus = (value: string) => {
  if (value === 'real' || value === 'healthy') return 'success';
  if (value === 'partial' || value === 'degraded' || value === 'attention' || value === 'blocked') return 'warning';
  return 'info';
};

const sourceFamily = (source: SourceEntry) => {
  const type = `${source.sourceType} ${source.category}`.toLowerCase();
  if (type.includes('linkedin') || type.includes('professional_network')) return 'LinkedIn';
  if (type.includes('media') || type.includes('rss') || type.includes('news')) return 'Mídia/RSS';
  if (type.includes('api') || type.includes('regulat')) return 'API/Regulatório';
  return 'Outras';
};

const joinList = (items?: string[]) => (items?.length ? items.join(', ') : '-');
const number = new Intl.NumberFormat('pt-BR');
const formatNumber = (value: number) => number.format(value);
const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'nunca';

const coverageLabel = (dataset: PublicDataOperationsDataset) => {
  if (dataset.latestRun) {
    const covered = dataset.latestRun.resourcesProcessed + dataset.latestRun.resourcesSkipped;
    return `${covered}/${dataset.latestRun.resourcesDiscovered} recursos`;
  }
  return dataset.lifetime.checkpointCount
    ? `${dataset.lifetime.completedCheckpoints}/${dataset.lifetime.checkpointCount} checkpoints`
    : 'não iniciada';
};

export function SourcesPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getSources(session), [session?.access_token]);
  const { data: quotaEnvelope } = useAsyncData(() => api.getMaisRetornoQuota(session), [session?.access_token]);
  const { data: publicOperations, loading: publicOperationsLoading } = useAsyncData(
    () => getPublicDataOperations(session),
    [session?.access_token],
  );

  if (loading) return <LoadingState title="Sources" subtitle="Carregando catálogo de fontes, métricas monitoradas e cobertura operacional." />;
  if (error || !data) return <div className="page"><Card title="Sources" subtitle="Falha ao carregar catálogo">{error}</Card></div>;

  const sources = data.data;
  const linkedinSources = sources.filter((source) => sourceFamily(source) === 'LinkedIn');
  const mediaSources = sources.filter((source) => sourceFamily(source) === 'Mídia/RSS');
  const realSources = sources.filter((source) => source.status === 'real');
  const historicalMetricSources = sources.filter((source) => metadataFor(source).metricsTracked?.length || metadataFor(source).historyTables?.length);
  const publicSummary = publicOperations?.data.summary;
  const publicDatasets = publicOperations?.data.datasets ?? [];
  const publicBlockers = publicOperations?.data.blockers ?? [];

  return (
    <div className="page">
      <PageIntro
        eyebrow="Sources"
        title="Catálogo e operação das fontes"
        description="Governança das fontes que alimentam monitoring, signals, qualification e ranking. A visão operacional mostra execução, cobertura, matches por CNPJ, erros e próxima ação para cada loader público."
        actions={(
          <div className="pill-row">
            <Pill tone={data.source === 'real' ? 'success' : 'warning'}>{data.source === 'real' ? 'source_catalog real' : 'source_catalog parcial'}</Pill>
            <Pill tone={publicOperations?.source === 'real' ? 'success' : 'warning'}>{publicOperations?.source === 'real' ? 'operação pública real' : 'operação pública parcial'}</Pill>
          </div>
        )}
      />
      <DataStatusBanner source={data.source} note={data.note} />
      {publicOperations ? <DataStatusBanner source={publicOperations.source} note={publicOperations.note} /> : null}

      <section className="decision-strip">
        <div className="decision-card"><Pill tone="info">Fontes totais</Pill><strong>{sources.length}</strong><small>Registros no catálogo operacional.</small></div>
        <div className="decision-card"><Pill tone="success">Fontes reais</Pill><strong>{realSources.length}</strong><small>Fontes já marcadas como real no catálogo.</small></div>
        <div className="decision-card"><Pill tone="warning">Datasets públicos</Pill><strong>{publicSummary?.totalDatasets ?? 0}</strong><small>Loaders oficiais com controle de execução.</small></div>
        <div className="decision-card"><Pill tone={publicBlockers.length ? 'warning' : 'success'}>Bloqueios</Pill><strong>{publicBlockers.length}</strong><small>Impedimentos operacionais identificados automaticamente.</small></div>
      </section>

      {publicOperationsLoading ? (
        <Card title="Operação das fontes públicas" subtitle="Carregando runs, checkpoints e sinais"><LoadingState title="Operação pública" subtitle="Consultando o control plane no Supabase." /></Card>
      ) : publicOperations ? (
        <>
          <Card title="Control plane · fontes públicas" subtitle="Estado real dos loaders oficiais targeted by CNPJ" className="dense-card">
            <div className="mini-metric-grid">
              <Stat label="Datasets saudáveis" value={String(publicSummary?.healthyDatasets ?? 0)} helper={`${publicSummary?.waitingDatasets ?? 0} aguardando primeira execução`} />
              <Stat label="Empresas com CNPJ" value={String(publicSummary?.targetCompaniesWithValidCnpj ?? 0)} helper="Universo elegível para matching oficial" />
              <Stat label="Linhas escaneadas" value={formatNumber(publicSummary?.rowsScanned ?? 0)} helper="Volume histórico percorrido nas bases" />
              <Stat label="Registros aderentes" value={formatNumber(publicSummary?.recordsPersisted ?? 0)} helper="Registros persistidos no Company Master" />
              <Stat label="Outputs" value={formatNumber(publicSummary?.outputsPersisted ?? 0)} helper="Evidências disponíveis no monitoring" />
              <Stat label="Sinais" value={formatNumber(publicSummary?.signalsPersisted ?? 0)} helper="Impactos explicáveis para qualification" />
            </div>
          </Card>

          {publicBlockers.length ? (
            <Card title="Bloqueios operacionais" subtitle="O que impede a captura real e como destravar" className="dense-card">
              <ul className="list compact-list">
                {publicBlockers.map((blocker) => (
                  <li key={blocker.code}>
                    <strong>{blocker.title}</strong>
                    <span>{blocker.detail}</span>
                    <span><b>Próxima ação:</b> {blocker.nextAction}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Loaders públicos por dataset" subtitle="Cobertura, última execução, matches e impacto no motor" className="dense-card">
            {publicDatasets.length ? (
              <table className="dense-table">
                <thead>
                  <tr><th>Dataset</th><th>Cadência</th><th>Operação</th><th>Última execução</th><th>Cobertura</th><th>Dados aderentes</th><th>Próxima ação</th></tr>
                </thead>
                <tbody>
                  {publicDatasets.map((dataset) => (
                    <tr key={dataset.datasetCode}>
                      <td>
                        <strong>{dataset.displayName}</strong>
                        <div className="table-helper">{dataset.sourceName ?? dataset.sourceCode}</div>
                        <div className="table-helper">sinal: {dataset.signalType}</div>
                      </td>
                      <td>
                        <div>{dataset.cadence}</div>
                        <div className="table-helper">{dataset.executionMode}</div>
                      </td>
                      <td>
                        <Pill tone={toneForStatus(dataset.operationalStatus)}>{dataset.operationalStatus}</Pill>
                        <div className="table-helper">catálogo {dataset.sourceStatus} · {dataset.sourceHealth}</div>
                      </td>
                      <td>
                        <div>{formatDate(dataset.latestRun?.finishedAt ?? dataset.latestRun?.startedAt)}</div>
                        <div className="table-helper">runs: {dataset.lifetime.runCount}</div>
                        {dataset.latestRun?.errorMessage ? <div className="table-helper">erro: {dataset.latestRun.errorMessage}</div> : null}
                      </td>
                      <td>
                        <div>{coverageLabel(dataset)}</div>
                        <div className="table-helper">{formatNumber(dataset.lifetime.rowsScanned)} linhas escaneadas</div>
                      </td>
                      <td>
                        <div>{formatNumber(dataset.lifetime.recordsPersisted)} registros · {dataset.lifetime.matchedCompanyCount} empresas</div>
                        <div className="table-helper">{dataset.lifetime.outputsPersisted} outputs · {dataset.lifetime.signalsPersisted} sinais</div>
                      </td>
                      <td><div className="table-helper">{dataset.nextAction}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="Sem snapshot dos loaders públicos." description="Aplique a migration 059 e valide a rota autenticada /api/sources/public-operations." />
            )}
          </Card>
        </>
      ) : null}

      {quotaEnvelope?.data ? (
        <Card
          title="Connector Budget · Mais Retorno"
          subtitle={`Quota mensal governada (${quotaEnvelope.data.monthKey})`}
          className="dense-card"
        >
          <div className="mini-metric-grid">
            <Stat label="Quota mensal" value={String(quotaEnvelope.data.monthlyQuota)} helper={`soft target ${quotaEnvelope.data.softTarget}`} />
            <Stat label="Usado" value={String(quotaEnvelope.data.used)} helper={quotaEnvelope.data.allowed ? 'Chamadas liberadas' : 'Quota esgotada'} />
            <Stat label="Restante" value={String(quotaEnvelope.data.remaining)} helper={quotaEnvelope.data.warning ? 'Acima de 80% da quota' : 'Consumo saudável'} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Pill tone={quotaEnvelope.status === 'real' ? 'success' : 'warning'}>{quotaEnvelope.status === 'real' ? 'quota persistida (supabase)' : 'quota parcial (fallback)'}</Pill>
            {quotaEnvelope.data.warning ? <Pill tone="warning">alerta: uso ≥ 80%</Pill> : null}
            {!quotaEnvelope.data.allowed ? <Pill tone="warning">bloqueado: quota mensal esgotada</Pill> : null}
          </div>
          {quotaEnvelope.data.mode !== 'supabase' ? (
            <p className="table-helper" style={{ marginTop: 8 }}>
              A contagem está em memória/fallback e não é persistida nem verificável no Supabase. Os números podem zerar a cada deploy — configure o Supabase para governança real da quota.
            </p>
          ) : null}
        </Card>
      ) : null}

      <section className="grid cols-3">
        <Card title="Cobertura por família" subtitle="Prioridade para origem de sinais reais" className="dense-card">
          <div className="mini-metric-grid">
            <Stat label="Real" value={String(realSources.length)} helper="Fontes já marcadas como reais" />
            <Stat label="LinkedIn" value={String(linkedinSources.length)} helper="Página, cargos e posts" />
            <Stat label="Mídia/RSS" value={String(mediaSources.length)} helper="Notícias e publicações de negócio" />
          </div>
        </Card>
        <Card title="LinkedIn — histórico esperado" subtitle="Métricas que devem virar série temporal" className="dense-card">
          <ul className="list compact-list">
            <li><strong>Funcionários</strong><span>employee_count / employee_count_range</span></li>
            <li><strong>Seguidores</strong><span>followers_count da página</span></li>
            <li><strong>Crédito & risco</strong><span>credit, risk, underwriting, collections</span></li>
            <li><strong>Cargos financeiros</strong><span>treasury, funding, capital markets, FP&A</span></li>
          </ul>
        </Card>
        <Card title="Uso no motor" subtitle="Como a fonte afeta a originação" className="dense-card">
          <ul className="list compact-list">
            <li><strong>Monitoring</strong><span>gera outputs e triggers</span></li>
            <li><strong>Signals</strong><span>crescimento, funding, crédito, recebíveis</span></li>
            <li><strong>Qualification</strong><span>maturidade, timing e funding gap</span></li>
            <li><strong>Ranking</strong><span>prioridade comercial e próxima ação</span></li>
          </ul>
        </Card>
      </section>

      <Card title="Sources" subtitle="Catálogo vindo de source_catalog" className="dense-card">
        {sources.length ? (
          <table className="dense-table">
            <thead>
              <tr><th>Fonte</th><th>Família</th><th>Tipo</th><th>Categoria</th><th>Status</th><th>Métricas / sinais</th><th>Histórico</th></tr>
            </thead>
            <tbody>{sources.map((source) => {
              const metadata = metadataFor(source);
              return (
                <tr key={source.id}>
                  <td><strong>{source.name}</strong><div className="table-helper">{metadata.provider ?? metadata.domain ?? source.id}</div></td>
                  <td>{sourceFamily(source)}</td>
                  <td>{source.sourceType}</td>
                  <td>{source.category}</td>
                  <td><Pill tone={toneForStatus(source.status)}>{source.status}</Pill><div className="table-helper">health {source.health}</div></td>
                  <td>
                    <div className="table-helper">metrics: {joinList(metadata.metricsTracked)}</div>
                    <div className="table-helper">signals: {joinList(metadata.signalsTracked)}</div>
                  </td>
                  <td>
                    <div className="table-helper">tables: {joinList(metadata.historyTables ?? metadata.outputTables)}</div>
                    <div className="table-helper">cadência: {metadata.cadence ?? '-'}</div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : (
          <EmptyState title="Nenhuma fonte retornada." description="Verifique source_catalog no Supabase e rode as migrations/seeds de fontes." />
        )}
      </Card>

      <Card title="Cobertura histórica do catálogo" subtitle="Fontes com métricas, sinais ou tabelas históricas" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Com histórico" value={String(historicalMetricSources.length)} helper="Fontes com métricas ou tabelas históricas" />
          <Stat label="Mídia/RSS" value={String(mediaSources.length)} helper="Funding, crescimento e eventos de capital" />
          <Stat label="LinkedIn" value={String(linkedinSources.length)} helper="Followers, headcount e funções críticas" />
        </div>
      </Card>
    </div>
  );
}
