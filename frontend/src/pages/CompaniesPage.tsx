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

function readable(value: string) {
  return value.replace(/_/g, ' ');
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
  const hasActiveFilters = query.length > 0 || priority !== 'all' || structure !== 'all';

  const resetFilters = () => {
    setQuery('');
    setPriority('all');
    setStructure('all');
  };

  return (
    <div className="page leads-page-v3">
      <PageIntro
        eyebrow="Radar de oportunidades"
        title="Leads priorizados"
        description="Uma fila para decidir onde agir. Cada lead mostra o sinal relevante, a hipótese financeira, a estrutura sugerida e a próxima ação comercial."
        actions={(
          <div className="pill-row">
            <Pill tone="success">{filtered.length} na visão</Pill>
            <Link to="/pipeline" className="button secondary">Abrir pipeline</Link>
          </div>
        )}
      />

      <DataStatusBanner source={data.companiesState.source} note={data.companiesState.note} />

      <section className="lead-summary-strip" aria-label="Resumo dos leads">
        <div><span>Abordar agora</span><strong>{immediateCount}</strong><small>prioridade imediata</small></div>
        <div><span>Fit FIDC</span><strong>{fidcCount}</strong><small>recebíveis estruturáveis</small></div>
        <div><span>Fit DCM</span><strong>{dcmCount}</strong><small>dívida corporativa</small></div>
        <div><span>Sinal forte</span><strong>{strongSignalCount}</strong><small>trigger acima de 70</small></div>
      </section>

      <section className="lead-filter-bar">
        <label className="lead-search-field">
          <span>Buscar</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, segmento ou padrão" />
        </label>
        <label>
          <span>Prioridade</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="all">Todas</option>
            <option value="immediate_priority">Imediata</option>
            <option value="high_priority">Alta</option>
            <option value="monitor_closely">Monitorar</option>
          </select>
        </label>
        <label>
          <span>Estrutura</span>
          <select value={structure} onChange={(event) => setStructure(event.target.value)}>
            <option value="all">Todas</option>
            {uniqueStructures.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" className="secondary compact-button" onClick={resetFilters} disabled={!hasActiveFilters}>Limpar</button>
      </section>

      {partialDetailCount ? <div className="inline-notice"><Pill tone="warning">atenção</Pill><span>{partialDetailCount} lead(s) usam dados parciais de detalhe, sem bloquear a fila.</span></div> : null}

      <section className="lead-card-list" aria-label="Lista de leads priorizados">
        {filtered.length ? filtered.map((company, index) => (
          <article key={company.id} className="lead-card-v3">
            <div className="lead-card-rank">{String(index + 1).padStart(2, '0')}</div>

            <div className="lead-card-main">
              <div className="lead-card-title-row">
                <div>
                  <Link to={`/companies/${company.id}`} className="lead-company-link">{company.name}</Link>
                  <span>{company.segment} · {company.subsegment}</span>
                </div>
                <WatchListStar companyId={company.id} companyName={company.name} />
              </div>

              <div className="lead-card-thesis">
                <div>
                  <span className="lead-field-label">Por que agora</span>
                  <strong>{company.topPatterns[0] ?? 'Sem padrão dominante'}</strong>
                  <p>{company.lastSignal}</p>
                </div>
                <div>
                  <span className="lead-field-label">Estrutura sugerida</span>
                  <strong>{company.suggestedStructure}</strong>
                  <p>Trigger {company.triggerStrength} · momentum {readable(company.momentum)}</p>
                </div>
                <div>
                  <span className="lead-field-label">Próxima ação</span>
                  <strong>{company.nextStep}</strong>
                  <p>Champion {readable(company.championStatus)} · último contato {company.lastTouchpoint}</p>
                </div>
              </div>
            </div>

            <div className="lead-card-score">
              <span>Lead score</span>
              <ScoreBadge value={company.leadScore} kind="lead" />
              <small>Qualification {company.qualificationScore}</small>
            </div>

            <div className="lead-card-status">
              <Pill tone={priorityTone(company.leadBucket)}>{readable(company.leadBucket)}</Pill>
              <Pill tone={momentumTone(company.momentum)}>{readable(company.momentum)}</Pill>
              <Link to={`/companies/${company.id}`} className="button secondary compact-button">Abrir análise</Link>
            </div>
          </article>
        )) : (
          <Card title="Nenhum lead encontrado" subtitle="A visão atual não retornou empresas">
            <EmptyState
              title="Nenhuma empresa encontrada com os filtros atuais."
              description="Limpe a busca ou selecione outra prioridade/estrutura para recuperar o ranking operacional."
              action={<button type="button" onClick={resetFilters}>Limpar filtros</button>}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
