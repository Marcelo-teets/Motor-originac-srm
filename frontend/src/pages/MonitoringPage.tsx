import { Card } from '../components/UI';

export function MonitoringPage() {
  return (
    <div className="page">
      <Card title="Monitoring Center" subtitle="Orquestração por fonte e companhia">
        <ul className="list">
          <li><strong>Cadência</strong><span>Daily + disparos manuais por empresa/fonte.</span></li>
          <li><strong>Estados</strong><span>running, degraded, queued, completed.</span></li>
          <li><strong>Fallback</strong><span>Quando integração externa falha, seeds e mocks mantêm UX preenchida.</span></li>
        </ul>
      </Card>
    </div>
  );
}
