import { Card, Pill } from './UI';
import type { MvpQuickAction, MvpReadinessSnapshot } from '../lib/types';

export function MvpOpsPanel({ readiness, quickActions }: { readiness: MvpReadinessSnapshot | null; quickActions: MvpQuickAction[] }) {
  return (
    <Card title="MVP Ops" subtitle="Prontidão do sistema e ações rápidas para operação diária" className="dense-card">
      <div className="mini-metric-grid">
        <div><span>Empresas</span><strong>{readiness?.companiesTracked ?? 0}</strong></div>
        <div><span>Com intelligence</span><strong>{readiness?.companiesWithIntelligence ?? 0}</strong></div>
        <div><span>Fit estruturado</span><strong>{readiness?.companiesFitForStructuredCredit ?? 0}</strong></div>
        <div><span>Confidence média</span><strong>{readiness?.avgIntelligenceConfidence ?? 0}</strong></div>
      </div>
      <p className="table-helper top-gap">{readiness?.summary ?? 'Prontidão em consolidação.'}</p>
      <ul className="list compact-list top-gap">
        {quickActions.map((action) => (
          <li key={action.id}>
            <div>
              <strong>{action.title}</strong>
              <div className="table-helper">owner {action.owner}</div>
            </div>
            <Pill tone={action.priority === 'high' ? 'warning' : 'info'}>{action.priority}</Pill>
          </li>
        ))}
      </ul>
    </Card>
  );
}
