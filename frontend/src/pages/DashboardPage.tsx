import { Link } from 'react-router-dom';
import { Card, Pill, ProgressBar, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function DashboardPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getDashboard(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Dashboard" subtitle="Carregando dados reais do backend">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Dashboard" subtitle="Falha ao carregar dados reais">{error}</Card></div>;

  return (
    <div className="page">
      <section className="grid cols-4">
        {data.summary.map((item) => (
          <Card key={item.label} title={item.value} subtitle={item.label} tone={item.tone === 'success' ? 'success' : item.tone === 'primary' ? 'accent' : 'default'}>
            <Stat label="Contexto" value={item.helper} />
          </Card>
        ))}
      </section>

      <section className="grid cols-2">
        <Card title="Top leads" subtitle="Shortlist central com ranking real" actions={<Pill tone="success">backend live</Pill>}>
          <table>
            <thead><tr><th>Empresa</th><th>Qualif.</th><th>Lead</th><th>Trigger</th><th>Estrutura</th></tr></thead>
            <tbody>
              {data.topLeads.map((row) => (
                <tr key={row.companyId}>
                  <td><Link to={`/companies/${row.companyId}`}><strong>{row.companyName}</strong></Link><div className="table-helper">{row.bucket}</div></td>
                  <td>{row.qualificationScore}</td>
                  <td>{row.leadScore}</td>
                  <td>{row.triggerStrength}</td>
                  <td>{row.suggestedStructure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="KPIs de monitoring" subtitle="Menos clutter, leitura executiva" actions={<Pill tone="info">connectors</Pill>}>
          <div className="stats-stack">
            <Stat label="Fontes ativas" value={String(data.monitoring.activeSources)} helper="BrasilAPI + RSS + website" />
            <Stat label="Outputs" value={String(data.monitoring.outputs24h)} helper="monitoring_outputs persistidos" />
            <Stat label="Triggers" value={String(data.monitoring.triggers24h)} helper="company_signals derivados" />
            <Stat label="Website checks" value={String(data.monitoring.websiteChecks)} helper="captura HTML básica" />
          </div>
        </Card>
      </section>

      <section className="grid cols-3">
        <Card title="Patterns" subtitle="Impacto médio por padrão funcional" actions={<Pill tone="warning">pattern engine</Pill>}>
          <div className="bars">
            {data.patterns.map((item) => (
              <div key={item.pattern}>
                <div className="row-between"><span>{item.pattern}</span><strong>{item.avgImpact}</strong></div>
                <ProgressBar value={item.avgImpact} max={20} tone="warning" />
                <div className="table-helper">{item.companies} companhia(s)</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline" subtitle="Cobertura atual do funil" actions={<Pill tone="success">persistido</Pill>}>
          <div className="bars">
            {data.pipeline.map((item) => (
              <div key={item.stage}>
                <div className="row-between"><span>{item.stage}</span><strong>{item.count}</strong></div>
                <ProgressBar value={item.count} max={Math.max(...data.pipeline.map((entry) => entry.count), 1)} tone="info" />
                <div className="table-helper">{item.coverage}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Qualification vs lead" subtitle="Correlação por empresa monitorada">
          <div className="bars">
            {data.charts.qualificationVsLead.map((item) => (
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
