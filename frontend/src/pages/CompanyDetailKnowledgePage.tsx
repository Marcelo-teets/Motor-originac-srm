import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CompanyDecisionActivationPanel } from '../components/CompanyDecisionActivationPanel';
import { CompanyDecisionBriefPanel } from '../components/CompanyDecisionBriefPanel';
import { CompanyKnowledgePanel } from '../components/CompanyKnowledgePanel';
import { CompanySemanticEvidencePanel } from '../components/CompanySemanticEvidencePanel';
import { CompanyDetailPage } from './CompanyDetailPage';
import '../styles/company-semantic-evidence.css';

type CompanyWorkspaceTab = 'decision' | 'briefing' | 'knowledge' | 'evidence';

const tabs: Array<{ id: CompanyWorkspaceTab; label: string; helper: string }> = [
  { id: 'decision', label: 'Decisão', helper: 'Tese, score, sinais e riscos' },
  { id: 'briefing', label: 'Briefing & ação', helper: 'Preparar conversa e executar' },
  { id: 'knowledge', label: 'Memória da conta', helper: 'Notas, histórico e aprendizado' },
  { id: 'evidence', label: 'Evidências', helper: 'Lineage e comprovação semântica' },
];

export function CompanyDetailKnowledgePage() {
  const { id = '' } = useParams();
  const [activeTab, setActiveTab] = useState<CompanyWorkspaceTab>('decision');

  return (
    <div className="company-workspace-shell">
      <header className="company-workspace-header">
        <nav className="company-workspace-tabs" aria-label="Workspace da empresa">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              <strong>{tab.label}</strong>
              <small>{tab.helper}</small>
            </button>
          ))}
        </nav>
        <div className="company-workspace-shortcuts">
          <Link to="/companies" className="button secondary compact-button">Voltar aos leads</Link>
          <Link to="/pipeline" className="button secondary compact-button">Abrir pipeline</Link>
        </div>
      </header>

      {activeTab === 'decision' ? <CompanyDetailPage /> : null}

      {activeTab === 'briefing' ? (
        <div className="page company-workspace-view">
          <section className="company-workspace-intro">
            <p className="eyebrow">Da tese para a conversa</p>
            <h2>Briefing e execução comercial</h2>
            <p>Prepare a abordagem, revise os argumentos, registre a decisão e transforme o próximo passo em atividade rastreável.</p>
          </section>
          <CompanyDecisionBriefPanel companyId={id} />
          <CompanyDecisionActivationPanel companyId={id} />
        </div>
      ) : null}

      {activeTab === 'knowledge' ? (
        <div className="page company-workspace-view">
          <section className="company-workspace-intro">
            <p className="eyebrow">Memória institucional</p>
            <h2>Conhecimento conectado da empresa</h2>
            <p>Consolide notas, monitoramento, sinais, teses e resultados em uma visão que sobreviva às mudanças do time.</p>
          </section>
          <CompanyKnowledgePanel companyId={id} />
        </div>
      ) : null}

      {activeTab === 'evidence' ? (
        <div className="page company-workspace-view">
          <section className="company-workspace-intro">
            <p className="eyebrow">Fato, inferência e ausência de dado</p>
            <h2>Evidências que sustentam a decisão</h2>
            <p>Revise a origem, a confiança e o contexto das informações antes de promover uma tese ou iniciar uma abordagem.</p>
          </section>
          <CompanySemanticEvidencePanel companyId={id} />
        </div>
      ) : null}
    </div>
  );
}
