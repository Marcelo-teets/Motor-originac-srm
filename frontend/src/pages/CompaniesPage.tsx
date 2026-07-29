import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill, ScoreBadge } from '../components/UI';
import { WatchListStar } from '../components/WatchListStar';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

function priorityTone(bucket: string): 'success' | 'warning' | 'info' {
  if (bucket.includes('immediate')) return 'success';
  if (bucket.includes('high')) return 'warning';
  return 'info';
}

function momentumTone(momentum: string): 'success' | 'warning' | 'info' {
  if (momentum === 'cooling') return 'warning';
  if (momentum === 'accelerating') return 'success';
  return 'info';
}

function readable(value: string) {
  return value.replace(/_/g, ' ');
}

type LeadFocus = 'all' | 'immediate' | 'fidc' | 'dcm' | 'monitor';
type LeadSort = 'lead' | 'timing' | 'qualification' | 'confidence';
type Feedback = { tone: 'success' | 'error'; message: string } | null;

export function CompaniesPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [structure, setStructure] = useState('all');
  const [focus, setFocus] = useState<LeadFocus>('all');
  const [sortBy, setSortBy] = useState<LeadSort>('lead');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const companiesState = await api.getCompanies(session);
      const [weeklyResult] = await Promise.allSettled([api.getAbmWeekly(session)]);
      const weekly = weeklyResult.status === 'fulfilled' ? weeklyResult.value.data : null;
      const warMap = new Map((weekly?.top_accounts ?? []).map((item) => [item.company_id, item]));
      const withoutChampion = new Set((weekly?.without_champion ?? []).map((item) => item.company_id));
      const overdueMap = new Map((weekly?.overdue_next_steps ?? []).map((item) => [item.company_id, item.next_step_due_at]));

      const companies = companiesState.data.map((company) => {
        const war = warMap.get(company.id);
        const structureLabel = company.suggestedStructure.toLowerCase();
        return {
          ...company,
          lastSignal: company.thesis ?? company.topPatterns[0] ?? 'Sem sinal recente consolidado',
          commercialPriority: war?.priority_band ?? 'monitor',
          momentum: war?.momentum_status ?? 'stable',
          nextStep: company.nextAction ?? 'Definir próximo passo',
          nextStepDueAt: overdueMap.get(company.id) ?? 'não informado',
          championStatus: withoutChampion.has(company.id) ? 'unmapped' : (weekly ? 'mapped' : 'not_verified'),
          fitFidc: structureLabel.includes('fidc'),
          fitDcm: structureLabel.includes('dcm') || structureLabel.includes('debênture') || structureLabel.includes('debenture'),
          urgency: company.urgencyScore ?? 0,
          evidenceCount: company.topPatterns.length + (company.thesis ? 1 : 0),
        };
      });
      return { companiesState, companies, abmAvailable: Boolean(weekly) };
    },
    [session?.access_token],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const normalizedQuery = query.trim().toLowerCase();
    const rows = data.companies.filter((company) => {
      const matchesQuery = !normalizedQuery || [company.name, company.segment, company.subsegment, company.topPatterns.join(' '), company.lastSignal]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesPriority = priority === 'all' || company.leadBucket === priority;
      const matchesStructure = structure === 'all' || company.suggestedStructure === structure;
      const matchesFocus = focus === 'all'
        || (focus === 'immediate' && company.leadBucket.includes('immediate'))
        || (focus === 'fidc' && company.fitFidc)
        || (focus === 'dcm' && company.fitDcm)
        || (focus === 'monitor' && !company.leadBucket.includes('immediate') && !company.leadBucket.includes('high'));
      return matchesQuery && matchesPriority && matchesStructure && matchesFocus;
    });

    return rows.sort((a, b) => {
      if (sortBy === 'timing') return b.urgency - a.urgency;
      if (sortBy === 'qualification') return b.qualificationScore - a.qualificationScore;
      if (sortBy === 'confidence') return b.sourceConfidence - a.sourceConfidence;
      return b.leadScore - a.leadScore;
    });
  }, [data, focus, priority, query, sortBy, structure]);

  if (loading) return <LoadingState title="Leads" subtitle="Carregando ranking, sinais e camada comercial das empresas." />;
  if (error || !data) return <ErrorState title="Leads" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  const uniqueStructures = Array.from(new Set(data.companies.map((company) => company.suggestedStructure))).filter(Boolean).sort();
  const immediateCount = data.companies.filter((company) => company.leadBucket.includes('immediate')).length;
  const fidcCount = data.companies.filter((company) => company.fitFidc).length;
  const dcmCount = data.companies.filter((company) => company.fitDcm).length;
  const monitorCount = data.companies.filter((company) => !company.leadBucket.includes('immediate') && !company.leadBucket.includes('high')).length;
  const hasActiveFilters = query.length > 0 || priority !== 'all' || structure !== 'all' || focus !== 'all';

  const resetFilters = () => {
    setQuery('');
    setPriority('all');
    setStructure('all');
    setFocus('all');
  };

  const moveToPipeline = async (companyId: string, companyName: string) => {
    setMovingId(companyId);
    setFeedback(null);
    try {
      await api.movePipelineStage(session, companyId, 'Qualified');
      setFeedback({ tone: 'success', message: `${companyName} foi enviada para o pipeline como Qualificada.` });
    } catch (moveError) {
      setFeedback({ tone: 'error', message: moveError instanceof Error ? moveError.message : 'Falha ao enviar empresa para o pipeline.' });
    } finally {
      setMovingId(null);
    }
  };

  const focusOptions: Array<{ id: LeadFocus; label: string; count: number; helper: string }> = [
    { id: 'all', label: 'Todos', count: data.companies.length, helper: 'universo priorizado' },
    { id: 'immediate', label: 'Abordar agora', count: immediateCount, helper: 'timing imediato' },
    { id: 'fidc', label: 'Tese FIDC', count: fidcCount, helper: 'recebíveis e funding' },
    { id: 'dcm', label: 'Tese DCM', count: dcmCount, helper: 'dívida corporativa' },
    { id: 'monitor', label: 'Monitorar', count: monitorCount, helper: 'aguardar novos sinais' },
  ];

  return (
    <div className="page leads-decision-page">
      <PageIntro
        eyebrow="Radar de oportunidades"
        title="Fila de decisão"
        description="Escolha onde concentrar o time. A fila combina score, timing, tese financeira, evidência e prontidão comercial."
        actions={(
          <div className="pill-row">
            <Pill tone="success">{filtered.length} na visão</Pill>
            <Link to="/pipeline" className="button">Abrir pipeline</Link>
          </div>
        )}
      />

      <DataStatusBanner source={data.companiesState.source} note={data.companiesState.note} />

      <section className="lead-focus-tabs" aria-label="Segmentos de decisão">
        {focusOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            className={focus === item.id ? 'active' : ''}
            aria-pressed={focus === item.id}
            onClick={() => setFocus(item.id)}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
            <small>{item.helper}</small>
          </button>
        ))}
      </section>

      <section className="lead-control-bar" aria-label="Filtros da fila de leads">
        <label className="lead-search-field">
          <span>Buscar</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, segmento, sinal ou padrão" type="search" />
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
        <label>
          <span>Ordenar por</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as LeadSort)}>
            <option value="lead">Lead score</option>
            <option value="timing">Timing</option>
            <option value="qualification">Qualification</option>
            <option value="confidence">Confiança da fonte</option>
          </select>
        </label>
        <div className="lead-view-controls" aria-label="Densidade da lista">
          <button type="button" className={density === 'comfortable' ? 'active' : ''} aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')} aria-label="Visualização confortável">▤</button>
          <button type="button" className={density === 'compact' ? 'active' : ''} aria-pressed={density === 'compact'} onClick={() => setDensity('compact')} aria-label="Visualização compacta">≡</button>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>Limpar</button>
        </div>
      </section>

      {feedback ? (
        <div className={`inline-notice inline-notice-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          <span>{feedback.message}</span>
        </div>
      ) : null}
      {!data.abmAvailable ? <div className="inline-notice"><Pill tone="warning">camada comercial parcial</Pill><span>O ranking segue disponível, mas champion, momentum e prazos comerciais não puderam ser atualizados.</span></div> : null}

      <section className={`lead-decision-list ${density === 'compact' ? 'compact' : ''}`} aria-label="Lista de leads priorizados">
        {filtered.length ? filtered.map((company, index) => (
          <article key={company.id} className="lead-decision-card">
            <div className="lead-decision-rank">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <WatchListStar companyId={company.id} companyName={company.name} />
            </div>

            <div className="lead-decision-main">
              <div className="lead-decision-title">
                <div>
                  <Link to={`/companies/${company.id}`}>{company.name}</Link>
                  <span>{company.segment} · {company.subsegment}</span>
                </div>
                <div className="pill-row">
                  <Pill tone={priorityTone(company.leadBucket)}>{readable(company.leadBucket)}</Pill>
                  <Pill tone={momentumTone(company.momentum)}>{readable(company.momentum)}</Pill>
                </div>
              </div>

              <div className="lead-decision-thesis">
                <section>
                  <span>Por que agora</span>
                  <strong>{company.topPatterns[0] ?? 'Sem padrão dominante'}</strong>
                  <p>{company.lastSignal}</p>
                </section>
                <section>
                  <span>Estrutura provável</span>
                  <strong>{company.suggestedStructure}</strong>
                  <p>{company.fitFidc ? 'Fit FIDC' : 'FIDC não confirmado'} · {company.fitDcm ? 'Fit DCM' : 'DCM não confirmado'}</p>
                </section>
                <section>
                  <span>Próxima ação</span>
                  <strong>{company.nextStep}</strong>
                  <p>Champion {readable(company.championStatus)} · prazo comercial {company.nextStepDueAt}</p>
                </section>
              </div>
            </div>

            <div className="lead-decision-evidence">
              <div><span>Lead</span><ScoreBadge value={company.leadScore} kind="lead" /></div>
              <div><span>Qualificação</span><strong>{company.qualificationScore}</strong></div>
              <div><span>Timing</span><strong>{company.urgency}</strong></div>
              <div><span>Evidências</span><strong>{company.evidenceCount}</strong></div>
            </div>

            <div className="lead-decision-actions">
              <Link to={`/companies/${company.id}`} className="button">Abrir decisão</Link>
              <button type="button" className="secondary" disabled={movingId === company.id} onClick={() => void moveToPipeline(company.id, company.name)}>
                {movingId === company.id ? 'Enviando...' : 'Enviar ao pipeline'}
              </button>
            </div>
          </article>
        )) : (
          <Card title="Nenhum lead encontrado" subtitle="A visão atual não retornou empresas">
            <EmptyState
              title="Nenhuma empresa encontrada com os filtros atuais."
              description="Limpe a busca ou selecione outra tese para recuperar a fila de decisão."
              action={<button type="button" onClick={resetFilters}>Limpar filtros</button>}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
