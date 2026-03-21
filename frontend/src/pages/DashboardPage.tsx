import { Card, Pill } from '../components/UI';
import { dashboard, stackStatus } from '../mocks/data';

export function DashboardPage() {
  return (
    <div className="page">
      <section className="grid cols-4">
        {dashboard.summary.map((item) => (
          <Card key={item.label} title={item.value} subtitle={item.label}>
            <Pill>{item.tone}</Pill>
          </Card>
        ))}
      </section>
      <section className="grid cols-2">
        <Card title="Top leads" subtitle="Priorização executiva">
          <table><thead><tr><th>Empresa</th><th>Qualif.</th><th>Lead</th><th>Estrutura</th></tr></thead><tbody>{dashboard.topLeads.map((row) => <tr key={row.company}><td>{row.company}</td><td>{row.score}</td><td>{row.lead}</td><td>{row.structure}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Status dos agentes" subtitle="Saúde do pipeline multiagente">
          <ul className="list">{dashboard.agents.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.status} · {item.lastRun}</span></li>)}</ul>
        </Card>
        <Card title="Padrões detectados" subtitle="Pattern identification agent v1">
          <ul className="list">{dashboard.patterns.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
        <Card title="Monitoramento" subtitle="Cobertura e tração">
          <ul className="list">{dashboard.monitoring.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
        <Card title="Pipeline" subtitle="Distribuição por estágio">
          <div className="bars">{dashboard.pipeline.map((item) => <div key={item.stage}><span>{item.stage}</span><div className="bar"><i style={{ width: `${item.count * 2}%` }} /></div><strong>{item.count}</strong></div>)}</div>
        </Card>
        <Card title="Status real vs mock" subtitle="Governança de hardcoding pragmático">
          <ul className="list">{stackStatus.map((item) => <li key={item.label}><strong>{item.label}</strong><span>{item.value}</span></li>)}</ul>
        </Card>
      </section>
    </div>
  );
}
