import DataTable from '../components/DataTable';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import { dashboardMetrics, recentProposals } from '../services/mockData';

const proposalColumns = [
  { key: 'id', label: 'ID' },
  { key: 'client', label: 'Cliente' },
  { key: 'product', label: 'Produto' },
  { key: 'value', label: 'Valor' },
  { key: 'status', label: 'Status' },
];

function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="stats-grid">
        {dashboardMetrics.map((metric) => (
          <StatCard key={metric.id} {...metric} />
        ))}
      </section>

      <div className="dashboard-grid">
        <SectionCard
          title="Resumo da operação"
          description="Visão consolidada dos principais números da originação."
        >
          <div className="highlight-panel">
            <div>
              <p className="eyebrow">Desempenho diário</p>
              <strong>17 propostas atualizadas hoje</strong>
            </div>
            <span>Equipe com SLA médio de 2h14.</span>
          </div>
        </SectionCard>

        <SectionCard
          title="Próximas ações"
          description="Prioridades para manter a esteira saudável."
        >
          <ul className="action-list">
            <li>Validar documentação pendente de 4 clientes.</li>
            <li>Retomar contato com leads acima de R$ 200 mil.</li>
            <li>Revisar propostas em análise com mais de 48h.</li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Propostas recentes"
        description="Lista mockada para futura integração com API."
      >
        <DataTable columns={proposalColumns} rows={recentProposals} />
      </SectionCard>
    </div>
  );
}

export default DashboardPage;
