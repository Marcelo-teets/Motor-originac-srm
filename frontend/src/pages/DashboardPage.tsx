import { Link } from 'react-router-dom';
import { CapitalMarketHealthPanel } from '../components/CapitalMarketHealthPanel';
import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar, ScoreBadge } from '../components/UI';
import { VercelOpsPanel } from '../components/VercelOpsPanel';
import { WatchListWidget } from '../components/WatchListWidget';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

function priorityTone(bucket: string) {
  if (bucket.includes('immediate')) return 'success';
  if (bucket.includes('high')) return 'warning';
  return 'info';
}

function formatBucket(bucket: string) {
  return bucket.replace(/_/g, ' ');
}

export function DashboardPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(
    async () => {
      const [dashboardState, companiesState, abmWeekly] = await Promise.all([
        api.getDashboard(session),
        api.getCompanies(session),
        api.getAbmWeekly(session),
      ]);
      return { dashboardState, companiesState, abmWeekly };
    },
    [session?.access_token],
  );

  if (loading) return <div className="page"><Card title="Dashboard" subtitle="Carregando visão executiva do backend oficial">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Dashboard" subtitle="Falha ao carregar dados do dashboard">{error}</Card></div>;

  const { dashboardState, companiesState, abmWeekly } = data;
  const dashboard = dashboardState.data;
  const companies = companiesState.data;
  const topLeads = dashboard.topLeads.map((lead) => {
    const company = companies.find((item) => item.id === lead.companyId);
    return {
      ...lead,
      mainPattern: company?.topPatterns[0] ?? 'Pattern ainda em consolidação',
      nextAction: company?.nextAction ?? 'Revisar tese e preparar approach',
    };
  });

  const bestNextLead = topLeads[0];
  const immediateLeads = topLeads.filter((lead) => lead.bucket.includes('immediate')).length;
  const highPriorityLeads = topLeads.filter((lead) => lead.bucket.includes('high') || lead.leadScore >= 80).length;
  const strongTriggerLeads = topLeads.filter((lead) => lead.triggerStrength >= 70).length;
  const averageLeadScore = topLeads.length > 0 ? Math.round(topLeads.reduce((sum, lead) => sum + lead.leadScore, 0) / topLeads.length) : 0;
  const maxPipeline = Math.max(...dashboard.pipeline.map((entry) => entry.count), 1);
  const activePipeline = dashboard.pipeline.filter((entry) => !['ClosedWon', 'ClosedLost', 'Recycled'].includes(entry.stage)).reduce((sum, entry) => sum + entry.count, 0);
  const commercialBlockers = abmWeekly.data.cooling_accounts.length + abmWeekly.data.without_champion.length + abmWeekly.data.overdue_next_steps.length + abmWeekly.data.critical_open_objections.length;

  const decisionCards = [
    { label: 'Abordar agora', value: String(immediateLeads), helper: 'prioridade imediata', tone: 'success' as const },
    { label: 'Alta prioridade', value: String(highPriorityLeads), helper: 'score ou bucket alto', tone: 'warning' as const },
    { label: 'Triggers fortes', value: String(strongTriggerLeads), helper: 'mudança relevante recente', tone: 'info' as const },
    { label: 'Score médio', value: String(averageLeadScore), helper: 'base priorizada', tone: 'default' as const },
  ];

  const dailyActions = [
    {
      number: '01',
      title: immediateLeads > 0 ? `Revisar ${immediateLeads} lead(s) para abordagem` : 'Revisar o ranking de leads',
      description: 'Validar timing, estrutura sugerida e a próxima ação antes de iniciar contato.',
      to: '/companies',
      tone: immediateLeads > 0 ? 'success' as const : 'info' as const,
      label: 'Abrir fila',
    },
    {
      number: '02',
      title: commercialBlockers > 0 ? `Resolver ${commercialBlockers} bloqueio(s) comercial(is)` : 'Pipeline sem bloqueios críticos',
      description: 'Contas esfriando, sem champion, com ação vencida ou objeção crítica precisam de tratamento.',
      to: '/pipeline',
      tone: commercialBlockers > 0 ? 'warning' as const : 'success' as const,
      label: 'Abrir pipeline',
    },
    {
      number: '03',
      title: `Processar ${dashboard.monitoring.triggers24h} trigger(s) das últimas 24h`,
      description: 'Novos sinais podem alterar timing, score e prioridade das empresas monitoradas.',
      to: '/monitoring',
      tone: dashboard.monitoring.triggers24h > 0 ? 'info' as const : 'default' as const,
      label: 'Revisar sinais',
    },
  ];

  return (
    <div className="page dashboard-page-v4">
      <PageIntro
        eyebrow="Cockpit diário"
        title="O que precisa acontecer hoje"
        description="A rotina do Motor começa pela decisão: quem merece atenção, qual hipótese financeira sustenta a abordagem e qual ação move a oportunidade."
        actions={(
          <div className="pill-row">
            <Link to="/companies" className="button">Abrir fila de decisão</Link>
            <Link to="/search-profiles" className="button secondary">Criar nova busca</Link>
          </div>
        )}
      />

      <DataStatusBanner source={dashboardState.source} note={dashboardState.note} />

      <section className="daily-action-deck" aria-label="Plano de trabalho do dia">
        {dailyActions.map((action) => (
          <article key={action.number}>
            <div className="daily-action-number">{action.number}</div>
            <div>
              <div className="daily-action-heading">
                <strong>{action.title}</strong>
                <Pill tone={action.tone}>ação do dia</Pill>
              </div>
              <p>{action.description}</p>
            </div>
            <Link to={action.to} className="button secondary compact-button">{action.label}</Link>
          </article>
        ))}
      </section>

      <section className="decision-strip decision-strip-v3" aria-label="Resumo de decisão">
        {decisionCards.map((item) => (
          <div key={item.label} className="decision-card decision-card-v3">
            <div className="decision-card-heading">
              <span>{item.label}</span>
              <Pill tone={item.tone}>{item.helper}</Pill>
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      {bestNextLead ? (
        <section className="next-action-hero">
          <div className="next-action-copy">
            <p className="eyebrow">Próxima melhor ação</p>
            <h2>{bestNextLead.companyName}</h2>
            <p>{bestNextLead.nextAction}</p>
            <div className="next-action-evidence">
              <span><strong>Por que agora:</strong> {bestNextLead.mainPattern}</span>
              <span><strong>Estrutura:</strong> {bestNextLead.suggestedStructure}</span>
            </div>
          </div>
          <div className="next-action-score">
            <span>Lead score</span>
            <strong>{bestNextLead.leadScore}</strong>
            <Pill tone={priorityTone(bestNextLead.bucket)}>{formatBucket(bestNextLead.bucket)}</Pill>
          </div>
          <Link to={`/companies/${bestNextLead.companyId}`} className="button next-action-button">Abrir decisão</Link>
        </section>
      ) : null}

      <section className="origination-funnel" aria-label="Fluxo de originação">
        <Link to="/search-profiles">
          <span>01</span><strong>Descoberta</strong><small>{companies.length} empresas na base</small>
        </Link>
        <i aria-hidden="true">→</i>
        <Link to="/companies">
          <span>02</span><strong>Priorização</strong><small>{topLeads.length} leads ranqueados</small>
        </Link>
        <i aria-hidden="true">→</i>
        <Link to="/pipeline">
          <span>03</span><strong>Execução</strong><small>{activePipeline} deals ativos</small>
        </Link>
        <i aria-hidden="true">→</i>
        <Link to="/outcome-operations">
          <span>04</span><strong>Aprendizado</strong><small>outcomes e reciclagem</small>
        </Link>
      </section>

      <section className="dashboard-command-grid">
        <Card
          title="Fila prioritária"
          subtitle="As cinco contas com maior probabilidade de gerar ação útil agora"
          actions={<Link to="/companies" className="text-link">Ver todos</Link>}
          className="priority-queue-card"
        >
          <div className="priority-lead-list">
            {topLeads.slice(0, 5).map((lead, index) => (
              <Link key={lead.companyId} to={`/companies/${lead.companyId}`} className="priority-lead-row">
                <span className="priority-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="priority-company">
                  <strong>{lead.companyName}</strong>
                  <small>{lead.mainPattern}</small>
                </span>
                <span className="priority-structure">{lead.suggestedStructure}</span>
                <ScoreBadge value={lead.leadScore} kind="lead" />
                <Pill tone={priorityTone(lead.bucket)}>{formatBucket(lead.bucket)}</Pill>
                <span className="priority-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </Card>

        <div className="dashboard-side-stack">
          <Card title="Pulso comercial" subtitle="Pendências que travam avanço no funil">
            <div className="pulse-list">
              <Link to="/dcm-daily"><span>Top contas da semana</span><strong>{abmWeekly.data.top_accounts.length}</strong></Link>
              <Link to="/pipeline"><span>Contas esfriando</span><strong>{abmWeekly.data.cooling_accounts.length}</strong></Link>
              <Link to="/pipeline"><span>Sem champion</span><strong>{abmWeekly.data.without_champion.length}</strong></Link>
              <Link to="/pipeline"><span>Ações vencidas</span><strong>{abmWeekly.data.overdue_next_steps.length}</strong></Link>
            </div>
          </Card>

          <Card title="Cobertura de dados" subtitle="Sinais e monitoramento que sustentam a priorização">
            <div className="coverage-grid">
              <div><span>Fontes ativas</span><strong>{dashboard.monitoring.activeSources}</strong></div>
              <div><span>Outputs 24h</span><strong>{dashboard.monitoring.outputs24h}</strong></div>
              <div><span>Triggers 24h</span><strong>{dashboard.monitoring.triggers24h}</strong></div>
            </div>
            <Link to="/monitoring" className="button secondary full-width-button">Abrir monitoramento</Link>
          </Card>
        </div>
      </section>

      <section className="dashboard-secondary-grid">
        <WatchListWidget />

        <Card title="Pipeline por estágio" subtitle="Onde a carteira está concentrada agora">
          <div className="bars">
            {dashboard.pipeline.slice(0, 6).map((item) => (
              <div key={item.stage}>
                <div className="row-between"><span>{item.stage}</span><strong>{item.count}</strong></div>
                <ProgressBar value={item.count} max={maxPipeline} tone="info" />
              </div>
            ))}
          </div>
          <Link to="/pipeline" className="button secondary full-width-button top-gap">Gerenciar pipeline</Link>
        </Card>

        <Card title="Padrões dominantes" subtitle="Hipóteses financeiras mais recorrentes na base">
          <div className="pattern-summary-list">
            {dashboard.patterns.slice(0, 5).map((item) => (
              <div key={item.pattern}>
                <span>{item.pattern}</span>
                <strong>{item.companies}</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <details className="diagnostics-disclosure">
        <summary>Diagnóstico técnico e saúde de mercado</summary>
        <div className="diagnostics-grid">
          <VercelOpsPanel
            source={dashboardState.source}
            note={dashboardState.note}
            activeSources={dashboard.monitoring.activeSources}
            outputs24h={dashboard.monitoring.outputs24h}
            triggers24h={dashboard.monitoring.triggers24h}
          />
          <CapitalMarketHealthPanel />
        </div>
      </details>
    </div>
  );
}
