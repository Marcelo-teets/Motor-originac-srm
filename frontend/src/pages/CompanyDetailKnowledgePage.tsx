import { useParams } from 'react-router-dom';
import { CompanyDecisionBriefPanel } from '../components/CompanyDecisionBriefPanel';
import { CompanyKnowledgePanel } from '../components/CompanyKnowledgePanel';
import { CompanySemanticEvidencePanel } from '../components/CompanySemanticEvidencePanel';
import { CompanyDetailPage } from './CompanyDetailPage';
import '../styles/company-semantic-evidence.css';

export function CompanyDetailKnowledgePage() {
  const { id = '' } = useParams();

  return (
    <>
      <CompanyDetailPage />
      <div className="page company-knowledge-route-page">
        <section id="bloco-knowledge" style={{ scrollMarginTop: 64 }}>
          <CompanyKnowledgePanel companyId={id} />
        </section>
        <section id="bloco-briefing-decisorio" style={{ scrollMarginTop: 64 }}>
          <CompanyDecisionBriefPanel companyId={id} />
        </section>
        <section id="bloco-evidencias-semanticas" style={{ scrollMarginTop: 64 }}>
          <CompanySemanticEvidencePanel companyId={id} />
        </section>
      </div>
    </>
  );
}
