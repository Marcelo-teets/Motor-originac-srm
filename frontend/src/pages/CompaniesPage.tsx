import { Link } from 'react-router-dom';
import { Card, Pill, ProgressBar } from '../components/UI';
import { companies } from '../mocks/data';

export function CompaniesPage() {
  return (
    <div className="page">
      <Card title="Leads / Companies list" subtitle="Tabela consolidada + cards de prioridade" actions={<Pill tone="success">ranking v2</Pill>}>
        <table>
          <thead><tr><th>Empresa</th><th>Segmento</th><th>Estrutura</th><th>Qualificação</th><th>Lead</th><th>Funding need</th><th>Prioridade</th></tr></thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>
                  <Link to={`/companies/${company.id}`}><strong>{company.name}</strong></Link>
                  <div className="table-helper">{company.subsegment}</div>
                </td>
                <td>{company.segment}</td>
                <td>{company.structure}</td>
                <td>{company.qualification}</td>
                <td>{company.lead}</td>
                <td>{company.predictedFundingNeed}</td>
                <td><Pill tone={company.priority === 'immediate_priority' ? 'success' : 'warning'}>{company.priority}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="grid cols-3">
        {companies.map((company) => (
          <Card key={company.id} title={company.name} subtitle={`${company.segment} · ${company.structure}`}>
            <div className="stats-stack compact">
              <div>
                <div className="row-between"><span>Qualification</span><strong>{company.qualification}</strong></div>
                <ProgressBar value={company.qualification} />
              </div>
              <div>
                <div className="row-between"><span>Lead</span><strong>{company.lead}</strong></div>
                <ProgressBar value={company.lead} tone="success" />
              </div>
            </div>
            <ul className="list compact-list">
              <li><strong>Patterns</strong><span>{company.patterns.join(' · ')}</span></li>
              <li><strong>Trigger strength</strong><span>{company.triggerStrength}</span></li>
              <li><strong>Source confidence</strong><span>{company.sourceConfidence}</span></li>
            </ul>
          </Card>
        ))}
      </section>
    </div>
  );
}
