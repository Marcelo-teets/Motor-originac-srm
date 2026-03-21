import { Link } from 'react-router-dom';
import { Card, Pill } from '../components/UI';
import { companies } from '../mocks/data';

export function CompaniesPage() {
  return (
    <div className="page">
      <Card title="Leads / Companies list" subtitle="Lista consolidada de oportunidades">
        <table><thead><tr><th>Empresa</th><th>Segmento</th><th>Estrutura</th><th>Qualificação</th><th>Lead score</th><th>Prioridade</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><Link to={`/companies/${company.id}`}>{company.name}</Link></td><td>{company.segment}</td><td>{company.structure}</td><td>{company.qualification}</td><td>{company.lead}</td><td><Pill>{company.priority}</Pill></td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
