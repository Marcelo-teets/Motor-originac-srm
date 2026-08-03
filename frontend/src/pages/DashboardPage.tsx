import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, ErrorState, LoadingState, PageIntro, Pill, ScoreBadge } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AbmWeeklyWarRoom } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

function priorityTone(bucket: string): 'success' | 'warning' | 'info' {
  if (bucket.includes('immediate')) return 'success';
  if (bucket.includes('high')) return 'warning';
  return 'info';
}

function readable(value: string) {
  return value.replace(/_/g, ' ');
}

const emptyAbm = (): AbmWeeklyWarRoom => ({
  top_accounts: [],
  cooling_accounts: [],
  without_champion: [],
  overdue_next_steps: [],
  critical_open_objections: [],
});

export function DashboardPage() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [dashboardState, companiesState] = await Promise.all([
        api.getDashboard(session),
        api.getCompanies(session),
      ]);
      const [abmResult] = await Promise.allSettled([api.getAbmWeekly(session)]);
      return {
        dashboardState,
        companiesState,
        abmWeekly: abmResult.status === 'fulfilled' ? abmResult.value.data : emptyAbm(),
        abmAvailable: abmResult.status === 'fulfilled',
      };
    },
    [session?.access_token],
  );

  if (loading) return <LoadingState title="Hoje" subtitle="Organizando as prioridades do dia." />;
  if (error || !data) return <ErrorState title="Hoje" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  const { dashboardState, companiesState, abmWeekly, abmAvailable } = data;
  const dashboard = dashboardState.data;
  const companies = companiesState.data;
  const topLeads = dashboard.topLeads.map((lead) => {
    const company = companies.find((item) => item.id === lead.companyId);
    return {
      ...lead,
      mainPattern: company?.topPatterns[0] ?? 'Tese ainda em consolidação',
      nextAction: company?.nextAction ?? 'Revisar tese e preparar abordagem',
    };
  });

  const bestNextLead = topLeads[0];
  const immediateLeads = topLeads.filter((lead) => lead.bucket.includes('immediate')).length;
  const activePipeline = dashboard.pipeline
    .filter((entry) => !['ClosedWon', 'ClosedLost', 'Recycled'].includes(entry.stage))
    .reduce((sum, entry) => sum + entry.count, 0);
  const commercialBlockers = abmWeekly.cooling_accounts.length
    + abmWeekly.without_champion.length
    + abmWeekly.overdue_next_steps.length
    + abmWeekly.critical_open_objections.length;

  const dailyActions = [
    {
      title: immediateLeads > 0 ? `${immediateLeads} lead(s) pronto(s) para decisão` : 'Revisar a fila de leads',
      description: 'Confirme o timing, a estrutura e a próxima ação antes do contato.',
      to: '/companies',
      label: 'Abrir leads',
      tone: immediateLeads > 0 ? 'success' as const : 'info' as const,
    },
    {
      title: commercialBlockers > 0 ? `${commercialBlockers} bloqueio(s) comercial(is)` : 'Nenhum bloqueio crítico',
      description: 'Resolva contas esfriando, ações vencidas, ausência de champion ou objeções.',
      to: '/pipeline',
      label: 'Abrir pipeline',
      tone: commercialBlockers > 0 ? 'warning' as const : 'success' as const,
    },
    {
      title: `${dashboard.monitoring.triggers24h} novo(s) sinal(is) nas últimas 24h`,
      description: 'Revise apenas os sinais que podem alterar prioridade, timing ou tese.',
      to: '/monitoring',
      label: 'Revisar sinais',
      tone: dashboard.monitoring.triggers24h > 0 ? 'info' as const : 'success' as const,
    },
  ];

  return (
    <div className="page today-page simple-page">
      <PageIntro
        eyebrow="Operação diária"
        title="O que merece sua atenção hoje"
        description="Comece pela melhor oportunidade, resolva os bloqueios e avance o próximo passo. O restante fica disponível quando necessário."
        actions={<Link to="/companies" className="button">Ver todos os leads</Link>}
      />

      <DataStatusBanner source={dashboardState.source} note={dashboardState.note} />
      {!abmAvailable ? (
        <div className="inline-notice">
          <Pill tone="warning">Dados comerciais parciais</Pill>
          <span>O ranking está disponível, mas alguns bloqueios não puderam ser atualizados.</span>
        </div>
      ) : null}

      {bestNextLead ? (
        <section className="simple-next-action" aria-labelledby="next-action-title">
          <div>
            <p className="eyebrow">Próxima melhor ação</p>
            <h2 id="next-action-title">{bestNextLead.companyName}</h2>
            <p>{bestNextLead.nextAction}</p>
            <dl>
              <div><dt>Por que agora</dt><dd>{bestNextLead.mainPattern}</dd></div>
              <div><dt>Estrutura provável</dt><dd>{bestNextLead.suggestedStructure}</dd></div>
            </dl>
          </div>
          <div className="simple-next-score">
            <span>Lead score</span>
            <strong>{bestNextLead.leadScore}</strong>
            <Pill tone={priorityTone(bestNextLead.bucket)}>{readable(bestNextLead.bucket)}</Pill>
          </div>
          <Link to={`/companies/${bestNextLead.companyId}`} className="button">Abrir decisão</Link>
        </section>
      ) : (
        <Card title="Nenhuma prioridade disponível" subtitle="O ranking ainda não retornou leads para hoje">
          <Link to="/search-profiles" className="button">Pesquisar empresas</Link>
        </Card>
      )}

      <section className="simple-metrics" aria-label="Resumo do dia">
        <Link to="/companies"><span>Abordar agora</span><strong>{immediateLeads}</strong><small>leads com timing imediato</small></Link>
        <Link to="/pipeline"><span>Pipeline ativo</span><strong>{activePipeline}</strong><small>oportunidades em andamento</small></Link>
        <Link to="/pipeline"><span>Bloqueios</span><strong>{commercialBlockers}</strong><small>itens que exigem ação</small></Link>
      </section>

      <section className="simple-work-list" aria-labelledby="work-list-title">
        <header>
          <div>
            <p className="eyebrow">Plano do dia</p>
            <h2 id="work-list-title">Três ações para avançar</h2>
          </div>
        </header>
        {dailyActions.map((action, index) => (
          <article key={action.to}>
            <span className="simple-step-number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{action.title}</strong>
              <p>{action.description}</p>
            </div>
            <Pill tone={action.tone}>prioridade</Pill>
            <Link to={action.to} className="button secondary compact-button">{action.label}</Link>
          </article>
        ))}
      </section>

      <Card
        title="Próximos leads"
        subtitle="A fila curta para decidir depois da prioridade principal"
        actions={<Link to="/companies" className="text-link">Ver fila completa</Link>}
        className="simple-priority-card"
      >
        <div className="simple-priority-list">
          {topLeads.slice(0, 5).map((lead, index) => (
            <Link key={lead.companyId} to={`/companies/${lead.companyId}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span><strong>{lead.companyName}</strong><small>{lead.mainPattern}</small></span>
              <span>{lead.suggestedStructure}</span>
              <ScoreBadge value={lead.leadScore} kind="lead" />
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </Card>

      <details className="simple-secondary-details">
        <summary>Ver inteligência complementar</summary>
        <div className="simple-secondary-grid">
          <Card title="Cobertura de dados" subtitle="Saúde mínima da captura que sustenta as decisões">
            <div className="simple-key-values">
              <div><span>Fontes ativas</span><strong>{dashboard.monitoring.activeSources}</strong></div>
              <div><span>Outputs 24h</span><strong>{dashboard.monitoring.outputs24h}</strong></div>
              <div><span>Triggers 24h</span><strong>{dashboard.monitoring.triggers24h}</strong></div>
            </div>
            <Link to="/monitoring" className="button secondary full-width-button">Abrir monitoramento</Link>
          </Card>
          <Card title="Padrões dominantes" subtitle="Hipóteses financeiras mais recorrentes">
            <div className="simple-pattern-list">
              {dashboard.patterns.slice(0, 5).map((item) => (
                <div key={item.pattern}><span>{item.pattern}</span><strong>{item.companies}</strong></div>
              ))}
            </div>
          </Card>
        </div>
      </details>
    </div>
  );
}
