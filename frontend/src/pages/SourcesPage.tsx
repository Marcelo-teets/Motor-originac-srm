import { Card, DataStatusBanner, EmptyState, LoadingState, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
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
  if (value === 'partial' || value === 'degraded') return 'warning';
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

export function SourcesPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getSources(session), [session?.access_token]);
  const { data: quotaEnvelope } = useAsyncData(() => api.getMaisRetornoQuota(session), [session?.access_token]);

  if (loading) return <LoadingState title="Sources" subtitle="Carregando catálogo de fontes, métricas monitoradas e cobertura operacional." />;
  if (error || !data) return <div className="page"><Card title="Sources" subtitle="Falha ao carregar catálogo">{error}</Card></div>;

  const sources = data.data;
  const linkedinSources = sources.filter((source) => sourceFamily(source) === 'LinkedIn');
  const mediaSources = sources.filter((source) => sourceFamily(source) === 'Mídia/RSS');
  const realSources = sources.filter((source) => source.status === 'real');
  const historicalMetricSources = sources.filter((source) => metadataFor(source).metricsTracked?.length || metadataFor(source).historyTables?.length);

  return (
    <div className="page">
      <PageIntro
        eyebrow="Sources"
        title="Catálogo de fontes de originação"
        description="Governança das fontes que alimentam monitoring, signals, qualification e ranking. Inclui mídias, RSS, APIs e LinkedIn com contrato explícito de métricas históricas."
        actions={<Pill tone={data.source === 'real' ? 'success' : 'warning'}>{data.source === 'real' ? 'source_catalog real' : 'source_catalog parcial'}</Pill>}
      />
      <DataStatusBanner source={data.source} note={data.note} />

      <section className="decision-strip">
        <div className="decision-card"><Pill tone="info">Fontes totais</Pill><strong>{sources.length}</strong><small>Registros no catálogo operacional.</small></div>
        <div className="decision-card"><Pill tone="success">Mídia/RSS</Pill><strong>{mediaSources.length}</strong><small>Fontes para funding, crescimento e eventos de capital.</small></div>
        <div className="decision-card"><Pill tone="warning">LinkedIn</Pill><strong>{linkedinSources.length}</strong><small>Métricas históricas de página, followers, headcount e cargos.</small></div>
        <div className="decision-card"><Pill tone="info">Com histórico</Pill><strong>{historicalMetricSources.length}</strong><small>Fontes com métricas ou tabelas históricas.</small></div>
      </section>

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
    </div>
  );
}
