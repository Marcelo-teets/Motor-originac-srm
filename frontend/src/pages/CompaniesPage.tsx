import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill, ScoreBadge } from '../components/UI';
import { WatchListStar } from '../components/WatchListStar';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

const priorityTone = (bucket: string) => {
  if (bucket.includes('immediate')) return 'success';
  if (bucket.includes('high')) return 'warning';
  return 'info';
};

const momentumTone = (momentum: string) => {
  if (momentum === 'cooling') return 'warning';
  if (momentum === 'accelerating') return 'success';
  return 'info';
};

const formatMoment = (value: string | null) => {
  if (!value) return 'sem observação datada';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'data indisponível' : parsed.toLocaleDateString('pt-BR');
};

const bucketLabel: Record<string, string> = {
  immediate_priority: 'Prioridade imediata',
  high_priority: 'Alta prioridade',
  monitor_closely: 'Monitorar de perto',
  watchlist: 'Em observação',
  low_priority: 'Baixa prioridade',
};

export function CompaniesPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [structure, setStructure] = useState('all');
  const [sortBy, setSortBy] = useState<'ranking' | 'lead' | 'qualification'>('ranking');
  const { data, loading, error } = useAsyncData(
    async () => {
      const [companiesState, weekly] = await Promise.all([
        api.getCompanies(session),
        api.getAbmWeekly(session).catch(() => null),
      ]);
      const warMap = new Map((weekly?.data.top_accounts ?? []).map((item) => [item.company_id, item]));
      const withoutChampion = new Set((weekly?.data.without_champion ?? []).map((item) => item.company_id));
      const companies = companiesState.data.map((company) => {
        const war = warMap.get(company.id);
        return {
          ...company,
          commercialPriority: war?.priority_band ?? 'not_classified',
          momentum: war?.momentum_status ?? 'unknown',
          championStatus: weekly && withoutChampion.has(company.id) ? 'unmapped' : 'not_validated',
        };
      });
      return { companiesState, companies, abmAvailable: Boolean(weekly) };
    },
    [session?.access_token],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const search = query.trim().toLowerCase();
    const scoreFor = (company: (typeof data.companies)[number]) => {
      if (sortBy === 'lead') return company.leadScore;
      if (sortBy === 'qualification') return company.qualificationScore;
      return company.rankingScore;
    };

    return data.companies.filter((company) => {
      const searchable = [company.name, company.segment, company.subsegment, company.topPatterns.join(' '), company.latestEvidence].join(' ').toLowerCase();
      const matchesQuery = !search || searchable.includes(search);
      const matchesPriority = priority === 'all' || company.leadBucket === priority;
      const matchesStructure = structure === 'all' || company.suggestedStructure === structure;
      return matchesQuery && matchesPriority && matchesStructure;
    }).sort((a, b) => scoreFor(b) - scoreFor(a));
  }, [data, priority, query, sortBy, structure]);

  if (loading) return <LoadingState title="Leads" subtitle="Carregando ranking e sinais consolidados das empresas." />;
  if (error || !data) return <ErrorState title="Leads" error={error} />;

  const uniqueStructures = Array.from(new Set(data.companies.map((company) => company.suggestedStructure)));
  const immediateCount = filtered.filter((company) => company.leadBucket === 'immediate_priority').length;
  const fidcCount = filtered.filter((company) => company.suggestedStructure.toLowerCase().includes('fidc')).length;
  const strongSignalCount = filtered.filter((company) => company.triggerStrength >= 70).length;
  const withoutChampionCount = filtered.filter((company) => company.championStatus === 'unmapped').length;

  return (
    <div className="page">
      <PageIntro
        eyebrow="Leads / Companies"
        title="Fila de decisão comercial"
        description="Ranking único para decidir onde agir agora. Cada conta combina posição, scores, tese, evidência observada e a próxima ação — sem preencher lacunas comerciais com inferências artificiais."
        actions={(
          <div className="pill-row">
            <Pill tone="success">{filtered.length} na visão atual</Pill>
            <Link to="/pipeline" className="button secondary">Abrir pipeline</Link>
          </div>
        )}
      />

      <DataStatusBanner source={data.companiesState.source} note={data.companiesState.note} />

      {!data.abmAvailable ? (
        <div className="notice warning" role="status">Ranking disponível. O complemento comercial do ABM War Room não respondeu; champion e momentum permanecem como não validados.</div>
      ) : null}

      <section className="decision-strip">
        <div className="decision-card"><Pill tone="success">Agir agora</Pill><strong>{immediateCount}</strong><small>Contas no bucket de prioridade imediata.</small></div>
        <div className="decision-card"><Pill tone="warning">Fit FIDC</Pill><strong>{fidcCount}</strong><small>Estrutura sugerida contém FIDC.</small></div>
        <div className="decision-card"><Pill tone="info">Sinal forte</Pill><strong>{strongSignalCount}</strong><small>Força de trigger igual ou superior a 70.</small></div>
        <div className="decision-card"><Pill tone="warning">Sem champion</Pill><strong>{withoutChampionCount}</strong><small>Lacuna explicitamente registrada no war room.</small></div>
      </section>

      <Card title="Refinar a fila" subtitle="Busque, filtre e escolha o critério de ordenação" className="dense-card">
        <div className="toolbar-grid lead-toolbar">
          <label>
            <span>Busca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, segmento, padrão ou evidência" />
          </label>
          <label>
            <span>Prioridade</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="all">Todas</option>
              <option value="immediate_priority">Imediata</option>
              <option value="high_priority">Alta</option>
              <option value="monitor_closely">Monitorar</option>
              <option value="watchlist">Observação</option>
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
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
              <option value="ranking">Ranking consolidado</option>
              <option value="lead">Lead score</option>
              <option value="qualification">Qualification score</option>
            </select>
          </label>
        </div>
      </Card>

      {filtered.length ? (
        <section className="lead-decision-list" aria-label="Leads ordenados">
          {filtered.map((company) => (
            <article className="lead-decision-card" key={company.id}>
              <div className="lead-rank" aria-label={`Posição ${company.rankingPosition}`}>
                <span>#</span>
                <strong>{company.rankingPosition}</strong>
              </div>

              <div className="lead-account">
                <div className="lead-account-head">
                  <div>
                    <Link to={`/companies/${company.id}`}><h3>{company.name}</h3></Link>
                    <p>{company.segment} · {company.subsegment}</p>
                  </div>
                  <WatchListStar companyId={company.id} companyName={company.name} />
                </div>
                <div className="pill-row">
                  <Pill tone={priorityTone(company.leadBucket)}>{bucketLabel[company.leadBucket] ?? company.leadBucket}</Pill>
                  <Pill tone="info">{company.suggestedStructure}</Pill>
                  {company.commercialPriority !== 'not_classified' ? <Pill tone={priorityTone(company.commercialPriority)}>Comercial: {company.commercialPriority}</Pill> : null}
                  {company.momentum !== 'unknown' ? <Pill tone={momentumTone(company.momentum)}>Momentum: {company.momentum}</Pill> : null}
                </div>
              </div>

              <div className="lead-score-cluster" aria-label="Scores da conta">
                <div><span>Ranking</span><ScoreBadge value={company.rankingScore} kind="priority" /></div>
                <div><span>Lead</span><ScoreBadge value={company.leadScore} kind="lead" /></div>
                <div><span>Qualificação</span><ScoreBadge value={company.qualificationScore} kind="qualification" /></div>
              </div>

              <div className="lead-evidence">
                <span className="section-label">Evidência mais recente</span>
                <strong>{company.latestEvidence}</strong>
                <small>{formatMoment(company.latestEvidenceAt)} · confiança da fonte {Math.round(company.sourceConfidence * (company.sourceConfidence <= 1 ? 100 : 1))}%</small>
              </div>

              <div className="lead-action">
                <span className="section-label">Próxima ação</span>
                <strong>{company.nextAction || 'Definir próxima ação comercial'}</strong>
                <small>
                  {company.championStatus === 'unmapped'
                    ? 'Champion: não mapeado no war room.'
                    : 'Champion: ainda não validado nesta visão.'}
                </small>
                <Link to={`/companies/${company.id}`} className="button secondary compact-button">Abrir memo</Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Card title="Fila vazia" subtitle="Nenhuma conta atende aos filtros atuais">
          <EmptyState title="Nenhuma empresa encontrada." description="Limpe a busca ou selecione outra prioridade e estrutura." />
        </Card>
      )}
    </div>
  );
}
