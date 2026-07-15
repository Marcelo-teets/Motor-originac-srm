import { useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill, Stat, TableViewport } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SourceEvidenceStatus } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const toneForStatus = (value: string) => {
  if (value === 'real' || value === 'healthy' || value === 'observed') return 'success';
  if (value === 'partial' || value === 'degraded' || value === 'needs_setup') return 'warning';
  if (value === 'down') return 'danger';
  return 'info';
};

const evidenceLabel: Record<SourceEvidenceStatus, string> = {
  observed: 'Evidência observada',
  awaiting_capture: 'Aguardando captura',
  needs_setup: 'Integração pendente',
  planned: 'Planejada',
};

const formatMoment = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const confidenceLabel = (value: number | null) => {
  if (value === null) return '—';
  return `${Math.round(value <= 1 ? value * 100 : value)}%`;
};

export function SourcesPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [evidence, setEvidence] = useState<'all' | SourceEvidenceStatus>('all');
  const { data, loading, error } = useAsyncData(() => api.getSourceIntelligence(session), [session?.access_token]);
  const { data: quotaEnvelope } = useAsyncData(() => api.getMaisRetornoQuota(session), [session?.access_token]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const search = query.trim().toLowerCase();
    return data.data.sources.filter((source) => {
      const matchesSearch = !search || [source.name, source.code, source.family, source.category, source.captureMode].join(' ').toLowerCase().includes(search);
      const matchesFamily = family === 'all' || source.family === family;
      const matchesEvidence = evidence === 'all' || source.evidenceStatus === evidence;
      return matchesSearch && matchesFamily && matchesEvidence;
    });
  }, [data, evidence, family, query]);

  if (loading) return <LoadingState title="Fontes" subtitle="Validando catálogo, capturas e evidências observadas." />;
  if (error || !data) return <ErrorState title="Fontes" error={error} />;

  const snapshot = data.data;

  return (
    <div className="page">
      <PageIntro
        eyebrow="Sources / Data lineage"
        title="Central de fontes e cobertura"
        description="Uma visão operacional do que está apenas catalogado, do que já foi capturado e do que realmente contém evidência útil. Falhas e integrações incompletas ficam visíveis sem contaminar score ou ranking."
        actions={<Pill tone={snapshot.summary.observedSources ? 'success' : 'warning'}>{snapshot.summary.observedSources} fontes com evidência</Pill>}
      />
      <DataStatusBanner source={data.source} note={data.note} />

      <section className="decision-strip">
        <div className="decision-card"><Pill tone="info">Catálogo</Pill><strong>{snapshot.summary.totalSources}</strong><small>Fontes registradas, incluindo integrações planejadas.</small></div>
        <div className="decision-card"><Pill tone="success">Observadas</Pill><strong>{snapshot.summary.observedSources}</strong><small>Com conteúdo probatório capturado.</small></div>
        <div className="decision-card"><Pill tone="warning">Atenção</Pill><strong>{snapshot.summary.degradedSources}</strong><small>Saúde degradada, indisponível ou integração incompleta.</small></div>
        <div className="decision-card"><Pill tone="info">Empresas cobertas</Pill><strong>{snapshot.summary.companiesCovered}</strong><small>Empresas com ao menos uma evidência válida.</small></div>
      </section>

      <section className="source-family-grid" aria-label="Cobertura por família">
        {snapshot.families.map((item) => (
          <article className="source-family-card" key={item.family}>
            <div className="row-between">
              <strong>{item.family}</strong>
              <Pill tone={item.observedSources ? 'success' : 'warning'}>{item.observedSources}/{item.sources} observadas</Pill>
            </div>
            <div className="source-family-metrics">
              <span><strong>{item.outputs30d}</strong> evidências / 30d</span>
              <span><strong>{item.degradedSources}</strong> com atenção</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid cols-2 source-operations-grid">
        <Card title="Próximas integrações" subtitle="Lacunas ordenadas por prontidão" className="dense-card">
          {snapshot.coverageGaps.length ? (
            <ul className="source-gap-list">
              {snapshot.coverageGaps.slice(0, 6).map((source) => (
                <li key={source.id}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.family} · {source.cadence}</span>
                  </div>
                  <div>
                    <Pill tone={toneForStatus(source.evidenceStatus)}>{evidenceLabel[source.evidenceStatus]}</Pill>
                    <small>{source.recommendedAction}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Sem lacunas críticas." description="Todas as fontes catalogadas já produziram evidência válida." />}
        </Card>

        {quotaEnvelope?.data ? (
          <Card title="Orçamento do conector · Mais Retorno" subtitle={`Quota mensal governada (${quotaEnvelope.data.monthKey})`} className="dense-card">
            <div className="mini-metric-grid">
              <Stat label="Quota" value={String(quotaEnvelope.data.monthlyQuota)} helper={`Meta prudencial ${quotaEnvelope.data.softTarget}`} />
              <Stat label="Usado" value={String(quotaEnvelope.data.used)} helper={quotaEnvelope.data.allowed ? 'Chamadas liberadas' : 'Quota esgotada'} />
              <Stat label="Restante" value={String(quotaEnvelope.data.remaining)} helper={quotaEnvelope.data.warning ? 'Uso acima de 80%' : 'Consumo saudável'} />
            </div>
            <div className="pill-row top-gap">
              <Pill tone={quotaEnvelope.status === 'real' ? 'success' : 'warning'}>{quotaEnvelope.status === 'real' ? 'Quota persistida' : 'Contagem parcial'}</Pill>
              {quotaEnvelope.data.warning ? <Pill tone="warning">Alerta de consumo</Pill> : null}
            </div>
            {quotaEnvelope.data.mode !== 'supabase' ? <p className="source-note">A contagem está em memória e pode reiniciar no próximo deploy.</p> : null}
          </Card>
        ) : (
          <Card title="Orçamento de conectores" subtitle="Telemetria indisponível" className="dense-card">
            <EmptyState title="Quota não consultada." description="A indisponibilidade da quota não bloqueia a leitura das demais fontes." />
          </Card>
        )}
      </section>

      <Card title="Explorar fontes" subtitle="Filtros aplicados sobre catálogo e telemetria" className="dense-card">
        <div className="toolbar-grid">
          <label>
            <span>Busca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, código, família ou categoria" />
          </label>
          <label>
            <span>Família</span>
            <select value={family} onChange={(event) => setFamily(event.target.value)}>
              <option value="all">Todas</option>
              {snapshot.families.map((item) => <option value={item.family} key={item.family}>{item.family}</option>)}
            </select>
          </label>
          <label>
            <span>Evidência</span>
            <select value={evidence} onChange={(event) => setEvidence(event.target.value as typeof evidence)}>
              <option value="all">Todos os estados</option>
              <option value="observed">Observada</option>
              <option value="awaiting_capture">Aguardando captura</option>
              <option value="needs_setup">Integração pendente</option>
              <option value="planned">Planejada</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="Inventário operacional" subtitle={`${filtered.length} fontes na visão atual`} className="dense-card">
        {filtered.length ? (
          <TableViewport minWidth={1180}>
            <table className="dense-table source-table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Família</th>
                  <th>Estado da evidência</th>
                  <th>Registros / 30d</th>
                  <th>Evidências / 30d</th>
                  <th>Cobertura</th>
                  <th>Última observação</th>
                  <th>Próxima ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((source) => (
                  <tr key={source.id}>
                    <td>
                      {source.url ? <a href={source.url} target="_blank" rel="noreferrer"><strong>{source.name}</strong></a> : <strong>{source.name}</strong>}
                      <div className="table-helper">{source.code} · {source.sourceType}</div>
                    </td>
                    <td>{source.family}<div className="table-helper">{source.category}</div></td>
                    <td>
                      <Pill tone={toneForStatus(source.evidenceStatus)}>{evidenceLabel[source.evidenceStatus]}</Pill>
                      <div className="table-helper">catálogo {source.status} · saúde {source.health}</div>
                    </td>
                    <td><strong className="mono">{source.captureRecords30d}</strong><div className="table-helper">última coleta {formatMoment(source.lastCaptureAt)}</div></td>
                    <td><strong className="mono">{source.outputs30d}</strong><div className="table-helper">confiança média {confidenceLabel(source.averageConfidence)}</div></td>
                    <td><strong className="mono">{source.companiesCovered}</strong><div className="table-helper">empresa(s)</div></td>
                    <td>{formatMoment(source.lastObservedAt)}<div className="table-helper">cadência {source.cadence}</div></td>
                    <td>{source.recommendedAction}{source.authRequirement ? <div className="table-helper">credencial: {source.authRequirement}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        ) : <EmptyState title="Nenhuma fonte encontrada." description="Ajuste a busca ou remova um dos filtros." />}
      </Card>
    </div>
  );
}
