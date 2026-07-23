import { useParams } from 'react-router-dom';
import { CompanyKnowledgePanel } from '../components/CompanyKnowledgePanel';
import { CompanyDetailPage } from './CompanyDetailPage';

export function CompanyDetailKnowledgePage() {
  const { id = '' } = useParams();

  return (
    <>
      <CompanyDetailPage />
      <div className="page company-knowledge-route-page">
        <section id="bloco-knowledge" style={{ scrollMarginTop: 64 }}>
          <CompanyKnowledgePanel companyId={id} />
        </section>
      </div>
    </>
  );
}
