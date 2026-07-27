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

  const decisionCards = [
    { label: 'Abordar agora', value: String(immediateLeads), helper: 'prioridade imediata', tone: 'success' as const },
    { label: 'Alta prioridade', value: String(highPriorityLeads), helper: 'score ou bucket alto', tone: 'warning' as const },
    { label: 'Triggers fortes', value: String(strongTriggerLeads), helper: 'mudança relevante recente', tone: 'info' as const },
    { label: 'Score médio', value: String(averageLeadScore), helper: 'base priorizada', tone: 'default' as const },
  ];

  return (
    <div className="page dashboard-page-v3">
      <PageIntro
        eyebrow="Cockpit de decisão"
        title="O que merece ação hoje"
        description="Prioridade comercial, razão financeira, estrutura sugerida e próximo passo — sem misturar infraestrutura com a decisão de originação."
        actions={(
          <div className="pill-row">
            <Link to="/companies" className="button">Ver ranking completo</Link>
            <Link to="/pipeline" className="button secondary">Abrir pipeline</Link>
          </div>
        )}
      />

      <DataStatusBanner source={dashboardState.source} note={dashboardState.note} />

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
          <Link to={`/companies/${bestNextLead.companyId}`} className="button next-action-button">Abrir análise</Link>
        </section>
      ) : null}

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
              <Link to="/dcm-daily"><span>Contas esfriando</span><strong>{abmWeekly.data.cooling_accounts.length}</strong></Link>
              <Link to="/dcm-daily"><span>Sem champion</span><strong>{abmWeekly.data.without_champion.length}</strong></Link>
              <Link to="/outcome-operations"><span>Ações vencidas</span><strong>{abmWeekly.data.overdue_next_steps.length}</strong></Link>
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
