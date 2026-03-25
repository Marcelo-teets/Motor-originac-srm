import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, PageIntro, Pill, ScoreBadge } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

function priorityTone(bucket: string) {
  if (bucket.includes('immediate')) return 'success';
  if (bucket.includes('high')) return 'warning';
  return 'info';
}

export function CompaniesPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [structure, setStructure] = useState('all');
  const { data, loading, error } = useAsyncData(
    async () => {
      const [companiesState, weekly] = await Promise.all([api.getCompanies(session), api.getAbmWeekly(session)]);
      const warMap = new Map(weekly.data.top_accounts.map((item) => [item.company_id, item]));
      const details = await Promise.all(companiesState.data.map(async (company) => {
        const detailState = await api.getCompany(session, company.id);
        const war = warMap.get(company.id);
        return {
          ...company,
          lastSignal: detailState.data.signals[0]?.note ?? detailState.data.monitoring.feedHighlights[0] ?? company.topPatterns[0] ?? 'Sem sinal recente consolidado',
          commercialPriority: war?.priority_band ?? 'monitor',
          momentum: war?.momentum_status ?? 'stable',
          nextStep: detailState.data.company.nextAction ?? 'Definir próximo passo',
          lastTouchpoint: detailState.data.activities[0]?.dueDate ?? '-',
          championStatus: (detailState.data.activities.length > 0 ? 'mapped' : 'unmapped'),
        };
      }));
      return { companiesState, companies: details };
    },
    [session?.access_token],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.companies.filter((company) => {
      const matchesQuery = [company.name, company.segment, company.subsegment, company.topPatterns.join(' ')].join(' ').toLowerCase().includes(query.toLowerCase());
      const matchesPriority = priority === 'all' || company.leadBucket === priority;
      const matchesStructure = structure === 'all' || company.suggestedStructure === structure;
      return matchesQuery && matchesPriority && matchesStructure;
    }).sort((a, b) => b.leadScore - a.leadScore);
  }, [data, priority, query, structure]);

  if (loading) return <div className="page"><Card title="Leads" subtitle="Carregando companies do backend oficial">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Leads" subtitle="Falha ao carregar lista">{error}</Card></div>;

  const uniqueStructures = Array.from(new Set(data.companies.map((company) => company.suggestedStructure)));

  return (
    <div className="page">
      <PageIntro
        eyebrow="Leads / Companies"
        title="Tabela operacional de originação"
        description="A lista foi convertida em uma tabela mais clara, filtrável e orientada a decisão, com destaque para score, prioridade, estrutura sugerida e último sinal relevante."
        actions={<Pill tone="success">clique direto para detalhe</Pill>}
      />

      <DataStatusBanner source={data.companiesState.source} note={data.companiesState.note} />

      <Card title="Filters" subtitle="Busca rápida, filtros de prioridade e estrutura" className="dense-card">
        <div className="toolbar-grid">
          <label>
            <span>Busca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa, segmento ou pattern" />
          </label>
          <label>
            <span>Prioridade</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="all">Todas</option>
              <option value="immediate_priority">Immediate</option>
              <option value="high_priority">High</option>
              <option value="monitor_closely">Monitor</option>
            </select>
          </label>
          <label>
            <span>Estrutura sugerida</span>
            <select value={structure} onChange={(event) => setStructure(event.target.value)}>
              <option value="all">Todas</option>
              {uniqueStructures.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </Card>

      <Card title="Leads Table" subtitle={`${filtered.length} companhias na visão atual`} actions={<Pill tone="info">desktop-first</Pill>} className="dense-card">
        <table className="dense-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Qualification Score</th>
              <th>Lead Score</th>
              <th>Pattern</th>
              <th>Suggested Structure</th>
              <th>Priority</th>
              <th>Commercial Priority</th><th>Momentum</th><th>Next Step</th><th>Last Touchpoint</th><th>Champion</th><th>Last Signal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((company) => (
              <tr key={company.id}>
                <td>
                  <Link to={`/companies/${company.id}`}><strong>{company.name}</strong></Link>
                  <div className="table-helper">{company.segment} · {company.subsegment}</div>
                </td>
                <td><ScoreBadge value={company.qualificationScore} kind="qualification" /></td>
                <td><ScoreBadge value={company.leadScore} kind="lead" /></td>
                <td>
                  <strong>{company.topPatterns[0] ?? 'Sem pattern dominante'}</strong>
                  <div className="table-helper">trigger {company.triggerStrength}</div>
                </td>
                <td>{company.suggestedStructure}</td>
                <td><Pill tone={priorityTone(company.leadBucket)}>{company.leadBucket.replace(/_/g, ' ')}</Pill></td>
                <td><Pill tone={priorityTone(company.commercialPriority)}>{company.commercialPriority}</Pill></td>
                <td><Pill tone={company.momentum === 'cooling' ? 'warning' : company.momentum === 'accelerating' ? 'success' : 'info'}>{company.momentum}</Pill></td>
                <td>{company.nextStep}</td>
                <td>{company.lastTouchpoint}</td>
                <td><Pill tone={company.championStatus === 'mapped' ? 'success' : 'warning'}>{company.championStatus}</Pill></td>
                <td>{company.lastSignal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
