import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CompanyDecisionBriefPanel } from '../components/CompanyDecisionBriefPanel';
import { CompanyKnowledgePanel } from '../components/CompanyKnowledgePanel';
import { CompanySemanticEvidencePanel } from '../components/CompanySemanticEvidencePanel';
import { CompanyDetailPage } from './CompanyDetailPage';
import '../styles/company-semantic-evidence.css';

export function CompanyDetailKnowledgePage() {
  const { id = '' } = useParams();
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);

  const refreshKnowledgeExecution = () => {
    setKnowledgeRevision((current) => current + 1);
  };

  return (
    <>
      <CompanyDetailPage />
      <div className="page company-knowledge-route-page">
        <section id="bloco-knowledge" style={{ scrollMarginTop: 64 }}>
          <CompanyKnowledgePanel key={`${id}:${knowledgeRevision}`} companyId={id} />
        </section>
        <section id="bloco-briefing-decisorio" style={{ scrollMarginTop: 64 }}>
          <CompanyDecisionBriefPanel companyId={id} onKnowledgeChanged={refreshKnowledgeExecution} />
        </section>
        <section id="bloco-evidencias-semanticas" style={{ scrollMarginTop: 64 }}>
          <CompanySemanticEvidencePanel companyId={id} />
        </section>
      </div>
    </>
  );
}
