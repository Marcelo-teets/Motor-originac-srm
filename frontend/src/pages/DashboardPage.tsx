import { Card, Pill, ProgressBar, Stat } from '../components/UI';
import { dashboard, stackStatus } from '../mocks/data';

export function DashboardPage() {
  return (
    <div className="page">
      <section className="grid cols-4">
        {dashboard.summary.map((item) => (
          <Card key={item.label} title={item.value} subtitle={item.label} tone={item.tone === 'success' ? 'success' : item.tone === 'primary' ? 'accent' : 'default'}>
            <Stat label="Contexto" value={item.helper} />
          </Card>
        ))}
      </section>

      <section className="grid cols-3">
        <Card title="Top leads" subtitle="Priorização executiva baseada em Ranking V2" actions={<Pill tone="success">live shortlist</Pill>}>
          <table>
            <thead><tr><th>Empresa</th><th>Qualif.</th><th>Lead</th><th>Trigger</th><th>Estrutura</th></tr></thead>
            <tbody>
              {dashboard.topLeads.map((row) => (
                <tr key={row.company}>
                  <td><strong>{row.company}</strong><div className="table-helper">{row.bucket}</div></td>
                  <td>{row.score}</td>
                  <td>{row.lead}</td>
                  <td>{row.trigger}</td>
                  <td>{row.structure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Monitoring widget" subtitle="Cobertura de conectores reais/parciais" actions={<Pill tone="info">connectors</Pill>}>
          <div className="stats-stack">
            {dashboard.monitoring.metrics.map((item) => <Stat key={item.label} label={item.label} value={item.value} helper={item.helper} />)}
          </div>
          <ul className="list compact-list">
            {dashboard.monitoring.highlights.map((item) => <li key={item}><strong>Highlight</strong><span>{item}</span></li>)}
          </ul>
        </Card>

        <Card title="Agents widget" subtitle="Saúde do pipeline multiagente" actions={<Pill>orchestration</Pill>}>
          <ul className="list compact-list">
            {dashboard.agents.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <div className="table-helper">{item.lastRun}</div>
                </div>
                <span>{item.status} · {item.note}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid cols-2">
        <Card title="Patterns widget" subtitle="Impacto médio por padrão" actions={<Pill tone="warning">10 patterns</Pill>}>
          <div className="bars">
            {dashboard.patterns.map((item) => (
              <div key={item.pattern}>
                <div className="row-between"><span>{item.pattern}</span><strong>{item.avgImpact}</strong></div>
                <ProgressBar value={item.avgImpact} max={20} tone="warning" />
                <div className="table-helper">{item.companies} companhia(s) impactada(s)</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline widget" subtitle="Cobertura do funil comercial" actions={<Pill tone="success">ready for merge</Pill>}>
          <div className="bars">
            {dashboard.pipeline.map((item) => (
              <div key={item.stage}>
                <div className="row-between"><span>{item.stage}</span><strong>{item.count}</strong></div>
                <ProgressBar value={item.count} max={3} tone="info" />
                <div className="table-helper">{item.coverage}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Charts simples" subtitle="Qualification vs lead score">
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

        <Card title="Status real vs mock" subtitle="Governança explícita do que já está pronto">
          <ul className="list">
            {stackStatus.map((item) => (
              <li key={item.label}><strong>{item.label}</strong><span>{item.value}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
