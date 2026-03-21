import { Link } from 'react-router-dom';
import { Card, Pill, ProgressBar } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function CompaniesPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getCompanies(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Companies" subtitle="Carregando lista do banco">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Companies" subtitle="Falha ao carregar lista">{error}</Card></div>;

  return (
    <div className="page">
      <Card title="Leads / Companies list" subtitle="Tabela conectada ao backend real" actions={<Pill tone="success">ranking v2</Pill>}>
        <table>
          <thead><tr><th>Empresa</th><th>Segmento</th><th>Estrutura</th><th>Qualificação</th><th>Lead</th><th>Funding need</th><th>Prioridade</th></tr></thead>
          <tbody>
            {data.map((company) => (
              <tr key={company.id}>
                <td>
                  <Link to={`/companies/${company.id}`}><strong>{company.name}</strong></Link>
                  <div className="table-helper">{company.subsegment}</div>
                </td>
                <td>{company.segment}</td>
                <td>{company.suggestedStructure}</td>
                <td>{company.qualificationScore}</td>
                <td>{company.leadScore}</td>
                <td>{company.predictedFundingNeed}</td>
                <td><Pill tone={company.leadBucket === 'immediate_priority' ? 'success' : 'warning'}>{company.leadBucket}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="grid cols-3">
        {data.map((company) => (
          <Card key={company.id} title={company.name} subtitle={`${company.segment} · ${company.suggestedStructure}`}>
            <div className="stats-stack compact">
              <div>
                <div className="row-between"><span>Qualification</span><strong>{company.qualificationScore}</strong></div>
                <ProgressBar value={company.qualificationScore} />
              </div>
              <div>
                <div className="row-between"><span>Lead</span><strong>{company.leadScore}</strong></div>
                <ProgressBar value={company.leadScore} tone="success" />
              </div>
            </div>
            <ul className="list compact-list">
              <li><strong>Patterns</strong><span>{company.topPatterns.join(' · ') || 'Sem padrão ativo'}</span></li>
              <li><strong>Trigger strength</strong><span>{company.triggerStrength}</span></li>
              <li><strong>Source confidence</strong><span>{company.sourceConfidence.toFixed(2)}</span></li>
            </ul>
          </Card>
        ))}
      </section>
    </div>
  );
}
