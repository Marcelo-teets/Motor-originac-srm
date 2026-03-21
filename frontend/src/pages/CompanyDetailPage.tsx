import { Card, Pill, ProgressBar, Stat } from '../components/UI';
import { companyDetail } from '../mocks/data';

export function CompanyDetailPage() {
  return (
    <div className="page">
      <section className="hero card hero-grid">
        <div>
          <p className="eyebrow">Company Detail</p>
          <h2>{companyDetail.name}</h2>
          <p className="hero-copy">Header executivo com qualification, ranking, prediction, thesis, market map, monitoring e next actions portados conceitualmente para a arquitetura oficial atual.</p>
          <div className="pill-row">
            <Pill tone="success">{companyDetail.suggestedStructure}</Pill>
            <Pill tone="warning">ranking {companyDetail.rankingScore}</Pill>
            <Pill tone="info">urgency {companyDetail.urgency}</Pill>
          </div>
        </div>
        <div className="stats-row">
          <Stat label="Qualification score" value={String(companyDetail.qualification)} helper="qualification_agent v1" />
          <Stat label="Lead score" value={String(companyDetail.lead)} helper="Ranking V2 / lead score" />
          <Stat label="Funding need" value={String(companyDetail.predictedFundingNeed)} helper="predicted_funding_need_score" />
          <Stat label="Estrutura atual" value={companyDetail.currentFundingStructure} helper="capital structure today" />
        </div>
      </section>

      <section className="grid cols-4">
        {companyDetail.headerMeta.map((item) => (
          <Card key={item.label} title={item.value} subtitle={item.label}>
            <Pill>{item.label.toLowerCase()}</Pill>
          </Card>
        ))}
      </section>

      <section className="grid cols-2">
        <Card title="Qualification block" subtitle="Estrutura rica da página portando score estrutural">
          <ul className="list">{companyDetail.qualificationBlocks.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}</ul>
        </Card>

        <Card title="Patterns block" subtitle="pattern_identification_agent v1" actions={<Pill tone="warning">persistível</Pill>}>
          <ul className="list">
            {companyDetail.patterns.map((item) => (
              <li key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <div className="table-helper">{item.rationale}</div>
                </div>
                <span>confidence {item.confidence} · impacto {item.impact}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Score history" subtitle="Blocos de evolução temporal portados do Company Detail legado">
          <div className="bars">
            {companyDetail.scoreHistory.map((item) => (
              <div key={item.at}>
                <div className="row-between"><span>{item.at}</span><strong>{item.qualification}/{item.lead}</strong></div>
                <ProgressBar value={item.qualification} tone="default" />
                <ProgressBar value={item.lead} tone="success" />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Prediction block" subtitle="Funding need, urgency e confidence">
          <div className="stats-stack">
            {companyDetail.prediction.map((item) => <Stat key={item.label} label={item.label} value={item.value} helper={item.detail} />)}
          </div>
        </Card>

        <Card title="Signals block" subtitle="Signals + monitoring inputs do qualification agent">
          <ul className="list">{companyDetail.signals.map((item) => <li key={item}><strong>Signal</strong><span>{item}</span></li>)}</ul>
        </Card>

        <Card title="Thesis / market map" subtitle="Tese e comparáveis">
          <p>{companyDetail.thesis}</p>
          <div className="market-map-grid">
            {companyDetail.marketMap.map((item) => (
              <div key={item.name} className="mini-panel">
                <strong>{item.name}</strong>
                <span>{item.type}</span>
                <small>{item.rationale}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Monitoring / sources" subtitle="Rastreabilidade e source governance">
          <ul className="list">
            {companyDetail.monitoring.summary.map((item) => <li key={item}><strong>Monitoring</strong><span>{item}</span></li>)}
            {companyDetail.sources.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.status} · {item.note}</span></li>)}
          </ul>
          <div className="market-map-grid">
            {companyDetail.monitoring.outputs.map((item) => (
              <div key={item.title} className="mini-panel">
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline / next action" subtitle="Actions e próximos passos comerciais" actions={<Pill tone="success">playbook</Pill>}>
          <ul className="list">
            {companyDetail.activities.map((item) => (
              <li key={item.title}><strong>{item.title}</strong><span>{item.owner} · {item.status}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
