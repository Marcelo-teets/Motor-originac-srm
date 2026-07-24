import { useState } from 'react';
import { KnowledgeOutcomeIntelligencePanel } from '../components/KnowledgeOutcomeIntelligencePanel';
import { KnowledgeOutcomeOperationsPanel } from '../components/KnowledgeOutcomeOperationsPanel';
import { PageIntro, Pill } from '../components/UI';

export function OutcomeOperationsPage() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="page outcome-operations-page">
      <PageIntro
        eyebrow="Knowledge Vault / Outcomes"
        title="Outcome Workbench"
        description="Fila diária priorizada para confirmar resultados reais, instrumentar histórico relevante e atualizar tarefas e pipeline com lineage — sem alterar scores ou inferir decisões."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Supabase real</Pill>
            <Pill tone="info">prioridade explicável</Pill>
            <Pill tone="warning">sem outcome sintético</Pill>
          </div>
        )}
      />

      <KnowledgeOutcomeOperationsPanel
        refreshToken={refreshToken}
        onChanged={() => setRefreshToken((current) => current + 1)}
      />

      <KnowledgeOutcomeIntelligencePanel refreshToken={refreshToken} />
    </div>
  );
}
