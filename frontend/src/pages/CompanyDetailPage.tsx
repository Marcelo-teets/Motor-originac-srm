import { Card, Pill } from '../components/UI';
import { companyDetail } from '../mocks/data';

export function CompanyDetailPage() {
  return (
    <div className="page">
      <section className="hero card">
        <p className="eyebrow">Company Detail</p>
        <h2>{companyDetail.name}</h2>
        <div className="stats-row">
          <div><span>Qualification score</span><strong>{companyDetail.qualification}</strong></div>
          <div><span>Lead score</span><strong>{companyDetail.lead}</strong></div>
          <div><span>Funding need</span><strong>{companyDetail.predictedFundingNeed}</strong></div>
          <div><span>Estrutura sugerida</span><strong>{companyDetail.suggestedStructure}</strong></div>
        </div>
      </section>
      <section className="grid cols-2">
        <Card title="Qualificação estrutural" subtitle="qualification_agent v1">
          <ul className="list">{companyDetail.qualificationBlocks.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}</ul>
        </Card>
        <Card title="Padrões detectados" subtitle="pattern_identification_agent v1">
          <ul className="list">{companyDetail.patterns.map((item) => <li key={item.title}><strong>{item.title}</strong><span>confidence {item.confidence} · impacto {item.impact}</span></li>)}</ul>
        </Card>
        <Card title="Prediction & thesis" subtitle="Estrutura recomendada e racional">
          <p>{companyDetail.thesis}</p>
          <Pill>{companyDetail.suggestedStructure}</Pill>
        </Card>
        <Card title="Sinais e monitoramento" subtitle="Triggers e rastreabilidade">
          <ul className="list">{[...companyDetail.signals, ...companyDetail.monitoring].map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
        <Card title="Market map" subtitle="Comparáveis iniciais">
          <ul className="list">{companyDetail.marketMap.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
        <Card title="Pipeline / activities" subtitle="Próximos passos comerciais">
          <ul className="list">{companyDetail.activities.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
      </section>
    </div>
  );
}
