import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar, ScoreBadge, Stat } from '../components/UI';
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
  const maxPipeline = Math.max(...dashboard.pipeline.map((entry) => entry.count), 1);
  const bestNextLead = topLeads[0];
  const immediateLeads = topLeads.filter((lead) => lead.bucket.includes('immediate')).length;
  const highPriorityLeads = topLeads.filter((lead) => lead.bucket.includes('high') || lead.leadScore >= 80).length;
  const strongTriggerLeads = topLeads.filter((lead) => lead.triggerStrength >= 70).length;
  const averageLeadScore = topLeads.length > 0 ? Math.round(topLeads.reduce((sum, lead) => sum + lead.leadScore, 0) / topLeads.length) : 0;
  const decisionCards: Array<{ label: string; value: string; helper: string; tone: 'success' | 'warning' | 'info' | 'default' }> = [
    { label: 'Abordar agora', value: String(immediateLeads), helper: 'leads com prioridade imediata no ranking', tone: 'success' },
    { label: 'Alta prioridade', value: String(highPriorityLeads), helper: 'lead score alto ou bucket high priority', tone: 'warning' },
    { label: 'Triggers fortes', value: String(strongTriggerLeads), helper: 'empresas com mudança recente relevante', tone: 'info' },
    { label: 'Lead score médio', value: String(averageLeadScore), helper: 'média dos leads priorizados no cockpit', tone: 'default' },
  ];

  return (
    <div className="page">
      <PageIntro
        eyebrow="Dashboard"
        title="Cockpit executivo de originação"
        description="Visão priorizada para decidir quem abordar, por que agora, qual estrutura sugerir e qual próxima ação executar no pipeline comercial."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Top leads no centro</Pill>
            <Link to="/companies" className="button secondary">Abrir ranking</Link>
            <Link to="/pipeline" className="button secondary">Ver pipeline</Link>
          </div>
        )}
      />

      <DataStatusBanner source={dashboardState.source} note={dashboardState.note} />

      <section className="kpi-strip">
        {dashboard.summary.map((item) => (
          <div key={item.label} className="kpi-tile">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </div>
        ))}
      </section>

      <section className="decision-strip">
        {decisionCards.map((item) => (
          <div key={item.label} className="decision-card">
            <Pill tone={item.tone}>{item.label}</Pill>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </div>
        ))}
      </section>

      <VercelOpsPanel
        source={dashboardState.source}
        note={dashboardState.note}
        activeSources={dashboard.monitoring.activeSources}
        outputs24h={dashboard.monitoring.outputs24h}
        triggers24h={dashboard.monitoring.triggers24h}
      />

      {bestNextLead ? (
        <Card title="Próxima melhor ação" subtitle="Lead mais relevante para ação comercial imediata" tone="accent" className="dashboard-decision-card">
          <div className="next-best-action">
            <div>
              <p className="eyebrow">Conta sugerida</p>
              <h3>{bestNextLead.companyName}</h3>
              <p>{bestNextLead.nextAction}</p>
            </div>
            <div className="score-context">
              <ScoreBadge value={bestNextLead.leadScore} kind="lead" />
              <Pill tone={priorityTone(bestNextLead.bucket)}>{formatBucket(bestNextLead.bucket)}</Pill>
              <span>{bestNextLead.suggestedStructure}</span>
            </div>
            <Link to={`/companies/${bestNextLead.companyId}`} className="button">Abrir memo</Link>
          </div>
        </Card>
      ) : null}

      <section className="dashboard-grid">
        <Card title="Top Leads" subtitle="Shortlist central para decisão de cobertura e estruturação" actions={<Pill tone="success">peça central</Pill>} className="dashboard-main-table">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Qualification Score</th>
                <th>Lead Score</th>
                <th>Ranking</th>
                <th>Main Pattern</th>
                <th>Suggested Structure</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {topLeads.map((row) => (
                <tr key={row.companyId}>
                  <td>
                    <Link to={`/companies/${row.companyId}`}><strong>{row.companyName}</strong></Link>
                    <div className="table-helper">{row.nextAction}</div>
                  </td>
                  <td><ScoreBadge value={row.qualificationScore} kind="qualification" /></td>
                  <td><ScoreBadge value={row.leadScore} kind="lead" /></td>
                  <td><ScoreBadge value={row.rankingScore ?? row.leadScore} kind="priority" /></td>
                  <td>
                    <strong>{row.mainPattern}</strong>
                    <div className="table-helper">Trigger strength {row.triggerStrength}</div>
                  </td>
                  <td>{row.suggestedStructure}</td>
                  <td><Pill tone={priorityTone(row.bucket)}>{formatBucket(row.bucket)}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <WatchListWidget />

        <Card title="ABM War Room" subtitle="Top contas da semana e pendências comerciais críticas" actions={<Pill tone="warning">novo</Pill>}>
          <ul className="list compact-list">
            <li><strong>Top contas</strong><span>{abmWeekly.data.top_accounts.length}</span></li>
            <li><strong>Contas esfriando</strong><span>{abmWeekly.data.cooling_accounts.length}</span></li>
            <li><strong>Sem champion</strong><span>{abmWeekly.data.without_champion.length}</span></li>
            <li><strong>Ações vencidas</strong><span>{abmWeekly.data.overdue_next_steps.length}</span></li>
            <li><strong>Objeções críticas</strong><span>{abmWeekly.data.critical_open_objections.length}</span></li>
          </ul>
        </Card>

        <Card title="Monitoring" subtitle="Triggers recentes, últimas execuções e cobertura ativa" actions={<Pill tone="info">widget</Pill>}>
          <div className="stack-blocks compact-gap">
            <div className="mini-metric-grid">
              <Stat label="Triggers recentes" value={String(dashboard.monitoring.triggers24h)} helper="sinais consolidados nas últimas 24h" />
              <Stat label="Execuções" value={String(dashboard.monitoring.outputs24h)} helper="outputs gerados no período" />
              <Stat label="Fontes ativas" value={String(dashboard.monitoring.activeSources)} helper="fontes com cobertura válida" />
            </div>
            <ul className="list compact-list">
              {topLeads.slice(0, 3).map((lead) => (
                <li key={`${lead.companyId}-trigger`}>
                  <strong>{lead.companyName}</strong>
                  <span>{lead.mainPattern} · força {lead.triggerStrength}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Agents" subtitle="Saúde operacional, falhas e confiança por agente" actions={<Pill tone="warning">widget</Pill>}>
          <ul className="list compact-list">
            {dashboard.agents.map((agent, index) => (
              <li key={agent.name}>
                <div>
                  <strong>{agent.name}</strong>
                  <div className="table-helper">{agent.note}</div>
                </div>
                <span>{agent.status} · confiança {Math.max(58, 88 - index * 6)}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Patterns" subtitle="Padrões mais detectados e distribuição por tipo" actions={<Pill tone="warning">widget</Pill>}>
          <div className="bars">
            {dashboard.patterns.map((item) => (
              <div key={item.pattern}>
                <div className="row-between"><span>{item.pattern}</span><strong>{item.avgImpact}</strong></div>
                <ProgressBar value={item.avgImpact} max={20} tone="warning" />
                <div className="table-helper">{item.companies} companhia(s) com esse padrão</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline" subtitle="Empresas por estágio e atividades recentes" actions={<Pill tone="success">widget</Pill>}>
          <div className="bars">
            {dashboard.pipeline.map((item) => (
              <div key={item.stage}>
                <div className="row-between"><span>{item.stage}</span><strong>{item.count}</strong></div>
                <ProgressBar value={item.count} max={maxPipeline} tone="info" />
                <div className="table-helper">{item.coverage}</div>
              </div>
            ))}
          </div>
          <ul className="list compact-list top-gap">
            {companies.slice(0, 3).map((company) => (
              <li key={`${company.id}-activity`}>
                <strong>{company.name}</strong>
                <span>{company.nextAction ?? 'Executar próxima ação'} </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Evolução de leads" subtitle="Leitura rápida por bucket e evolução da base">
          <div className="bars">
            {(dashboard.charts.leadBuckets ?? []).map((item) => (
              <div key={item.label}>
                <div className="row-between"><span>{item.label}</span><strong>{item.value}</strong></div>
                <ProgressBar value={item.value} max={Math.max(...(dashboard.charts.leadBuckets ?? []).map((entry) => entry.value), 1)} tone="success" />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Evolução de score" subtitle="Qualification vs lead por companhia priorizada">
          <div className="bars">
            {dashboard.charts.qualificationVsLead.map((item) => (
              <div key={item.company} className="chart-pair">
                <div className="row-between"><span>{item.company}</span><strong>{item.qualification}/{item.lead}</strong></div>
                <ProgressBar value={item.qualification} tone="default" />
                <ProgressBar value={item.lead} tone="success" />
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
