import { useParams } from 'react-router-dom';
import { Card, Pill, ProgressBar, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const { data, loading, error, setData } = useAsyncData(() => api.getCompany(session, id), [session?.access_token, id]);

  if (loading) return <div className="page"><Card title="Company Detail" subtitle="Carregando detalhes reais">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Company Detail" subtitle="Falha ao carregar company detail">{error}</Card></div>;

  const handleRecalculate = async () => {
    await api.recalculateCompany(session, id);
    const refreshed = await api.getCompany(session, id);
    setData(refreshed);
  };

  return (
    <div className="page">
      <section className="hero card hero-grid">
        <div>
          <p className="eyebrow">Company Detail</p>
          <h2>{data.company.name}</h2>
          <p className="hero-copy">{data.company.description}</p>
          <div className="pill-row">
            <Pill tone="success">{data.qualification.suggested_structure_type}</Pill>
            <Pill tone="warning">ranking {data.scores.rankingScore}</Pill>
            <Pill tone="info">urgency {data.qualification.urgency_score}</Pill>
          </div>
        </div>
        <div className="stats-row">
          <Stat label="Qualification score" value={String(data.scores.qualification)} helper="qualification_snapshots" />
          <Stat label="Lead score" value={String(data.scores.lead)} helper="lead_score_snapshots" />
          <Stat label="Funding need" value={String(data.qualification.predicted_funding_need_score)} helper="predicted_funding_need_score" />
          <Stat label="Estrutura atual" value={data.company.currentFundingStructure} helper="capital structure today" />
        </div>
      </section>

      <section className="grid cols-4">
        <Card title={data.company.segment} subtitle="Segmento"><Pill>segmento</Pill></Card>
        <Card title={data.company.website} subtitle="Website"><Pill>website</Pill></Card>
        <Card title={data.company.stage} subtitle="Stage"><Pill>stage</Pill></Card>
        <Card title={data.company.cnpj} subtitle="CNPJ"><Pill>cnpj</Pill></Card>
      </section>

      <section className="grid cols-2">
        <Card title="Thesis" subtitle="Tese comercial e de estruturação" actions={<button type="button" onClick={() => void handleRecalculate()}>Recalcular</button>}>
          <p>{data.thesis.summary}</p>
          <div className="table-helper">{data.thesis.marketMapSummary}</div>
        </Card>

        <Card title="Qualification" subtitle="Snapshot calculado com dados reais">
          <ul className="list">
            <li><strong>Rationale</strong><span>{data.qualification.capital_structure_rationale}</span></li>
            <li><strong>Funding need</strong><span>{data.qualification.predicted_funding_need_score}</span></li>
            <li><strong>Urgency</strong><span>{data.qualification.urgency_score}</span></li>
            <li><strong>Source confidence</strong><span>{data.qualification.source_confidence_score}</span></li>
          </ul>
        </Card>

        <Card title="Patterns" subtitle="Cinco padrões práticos persistidos em company_patterns">
          <ul className="list">
            {data.patterns.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.patternName}</strong>
                  <div className="table-helper">{item.rationale}</div>
                </div>
                <span>confidence {item.confidenceScore} · impacto {item.leadScoreImpact + item.rankingImpact}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Prediction" subtitle="Funding need, urgency e confidence">
          <div className="stats-stack">
            <Stat label="Predicted funding need" value={String(data.qualification.predicted_funding_need_score)} helper="qualification_agent" />
            <Stat label="Urgency score" value={String(data.qualification.urgency_score)} helper="timing + pressure" />
            <Stat label="Source confidence" value={String(data.qualification.source_confidence_score)} helper="connector confidence" />
          </div>
        </Card>

        <Card title="Signals" subtitle="Signals reais para a empresa">
          <ul className="list">{data.signals.map((item, index) => <li key={`${item.type}-${index}`}><strong>{item.type}</strong><span>{item.note} · {item.strength}</span></li>)}</ul>
        </Card>

        <Card title="Monitoring" subtitle="Outputs persistidos por fonte">
          <ul className="list">
            <li><strong>Status</strong><span>{data.monitoring.status} · last run {data.monitoring.lastRunAt}</span></li>
            <li><strong>Outputs</strong><span>{data.monitoring.outputs24h}</span></li>
            <li><strong>Triggers</strong><span>{data.monitoring.triggers24h}</span></li>
          </ul>
          <div className="market-map-grid">
            {data.monitoringOutputs.map((item) => (
              <div key={item.id} className="mini-panel">
                <strong>{item.title}</strong>
                <span>{item.connectorStatus}</span>
                <small>{item.summary}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline" subtitle="Atividades e próximos passos">
          <ul className="list">
            {data.activities.map((item) => (
              <li key={`${item.title}-${item.dueDate}`}><strong>{item.title}</strong><span>{item.owner} · {item.status}</span></li>
            ))}
          </ul>
        </Card>

        <Card title="Market map" subtitle="Comparáveis e peers">
          <div className="market-map-grid">
            {data.marketMap.map((item) => (
              <div key={item.peerName} className="mini-panel">
                <strong>{item.peerName}</strong>
                <span>{item.peerType}</span>
                <small>{item.rationale}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Score history" subtitle="Snapshots persistidos">
          <div className="bars">
            {data.scoreHistory.map((item) => (
              <div key={item.at}>
                <div className="row-between"><span>{new Date(item.at).toLocaleString()}</span><strong>{item.qualification}/{item.lead}</strong></div>
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
