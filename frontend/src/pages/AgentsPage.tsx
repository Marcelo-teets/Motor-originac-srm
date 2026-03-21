import { Card } from '../components/UI';

const agents = [
  'data_scraper_agent',
  'data_mining_agent',
  'data_enrichment_agent',
  'data_processing_agent',
  'audit_and_data_check_agent',
  'orchestration_agent',
  'monitoring_agent',
  'learning_agent',
  'continuous_improvement_agent',
  'pattern_identification_agent',
  'lead_score_agent',
  'qualification_agent',
];

export function AgentsPage() {
  return (
    <div className="page">
      <Card title="Agents Control" subtitle="Módulos claros e persistência padronizada">
        <ul className="list">{agents.map((agent) => <li key={agent}><strong>{agent}</strong><span>execution_id, status, confidence, validation_result, output_summary.</span></li>)}</ul>
      </Card>
    </div>
  );
}
