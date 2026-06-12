import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill, ScoreBadge } from '../components/UI';
import { WatchListStar } from '../components/WatchListStar';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

function priorityTone(bucket: string) {
  if (bucket.includes('immediate')) return 'success';
  if (bucket.includes('high')) return 'warning';
  return 'info';
}

function momentumTone(momentum: string) {
  if (momentum === 'cooling') return 'warning';
  if (momentum === 'accelerating') return 'success';
  return 'info';
}

export function CompaniesPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [structure, setStructure] = useState('all');
  const { data, loading, error } = useAsyncData(
    async () => {
      const [companiesState, weekly] = await Promise.all([api.getCompanies(session), api.getAbmWeekly(session)]);
      const warMap = new Map(weekly.data.top_accounts.map((item) => [item.company_id, item]));
      const detailResults = await Promise.allSettled(companiesState.data.map((company) => api.getCompany(session, company.id)));
      const details = companiesState.data.map((company, index) => {
        const detailResult = detailResults[index];
        const detailState = detailResult?.status === 'fulfilled' ? detailResult.value : null;
        const war = warMap.get(company.id);
        return {
          ...company,
          lastSignal: detailState?.data.signals[0]?.note ?? detailState?.data.monitoring.feedHighlights[0] ?? company.topPatterns[0] ?? 'Sem sinal recente consolidado',
          commercialPriority: war?.priority_band ?? 'monitor',
          momentum: war?.momentum_status ?? 'stable',
          nextStep: detailState?.data.company.nextAction ?? company.nextAction ?? 'Definir próximo passo',
          lastTouchpoint: detailState?.data.activities[0]?.dueDate ?? '-',
          championStatus: ((detailState?.data.activities.length ?? 0) > 0 ? 'mapped' : 'unmapped'),
          detailHealth: detailState ? 'ok' : 'partial',
        };
      });
      return { companiesState, companies: details };
    },
    [session?.access_token],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.companies.filter((company) => {
      const matchesQuery = [company.name, company.segment, company.subsegment, company.topPatterns.join(' ')].join(' ').toLowerCase().includes(query.toLowerCase());
      const matchesPriority = priority === 'all' || company.leadBucket === priority;
      const matchesStructure = structure === 'all' || company.suggestedStructure === structure;
      return matchesQuery && matchesPriority && matchesStructure;
    }).sort((a, b) => b.leadScore - a.leadScore);
  }, [data, priority, query, structure]);

  if (loading) return <LoadingState title="Leads" subtitle="Carregando ranking, sinais e camada comercial das empresas." />;
  if (error || !data) return <ErrorState title="Leads" error={error} />;

  const uniqueStructures = Array.from(new Set(data.companies.map((company) => company.suggestedStructure)));
  const immediateCount = filtered.filter((company) => company.leadBucket.includes('immediate')).length;
  const fidcCount = filtered.filter((company) => company.suggestedStructure.toLowerCase().includes('fidc')).length;
  const dcmCount = filtered.filter((company) => company.suggestedStructure.toLowerCase().includes('dcm')).length;
  const strongSignalCount = filtered.filter((company) => company.triggerStrength >= 70).length;
  const partialDetailCount = filtered.filter((company) => company.detailHealth === 'partial').length;
  const leadSummary = [
    { label: 'Prioridade imediata', value: immediateCount, helper: 'empresas para abordagem agora', tone: 'success' as const },
    { label: 'Fit FIDC', value: fidcCount, helper: 'estrutura sugerida com FIDC', tone: 'warning' as const },
    { label: 'Fit DCM', value: dcmCount, helper: 'potencial de dívida corporativa', tone: 'info' as const },
    { label: 'Sinal forte', value: strongSignalCount, helper: 'trigger strength acima de 70', tone: 'default' as const },
  ];

  return (
    <div className="page">
      <PageIntro
        eyebrow="Leads / Companies"
        title="Tabela operacional de originação"
        description="Ranking filtrável para separar esforço comercial real: prioridade, estrutura sugerida, momentum, champion, próximo passo e último sinal observado. A lista agora tolera falha parcial de detalhes sem derrubar a tela."
        actions={(
          <div className="pill-row">
            <Pill tone="success">{filtered.length} na visão atual</Pill>
            {partialDetailCount ? <Pill tone="warning">{partialDetailCount} detalhe(s) parcial(is)</Pill> : null}
            <Link to="/pipeline" className="button secondary">Abrir pipeline</Link>
          </div>
        )}
      />

      <DataStatusBanner source={data.companiesState.source} note={data.companiesState.note} />

      <section className="decision-strip">
        {leadSummary.map((item) => (
          <div key={item.label} className="decision-card">
            <Pill tone={item.tone}>{item.label}</Pill>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </div>
        ))}
      </section>

      <Card title="Filters" subtitle="Busca rápida, filtros de prioridade e estrutura" className="dense-card">
        <div className="toolbar-grid">
          <label>
            <span>Busca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa, segmento ou pattern" />
          </label>
          <label>
            <span>Prioridade</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="all">Todas</option>
              <option value="immediate_priority">Immediate</option>
              <option value="high_priority">High</option>
              <option value="monitor_closely">Monitor</option>
            </select>
          </label>
          <label>
            <span>Estrutura sugerida</span>
            <select value={structure} onChange={(event) => setStructure(event.target.value)}>
              <option value="all">Todas</option>
              {uniqueStructures.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </Card>

      <Card title="Leads Table" subtitle={`${filtered.length} companhias na visão atual`} actions={<Pill tone="info">desktop-first</Pill>} className="dense-card">
        {filtered.length ? (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="dense-table" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Watch</th>
                  <th>Qualification Score</th>
                  <th>Lead Score</th>
                  <th>Pattern</th>
                  <th>Suggested Structure</th>
                  <th>Priority</th>
                  <th>Commercial Priority</th>
                  <th>Momentum</th>
                  <th>Next Step</th>
                  <th>Last Touchpoint</th>
                  <th>Champion</th>
                  <th>Last Signal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <Link to={`/companies/${company.id}`}><strong>{company.name}</strong></Link>
                      <div className="table-helper">{company.segment} · {company.subsegment}</div>
                    </td>
                    <td><WatchListStar companyId={company.id} companyName={company.name} /></td>
                    <td><ScoreBadge value={company.qualificationScore} kind="qualification" /></td>
                    <td><ScoreBadge value={company.leadScore} kind="lead" /></td>
                    <td>
                      <strong>{company.topPatterns[0] ?? 'Sem pattern dominante'}</strong>
                      <div className="table-helper">trigger {company.triggerStrength}</div>
                    </td>
                    <td>{company.suggestedStructure}</td>
                    <td><Pill tone={priorityTone(company.leadBucket)}>{company.leadBucket.replace(/_/g, ' ')}</Pill></td>
                    <td><Pill tone={priorityTone(company.commercialPriority)}>{company.commercialPriority}</Pill></td>
                    <td><Pill tone={momentumTone(company.momentum)}>{company.momentum}</Pill></td>
                    <td>{company.nextStep}</td>
                    <td>{company.lastTouchpoint}</td>
                    <td><Pill tone={company.championStatus === 'mapped' ? 'success' : 'warning'}>{company.championStatus}</Pill></td>
                    <td>
                      {company.lastSignal}
                      {company.detailHealth === 'partial' ? <div className="table-helper">detalhe parcial: usando fallback da lista</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhuma empresa encontrada com os filtros atuais."
            description="Limpe a busca ou selecione outra prioridade/estrutura para recuperar o ranking operacional."
          />
        )}
      </Card>
    </div>
  );
}
