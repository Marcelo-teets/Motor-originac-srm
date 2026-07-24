import { useState } from 'react';
import { KnowledgeOutcomeIntelligencePanel } from '../components/KnowledgeOutcomeIntelligencePanel';
import { KnowledgeOutcomeOperationsPanel } from '../components/KnowledgeOutcomeOperationsPanel';
import { KnowledgeOutcomeSlaPanel } from '../components/KnowledgeOutcomeSlaPanel';
import { PageIntro, Pill } from '../components/UI';

export function OutcomeOperationsPage() {
  const [refreshToken, setRefreshToken] = useState(0);
  const refreshAll = () => setRefreshToken((current) => current + 1);

  return (
    <div className="page outcome-operations-page">
      <PageIntro
        eyebrow="Knowledge Vault / Outcomes"
        title="Outcome Workbench"
        description="Fila diária priorizada com ownership e SLA para confirmar resultados reais, instrumentar histórico relevante e atualizar tarefas e pipeline com lineage — sem alterar scores ou inferir decisões."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Supabase real</Pill>
            <Pill tone="info">ownership + SLA</Pill>
            <Pill tone="warning">sem outcome sintético</Pill>
          </div>
        )}
      />

      <KnowledgeOutcomeSlaPanel
        refreshToken={refreshToken}
        onChanged={refreshAll}
      />

      <KnowledgeOutcomeOperationsPanel
        refreshToken={refreshToken}
        onChanged={refreshAll}
      />

      <KnowledgeOutcomeIntelligencePanel refreshToken={refreshToken} />
    </div>
  );
}
